import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId = 'b210b463-c02c-4be9-9003-8a9005e8dbe5';
const userId = '721ddf68-1c98-4faa-9dc7-9161daa79870';
const invoiceId = '32f8f4d3-5d2a-4f36-bd4e-fc0f38a44f07';

class FakeClient {
  constructor({ invoice = null, voidInvoice = null } = {}) { this.invoice=invoice; this.voidInvoice=voidInvoice; this.statements=[]; }
  async query(sql, params=[]) {
    const normalized=sql.replace(/\s+/g,' ').trim(); this.statements.push({sql:normalized,params});
    if(['BEGIN','COMMIT','ROLLBACK'].includes(normalized)) return {rows:[],rowCount:0};
    if(normalized.includes('FROM fee_invoices fi') && normalized.endsWith('FOR UPDATE')) return this.voidInvoice ? {rows:[this.voidInvoice],rowCount:1}:{rows:[],rowCount:0};
    if(normalized.includes('FROM fee_invoices fi') && normalized.includes('FOR UPDATE OF fi')) return this.invoice ? {rows:[this.invoice],rowCount:1}:{rows:[],rowCount:0};
    if(normalized.startsWith('INSERT INTO payments')) return {rows:[{id:'payment-id',receipt_number:params[6],amount:params[3],currency:params[2],channel:params[4],status:'SUCCEEDED',received_at:'2026-10-22T00:00:00.000Z'}],rowCount:1};
    if(normalized.startsWith('INSERT INTO payment_allocations') || normalized.startsWith('UPDATE fee_invoices') || normalized.startsWith('INSERT INTO audit_events')) return {rows:[{id:'event-id'}],rowCount:1};
    throw new Error(`Unexpected query in finance workflow test: ${normalized}`);
  }
  release() {}
}

async function startServer(t, account, options={}) {
  const clients=[]; const app=express(); app.use(express.json());
  app.use('/api/operations',createOperationsRouter({authenticate(req,_res,next){const client=new FakeClient(options);clients.push(client);req.auth={account,claims:{schoolId,userId:account.id,csrfToken:'csrf-test-token'},client};next();}}));
  const server=createServer(app).listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return {url:`http://127.0.0.1:${server.address().port}`,clients};
}

const headers={'Content-Type':'application/json','X-CSRF-Token':'csrf-test-token'};
const invoicePayment={invoiceId,channel:'CASH',amount:40,payerReference:'window receipt',note:''};

test('payment capture requires finance.write',async t=>{
  const {url,clients}=await startServer(t,{id:userId,roles:['FINANCE'],permissions:['finance.read']},{invoice:{id:invoiceId,student_id:'student-id',currency:'USD',invoice_number:'INV-1',status:'ISSUED',total:'100.00',paid:'0.00'}});
  const response=await fetch(`${url}/api/operations/finance/payments`,{method:'POST',headers,body:JSON.stringify(invoicePayment)});
  assert.equal(response.status,403);
  assert.equal(clients[0].statements.some(item=>item.sql.startsWith('INSERT INTO payments')),false);
});

test('payment capture rejects an amount above the locked invoice balance',async t=>{
  const {url,clients}=await startServer(t,{id:userId,roles:['FINANCE'],permissions:['finance.read','finance.write']},{invoice:{id:invoiceId,student_id:'student-id',currency:'USD',invoice_number:'INV-1',status:'PARTIALLY_PAID',total:'100.00',paid:'30.00'}});
  const response=await fetch(`${url}/api/operations/finance/payments`,{method:'POST',headers,body:JSON.stringify({...invoicePayment,amount:70.01})});
  assert.equal(response.status,400);
  assert.match((await response.json()).error,/greater than the remaining/i);
  assert.equal(clients[0].statements.some(item=>item.sql.startsWith('INSERT INTO payments')),false);
  assert.equal(clients[0].statements.at(-1).sql,'ROLLBACK');
});

test('unverified MTN MoMo transfers cannot be marked as collected',async t=>{
  const {url,clients}=await startServer(t,{id:userId,roles:['FINANCE'],permissions:['finance.write']});
  const response=await fetch(`${url}/api/operations/finance/payments`,{method:'POST',headers,body:JSON.stringify({...invoicePayment,channel:'MTN_MOMO'})});
  assert.equal(response.status,400);
  assert.match((await response.json()).error,/MTN MoMo is not enabled/i);
  assert.equal(clients[0].statements.some(item=>item.sql.startsWith('INSERT INTO payments')),false);
});

test('a valid partial payment creates a receipt and commits an audit entry',async t=>{
  const {url,clients}=await startServer(t,{id:userId,roles:['FINANCE'],permissions:['finance.write']},{invoice:{id:invoiceId,student_id:'student-id',currency:'LRD',invoice_number:'INV-2',status:'ISSUED',total:'1000.00',paid:'0.00'}});
  const response=await fetch(`${url}/api/operations/finance/payments`,{method:'POST',headers,body:JSON.stringify({...invoicePayment,amount:250,channel:'BANK'})});
  assert.equal(response.status,201);
  const result=await response.json();
  assert.equal(result.invoiceStatus,'PARTIALLY_PAID');
  assert.equal(result.payment.status,'SUCCEEDED');
  assert.ok(clients[0].statements.some(item=>item.sql.startsWith('INSERT INTO payment_allocations')));
  assert.ok(clients[0].statements.some(item=>item.sql.startsWith('INSERT INTO audit_events')));
  assert.equal(clients[0].statements.at(-1).sql,'COMMIT');
});

test('an unpaid invoice can be voided with a reason and audit trail',async t=>{
  const {url,clients}=await startServer(t,{id:userId,roles:['FINANCE'],permissions:['finance.write']},{voidInvoice:{id:invoiceId,invoice_number:'INV-VOID',status:'ISSUED',allocated:'0'}});
  const response=await fetch(`${url}/api/operations/finance/invoices/${invoiceId}/void`,{method:'POST',headers,body:JSON.stringify({reason:'Duplicate invoice'})});
  assert.equal(response.status,200);
  assert.equal((await response.json()).status,'VOID');
  assert.ok(clients[0].statements.some(item=>item.sql.startsWith('UPDATE fee_invoices SET status=\'VOID\'')));
  assert.ok(clients[0].statements.some(item=>item.sql.startsWith('INSERT INTO audit_events')));
  assert.equal(clients[0].statements.at(-1).sql,'COMMIT');
});

test('an invoice with any payment allocation cannot be voided',async t=>{
  const {url,clients}=await startServer(t,{id:userId,roles:['FINANCE'],permissions:['finance.write']},{voidInvoice:{id:invoiceId,invoice_number:'INV-PAID',status:'PARTIALLY_PAID',allocated:'25'}});
  const response=await fetch(`${url}/api/operations/finance/invoices/${invoiceId}/void`,{method:'POST',headers,body:JSON.stringify({reason:'Duplicate invoice'})});
  assert.equal(response.status,409);
  assert.equal(clients[0].statements.some(item=>item.sql.startsWith('UPDATE fee_invoices SET status=\'VOID\'')),false);
});
