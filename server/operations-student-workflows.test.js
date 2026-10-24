import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createOperationsRouter } from './operations.js';

const studentId='a2de51f4-86fd-42d5-a658-70c2ae6dfac3';
const assessmentId='bd7c53be-fde1-46c6-aeaf-0d331ff890b4';
class FakeClient {
  constructor({linked=true}={}){this.linked=linked;this.statements=[];}
  async query(sql,params=[]){const q=sql.replace(/\s+/g,' ').trim();this.statements.push({q,params});
    if(q.startsWith('SELECT st.id,a.id AS assessment_id'))return this.linked?{rows:[{id:studentId,assessment_id:assessmentId,title:'Fractions worksheet',teacher_id:'teacher-user-id'}],rowCount:1}:{rows:[],rowCount:0};
    if(q.startsWith('INSERT INTO assessment_submissions'))return {rows:[{id:'submission-id',submitted_at:'2026-10-24T00:00:00Z',status:'SUBMITTED'}],rowCount:1};
    if(q.startsWith('INSERT INTO portal_notifications'))return {rows:[{id:'notification-id'}],rowCount:1};
    return {rows:[],rowCount:1};
  }
  release(){}
}
async function harness({role='STUDENT',permissions=['assignments.submit'],linked=true}={}){
  const app=express();app.use(express.json());const client=new FakeClient({linked});app.use('/api/operations',createOperationsRouter({authenticate(_req,_res,next){_req.auth={account:{id:'student-user-id',roles:[role],permissions},claims:{schoolId:'school-id',userId:'student-user-id',csrfToken:'csrf-token'},client};next();}}));const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));return {client,url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
const submit=(url,body)=>fetch(`${url}/api/operations/portal/submissions`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':'csrf-token'},body:JSON.stringify(body)});

test('student may submit work only for a linked active class assignment',async t=>{
  const app=await harness();t.after(app.close);const response=await submit(app.url,{assessmentId,responseText:'My answer is 24.'});assert.equal(response.status,201);const body=await response.json();assert.equal(body.submission.status,'SUBMITTED');assert.ok(app.client.statements.some(item=>item.q.startsWith('INSERT INTO assessment_submissions')));assert.ok(app.client.statements.some(item=>item.q.startsWith('INSERT INTO audit_events')));
});

test('submission is rejected when the student has no matching active assignment',async t=>{
  const app=await harness({linked:false});t.after(app.close);const response=await submit(app.url,{assessmentId,responseText:'My answer is 24.'});assert.equal(response.status,404);assert.ok(!app.client.statements.some(item=>item.q.startsWith('INSERT INTO assessment_submissions')));
});

test('teacher role cannot use student submission endpoint',async t=>{
  const app=await harness({role:'TEACHER',permissions:['assignments.submit']});t.after(app.close);const response=await submit(app.url,{assessmentId,responseText:'A response'});assert.equal(response.status,403);assert.ok(!app.client.statements.some(item=>item.q.startsWith('INSERT INTO assessment_submissions')));
});
