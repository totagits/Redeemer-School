import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId = 'b210b463-c02c-4be9-9003-8a9005e8dbe5';
const userId = '721ddf68-1c98-4faa-9dc7-9161daa79870';
const classId = 'd210b463-c02c-4be9-9003-8a9005e8dbe5';
const announcementId = 'a210b463-c02c-4be9-9003-8a9005e8dbe5';

test('school admin announcement saves a draft without prematurely queuing SMS', async t => {
  const statements = [];
  const client = {
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g,' ').trim();
      statements.push({normalized, params});
      if (['BEGIN','COMMIT','ROLLBACK'].includes(normalized)) return {rows:[],rowCount:0};
      if (normalized.startsWith('INSERT INTO announcements(')) {
        assert.equal(params[0],schoolId);
        assert.equal(params[1],classId);
        return {rows:[{id:announcementId,title:'STAGING TEST',body:'No action needed',audience:'CLASS',status:'DRAFT'}],rowCount:1};
      }
      if (normalized.startsWith('INSERT INTO notification_deliveries(')) {
        assert.deepEqual(params,[schoolId,announcementId], 'SMS queue SQL must bind both placeholders');
        return {rows:[],rowCount:0};
      }
      if (normalized.startsWith('WITH a AS (SELECT * FROM announcements')) {
        assert.deepEqual(params,[schoolId,announcementId]);
        return {rows:[],rowCount:0};
      }
      if (normalized.startsWith('INSERT INTO audit_events'))return {rows:[],rowCount:1};
      throw new Error('Unexpected announcements query: '+normalized);
    },
    release() {}
  };
  const app = express();app.use(express.json());
  app.use('/api/operations',createOperationsRouter({authenticate(req,_res,next){
    req.auth={account:{id:userId,roles:['SCHOOL_ADMIN'],permissions:['communications.write']},claims:{schoolId,userId,csrfToken:'csrf-test-token'},client};next();
  }}));
  const server=createServer(app).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/operations/communications',{
    method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':'csrf-test-token'},
    body:JSON.stringify({title:'STAGING TEST',body:'No action needed',audience:'CLASS',classGroupId:classId})
  });
  assert.equal(response.status,201);
  assert.equal(statements.some(x=>x.normalized.startsWith('INSERT INTO notification_deliveries(')),false);
  assert.equal(statements.some(x=>x.normalized.startsWith('WITH a AS (SELECT * FROM announcements')),false);
  const result=await response.json(); assert.equal(result.announcement.status,'DRAFT');
  assert.equal(statements.at(-1).normalized,'COMMIT');
  assert.equal(statements.find(x=>x.normalized.startsWith('INSERT INTO announcements(')).params[5],'DRAFT');
});

test('publishing saved draft binds SMS queue parameters and creates portal notices', async t => {
  const statements=[];
  const client={async query(sql,params=[]){
    const normalized=sql.replace(/\s+/g,' ').trim();statements.push({normalized,params});
    if(['BEGIN','COMMIT','ROLLBACK'].includes(normalized))return {rows:[],rowCount:0};
    if(normalized.startsWith("UPDATE announcements SET status='PUBLISHED'"))return {rows:[{id:announcementId,title:'STAGING TEST',status:'PUBLISHED'}],rowCount:1};
    if(normalized.startsWith('INSERT INTO notification_deliveries(')){
      assert.deepEqual(params,[schoolId,announcementId]);
      return {rows:[],rowCount:0};
    }
    if(normalized.startsWith('WITH a AS (SELECT * FROM announcements')){
      assert.deepEqual(params,[schoolId,announcementId]);
      return {rows:[],rowCount:0};
    }
    if(normalized.startsWith('INSERT INTO audit_events'))return {rows:[],rowCount:1};
    throw new Error('Unexpected publish query: '+normalized);
  },release(){}};
  const app=express();app.use(express.json());
  app.use('/api/operations',createOperationsRouter({authenticate(req,_res,next){
    req.auth={account:{id:userId,roles:['SCHOOL_ADMIN'],permissions:['communications.write']},claims:{schoolId,userId,csrfToken:'csrf-test-token'},client};next();
  }}));
  const server=createServer(app).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/operations/communications/'+announcementId+'/publish',{
    method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':'csrf-test-token'},body:'{}'
  });
  assert.equal(response.status,200);
  assert.ok(statements.some(x=>x.normalized.startsWith('INSERT INTO notification_deliveries(')));
  assert.equal(statements.at(-1).normalized,'COMMIT');
});
