import { randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { createInvitationSecret, hashInvitationToken, sendPasswordResetEmail } from './invitations.js';
import {
  hashPassword,
  hashSessionToken,
  isStrongSessionSecret,
  signSessionClaims,
  verifyPassword,
  verifySessionClaims,
} from './authCrypto.js';

const COOKIE_NAME = 'redeemer_session';
const MAX_FAILED_LOGINS = 5;
const ACCOUNT_LOCK_MS = 15 * 60 * 1000;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_ATTEMPTS = 10;
const dummyPasswordHashPromise = hashPassword(randomBytes(32).toString('hex'));

async function rollbackAndRelease(client) {
  if (!client) return;
  try { await client.query('ROLLBACK'); } catch {}
  client.release();
}

async function commitAndRelease(client) {
  await client.query('COMMIT');
  client.release();
}

function parseCookies(header = '') {
  const cookies = new Map();
  for (const segment of header.split(';')) {
    const separator = segment.indexOf('=');
    if (separator < 0) continue;
    const name = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      cookies.set(name, '');
    }
  }
  return cookies;
}

function cookieOptions(secure) {
  return `Path=/api; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function setSessionCookie(res, token, expiresAt, secure) {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieOptions(secure)}; Max-Age=${maxAge}`);
}

function clearSessionCookie(res, secure) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${cookieOptions(secure)}; Max-Age=0`);
}

function requestToken(req) {
  return parseCookies(req.headers.cookie).get(COOKIE_NAME) || '';
}

function sameSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function logAuthEvent(client, req, { schoolId, actorUserId = null, action, details = {} }) {
  return client.query(
    `INSERT INTO audit_events
      (school_id, actor_user_id, action, entity_type, details, request_id, ip_address, user_agent)
     VALUES ($1, $2, $3, 'AUTH_SESSION', $4::jsonb, $5, $6, $7)`,
    [
      schoolId,
      actorUserId,
      action,
      JSON.stringify(details),
      typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'].slice(0, 128) : null,
      req.ip || null,
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 512) : null,
    ]
  );
}

async function setTenantContext(client, schoolId) {
  await client.query('SELECT set_config(\'app.current_school_id\', $1, true)', [schoolId]);
}

async function loadAccountView(client, schoolId, userId) {
  const result = await client.query(
    `SELECT u.id, u.school_id, u.campus_id, u.email, u.full_name, u.status,
            u.must_reset_password, s.name AS school_name,
            COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), ARRAY[]::text[]) AS roles,
            COALESCE(array_agg(DISTINCT rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL), ARRAY[]::text[]) AS permissions
     FROM user_accounts u
     JOIN schools s ON s.id = u.school_id
     LEFT JOIN user_role_assignments ura
       ON ura.school_id = u.school_id AND ura.user_id = u.id
      AND ura.starts_at <= now() AND (ura.ends_at IS NULL OR ura.ends_at > now())
      AND (ura.campus_id IS NULL OR ura.campus_id = u.campus_id)
     LEFT JOIN school_roles r
       ON r.school_id = ura.school_id AND r.id = ura.role_id AND r.active = true
     LEFT JOIN role_permissions rp
       ON rp.school_id = r.school_id AND rp.role_id = r.id
     WHERE u.school_id = $1 AND u.id = $2
       AND u.status = 'ACTIVE' AND u.deactivated_at IS NULL
       AND (u.locked_until IS NULL OR u.locked_until <= now())
     GROUP BY u.id, s.name`,
    [schoolId, userId]
  );
  const row = result.rows[0];
  if (!row || row.roles.length === 0) return null;
  return {
    id: row.id,
    schoolId: row.school_id,
    schoolName: row.school_name,
    campusId: row.campus_id,
    email: row.email,
    fullName: row.full_name,
    roles: row.roles,
    permissions: row.permissions,
    mustResetPassword: row.must_reset_password,
  };
}

function createRateLimiter() {
  const attempts = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    const existing = attempts.get(key);
    const current = !existing || existing.expiresAt <= now
      ? { count: 0, expiresAt: now + IP_WINDOW_MS }
      : existing;
    current.count += 1;
    attempts.set(key, current);

    if (attempts.size > 10_000) {
      for (const [ip, item] of attempts) if (item.expiresAt <= now) attempts.delete(ip);
    }
    res.setHeader('Cache-Control', 'no-store');
    if (current.count > IP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many sign-in attempts. Please try again later.' });
    }
    next();
  };
}

function authDisabled(res) {
  return res.status(503).json({ error: 'Sign-in is not configured for this environment.' });
}

export function createAuthRouter({ pool, secret, sessionTtlMs = 8 * 60 * 60 * 1000, secureCookie = process.env.NODE_ENV === 'production', sendPasswordReset = sendPasswordResetEmail }) {
  const router = express.Router();
  const limitLogin = createRateLimiter();
  const limitInvitationAccept = createRateLimiter();
  const limitPasswordReset = createRateLimiter();
  let runtimeRoleSafe;

  async function isRuntimeRoleSafe() {
    if (!pool || !isStrongSessionSecret(secret)) return false;
    if (!runtimeRoleSafe) {
      runtimeRoleSafe = pool.query(
        `SELECT NOT r.rolsuper AND NOT r.rolbypassrls AS safe
         FROM pg_roles r WHERE r.rolname = current_user`
      ).then(({ rows }) => rows[0]?.safe === true).catch(() => false);
    }
    return runtimeRoleSafe;
  }

  async function requireAuth(req, res, next) {
    if (!await isRuntimeRoleSafe()) return authDisabled(res);
    const token = requestToken(req);
    const claims = verifySessionClaims(token, secret);
    if (!claims) return res.status(401).json({ error: 'Authentication required.' });

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await setTenantContext(client, claims.schoolId);
      const session = await client.query(
        `SELECT 1
         FROM auth_sessions s
         JOIN user_accounts u ON u.school_id = s.school_id AND u.id = s.user_id
         WHERE s.id = $1 AND s.school_id = $2 AND s.user_id = $3
           AND s.token_hash = $4 AND s.expires_at > now()
           AND u.status = 'ACTIVE' AND u.deactivated_at IS NULL
           AND (u.locked_until IS NULL OR u.locked_until <= now())`,
        [claims.sessionId, claims.schoolId, claims.userId, hashSessionToken(token)]
      );
      if (!session.rowCount) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(401).json({ error: 'Authentication required.' });
      }
      const account = await loadAccountView(client, claims.schoolId, claims.userId);
      if (!account) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(403).json({ error: 'This account has no active school role.' });
      }
      req.auth = { claims, token, account, client };
      return next();
    } catch {
      if (client) {
        try { await client.query('ROLLBACK'); } catch {}
        client.release();
      }
      return res.status(503).json({ error: 'Authentication service is temporarily unavailable.' });
    }
  }

  function requireCsrf(req, res, next) {
    if (!sameSecret(req.get('x-csrf-token'), req.auth.claims.csrfToken)) {
      void rollbackAndRelease(req.auth.client);
      req.auth.client = null;
      return res.status(403).json({ error: 'Request verification failed. Refresh your session and try again.' });
    }
    next();
  }

  // Reuse the exact session and tenant-scoping guard for protected operational APIs.
  // The middleware owns an open transaction; each route must commit or roll it back.
  router.requireAuth = requireAuth;

  router.post('/login', limitLogin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!await isRuntimeRoleSafe()) return authDisabled(res);

    const schoolCode = typeof req.body?.schoolCode === 'string' ? req.body.schoolCode.trim().toUpperCase() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(schoolCode) || email.length > 254 || !email.includes('@') || !password || Buffer.byteLength(password, 'utf8') > 1024) {
      return res.status(400).json({ error: 'Enter a valid school code, email, and password.' });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const schoolResult = await client.query('SELECT app.resolve_school_id_by_code($1) AS id', [schoolCode]);
      const schoolId = schoolResult.rows[0]?.id;
      if (!schoolId) {
        await rollbackAndRelease(client);
        client = null;
        return res.status(401).json({ error: 'School code, email, or password is incorrect.' });
      }
      await setTenantContext(client, schoolId);

      const accountResult = await client.query(
        `SELECT id, school_id, email, full_name, password_hash, status,
                failed_login_count, locked_until, must_reset_password
         FROM user_accounts WHERE school_id = $1 AND lower(email) = $2 FOR UPDATE`,
        [schoolId, email]
      );
      const user = accountResult.rows[0];
      const now = Date.now();
      if (!user) {
        await verifyPassword(password, await dummyPasswordHashPromise);
        await rollbackAndRelease(client);
        client = null;
        return res.status(401).json({ error: 'School code, email, or password is incorrect.' });
      }
      if (user.status !== 'ACTIVE' || (user.locked_until && new Date(user.locked_until).getTime() > now)) {
        await verifyPassword(password, user.password_hash);
        await rollbackAndRelease(client);
        client = null;
        return res.status(401).json({ error: 'School code, email, or password is incorrect.' });
      }

      const passwordMatches = await verifyPassword(password, user.password_hash);
      if (!passwordMatches) {
        const nextCount = Number(user.failed_login_count) + 1;
        const lockedUntil = nextCount >= MAX_FAILED_LOGINS ? new Date(now + ACCOUNT_LOCK_MS) : null;
        await client.query(
          `UPDATE user_accounts
           SET failed_login_count = $3, locked_until = $4, updated_at = now()
           WHERE school_id = $1 AND id = $2`,
          [schoolId, user.id, nextCount, lockedUntil]
        );
        await logAuthEvent(client, req, {
          schoolId,
          actorUserId: user.id,
          action: 'LOGIN_FAILED',
          details: { reason: lockedUntil ? 'account_locked' : 'invalid_credentials' },
        });
        await client.query('COMMIT');
        client.release();
        client = null;
        return res.status(401).json({ error: 'School code, email, or password is incorrect.' });
      }

      if (user.locked_until && new Date(user.locked_until).getTime() > now) {
        await rollbackAndRelease(client);
        client = null;
        return res.status(401).json({ error: 'School code, email, or password is incorrect.' });
      }

      const sessionId = randomBytes(16).toString('hex');
      const expiresAt = now + sessionTtlMs;
      const csrfToken = randomBytes(32).toString('base64url');
      const token = signSessionClaims({
        schoolId,
        userId: user.id,
        sessionId,
        csrfToken,
        expiresAt,
      }, secret);
      await client.query(
        `INSERT INTO auth_sessions (id, school_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))`,
        [sessionId, schoolId, user.id, hashSessionToken(token), expiresAt]
      );
      await client.query(
        `UPDATE user_accounts
         SET failed_login_count = 0, locked_until = NULL, last_login_at = now(), updated_at = now()
         WHERE school_id = $1 AND id = $2`,
        [schoolId, user.id]
      );
      const account = await loadAccountView(client, schoolId, user.id);
      if (!account) {
        await rollbackAndRelease(client);
        client = null;
        return res.status(403).json({ error: 'This account has no active school role.' });
      }
      await logAuthEvent(client, req, {
        schoolId,
        actorUserId: user.id,
        action: 'LOGIN_SUCCEEDED',
        details: { sessionId },
      });
      await commitAndRelease(client);
      client = null;
      setSessionCookie(res, token, expiresAt, secureCookie);
      return res.status(200).json({ account, csrfToken, expiresAt: new Date(expiresAt).toISOString() });
    } catch {
      if (client) {
        try { await client.query('ROLLBACK'); } catch {}
        client.release();
      }
      return res.status(503).json({ error: 'Sign-in service is temporarily unavailable.' });
    }
  });


  router.post('/request-password-reset', limitPasswordReset, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const generic = { message: 'If an active account matches those details, a password reset link will be sent to its registered email address.' };
    if (!await isRuntimeRoleSafe()) return authDisabled(res);

    const schoolCode = typeof req.body?.schoolCode === 'string' ? req.body.schoolCode.trim().toUpperCase() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(schoolCode) || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(202).json(generic);
    }

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const schoolResult = await client.query('SELECT app.resolve_school_id_by_code($1) AS id', [schoolCode]);
      const schoolId = schoolResult.rows[0]?.id;
      if (!schoolId) {
        await rollbackAndRelease(client);
        return res.status(202).json(generic);
      }
      await setTenantContext(client, schoolId);
      const accountResult = await client.query(
        `SELECT id, email, full_name FROM user_accounts
         WHERE school_id = $1 AND lower(email) = $2
           AND status = 'ACTIVE' AND deactivated_at IS NULL LIMIT 1`,
        [schoolId, email]
      );
      const account = accountResult.rows[0];
      if (!account) {
        await rollbackAndRelease(client);
        return res.status(202).json(generic);
      }

      const { token, tokenHash } = createInvitationSecret();
      await client.query(
        `UPDATE account_password_resets SET revoked_at = now()
         WHERE school_id = $1 AND user_id = $2 AND redeemed_at IS NULL AND revoked_at IS NULL`,
        [schoolId, account.id]
      );
      await client.query(
        `INSERT INTO account_password_resets (school_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, now() + interval '60 minutes')`,
        [schoolId, account.id, tokenHash]
      );
      await sendPasswordReset({ email: account.email, fullName: account.full_name, token });
      await commitAndRelease(client);
      client = null;
      return res.status(202).json(generic);
    } catch (error) {
      if (client) await rollbackAndRelease(client);
      console.error('Password reset request failed:', error instanceof Error ? error.message : 'unknown error');
      return res.status(202).json(generic);
    }
  });

  router.post('/reset-password', limitInvitationAccept, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!await isRuntimeRoleSafe()) return authDisabled(res);
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(token) || newPassword.length < 12 || Buffer.byteLength(newPassword, 'utf8') > 1024) {
      return res.status(400).json({ error: 'Use a valid password reset link and choose a password with at least 12 characters.' });
    }
    try {
      const passwordHash = await hashPassword(newPassword);
      const result = await pool.query('SELECT user_id FROM app.consume_password_reset($1, $2)', [hashInvitationToken(token), passwordHash]);
      if (!result.rowCount) return res.status(400).json({ error: 'This reset link is invalid, expired, or already used. Request a new password reset link.' });
      return res.status(204).end();
    } catch {
      return res.status(503).json({ error: 'Password reset is temporarily unavailable. Please try again.' });
    }
  });

  router.post('/accept-invitation', limitInvitationAccept, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!await isRuntimeRoleSafe()) return authDisabled(res);

    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(token) || newPassword.length < 12 || Buffer.byteLength(newPassword, 'utf8') > 1024) {
      return res.status(400).json({ error: 'Use a valid invitation link and choose a password with at least 12 characters.' });
    }

    try {
      const passwordHash = await hashPassword(newPassword);
      const result = await pool.query(
        'SELECT school_id, user_id FROM app.consume_account_invitation($1, $2)',
        [hashInvitationToken(token), passwordHash]
      );
      if (!result.rowCount) {
        return res.status(400).json({ error: 'This invitation link is invalid, expired, already used, or the account is no longer active. Ask the school administrator to send a new invitation.' });
      }
      return res.status(204).end();
    } catch {
      return res.status(503).json({ error: 'Password setup is temporarily unavailable. Please try again.' });
    }
  });

  router.get('/session', requireAuth, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await commitAndRelease(req.auth.client);
      req.auth.client = null;
      return res.json({ account: req.auth.account, csrfToken: req.auth.claims.csrfToken, expiresAt: new Date(req.auth.claims.expiresAt).toISOString() });
    } catch {
      await rollbackAndRelease(req.auth.client);
      req.auth.client = null;
      return res.status(503).json({ error: 'Authentication service is temporarily unavailable.' });
    }
  });

  router.post('/logout', requireAuth, requireCsrf, async (req, res) => {
    const { client, claims, token } = req.auth;
    try {
      await client.query(
        'DELETE FROM auth_sessions WHERE id = $1 AND school_id = $2 AND user_id = $3 AND token_hash = $4',
        [claims.sessionId, claims.schoolId, claims.userId, hashSessionToken(token)]
      );
      await logAuthEvent(client, req, {
        schoolId: claims.schoolId,
        actorUserId: claims.userId,
        action: 'LOGOUT_SUCCEEDED',
        details: { sessionId: claims.sessionId },
      });
      await commitAndRelease(client);
      req.auth.client = null;
      clearSessionCookie(res, secureCookie);
      return res.status(204).end();
    } catch {
      await rollbackAndRelease(client);
      req.auth.client = null;
      return res.status(503).json({ error: 'Sign-out service is temporarily unavailable.' });
    }
  });

  router.post('/password', requireAuth, requireCsrf, async (req, res) => {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (newPassword.length < 12 || Buffer.byteLength(newPassword, 'utf8') > 1024 || newPassword === currentPassword) {
      await rollbackAndRelease(req.auth.client);
      req.auth.client = null;
      return res.status(400).json({ error: 'Choose a new password with at least 12 characters.' });
    }

    try {
      const result = await req.auth.client.query(
        'SELECT password_hash FROM user_accounts WHERE school_id = $1 AND id = $2 FOR UPDATE',
        [req.auth.claims.schoolId, req.auth.claims.userId]
      );
      if (!result.rows[0] || !await verifyPassword(currentPassword, result.rows[0].password_hash)) {
        await rollbackAndRelease(req.auth.client);
        req.auth.client = null;
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
      const passwordHash = await hashPassword(newPassword);
      await req.auth.client.query(
        `UPDATE user_accounts
         SET password_hash = $3, must_reset_password = false,
             failed_login_count = 0, locked_until = NULL, updated_at = now()
         WHERE school_id = $1 AND id = $2`,
        [req.auth.claims.schoolId, req.auth.claims.userId, passwordHash]
      );
      await req.auth.client.query(
        'DELETE FROM auth_sessions WHERE school_id = $1 AND user_id = $2 AND id <> $3',
        [req.auth.claims.schoolId, req.auth.claims.userId, req.auth.claims.sessionId]
      );
      await logAuthEvent(req.auth.client, req, {
        schoolId: req.auth.claims.schoolId,
        actorUserId: req.auth.claims.userId,
        action: 'PASSWORD_CHANGED',
        details: {},
      });
      await commitAndRelease(req.auth.client);
      req.auth.client = null;
      return res.status(204).end();
    } catch {
      await rollbackAndRelease(req.auth.client);
      req.auth.client = null;
      return res.status(503).json({ error: 'Password service is temporarily unavailable.' });
    }
  });

  return router;
}
