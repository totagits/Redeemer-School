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
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) return { rows: [], rowCount: 0 };
    if (statement.startsWith('SELECT name, moe_school_emis_code FROM schools')) return { rows: [{ name: 'Redeemer International Academy', moe_school_emis_code: 'LR-TEST-001' }], rowCount: 1 };
    if (statement.startsWith('SELECT s.student_number, s.external_learner_id')) return { rows: [{
      student_number: 'RIA-001', external_learner_id: '=HYPERLINK("https://example.test")', first_name: 'Ama, "A"', middle_name: null,
      last_name: 'Learner', sex: 'F', date_of_birth: '2015-01-01', class_name: 'Grade 1', academic_year: '2026-2027', enrolled_on: '2026-09-01',
    }], rowCount: 1 };
    if (statement.startsWith('INSERT INTO audit_events')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected query: ${statement}`);
  }
  release() { this.released = true; }
}

async function startServer(t, permissions = ['emis.export']) {
  const clients = [];
  const app = express(); app.use(express.json());
  app.use('/api/operations', createOperationsRouter({ authenticate(_req, _res, next) {
    const client = new FakeClient(); clients.push(client);
    _req.auth = { account: { id: userId, roles: ['REGISTRAR'], permissions }, claims: { schoolId, userId }, client }; next();
  } }));
  const server = createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, clients };
}

test('EMIS draft learner export is permission checked, tenant scoped, spreadsheet safe, and audited', async t => {
  const { url, clients } = await startServer(t);
  const response = await fetch(`${url}/api/operations/reports/emis-roster.csv`);
  const csv = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/csv/);
  assert.match(csv, /"school_emis_code","academic_year","learner_id"/);
  assert.match(csv, /"LR-TEST-001"/);
  assert.match(csv, /"Ama, ""A"""/);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.test""\)"/);
  const rosterQuery = clients[0].statements.find(row => row.statement.startsWith('SELECT s.student_number'));
  assert.match(rosterQuery.statement, /s\.school_id = \$1/);
  assert.deepEqual(rosterQuery.params, [schoolId]);
  const audit = clients[0].statements.find(row => row.statement.startsWith('INSERT INTO audit_events'));
  assert.ok(audit);
  assert.match(audit.params[2], /EMIS_DRAFT_LEARNER_ROSTER_EXPORTED/);
  assert.equal(clients[0].statements.at(-1).statement, 'COMMIT');
});

test('learner register export is denied without the dedicated EMIS permission', async t => {
  const { url, clients } = await startServer(t, ['reports.read', 'students.read']);
  const response = await fetch(`${url}/api/operations/reports/emis-roster.csv`);
  assert.equal(response.status, 403);
  assert.equal(clients[0].statements.at(-1).statement, 'ROLLBACK');
  assert.equal(clients[0].statements.length, 1);
});
