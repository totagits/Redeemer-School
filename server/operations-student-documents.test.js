import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId = 'b210b463-c02c-4be9-9003-8a9005e8dbe5';
const studentId = 'c210b463-c02c-4be9-9003-8a9005e8dbe5';
const userId = '721ddf68-1c98-4faa-9dc7-9161daa79870';
const documentId = 'f210b463-c02c-4be9-9003-8a9005e8dbe5';
const categoryId = 'a210b463-c02c-4be9-9003-8a9005e8dbe5';
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');

class FakeClient {
  constructor({ permissions = ['students.write','students.read','students.sensitive.read'], schemaReady = true } = {}) { this.permissions=permissions; this.schemaReady=schemaReady; this.statements=[]; }
  async query(sql, params=[]) {
    const statement=sql.replace(/\s+/g,' ').trim(); this.statements.push({statement,params});
    if(['BEGIN','COMMIT','ROLLBACK'].includes(statement)) return {rows:[],rowCount:0};
    if(statement.startsWith('SELECT count(*)::int AS column_count FROM information_schema.columns')) return {rows:[{column_count:this.schemaReady?3:0}],rowCount:1};
    if(statement.startsWith('SELECT id,code,name,required_for_admission FROM document_categories')) return {rows:[{id:categoryId,code:'BIRTH_CERTIFICATE',name:'Birth certificate',required_for_admission:false}],rowCount:1};
    if(statement.startsWith('INSERT INTO student_documents')) {
      const document={id:params[0],title:params[4],original_filename:params[6],media_type:'application/pdf',size_bytes:String(params[7]),checksum_sha256:params[8],visibility:params[9],uploaded_at:'2026-10-25T00:00:00Z',uploaded_by:'School Admin',category_name:'Birth certificate',file_content:params[11],content_nonce:params[12],content_auth_tag:params[13]};
      FakeClient.documents.set(document.id,document);
      return {rows:[document],rowCount:1};
    }
    if(statement.startsWith('SELECT id,title,original_filename,media_type,size_bytes,checksum_sha256,file_content,content_nonce,content_auth_tag')) { const document=FakeClient.documents.get(params[2]);return document&&!document.deleted?{rows:[document],rowCount:1}:{rows:[],rowCount:0}; }
    if(statement.startsWith('UPDATE student_documents SET deleted_at=now()')) { const document=FakeClient.documents.get(params[2]);if(document)document.deleted=true;return document?{rows:[{id:document.id,title:document.title}],rowCount:1}:{rows:[],rowCount:0}; }
    if(statement.startsWith('INSERT INTO audit_events')) return {rows:[],rowCount:1};
    throw new Error(`Unexpected student document query: ${statement}`);
  }
  release(){}
}
FakeClient.documents=new Map();

async function startServer(t, options={}) {
  const clients=[]; const app=express(); app.use(express.json());
  app.use('/api/operations',createOperationsRouter({authenticate(req,_res,next){const client=new FakeClient(options);clients.push(client);req.auth={account:{id:userId,roles:['SCHOOL_ADMIN'],permissions:options.permissions||['students.write','students.read','students.sensitive.read']},claims:{schoolId,userId,csrfToken:'csrf-test-token'},client};next();}}));
  const server=createServer(app).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return {url:`http://127.0.0.1:${server.address().port}`,clients};
}
const csrf={'X-CSRF-Token':'csrf-test-token'};

async function withEncryptionKey(action) {
  const previous=process.env.STUDENT_DOCUMENT_ENCRYPTION_KEY;
  process.env.STUDENT_DOCUMENT_ENCRYPTION_KEY=randomBytes(32).toString('base64');
  try{return await action();}finally{if(previous===undefined)delete process.env.STUDENT_DOCUMENT_ENCRYPTION_KEY;else process.env.STUDENT_DOCUMENT_ENCRYPTION_KEY=previous;}
}

test('learner PDF is encrypted in PostgreSQL and decrypts only through the authorized audited route',async t=>withEncryptionKey(async()=>{
  FakeClient.documents.clear();
  const {url,clients}=await startServer(t);
  const query=new URLSearchParams({title:'Birth certificate',categoryId,fileName:'birth-certificate.pdf'});
  const upload=await fetch(`${url}/api/operations/students/${studentId}/documents?${query}`,{method:'POST',headers:{...csrf,'Content-Type':'application/pdf'},body:pdf});
  assert.equal(upload.status,201);
  const saved=(await upload.json()).document;
  assert.equal(saved.title,'Birth certificate');
  assert.equal(saved.original_filename,'birth-certificate.pdf');
  const insert=clients[0].statements.find(item=>item.statement.startsWith('INSERT INTO student_documents'));
  assert.ok(Buffer.isBuffer(insert.params[11]));
  assert.notDeepEqual(insert.params[11],pdf);
  assert.equal(insert.params[9],'RESTRICTED');
  const download=await fetch(`${url}/api/operations/students/${studentId}/documents/${saved.id}/content`);
  assert.equal(download.status,200);
  assert.equal(download.headers.get('content-type'),'application/pdf');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf);
  assert.ok(clients[0].statements.some(item=>item.statement.startsWith('INSERT INTO audit_events')));
  assert.equal(clients[0].statements.at(-1).statement,'COMMIT');
}));

test('document upload is denied without restricted student-data permission',async t=>withEncryptionKey(async()=>{
  FakeClient.documents.clear();
  const {url,clients}=await startServer(t,{permissions:['students.write','students.read']});
  const response=await fetch(`${url}/api/operations/students/${studentId}/documents?title=Record&fileName=record.pdf`,{method:'POST',headers:{...csrf,'Content-Type':'application/pdf'},body:pdf});
  assert.equal(response.status,403);
  assert.equal(clients[0].statements.some(item=>item.statement.startsWith('INSERT INTO student_documents')),false);
}));

test('document upload rejects non-PDF content before writing',async t=>withEncryptionKey(async()=>{
  FakeClient.documents.clear();
  const {url,clients}=await startServer(t);
  const response=await fetch(`${url}/api/operations/students/${studentId}/documents?title=Record&fileName=record.pdf`,{method:'POST',headers:{...csrf,'Content-Type':'application/pdf'},body:Buffer.from('not a pdf file')});
  assert.equal(response.status,400);
  assert.equal(clients[0].statements.some(item=>item.statement.startsWith('INSERT INTO student_documents')),false);
}));

test('document upload stays unavailable until migration 015 has added encrypted-content columns',async t=>withEncryptionKey(async()=>{
  FakeClient.documents.clear();
  const {url,clients}=await startServer(t,{schemaReady:false});
  const response=await fetch(`${url}/api/operations/students/${studentId}/documents?title=Record&fileName=record.pdf`,{method:'POST',headers:{...csrf,'Content-Type':'application/pdf'},body:pdf});
  assert.equal(response.status,503);
  assert.equal(clients[0].statements.some(item=>item.statement.startsWith('INSERT INTO student_documents')),false);
}));

test('document upload stays unavailable until a 32-byte encryption key is configured',async t=>{
  FakeClient.documents.clear();
  const previous=process.env.STUDENT_DOCUMENT_ENCRYPTION_KEY;delete process.env.STUDENT_DOCUMENT_ENCRYPTION_KEY;
  try{const {url,clients}=await startServer(t);const response=await fetch(`${url}/api/operations/students/${studentId}/documents?title=Record&fileName=record.pdf`,{method:'POST',headers:{...csrf,'Content-Type':'application/pdf'},body:pdf});assert.equal(response.status,503);assert.equal(clients[0].statements.some(item=>item.statement.startsWith('INSERT INTO student_documents')),false);}finally{if(previous!==undefined)process.env.STUDENT_DOCUMENT_ENCRYPTION_KEY=previous;}
});

test('tampered encrypted content fails authentication and is never returned',async t=>withEncryptionKey(async()=>{
  FakeClient.documents.clear();
  const {url}=await startServer(t);
  const query=new URLSearchParams({title:'Birth certificate',categoryId,fileName:'birth-certificate.pdf'});
  const upload=await fetch(`${url}/api/operations/students/${studentId}/documents?${query}`,{method:'POST',headers:{...csrf,'Content-Type':'application/pdf'},body:pdf});
  const saved=(await upload.json()).document;
  FakeClient.documents.get(saved.id).file_content[0]^=255;
  const download=await fetch(`${url}/api/operations/students/${studentId}/documents/${saved.id}/content`);
  assert.equal(download.status,500);
  assert.match((await download.json()).error,/could not be completed/i);
}));

test('document removal is a permission-checked audited soft delete',async t=>withEncryptionKey(async()=>{
  FakeClient.documents.clear();
  const {url,clients}=await startServer(t);
  const query=new URLSearchParams({title:'Birth certificate',categoryId,fileName:'birth-certificate.pdf'});
  const upload=await fetch(`${url}/api/operations/students/${studentId}/documents?${query}`,{method:'POST',headers:{...csrf,'Content-Type':'application/pdf'},body:pdf});
  const saved=(await upload.json()).document;
  const response=await fetch(`${url}/api/operations/students/${studentId}/documents/${saved.id}/delete`,{method:'POST',headers:{...csrf,'Content-Type':'application/json'},body:'{}'});
  assert.equal(response.status,200);
  assert.equal((await response.json()).deleted,true);
  assert.ok(clients[1].statements.some(item=>item.statement.startsWith('UPDATE student_documents SET deleted_at=now()')));
  assert.ok(clients[1].statements.some(item=>item.statement.startsWith('INSERT INTO audit_events')));
}));
