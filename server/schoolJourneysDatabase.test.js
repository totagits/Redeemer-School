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

// Real SQL, runtime RLS, login cookies and CSRF. Every record lives only in this
// disposable database; these tests never connect to staging or send messages.
test('authenticated school journeys preserve teacher review and family privacy',async t=>{
 const db=new PGlite({extensions:{pgcrypto}});
 const q=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0};};
 const school=randomUUID(),foreign=randomUUID(),users={},sessions={};
 const password=randomBytes(24).toString('base64url'),hash=await hashPassword(password);
 const ids=Object.fromEntries(['year','subject','class','otherClass','assignment','period','learner','otherLearner','guardian'].map(k=>[k,randomUUID()]));
 let server;
 try{
  const dir=new URL('./migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort()){
   await db.exec(await readFile(new URL(name,dir),'utf8'));
   if(name==='001_school_operations_foundation.sql')for(const [id,code]of [[school,'JOURNEY-A'],[foreign,'JOURNEY-B']])await q('INSERT INTO schools(id,code,name) VALUES($1,$2,$2)',[id,code]);
  }
  for(const [key,role,tenant]of [['admin','SCHOOL_ADMIN',school],['teacher','TEACHER',school],['unassigned','TEACHER',school],['principal','PRINCIPAL',school],['student','STUDENT',school],['otherStudent','STUDENT',school],['parent','PARENT',school],['foreignAdmin','SCHOOL_ADMIN',foreign]]){
   const id=randomUUID();users[key]=id;
   await q('INSERT INTO user_accounts(id,school_id,email,password_hash,full_name,role,must_reset_password) VALUES($1,$2,$3,$4,$5,$6,false)',[id,tenant,key+'@example.invalid',hash,'Fictional '+key,role==='PRINCIPAL'?'SCHOOL_ADMIN':role]);
   await q('INSERT INTO user_role_assignments(school_id,user_id,role_id) SELECT $1,$2,id FROM school_roles WHERE school_id=$1 AND code=$3',[tenant,id,role]);
  }
  await q("INSERT INTO academic_years(id,school_id,name,starts_on,ends_on,status) VALUES($1,$2,'Fictional year','2000-01-01','2099-12-31','ACTIVE')",[ids.year,school]);
  await q("INSERT INTO subjects(id,school_id,code,name) VALUES($1,$2,'FICTIONAL-MATH','Fictional Mathematics')",[ids.subject,school]);
  for(const [id,name]of [[ids.class,'Fictional class A'],[ids.otherClass,'Fictional class B']])await q("INSERT INTO class_groups(id,school_id,academic_year_id,name,grade_level,section) VALUES($1,$2,$3,$4,'4','TEST')",[id,school,ids.year,name]);
  await q("INSERT INTO teacher_profiles(school_id,user_id,employee_number,employment_type) VALUES($1,$2,'TEST-TEACHER','FULL_TIME')",[school,users.teacher]);
  await q("INSERT INTO teacher_subject_assignments(id,school_id,teacher_id,subject_id,class_group_id,academic_year_id,assigned_by,effective_from) VALUES($1,$2,$3,$4,$5,$6,$7,'2000-01-01')",[ids.assignment,school,users.teacher,ids.subject,ids.class,ids.year,users.admin]);
  await q("INSERT INTO grade_reporting_periods(id,school_id,academic_year_id,label,sort_order,created_by) VALUES($1,$2,$3,'1st',1,$4)",[ids.period,school,ids.year,users.admin]);
  for(const [id,user,group,number]of [[ids.learner,users.student,ids.class,'TEST-A'],[ids.otherLearner,users.otherStudent,ids.otherClass,'TEST-B']]){
   await q("INSERT INTO students(id,school_id,student_number,first_name,last_name) VALUES($1,$2,$3,'Fictional',$3)",[id,school,number]);
   await q('INSERT INTO class_enrollments(school_id,student_id,class_group_id) VALUES($1,$2,$3)',[school,id,group]);
   await q('INSERT INTO student_portal_links(school_id,student_id,user_id,linked_by) VALUES($1,$2,$3,$4)',[school,id,user,users.admin]);
  }
  await q("INSERT INTO guardians(id,school_id,user_id,first_name,last_name) VALUES($1,$2,$3,'Fictional','Guardian')",[ids.guardian,school,users.parent]);
  await q("INSERT INTO student_guardians(school_id,student_id,guardian_id,relationship,can_view_results,can_view_finance) VALUES($1,$2,$3,'Parent',true,false)",[school,ids.learner,ids.guardian]);
  await db.exec('SET ROLE redeemer_runtime');
  const client={query:q,release(){}};
  const pool={query:q,connect:async()=>client};
  const auth=createAuthRouter({pool,secret:randomBytes(48).toString('base64url'),secureCookie:false});
  const app=express();app.use(express.json());app.use('/api/auth',auth);app.use('/api/operations',createOperationsRouter({authenticate:auth.requireAuth}));
  server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  async function call(actor,path,data,expected=200,headers={}){
   const session=sessions[actor];const response=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{}),...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});
   const result=await response.json().catch(()=>({}));assert.equal(response.status,expected,path+': '+JSON.stringify(result));return result;
  }
  async function owner(action){await db.exec('RESET ROLE');try{return await action();}finally{await db.exec('SET ROLE redeemer_runtime');}}
  await t.test('real sessions distinguish staff/family and enforce authentication and CSRF',async()=>{
   await call(null,'/api/operations/portal',undefined,401);
   for(const key of Object.keys(users)){
    const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({schoolCode:key==='foreignAdmin'?'JOURNEY-B':'JOURNEY-A',email:key+'@example.invalid',password,audience:['student','otherStudent','parent'].includes(key)?'PORTAL':'STAFF'})});
    const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));sessions[key]={cookie:response.headers.get('set-cookie').split(';')[0],csrfToken:result.csrfToken};
    assert.ok(result.account.roles.length);assert.ok(!('password_hash'in result.account));
   }
   for(const [key,audience]of [['teacher','PORTAL'],['student','STAFF']])await call(null,'/api/auth/login',{schoolCode:'JOURNEY-A',email:key+'@example.invalid',password,audience},403);
   await call('student','/api/operations/subjects',{code:'NO',name:'Forbidden'},403);
   await call('admin','/api/operations/subjects',{code:'CSRF',name:'Rejected'},403,{'X-CSRF-Token':'wrong'});
  });
  await t.test('school setup validates dates, preserves subject retry identity and rejects foreign year',async()=>{
   await call('admin','/api/operations/academic-years',{name:'Invalid',startsOn:'2026-11-02',endsOn:'2026-11-01'},400);
   const year=(await call('admin','/api/operations/academic-years',{name:'Fictional API year',startsOn:'2026-01-01',endsOn:'2026-12-31'},201)).academicYear;
   const subject=(await call('admin','/api/operations/subjects',{code:'API-MATH',name:'Fictional API subject'},200)).subject;
   const retry=(await call('admin','/api/operations/subjects',{code:'API-MATH',name:'Fictional API subject'},200)).subject;assert.equal(subject.id,retry.id);
   await call('foreignAdmin','/api/operations/classes',{academicYearId:year.id,name:'Cross-school class',gradeLevel:'4',section:'A'},400);
  });
  let assessment,submission;
  await t.test('assigned teaching draft stays private until published to linked families',async()=>{
   const setup=await call('teacher','/api/operations/setup');assert.equal(setup.assignments.length,1);assert.equal(setup.assignments[0].teacher_id,users.teacher);assert.equal(setup.assignments[0].subject_id,ids.subject);
   const body={assignmentId:ids.assignment,title:'Fictional handout',materialType:'HANDOUT',description:'Fictional classroom resource.'};
   await call('unassigned','/api/operations/teaching-materials',body,403);
   const material=(await call('teacher','/api/operations/teaching-materials',body,201)).material;
   assert.equal((await call('student','/api/operations/portal')).resources.length,0);
   assert.equal((await call('parent','/api/operations/portal')).children[0].resources.length,0);
   await call('teacher','/api/operations/teaching-materials/'+material.id+'/publish',{});
   assert.equal((await call('student','/api/operations/portal')).resources[0].title,body.title);
   assert.equal((await call('parent','/api/operations/portal')).children[0].resources[0].title,body.title);
   assert.equal((await call('otherStudent','/api/operations/portal')).resources.length,0);
  });
  await t.test('assignment submission, return and resubmission stay scoped to learner and assigned teacher',async()=>{
   assessment=(await call('teacher','/api/operations/assessments',{assignmentId:ids.assignment,reportingPeriodId:ids.period,title:'Fictional assignment',assessmentType:'ASSIGNMENT',maxScore:10},201)).assessment;
   const work={assessmentId:assessment.id,responseText:'Fictional answer for database workflow verification.'};
   await call('otherStudent','/api/operations/portal/submissions',work,404);
   submission=(await call('student','/api/operations/portal/submissions',work,201)).submission;
   await call('student','/api/operations/portal/submissions',work,409);
   await call('unassigned','/api/operations/teaching/submissions/'+submission.id+'/review',{status:'REVIEWED',feedback:'Not assigned',score:8},404);
   await call('teacher','/api/operations/teaching/submissions/'+submission.id+'/review',{status:'RETURNED',feedback:'Fictional revision requested.'});
   await call('student','/api/operations/portal/submissions',{...work,responseText:'Fictional revised answer.'},201);
   await call('teacher','/api/operations/teaching/submissions/'+submission.id+'/review',{status:'REVIEWED',feedback:'Fictional feedback',score:8});
   assert.equal((await call('student','/api/operations/portal')).grades.length,0);
   assert.equal((await call('parent','/api/operations/portal')).children[0].grades.length,0);
  });
  await t.test('marks require separate review and publication before family visibility; published marks lock',async()=>{
   const path='/api/operations/assessments/'+assessment.id;
   await call('teacher',path+'/submit',{});
   await call('teacher',path+'/approve',{},403);
   await call('principal',path+'/publish',{},400);
   await call('principal',path+'/approve',{});
   assert.equal((await call('student','/api/operations/portal')).grades.length,0);
   await call('principal',path+'/publish',{});
   const learner=await call('student','/api/operations/portal'),family=await call('parent','/api/operations/portal');
   assert.equal(Number(learner.grades[0].score),8);assert.equal(Number(family.children[0].grades[0].score),8);
   assert.equal((await call('otherStudent','/api/operations/portal')).grades.length,0);
   await call('teacher',path+'/scores',{scores:[{studentId:ids.learner,score:9}]},400);
   await call('foreignAdmin',path+'/roster',undefined,404);
   await owner(()=>q('UPDATE student_guardians SET can_view_results=false WHERE school_id=$1 AND guardian_id=$2',[school,ids.guardian]));
   assert.equal((await call('parent','/api/operations/portal')).children[0].grades.length,0);
  });
  await t.test('attendance retries reuse the session; correction requires a reason and reaches family portals',async()=>{
   const date=new Date().toISOString().slice(0,10),body={assignmentId:ids.assignment,date,time:'08:00',topic:'Fictional lesson',attendance:[{studentId:ids.learner,status:'PRESENT'}]};
   await call('unassigned','/api/operations/attendance/roll-call',body,403);
   const first=await call('teacher','/api/operations/attendance/roll-call',body,201);
   const retry=await call('teacher','/api/operations/attendance/roll-call',body,201);assert.equal(first.sessionId,retry.sessionId);
   const corrected={...body,attendance:[{studentId:ids.learner,status:'LATE'}]};
   await call('teacher','/api/operations/attendance/roll-call',corrected,400);
   await call('teacher','/api/operations/attendance/roll-call',{...corrected,correctionReason:'Fictional correction for test verification.'},201);
   assert.equal((await call('student','/api/operations/portal')).attendance[0].status,'LATE');
   assert.equal((await call('parent','/api/operations/portal')).children[0].attendance[0].status,'LATE');
   assert.equal((await call('otherStudent','/api/operations/portal')).attendance.length,0);
   assert.equal((await owner(()=>q('SELECT count(*)::int AS n FROM attendance_correction_history'))).rows[0].n,1);
  });
  await t.test('student and guardian conversations reach only authorized participants and keep read state',async()=>{
   const message={teacherId:users.teacher,subject:'Fictional lesson question',body:'Fictional test message; no external delivery.'};
   await call('otherStudent','/api/operations/portal/messages',message,403);
   const conversation=await call('student','/api/operations/portal/messages',message,201),path='/api/operations/portal/messages/'+conversation.threadId;
   await call('otherStudent',path,undefined,403);await call('unassigned',path,undefined,403);await call('foreignAdmin',path,undefined,404);
   assert.equal((await call('teacher',path)).messages[0].body,message.body);
   await call('teacher',path,{body:'Fictional teacher reply.'},201);
   assert.equal((await call('student',path)).messages.length,2);
   await call('parent','/api/operations/portal/family-messages',{studentId:ids.otherLearner,subject:'Wrong learner',body:'Must be rejected.'},403);
   const family=await call('parent','/api/operations/portal/family-messages',{studentId:ids.learner,subject:'Fictional office question',body:'Fictional guardian message.'},201);
   const familyPath='/api/operations/portal/family-messages/'+family.threadId;
   assert.equal((await call('admin',familyPath)).messages.length,1);
   await call('admin','/api/operations/communications/family-threads/'+family.threadId+'/reply',{body:'Fictional office reply.'},201);
   assert.equal((await call('parent',familyPath)).messages.length,2);
   await call('teacher',familyPath,undefined,403);await call('foreignAdmin',familyPath,undefined,404);
   const teacherCommunications=await call('teacher','/api/operations/communications');assert.equal(teacherCommunications.familyThreads.length,0);assert.equal(teacherCommunications.canManageFamilyMessages,false);
   await call('teacher','/api/operations/communications/family-threads/'+family.threadId+'/reply',{body:'Must be rejected.'},403);
   const notifications=(await call('student','/api/operations/portal/workflows')).notifications;assert.ok(notifications.length);
   await call('otherStudent','/api/operations/portal/notifications/'+notifications[0].id+'/read',{},404);
   await call('student','/api/operations/portal/notifications/'+notifications[0].id+'/read',{});
   assert.ok((await call('student','/api/operations/portal/workflows')).notifications.find(n=>n.id===notifications[0].id).read_at);
  });
  await t.test('fictional invoices and receipts reconcile by currency and honor guardian finance access',async()=>{
   for(const [currency,amount]of [['LRD',100],['USD',10]]){
    const invoice=(await call('admin','/api/operations/finance/invoices',{studentId:ids.learner,academicYearId:ids.year,invoiceNumber:'TEST-'+currency,currency,description:'Fictional fee only',amount},201)).invoice;
    await call('student','/api/operations/finance/payments',{invoiceId:invoice.id,channel:'CASH',amount},403);
    await call('admin','/api/operations/finance/payments',{invoiceId:invoice.id,channel:'CASH',amount:amount+1},400);
    const paid=await call('admin','/api/operations/finance/payments',{invoiceId:invoice.id,channel:'CASH',amount,note:'Fictional local test; no real money.'},201);
    assert.equal(paid.invoiceStatus,'PAID');assert.equal(paid.payment.currency,currency);assert.ok(paid.payment.receipt_number);
    await call('admin','/api/operations/finance/payments',{invoiceId:invoice.id,channel:'CASH',amount},404);
   }
   const learner=await call('student','/api/operations/portal');assert.equal(learner.invoices.length,2);assert.equal(learner.receipts.length,2);
   assert.deepEqual(learner.invoices.map(i=>[i.currency,Number(i.balance)]).sort(),[['LRD',0],['USD',0]]);
   const parent=await call('parent','/api/operations/portal');assert.equal(parent.children[0].financeVisible,false);assert.equal(parent.children[0].invoices.length,0);assert.equal(parent.children[0].receipts.length,0);
   await owner(()=>q('UPDATE student_guardians SET can_view_finance=true WHERE school_id=$1 AND guardian_id=$2',[school,ids.guardian]));
   assert.equal((await call('parent','/api/operations/portal')).children[0].invoices.length,2);
   assert.equal((await call('otherStudent','/api/operations/portal')).invoices.length,0);
   await call('foreignAdmin','/api/operations/finance/invoices',{studentId:ids.learner,academicYearId:ids.year,invoiceNumber:'TEST-FOREIGN',currency:'LRD',description:'Must not issue',amount:1},400);
  });
  await t.test('procurement requires independent approval and receiving reconciles stock without over-receipt',async()=>{
   const item=(await call('admin','/api/operations/inventory/items',{sku:'TEST-BOOK',name:'Fictional books',category:'TEST',unit:'each'},201)).item;
   const location=(await call('admin','/api/operations/inventory/locations',{code:'TEST-STORE',name:'Fictional store'},201)).location;
   const request=(await call('admin','/api/operations/inventory/requests',{justification:'Fictional procurement test only',currency:'LRD',lines:[{itemId:item.id,quantity:5,estimatedUnitCost:2}]},201)).request;
   const decision='/api/operations/inventory/requests/'+request.id+'/decision';
   await call('student',decision,{decision:'APPROVE'},403);
   await call('admin',decision,{decision:'APPROVE'},409);
   await call('principal',decision,{decision:'APPROVE'});
   const order=(await call('admin','/api/operations/inventory/orders',{requestId:request.id,vendorName:'Fictional local-test vendor',currency:'LRD',lines:[{itemId:item.id,quantity:5,unitPrice:2}]},201)).order;
   const orderPath='/api/operations/inventory/orders/'+order.id;
   await call('admin',orderPath+'/approve',{},409);await call('principal',orderPath+'/approve',{});
   await call('admin',orderPath+'/receive',{lines:[{itemId:item.id,locationId:location.id,quantity:6}]},400);
   await call('admin',orderPath+'/receive',{lines:[{itemId:item.id,locationId:location.id,quantity:5}]});
   await call('admin',orderPath+'/receive',{lines:[{itemId:item.id,locationId:location.id,quantity:1}]},409);
   const inventory=await call('admin','/api/operations/inventory');assert.equal(Number(inventory.balances.find(b=>b.item_id===item.id).on_hand),5);
   await call('admin','/api/operations/inventory/movements',{itemId:item.id,locationId:location.id,quantity:6,type:'ISSUE',reason:'Fictional over-issue must fail'},409);
   assert.equal((await call('foreignAdmin','/api/operations/inventory')).items.length,0);
  });
  await t.test('logout revokes the actual session cookie',async()=>{
   const response=await fetch(base+'/api/auth/logout',{method:'POST',headers:{Cookie:sessions.student.cookie,'X-CSRF-Token':sessions.student.csrfToken}});
   assert.equal(response.status,204);await call('student','/api/operations/portal',undefined,401);
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.close();}
});
