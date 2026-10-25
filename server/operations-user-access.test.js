import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId = 'b210b463-c02c-4be9-9003-8a9005e8dbe5';
const adminId = '721ddf68-1c98-4faa-9dc7-9161daa79870';
const staffId = '32f8f4d3-5d2a-4f36-bd4e-fc0f38a44f07';

class FakeClient {
  constructor({ permissions = ['users.manage'], targetRole = 'TEACHER', adminCount = 2, targetStatus = 'ACTIVE', targetCampusId = null, selectedRoleExists = true, teacherProfileExists = false } = {}) {
    this.permissions = permissions; this.targetRole = targetRole; this.adminCount = adminCount; this.targetStatus = targetStatus; this.targetCampusId = targetCampusId; this.selectedRoleExists = selectedRoleExists; this.teacherProfileExists = teacherProfileExists; this.statements = [];
  }
  async query(sql, params = []) {
    const statement = sql.replace(/\s+/g, ' ').trim(); this.statements.push({ statement, params });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) return { rows: [], rowCount: 0 };
    if (statement.startsWith('SELECT u.id, u.email')) return { rows: [{ id: staffId, email: 'teacher@example.test', full_name: 'Test Teacher', role: 'TEACHER', status: 'ACTIVE', must_reset_password: false, created_at: '2026-01-01T00:00:00Z', last_login_at: null, invitation_pending: false }], rowCount: 1 };
    if (statement.startsWith('SELECT code, name FROM school_roles')) return { rows: [{ code: 'PRINCIPAL', name: 'Principal' }, { code: 'TEACHER', name: 'Teacher' }], rowCount: 2 };
    if (statement.startsWith('SELECT id FROM schools WHERE id=$1 FOR UPDATE')) return { rows: [{ id: schoolId }], rowCount: 1 };
    if (statement.startsWith('SELECT id, role, status FROM user_accounts')) return { rows: [{ id: staffId, role: this.targetRole, status: 'ACTIVE' }], rowCount: 1 };
    if (statement.startsWith('SELECT id, role, status, campus_id FROM user_accounts')) return { rows: [{ id: staffId, role: this.targetRole, status: this.targetStatus, campus_id: this.targetCampusId }], rowCount: 1 };
    if (statement.startsWith('SELECT id, code FROM school_roles')) return this.selectedRoleExists ? { rows: [{ id: 'principal-role-id', code: params[1] }], rowCount: 1 } : { rows: [], rowCount: 0 };
    if (statement.startsWith('SELECT 1 FROM teacher_profiles')) return this.teacherProfileExists ? { rows: [{ '?column?': 1 }], rowCount: 1 } : { rows: [], rowCount: 0 };
    if (statement.startsWith('SELECT count(*)::int AS active_count')) return { rows: [{ active_count: this.adminCount }], rowCount: 1 };
    if (statement.startsWith('UPDATE user_accounts SET status')) return { rows: [{ id: staffId, email: 'teacher@example.test', full_name: 'Test Teacher', role: this.targetRole, status: params[2] }], rowCount: 1 };
    if (statement.startsWith('UPDATE user_role_assignments SET ends_at')) return { rows: [], rowCount: 1 };
    if (statement.startsWith('DELETE FROM user_role_assignments')) return { rows: [], rowCount: 0 };
    if (statement.startsWith('INSERT INTO user_role_assignments')) return { rows: [], rowCount: 1 };
    if (statement.startsWith('UPDATE user_accounts SET role=$3')) return { rows: [{ id: staffId, email: 'teacher@example.test', full_name: 'Test Teacher', role: params[2], status: this.targetStatus }], rowCount: 1 };
    if (statement.startsWith('DELETE FROM auth_sessions')) return { rows: [], rowCount: 1 };
    if (statement.startsWith('INSERT INTO audit_events')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected query: ${statement}`);
  }
  release() { this.released = true; }
}

async function startServer(t, { userId = adminId, permissions = ['users.manage'], ...options } = {}) {
  const clients = [];
  const app = express(); app.use(express.json());
  app.use('/api/operations', createOperationsRouter({ authenticate(_req, _res, next) {
    const client = new FakeClient({ permissions, ...options }); clients.push(client);
    _req.auth = { account: { id: userId, roles: ['SCHOOL_ADMIN'], permissions }, claims: { schoolId, userId, csrfToken: 'csrf-test-token' }, client }; next();
  } }));
  const server = createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, clients };
}

const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-test-token' };

test('account directory is school-scoped and returns no password hashes', async t => {
  const { url, clients } = await startServer(t);
  const response = await fetch(`${url}/api/operations/accounts`);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.accounts[0].email, 'teacher@example.test');
  assert.equal(result.currentUserId, adminId);
  assert.ok(result.availableRoles.some(role => role.code === 'PRINCIPAL'));
  assert.equal('password_hash' in result.accounts[0], false);
  assert.ok(clients[0].statements[0].params.includes(schoolId));
});

test('account directory requires the account management permission', async t => {
  const { url, clients } = await startServer(t, { permissions: ['staff.read'] });
  const response = await fetch(`${url}/api/operations/accounts`);
  assert.equal(response.status, 403);
  assert.equal(clients[0].statements.at(-1).statement, 'ROLLBACK');
});

test('suspending a staff account ends its sessions and writes an audit event', async t => {
  const { url, clients } = await startServer(t);
  const response = await fetch(`${url}/api/operations/accounts/${staffId}/status`, { method: 'POST', headers, body: JSON.stringify({ status: 'SUSPENDED', reason: 'Staging access review' }) });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.account.status, 'SUSPENDED');
  assert.ok(clients[0].statements.some(item => item.statement.startsWith('DELETE FROM auth_sessions')));
  assert.ok(clients[0].statements.some(item => item.statement.startsWith('INSERT INTO audit_events')));
  assert.equal(clients[0].statements.at(-1).statement, 'COMMIT');
});

test('account manager cannot suspend their own account', async t => {
  const { url, clients } = await startServer(t, { userId: staffId });
  const response = await fetch(`${url}/api/operations/accounts/${staffId}/status`, { method: 'POST', headers, body: JSON.stringify({ status: 'SUSPENDED', reason: 'test' }) });
  assert.equal(response.status, 400);
  assert.equal(clients[0].statements.at(-1).statement, 'ROLLBACK');
});

test('suspension cannot remove the final active school administrator', async t => {
  const { url, clients } = await startServer(t, { targetRole: 'SCHOOL_ADMIN', adminCount: 1 });
  const response = await fetch(`${url}/api/operations/accounts/${staffId}/status`, { method: 'POST', headers, body: JSON.stringify({ status: 'SUSPENDED', reason: 'test' }) });
  const result = await response.json();
  assert.equal(response.status, 409);
  assert.match(result.error, /at least one active administrator/i);
  assert.equal(clients[0].statements.at(-1).statement, 'ROLLBACK');
});

test('administrator can change a staff role, replace assignments, preserve campus scope and end sessions', async t => {
  const { url, clients } = await startServer(t, { targetCampusId: 'campus-7' });
  const response = await fetch(`${url}/api/operations/accounts/${staffId}/role`, { method: 'POST', headers, body: JSON.stringify({ role: 'PRINCIPAL' }) });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.account.role, 'PRINCIPAL');
  const insert = clients[0].statements.find(item => item.statement.startsWith('INSERT INTO user_role_assignments'));
  assert.deepEqual(insert.params, [schoolId, staffId, 'principal-role-id', 'campus-7', adminId]);
  assert.ok(clients[0].statements.some(item => item.statement.startsWith('DELETE FROM auth_sessions')));
  assert.ok(clients[0].statements.some(item => item.statement.startsWith('INSERT INTO audit_events')));
  assert.equal(clients[0].statements.at(-1).statement, 'COMMIT');
});

test('role change protects the current admin, portal roles, and the last active administrator', async t => {
  const self = await startServer(t, { userId: staffId });
  const selfResponse = await fetch(`${self.url}/api/operations/accounts/${staffId}/role`, { method: 'POST', headers, body: JSON.stringify({ role: 'PRINCIPAL' }) });
  assert.equal(selfResponse.status, 400);
  assert.equal(self.clients[0].statements.at(-1).statement, 'ROLLBACK');

  const portal = await startServer(t, { targetRole: 'PARENT' });
  const portalResponse = await fetch(`${portal.url}/api/operations/accounts/${staffId}/role`, { method: 'POST', headers, body: JSON.stringify({ role: 'TEACHER' }) });
  assert.equal(portalResponse.status, 409);
  assert.equal(portal.clients[0].statements.at(-1).statement, 'ROLLBACK');

  const lastAdmin = await startServer(t, { targetRole: 'SCHOOL_ADMIN', adminCount: 1 });
  const adminResponse = await fetch(`${lastAdmin.url}/api/operations/accounts/${staffId}/role`, { method: 'POST', headers, body: JSON.stringify({ role: 'PRINCIPAL' }) });
  assert.equal(adminResponse.status, 409);
  assert.match((await adminResponse.json()).error, /at least one active administrator/i);
  assert.equal(lastAdmin.clients[0].statements.at(-1).statement, 'ROLLBACK');
});

test('role change rejects unsupported role codes and requires users.manage', async t => {
  const { url, clients } = await startServer(t);
  const invalid = await fetch(`${url}/api/operations/accounts/${staffId}/role`, { method: 'POST', headers, body: JSON.stringify({ role: 'DEPARTMENT_HEAD' }) });
  assert.equal(invalid.status, 400);
  assert.equal(clients[0].statements.at(-1).statement, 'ROLLBACK');

  const denied = await startServer(t, { permissions: ['staff.read'] });
  const deniedResponse = await fetch(`${denied.url}/api/operations/accounts/${staffId}/role`, { method: 'POST', headers, body: JSON.stringify({ role: 'PRINCIPAL' }) });
  assert.equal(deniedResponse.status, 403);
  assert.equal(denied.clients[0].statements.at(-1).statement, 'ROLLBACK');
});

test('an account needs a teacher profile before role changes can grant teaching access', async t => {
  const { url, clients } = await startServer(t, { targetRole: 'REGISTRAR' });
  const response = await fetch(`${url}/api/operations/accounts/${staffId}/role`, { method: 'POST', headers, body: JSON.stringify({ role: 'TEACHER' }) });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Teacher records/i);
  assert.equal(clients[0].statements.some(item => item.statement.startsWith('UPDATE user_role_assignments')), false);
  assert.equal(clients[0].statements.at(-1).statement, 'ROLLBACK');
});
