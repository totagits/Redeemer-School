import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId='b210b463-c02c-4be9-9003-8a9005e8dbe5';
const userId='721ddf68-1c98-4faa-9dc7-9161daa79870';
const assignmentId='abfb9f2c-9bb0-45a9-a2f2-2cb9df5582be';
const materialId='b3d0e1aa-3814-43d3-b87c-f4ad0ca31bd3';

class FakeClient {
  constructor({assigned=true}={}){this.assigned=assigned;this.statements=[];}
  async query(sql,params=[]){
    const q=sql.replace(/\s+/g,' ').trim();this.statements.push({sql:q,params});
    if(['BEGIN','COMMIT','ROLLBACK'].includes(q))return{rows:[],rowCount:0};
    if(q.startsWith('INSERT INTO teaching_materials'))return this.assigned?{rows:[{id:materialId,teacher_assignment_id:assignmentId,title:params[3],status:'DRAFT'}],rowCount:1}:{rows:[],rowCount:0};
    if(q.startsWith('UPDATE teaching_materials'))return{rows:[{id:materialId,title:'Fractions handout',status:'PUBLISHED',published_at:'2026-10-23T00:00:00Z'}],rowCount:1};
    if(q.startsWith('INSERT INTO audit_events'))return{rows:[{id:'audit-id'}],rowCount:1};
    throw new Error(`Unexpected teaching-material query: ${q}`);
  }
  release(){}
}

async function startServer(t,{permissions=['grades.enter'],assigned=true}={}){
  const clients=[];const app=express();app.use(express.json());
  app.use('/api/operations',createOperationsRouter({authenticate(req,_res,next){const client=new FakeClient({assigned});clients.push(client);req.auth={account:{id:userId,roles:['TEACHER'],permissions},claims:{schoolId,userId,csrfToken:'csrf-test-token'},client};next();}}));
  const server=createServer(app).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  return{url:`http://127.0.0.1:${server.address().port}`,clients};
}

const headers={'Content-Type':'application/json','X-CSRF-Token':'csrf-test-token'};

test('teacher can save a draft material only within an assigned class',async t=>{
  const {url,clients}=await startServer(t);
  const response=await fetch(`${url}/api/operations/teaching-materials`,{method:'POST',headers,body:JSON.stringify({assignmentId,title:'Fractions handout',materialType:'HANDOUT',description:'Practice problems',resourceUrl:'https://school.example/material.pdf'})});
  assert.equal(response.status,201);assert.equal((await response.json()).material.status,'DRAFT');
  assert.ok(clients[0].statements.some(({sql})=>sql.startsWith('INSERT INTO audit_events')));
  assert.equal(clients[0].statements.at(-1).sql,'COMMIT');
});

test('teaching material creation rejects non-HTTPS links',async t=>{
  const {url,clients}=await startServer(t);
  const response=await fetch(`${url}/api/operations/teaching-materials`,{method:'POST',headers,body:JSON.stringify({assignmentId,title:'Handout',materialType:'HANDOUT',resourceUrl:'http://example.test/file.pdf'})});
  assert.equal(response.status,400);assert.equal(clients[0].statements.some(({sql})=>sql.startsWith('INSERT INTO teaching_materials')),false);
});

test('teacher cannot create a material under another teacher assignment',async t=>{
  const {url,clients}=await startServer(t,{assigned:false});
  const response=await fetch(`${url}/api/operations/teaching-materials`,{method:'POST',headers,body:JSON.stringify({assignmentId,title:'Handout',materialType:'HANDOUT'})});
  assert.equal(response.status,403);assert.equal(clients[0].statements.at(-1).sql,'ROLLBACK');
});

test('publishing a draft material requires teaching permission and writes an audit event',async t=>{
  const {url,clients}=await startServer(t);
  const response=await fetch(`${url}/api/operations/teaching-materials/${materialId}/publish`,{method:'POST',headers,body:JSON.stringify({})});
  assert.equal(response.status,200);assert.equal((await response.json()).material.status,'PUBLISHED');
  assert.ok(clients[0].statements.some(({sql})=>sql.startsWith('INSERT INTO audit_events')));
  assert.equal(clients[0].statements.at(-1).sql,'COMMIT');
});

test('accounts without teaching permissions cannot create teaching materials',async t=>{
  const {url,clients}=await startServer(t,{permissions:['attendance.read']});
  const response=await fetch(`${url}/api/operations/teaching-materials`,{method:'POST',headers,body:JSON.stringify({assignmentId,title:'Handout',materialType:'HANDOUT'})});
  assert.equal(response.status,403);assert.equal(clients[0].statements.some(({sql})=>sql.startsWith('INSERT INTO teaching_materials')),false);
});
