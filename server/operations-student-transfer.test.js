import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId = 'b210b463-c02c-4be9-9003-8a9005e8dbe5';
const userId = '721ddf68-1c98-4faa-9dc7-9161daa79870';
const studentId = 'c210b463-c02c-4be9-9003-8a9005e8dbe5';
const currentClassId = 'd210b463-c02c-4be9-9003-8a9005e8dbe5';
const nextClassId = 'e210b463-c02c-4be9-9003-8a9005e8dbe5';

class FakeClient {
  constructor({ permissions = ['students.write'], history = true } = {}) { this.permissions = permissions; this.history = history; this.statements = []; }
  async query(sql, params = []) {
    const statement = sql.replace(/\s+/g, ' ').trim();
    this.statements.push({ statement, params });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) return { rows: [], rowCount: 0 };
    if (statement.startsWith('SELECT id FROM students WHERE school_id=$1 AND id=$2 FOR UPDATE')) return { rows: [{ id: studentId }], rowCount: 1 };
    if (statement.startsWith('SELECT ce.class_group_id, ce.enrolled_on')) return { rows: [{ class_group_id: currentClassId, enrolled_on: '2026-09-01', academic_year_id: 'year-one', campus_id: 'campus-one', class_name: 'Grade 4A' }], rowCount: 1 };
    if (statement.startsWith('SELECT effective_on FROM student_enrollment_history')) return { rows: this.history ? [{ effective_on: '2026-09-01' }] : [], rowCount: this.history ? 1 : 0 };
    if (statement.startsWith('SELECT id, name, academic_year_id, campus_id FROM class_groups')) return { rows: [{ id: nextClassId, name: 'Grade 5A', academic_year_id: 'year-two', campus_id: 'campus-one' }], rowCount: 1 };
    if (statement.startsWith('UPDATE class_enrollments SET status=\'COMPLETED\'')) return { rows: [{ class_group_id: currentClassId }], rowCount: 1 };
    if (statement.startsWith('INSERT INTO class_enrollments')) return { rows: [], rowCount: 1 };
    if (statement.startsWith('UPDATE student_enrollment_history SET status=\'TRANSFERRED_OUT\'')) return { rows: this.history ? [{ id: 'history-old' }] : [], rowCount: this.history ? 1 : 0 };
    if (statement.startsWith('INSERT INTO student_enrollment_history')) return { rows: [], rowCount: 1 };
    if (statement.startsWith('INSERT INTO audit_events')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected query: ${statement}`);
  }
  release() {}
}

async function startServer(t, options = {}) {
  const clients = [];
  const app = express(); app.use(express.json());
  app.use('/api/operations', createOperationsRouter({ authenticate(req, _res, next) {
    const client = new FakeClient(options); clients.push(client);
    req.auth = { account: { id: userId, roles: ['SCHOOL_ADMIN'], permissions: options.permissions || ['students.write'] }, claims: { schoolId, userId, csrfToken: 'csrf-test-token' }, client }; next();
  } }));
  const server = createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, clients };
}
const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-test-token' };

test('class transfer closes the old enrollment, opens the destination, preserves history and audits', async t => {
  const { url, clients } = await startServer(t);
  const response = await fetch(`${url}/api/operations/students/${studentId}/transfer`, { method: 'POST', headers, body: JSON.stringify({ classGroupId: nextClassId, effectiveOn: '2026-10-01', reason: 'Promotion after review' }) });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(result.transfer, { fromClass: 'Grade 4A', toClass: 'Grade 5A', effectiveOn: '2026-10-01' });
  const sql = clients[0].statements.map(item => item.statement);
  assert.ok(sql.some(statement => statement.startsWith("UPDATE class_enrollments SET status='COMPLETED'")));
  assert.ok(sql.some(statement => statement.startsWith('INSERT INTO class_enrollments')));
  assert.ok(sql.some(statement => statement.startsWith("UPDATE student_enrollment_history SET status='TRANSFERRED_OUT'")));
  assert.ok(sql.some(statement => statement.startsWith('INSERT INTO student_enrollment_history')));
  assert.ok(sql.some(statement => statement.startsWith('INSERT INTO audit_events')));
  assert.equal(sql.at(-1), 'COMMIT');
});

test('class transfer creates prior history when an older enrollment predates history tracking', async t => {
  const { url, clients } = await startServer(t, { history: false });
  const response = await fetch(`${url}/api/operations/students/${studentId}/transfer`, { method: 'POST', headers, body: JSON.stringify({ classGroupId: nextClassId, reason: 'Class placement correction' }) });
  assert.equal(response.status, 200);
  const historyInsert = clients[0].statements.filter(item => item.statement.startsWith('INSERT INTO student_enrollment_history'));
  assert.equal(historyInsert.length, 2);
  assert.equal(historyInsert[0].params[5], '2026-09-01');
});

test('class transfer rejects dates before the current enrollment without modifying classes', async t => {
  const { url, clients } = await startServer(t);
  const response = await fetch(`${url}/api/operations/students/${studentId}/transfer`, { method: 'POST', headers, body: JSON.stringify({ classGroupId: nextClassId, effectiveOn: '2026-08-31', reason: 'Correction' }) });
  assert.equal(response.status, 400);
  assert.equal(clients[0].statements.some(item => item.statement.startsWith("UPDATE class_enrollments SET status='COMPLETED'")), false);
  assert.equal(clients[0].statements.at(-1).statement, 'ROLLBACK');
});

test('class transfer requires student write permission', async t => {
  const { url, clients } = await startServer(t, { permissions: ['students.read'] });
  const response = await fetch(`${url}/api/operations/students/${studentId}/transfer`, { method: 'POST', headers, body: JSON.stringify({ classGroupId: nextClassId, reason: 'Promotion' }) });
  assert.equal(response.status, 403);
  assert.equal(clients[0].statements.at(-1).statement, 'ROLLBACK');
});
