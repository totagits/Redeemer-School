import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId = 'b210b463-c02c-4be9-9003-8a9005e8dbe5';
const studentId = '721ddf68-1c98-4faa-9dc7-9161daa79870';
const userId = '32f8f4d3-5d2a-4f36-bd4e-fc0f38a44f07';

class FakeClient {
  constructor({ studentFound = true } = {}) { this.studentFound = studentFound; this.statements = []; }
  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    this.statements.push({ sql: normalized, params });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) return { rows: [], rowCount: 0 };
    if (normalized.startsWith('SELECT st.id, st.student_number') && normalized.includes('WHERE st.school_id = $1 AND st.id = $2')) return this.studentFound ? { rows: [{ id: studentId, student_number: 'RIA-001', first_name: 'Test', middle_name: null, last_name: 'Learner', preferred_name: null, status: 'ACTIVE', date_of_birth: '2015-01-01', sex: 'FEMALE', external_learner_id: 'MOE-01', class_name: 'Grade 1', class_group_id: 'class-1', academic_year_name: '2026-2027', enrolled_on: '2026-09-01', enrollment_status: 'ACTIVE', attendance_records: 3, open_invoices: 1 }], rowCount: 1 } : { rows: [], rowCount: 0 };
    if (normalized.startsWith('SELECT h.id, h.status, h.effective_on')) return { rows: [], rowCount: 0 };
    if (normalized.startsWith('SELECT g.id, g.first_name')) return { rows: [{ id: 'guardian-1', first_name: 'Family', last_name: 'Member', email: 'family@example.test', phone: '+231000000000', relationship: 'Parent', is_primary: true }], rowCount: 1 };
    if (normalized.startsWith('SELECT count(*)::int AS column_count FROM information_schema.columns')) return { rows: [{ column_count: 0 }], rowCount: 1 };
    if (normalized.startsWith('SELECT id,code,name,required_for_admission FROM document_categories')) return { rows: [], rowCount: 0 };
    if (normalized.startsWith('SELECT cs.scheduled_at')) return { rows: [], rowCount: 0 };
    if (normalized.startsWith('SELECT a.title')) return { rows: [], rowCount: 0 };
    if (normalized.startsWith('SELECT fi.invoice_number')) return { rows: [], rowCount: 0 };
    if (normalized.startsWith('UPDATE students SET')) return { rows: [{ id: studentId, student_number: 'RIA-001', first_name: params[2], middle_name: null, last_name: params[4], preferred_name: null, date_of_birth: '2015-01-01', sex: 'FEMALE', external_learner_id: 'MOE-01', status: 'ACTIVE' }], rowCount: 1 };
    if (normalized.startsWith('SELECT id,first_name,last_name,email,phone FROM guardians')) return { rows: [], rowCount: 0 };
    if (normalized.startsWith('SELECT 1 FROM student_guardians')) return { rows: [], rowCount: 0 };
    if (normalized.startsWith('SELECT COUNT(*)::int AS total FROM student_guardians')) return { rows: [{ total: 0 }], rowCount: 1 };
    if (normalized.startsWith('INSERT INTO guardians')) return { rows: [{ id: 'guardian-new', first_name: params[1], last_name: params[2], email: params[3], phone: params[4] }], rowCount: 1 };
    if (normalized.startsWith('SELECT id FROM students')) return { rows: [{ id: studentId }], rowCount: 1 };
    if (normalized.startsWith('INSERT INTO student_guardians') || normalized.startsWith('INSERT INTO audit_events')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected query in student workflow test: ${normalized}`);
  }
  release() {}
}

async function startServer(t, account, options = {}) {
  const clients = [];
  const app = express(); app.use(express.json());
  app.use('/api/operations', createOperationsRouter({ authenticate(req, _res, next) {
    const client = new FakeClient(options); clients.push(client);
    req.auth = { account, claims: { schoolId, userId: account.id, csrfToken: 'csrf-test-token' }, client }; next();
  } }));
  const server = createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, clients };
}
const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-test-token' };

test('student profile is scoped to the school and masks sensitive details without the permission', async t => {
  const { url, clients } = await startServer(t, { id: userId, roles: ['REGISTRAR'], permissions: ['students.read'] });
  const response = await fetch(`${url}/api/operations/students/${studentId}`);
  assert.equal(response.status, 200);
  const { student } = await response.json();
  assert.equal(student.date_of_birth, null);
  assert.equal(student.sex, null);
  assert.equal(student.external_learner_id, null);
  assert.equal(student.guardians[0].phone, null);
  assert.equal(student.guardians[0].email, null);
  assert.equal(clients[0].statements[1].params[0], schoolId);
  assert.equal(clients[0].statements.at(-1).sql, 'COMMIT');
});

test('profile edits preserve sensitive values when the editor lacks sensitive-data access', async t => {
  const { url, clients } = await startServer(t, { id: userId, roles: ['REGISTRAR'], permissions: ['students.write'] });
  const response = await fetch(`${url}/api/operations/students/${studentId}/profile`, { method: 'POST', headers, body: JSON.stringify({ firstName: 'Updated', lastName: 'Learner', dateOfBirth: null, sex: null, externalLearnerId: null }) });
  assert.equal(response.status, 200);
  assert.equal(clients[0].statements.find(item => item.sql.startsWith('UPDATE students SET')).params[9], false);
  assert.equal((await response.json()).student.date_of_birth, null);
});

test('student and parent portal users cannot read the staff directory endpoint', async t => {
  const { url, clients } = await startServer(t, { id: userId, roles: ['PARENT'], permissions: ['students.read'] });
  const response = await fetch(`${url}/api/operations/students`);
  assert.equal(response.status, 403);
  assert.equal(clients[0].statements.at(-1).sql, 'ROLLBACK');
});

test('guardian contacts require an email or phone and are audited when added', async t => {
  const { url, clients } = await startServer(t, { id: userId, roles: ['REGISTRAR'], permissions: ['students.write','students.sensitive.read'] });
  const response = await fetch(`${url}/api/operations/students/${studentId}/guardians`, { method: 'POST', headers, body: JSON.stringify({ firstName: 'Family', lastName: 'Member', relationship: 'Parent', phone: '+231000000000', canViewResults: true }) });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).guardian.id, 'guardian-new');
  assert.ok(clients[0].statements.some(item => item.sql.startsWith('INSERT INTO student_guardians')));
  assert.ok(clients[0].statements.some(item => item.sql.startsWith('INSERT INTO audit_events')));
});
