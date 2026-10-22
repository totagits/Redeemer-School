import { randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { hashPassword } from './authCrypto.js';
import { createInvitationSecret, InvitationDeliveryError, sendAccountInvitation } from './invitations.js';

const NAME_LIMIT = 120;
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function text(value, limit = NAME_LIMIT) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}
function validDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function sameSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function close(req, commit) {
  const client = req.auth?.client;
  if (!client) return;
  req.auth.client = null;
  try { await client.query(commit ? 'COMMIT' : 'ROLLBACK'); } finally { client.release(); }
}
async function audit(req, action, entityType, entityId, details = {}) {
  await req.auth.client.query(
    `INSERT INTO audit_events (school_id, actor_user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [req.auth.claims.schoolId, req.auth.claims.userId, action, entityType, entityId, JSON.stringify(details)]
  );
}
function needsPermission(code) {
  return async (req, res, next) => {
    if (!req.auth.account.permissions.includes(code)) {
      await close(req, false);
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}
function needsAnyPermission(codes) {
  return async (req, res, next) => {
    if (!codes.some(code => req.auth.account.permissions.includes(code))) {
      await close(req, false);
      return res.status(403).json({ error: 'You do not have permission to view grade records.' });
    }
    next();
  };
}
function csrf(req, res, next) {
  if (!sameSecret(req.get('x-csrf-token'), req.auth.claims.csrfToken)) {
    void close(req, false);
    return res.status(403).json({ error: 'Request verification failed. Refresh your session and try again.' });
  }
  next();
}
async function fail(req, res, error) {
  await close(req, false).catch(() => {});
  if (error instanceof InvitationDeliveryError) return res.status(error.status).json({ error: error.message });
  if (error?.code === '23505') return res.status(409).json({ error: 'That code, email, or record already exists for this school.' });
  if (error?.code === '23503' || error?.code === '23514' || error?.code === '22P02') {
    return res.status(400).json({ error: 'Some selected school data is invalid. Refresh the page and try again.' });
  }
  return res.status(500).json({ error: 'The school operation could not be completed. Please try again.' });
}
async function done(req, res, status, body) {
  try {
    await close(req, true);
    return res.status(status).json(body);
  } catch (error) {
    await close(req, false).catch(() => {});
    return res.status(500).json({ error: 'The school operation could not be completed. Please try again.' });
  }
}
function requireFields(values) { return values.every(Boolean); }

async function createAndSendInvitation(client, { schoolId, userId, email, fullName, role, createdBy }, sendInvitation) {
  const { token, tokenHash } = createInvitationSecret();
  await client.query(`UPDATE account_invitations SET revoked_at = now()
    WHERE school_id = $1 AND user_id = $2 AND redeemed_at IS NULL AND revoked_at IS NULL`, [schoolId, userId]);
  await client.query(`INSERT INTO account_invitations (school_id, user_id, token_hash, expires_at, created_by)
    VALUES ($1, $2, $3, now() + interval '48 hours', $4)`, [schoolId, userId, tokenHash, createdBy]);
  await sendInvitation({ email, fullName, role, tok