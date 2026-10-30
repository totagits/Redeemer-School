import { readCandidateAttempt,startCandidateAttempt,saveCandidateAnswer,submitCandidateAttempt } from './candidateExamSitting.js';
import { createOperationsRouter } from './operations.js';
import express from 'express';
import { once } from 'node:events';
import { createCandidateExamRouter } from './candidateExamAuth.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { issueCandidateSecret } from './admissionExamCredential.js';
import { redeemExamCredential } from './admissionExamRedemption.js';
import { createGuardianEmailChallenge, verifyGuardianEmail, findVerifiedGuardianEmail } from './admissionGuardianEmail.js';
import { validateCandidateExamSession } from './admissionExamSession.js';

test('candidate migrations and access rules execute in embedded PostgreSQL', async t => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const query = async (sql, params) => {
    const result = await db.query(sql, params);
    return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
  };
  const client = { query };
  async function tenant(schoolId, action) {
    await db.exec('BEGIN; SET LOCAL ROLE redeemer_runtime');
    try {
      await query("SELECT set_config('app.current_school_id',$1,true)", [schoolId]);
      const result = await action();
      await db.exec('COMMIT');
      return result;
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
  }
  try {
    const directory = new URL('./migrations/', import.meta.url);
    for (const file of (await readdir(directory)).filter(f => f.endsWith('.sql')).sort()) {
      await db.exec(await readFile(new URL(file, directory), 'utf8'));
    }
    const now = new Date();
    const start = new Date(now.valueOf() - 60_000);
    const end = new Date(now.valueOf() + 3_600_000);
    async function fixture(code) {
      const school = randomUUID(), user = randomUUID(), app = randomUUID(), exam = randomUUID();
      await query('INSERT INTO schools(id,code,name) VALUES($1,$2,$2)', [school, code]);
      await query("INSERT INTO user_accounts(id,school_id,email,password_hash,full_name,role) VALUES($1,$2,$3,'test-only','Test Registrar','REGISTRAR')", [user, school, code + '@example.invalid']);
      await query("INSERT INTO admission_applications(id,school_id,application_number,first_name,last_name,created_by) VALUES($1,$2,$3,'Fictional','Applicant',$4)", [app, school, code, user]);
      await query("INSERT INTO admission_entrance_exams(id,school_id,title,grade_label,mode,starts_at,ends_at,venue,status,created_by) VALUES($1,$2,'Test exam','Grade 4','ONLINE',$3,$4,'Test only','SCHEDULED',$5)", [exam, school, start, end, user]);
      await query('INSERT INTO admission_exam_assignments(school_id,exam_id,application_id) VALUES($1,$2,$3)', [school, exam, app]);
      await query("INSERT INTO admission_exam_fee_schedules(school_id,exam_id,amount,currency,configured_by) VALUES($1,$2,500,'LRD',$3)", [school, exam, user]);
      await query("INSERT INTO admission_exam_fee_settlements(school_id,exam_id,application_id,kind,channel,amount,currency,reference,verified_by) VALUES($1,$2,$3,'PAYMENT','CASH',500,'LRD',$4,$5)", [school, exam, app, code + '-receipt', user]);
      const secret = issueCandidateSecret();
      await query('INSERT INTO admission_exam_candidate_credentials(school_id,exam_id,application_id,token_hash,issued_by,expires_at) VALUES($1,$2,$3,$4,$5,$6)', [school, exam, app, secret.tokenHash, user, end]);
      return { school, user, app, exam, secret };
    }
    const a = await fixture('TEST-A'), b = await fixture('TEST-B');
    await t.test('runtime role cannot read another school or insert cross-school questions', async () => {
      await tenant(a.school, async () => {
        assert.equal((await query('SELECT id FROM admission_entrance_exams')).rows.length, 1);
        assert.equal((await query('SELECT id FROM admission_exam_candidate_credentials WHERE school_id=$1', [b.school])).rows.length, 0);
      });
      await assert.rejects(tenant(a.school, () => query("INSERT INTO admission_exam_questions(school_id,exam_id,prompt,question_type,answer_key,points,sort_order,created_by) VALUES($1,$2,'Cross school','SHORT_ANSWER','\"x\"',1,1,$3)", [b.school,b.exam,b.user])), e => e.code === '42501');
    });
    await t.test('invalid question JSON and absent choice options are rejected by SQL', async () => {
      for (const [options, key] of [[null,'0'], ['null','0'], ['["A","B"]','2'], ['["A","B"]','null'], ['{}','0']]) {
        await assert.rejects(tenant(a.school, () => query("INSERT INTO admission_exam_questions(school_id,exam_id,prompt,question_type,options,answer_key,points,sort_order,created_by) VALUES($1,$2,'Pick an answer','SINGLE_CHOICE',$3::jsonb,$4::jsonb,1,1,$5)", [a.school,a.exam,options,key,a.user])));
      }
    });
    await t.test('single use redemption returns a scoped session, never a question answer key', async () => {
      const args = { schoolId:a.school,examId:a.exam,applicationId:a.app,token:a.secret.token };
      const result = await tenant(a.school, () => redeemExamCredential(client,args));
      assert.equal(result.ok,true);
      assert.equal((await tenant(a.school, () => redeemExamCredential(client,args))).ok,false);
      const sessionArgs = {schoolId:a.school,examId:a.exam,sessionToken:result.sessionToken};
      const session = await tenant(a.school, () => validateCandidateExamSession(client,sessionArgs));
      assert.equal(session.ok,true);
      assert.equal(session.applicationId,a.app);
      assert.equal(Object.hasOwn(session,'answer_key'),false);
      assert.equal((await tenant(b.school, () => validateCandidateExamSession(client,{...sessionArgs,schoolId:b.school}))).ok,false);
      await query('DELETE FROM admission_exam_fee_settlements WHERE school_id=$1',[a.school]);
      assert.equal((await tenant(a.school, () => validateCandidateExamSession(client,sessionArgs))).ok,false);
    });
    await t.test('only one attempt per applicant and cross-school credential references are enforced', async () => {
      await tenant(a.school, () => query('INSERT INTO admission_exam_attempts(school_id,exam_id,application_id) VALUES($1,$2,$3)',[a.school,a.exam,a.app]));
      await assert.rejects(tenant(a.school, () => query('INSERT INTO admission_exam_attempts(school_id,exam_id,application_id) VALUES($1,$2,$3)',[a.school,a.exam,a.app])), e => e.code === '23505');
      const clean = await fixture('TEST-C');
      const credential = (await query('SELECT id FROM admission_exam_candidate_credentials WHERE school_id=$1',[b.school])).rows[0].id;
      await assert.rejects(tenant(clean.school, () => query('INSERT INTO admission_exam_candidate_sessions(school_id,exam_id,application_id,credential_id,session_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[clean.school,clean.exam,clean.app,credential,issueCandidateSecret().tokenHash,end])), e => e.code === '23503');
    });
    await t.test('rollback restores an unconsumed credential and removes its provisional session', async () => {
      const f = await fixture('TEST-ROLLBACK');
      const args = {schoolId:f.school,examId:f.exam,applicationId:f.app,token:f.secret.token};
      await assert.rejects(tenant(f.school, async () => {
        assert.equal((await redeemExamCredential(client,args)).ok,true);
        throw new Error('simulate interrupted login before commit');
      }), /interrupted login/);
      assert.equal((await query('SELECT id FROM admission_exam_candidate_sessions WHERE school_id=$1',[f.school])).rows.length,0);
      assert.equal((await tenant(f.school, () => redeemExamCredential(client,args))).ok,true);
    });
    await t.test('expired credentials and wrong-applicant credentials cannot create sessions', async () => {
      const f = await fixture('TEST-EXPIRED');
      const args = {schoolId:f.school,examId:f.exam,applicationId:f.app,token:f.secret.token};
      assert.equal((await tenant(f.school, () => redeemExamCredential(client,{...args,now:new Date(end.valueOf()+1)}))).ok,false);
      assert.equal((await tenant(f.school, () => redeemExamCredential(client,{...args,applicationId:b.app}))).ok,false);
      assert.equal((await query('SELECT id FROM admission_exam_candidate_sessions WHERE school_id=$1',[f.school])).rows.length,0);
    });
    await t.test('guardian mailbox proof is scoped, single-use and invalidated by an address change', async () => {
      const f = await fixture('TEST-GUARDIAN');
      const email='guardian@example.invalid';
      await query("INSERT INTO admission_guardians(school_id,application_id,first_name,last_name,relationship,email) VALUES($1,$2,'Test','Guardian','Parent',$3)",[f.school,f.app,email]);
      const scope={schoolId:f.school,applicationId:f.app};
      assert.equal(await tenant(f.school, () => findVerifiedGuardianEmail(client,{...scope,email})),null);
      const challenge=await tenant(f.school, () => createGuardianEmailChallenge(client,{...scope,firstName:'Test',lastName:'Guardian',relationship:'Parent',requestedBy:f.user}));
      assert.equal(challenge.ok,true);
      const stored=(await query('SELECT token_hash FROM admission_guardian_email_verifications WHERE id=$1',[challenge.id])).rows[0].token_hash;
      assert.notEqual(stored,challenge.token);
      assert.equal(stored.length,64);
      assert.equal((await tenant(b.school, () => verifyGuardianEmail(client,{schoolId:b.school,token:challenge.token}))).ok,false);
      assert.equal((await tenant(f.school, () => verifyGuardianEmail(client,{schoolId:f.school,token:challenge.token}))).ok,true);
      assert.equal((await tenant(f.school, () => verifyGuardianEmail(client,{schoolId:f.school,token:challenge.token}))).ok,false);
      assert.equal((await tenant(f.school, () => findVerifiedGuardianEmail(client,{...scope,email}))).email,email);
      await query("UPDATE admission_guardians SET email='changed@example.invalid' WHERE school_id=$1",[f.school]);
      assert.equal(await tenant(f.school, () => findVerifiedGuardianEmail(client,{...scope,email})),null);
      assert.equal(await tenant(f.school, () => findVerifiedGuardianEmail(client,{...scope,email:'changed@example.invalid'})),null);
    });
    await t.test('expired email challenges and nonexistent guardian recipients fail closed', async () => {
      const scope={schoolId:a.school,applicationId:a.app,firstName:'No',lastName:'Guardian',relationship:'Parent',requestedBy:a.user};
      assert.equal((await tenant(a.school, () => createGuardianEmailChallenge(client,scope))).ok,false);
      await query("INSERT INTO admission_guardians(school_id,application_id,first_name,last_name,relationship,email) VALUES($1,$2,'No','Guardian','Parent','expire@example.invalid')",[a.school,a.app]);
      const challenge=await tenant(a.school, () => createGuardianEmailChallenge(client,scope));
      await query("UPDATE admission_guardian_email_verifications SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1",[challenge.id]);
      assert.equal((await tenant(a.school, () => verifyGuardianEmail(client,{schoolId:a.school,token:challenge.token}))).ok,false);
    });
    await t.test('guardian verification sends are limited to three per application per fifteen minutes', async () => {
      const f=await fixture('TEST-THROTTLE');
      await query("INSERT INTO admission_guardians(school_id,application_id,first_name,last_name,relationship,email) VALUES($1,$2,'Rate','Limited','Parent','limit@example.invalid')",[f.school,f.app]);
      const args={schoolId:f.school,applicationId:f.app,firstName:'Rate',lastName:'Limited',relationship:'Parent',requestedBy:f.user};
      for(let i=0;i<3;i++)assert.equal((await tenant(f.school,()=>createGuardianEmailChallenge(client,args))).ok,true);
      assert.equal((await tenant(f.school,()=>createGuardianEmailChallenge(client,args))).ok,false);
    });
    await t.test('approved snapshots are immutable and answer saves are scoped, typed and closed at the deadline', async () => {
      const f=await fixture('TEST-SITTING'),scope={schoolId:f.school,examId:f.exam,applicationId:f.app};
      await assert.rejects(tenant(f.school,()=>startCandidateAttempt(client,scope)),/not approved/);
      const q=randomUUID();
      await query("INSERT INTO admission_exam_questions(id,school_id,exam_id,prompt,question_type,answer_key,points,sort_order,created_by) VALUES($1,$2,$3,'Explain your answer','SHORT_ANSWER','\"PRIVATE_ANSWER\"',1,1,$4)",[q,f.school,f.exam,f.user]);
      const snapshot=[{id:q,prompt:'Explain your answer',question_type:'SHORT_ANSWER',options:null,points:'1.00',sort_order:1,answer_key:'PRIVATE_ANSWER'}];
      await query('INSERT INTO admission_exam_question_sets(school_id,exam_id,questions,answer_keys,published_by) VALUES($1,$2,$3::jsonb,$4::jsonb,$5)',[f.school,f.exam,JSON.stringify(snapshot),JSON.stringify({[q]:'PRIVATE_ANSWER'}),f.user]);
      await assert.rejects(tenant(f.school,()=>query("UPDATE admission_exam_question_sets SET questions='[]' WHERE school_id=$1",[f.school])),e=>e.code==='42501');
      const started=await tenant(f.school,()=>startCandidateAttempt(client,scope));assert.equal(started.attempt.status,'IN_PROGRESS');
      assert.equal(JSON.stringify(started).includes('PRIVATE_ANSWER'),false);
      for(const answer of [4,{},'x'.repeat(4001)])await assert.rejects(tenant(f.school,()=>saveCandidateAnswer(client,scope,{questionId:q,answer})),/valid answer/);
      await tenant(f.school,()=>saveCandidateAnswer(client,scope,{questionId:q,answer:'My explanation'}));
      const read=await tenant(f.school,()=>readCandidateAttempt(client,scope));assert.equal(read.answers[0].answer,'My explanation');
      await assert.rejects(tenant(b.school,()=>saveCandidateAnswer(client,{schoolId:b.school,examId:f.exam,applicationId:f.app},{questionId:q,answer:'Other school'})));
      await query("UPDATE admission_entrance_exams SET starts_at=now()-interval '2 minutes',ends_at=now()-interval '1 minute' WHERE id=$1",[f.exam]);
      await assert.rejects(tenant(f.school,()=>saveCandidateAnswer(client,scope,{questionId:q,answer:'After deadline'})),/scheduled window/);
      await assert.rejects(tenant(f.school,()=>submitCandidateAttempt(client,scope,{submissionId:randomUUID()})),/scheduled window/);
      assert.equal((await query('SELECT answer FROM admission_exam_answers WHERE school_id=$1',[f.school])).rows[0].answer,'My explanation');
    });
    await t.test('candidate HTTP sign-in uses verified email, secure cookies, origin checks, CSRF and revocation', async () => {
      const f=await fixture('TEST-HTTP');
      await query("INSERT INTO admission_guardians(school_id,application_id,first_name,last_name,relationship,email) VALUES($1,$2,'Http','Guardian','Parent','http@example.invalid')",[f.school,f.app]);
      const challenge=await tenant(f.school,()=>createGuardianEmailChallenge(client,{schoolId:f.school,applicationId:f.app,firstName:'Http',lastName:'Guardian',relationship:'Parent',requestedBy:f.user}));
      const pool={connect:async()=>({query:async(sql,params)=>{
        if(sql==='BEGIN'){await db.exec('BEGIN; SET LOCAL ROLE redeemer_runtime');return {rows:[]};}
        return query(sql,params);
      },release(){}})};
      const app=express();app.use(express.json());
      let staffRole='REGISTRAR';
      const authenticate=async(req,res,next)=>{await db.exec('BEGIN; SET LOCAL ROLE redeemer_runtime');await query("SELECT set_config('app.current_school_id',$1,true)",[f.school]);req.auth={client:{query,release(){}},claims:{schoolId:f.school,userId:f.user,csrfToken:'ops-csrf'},account:{roles:[staffRole],permissions:['admissions.read','admissions.write']}};next();};
      app.use('/api/operations',createOperationsRouter({authenticate}));
      const oldPreview=process.env.ENABLE_CANDIDATE_EXAM_PREVIEW;process.env.ENABLE_CANDIDATE_EXAM_PREVIEW='true';
      app.use('/api/candidate-exams',createCandidateExamRouter({pool,secret:'test-secret-only-'.repeat(4),publicUrl:'https://school.example',enabled:true}));
      app.use('/disabled',createCandidateExamRouter({pool,secret:'test-secret-only-'.repeat(4),publicUrl:'https://school.example'}));
      const server=app.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const request=(path,body,cookie,csrf,origin='https://school.example')=>fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const login={schoolCode:'TEST-HTTP',code:f.secret.token};
      try{
        assert.equal((await request('/disabled/login',login)).status,503);
        assert.equal((await request('/api/candidate-exams/login',login,null,null,'https://wrong.example')).status,403);
        assert.equal((await request('/api/candidate-exams/login',login)).status,401);
        assert.equal((await request('/api/candidate-exams/verify-email',{schoolCode:'TEST-HTTP',code:challenge.token})).status,200);
        await query('UPDATE admission_exam_candidate_credentials SET guardian_verification_id=$2 WHERE school_id=$1',[f.school,challenge.id]);
        await query("UPDATE admission_entrance_exams SET status='DRAFT',starts_at=now()+interval '5 minutes' WHERE id=$1",[f.exam]);
        const op='/api/operations/admissions/entrance-exams/'+f.exam;
        assert.equal((await request(op+'/schedule',{},null,'ops-csrf')).status,409);
        const questionBody={prompt:'Choose the second option',questionType:'SINGLE_CHOICE',options:['First','Second'],answerKey:1,points:2,sortOrder:1};
        assert.equal((await request(op+'/questions',questionBody,null,'bad-csrf')).status,403);
        const authored=await request(op+'/questions',questionBody,null,'ops-csrf');assert.equal(authored.status,201);
        const q=(await authored.json()).question;
        assert.equal(Object.hasOwn(q,'answer_key'),false);
        assert.equal((await request(op+'/publish-questions',{},null,'ops-csrf')).status,403);
        staffRole='PRINCIPAL';
        assert.equal((await request(op+'/publish-questions',{},null,'ops-csrf')).status,201);
        assert.equal((await request(op+'/questions',{...questionBody,sortOrder:2},null,'ops-csrf')).status,409);
        assert.equal((await request(op+'/schedule',{},null,'ops-csrf')).status,200);
        await query("UPDATE admission_entrance_exams SET starts_at=now()-interval '1 minute' WHERE id=$1",[f.exam]);
        const signed=await request('/api/candidate-exams/login',login);assert.equal(signed.status,200);
        const header=signed.headers.get('set-cookie');assert.match(header,/HttpOnly; Secure; SameSite=Strict/);
        assert.match(header,/Path=\/api\/candidate-exams/);
        const cookie=header.split(';')[0],body=await signed.json();
        assert.equal(body.signedIn,true);assert.equal(Object.hasOwn(body,'token'),false);
        assert.equal((await request('/api/candidate-exams/session',null,cookie)).status,200);
        assert.equal((await request('/api/candidate-exams/start',{},cookie,'incorrect')).status,403);
        const startResponse=await request('/api/candidate-exams/start',{applicationId:b.app,examId:b.exam},cookie,body.csrfToken);assert.equal(startResponse.status,200);
        const started=await startResponse.json();assert.equal(started.questions.length,1);assert.equal(Object.hasOwn(started.questions[0],'answer_key'),false);
        assert.equal((await (await request('/api/candidate-exams/start',{},cookie,body.csrfToken)).json()).attempt.id,started.attempt.id);
        assert.equal((await request('/api/candidate-exams/answers',{questionId:randomUUID(),answer:0},cookie,body.csrfToken)).status,400);
        assert.equal((await request('/api/candidate-exams/answers',{questionId:q.id,answer:2},cookie,body.csrfToken)).status,400);
        assert.equal((await request('/api/candidate-exams/answers',{questionId:q.id,answer:0},cookie,body.csrfToken)).status,200);
        const resumed=await (await request('/api/candidate-exams/attempt',null,cookie)).json();assert.equal(resumed.answers[0].answer,0);
        const submission={submissionId:randomUUID()};
        const submitted=await request('/api/candidate-exams/submit',submission,cookie,body.csrfToken);assert.equal(submitted.status,200);
        const accepted=await submitted.json();assert.equal(accepted.submitted,true);
        const duplicate=await request('/api/candidate-exams/submit',submission,cookie,body.csrfToken);assert.equal(duplicate.status,200);assert.equal((await duplicate.json()).submittedAt,accepted.submittedAt);
        assert.equal((await request('/api/candidate-exams/submit',{submissionId:randomUUID()},cookie,body.csrfToken)).status,409);
        assert.equal((await request('/api/candidate-exams/answers',{questionId:q.id,answer:1},cookie,body.csrfToken)).status,409);
        const closed=await (await request('/api/candidate-exams/attempt',null,cookie)).json();assert.equal(closed.attempt.status,'SUBMITTED');assert.equal(closed.questions.length,0);

        assert.equal((await request('/api/candidate-exams/session',null,cookie+'corrupted')).status,401);
        assert.equal((await request('/api/candidate-exams/session',null,'redeemer_session=staff-token')).status,401);
        assert.equal((await request('/api/candidate-exams/logout',{},cookie)).status,403);
        assert.equal((await request('/api/candidate-exams/logout',{},cookie,body.csrfToken)).status,200);
        assert.equal((await request('/api/candidate-exams/session',null,cookie)).status,401);
        assert.equal((await request('/api/candidate-exams/login',login)).status,401);
        let limited=false;for(let i=0;i<12;i++)if((await request('/api/candidate-exams/login',{schoolCode:'TEST-HTTP',code:'invalid'})).status===429)limited=true;
        assert.equal(limited,true);
      }finally{if(oldPreview===undefined)delete process.env.ENABLE_CANDIDATE_EXAM_PREVIEW;else process.env.ENABLE_CANDIDATE_EXAM_PREVIEW=oldPreview;await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
    });
  } finally { await db.close(); }
});
