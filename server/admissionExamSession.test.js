import test from 'node:test';
import assert from 'node:assert/strict';
import {issueCandidateSecret} from './admissionExamCredential.js';
import {validateCandidateExamSession} from './admissionExamSession.js';
const token=issueCandidateSecret().token;
const row={id:'session-1',application_id:'app-1',expires_at:'2026-11-05T10:00:00Z',
 revoked_at:null,exam_mode:'ONLINE',exam_status:'SCHEDULED',starts_at:'2026-11-05T09:00:00Z',
 ends_at:'2026-11-05T10:00:00Z',assignment_status:'INVITED',application_status:'UNDER_REVIEW',
 credential_redeemed_at:'2026-11-05T09:00:01Z',credential_revoked_at:null,fee_amount:'500.00',fee_currency:'LRD',settlement_kind:'PAYMENT',settlement_channel:'CASH',settlement_amount:'500.00',settlement_currency:'LRD',settlement_verified_at:'2026-11-04T12:00:00Z'};
const args={schoolId:'school-1',examId:'exam-1',sessionToken:token,now:new Date('2026-11-05T09:15:00Z')};
function db(data){return {query:async(sql,params)=>{assert.match(sql,/s.school_id=\$1 AND s.exam_id=\$2 AND s.session_hash=\$3/);assert.equal(params[0],args.schoolId);return {rows:data?[data]:[]};}};}
test('valid session returns scoped candidate identity but no question answers',async()=>{
 const result=await validateCandidateExamSession(db(row),args);
 assert.equal(result.ok,true);assert.equal(result.applicationId,'app-1');
 assert.equal(Object.hasOwn(result,'answer_key'),false);
});
test('invalid credential and unknown session fail closed',async()=>{
 assert.equal((await validateCandidateExamSession(db(row),{...args,sessionToken:'invalid'})).ok,false);
 assert.equal((await validateCandidateExamSession(db(null),args)).ok,false);
});
test('expired, revoked and invalid applicant/assignment are blocked',async()=>{
 for(const item of [{...row,revoked_at:'2026-11-05T09:10:00Z'},
 {...row,expires_at:'2026-11-05T09:00:00Z'},{...row,credential_redeemed_at:null},
 {...row,application_status:'WITHDRAWN'},{...row,assignment_status:'ABSENT'}]){
  assert.equal((await validateCandidateExamSession(db(item),args)).ok,false);
 }
});
test('session is rejected at exam end or before start',async()=>{
 assert.equal((await validateCandidateExamSession(db(row),{...args,now:new Date('2026-11-05T10:00:00Z')})).ok,false);
 assert.equal((await validateCandidateExamSession(db(row),{...args,now:new Date('2026-11-05T08:59:59Z')})).ok,false);
});


test('an existing session loses access when its payment or application is no longer valid',async()=>{
 for(const change of [{fee_amount:null},{settlement_kind:null},{settlement_amount:'400.00'},
 {settlement_currency:'USD'},{settlement_verified_at:null},{application_status:'UNKNOWN'}])
  assert.equal((await validateCandidateExamSession(db({...row,...change}),args)).ok,false);
});
