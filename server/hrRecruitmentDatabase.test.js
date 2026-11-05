import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {once} from 'node:events';
import express from 'express';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {createAuthRouter} from './auth.js';
import {hashPassword} from './authCrypto.js';
import {createOperationsRouter} from './operations.js';

test('HR recruitment preserves independent decisions, tenant privacy and one-time employee creation',async t=>{
 const db=new PGlite({extensions:{pgcrypto}});
 const q=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0};};
 const school=randomUUID(),foreign=randomUUID(),users={},sessions={},sent=[];
 const password=randomBytes(24).toString('base64url'),hash=await hashPassword(password);
 let server;
 try{
  const dir=new URL('./migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort()){
   await db.exec(await readFile(new URL(name,dir),'utf8'));
   if(name==='001_school_operations_foundation.sql')for(const [id,code]of [[school,'HIRING-A'],[foreign,'HIRING-B']])await q('INSERT INTO schools(id,code,name) VALUES($1,$2,$2)',[id,code]);
  }
  for(const [key,role,tenant]of [['hr','HR_MANAGER',school],['admin','SCHOOL_ADMIN',school],['principal','PRINCIPAL',school],['teacher','TEACHER',school],['foreign','SCHOOL_ADMIN',foreign]]){
   users[key]=randomUUID();
   await q('INSERT INTO user_accounts(id,school_id,email,password_hash,full_name,role,must_reset_password) VALUES($1,$2,$3,$4,$5,$6,false)',[users[key],tenant,key+'@example.invalid',hash,'Fictional '+key,role]);
   await q('INSERT INTO user_role_assignments(school_id,user_id,role_id) SELECT $1,$2,id FROM school_roles WHERE school_id=$1 AND code=$3',[tenant,users[key],role]);
  }
  await db.exec('SET ROLE redeemer_runtime');
  const client={query:q,release(){}},pool={query:q,connect:async()=>client};
  const auth=createAuthRouter({pool,secret:randomBytes(48).toString('base64url'),secureCookie:false});
  const app=express();app.use(express.json());app.use('/api/auth',auth);app.use('/api/operations',createOperationsRouter({authenticate:auth.requireAuth,sendInvitation:async mail=>{sent.push(mail.email);}}));
  server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  async function call(actor,path,data,expected=200,headers={}){
   const session=sessions[actor];const response=await fetch(base+'/api/operations/'+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{}),...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});
   const result=await response.json();assert.equal(response.status,expected,path+': '+JSON.stringify(result));return result;
  }
  async function owner(action){await db.exec('RESET ROLE');try{return await action();}finally{await db.exec('SET ROLE redeemer_runtime');}}
  for(const key of Object.keys(users)){
   const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({schoolCode:key==='foreign'?'HIRING-B':'HIRING-A',email:key+'@example.invalid',password,audience:'STAFF'})});
   const body=await response.json();assert.equal(response.status,200);sessions[key]={cookie:response.headers.get('set-cookie').split(';')[0],csrfToken:body.csrfToken};
  }
  let job,candidate;
  const detail=async actor=>call(actor,'hr/recruitment/'+job.id);
  const current=async()=>{const d=await detail('hr');return d.applications.find(a=>a.id===candidate.id);};
  const action=async(actor,name,extra={},expected=200)=>{const row=await current();return call(actor,'hr/applications/'+candidate.id+'/action',{revision:row.revision,action:name,note:'FICTIONAL TEST ONLY: recorded workflow evidence.',...extra},expected);};
  await t.test('HR creates a vacancy, separate leadership approves and HR opens intake',async()=>{
   await call('teacher','hr/recruitment',undefined,403);
   job=(await call('hr','hr/recruitment',{code:'TEST-HIRE',title:'Fictional Teacher',department:'Test department',description:'Fictional vacancy for a disposable test.',requirements:'Fictional qualifications.',positions:1,closingOn:'2099-01-01'},201)).vacancy;
   await call('hr','hr/recruitment/'+job.id+'/status',{revision:1,status:'APPROVED'},403);
   await call('foreign','hr/recruitment/'+job.id,undefined,404);
   await call('principal','hr/recruitment/'+job.id+'/status',{revision:1,status:'APPROVED'});
   await call('hr','hr/recruitment/'+job.id+'/status',{revision:1,status:'OPEN'},409);
   await call('hr','hr/recruitment/'+job.id+'/status',{revision:2,status:'OPEN'},403,{'X-CSRF-Token':'wrong'});
   job=(await call('hr','hr/recruitment/'+job.id+'/status',{revision:2,status:'OPEN'})).vacancy;
  });
  await t.test('candidate intake rejects duplicates and stage skipping',async()=>{
   const body={firstName:'Fictional',lastName:'Applicant',email:'candidate@example.invalid',phone:'',qualifications:'Fictional teacher qualifications.'};
   candidate=(await call('hr','hr/recruitment/'+job.id+'/applications',body,201)).application;
   await call('hr','hr/recruitment/'+job.id+'/applications',body,409);
   await action('hr','RECOMMEND',{},409);
   await action('hr','SHORTLIST');
  });
  await t.test('interview scheduling validates time and completion requires recorded evidence',async()=>{
   let row=await current();
   await call('hr','hr/applications/'+candidate.id+'/interviews',{revision:row.revision,scheduledAt:'2000-01-01T00:00:00Z',interviewer:'Fictional panel',venue:'Fictional room'},400);
   const interview=(await call('hr','hr/applications/'+candidate.id+'/interviews',{revision:row.revision,scheduledAt:new Date(Date.now()+86400000).toISOString(),interviewer:'Fictional panel',venue:'Fictional room'},201)).interview;
   row=await current();
   await call('hr','hr/applications/'+candidate.id+'/interviews/'+interview.id+'/complete',{revision:row.revision,feedback:'Fictional feedback for rehearsal.'},409);
   await owner(()=>q("UPDATE hr_interviews SET scheduled_at=now()-interval '1 hour' WHERE id=$1",[interview.id]));
   await call('hr','hr/applications/'+candidate.id+'/interviews/'+interview.id+'/complete',{revision:row.revision,feedback:'Fictional feedback for rehearsal.'});
   await action('hr','RECOMMEND');
   await action('hr','APPROVE',{},403);
   await action('principal','APPROVE');
  });
  await t.test('offer acceptance and all onboarding checks precede one-time employee creation',async()=>{
   let row=await current();
   const onboarding={revision:row.revision,employeeNumber:'TEST-HIRE-001',startsOn:'2027-09-01',note:'Fictional onboarding completed.',checks:{identityVerified:true,referencesChecked:true,contractSigned:true,safeguardingComplete:true,orientationComplete:true}};
   await call('hr','hr/applications/'+candidate.id+'/onboard',onboarding,409);
   await action('hr','OFFER',{offerReference:'TEST-OFFER-001'});
   await action('hr','ACCEPT');
   row=await current();onboarding.revision=row.revision;
   await call('hr','hr/applications/'+candidate.id+'/onboard',{...onboarding,checks:{}},400);
   const result=await call('hr','hr/applications/'+candidate.id+'/onboard',onboarding,201);
   const retry=await call('hr','hr/applications/'+candidate.id+'/onboard',onboarding);
   assert.equal(result.staffRecordId,retry.staffRecordId);
   await call('hr','hr/applications/'+candidate.id+'/onboard',{...onboarding,employeeNumber:'DIFFERENT'},409);
   const staff=(await call('hr','staff')).staff;
   assert.equal(staff.filter(s=>s.email===candidate.email).length,1);
   assert.equal(staff.find(s=>s.id===result.staffRecordId).user_id,null);
   assert.equal(sent.length,0);
   const history=(await detail('hr')).events;assert.ok(history.some(e=>e.action==='HR_EMPLOYEE_ONBOARDED'));
  });
  await t.test('administrator links the approved employee record through the normal teacher invitation entry',async()=>{
   const before=(await current()).staff_record_id;
   await call('admin','teachers',{fullName:'Fictional Applicant',email:'candidate@example.invalid',employeeNumber:'TEST-HIRE-001'},201);
   const staff=(await call('hr','staff')).staff.filter(s=>s.email==='candidate@example.invalid');
   assert.equal(staff.length,1);assert.equal(staff[0].id,before);assert.ok(staff[0].user_id);
   assert.equal(sent.length,1);
  });
  await t.test('leadership cannot self-approve a vacancy and filled positions reject additional onboarding',async()=>{
   const own=(await call('admin','hr/recruitment',{code:'TEST-SELF',title:'Fictional post',department:'Test department',description:'A fictional role for approval checks.',requirements:'Test requirements.',positions:1,closingOn:'2099-01-01'},201)).vacancy;
   await call('admin','hr/recruitment/'+own.id+'/status',{revision:1,status:'APPROVED'},403);
   const other=randomUUID();
   await owner(()=>q(`INSERT INTO hr_applications(id,school_id,vacancy_id,first_name,last_name,email,qualifications,status,created_by,recommended_by,approved_by,approved_at,offer_reference)
    VALUES($1,$2,$3,'Fictional','Second','second@example.invalid','Fictional qualifications','ACCEPTED',$4,$4,$5,now(),'TEST-OFFER-002')`,[other,school,job.id,users.hr,users.principal]));
   await call('hr','hr/applications/'+other+'/onboard',{revision:1,employeeNumber:'TEST-HIRE-002',startsOn:'2027-09-01',note:'Test capacity check.',checks:{identityVerified:true,referencesChecked:true,contractSigned:true,safeguardingComplete:true,orientationComplete:true}},409);
   await owner(async()=>{
    const deleted=await q("SELECT has_table_privilege('redeemer_runtime','hr_recruitment_events','DELETE') AS allowed");assert.equal(deleted.rows[0].allowed,false);
   });
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.close();}
});
