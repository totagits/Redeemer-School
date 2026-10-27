import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId='b210b463-c02c-4be9-9003-8a9005e8dbe5';
const userId='721ddf68-1c98-4faa-9dc7-9161daa79870';
const scheduleId='4cdb7a65-215d-4e30-9a7a-c9237218c8d0';

class FakeClient {
  constructor(state){this.statements=[];this.state=state;}
  async query(sql,params=[]){const normalized=sql.replace(/\s+/g,' ').trim();this.statements.push({sql:normalized,params});
    if(['BEGIN','COMMIT','ROLLBACK'].includes(normalized))return {rows:[],rowCount:0};
    if(normalized.startsWith('SELECT id,name,currency,academic_year_id,grade_level_id FROM fee_schedules'))return {rows:[{id:scheduleId,name:'Grade 4 schedule',currency:'LRD',academic_year_id:'year-1',grade_level_id:'grade-4'}],rowCount:1};
    if(normalized.startsWith('SELECT count(*)::int AS line_count'))return {rows:[{line_count:1}],rowCount:1};
    if(normalized.startsWith('SELECT count(DISTINCT ce.student_id)::int AS count')){
      if(this.state.legacyGradeOnly&&(!normalized.includes('cg.grade_level_id IS NULL')||!normalized.includes('lower(btrim(cg.name))=lower(btrim(fee_grade.name))')))return {rows:[{count:0}],rowCount:1};
      return {rows:[{count:2}],rowCount:1};
    }
    if(normalized.startsWith('WITH enrolled AS MATERIALIZED')){
      if(this.state.legacyGradeOnly&&(!normalized.includes('cg.grade_level_id IS NULL')||!normalized.includes('lower(btrim(cg.name))=lower(btrim(fee_grade.name))')))throw new Error('Invoice selection omitted the legacy class-name match.');
      const count=this.state.created;this.state.created=0;return {rows:[{invoice_count:count}],rowCount:1};
    }}
    if(normalized.startsWith('INSERT INTO audit_events'))return {rows:[{id:'audit-id'}],rowCount:1};
    throw new Error(`Unexpected query in fee schedule test: ${normalized}`);
  }
  release(){}
}

async function startServer(t,permissions=['finance.write'],options={}){const clients=[];const state={created:2,legacyGradeOnly:Boolean(options.legacyGradeOnly)};const app=express();app.use(express.json());app.use('/api/operations',createOperationsRouter({authenticate(req,_res,next){const client=new FakeClient(state);clients.push(client);req.auth={account:{id:userId,roles:['FINANCE'],permissions},claims:{schoolId,userId,csrfToken:'csrf-test-token'},client};next();}}));const server=createServer(app).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));return{url:`http://127.0.0.1:${server.address().port}`,clients};}

const headers={'Content-Type':'application/json','X-CSRF-Token':'csrf-test-token'};

test('fee schedule installment issuance is idempotent and audited',async t=>{
  const {url,clients}=await startServer(t);
  const first=await fetch(`${url}/api/operations/finance/fee-schedules/${scheduleId}/issue-installment`,{method:'POST',headers,body:JSON.stringify({installmentNo:1})});
  assert.equal(first.status,200);const firstBody=await first.json();assert.equal(firstBody.targetLearners,2);assert.equal(firstBody.invoicesCreated,2);assert.equal(firstBody.alreadyIssued,0);
  const second=await fetch(`${url}/api/operations/finance/fee-schedules/${scheduleId}/issue-installment`,{method:'POST',headers,body:JSON.stringify({installmentNo:1})});
  assert.equal(second.status,200);const secondBody=await second.json();assert.equal(secondBody.invoicesCreated,0);assert.equal(secondBody.alreadyIssued,2);
  assert.equal(clients.flatMap(client=>client.statements).filter(item=>item.sql.startsWith('WITH enrolled AS MATERIALIZED')).length,2);
  assert.equal(clients.flatMap(client=>client.statements).filter(item=>item.sql.startsWith('INSERT INTO audit_events')).length,2);
  assert.equal(clients.at(-1).statements.at(-1).sql,'COMMIT');
});

test('installment issuance includes enrolled learners in a legacy class whose exact class name matches the unique grade',async t=>{
  const {url,clients}=await startServer(t,['finance.write'],{legacyGradeOnly:true});
  const response=await fetch(`${url}/api/operations/finance/fee-schedules/${scheduleId}/issue-installment`,{method:'POST',headers,body:JSON.stringify({installmentNo:1})});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.targetLearners,2);
  assert.equal(body.invoicesCreated,2);
  const statements=clients.flatMap(client=>client.statements).map(item=>item.sql);
  assert.ok(statements.some(sql=>sql.startsWith('SELECT count(DISTINCT ce.student_id)::int AS count')&&sql.includes('lower(btrim(cg.name))=lower(btrim(fee_grade.name))')));
  assert.ok(statements.some(sql=>sql.startsWith('WITH enrolled AS MATERIALIZED')&&sql.includes('lower(btrim(cg.name))=lower(btrim(fee_grade.name))')));
});

test('non-finance roles cannot bulk issue fee invoices',async t=>{
  const {url,clients}=await startServer(t,['finance.read']);
  const response=await fetch(`${url}/api/operations/finance/fee-schedules/${scheduleId}/issue-installment`,{method:'POST',headers,body:JSON.stringify({installmentNo:1})});
  assert.equal(response.status,403);
  assert.equal(clients[0].statements.some(item=>item.sql.startsWith('WITH enrolled AS MATERIALIZED')),false);
});

test('fee schedule issuance requires a valid installment number',async t=>{
  const {url,clients}=await startServer(t);
  const response=await fetch(`${url}/api/operations/finance/fee-schedules/${scheduleId}/issue-installment`,{method:'POST',headers,body:JSON.stringify({installmentNo:0})});
  assert.equal(response.status,400);
  assert.equal(clients[0].statements.some(item=>item.sql.startsWith('SELECT id,name,currency,academic_year_id,grade_level_id')),false);
});
