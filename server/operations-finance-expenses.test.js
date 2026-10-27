import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId='b210b463-c02c-4be9-9003-8a9005e8dbe5';
const userId='721ddf68-1c98-4faa-9dc7-9161daa79870';
const expenseId='c8fdb6b5-7f8a-4b9d-a919-4e2f4f1ec048';

class FakeClient {
  constructor({expense=null,expenses=[]}={}){this.expense=expense;this.expenses=expenses;this.statements=[];}
  async query(sql,params=[]){const normalized=sql.replace(/\s+/g,' ').trim();this.statements.push({sql:normalized,params});
    if(['BEGIN','COMMIT','ROLLBACK'].includes(normalized))return {rows:[],rowCount:0};
    if(normalized.startsWith('INSERT INTO finance_expenses'))return {rows:[{id:expenseId,expense_number:'EXP-TEST',status:'SUBMITTED',currency:params[5],amount:params[6]}],rowCount:1};
    if(normalized.startsWith('SELECT e.id,e.expense_number'))return {rows:this.expenses,rowCount:this.expenses.length};
    if(normalized.startsWith('UPDATE finance_expenses'))return this.expense?{rows:[{id:expenseId,expense_number:'EXP-TEST',status:params[3]||'PAID',currency:'LRD',amount:'500.00'}],rowCount:1}:{rows:[],rowCount:0};
    if(normalized.startsWith('INSERT INTO audit_events'))return {rows:[{id:'audit-id'}],rowCount:1};
    throw new Error(`Unexpected query in expense workflow test: ${normalized}`);
  }
  release(){}
}

async function startServer(t,account,options={}){const clients=[];const app=express();app.use(express.json());app.use('/api/operations',createOperationsRouter({authenticate(req,_res,next){const client=new FakeClient(options);clients.push(client);req.auth={account,claims:{schoolId,userId:account.id,csrfToken:'csrf-test-token'},client};next();}}));const server=createServer(app).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));return{url:`http://127.0.0.1:${server.address().port}`,clients};}

const headers={'Content-Type':'application/json','X-CSRF-Token':'csrf-test-token'};
const request={category:'Utilities',description:'Monthly generator fuel',vendor:'Test Supplier',currency:'LRD',amount:500,incurredOn:'2026-10-26'};

test('finance staff can submit a school expense request for approval',async t=>{
  const {url,clients}=await startServer(t,{id:userId,roles:['FINANCE'],permissions:['finance.write']});
  const response=await fetch(`${url}/api/operations/finance/expenses`,{method:'POST',headers,body:JSON.stringify(request)});
  assert.equal(response.status,201);assert.equal((await response.json()).expense.status,'SUBMITTED');
  assert.ok(clients[0].statements.some(item=>item.sql.startsWith('INSERT INTO finance_expenses')));
  assert.ok(clients[0].statements.some(item=>item.sql.startsWith('INSERT INTO audit_events')));
  assert.equal(clients[0].statements.at(-1).sql,'COMMIT');
});

test('expense approval requires the designated approval permission',async t=>{
  const {url,clients}=await startServer(t,{id:userId,roles:['FINANCE'],permissions:['finance.write']},{expense:{id:expenseId}});
  const response=await fetch(`${url}/api/operations/finance/expenses/${expenseId}/decision`,{method:'POST',headers,body:JSON.stringify({decision:'APPROVED'})});
  assert.equal(response.status,403);assert.equal(clients[0].statements.some(item=>item.sql.startsWith('UPDATE finance_expenses')),false);
});

test('an authorized principal can approve an expense and save an audit event',async t=>{
  const {url,clients}=await startServer(t,{id:userId,roles:['PRINCIPAL'],permissions:['finance.expenses.approve']},{expense:{id:expenseId}});
  const response=await fetch(`${url}/api/operations/finance/expenses/${expenseId}/decision`,{method:'POST',headers,body:JSON.stringify({decision:'APPROVED',note:''})});
  assert.equal(response.status,200);assert.equal((await response.json()).expense.status,'APPROVED');
  assert.ok(clients[0].statements.some(item=>item.sql.startsWith('UPDATE finance_expenses')));
  assert.ok(clients[0].statements.some(item=>item.sql.startsWith('INSERT INTO audit_events')));
});

test('principal can read expense requests in the approval-only workspace',async t=>{
  const pending={id:expenseId,expense_number:'EXP-TEST',status:'SUBMITTED',amount:'500.00',currency:'LRD',description:'Fictional test expense',category:'Utilities'};
  const {url,clients}=await startServer(t,{id:userId,roles:['PRINCIPAL'],permissions:['finance.expenses.approve']},{expenses:[pending]});
  const response=await fetch(`${url}/api/operations/finance/expense-approvals`);
  assert.equal(response.status,200);assert.deepEqual((await response.json()).expenses,[pending]);
  assert.ok(clients[0].statements.some(item=>item.sql.startsWith('SELECT e.id,e.expense_number')));
});

test('finance staff cannot read the principal expense-approval workspace',async t=>{
  const {url,clients}=await startServer(t,{id:userId,roles:['FINANCE'],permissions:['finance.read','finance.write']});
  const response=await fetch(`${url}/api/operations/finance/expense-approvals`);
  assert.equal(response.status,403);assert.equal(clients[0].statements.some(item=>item.sql.startsWith('SELECT e.id,e.expense_number')),false);
});

test('expense payment cannot be recorded before approval',async t=>{
  const {url,clients}=await startServer(t,{id:userId,roles:['FINANCE'],permissions:['finance.write']});
  const response=await fetch(`${url}/api/operations/finance/expenses/${expenseId}/pay`,{method:'POST',headers,body:JSON.stringify({channel:'BANK',reference:'BANK-1'})});
  assert.equal(response.status,409);assert.equal(clients[0].statements.some(item=>item.sql.startsWith('INSERT INTO audit_events')),false);
});
