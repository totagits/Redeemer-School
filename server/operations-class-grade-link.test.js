import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId='b210b463-c02c-4be9-9003-8a9005e8dbe5';
const userId='721ddf68-1c98-4faa-9dc7-9161daa79870';
const classId='d6af5a68-761c-4320-9b1a-e3186965fcdd';
const gradeId='e7c93a15-0863-4547-b351-afbd175e0113';

class FakeClient {
  constructor({classExists=true,gradeExists=true}={}){this.classExists=classExists;this.gradeExists=gradeExists;this.statements=[];}
  async query(sql,params=[]){
    const normalized=sql.replace(/\s+/g,' ').trim();this.statements.push({sql:normalized,params});
    if(['BEGIN','COMMIT','ROLLBACK'].includes(normalized))return{rows:[],rowCount:0};
    if(normalized.startsWith('UPDATE class_groups c SET grade_level_id=g.id')){
      if(!this.classExists||!this.gradeExists)return{rows:[],rowCount:0};
      return{rows:[{id:classId,name:'Grade 4',grade_level:'Grade 4',section:'A',academic_year_id:'year-id',grade_level_id:gradeId,linked_grade_name:'Grade 4',education_level_id:'stage-id'}],rowCount:1};
    }
    if(normalized.startsWith('INSERT INTO audit_events'))return{rows:[{id:'audit-id'}],rowCount:1};
    throw new Error(`Unexpected query: ${normalized}`);
  }
  release(){}
}

async function startServer(t,permissions=['academics.configure'],options={}){
  const clients=[];const app=express();app.use(express.json());
  app.use('/api/operations',createOperationsRouter({authenticate(req,_res,next){
    const client=new FakeClient(options);clients.push(client);
    req.auth={account:{id:userId,roles:['CAMPUS_ADMIN'],permissions},claims:{schoolId,userId,csrfToken:'csrf-test-token'},client};next();
  }}));
  const server=createServer(app).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return{url:`http://127.0.0.1:${server.address().port}`,clients};
}
const headers={'Content-Type':'application/json','X-CSRF-Token':'csrf-test-token'};

test('authorized administrator links an existing class to a grade without replacing enrollments',async t=>{
  const{url,clients}=await startServer(t);
  const response=await fetch(`${url}/api/operations/classes/${classId}/grade-level`,{method:'POST',headers,body:JSON.stringify({gradeLevelId:gradeId})});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.classGroup.grade_level_id,gradeId);
  assert.match(body.notice,/Student enrollments were preserved/);
  const statements=clients[0].statements;
  const update=statements.find(item=>item.sql.startsWith('UPDATE class_groups c SET grade_level_id=g.id'));
  assert.ok(update);
  assert.deepEqual(update.params,[schoolId,classId,gradeId]);
  assert.ok(update.sql.includes('education_level_id=g.education_level_id'));
  assert.ok(statements.some(item=>item.sql.startsWith('INSERT INTO audit_events')));
});

test('class grade linking enforces academic configuration permission',async t=>{
  const{url,clients}=await startServer(t,['students.read']);
  const response=await fetch(`${url}/api/operations/classes/${classId}/grade-level`,{method:'POST',headers,body:JSON.stringify({gradeLevelId:gradeId})});
  assert.equal(response.status,403);
  assert.equal(clients[0].statements.some(item=>item.sql.startsWith('UPDATE class_groups')),false);
});

test('class grade linking rejects a class or grade outside the school',async t=>{
  const{url,clients}=await startServer(t,['academics.configure'],{gradeExists:false});
  const response=await fetch(`${url}/api/operations/classes/${classId}/grade-level`,{method:'POST',headers,body:JSON.stringify({gradeLevelId:gradeId})});
  assert.equal(response.status,404);
  assert.equal(clients[0].statements.some(item=>item.sql.startsWith('INSERT INTO audit_events')),false);
});
