import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createAuthRouter } from './auth.js';
import { createOperationsRouter } from './operations.js';
import { hashPassword } from './authCrypto.js';
import { hashInvitationToken } from './invitations.js';

const schoolId = 'b210b463-c02c-4be9-9003-8a9005e8dbe5';
const userId = '721ddf68-1c98-4faa-9dc7-9161daa79870';
const secret = 'test-session-secret-is-long-enough-0001';

class FakePool {
  constructor(passwordHash) {
    this.passwordHash = passwordHash;
    this.sessions = new Map();
    this.tenantScopes = [];
    this.releaseCount = 0;
    this.invitationTokenHash = null;
    this.invitationPasswordHash = null;
    this.user = {
      id: userId,
      school_id: schoolId,
      email: 'admin@redeemer.example',
      full_name: 'Staging Admin',
      password_hash: passwordHash,
      status: 'ACTIVE',
      failed_login_count: 0,
      locked_until: null,
      must_reset_password: false,
    };
  }

  async query(sql) {
    if (sql.includes('FROM pg_roles')) return { rows: [{ safe: true }], rowCount: 1 };
    throw new Error(`Unexpected pool query: ${sql}`);
  }

  async connect() {
    return new FakeClient(this);
  }
}

class FakeClient {
  constructor(pool) {
    this.pool = pool;
    this.currentSchoolId = null;
    this.released = false;
  }

  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) return { rows: [], rowCount: 0 };
    if (normalized.includes("set_config('app.current_school_id'")) {
      this.currentSchoolId = params[0];
      this.pool.tenantScopes.push(params[0]);
      return { rows: [{ set_config: params[0] }], rowCount: 1 };
    }
    if (normalized.includes('app.resolve_school_id_by_code')) {
      return { rows: [{ id: params[0] === 'RIA' ? schoolId : null }], rowCount: 1 };
    }
    if (normalized.startsWith('SELECT id, school_id, email, full_name, password_hash')) {
      return this.currentSchoolId === schoolId && params[1] === 'admin@redeemer.example'
        ? { rows: [{ ...this.pool.user }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith('INSERT INTO auth_sessions')) {
      this.pool.sessions.set(params[0], {
        id: params[0], schoolId: params[1], userId: params[2], tokenHash: params[3],
        expiresAt: Number(params[4]),
      });
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith('UPDATE user_accounts')) return { rows: [], rowCount: 1 };
    if (normalized.startsWith('SELECT u.id, u.school_id, u.campus_id')) {
      return {
        rows: [{
          id: userId,
          school_id: schoolId,
          campus_id: null,
          email: 'admin@redeemer.example',
          full_name: 'Staging Admin',
          school_name: "Redeemer's International Academy",
          roles: ['SCHOOL_ADMIN'],
          permissions: ['school.configure', 'students.read'],
          must_reset_password: false,
        }],
        rowCount: 1,
      };
    }
    if (normalized.startsWith('INSERT INTO audit_events')) return { rows: [], rowCount: 1 };
    if (normalized.startsWith('SELECT 1 FROM auth_sessions')) {
      const session = this.pool.sessions.get(params[0]);
      const ok = session && session.schoolId === params[1] && session.userId === params[2] &&
        session.tokenHash === params[3] && session.expiresAt > Date.now();
      return { rows: ok ? [{ '?column?': 1 }] : [], rowCount: ok ? 1 : 0 };
    }
    if (normalized.startsWith('DELETE FROM auth_sessions')) {
      const session = this.pool.sessions.get(params[0]);
      if (session && session.tokenHash === params[3]) this.pool.sessions.delete(params[0]);
      return { rows: [], rowCount: session ? 1 : 0 };
    }
    throw new Error(`Unexpected client query: ${normalized}`);
  }

  release(