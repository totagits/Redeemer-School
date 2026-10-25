import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId = 'b210b463-c02c-4be9-9003-8a9005e8dbe5';
const userId = '32f8f4d3-5d2a-4f36-bd4e-fc0f38a44f07';

class FakeClient {
  constructor() { this.statements = []; }
  async query(sql, params = []) {
    const statement = sql.replace(/\s+/g, ' ').trim();
    this.statements.push({ statement, params });
    if (['COMMIT', 'ROLLBACK'].includes(statement)) return { rows: [], rowCount: 0 };
    if (statement.startsWith('UPDATE schools SET moe_school_emis_code')) return { rows: [{ id: schoolId, moe_school_emis_code: params[1] || null }], rowCount: 1 };
    if (statement.startsWith('INSERT INTO audit_events')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected query: ${statement}`);
  }
  release() { this.released = true; }
}

async function startServer(t, permissions = ['school.configure']) {
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

test('school administrator can save and audit the Ministry school identifier', async t => {
  const { url, clients } = await startServer(t);
  const response = await fetch(`${url}/api/operations/school-profile/emis-code`, { method: 'POST', headers, body: JSON.stringify({ moeSchoolEmisCode: '  LR-SCHOOL-001  ' }) });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.school.moe_school_emis_code, 'LR-SCHOOL-001');
  const update = clients[0].statements.find(item => item.statement.startsWith('UPDATE schools SET moe_school_emis_code'));
  assert.deepEqual(update.params, [schoolId, 'LR-SCHOOL-001']);
  assert.ok(clients[0].statements.some(item => item.statement.startsWith('INSERT INTO audit_events')));
  assert.equal(clients[0].statements.at(-1).statement, 'COMMIT');
});

test('school EMIS identifier rejects control characters and non-administrators cannot change it', async t => {
  const invalid = await startServer(t);
  const invalidResponse = await fetch(`${invalid.url}/api/operations/school-profile/emis-code`, { method: 'POST', headers, body: JSON.stringify({ moeSchoolEmisCode: 'LR-\n001' }) });
  assert.equal(invalidResponse.status, 400);
  assert.equal(invalid.clients[0].statements.at(-1).statement, 'ROLLBACK');

  const denied = await startServer(t, ['reports.read']);
  const deniedResponse = await fetch(`${denied.url}/api/operations/school-profile/emis-code`, { method: 'POST', headers, body: JSON.stringify({ moeSchoolEmisCode: 'LR-001' }) });
  assert.equal(deniedResponse.status, 403);
  assert.equal(denied.clients[0].statements.at(-1).statement, 'ROLLBACK');
});
