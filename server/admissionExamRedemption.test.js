import test from 'node:test';
import assert from 'node:assert/strict';
import { issueCandidateSecret } from './admissionExamCredential.js';
import { redeemExamCredential } from './admissionExamRedemption.js';

const token=issueCandidateSecret();
const base={id:'credential-id',issued_at:'2026-11-04T12:00:00Z',expires_at:'2026-11-05T09:15:00Z',redeemed_at:null,revoked_at:null,
 exam_mode:'ONLINE',exam_status:'SCHEDULED',starts_at:'2026-11-05T09:00:00Z',ends_at:'2026-11-05T10:00:00Z',
 assignment_status:'INVITED',application_status:'UNDER_REVIEW',fee_amount:'500.00',fee_currency:'LRD',
 settlement_kind:'PAYMENT',settlement_channel:'CASH',settlement_amount:'500.00',
 settlement_currency:'LRD',settlement_reason:null,settlement_verified_at:'2026-11-04T12:00:00Z'};
const args={schoolId:'school',examId:'exam',applicationId:'app',token:token.token,now:new Date('2026-11-05T09:02:00Z')};
function mock(row=base){
 const calls=[];
 const client={query:async(sql,values)=>{
  calls.push({sql,values});
  if(sql.includes('SELECT c.id'))return {rowCount:row?1:0,rows:row?[row]:[]};
  if(sql.includes('INSERT INTO admission_exam_candidate_sessions'))return {rowCount:1,rows:[{id:'session',expires_at:row.ends_at}]};
  if(sql.includes('UPDATE admission_exam_candidate_credentials'))return {rowCount:1,rows:[{id:row.id}]};
  throw Error('Unexpected query');
 }};
 return {client,calls};
}
test('invalid token fails without database lookup',async()=>{
 const {client,calls}=mock();
 assert.equal((await redeemExamCredential(client,{...args,token:'bad'})).ok,false);
 assert.equal(calls.length,0);
});

test('redemption rechecks the clock after waiting for a credential lock',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-05T09:02:00Z')});
 const {client,calls}=mock();
 const query=client.query;
 client.query=async(...input)=>{t.mock.timers.tick(20*60*1000);return query(...input);};
 assert.equal((await redeemExamCredential(client,{...args,now:undefined})).ok,false);
 assert.equal(calls.length,1);
});
test('valid payment and time window permit atomic redemption',async()=>{
 const {client,calls}=mock();
 const result=await redeemExamCredential(client,args);
 assert.equal(result.ok,true);
 assert.equal(result.sessionId,'session');
 assert.equal(typeof result.sessionToken,'string');
 assert.equal(calls.length,3);
 assert.match(calls[0].sql,/FOR UPDATE OF c/);
 assert.match(calls[1].sql,/INSERT INTO admission_exam_candidate_sessions/);
 assert.match(calls[2].sql,/SET redeemed_at=/);
});
test('used credential, unpaid exam, and early arrival are rejected',async()=>{
 for(const row of [{...base,redeemed_at:'2026-11-05T09:01:00Z'},{...base,settlement_kind:null},{...base,starts_at:'2026-11-05T09:05:00Z'}]){
  const {client,calls}=mock(row);
  assert.equal((await redeemExamCredential(client,args)).ok,false);
  assert.equal(calls.length,1);
 }
});


test('a future-issued or malformed credential cannot be redeemed',async()=>{
 for(const issued_at of [null,'invalid','2026-11-05T09:03:00Z']){
  const {client,calls}=mock({...base,issued_at});
  assert.equal((await redeemExamCredential(client,args)).ok,false);
  assert.equal(calls.length,1);
 }
});

test('paper and interview exams never create an online candidate session',async()=>{
 for(const exam_mode of ['PAPER','INTERVIEW',null]){
  const {client,calls}=mock({...base,exam_mode});
  assert.equal((await redeemExamCredential(client,args)).reason,'EXAM_NOT_ONLINE');
  assert.equal(calls.length,1);
 }
});
