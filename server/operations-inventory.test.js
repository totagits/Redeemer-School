import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId='b210b463-c02c-4be9-9003-8a9005e8dbe5';
const userId='721ddf68-1c98-4faa-9dc7-9161daa79870';
const itemId='32f8f4d3-5d2a-4f36-bd4e-fc0f38a44f07';
const locationId='9b4cc7af-8da2-40a4-9d7d-2db6b12a9661';
const requestId='e1eae2d6-78ba-42e4-baa8-adbe15951ee2';
const orderId='5c98d2dc-4aa3-408e-988c-1fb42b1f4d28';

class FakeClient {
  constructor(mode='request') { this.mode=mode; this.statements=[]; }
  async query(sql,params=[]) {
    const q=sql.replace(/\s+/g,' ').trim(); this.statements.push({sql:q,params});
    if(['BEGIN','COMMIT','ROLLBACK'].includes(q)) return {rows:[],rowCount:0};
    if(q.startsWith('INSERT INTO procurement_requests')) return {rows:[{id:requestId,request_number:params[1],status:'SUBMITTED'}],rowCount:1};
    if(q.startsWith('INSERT INTO procurement_request_lines')) return {rows:[{id:'line-id'}],rowCount:1};
    if(q.startsWith('SELECT id,request_number,status FROM procurement_requests')) return {rows:[{id:requestId,request_number:'PR-TEST',status:this.mode==='unapproved'?'SUBMITTED':'APPROVED'}],rowCount:1};
    if(q.startsWith('UPDATE procurement_requests SET status=')) return {rows:[{id:requestId,request_number:'PR-TEST',status:params[2],decision_reason:params[4]}],rowCount:1};
    if(q.startsWith('SELECT item_id,quantity FROM procurement_request_lines')) return {rows:[{item_id:itemId,quantity:'10.00'}],rowCount:1};
    if(q.startsWith('INSERT INTO purchase_orders')) return {rows:[{id:orderId,purchase_order_number:params[1],status:'SUBMITTED'}],rowCount:1};
    if(q.startsWith('INSERT INTO purchase_order_lines')) return {rows:[{id:'po-line'}],rowCount:1};
    if(q.startsWith('SELECT id,purchase_order_number,status FROM purchase_orders')) return {rows:[{id:orderId,purchase_order_number:'PO-TEST',status:'APPROVED'}],rowCount:1};
    if(q.startsWith('SELECT l.item_id,l.quantity,l.received_quantity')) return {rows:[{item_id:itemId,quantity:'10.00',received_quantity:'0.00',name:'Exercise books'}],rowCount:1};
    if(q.startsWith('SELECT id FROM inventory_locations')) return {rows:[{id:locationId}],rowCount:1};
    if(q.startsWith('INSERT INTO stock_movements')) return {rows:[{id:'movement-id'}],rowCount:1};
    if(q.startsWith('UPDATE purchase_order_lines')) return {rows:[],rowCount:1};
    if(q.startsWith('SELECT count(*) AS line_count')) return {rows:[{line_count:'1',complete_count:this.mode==='receive-complete'?'1':'0',started_count:'1'}],rowCount:1};
    if(q.startsWith('UPDATE purchase_orders SET status=\'APPROVED\'')) return {rows:[{id:orderId,purchase_order_number:'PO-TEST',status:'APPROVED',ordered_at:'2026-10-23T00:00:00Z'}],rowCount:1};
    if(q.startsWith('UPDATE purchase_orders SET status=')) return {rows:[],rowCount:1};
    if(q.startsWith('UPDATE procurement_requests SET status=\'ORDERED\'')) return {rows:[],rowCount:1};
    if(q.startsWith('INSERT INTO audit_events')) return {rows:[{id:'audit-id'}],rowCount:1};
    throw new Error(`Unexpected inventory query: ${q}`);
  }
  release() {}
}

async function startServer(t, permissions, mode='request') {
  const clients=[]; const app=express(); app.use(express.json());
  app.use('/api/operations',createOperationsRouter({authenticate(req,_res,next){const client=new FakeClient(mode);clients.push(client);req.auth={account:{id:userId,roles:['SCHOOL_ADMIN'],permissions},claims:{schoolId,userId,csrfToken:'csrf-test-token'},client};next();}}));
  const server=createServer(app).listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return {url:`http://127.0.0.1:${server.address().port}`,clients};
}

const headers={'Content-Type':'application/json','X-CSRF-Token':'csrf-test-token'};

test('inventory request creation requires inventory.write',async t=>{
  const {url,clients}=await startServer(t,['inventory.read']);
  const response=await fetch(`${url}/api/operations/inventory/requests`,{method:'POST',headers,body:JSON.stringify({justification:'Books for Grade 4',lines:[{itemId,quantity:10}]})});
  assert.equal(response.status,403);
  assert.equal(clients[0].statements.some(({sql})=>sql.startsWith('INSERT INTO procurement_requests')),false);
});

test('inventory request is saved with item lines and audit in one transaction',async t=>{
  const {url,clients}=await startServer(t,['inventory.write']);
  const response=await fetch(`${url}/api/operations/inventory/requests`,{method:'POST',headers,body:JSON.stringify({justification:'Books for Grade 4',currency:'LRD',lines:[{itemId,quantity:10,estimatedUnitCost:25}]})});
  assert.equal(response.status,201);
  assert.equal((await response.json()).request.status,'SUBMITTED');
  assert.ok(clients[0].statements.some(({sql})=>sql.startsWith('INSERT INTO procurement_request_lines')));
  assert.ok(clients[0].statements.some(({sql})=>sql.startsWith('INSERT INTO audit_events')));
  assert.equal(clients[0].statements.at(-1).sql,'COMMIT');
});

test('request decisions require inventory.approve',async t=>{
  const {url,clients}=await startServer(t,['inventory.write']);
  const response=await fetch(`${url}/api/operations/inventory/requests/${requestId}/decision`,{method:'POST',headers,body:JSON.stringify({decision:'APPROVE'})});
  assert.equal(response.status,403);
  assert.equal(clients[0].statements.some(({sql})=>sql.startsWith('UPDATE procurement_requests SET status=')),false);
});

test('purchase order cannot be created from an unapproved request',async t=>{
  const {url,clients}=await startServer(t,['inventory.write'],'unapproved');
  const response=await fetch(`${url}/api/operations/inventory/orders`,{method:'POST',headers,body:JSON.stringify({requestId,vendorName:'School Supplies Ltd',currency:'LRD',lines:[{itemId,quantity:10,unitPrice:25}]})});
  assert.equal(response.status,409);
  assert.equal(clients[0].statements.some(({sql})=>sql.startsWith('INSERT INTO purchase_orders')),false);
});

test('approved requisition creates a purchase order without changing stock',async t=>{
  const {url,clients}=await startServer(t,['inventory.write']);
  const response=await fetch(`${url}/api/operations/inventory/orders`,{method:'POST',headers,body:JSON.stringify({requestId,vendorName:'School Supplies Ltd',currency:'LRD',lines:[{itemId,quantity:10,unitPrice:25}]})});
  assert.equal(response.status,201);
  assert.equal((await response.json()).order.status,'SUBMITTED');
  assert.ok(clients[0].statements.some(({sql})=>sql.startsWith('INSERT INTO purchase_order_lines')));
  assert.equal(clients[0].statements.some(({sql})=>sql.startsWith('INSERT INTO stock_movements')),false);
  assert.equal(clients[0].statements.at(-1).sql,'COMMIT');
});

test('purchase order approval requires inventory.approve and records approval',async t=>{
  const {url,clients}=await startServer(t,['inventory.approve']);
  const response=await fetch(`${url}/api/operations/inventory/orders/${orderId}/approve`,{method:'POST',headers,body:JSON.stringify({})});
  assert.equal(response.status,200);
  assert.equal((await response.json()).order.status,'APPROVED');
  assert.ok(clients[0].statements.some(({sql})=>sql.startsWith('UPDATE procurement_requests SET status=\'ORDERED\'')));
  assert.ok(clients[0].statements.some(({sql})=>sql.startsWith('INSERT INTO audit_events')));
  assert.equal(clients[0].statements.at(-1).sql,'COMMIT');
});

test('approved purchase order receiving posts stock and audit atomically',async t=>{
  const {url,clients}=await startServer(t,['inventory.write'],'receive-complete');
  const response=await fetch(`${url}/api/operations/inventory/orders/${orderId}/receive`,{method:'POST',headers,body:JSON.stringify({lines:[{itemId,locationId,quantity:10}]})});
  assert.equal(response.status,200);
  assert.equal((await response.json()).status,'RECEIVED');
  assert.ok(clients[0].statements.some(({sql})=>sql.startsWith('INSERT INTO stock_movements')));
  assert.ok(clients[0].statements.some(({sql})=>sql.startsWith('UPDATE purchase_order_lines')));
  assert.ok(clients[0].statements.some(({sql})=>sql.startsWith('INSERT INTO audit_events')));
  assert.equal(clients[0].statements.at(-1).sql,'COMMIT');
});
