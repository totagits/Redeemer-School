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
import {moneyCents} from './staffWorkflows.js';
import {integrationReadiness} from './integrationReadiness.js';

test('manual payroll money and readiness reject unsafe assumptions',()=>{
 assert.equal(moneyCents('100.05'),10005);for(const value of ['-1','1.234','1e3','NaN',1,Infinity])assert.throws(()=>moneyCents(value));
 const env={MTN_MOMO_ENVIRONMENT:'PRODUCTION',MTN_MOMO_CURRENCY:'LRD',MTN_MOMO_API_USER:'secret-user',MTN_MOMO_API_KEY:'secret-key',MTN_MOMO_SUBSCRIPTION_KEY:'secret-sub',SMS_PROVIDER:'MTN',MTN_SMS_CLIENT_ID:'sms-secret',MTN_SMS_CLIENT_SECRET:'secret',MTN_SMS_SENDER_ADDRESS:'school'};
 const data=integrationReadiness(env);assert.equal(data.services[0].configured,false);assert.equal(data.services[1].configured,false);assert.equal(data.services[2].configured,false);assert.ok(!JSON.stringify(data).includes('secret'));
 assert.equal(integrationReadiness({...env,RESEND_API_KEY:'secret',RESEND_FROM_EMAIL:'school@example.invalid',EMAIL_MODE:'staging',APP_PUBLIC_URL:'https://school.example.invalid'}).services[2].configured,true);
 assert.equal(integrationReadiness({...env,RESEND_API_KEY:'secret',RESEND_FROM_EMAIL:'school@example.invalid',EMAIL_MODE:'staging',APP_PUBLIC_URL:'https://user:secret@school.example.invalid'}).services[2].configured,false);
});

test('staff leave and manual payroll enforce private records and independent approval',async t=>{
 const db=new PGlite({extensions:{pgcrypto}}),school=randomUUID(),foreign=randomUUID(),users={},employees={},sessions={};let server;
 const q=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0};};
 const password=randomBytes(24).toString('base64url'),hash=await hashPassword(password);
 try{
  const dir=new URL('./migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort()){
   await db.exec(await readFile(new URL(name,dir),'utf8'));
   if(name==='001_school_operations_foundation.sql')for(const [tenant,code] of [[school,'STAFF-A'],[foreign,'STAFF-B']])await q('INSERT INTO schools(id,code,name) VALUES($1,$2,$2)',[tenant,code]);
  }
  for(const [key,role,tenant] of [['teacher','TEACHER',school],['hr','HR_MANAGER',school],['finance','FINANCE',school],['principal','PRINCIPAL',school],['admin','SCHOOL_ADMIN',school],['foreign','SCHOOL_ADMIN',foreign]]){
   users[key]=randomUUID();employees[key]=randomUUID();
   await q('INSERT INTO user_accounts(id,school_id,email,password_hash,full_name,role,must_reset_password) VALUES($1,$2,$3,$4,$5,$6,false)',[users[key],tenant,key+'@example.invalid',hash,'TEST '+key,role]);
   await q('INSERT INTO user_role_assignments(school_id,user_id,role_id) SELECT $1,$2,id FROM school_roles WHERE school_id=$1 AND code=$3',[tenant,users[key],role]);
   await q('INSERT INTO staff_records(id,school_id,user_id,employee_number,first_name,last_name) VALUES($1,$2,$3,$4,$5,$6)',[employees[key],tenant,users[key],'TEST-'+key,'TEST',key]);
  }
  await db.exec('SET ROLE redeemer_runtime');const client={query:q,release(){}},pool={query:q,connect:async()=>client};
  const auth=createAuthRouter({pool,secret:randomBytes(48).toString('base64url'),secureCookie:false});
  const app=express();app.use(express.json());app.use('/api/auth',auth);app.use('/api/operations',createOperationsRouter({authenticate:auth.requireAuth}));server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  for(const key of Object.keys(users)){
   const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({schoolCode:key==='foreign'?'STAFF-B':'STAFF-A',email:key+'@example.invalid',password,audience:'STAFF'})});const b=await r.json();assert.equal(r.status,200);sessions[key]={cookie:r.headers.get('set-cookie').split(';')[0],csrf:b.csrfToken};
  }
  async function call(actor,path,data,expected=200,headers={}){const r=await fetch(base+'/api/operations/'+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:sessions[actor].cookie,'X-CSRF-Token':sessions[actor].csrf,...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});const b=await r.json();assert.equal(r.status,expected,path+': '+JSON.stringify(b));return b;}
  let leave,run;
  const payroll=async actor=>(await call(actor,'staff/payroll/'+run.id)).run;
  const payAction=async(actor,action,extra={},expected=200)=>{const current=await payroll('finance');return call(actor,'staff/payroll/'+run.id+'/action',{revision:current.revision,action,note:'TEST ONLY: fictional manual payroll evidence.',...extra},expected);};
  await t.test('employee requests private leave; overlapping, foreign and self approvals are blocked',async()=>{
   const body={leaveType:'TEST annual leave',startsOn:'2090-01-02',endsOn:'2090-01-04',reason:'TEST ONLY handover.'};
   leave=(await call('teacher','staff/leave',body,201)).request;
   await call('teacher','staff/leave',body,409);
   assert.equal((await call('finance','staff/leave')).requests.length,0);
   assert.equal((await call('hr','staff/leave')).requests.length,1);
   await call('teacher','staff/leave/'+leave.id+'/action',{revision:1,action:'APPROVE',note:'TEST'},403);
   await call('principal','staff/leave/'+leave.id+'/action',{revision:1,action:'APPROVE',note:'TEST'},409);
   await call('foreign','staff/leave/'+leave.id+'/history',undefined,404);
   await call('hr','staff/leave/'+leave.id+'/action',{revision:1,action:'REVIEW',note:'TEST coverage and policy reviewed.'},403,{'X-CSRF-Token':'wrong'});
   await call('hr','staff/leave/'+leave.id+'/action',{revision:1,action:'REVIEW',note:'TEST coverage and policy reviewed.'});
   await call('principal','staff/leave/'+leave.id+'/action',{revision:1,action:'APPROVE',note:'TEST'},409);
   await call('principal','staff/leave/'+leave.id+'/action',{revision:2,action:'APPROVE',note:'TEST separate approval.'});
   await call('teacher','staff/leave/'+leave.id+'/action',{revision:3,action:'CANCEL',note:'TEST'},409);
   await call('principal','staff/leave/'+leave.id+'/action',{revision:3,action:'CANCEL',note:'TEST independent approved-leave cancellation.'});
   assert.equal((await call('teacher','staff/leave/'+leave.id+'/history')).events.length,4);
   const own=(await call('hr','staff/leave',{...body,startsOn:'2090-02-01',endsOn:'2090-02-02'},201)).request;
   await call('hr','staff/leave/'+own.id+'/action',{revision:1,action:'REVIEW',note:'TEST'},403);
   await call('hr','staff/leave/'+own.id+'/action',{revision:1,action:'CANCEL',note:'TEST pending cancellation.'});
   const leaderOwn=(await call('principal','staff/leave',{...body,startsOn:'2090-03-01',endsOn:'2090-03-02'},201)).request;
   await call('hr','staff/leave/'+leaderOwn.id+'/action',{revision:1,action:'REVIEW',note:'TEST coverage checked.'});
   await call('principal','staff/leave/'+leaderOwn.id+'/action',{revision:2,action:'APPROVE',note:'TEST'},403);
   await call('admin','staff/leave/'+leaderOwn.id+'/action',{revision:2,action:'APPROVE',note:'TEST another leader decision.'});
  });
  await t.test('Finance prepares exact manual amounts; staff cannot view salary runs',async()=>{
   await call('teacher','staff/payroll',undefined,403);await call('hr','staff/payroll',undefined,403);
   run=(await call('finance','staff/payroll',{periodStart:'2020-01-01',periodEnd:'2020-01-31',currency:'USD',rulesetRef:'TEST manual schedule'},201)).run;
   await call('foreign','staff/payroll/'+run.id,undefined,404);
   await payAction('finance','SUBMIT',{},409);
   await call('finance','staff/payroll/'+run.id+'/lines',{revision:1,staffId:employees.foreign,gross:'100.00',addition:'10.00',deduction:'5.00',notes:'TEST'},404);
   await call('finance','staff/payroll/'+run.id+'/lines',{revision:1,staffId:employees.teacher,gross:'100.05',addition:'10.10',deduction:'5.02',notes:'TEST manually reviewed fictional amounts.'});
   const detail=await call('principal','staff/payroll/'+run.id);assert.equal(Number(detail.lines[0].net_amount),105.13);
   assert.equal((await call('teacher','staff/payslips')).payslips.length,0);
   await payAction('finance','SUBMIT');await payAction('finance','APPROVE',{},403);
   await payAction('principal','RETURN');assert.equal((await payroll('finance')).status,'DRAFT');
   await payAction('finance','SUBMIT');await payAction('principal','APPROVE');
  });
  await t.test('approved amounts lock; payment records expose only the employee payslip',async()=>{
   await call('finance','staff/payroll/'+run.id+'/lines',{revision:(await payroll('finance')).revision,staffId:employees.teacher,gross:'1',addition:'0',deduction:'0',notes:'TEST'},403);
   await payAction('principal','RECORD_PAYMENT',{paidOn:'2020-02-01',paymentReference:'TEST-PAY-001'},403);
   await payAction('finance','RECORD_PAYMENT',{paidOn:'2099-01-01',paymentReference:'TEST-PAY-001'},400);
   await payAction('finance','RECORD_PAYMENT',{paidOn:'2020-02-01',paymentReference:'TEST-PAY-001'});
   await payAction('finance','RECORD_PAYMENT',{paidOn:'2020-02-01',paymentReference:'TEST-PAY-001'},403);
   const slips=(await call('teacher','staff/payslips')).payslips;assert.equal(slips.length,1);assert.equal(Number(slips[0].net_amount),105.13);assert.ok(!('payment_reference' in slips[0]));
   assert.equal((await call('hr','staff/payslips')).payslips.length,0);
   const old=run;run=(await call('finance','staff/payroll',{periodStart:'2020-01-15',periodEnd:'2020-02-01',currency:'USD',rulesetRef:'TEST overlapping schedule'},201)).run;
   await call('finance','staff/payroll/'+run.id+'/lines',{revision:1,staffId:employees.teacher,gross:'100',addition:'0',deduction:'0',notes:'TEST overlap'});
   await payAction('finance','SUBMIT',{},409);await payAction('finance','CANCEL');run=old;
   const events=(await call('principal','staff/payroll/'+run.id)).events;assert.ok(events.some(e=>e.action==='PAYROLL_RECORD_PAYMENT'));
   await db.exec('RESET ROLE');const grants=await q("SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='redeemer_runtime' AND table_name='staff_workflow_events'");assert.ok(!grants.rows.some(r=>['UPDATE','DELETE'].includes(r.privilege_type)));await db.exec('SET ROLE redeemer_runtime');
  });
  await t.test('readiness access is role-limited and never sends provider traffic',async()=>{
   await call('teacher','integrations',undefined,403);await call('hr','integrations',undefined,403);
   const summary=await call('finance','integrations');assert.equal(summary.services.length,3);assert.ok(!JSON.stringify(summary).includes('apiKey'));
   const adminRun=(await call('admin','staff/payroll',{periodStart:'2020-03-01',periodEnd:'2020-03-31',currency:'LRD',rulesetRef:'TEST administrator schedule'},201)).run;
   await call('admin','staff/payroll/'+adminRun.id+'/lines',{revision:1,staffId:employees.teacher,gross:'20',addition:'0',deduction:'0',notes:'TEST only'});
   await call('admin','staff/payroll/'+adminRun.id+'/action',{revision:2,action:'SUBMIT',note:'TEST submit'});
   await call('admin','staff/payroll/'+adminRun.id+'/action',{revision:3,action:'APPROVE',note:'TEST self approval'},403);
   await call('principal','staff/payroll/'+adminRun.id+'/action',{revision:3,action:'APPROVE',note:'TEST independent approval'});
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.close();}
});
