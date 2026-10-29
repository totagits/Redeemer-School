import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createOperationsRouter} from './operations.js';
const schoolId='b210b463-c02c-4be9-9003-8a9005e8dbe5';
const userId='721ddf68-1c98-4faa-9dc7-9161daa79870';
async function start(t,role='PARENT'){
  const statements=[];
  const client={async query(sql,params=[]){
    const q=sql.replace(/\s+/g,' ').trim();statements.push({q,params});
    if(['BEGIN','COMMIT','ROLLBACK'].includes(q))return {rows:[],rowCount:0};
    if(q.includes('FROM portal_notifications WHERE school_id=$1 AND user_id=$2')){
      assert.deepEqual(params,[schoolId,userId]);
      return {rows:[{id:'unread-1',kind:'ANNOUNCEMENT',title:'New notice',body:'Test',read_at:null,created_at:'2026-10-29T02:00:00Z'}, {id:'read-1',kind:'ANNOUNCEMENT',title:'Older',body:'Old',read_at:'2026-10-28T02:00:00Z',created_at:'2026-10-28T01:00:00Z'}],rowCount:2};
    }
    throw new Error('Unexpected query: '+q);
  },release(){}};
  const app=express();app.use('/api/operations',createOperationsRouter({authenticate(req,_res,next){
    req.auth={account:{id:userId,roles:[role],permissions:['portal.notifications.read']},claims:{schoolId,userId,csrfToken:'csrf-token'},client};next();
  }}));
  const server=createServer(app).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return {base:'http://127.0.0.1:'+server.address().port,statements};
}
test('parent unread count excludes already-read notifications and scopes to signed-in account',async t=>{
  const {base}=await start(t);const response=await fetch(base+'/api/operations/portal/notifications/unread');
  assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.unreadCount,1);assert.equal(result.notifications.length,2);
});
test('staff cannot obtain the student and guardian unread feed',async t=>{
  const {base,statements}=await start(t,'SCHOOL_ADMIN');
  const response=await fetch(base+'/api/operations/portal/notifications/unread');
  assert.equal(response.status,403);assert.equal(statements.some(x=>x.q.includes('portal_notifications')),false);
});
test('student and guardian MoMo readiness does not initiate or imply a provider charge',async t=>{
  const {base,statements}=await start(t);
  const response=await fetch(base+'/api/operations/portal/mobile-money/readiness');
  assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.enabled,false);
  assert.equal(statements.some(x=>/payment_intents|INSERT INTO payments/i.test(x.q)),false);
});
