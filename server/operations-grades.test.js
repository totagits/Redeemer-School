import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId = 'b210b463-c02c-4be9-9003-8a9005e8dbe5';
const teacherId = '721ddf68-1c98-4faa-9dc7-9161daa79870';
const otherAssignment = '32f8f4d3-5d2a-4f36-bd4e-fc0f38a44f07';
const ownAssignment = '5fc7528a-f2e5-4bbc-8d54-3fb2012044ee';
const assessmentId = '13dfffb0-e1d0-4f2c-8878-bbbdace8e2fd';
const reportingPeriodId = 'f6aaf6d0-61a9-41ab-8f17-332b7ec07d59';

class FakeClient {
  constructor({ account, ownsAssignment = true, assessmentCreator = teacherId }) {
    this.account = account;
    this.ownsAssignment = ownsAssignment;
    this.assessmentCreator = assessmentCreator;
    this.statements = [];
    this.released = false;
  }

  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    this.statements.push({ sql: normalized, params });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) return { rows: [], rowCount: 0 };
    if (normalized.startsWith('INSERT INTO assessments')) {
      const teacherScoped = params[8] === true;
      if (params[1] !== ownAssignment || (teacherScoped && !this.ownsAssignment)) return { rows: [], rowCount: 0 };
      return { rows: [{ id: assessmentId, teacher_assignment_id: ownAssignment, reporting_period_id: params[2], title: params[4], assessment_type: params[5], max_score: params[6], due_at: params[7], status: 'OPEN' }], rowCount: 1 };
    }
    if (normalized.startsWith('UPDATE assessments a SET status = \'APPROVED\'')) {
      if (params[2] === this.assessmentCreator) return { rows: [], rowCount: 0 };
      return { rows: [{ id: assessmentId }], rowCount: 1 };
    }
    if (normalized.startsWith('INSERT INTO audit_events')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected query in grade workflow test: ${normalized}`);
  }

  release() { this.released = true; }
}

async function startServer(t, account, options = {}) {
  const clients = [];
  const app = express();
  app.use(express.json());
  app.use('/api/operations', createOperationsRouter({
    authenticate(req, _res, next) {
      const client = new FakeClient({ account, ...options });
      clients.push(client);
      req.auth = {
        account,
        claims: { schoolId, userId: account.id, csrfToken: 'csrf-test-token' },
        client,
      };
      next();
    },
  }));
  const server = createServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, clients };
}

const teacher = { id: teacherId, roles: ['TEACHER'], permissions: ['grades.enter'] };
const assessmentBody = { assignmentId: ownAssignment, reportingPeriodId, title: 'Quiz 1', assessmentType: 'QUIZ', maxScore: 20, dueAt: null };

test('teacher can create an assessment for their assigned class and subject', async t => {
  const { url, clients } = await startServer(t, teacher);
  const response = await fetch(`${url}/api/operations/assessments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-test-token' }, body: JSON.stringify(assessmentBody),
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).assessment.status, 'OPEN');
  assert.equal((await Promise.resolve(clients[0].statements.find(item=>item.sql.startsWith('INSERT INTO assessments')).params[2])), reportingPeriodId);
  assert.ok(clients[0].statements.some(item => item.sql.startsWith('INSERT INTO audit_events')));
  assert.equal(clients[0].statements.at(-1).sql, 'COMMIT');
});

test('teacher cannot create an assessment for another teacher assignment', async t => {
  const { url, clients } = await startServer(t, teacher, { ownsAssignment: false });
  const response = await fetch(`${url}/api/operations/assessments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-test-token' }, body: JSON.stringify({ ...assessmentBody, assignmentId: otherAssignment }),
  });
  assert.equal(response.status, 403);
  assert.equal(clients[0].statements.some(item => item.sql.startsWith('INSERT INTO audit_events')), false);
  assert.equal(clients[0].statements.at(-1).sql, 'ROLLBACK');
});

test('assessment creation requires grades.enter permission', async t => {
  const account = { id: teacherId, roles: ['TEACHER'], permissions: ['attendance.read'] };
  const { url, clients } = await startServer(t, account);
  const response = await fetch(`${url}/api/operations/assessments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-test-token' }, body: JSON.stringify(assessmentBody),
  });
  assert.equal(response.status, 403);
  assert.equal(clients[0].statements.some(item => item.sql.startsWith('INSERT INTO assessments')), false);
});

test('only a Principal can sign off year-end report cards even with the grade publication permission', async t => {
  const account = { id: teacherId, roles: ['SCHOOL_ADMIN'], permissions: ['grades.publish'] };
  const { url, clients } = await startServer(t, account);
  const response = await fetch(`${url}/api/operations/year-end-report-cards/approve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-test-token' },
    body: JSON.stringify({ academicYearId: 'year-1', classGroupId: 'class-1', studentId: 'student-1' }),
  });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /Only a Principal/);
  assert.equal(clients[0].statements.at(-1).sql, 'ROLLBACK');
});

test('assessment creator cannot approve their own submitted marks', async t => {
  const principal = { id: teacherId, roles: ['PRINCIPAL'], permissions: ['grades.moderate'] };
  const { url, clients } = await startServer(t, principal, { assessmentCreator: teacherId });
  const response = await fetch(`${url}/api/operations/assessments/${assessmentId}/approve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-test-token' }, body: JSON.stringify({}),
  });
  assert.equal(response.status, 403);
  assert.equal(clients[0].statements.some(item => item.sql.startsWith('INSERT INTO audit_events')), false);
  assert.equal(clients[0].statements.at(-1).sql, 'ROLLBACK');
});


test('student portal shows scores for published assessments when an older score has no publication timestamp', async t => {
  const studentId = 'student-1';
  const studentAccount = { id: 'student-user-1', roles: ['STUDENT'], permissions: ['student.portal.read'] };
  const client = {
    statements: [],
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      this.statements.push({ sql: normalized, params });
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) return { rows: [], rowCount: 0 };
      if (normalized.startsWith('SELECT s.id, s.student_number')) {
        return { rows: [{ id: studentId, student_number: 'RIA-001', first_name: 'Crystal', last_name: 'Nyemah', class_name: 'Grade 4', academic_year: '2027-2028' }], rowCount: 1 };
      }
      if (normalized.includes('learner_subjects')) {
        assert.match(normalized, /JOIN teacher_subject_assignments ta/);
        return { rows: [{ subject_name: 'Mathematics', weekly_minutes: null, periods_per_week: null, required: false, learning_objectives: null }], rowCount: 1 };
      }
      if (normalized.includes('FROM assessment_scores sc JOIN assessments a')) {
        assert.match(normalized, /a\.status = 'PUBLISHED'/);
        assert.doesNotMatch(normalized, /sc\.published_at IS NOT NULL/);
        return { rows: [{ title: 'Math Quiz 1', assessment_type: 'QUIZ', max_score: '20', score: '17', feedback: null, published_at: null, subject_name: 'Mathematics' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  const app = express();
  app.use(express.json());
  app.use('/api/operations', createOperationsRouter({
    authenticate(req, _res, next) {
      req.auth = { account: studentAccount, claims: { schoolId, userId: studentAccount.id }, client };
      next();
    },
  }));
  const server = createServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/operations/portal`);
  assert.equal(response.status, 200);
  const portal = await response.json();
  assert.equal(portal.grades.length, 1);
  assert.equal(portal.grades[0].score, '17');
  assert.equal(portal.subjects[0].subject_name, 'Mathematics');
  assert.equal(client.statements.at(-1).sql, 'COMMIT');
});
