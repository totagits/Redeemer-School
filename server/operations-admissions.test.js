import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId = 'b210b463-c02c-4be9-9003-8a9005e8dbe5';
const userId = '721ddf68-1c98-4faa-9dc7-9161daa79870';
const applicationId = 'a210b463-c02c-4be9-9003-8a9005e8dbe5';
const studentId = 'c210b463-c02c-4be9-9003-8a9005e8dbe5';
const classId = 'd210b463-c02c-4be9-9003-8a9005e8dbe5';
const guardianId = 'e210b463-c02c-4be9-9003-8a9005e8dbe5';

class FakeClient {
  constructor() { this.statements = []; this.applicationStatus = 'ACCEPTED'; this.convertedStudentId = null; }
  async query(sql, params = []) {
    const statement = sql.replace(/\s+/g, ' ').trim();
    this.statements.push({ statement, params });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) return { rows: [], rowCount: 0 };
    if (statement.startsWith('SELECT a.id, a.application_number, a.first_name')) return { rows: [{ id: applicationId, application_number: 'RIA-APP-001', first_name: 'Test', last_name: 'Learner', status: this.applicationStatus, guardians: [], events: [{ eventType: 'APPLICATION_RECEIVED', actor: 'School Admin', occurredAt: '2026-10-23T08:00:00Z' }], requested_class_group_id: null, converted_student_id: null }], rowCount: 1 };
    if (statement.startsWith('SELECT id, code, name FROM education_levels')) return { rows: [], rowCount: 0 };
    if (statement.startsWith('SELECT id, name, grade_level FROM class_groups')) return { rows: [{ id: classId, name: 'Grade 4A', grade_level: 'Grade 4' }], rowCount: 1 };
    if (statement.startsWith('SELECT id, application_number, first_name, middle_name, last_name, date_of_birth, sex, campus_id, status, converted_student_id')) {
      return { rows: [{ id: applicationId, application_number: 'RIA-APP-001', first_name: 'Test', middle_name: null, last_name: 'Learner', date_of_birth: '2016-05-11', sex: 'F', campus_id: null, status: this.applicationStatus, converted_student_id: this.convertedStudentId }], rowCount: 1 };
    }
    if (statement.startsWith('SELECT id, academic_year_id, campus_id, name FROM class_groups')) return { rows: [{ id: classId, academic_year_id: 'year-id', campus_id: null, name: 'Grade 4A' }], rowCount: 1 };
    if (statement.startsWith('INSERT INTO students')) return { rows: [{ id: studentId, student_number: params[2], first_name: params[3], middle_name: null, last_name: params[5], date_of_birth: params[6], sex: params[7] }], rowCount: 1 };
    if (statement.startsWith('INSERT INTO class_enrollments')) return { rows: [], rowCount: 1 };
    if (statement.startsWith('INSERT INTO student_enrollment_history')) return { rows: [], rowCount: 1 };
    if (statement.startsWith('SELECT first_name, last_name, relationship, phone, email, is_primary FROM admission_guardians')) return { rows: [{ first_name: 'Alex', last_name: 'Guardian', relationship: 'Parent', phone: '0770000000', email: 'parent@example.test', is_primary: true }], rowCount: 1 };
    if (statement.startsWith('SELECT id FROM guardians')) return { rows: [], rowCount: 0 };
    if (statement.startsWith('INSERT INTO guardians')) return { rows: [{ id: guardianId }], rowCount: 1 };
    if (statement.startsWith('INSERT INTO student_guardians')) return { rows: [], rowCount: 1 };
    if (statement.startsWith("UPDATE admission_applications SET status='ENROLLED'")) { this.applicationStatus = 'ENROLLED'; this.convertedStudentId = studentId; return { rows: [], rowCount: 1 }; }
    if (statement.startsWith("INSERT INTO admission_events")) return { rows: [], rowCount: 1 };
    if (statement.startsWith('INSERT INTO audit_events')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected query: ${statement}`);
  }
  release() { this.released = true; }
}

async function startServer(t, permissions = ['admissions.write']) {
  const clients = [];
  const app = express(); app.use(express.json());
  app.use('/api/operations', createOperationsRouter({ authenticate(_req, _res, next) {
    const client = new FakeClient(); clients.push(client);
    _req.auth = { account: { id: userId, roles: ['SCHOOL_ADMIN'], permissions }, claims: { schoolId, userId, csrfToken: 'csrf-test-token' }, client }; next();
  } }));
  const server = createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, clients };
}
const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-test-token' };

test('accepted applicant converts to student, class enrollment, guardian relationship, history, and audit record', async t => {
  const { url, clients } = await startServer(t);
  const response = await fetch(`${url}/api/operations/admissions/${applicationId}/enroll`, { method: 'POST', headers, body: JSON.stringify({ studentNumber: 'RIA-2026-001', classGroupId: classId }) });
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.equal(result.student.student_number, 'RIA-2026-001');
  assert.equal(result.className, 'Grade 4A');
  assert.equal(result.guardianCount, 1);
  const sql = clients[0].statements.map(item => item.statement);
  assert.ok(sql.some(statement => statement.startsWith('INSERT INTO students')));
  assert.ok(sql.some(statement => statement.startsWith('INSERT INTO class_enrollments')));
  assert.ok(sql.some(statement => statement.startsWith('INSERT INTO student_guardians')));
  assert.ok(sql.some(statement => statement.startsWith('INSERT INTO student_enrollment_history')));
  assert.ok(sql.some(statement => statement.startsWith('INSERT INTO admission_events')));
  assert.ok(sql.some(statement => statement.startsWith('INSERT INTO audit_events')));
  assert.equal(sql.at(-1), 'COMMIT');
});

test('applicant enrollment requires admissions write permission', async t => {
  const { url, clients } = await startServer(t, ['admissions.read']);
  const response = await fetch(`${url}/api/operations/admissions/${applicationId}/enroll`, { method: 'POST', headers, body: JSON.stringify({ studentNumber: 'RIA-2026-001', classGroupId: classId }) });
  assert.equal(response.status, 403);
  assert.equal(clients[0].statements.at(-1).statement, 'ROLLBACK');
});

test('admissions directory returns guardian contacts and status activity for each application', async t => {
  const { url, clients } = await startServer(t, ['admissions.read']);
  const response = await fetch(`${url}/api/operations/admissions`);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.applications[0].events[0].eventType, 'APPLICATION_RECEIVED');
  assert.equal(result.applications[0].events[0].actor, 'School Admin');
  assert.ok(clients[0].statements.some(item => item.statement.includes('event_rows')));
});
