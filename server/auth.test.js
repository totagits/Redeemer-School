import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createAuthRouter } from './auth.js';
import { createOperationsRouter } from './operations.js';
import { hashPassword } from './authCrypto.js';
import { hashInvitationToken } from './invitations.js';

const schoolId = 'b210b463-c02c-4be9-9003-8a9005e8dbe5';
const userId = '721ddf68-1c98-4faa-9dc7-9161daa79870';
const secret = 'test-session-secret-is-long-enough-0001';

class FakePool {
  constructor(passwordHash) {
    this.passwordHash = passwordHash;
    this.sessions = new Map();
    this.tenantScopes = [];
    this.releaseCount = 0;
    this.invitationTokenHash = null;
    this.invitationPasswordHash = null;
    this.passwordResetTokenHash = null;
    this.passwordResetPasswordHash = null;
    this.user = {
      id: userId,
      school_id: schoolId,
      email: 'admin@redeemer.example',
      full_name: 'Staging Admin',
      password_hash: passwordHash,
      status: 'ACTIVE',
      failed_login_count: 0,
      locked_until: null,
      must_reset_password: false,
    };
  }

  async query(sql) {
    if (sql.includes('FROM pg_roles')) return { rows: [{ safe: true }], rowCount: 1 };
    throw new Error(`Unexpected pool query: ${sql}`);
  }

  async connect() {
    return new FakeClient(this);
  }
}

class FakeClient {
  constructor(pool) {
    this.pool = pool;
    this.currentSchoolId = null;
    this.released = false;
  }

  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) return { rows: [], rowCount: 0 };
    if (normalized.includes("set_config('app.current_school_id'")) {
      this.currentSchoolId = params[0];
      this.pool.tenantScopes.push(params[0]);
      return { rows: [{ set_config: params[0] }], rowCount: 1 };
    }
    if (normalized.includes('app.resolve_school_id_by_code')) {
      return { rows: [{ id: params[0] === 'RIA' ? schoolId : null }], rowCount: 1 };
    }
    if (normalized.startsWith('SELECT id, email, full_name FROM user_accounts')) {
      return this.currentSchoolId === schoolId && params[1] === 'admin@redeemer.example'
        ? { rows: [{ id: userId, email: this.pool.user.email, full_name: this.pool.user.full_name }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith('SELECT id, school_id, email, full_name, password_hash')) {
      return this.currentSchoolId === schoolId && params[1] === 'admin@redeemer.example'
        ? { rows: [{ ...this.pool.user }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith('UPDATE account_password_resets')) return { rows: [], rowCount: 0 };
    if (normalized.startsWith('INSERT INTO account_password_resets')) {
      this.pool.passwordResetTokenHash = params[2];
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith('INSERT INTO auth_sessions')) {
      this.pool.sessions.set(params[0], {
        id: params[0], schoolId: params[1], userId: params[2], tokenHash: params[3],
        expiresAt: Number(params[4]),
      });
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith('UPDATE user_accounts')) return { rows: [], rowCount: 1 };
    if (normalized.startsWith('SELECT u.id, u.school_id, u.campus_id')) {
      return {
        rows: [{
          id: userId,
          school_id: schoolId,
          campus_id: null,
          email: 'admin@redeemer.example',
          full_name: 'Staging Admin',
          school_name: "Redeemer's International Academy",
          roles: ['SCHOOL_ADMIN'],
          permissions: ['school.configure', 'students.read'],
          must_reset_password: false,
        }],
        rowCount: 1,
      };
    }
    if (normalized.startsWith('INSERT INTO audit_events')) return { rows: [], rowCount: 1 };
    if (normalized.startsWith('SELECT 1 FROM auth_sessions')) {
      const session = this.pool.sessions.get(params[0]);
      const ok = session && session.schoolId === params[1] && session.userId === params[2] &&
        session.tokenHash === params[3] && session.expiresAt > Date.now();
      return { rows: ok ? [{ '?column?': 1 }] : [], rowCount: ok ? 1 : 0 };
    }
    if (normalized.startsWith('DELETE FROM auth_sessions')) {
      const session = this.pool.sessions.get(params[0]);
      if (session && session.tokenHash === params[3]) this.pool.sessions.delete(params[0]);
      return { rows: [], rowCount: session ? 1 : 0 };
    }
    throw new Error(`Unexpected client query: ${normalized}`);
  }

  release() {
    if (!this.released) this.pool.releaseCount += 1;
    this.released = true;
  }
}

async function startServer(t, pool, options = {}) {
  const app = express();
  app.use(express.json());
  const authRouter = createAuthRouter({ pool, secret, secureCookie: false, ...options });
  app.use('/api/auth', authRouter);
  app.use('/api/operations', createOperationsRouter({ authenticate: authRouter.requireAuth }));
  const server = createServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('login creates a scoped session, GET session validates it, and CSRF protects logout', async (t) => {
  const password = 'Stage-Only-Password-2026!';
  const pool = new FakePool(await hashPassword(password));
  const baseUrl = await startServer(t, pool);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schoolCode: 'RIA', email: 'ADMIN@REDEEMER.EXAMPLE', password }),
  });
  assert.equal(login.status, 200);
  const loginBody = await login.json();
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal(loginBody.account.schoolId, schoolId);
  assert.deepEqual(loginBody.account.roles, ['SCHOOL_ADMIN']);
  assert.match(cookie, /^redeemer_session=/);
  assert.deepEqual(pool.tenantScopes, [schoolId]);

  const session = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookie } });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).account.email, 'admin@redeemer.example');

  const deniedSetup = await fetch(`${baseUrl}/api/operations/setup`, { headers: { Cookie: cookie } });
  assert.equal(deniedSetup.status, 403);
  assert.equal((await deniedSetup.json()).error, 'You do not have permission to view school setup.');

  const rejectedLogout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST', headers: { Cookie: cookie },
  });
  assert.equal(rejectedLogout.status, 403);

  const logout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookie, 'X-CSRF-Token': loginBody.csrfToken },
  });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(pool.sessions.size, 0);
  assert.equal(pool.releaseCount, 5);
});

test('staff credentials are rejected by the family portal login audience before a session is created', async t => {
  const password = 'Stage-Only-Password-2026!';
  const pool = new FakePool(await hashPassword(password));
  const baseUrl = await startServer(t, pool);
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schoolCode: 'RIA', email: 'admin@redeemer.example', password, audience: 'PORTAL' }),
  });
  const result = await response.json();
  assert.equal(response.status, 403);
  assert.match(result.error, /staff sign-in/i);
  assert.equal(pool.sessions.size, 0);
});

test('authentication stays closed when the runtime database role is privileged', async (t) => {
  const baseUrl = await startServer(t, {
    async query() { return { rows: [{ safe: false }], rowCount: 1 }; },
  });
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schoolCode: 'RIA', email: 'admin@redeemer.example', password: 'does-not-matter' }),
  });
  assert.equal(response.status, 503);
});

test('account invitation sets a password through the one-time token function and stores no plaintext', async t => {
  const pool = new FakePool(await hashPassword('existing-test-password-0001'));
  const token = 'invite-token-'.padEnd(43, 'x');
  pool.invitationTokenHash = hashInvitationToken(token);
  pool.query = async (sql, params = []) => {
    if (sql.includes('FROM pg_roles')) return { rows: [{ safe: true }], rowCount: 1 };
    if (sql.includes('app.consume_account_invitation')) {
      pool.invitationPasswordHash = params[1];
      return params[0] === pool.invitationTokenHash
        ? { rows: [{ school_id: schoolId, user_id: userId }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    throw new Error(`Unexpected pool query: ${sql}`);
  };
  const baseUrl = await startServer(t, pool);
  const newPassword = 'Staging-User-Password-2026!';
  const response = await fetch(`${baseUrl}/api/auth/accept-invitation`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
  assert.equal(response.status, 204);
  assert.notEqual(pool.invitationPasswordHash, newPassword);
  assert.equal(pool.invitationPasswordHash.length > 50, true);
  const reused = await fetch(`${baseUrl}/api/auth/accept-invitation`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'other-token-'.padEnd(43, 'y'), newPassword }),
  });
  assert.equal(reused.status, 400);
});

test('account invitation endpoint rejects passwords under 12 characters before database use', async t => {
  const pool = new FakePool(await hashPassword('existing-test-password-0001'));
  let called = false;
  pool.query = async sql => {
    if (sql.includes('FROM pg_roles')) return { rows: [{ safe: true }], rowCount: 1 };
    called = true;
    return { rows: [], rowCount: 0 };
  };
  const baseUrl = await startServer(t, pool);
  const response = await fetch(`${baseUrl}/api/auth/accept-invitation`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'invite-token-'.padEnd(43, 'x'), newPassword: 'short' }),
  });
  assert.equal(response.status, 400);
  assert.equal(called, false);
});


test('password reset requests hide account existence and use a one-time hashed token', async t => {
  const pool = new FakePool(await hashPassword('existing-test-password-0001'));
  let emailedToken = '';
  const baseUrl = await startServer(t, pool, {
    sendPasswordReset: async ({ email, token }) => {
      assert.equal(email, 'admin@redeemer.example');
      emailedToken = token;
    },
  });

  const missing = await fetch(baseUrl + '/api/auth/request-password-reset', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schoolCode: 'RIA', email: 'nobody@redeemer.example' }),
  });
  const missingBody = await missing.json();
  assert.equal(missing.status, 202);

  const requested = await fetch(baseUrl + '/api/auth/request-password-reset', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schoolCode: 'RIA', email: 'ADMIN@REDEEMER.EXAMPLE' }),
  });
  assert.equal(requested.status, 202);
  assert.deepEqual(await requested.json(), missingBody);
  assert.match(emailedToken, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(pool.passwordResetTokenHash, emailedToken);
  assert.equal(pool.passwordResetTokenHash, hashInvitationToken(emailedToken));

  pool.query = async (sql, params = []) => {
    if (sql.includes('FROM pg_roles')) return { rows: [{ safe: true }], rowCount: 1 };
    if (sql.includes('app.consume_password_reset')) {
      pool.passwordResetPasswordHash = params[1];
      return params[0] === pool.passwordResetTokenHash ? { rows: [{ user_id: userId }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    throw new Error('Unexpected pool query: ' + sql);
  };
  const newPassword = 'New-Staging-Password-2026!';
  const reset = await fetch(baseUrl + '/api/auth/reset-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: emailedToken, newPassword }),
  });
  assert.equal(reset.status, 204);
  assert.notEqual(pool.passwordResetPasswordHash, newPassword);
});
