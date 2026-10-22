import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId = 'b210b463-c02c-4be9-9003-8a9005e8dbe5';
const adminId = '721ddf68-1c98-4faa-9dc7-9161daa79870';
const newUserId = '32f8f4d3-5d2a-4f36-bd4e-fc0f38a44f07';

class FakeClient {
  constructor({ roleAvailable = true } = {}) { this.roleAvailable = roleAvailable; this.statements = []; this.released = false; }
  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    this.statements.push({ sql: normalized, params });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) return { rows: [], rowCount: 0 };
    if (normalized.startsWith('INSERT INTO user_accounts')) return this.roleAvailable
      ? { rows: [{ id: newUserId, email: params[1], full_name: params[3], role: params[4] }], rowCount: 1 }
      : { rows: [], rowCount: 0 };
    if (normalized.startsWith('INSERT INTO user_role_assignments')) return { rows: [{ id: 'role-assignment-id' }], rowCount: 1 };
    if (normalized.startsWith('INSERT INTO staff_records')) return { rows: [{ id: 'staff-record-id' }], rowCount: 1 };
    if (normalized.startsWith('UPDATE account_invitations')) return { rows: [], rowCount: 0 };
    if (normalized.startsWith('INSERT INTO account_invitations')) return { rows: [{ id: 'invitation-id' }], rowCount: 1 };
    if (normalized.startsWith('INSERT INTO audit_events')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected query in account workflow test: ${normalized}`);
  }
  release() { this.released = true; }
}

async function startServer(t, account, options = {}) {
  const clients = [];
  const invitations = [];
  const app = express();
  app.use(express.json());
  app.use('/api/operations', createOperationsRouter({
    sendInvitation: options.sendInvitation || (async invitation => { invitations.push(invitation); }),
    authenticate(req, _res, next) {
      const client = new FakeClient(options);
      clients.push(client);
      req.auth = { account, claims: { schoolId, userId: account.id, csrfToken: 'csrf-test-token' }, client };
      next();
    },
  }));
  const server = createServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, clients, invitations };
}

const admin = { id: adminId, roles: ['SCHOOL_ADMIN'], permissions: ['users.manage'] };
const body = { role: 'PRINCIPAL', fullName: 'Staging Principal', email: 'staging.principal@example.test', employeeNumber: 'TEST-PR-001', jobTitle: 'Principal' };
const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-test-token' };

test('school administrator can create a staff login and send its one-time setup invitation', async t => {
  const { url, clients, invitations } = await startServer(t, admin);
  const response = await fetch(`${url}/api/operations/staff-accounts`, { method: 'POST', headers, body: JSON.stringify(body) });
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.equal(result.account.role, 'PRINCIPAL');
  assert.equal(result.temporaryPassword, undefined);
  assert.match(result.notice, /Invitation email sent/);
  assert.equal(invitations.length, 1);
  assert.equal(invitations[0].email, body.email);
  assert.equal(invitations[0].role, 'PRINCIPAL');
  assert.equal(invitations[0].token.length, 43);
  const inviteInsert = clients[0].statements.find(item => item.sql.startsWith('INSERT INTO account_invitations'));
  assert.ok(inviteInsert);
  assert.equal(inviteInsert.params[2].length, 64);
  assert.notEqual(inviteInsert.params[2], invitations[0].token);
  assert.ok(clients[0].statements.some(item => item.sql.startsWith('INSERT INTO user_role_assignments')));
  assert.ok(clients[0].statements.some(item => item.sql.startsWith('INSERT INTO staff_records')));
  assert.ok(clients[0].statements.some(item => item.sql.startsWith('INSERT INTO audit_events')));
  assert.equal(clients[0].statements.at(-1).sql, 'COMMIT');
});

test('a failed invitation send rolls back account creation', async t => {
  const { url, clients } = await startServer(t, admin, { sendInvitation: async () => { throw new Error('provider unavailable'); } });
  const response = await fetch(`${url}/api/operations/staff-accounts`, { method: 'POST', headers, body: JSON.stringify(body) });
  const result = await response.json();
  assert.equal(response.status, 500);
  assert.match(result.error, /could not be completed/i);
  assert.equal(clients[0].statements.at(-1).sql, 'ROLLBACK');
});
test('staff login provisioning requires users.manage', async t => {
  const account = { id: adminId, roles: ['FINANCE'], permissions: ['finance.read'] };
  const { url, clients } = await startServer(t, account);
  const response = await fetch(`${url}/api/operations/staff-accounts`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(response.status, 403);
  assert.equal(clients[0].statements.some(item => item.sql.startsWith('INSERT INTO user_accounts')), false);
  assert.equal(clients[0].statements.at(-1).sql, 'ROLLBACK');
});

test('generic staff provisioning rejects school administrator roles', async t => {
  const { url, clients } = await startServer(t, admin);
  const response = await fetch(`${url}/api/operations/staff-accounts`, { method: 'POST', headers, body: JSON.stringify({ ...body, role: 'SCHOOL_ADMIN' }) });
  assert.equal(response.status, 400);
  assert.equal(clients[0].statements.some(item => item.sql.startsWith('INSERT INTO user_accounts')), false);
  assert.equal(clients[0].statements.at(-1).sql, 'ROLLBACK');
});

test('staff provisioning fails safely if the selected school role is missing', async t => {
  const { url, clients } = await startServer(t, admin, { roleAvailable: false });
  const response = await fetch(`${url}/api/operations/staff-accounts`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(response.status, 400);
  assert.equal(clients[0].statements.at(-1).sql, 'ROLLBACK');
});
