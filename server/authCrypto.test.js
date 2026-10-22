import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  hashSessionToken,
  signSessionClaims,
  verifyPassword,
  verifySessionClaims,
} from './authCrypto.js';

test('password hashes are salted and verify without storing plaintext', async () => {
  const password = 'Redeemer-Stage-Only-Password-1!';
  const first = await hashPassword(password);
  const second = await hashPassword(password);

  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('wrong password', first), false);
  assert.equal(await verifyPassword(password, 'not-a-password-hash'), false);
  assert.equal(first.includes(password), false);
});

test('password hashing rejects weak and oversized passwords', async () => {
  await assert.rejects(() => hashPassword('short'), /at least 12 characters/);
  assert.equal(await verifyPassword('x'.repeat(1025), 'invalid'), false);
});

test('signed session claims detect expiry and tampering', () => {
  const secret = 'a'.repeat(48);
  const claims = {
    schoolId: 'b210b463-c02c-4be9-9003-8a9005e8dbe5',
    userId: '721ddf68-1c98-4faa-9dc7-9161daa79870',
    sessionId: '0b1a54d2b3c27bc4ed154f356e63a806',
    csrfToken: 'csrf-value',
    expiresAt: 2_000_000,
  };
  const token = signSessionClaims(claims, secret);

  assert.deepEqual(verifySessionClaims(token, secret, 1_999_999), { v: 1, ...claims });
  assert.equal(verifySessionClaims(token, secret, 2_000_000), null);
  assert.equal(verifySessionClaims(`${token}x`, secret, 1_999_999), null);
  assert.equal(verifySessionClaims(token, 'b'.repeat(48), 1_999_999), null);
  assert.equal(hashSessionToken(token), hashSessionToken(token));
});
