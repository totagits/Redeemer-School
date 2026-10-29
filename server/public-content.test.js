import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createPublicContentRouter} from './publicContent.js';

const school='b210b463-c02c-4be9-9003-8a9005e8dbe5';
const account='721ddf68-1c98-4faa-9dc7-9161daa79870';
const id='a210b463-c02c-4be9-9003-8a9005e8dbe5';
async function fixture(t,role='SCHOOL_ADMIN'){
 const calls=[];
 const client={
  async query(sql,params=[]){
   const q=sql.replace(/\s+/g,' ').trim();calls.push({q,params});
   if(q.startsWith('SELECT app.resolve_school_id_by_code'))return {rows:[{id:school}],rowCount:1};
   if(q.startsWith('SELECT set_config('))return {rows:[],rowCount:1};
   if(q.startsWith('SELECT id,kind,title,summary,body,event_starts_at,published_at FROM public_school_posts')){
      assert.match(q,/status='PUBLISHED'/); assert.match(q,/published_at<=now\(\)/);
      assert.deepEqual(params,[school]);
      return {rows:[{id,title:'Public news',kind:'NEWS',summary:'Public update',body:'Public details'}],rowCount:1};
   }
   if(q.startsWith('SELECT id,kind,title,summary,body,status,event_starts_at,published_at,created_at')){
      return {rows:[{id,title:'Draft',status:'DRAFT'}],rowCount:1};
   }
   if(q.startsWith('INSERT INTO public_school_posts')){
      assert.equal(params[0],school);assert.equal(params[6],account);
      return {rows:[{id,status:'DRAFT',kind:'NEWS',title:'School notice'}],rowCount:1};
   }
   if(q.startsWith('UPDATE public_school_posts')){
     assert.equal(params[0],school);assert.equal(params[1],id);
     return {rows:[{id,title:'School notice',status:params[2]}],rowCount:1};
   }
   if(/^(BEGIN|COMMIT|ROLLBACK)/.test(q))return {rows:[],rowCount:0};
   throw new Error('Unexpected SQL '+q);
  },release(){}
 };
 const pool={connect:async()=>client};
 const app=express();app.use(express.json());
 app.use('/api/school-content',createPublicContentRouter({pool,authenticate(req,_res,next){
  req.auth={account:{roles:[role],permissions:['communications.write']},claims:{schoolId:school,userId:account,csrfToken:'test-csrf'},client};next();
 }}));
 const server=createServer(app).listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 return {url:'http://127.0.0.1:'+server.address().port+'/api/school-content',calls};
}
test('public school feed only returns published material and excludes private guardian notices',async t=>{
 const {url,calls}=await fixture(t);
 const response=await fetch(url+'/public?schoolCode=RIA');assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.posts.length,1);
 assert.ok(calls.some(x=>x.q.includes("FROM public_school_posts WHERE school_id=$1 AND status='PUBLISHED'")));
 assert.ok(!calls.some(x=>x.q.includes('FROM announcements')));
});
test('school website drafts are created only with leadership role and valid CSRF',async t=>{
 const {url}=await fixture(t);
 const response=await fetch(url+'/manage',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':'test-csrf'},body:JSON.stringify({kind:'NEWS',title:'School notice',summary:'Public update',body:'No private information'})});
 assert.equal(response.status,201);assert.equal((await response.json()).post.status,'DRAFT');
});
test('guardian cannot create public website posts even with unrelated communication permission',async t=>{
 const {url}=await fixture(t,'PARENT');
 const response=await fetch(url+'/manage',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':'test-csrf'},body:JSON.stringify({kind:'NEWS',title:'Private post',summary:'A',body:'B'})});
 assert.equal(response.status,403);
});
test('explicit school leadership publication and unpublish use scoped record identifiers',async t=>{
 const {url,calls}=await fixture(t);
 const response=await fetch(url+'/manage/'+id+'/status',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':'test-csrf'},body:JSON.stringify({action:'PUBLISH'})});
 assert.equal(response.status,200);assert.equal((await response.json()).post.status,'PUBLISHED');
 assert.ok(calls.some(x=>x.q.startsWith('UPDATE public_school_posts')));
});
test('invalid public school code cannot query content',async t=>{
 const {url,calls}=await fixture(t);
 const response=await fetch(url+'/public?schoolCode=../../private');assert.equal(response.status,400);
 assert.equal(calls.length,0);
});
