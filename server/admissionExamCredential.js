import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Callers must issue credentials only after checking candidate eligibility.
// The raw token is shown once, never persisted or written to logs.
export function issueCandidateSecret() {
  const token=randomBytes(32).toString('base64url');
  return {token,tokenHash:hashCandidateSecret(token)};
}
export function hashCandidateSecret(token) {
  if(typeof token!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return createHash('sha256').update(token,'utf8').digest('hex');
}
export function matchCandidateSecret(token,storedHash) {
  const candidate=hashCandidateSecret(token);
  if(!candidate || typeof storedHash!=='string' || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  return timingSafeEqual(Buffer.from(candidate,'hex'),Buffer.from(storedHash,'hex'));
}
export function credentialUsable(row, now=new Date()) {
  if(!row || !row.issued_at || !row.expires_at || row.revoked_at || row.redeemed_at) return false;
  const issued=new Date(row.issued_at).valueOf(),expires=new Date(row.expires_at).valueOf(),current=new Date(now).valueOf();
  return [issued,expires,current].every(Number.isFinite) && expires>issued && current>=issued && current<expires;
}
