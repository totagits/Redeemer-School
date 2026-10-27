import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId='b210b463-c02c-4be9-9003-8a9005e8dbe5';
const yearId='a110b463-c02c-4be9-9003-8a9005e8dbe5';
const gradeId='c110b463-c02c-4be9-9003-8a9005e8dbe5';

class HonorsClient{
  constructor({legacy=false}={}){this.statements=[];this.legacy=legacy;}
  async query(sql,params=[]){
    const normalized=sql.replace(/\s+/g,' ').trim();
    this.statements.push({sql:normalized,params});
    if(['BEGIN','COMMIT','ROLLBACK'].includes(normalized))return {rows:[],rowCount:0};
    if(normalized.startsWith('SELECT id,name FROM academic_years'))return {rows:[{id:yearId,name:'2026–2027'}],rowCount:1};
    if(normalized.startsWith('SELECT DISTINCT COALESCE(gl.id::text'))return {rows:[this.legacy?{id:'legacy:Grade 4',name:'Grade 4',education_level_name:'Existing class grade'}:{id:gradeId,name:'Grade 12',education_level_name:'Senior High'}],rowCount:1};
    if(normalized.startsWith('SELECT DISTINCT ON (rc.student_id)'))return {rows:[{studentId:'student-1',studentNumber:'RIA-001',firstName:'Ada',lastName:'Doe',className:'Grade 12 A',overallAverage:'98.50',overallOutcome:'PASS',approvedAt:'2026-10-01T00:00:00.000Z'}],rowCount:1};
    throw new Error(`Unexpected query in graduation honors test: ${normalized}`);
  }
  release(){}
}

async function start(t,account,options={}){
  let client;
  const app=express();
  app.use('/api/operations',createOperationsRouter({authenticate(req,_res,next){
    client=new HonorsClient(options);
    req.auth={account,claims:{schoolId,userId:account.id,csrfToken:'csrf-test-token'},client};
    next();
  }}));
  const server=createServer(app).listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return {url:`http://127.0.0.1:${server.address().port}`,getClient:()=>client};
}

test('Principal can request graduation recommendations from approved cards for a selected year and graduating grade',async t=>{
  const {url,getClient}=await start(t,{id:'principal-1',roles:['PRINCIPAL'],permissions:['grades.publish']});
  const response=await fetch(`${url}/api/operations/reports/graduation-honors?academicYearId=${yearId}&gradeLevelId=${gradeId}`);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.academicYear.name,'2026–2027');
  assert.equal(body.gradeLevel.name,'Grade 12');
  assert.equal(body.results[0].overallAverage,'98.50');
  const client=getClient();
  const cardQuery=client.statements.find(item=>item.sql.startsWith('SELECT DISTINCT ON (rc.student_id)'));
  assert.deepEqual(cardQuery.params,[schoolId,yearId,gradeId]);
  assert.match(cardQuery.sql,/rc\.status='PUBLISHED'/);
  assert.equal(client.statements.at(-1).sql,'COMMIT');
});

test('Principal can select an existing legacy class grade without a grade-level link',async t=>{
  const {url,getClient}=await start(t,{id:'principal-1',roles:['PRINCIPAL'],permissions:['grades.publish']},{legacy:true});
  const response=await fetch(`${url}/api/operations/reports/graduation-honors?academicYearId=${yearId}&gradeLevelId=${encodeURIComponent('legacy:Grade 4')}`);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.gradeLevel.name,'Grade 4');
  assert.equal(body.gradeLevels[0].id,'legacy:Grade 4');
  const cardQuery=getClient().statements.find(item=>item.sql.startsWith('SELECT DISTINCT ON (rc.student_id)'));
  assert.deepEqual(cardQuery.params,[schoolId,yearId,'legacy:Grade 4']);
  assert.match(cardQuery.sql,/cg\.grade_level_id IS NULL/);
  assert.equal(getClient().statements.at(-1).sql,'COMMIT');
});

test('non-Principal cannot view graduation honor recommendations even with grade publication permission',async t=>{
  const {url,getClient}=await start(t,{id:'admin-1',roles:['SCHOOL_ADMIN'],permissions:['grades.publish']});
  const response=await fetch(`${url}/api/operations/reports/graduation-honors?academicYearId=${yearId}`);
  assert.equal(response.status,403);
  assert.match((await response.json()).error,/Only the Principal/);
  assert.equal(getClient().statements.at(-1).sql,'ROLLBACK');
});
