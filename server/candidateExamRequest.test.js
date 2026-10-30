import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createCandidateExamRouter } from './candidateExamAuth.js';

test('candidate requests reject oversized or malformed JSON before database access',async()=>{
 let connected=false;
 const app=express();app.use('/api/candidate-exams',createCandidateExamRouter({pool:{connect:async()=>{connected=true;throw Error('Unexpected database access');}},secret:'local-test-only-'.repeat(4),publicUrl:'https://school.example',enabled:true}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const [body,status] of [['{',400],[JSON.stringify({code:'x'.repeat(20_000)}),413]]){
   const response=await fetch(base+'/api/candidate-exams/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://school.example'},body});
   assert.equal(response.status,status);assert.match((await response.json()).error,/valid examination request/);
  }
  assert.equal(connected,false);
 }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
