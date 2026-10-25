import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId='b210b463-c02c-4be9-9003-8a9005e8dbe5';
const userId='721ddf68-1c98-4faa-9dc7-9161daa79870';
const applicationId='a210b463-c02c-4be9-9003-8a9005e8dbe5';
const categoryId='a310b463-c02c-4be9-9003-8a9005e8dbe5';
const pdf=Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');

class FakeClient {
  constructor({permissions=['admissions.read','admissions.write','students.sensitive.read'],schemaReady=true}={}) { this.permissions=permissions;this.schemaReady=schemaReady;this.statements=[]; }
  async query(sql,params=[]) {
    const statement=sql.replace(/\s+/g,' ').trim();this.statements.push({statement,params});
    if(['BEGIN','COMMIT','ROLLBACK'].includes(statement))return{rows:[],rowCount:0};
    if(statement.startsWith('SELECT count(*)::int AS column_count FROM information_schema.columns'))return{rows:[{column_count:this.schemaReady?4:0}],rowCount:1};
    if(statement.startsWith('INSERT INTO admission_documents')) {
      const document={id:params[0],title:params[4],original_filename:params[5],media_type:'application/pdf',size_bytes:String(params[6]),checksum_sha256:params[7],uploaded_at:'2026-10-25T00:00:00Z',file_content:params[8],content_nonce:params[9],content_auth_tag:params[10]};
      FakeClient.documents.set(document.id,document);return{rows:[document],rowCount:1};
    }
    if(statement.startsWith('SELECT id,title,original_filename,media_type,size_bytes,checksum_sha256,file_content,content_nonce,content_auth_tag')) {const d=FakeClient.documents.get(params[2]);return d&&!d.deleted?{rows:[d],rowCount:1}:{rows:[],rowCount:0};}
    if(statement.startsWith('UPDATE admission_documents SET deleted_at=now()')) {const d=FakeClient.documents.get(params[2]);if(d)d.deleted=true;return d?{rows:[{id:d.id,title:d.title}],rowCount:1}:{rows:[],rowCount:0};}
    if(statement.startsWith('INSERT INTO audit_events'))return{rows:[],rowCount:1};
    throw new Error(`Unexpected query: ${statement}`);
  }
  release(){}
}
FakeClient.documents=new Map();

async function startServer(t,options={}) {
  const clients=[];const app=express();app.use(express.json());
  app.use('/api/operations',createOperationsRouter({authenticate(req,_res,next){const client=new FakeClient(options);clients.push(client);req.auth={account:{id:userId,roles:['SCHOOL_ADMIN'],permissions:options.permissions||['admissions.read','admissions.write','students.sensitive.read']},claims:{schoolId,userId,csrfToken:'csrf-test-token'},client};next();}}));
  const server=createServer(app).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  return{url:`http://127.0.0.1:${server.address().port}`,clients};
}
const csrf={'X-CSRF-Token':'csrf-test-token'};
async function withKey(action){const previous=process.env.STUDENT_DOCUMENT_ENCRYPTION_KEY;process.env.STUDENT_DOCUMENT_ENCRYPTION_KEY=randomBytes(32).toString('base64');try{return await action();}finally{if(previous===undefined)delete process.env.STUDENT_DOCUMENT_ENCRYPTION_KEY;else process.env.STUDENT_DOCUMENT_ENCRYPTION_KEY=previous;}}

test('applicant PDF is encrypted, integrity-checked, private, audited and downloadable only in its application scope',async t=>withKey(async()=>{
  FakeClient.documents.clear();const{url,clients}=await startServer(t);const params=new URLSearchParams({title:'Birth certificate',categoryId,fileName:'birth.pdf'});
  const upload=await fetch(`${url}/api/operations/admissions/${applicationId}/documents?${params}`,{method:'POST',headers:{...csrf,'Content-Type':'application/pdf'},body:pdf});
  assert.equal(upload.status,201);const saved=(await upload.json()).document;assert.equal(saved.title,'Birth certificate');
  const insert=clients[0].statements.find(x=>x.statement.startsWith('INSERT INTO admission_documents'));
  assert.ok(Buffer.isBuffer(insert.params[8]));assert.notDeepEqual(insert.params[8],pdf);
  const download=await fetch(`${url}/api/operations/admissions/${applicationId}/documents/${saved.id}/content`);
  assert.equal(download.status,200);assert.equal(download.headers.get('cache-control'),'no-store, private');assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf);
  assert.ok(clients.some(client=>client.statements.some(x=>x.statement.startsWith('INSERT INTO audit_events'))));
}));

test('applicant document upload requires restricted-record permission',async t=>withKey(async()=>{
  const{url,clients}=await startServer(t,{permissions:['admissions.read','admissions.write']});
  const response=await fetch(`${url}/api/operations/admissions/${applicationId}/documents?title=Record&fileName=record.pdf`,{method:'POST',headers:{...csrf,'Content-Type':'application/pdf'},body:pdf});
  assert.equal(response.status,403);assert.equal(clients[0].statements.some(x=>x.statement.startsWith('INSERT INTO admission_documents')),false);
}));

test('applicant document upload refuses invalid PDF and unavailable schema',async t=>withKey(async()=>{
  const bad=await startServer(t);let response=await fetch(`${bad.url}/api/operations/admissions/${applicationId}/documents?title=Record&fileName=record.pdf`,{method:'POST',headers:{...csrf,'Content-Type':'application/pdf'},body:Buffer.from('not pdf')});assert.equal(response.status,400);
  const missing=await startServer(t,{schemaReady:false});response=await fetch(`${missing.url}/api/operations/admissions/${applicationId}/documents?title=Record&fileName=record.pdf`,{method:'POST',headers:{...csrf,'Content-Type':'application/pdf'},body:pdf});assert.equal(response.status,503);
}));

test('applicant document removal is a permission-checked audited soft delete',async t=>withKey(async()=>{
  FakeClient.documents.clear();const{url,clients}=await startServer(t);const params=new URLSearchParams({title:'Birth certificate',fileName:'birth.pdf'});
  const upload=await fetch(`${url}/api/operations/admissions/${applicationId}/documents?${params}`,{method:'POST',headers:{...csrf,'Content-Type':'application/pdf'},body:pdf});const saved=(await upload.json()).document;
  const removed=await fetch(`${url}/api/operations/admissions/${applicationId}/documents/${saved.id}/delete`,{method:'POST',headers:{...csrf,'Content-Type':'application/json'},body:'{}'});
  assert.equal(removed.status,200);assert.equal((await removed.json()).deleted,true);assert.ok(clients[1].statements.some(x=>x.statement.startsWith('UPDATE admission_documents SET deleted_at=now()')));assert.ok(clients[1].statements.some(x=>x.statement.startsWith('INSERT INTO audit_events')));
}));
