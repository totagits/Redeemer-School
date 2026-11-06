import test from 'node:test';
import assert from 'node:assert/strict';
import {issueCandidateSecret,hashCandidateSecret,matchCandidateSecret,credentialUsable} from './admissionExamCredential.js';
test('secrets are random and store only hashes',()=>{
 const a=issueCandidateSecret(),b=issueCandidateSecret();
 assert.notEqual(a.token,b.token);assert.notEqual(a.token,a.tokenHash);
 assert.equal(a.token.length,43);assert.equal(a.tokenHash.length,64);
 assert.equal(matchCandidateSecret(a.token,a.tokenHash),true);
 assert.equal(matchCandidateSecret(b.token,a.tokenHash),false);
});
test('invalid tokens and hashes fail closed',()=>{
 assert.equal(hashCandidateSecret('abc'),null);
 assert.equal(matchCandidateSecret('abc','0'.repeat(64)),false);
 assert.equal(matchCandidateSecret(issueCandidateSecret().token,'invalid'),false);
});
test('single-use credentials expire at exact boundary',()=>{
 const base={issued_at:'2026-11-05T08:00:00Z',expires_at:'2026-11-05T09:00:00Z',redeemed_at:null,revoked_at:null};
 assert.equal(credentialUsable(base,'2026-11-05T08:59:59Z'),true);
 assert.equal(credentialUsable(base,'2026-11-05T09:00:00Z'),false);
 assert.equal(credentialUsable({...base,redeemed_at:'2026-11-05T08:10:00Z'},'2026-11-05T08:20:00Z'),false);
 assert.equal(credentialUsable({...base,revoked_at:'2026-11-05T08:10:00Z'},'2026-11-05T08:20:00Z'),false);
});
