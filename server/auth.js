import { randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { hashInvitationToken } from './invitations.js';
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
       AND (u.locked