import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId='b210b463-c02c-4be9-9003-8a9005e8dbe5';
const userId='721ddf68-1c98-4faa-9dc7-9161daa79870';
const threadId='32f8f4d3-5d2a-4f36-bd4e-fc0f38a44f07';
const studentId='c210b463-c02c-4be9-9003-8a9005e8dbe5';

class FakeClient {
  constructor({ linked }) { this.linked=linked;this.statements=[]; }
  async query(sql,params=[]) {
    const statement=sql.replace(/\s+/g,' ').trim();
    this.statements.push({statement,params});
    if(['BEGIN','COMMIT','ROLLBACK'].includes(statement))return {rows:[],rowCount:0};
    if(statement.includes('FROM family_message_threads t JOIN students s') && statement.includes('ORDER BY t.updated_at')) {
      assert.match(statement,/EXISTS \(SELECT 1 FROM guardians g JOIN student_guardians sg/);
      assert.match(statement,/g\.active AND sg\.student_id=t\.student_id/);
      return {rows:this.linked?[{id:threadId,student_id:studentId,subject:'Math'}]:[],rowCount:this.linked?1:0};
    }
    if(statement.startsWith('SELECT s.id,s.first_name,s.last_name FROM guardians'))return {rows:this.linked?[{id:studentId,first_name:'Test',last_name:'Learner'}]:[],rowCount:this.linked?1:0};
    if(statement.startsWith('SELECT t.id,t.subject,t.student_id,t.guardian_user_id')) {
      assert.match(statement,/EXISTS \(SELECT 1 FROM guardians g JOIN student_guardians sg/);
      assert.match(statement,/g\.active AND sg\.student_id=t\.student_id/);
      return {rows:this.linked?[{id:threadId,subject:'Math',student_id:studentId,guardian_user_id:userId}]:[],rowCount:this.linked?1:0};
    }
    if(statement.startsWith('SELECT t.id,t.subject FROM family_message_threads t')) {
      assert.match(statement,/EXISTS \(SELECT 1 FROM guardians g JOIN student_guardians sg/);
      assert.match(statement,/g\.active AND sg\.student_id=t\.student_id/);
      return {rows:this.linked?[{id:threadId,subject:'Math'}]:[],rowCount:this.linked?1:0};
    }
    if(statement.startsWith('SELECT m.id,m.body,m.sender_user_id'))return {rows:[{id:'message-1',body:'Test reply',sender_user_id:userId}],rowCount:1};
    if(statement.startsWith('UPDATE family_messages')||statement.startsWith('UPDATE family_message_threads'))return {rows:[],rowCount:1};
    if(statement.startsWith('INSERT INTO family_messages'))return {rows:[{id:'message-2',body:params[3]}],rowCount:1};
    if(statement.startsWith('SELECT ua.id FROM user_accounts'))return {rows:[],rowCount:0};
    if(statement.startsWith('INSERT INTO audit_events'))return {rows:[],rowCount:1};
    throw new Error('Unexpected query in guardian-link test: '+statement);
  }
  release(){}
}
async function start(t,linked) {
  const clients=[];const app=express();app.use(express.json());
  app.use('/api/operations',createOperationsRouter({authenticate(req,_res,next){
    const client=new FakeClient({linked});clients.push(client);
    req.auth={account:{id:userId,roles:['PARENT'],permissions:['portal.messages.read','portal.messages.write']},claims:{schoolId,userId,csrfToken:'csrf-test-token'},client};next();
  }}));
  const server=createServer(app).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return {url:'http://127.0.0.1:'+server.address().port,clients};
}
const headers={'Content-Type':'application/json','X-CSRF-Token':'csrf-test-token'};
test('linked guardian can list, read and reply to an active student conversation',async t=>{
  const {url}=await start(t,true);
  const inbox=await fetch(url+'/api/operations/portal/family-messages');
  assert.equal(inbox.status,200);assert.equal((await inbox.json()).threads.length,1);
  const read=await fetch(url+'/api/operations/portal/family-messages/'+threadId);
  assert.equal(read.status,200);assert.equal((await read.json()).messages.length,1);
  const reply=await fetch(url+'/api/operations/portal/family-messages/'+threadId+'/reply',{method:'POST',headers,body:JSON.stringify({body:'Thanks'})});
  assert.equal(reply.status,201);
});
test('revoked guardian cannot list, read or reply to a former student conversation',async t=>{
  const {url,clients}=await start(t,false);
  const inbox=await fetch(url+'/api/operations/portal/family-messages');
  assert.equal(inbox.status,200);assert.equal((await inbox.json()).threads.length,0);
  const read=await fetch(url+'/api/operations/portal/family-messages/'+threadId);
  assert.equal(read.status,404);
  const reply=await fetch(url+'/api/operations/portal/family-messages/'+threadId+'/reply',{method:'POST',headers,body:JSON.stringify({body:'Should not send'})});
  assert.equal(reply.status,404);
  assert.equal(clients.flatMap(c=>c.statements).some(x=>x.statement.startsWith('INSERT INTO family_messages')),false);
  assert.equal(clients.flatMap(c=>c.statements).some(x=>x.statement.startsWith('UPDATE family_messages')),false);
});
