import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHmac,randomUUID} from 'node:crypto';
import {createAuthRouter} from './auth.js';
import {createCandidateExamRouter} from './candidateExamAuth.js';
import {signSessionClaims} from './authCrypto.js';

const schoolId=randomUUID(),foreignId=randomUUID(),secret='fictional-binding-session-secret-0001';
async function setup(t,returnedSchool=foreignId){
  const log=[];
  const client={query:async(sql)=>{log.push(sql);if(sql.includes('consume_'))return {rows:[{school_id:returnedSchool,user_id:randomUUID()}],rowCount:1};return {rows:[],rowCount:0};},release(){log.push('RELEASE');}};
  const pool={query:async()=>({rows:[{safe:true}],rowCount:1}),connect:async()=>{log.push('CONNECT');return client;}};
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.schoolBinding={id:schoolId,code:'TEST-BINDING'};next();});
  app.use('/api/auth',createAuthRouter({pool,secret,secureCookie:false}));
  app.use('/api/candidate-exams',createCandidateExamRouter({pool,secret,enabled:true,publicUrl:'https://school.example.invalid'}));
  const server=createServer(app).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  return {url:`http://127.0.0.1:${server.address().port}`,log};
}
test('a valid staff session for another school is rejected before accessing its database context',async t=>{
  const {url,log}=await setup(t);
  const token=signSessionClaims({schoolId:foreignId,userId:randomUUID(),sessionId:randomUUID(),csrfToken:'csrf',expiresAt:Date.now()+60000},secret);
  const response=await fetch(url+'/api/auth/session',{headers:{cookie:'redeemer_session='+token}});
  assert.equal(response.status,401);assert.deepEqual(log,[]);
});
test('wrong-school invitation and reset redemption roll back without committing password changes',async t=>{
  for(const endpoint of ['accept-invitation','reset-password']){
    const {url,log}=await setup(t);
    const response=await fetch(url+'/api/auth/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'x'.repeat(43),newPassword:'Fictional-test-password-0001'})});
    assert.equal(response.status,400,endpoint);assert.ok(log.includes('ROLLBACK'));assert.ok(!log.includes('COMMIT'));assert.equal(log.at(-1),'RELEASE');
  }
});
test('a matching school invitation commits its one-time password setup',async t=>{
  const {url,log}=await setup(t,schoolId);
  const response=await fetch(url+'/api/auth/accept-invitation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'x'.repeat(43),newPassword:'Fictional-test-password-0001'})});
  assert.equal(response.status,204);assert.ok(log.includes('COMMIT'));assert.equal(log.at(-1),'RELEASE');
});
test('a valid candidate cookie from another institution cannot open an examination session',async t=>{
  const {url,log}=await setup(t),payload=Buffer.from(JSON.stringify({schoolId:foreignId,examId:randomUUID(),token:'x'.repeat(43),csrf:'y'.repeat(43),expiresAt:Date.now()+60000})).toString('base64url');
  const signature=createHmac('sha256',secret).update('candidate-exam:v1:'+payload).digest('base64url');
  const response=await fetch(url+'/api/candidate-exams/session',{headers:{cookie:'redeemer_exam_candidate='+payload+'.'+signature}});
  assert.equal(response.status,401);assert.deepEqual(log,[]);
});
