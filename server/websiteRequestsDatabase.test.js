import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {createPublicWebsiteRequestsRouter,savePublicWebsiteRequest,updateWebsiteRequest} from './websiteRequests.js';
import {createOperationsRouter} from './operations.js';

test('website requests execute with tenant isolation, private follow-up and immutable history',async t=>{
 const db=new PGlite({extensions:{pgcrypto}});
 const query=async(sql,args)=>{const result=await db.query(sql,args);return {...result,rowCount:result.rows.length||result.affectedRows||0};};
 const client={query,release(){}};
 async function tenant(school,action){await db.exec('BEGIN; SET LOCAL ROLE redeemer_runtime');try{await query("SELECT set_config('app.current_school_id',$1,true)",[school]);const result=await action();await db.exec('COMMIT');return result;}catch(e){await db.exec('ROLLBACK');throw e;}}
 try{
  const directory=new URL('./migrations/',import.meta.url);for(const name of (await readdir(directory)).filter(name=>name.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,directory),'utf8'));
  const a=randomUUID(),b=randomUUID(),user=randomUUID();
  for(const [id,code]of [[a,'REQ-A'],[b,'REQ-B']])await query('INSERT INTO schools(id,code,name) VALUES($1,$2,$2)',[id,code]);
  await query("INSERT INTO user_accounts(id,school_id,email,password_hash,full_name,role) VALUES($1,$2,'staff@example.invalid','test-only','Fictional Registrar','REGISTRAR')",[user,a]);
  const body=()=>({schoolCode:'REQ-A',requestId:randomUUID(),category:'ENQUIRY',contactName:'Fictional Guardian',email:'guardian@example.invalid',phone:'',subject:'Fictional school enquiry',message:'STAGING TEST ONLY — please explain the application process.',consent:true});
  let school=a,role='REGISTRAR',signedIn=true;
  const pool={connect:async()=>({query:async(sql,args)=>{if(sql==='BEGIN'){await db.exec('BEGIN; SET LOCAL ROLE redeemer_runtime');return {rows:[]};}return query(sql,args);},release(){}})};
  async function start(){const app=express();app.use(express.json({limit:'20kb'}));app.use('/requests',createPublicWebsiteRequestsRouter({pool,publicUrl:'https://school.example'}));app.use('/operations',createOperationsRouter({authenticate:async(req,res,next)=>{if(!signedIn)return res.status(401).json({error:'Authentication required.'});await db.exec('BEGIN; SET LOCAL ROLE redeemer_runtime');await query("SELECT set_config('app.current_school_id',$1,true)",[school]);req.auth={client,claims:{schoolId:school,userId:user,csrfToken:'csrf-test'},account:{roles:[role],permissions:['admissions.read']}};next();}}));const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;return {server,request:(path,data,extra={})=>fetch(origin+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',Origin:'https://school.example','X-CSRF-Token':'csrf-test',...extra},...(data?{body:JSON.stringify(data)}:{})})};}
  let id,reference;
  await t.test('all public request types record a receipt; retries are idempotent without public disclosure',async()=>{
   const {server,request}=await start();try{
    const input=body();const first=await request('/requests',input);assert.equal(first.status,201);const receipt=await first.json();reference=receipt.reference;assert.match(reference,/^WEB-\d{4}-[A-F0-9]{12}$/);assert.deepEqual(Object.keys(receipt).sort(),['accepted','reference']);
    assert.equal((await request('/requests',input)).status,200);assert.equal((await request('/requests',{...input,message:'Different fictional details in the same reference.'})).status,409);
    for(const category of ['VISIT','RECORDS'])assert.equal((await request('/requests',{...body(),category})).status,201);
    assert.equal((await request('/requests')).status,404);
    const records=await query('SELECT id FROM website_requests WHERE school_id=$1 AND reference=$2',[a,reference]);id=records.rows[0].id;
    assert.equal((await query('SELECT count(*)::int AS n FROM website_request_events WHERE request_id=$1',[id])).rows[0].n,1);
   }finally{await new Promise(resolve=>server.close(resolve));}
  });
  await t.test('contact, consent, origin, length, honeypot and per-process throttling fail safely',async()=>{
   const {server,request}=await start();try{
    assert.equal((await request('/requests',body(),{Origin:'https://wrong.example'})).status,403);
    for(const change of [{consent:false},{email:'bad-address'},{message:'x'.repeat(2001)},{category:'VISIT',preferredDate:'2000-01-01'}])assert.equal((await request('/requests',{...body(),...change})).status,400);
    const before=(await query('SELECT count(*)::int AS n FROM website_requests')).rows[0].n;
    assert.equal((await request('/requests',{...body(),website:'bot.example'})).status,202);
    assert.equal((await query('SELECT count(*)::int AS n FROM website_requests')).rows[0].n,before);
    assert.equal((await request('/requests',body())).status,201);
    assert.equal((await request('/requests',body())).status,429);
   }finally{await new Promise(resolve=>server.close(resolve));}
  });
  await t.test('only authorized administrative roles can read the queue; other tenants cannot read a request',async()=>{
   const {server,request}=await start();try{
    signedIn=false;assert.equal((await request('/operations/website-requests')).status,401);signedIn=true;
    for(role of ['PARENT','STUDENT','TEACHER','FINANCE'])assert.equal((await request('/operations/website-requests')).status,403);
    for(role of ['REGISTRAR','PRINCIPAL','SCHOOL_ADMIN'])assert.equal((await request('/operations/website-requests')).status,200);
    const detail=await request('/operations/website-requests/'+id);assert.equal(detail.headers.get('cache-control'),'no-store');const data=await detail.json();assert.equal(data.request.reference,reference);assert.equal(data.events.length,1);assert.equal('payload_hash'in data.request,false);assert.equal('client_request_id'in data.request,false);
    school=b;assert.equal((await request('/operations/website-requests/'+id)).status,404);assert.equal((await (await request('/operations/website-requests')).json()).requests.length,0);school=a;
   }finally{role='REGISTRAR';school=a;signedIn=true;await new Promise(resolve=>server.close(resolve));}
  });
  await t.test('follow-up assignment, transitions, conflicts and CSRF preserve append-only history',async()=>{
   const {server,request}=await start();try{
    const path='/operations/website-requests/'+id+'/follow-up',update={revision:1,status:'IN_PROGRESS',note:'Fictional registrar will follow up through the school office.',claim:true};
    assert.equal((await request(path,update,{'X-CSRF-Token':'wrong'})).status,403);
    assert.equal((await request(path,{...update,note:'short'})).status,400);
    assert.equal((await request(path,update)).status,200);
    assert.equal((await request(path,update)).status,409);
    assert.equal((await request(path,{revision:2,status:'NEW',note:update.note})).status,400);
    assert.equal((await request(path,{revision:2,status:'RESOLVED',note:'Fictional test completed; no actual contact or document release.'})).status,200);
    const detail=await (await request('/operations/website-requests/'+id)).json();assert.equal(detail.request.status,'RESOLVED');assert.equal(detail.request.assigned_to,user);assert.equal(detail.events.length,3);
    await assert.rejects(tenant(a,()=>query("UPDATE website_requests SET message='rewrite original' WHERE id=$1",[id])),e=>e.code==='23514');
    await assert.rejects(tenant(a,()=>query("UPDATE website_request_events SET note='rewrite history' WHERE request_id=$1",[id])),e=>e.code==='42501');
    await assert.rejects(tenant(a,()=>query('DELETE FROM website_requests WHERE id=$1',[id])),e=>e.code==='42501');
    assert.equal(await tenant(b,async()=> (await query('SELECT id FROM website_requests WHERE id=$1',[id])).rowCount),0);
   }finally{await new Promise(resolve=>server.close(resolve));}
  });
  await t.test('queue pagination returns every request without crossing schools',async()=>{
   for(let i=0;i<52;i++)await tenant(a,()=>savePublicWebsiteRequest(client,a,body()));
   const {server,request}=await start();try{const page=await (await request('/operations/website-requests?status=ALL')).json();assert.equal(page.requests.length,50);assert.ok(page.nextCursor);const next=await (await request('/operations/website-requests?status=ALL&before='+page.nextCursor)).json();const ids=[...page.requests,...next.requests].map(row=>row.id);assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,56);}finally{await new Promise(resolve=>server.close(resolve));}
  });
 }finally{await db.close();}
});
