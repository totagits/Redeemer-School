import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const MAX_PASSWORD_BYTES = 1024;

export function isStrongSessionSecret(secret) {
  return typeof secret === 'string' && Buffer.byteLength(secret, 'utf8') >= 32;
}

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new Error('Password must be at least 12 characters and no more than 1024 bytes.');
  }

  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES || typeof encoded !== 'string') {
    return false;
  }

  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallelization = Number(parts[3]);
  if (
    !Number.isInteger(cost) || cost < 16_384 || cost > 262_144 || (cost & (cost - 1)) !== 0 ||
    !Number.isInteger(blockSize) || blockSize < 1 || blockSize > 16 ||
    !Number.isInteger(parallelization) || parallelization < 1 || parallelization > 4
  ) return false;

  try {
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    if (salt.length < 16 || salt.length > 64 || expected.length !== KEY_LENGTH) return false;
    const derived = Buffer.from(await scrypt(password, salt, KEY_LENGTH, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: 128 * cost * blockSize + 1024 * 1024,
    }));
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function signSessionClaims(claims, secret) {
  if (!isStrongSessionSecret(secret)) throw new Error('APP_SESSION_SECRET must contain at least 32 bytes.');
  const payload = Buffer.from(JSON.stringify({ v: 1, ...claims })).toString('base64url');
  const signed = `v1.${payload}`;
  const signature = createHmac('sha256', secret).update(signed).digest('base64url');
  return `${signed}.${signature}`;
}

export function verifySessionClaims(token, secret, now = Date.now()) {
  if (!isStrongSessionSecret(secret) || typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;

  const signed = `${parts[0]}.${parts[1]}`;
  const expected = createHmac('sha256', secret).update(signed).digest();
  let provided;
  try {
    provided = Buffer.from(parts[2], 'base64url');
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (
      claims?.v !== 1 ||
      typeof claims.schoolId !== 'string' ||
      typeof claims.userId !== 'string' ||
      typeof claims.sessionId !== 'string' ||
      typeof claims.csrfToken !== 'string' ||
      !Number.isSafeInteger(claims.expiresAt) ||
      claims.expiresAt <= now
    ) return null;
    return claims;
  } catch {
    return null;
  }
}
