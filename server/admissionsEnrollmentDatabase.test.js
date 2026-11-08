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
import {createPublicAdmissionsRouter} from './publicAdmissions.js';
import {createCandidateExamRouter} from './candidateExamAuth.js';
import {InvitationDeliveryError} from './invitations.js';

// All accounts, invitation deliveries and applicant data are disposable fixtures.
// Real authentication, HTTP handlers and SQL/RLS run; no external mail is sent.
test('public applicant proceeds through independent examination review, enrollment and private family activation',async t=>{
 const db=new PGlite({extensions:{pgcrypto}}),school=randomUUID(),foreign=randomUUID(),users={},sessions={},emails=[],invitations=[];
 const q=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0};};
 const password=randomBytes(24).toString('base64url'),hash=await hashPassword(password),year=randomUUID(),group=randomUUID();
 const priorPreview=process.env.ENABLE_CANDIDATE_EXAM_PREVIEW;process.env.ENABLE_CANDIDATE_EXAM_PREVIEW='true';let server,application,exam,question,attempt,student,failInvitation=false;
 try{
  const dir=new URL('./migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort()){
   await db.exec(await readFile(new URL(name,dir),'utf8'));
   if(name==='001_school_operations_foundation.sql')for(const [id,code]of [[school,'INTAKE-A'],[foreign,'INTAKE-B']])await q('INSERT INTO schools(id,code,name) VALUES($1,$2,$2)',[id,code]);
  }
  for(const [key,role,tenant]of [['admin','SCHOOL_ADMIN',school],['registrar','REGISTRAR',school],['principal','PRINCIPAL',school],['finance','FINANCE',school],['teacher','TEACHER',school],['foreign','SCHOOL_ADMIN',foreign]]){
   const id=randomUUID();users[key]=id;
   await q('INSERT INTO user_accounts(id,school_id,email,password_hash,full_name,role,must_reset_password) VALUES($1,$2,$3,$4,$5,$6,false)',[id,tenant,key+'@example.invalid',hash,'Fictional '+key,role==='PRINCIPAL'?'SCHOOL_ADMIN':role]);
   await q('INSERT INTO user_role_assignments(school_id,user_id,role_id) SELECT $1,$2,id FROM school_roles WHERE school_id=$1 AND code=$3',[tenant,id,role]);
  }
  await q("INSERT INTO academic_years(id,school_id,name,starts_on,ends_on,status) VALUES($1,$2,'Fictional intake year','2000-01-01','2099-12-31','ACTIVE')",[year,school]);
  await q("INSERT INTO class_groups(id,school_id,academic_year_id,name,grade_level,section) VALUES($1,$2,$3,'Fictional intake class','4','TEST')",[group,school,year]);
  await db.exec('SET ROLE redeemer_runtime');const pool={query:q,connect:async()=>({query:q,release(){}})};
  const auth=createAuthRouter({pool,secret:randomBytes(48).toString('base64url'),secureCookie:false}),app=express();app.use(express.json());
  app.use('/auth',auth);app.use('/public',createPublicAdmissionsRouter({pool}));
  app.use('/ops',createOperationsRouter({authenticate:auth.requireAuth,sendExaminationEmail:async m=>emails.push(m),sendInvitation:async m=>{if(failInvitation)throw new InvitationDeliveryError('Fictional provider failure');invitations.push(m);}}));
  app.use('/api/candidate-exams',createCandidateExamRouter({pool,secret:randomBytes(48).toString('base64url'),publicUrl:'https://intake.example',enabled:true}));
  server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  async function call(actor,path,body,status=200,headers={}){
   const session=sessions[actor],r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:'https://intake.example',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
   const data=await r.json().catch(()=>({}));assert.equal(r.status,status,path+': '+JSON.stringify(data));return data;
  }
  async function login(key,email=key+'@example.invalid',audience='STAFF'){
   const r=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({schoolCode:key==='foreign'?'INTAKE-B':'INTAKE-A',email,password,audience})}),data=await r.json();assert.equal(r.status,200,JSON.stringify(data));
   sessions[key]={cookie:r.headers.get('set-cookie').split(';')[0],csrfToken:data.csrfToken};return data;
  }
  async function owner(action){await db.exec('RESET ROLE');try{return await action();}finally{await db.exec('SET ROLE redeemer_runtime');}}
  for(const key of Object.keys(users))await login(key);
  await t.test('public receipt reaches Registrar; early enrollment, foreign access and invalid decisions are denied',async()=>{
   const receipt=await call(null,'/public/apply',{schoolCode:'INTAKE-A',firstName:'Fictional',lastName:'Intake Learner',guardianFirstName:'Fictional',guardianLastName:'Intake Guardian',relationship:'Parent',email:'intake-guardian@example.invalid',consent:true,requestedClassGroupId:group},201);
   const directory=await call('registrar','/ops/admissions');application=directory.applications.find(a=>a.application_number===receipt.applicationNumber);assert.ok(application);assert.equal(application.status,'RECEIVED');assert.equal(application.application_source,'PUBLIC');
   await call('registrar','/ops/admissions/'+application.id+'/enroll',{studentNumber:'TEST-INTAKE-A',classGroupId:group},409);
   await call('registrar','/ops/admissions/'+application.id+'/status',{status:'ACCEPTED'},409);
   await call('teacher','/ops/admissions/'+application.id+'/status',{status:'UNDER_REVIEW'},403);
   await call('foreign','/ops/admissions/'+application.id+'/status',{status:'UNDER_REVIEW'},404);
   await call('registrar','/ops/admissions/'+application.id+'/status',{status:'UNDER_REVIEW',reason:'Fictional intake review.'});
  });
  await t.test('Registrar prepares exam, Finance controls fee and leadership approves questions',async()=>{
   const start=new Date(Date.now()+20*60_000).toISOString(),end=new Date(Date.now()+80*60_000).toISOString();
   exam=(await call('registrar','/ops/admissions/entrance-exams',{title:'Fictional intake examination',gradeLabel:'Grade 4',mode:'ONLINE',venue:'Disposable fixture',startsAt:start,endsAt:end},201)).exam;
   const path='/ops/admissions/entrance-exams/'+exam.id;
   await call('registrar',path+'/assign',{applicationId:application.id},201);
   await call('registrar','/ops/finance/entrance-exams/'+exam.id+'/fee',{amount:'0',currency:'LRD'},403);
   await call('finance','/ops/finance/entrance-exams/'+exam.id+'/fee',{amount:'0',currency:'LRD'});
   question=(await call('registrar',path+'/questions',{prompt:'Fictional test: type school',questionType:'SHORT_ANSWER',answerKey:'school',points:2,sortOrder:1},201)).question;
   await call('registrar',path+'/schedule',{},409);await call('registrar',path+'/publish-questions',{},403);await call('teacher',path+'/publish-questions',{},403);
   await call('principal',path+'/publish-questions',{},201);await call('registrar',path+'/schedule',{});
   await call('registrar',path+'/applicants/'+application.id+'/credential',{guardianEmail:'intake-guardian@example.invalid'},409);
   await call('registrar','/ops/admissions/applications/'+application.id+'/guardian-email-verification',{firstName:'Fictional',lastName:'Intake Guardian',relationship:'Parent'},202);
   const verification=emails.find(m=>m.kind==='verify');assert.equal(verification.email,'intake-guardian@example.invalid');
   await call(null,'/api/candidate-exams/verify-email',{schoolCode:'INTAKE-A',code:verification.token});
   await call('registrar',path+'/applicants/'+application.id+'/credential',{guardianEmail:'intake-guardian@example.invalid'},201);
  });
  await t.test('candidate submits; separate reviewer approves; result does not decide admission',async()=>{
   // Advance only the disposable fixture's clock window, avoiding a 20-minute wait.
   await owner(()=>q("UPDATE admission_entrance_exams SET starts_at=now()-interval '1 minute' WHERE id=$1",[exam.id]));
   const credential=emails.find(m=>!['verify','result'].includes(m.kind));assert.ok(credential);
   const r=await fetch(base+'/api/candidate-exams/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://intake.example'},body:JSON.stringify({schoolCode:'INTAKE-A',code:credential.token})}),data=await r.json();assert.equal(r.status,200,JSON.stringify(data));
   sessions.candidate={cookie:r.headers.get('set-cookie').split(';')[0],csrfToken:data.csrfToken};
   const sitting=await call('candidate','/api/candidate-exams/start',{});attempt=sitting.attempt;assert.ok(!JSON.stringify(sitting).includes('answer_key'));
   await call('candidate','/api/candidate-exams/answers',{questionId:question.id,answer:'school'});await call('candidate','/api/candidate-exams/submit',{submissionId:randomUUID()});
   const path='/ops/admissions/entrance-exams/'+exam.id+'/attempts/'+attempt.id;
   await call('registrar',path+'/marking',{marks:[{questionId:question.id,points:2}],feedback:'Fictional workflow check.',revision:0});
   await call('registrar',path+'/approve-marks',{revision:1},403);await call('principal',path+'/approve-marks',{revision:1});
   const item=(await call('registrar','/ops/admissions')).applications.find(a=>a.id===application.id);assert.equal(item.status,'UNDER_REVIEW');assert.equal(item.converted_student_id,null);
   await call('principal',path+'/release-result',{guardianEmail:'intake-guardian@example.invalid'});
   const result=await call(null,'/api/candidate-exams/results',{schoolCode:'INTAKE-A',code:emails.find(m=>m.kind==='result').token});assert.equal(result.result.percentage,'100.00');assert.ok(!('decision'in result.result));
  });
  await t.test('authorized acceptance enrolls exactly once with preserved guardian and audit history',async()=>{
   await call('admin','/ops/admissions/'+application.id+'/status',{status:'ACCEPTED',reason:'Fictional staging-style workflow decision only.'});
   const body={studentNumber:'TEST-INTAKE-A',classGroupId:group};
   student=(await call('registrar','/ops/admissions/'+application.id+'/enroll',body,201)).student;
   await call('registrar','/ops/admissions/'+application.id+'/enroll',body,409);
   await call('registrar','/ops/admissions/'+application.id+'/status',{status:'WITHDRAWN'},409);
   const item=(await call('registrar','/ops/admissions')).applications.find(a=>a.id===application.id);assert.equal(item.status,'ENROLLED');assert.equal(item.converted_student_id,student.id);assert.ok(item.events.some(e=>e.eventType==='APPLICANT_ENROLLED'));
   await owner(async()=>{assert.equal((await q('SELECT count(*)::int AS n FROM students WHERE id=$1',[student.id])).rows[0].n,1);assert.equal((await q('SELECT count(*)::int AS n FROM student_guardians WHERE student_id=$1',[student.id])).rows[0].n,1);});
  });
  await t.test('student and guardian invitations activate only scoped family accounts without duplicate guardians',async()=>{
   failInvitation=true;
   await call('admin','/ops/portal-accounts',{type:'PARENT',studentId:student.id,fullName:'Fictional Intake Guardian',email:'intake-guardian@example.invalid',relationship:'Parent'},503);
   failInvitation=false;
   await owner(async()=>{assert.equal((await q("SELECT count(*)::int AS n FROM user_accounts WHERE email='intake-guardian@example.invalid'")).rows[0].n,0);assert.equal((await q('SELECT user_id FROM guardians g JOIN student_guardians sg ON sg.school_id=g.school_id AND sg.guardian_id=g.id WHERE sg.student_id=$1',[student.id])).rows[0].user_id,null);});
   for(const [key,type,email]of [['learner','STUDENT','intake-learner@example.invalid'],['parent','PARENT','intake-guardian@example.invalid']]){
    const body={type,studentId:student.id,fullName:type==='PARENT'?'Fictional Intake Guardian':'Fictional Intake Learner',email,relationship:'Parent'};
    await call('registrar','/ops/portal-accounts',body,403);
    await call('admin','/ops/portal-accounts',body,201);const invite=invitations.find(m=>m.email===email);assert.ok(invite);
    await call(null,'/auth/accept-invitation',{token:invite.token,newPassword:password},204);
    await call(null,'/auth/accept-invitation',{token:invite.token,newPassword:password},400);
    await login(key,email,'PORTAL');await call('admin','/ops/portal-accounts',body,409);
   }
   const learner=await call('learner','/ops/portal'),family=await call('parent','/ops/portal');assert.equal(learner.student.id,student.id);assert.equal(family.children.length,1);assert.equal(family.children[0].id,student.id);assert.equal(family.children[0].can_view_finance,false);
   await call('learner','/ops/admissions',undefined,403);await call('parent','/ops/admissions',undefined,403);
   await owner(async()=>{assert.equal((await q('SELECT count(*)::int AS n FROM student_guardians WHERE student_id=$1',[student.id])).rows[0].n,1);});
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.close();if(priorPreview===undefined)delete process.env.ENABLE_CANDIDATE_EXAM_PREVIEW;else process.env.ENABLE_CANDIDATE_EXAM_PREVIEW=priorPreview;}
});
