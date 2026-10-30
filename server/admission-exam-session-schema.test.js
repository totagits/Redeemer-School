import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(file)=>readFileSync(new URL('./migrations/'+file,import.meta.url),'utf8');
const credentials=read('105_admission_exam_candidate_credentials.sql');
const sessions=read('106_admission_exam_candidate_sessions.sql');

test('candidate sessions enforce tenant row-level security',()=>{
 assert.match(sessions,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sessions,/FORCE ROW LEVEL SECURITY/);
 assert.match(sessions,/school_id=app.current_school_id\(\)/);
});
test('sessions must match school, exam, applicant and issued credential',()=>{
 assert.match(credentials,/UNIQUE\(school_id,exam_id,application_id,id\)/);
 assert.match(sessions,/FOREIGN KEY\(school_id,exam_id,application_id,credential_id\)/);
 assert.match(sessions,/REFERENCES admission_exam_candidate_credentials\(school_id,exam_id,application_id,id\)/);
});
test('session hashes and expiry are stored, not raw bearer tokens',()=>{
 assert.match(sessions,/session_hash char\(64\) NOT NULL/);
 assert.match(sessions,/expires_at timestamptz NOT NULL/);
 assert.match(sessions,/CHECK \(expires_at > created_at\)/);
 assert.match(sessions,/UNIQUE\(school_id,session_hash\)/);
 assert.doesNotMatch(sessions,/plaintext_token|raw_token/);
});
