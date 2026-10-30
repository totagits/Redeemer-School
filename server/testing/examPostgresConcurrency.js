import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { issueCandidateSecret } from '../admissionExamCredential.js';
import { redeemExamCredential } from '../admissionExamRedemption.js';
import { createGuardianEmailChallenge } from '../admissionGuardianEmail.js';
import { startCandidateAttempt, saveCandidateAnswer, submitCandidateAttempt } from '../candidateExamSitting.js';
import { saveExamMarking, approveExamMarking } from '../admissionExamMarking.js';

test('independent PostgreSQL connections serialize examination writes', { timeout: 60_000 }, async t => {
  const url = new URL(process.env.EXAM_TEST_DATABASE_URL || 'postgresql://invalid/');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/redeemer_exam_test');
  const pool = new pg.Pool({ connectionString: url.href, max: 12, connectionTimeoutMillis: 2000 });
  const query = (sql, args) => pool.query(sql, args);
  async function begin(schoolId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout='8s'");
      await client.query('SET LOCAL ROLE redeemer_runtime');
      await client.query("SELECT set_config('app.current_school_id',$1,true)", [schoolId]);
      return client;
    } catch (error) { client.release(true); throw error; }
  }
  async function tenant(schoolId, action) {
    const client = await begin(schoolId);
    try { const value = await action(client); await client.query('COMMIT'); return value; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  // Hold the first writer's transaction open until PostgreSQL proves the second
  // connection is blocked on a lock. This tests real contention without timing guesses.
  async function blockedRace(schoolId, first, second) {
    const a = await begin(schoolId), b = await begin(schoolId);
    let waiting;
    try {
      const firstResult = await first(a);
      const pid = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      waiting = second(b).then(value => ({ value }), error => ({ error }));
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        const row = (await query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0];
        if (row?.wait_event_type === 'Lock') { blocked = true; break; }
        await delay(10);
      }
      assert.equal(blocked, true, 'second writer must contend on a database lock');
      await a.query('COMMIT');
      const secondResult = await waiting;
      await b.query(secondResult.error ? 'ROLLBACK' : 'COMMIT');
      return { firstResult, secondResult };
    } finally {
      await a.query('ROLLBACK');
      if (waiting) await waiting;
      await b.query('ROLLBACK');
      a.release(); b.release();
    }
  }
  async function fixture() {
    const school = randomUUID(), user = randomUUID(), leader = randomUUID(), application = randomUUID(), exam = randomUUID(), question = randomUUID();
    await query('INSERT INTO schools(id,code,name) VALUES($1,$2,\'Fictional concurrency school\')', [school, school]);
    for (const id of [user, leader]) await query("INSERT INTO user_accounts(id,school_id,email,password_hash,full_name,role) VALUES($1,$2,$3,'test-only','Fictional Marker','SCHOOL_ADMIN')", [id, school, id + '@example.invalid']);
    await query("INSERT INTO admission_applications(id,school_id,application_number,first_name,last_name,created_by) VALUES($1,$2,$3,'Fictional','Applicant',$4)", [application, school, application, user]);
    await query("INSERT INTO admission_guardians(school_id,application_id,first_name,last_name,relationship,email) VALUES($1,$2,'Fictional','Guardian','Parent','guardian@example.invalid')", [school, application]);
    await query("INSERT INTO admission_entrance_exams(id,school_id,title,grade_label,mode,starts_at,ends_at,venue,status,created_by) VALUES($1,$2,'Fictional contention exam','Grade 4','ONLINE',now()-interval '1 minute',now()+interval '1 hour','Local test','SCHEDULED',$3)", [exam, school, user]);
    await query('INSERT INTO admission_exam_assignments(school_id,exam_id,application_id) VALUES($1,$2,$3)', [school, exam, application]);
    await query("INSERT INTO admission_exam_fee_schedules(school_id,exam_id,amount,currency,configured_by) VALUES($1,$2,0,'LRD',$3)", [school, exam, user]);
    await query("INSERT INTO admission_exam_questions(id,school_id,exam_id,prompt,question_type,answer_key,points,sort_order,created_by) VALUES($1,$2,$3,'Explain your answer','SHORT_ANSWER','\"Private key\"',2,1,$4)", [question, school, exam, user]);
    await query('INSERT INTO admission_exam_question_sets(school_id,exam_id,questions,answer_keys,published_by) VALUES($1,$2,$3::jsonb,$4::jsonb,$5)', [school, exam, JSON.stringify([{ id: question, prompt: 'Explain your answer', question_type: 'SHORT_ANSWER', options: null, points: '2.00', sort_order: 1 }]), JSON.stringify({ [question]: 'Private key' }), user]);
    const secret = issueCandidateSecret();
    await query("INSERT INTO admission_exam_candidate_credentials(school_id,exam_id,application_id,token_hash,issued_by,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour')", [school, exam, application, secret.tokenHash, user]);
    return { school, user, leader, application, exam, question, secret, scope: { schoolId: school, examId: exam, applicationId: application } };
  }
  try {
    assert.equal((await query('SHOW server_version_num')).rows[0].server_version_num.slice(0, 2), '18');
    assert.equal((await query("SELECT to_regclass('public.schools') AS existing")).rows[0].existing, null, 'requires a fresh disposable database');
    const directory = new URL('../migrations/', import.meta.url);
    for (const file of (await readdir(directory)).filter(f => f.endsWith('.sql')).sort()) await query(await readFile(new URL(file, directory), 'utf8'));

    await t.test('one credential can create only one session under simultaneous redemption', async () => {
      const f = await fixture();
      const redeem = client => redeemExamCredential(client, { ...f.scope, token: f.secret.token });
      const { firstResult, secondResult } = await blockedRace(f.school, redeem, redeem);
      assert.equal(firstResult.ok, true);
      assert.equal(secondResult.value.ok, false);
      assert.equal((await query('SELECT count(*)::int AS n FROM admission_exam_candidate_sessions WHERE school_id=$1', [f.school])).rows[0].n, 1);
    });
    await t.test('concurrent guardian requests cannot bypass the three-send limit', async () => {
      const f = await fixture();
      const results = await Promise.all(Array.from({ length: 8 }, () => tenant(f.school, client => createGuardianEmailChallenge(client, { schoolId: f.school, applicationId: f.application, firstName: 'Fictional', lastName: 'Guardian', relationship: 'Parent', requestedBy: f.user }))));
      assert.equal(results.filter(r => r.ok).length, 3);
      assert.equal((await query('SELECT count(*)::int AS n FROM admission_guardian_email_verifications WHERE school_id=$1', [f.school])).rows[0].n, 3);
    });
    await t.test('submission locks out a simultaneous late answer save', async () => {
      const f = await fixture();
      await tenant(f.school, client => startCandidateAttempt(client, f.scope));
      await tenant(f.school, client => saveCandidateAnswer(client, f.scope, { questionId: f.question, answer: 'Original answer' }));
      const id = randomUUID();
      const { secondResult } = await blockedRace(f.school,
        client => submitCandidateAttempt(client, f.scope, { submissionId: id }),
        client => saveCandidateAnswer(client, f.scope, { questionId: f.question, answer: 'Late edit' }));
      assert.match(secondResult.error?.message || '', /active examination/);
      assert.equal((await query('SELECT answer FROM admission_exam_answers WHERE school_id=$1', [f.school])).rows[0].answer, 'Original answer');
    });
    await t.test('simultaneous retries with one submission reference are idempotent', async () => {
      const f = await fixture();
      await tenant(f.school, client => startCandidateAttempt(client, f.scope));
      const id = randomUUID(), submit = client => submitCandidateAttempt(client, f.scope, { submissionId: id });
      const { firstResult, secondResult } = await blockedRace(f.school, submit, submit);
      assert.equal(firstResult.submitted, true);
      assert.deepEqual(secondResult.value, firstResult);
    });
    await t.test('approval cannot be overwritten by a mark save already in flight', async () => {
      const f = await fixture();
      const started = await tenant(f.school, client => startCandidateAttempt(client, f.scope));
      await tenant(f.school, client => submitCandidateAttempt(client, f.scope, { submissionId: randomUUID() }));
      const scope = { ...f.scope, attemptId: started.attempt.id };
      const marks = { marks: [{ questionId: f.question, points: 1 }], feedback: 'Reviewed', revision: 0 };
      await tenant(f.school, client => saveExamMarking(client, scope, marks, f.user));
      const { secondResult } = await blockedRace(f.school,
        client => approveExamMarking(client, scope, 1, f.leader),
        client => saveExamMarking(client, scope, { ...marks, marks: [{ questionId: f.question, points: 2 }], revision: 1 }, f.user));
      assert.ok(secondResult.error);
      const marking = (await query('SELECT total_points,revision,approved_by FROM admission_exam_marking WHERE school_id=$1', [f.school])).rows[0];
      assert.equal(marking.total_points, '1.00'); assert.equal(marking.revision, 1); assert.equal(marking.approved_by, f.leader);
    });
  } finally { await pool.end(); }
});
