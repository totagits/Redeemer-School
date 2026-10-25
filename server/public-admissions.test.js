import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createPublicAdmissionsRouter, resetPublicAdmissionsRateLimitForTests } from './publicAdmissions.js';

const schoolId = 'b210b463-c02c-4be9-9003-8a9005e8dbe5';

class FakeClient {
  constructor() { this.calls = []; this.released = false; }
  async query(sql, params = []) {
    const statement = sql.replace(/\s+/g,' ').trim(); this.calls.push({ statement, params });
    if (['BEGIN','COMMIT','ROLLBACK'].includes(statement)) return { rows: [], rowCount: 0 };
    if (statement.startsWith('SELECT app.resolve_school_id_by_code')) return { rows: [{ id: params[0] === 'RIA' ? schoolId : null }], rowCount: params[0] === 'RIA' ? 1 : 0 };
    if (statement.startsWith("SELECT set_config('app.current_school_id'")) return { rows: [], rowCount: 1 };
    if (statement.startsWith('SELECT name FROM schools')) return { rows: [{ name: 'Redeemer International Academy' }], rowCount: 1 };
    if (statement.startsWith('SELECT id,code,name FROM education_levels')) return { rows: [{ id: 'level-1', code: 'PRIMARY', name: 'Primary School' }], rowCount: 1 };
    if (statement.startsWith('SELECT cg.id,cg.name,cg.grade_level')) return { rows: [{ id: 'class-1', name: 'Grade 4 A', grade_level: 'Grade 4' }], rowCount: 1 };
    if (statement.startsWith('INSERT INTO admission_applications')) return { rows: [{ id: params[0], application_number: params[2] }], rowCount: 1 };
    if (statement.startsWith('INSERT INTO admission_guardians') || statement.startsWith('INSERT INTO admission_events') || statement.startsWith('INSERT INTO audit_events')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected public admissions query: ${statement}`);
  }
  release() { this.released = true; }
}

async function start(t) {
  const clients = []; const pool = { async connect() { const client = new FakeClient(); clients.push(client); return client; } };
  const app = express(); app.use(express.json()); app.use('/api/public/admissions', createPublicAdmissionsRouter({ pool }));
  const server = createServer(app).listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return { url:`http://127.0.0.1:${server.address().port}`,clients };
}

const validApplication = {
  schoolCode:'RIA',firstName:'Fictional',middleName:'',lastName:'Applicant',dateOfBirth:'2015-05-04',sex:'F',
  guardianFirstName:'Test',guardianLastName:'Parent',relationship:'Parent',email:'parent@example.test',phone:'0771234567',
  requestedLevelId:'level-1',requestedClassGroupId:'class-1',notes:'Fictional test applicant',consent:true,
};

test('public admissions options expose only configured school levels and active-year classes', async t => {
  const {url,clients}=await start(t); const response=await fetch(`${url}/api/public/admissions/options?schoolCode=RIA`); const result=await response.json();
  assert.equal(response.status,200); assert.equal(result.schoolName,'Redeemer International Academy'); assert.equal(result.levels[0].id,'level-1'); assert.equal(result.classes[0].id,'class-1');
  assert.ok(clients[0].calls.some(call=>call.statement.includes("set_config('app.current_school_id'"))); assert.equal(clients[0].released,true);
});

test('public application saves applicant and guardian atomically with an anonymous source and reference number', async t => {
  resetPublicAdmissionsRateLimitForTests(); const {url,clients}=await start(t);
  const response=await fetch(`${url}/api/public/admissions/apply`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(validApplication)}); const result=await response.json();
  assert.equal(response.status,201); assert.match(result.applicationNumber,/^RIA-\d{4}-[A-F0-9]{8}$/);
  const client=clients[0]; assert.ok(client.calls.some(call=>call.statement==='COMMIT'));
  const application=client.calls.find(call=>call.statement.startsWith('INSERT INTO admission_applications'));
  assert.match(application.statement, /application_source\).*'PUBLIC'/); assert.equal(application.params[9],'level-1'); assert.equal(application.params[10],'class-1');
  const event=client.calls.find(call=>call.statement.startsWith('INSERT INTO admission_events'));
  assert.match(event.statement,/VALUES \(\$1,\$2,'APPLICATION_RECEIVED',NULL,\$3::jsonb\)/); assert.match(event.params[2],/PUBLIC_WEB/);
  assert.ok(client.calls.some(call=>call.statement.startsWith('INSERT INTO admission_guardians')));
  assert.ok(client.calls.some(call=>call.statement.startsWith('INSERT INTO audit_events'))); assert.equal(client.released,true);
});

test('public application validates guardian contact and explicit privacy consent before database writes', async t => {
  resetPublicAdmissionsRateLimitForTests(); const {url,clients}=await start(t);
  const response=await fetch(`${url}/api/public/admissions/apply`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...validApplication,email:'not-an-email',phone:'',consent:false})});
  assert.equal(response.status,400); assert.equal(clients.length,0);
});

test('public application honeypot absorbs automated submissions without creating a record', async t => {
  resetPublicAdmissionsRateLimitForTests(); const {url,clients}=await start(t);
  const response=await fetch(`${url}/api/public/admissions/apply`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...validApplication,website:'spam.example'})});
  assert.equal(response.status,202); assert.deepEqual(await response.json(),{accepted:true}); assert.equal(clients.length,0);
});

test('public application intake rate limits repeated submissions from one address', async t => {
  resetPublicAdmissionsRateLimitForTests(); const {url}=await start(t); let response;
  for(let i=0;i<7;i++) response=await fetch(`${url}/api/public/admissions/apply`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(validApplication)});
  assert.equal(response.status,429);
});
