import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOperationsRouter } from './operations.js';

const schoolId = 'b210b463-c02c-4be9-9003-8a9005e8dbe5';
const userId = '721ddf68-1c98-4faa-9dc7-9161daa79870';
const invoiceId = '32f8f4d3-5d2a-4f36-bd4e-fc0f38a44f07';
const intentId = '507455c0-7ed6-4302-a2c8-84bf5e50debf';
const referenceId = '8d451246-7891-4bee-af81-b9cf23973f18';

class AuthClient {
  constructor() { this.statements = []; }
  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    this.statements.push({ sql: normalized, params });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) return { rows: [], rowCount: 0 };
    if (normalized.startsWith('SELECT count(*)::int AS ready FROM information_schema.columns')) return { rows: [{ ready: 2 }], rowCount: 1 };
    if (normalized.includes('FROM fee_invoices fi') && normalized.includes('FOR UPDATE OF fi')) {
      return { rows: [{ id: invoiceId, student_id: 'student-id', currency: 'LRD', invoice_number: 'RIA-2026-1', status: 'ISSUED', total: '1000.00', paid: '0.00' }], rowCount: 1 };
    }
    if (normalized.startsWith('SELECT 1 FROM payment_intents')) return { rows: [], rowCount: 0 };
    if (normalized.startsWith('INSERT INTO payment_provider_profiles')) return { rows: [{ id: 'profile-id' }], rowCount: 1 };
    if (normalized.startsWith('INSERT INTO payment_intents')) return { rows: [{ id: intentId }], rowCount: 1 };
    if (normalized.startsWith('SELECT pi.id, pi.invoice_id, pi.payment_id')) return { rows: [{ id: intentId, invoice_id: invoiceId, payment_id: null, provider_reference: referenceId, amount: '1000.00', currency: 'LRD', status: 'PENDING', invoice_number: 'RIA-2026-1', student_id: 'student-id' }], rowCount: 1 };
    if (normalized.startsWith('INSERT INTO audit_events')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected auth-client query in MoMo test: ${normalized}`);
  }
  release() {}
}

class RuntimePool {
  constructor() { this.statements = []; }
  async connect() { return this; }
  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    this.statements.push({ sql: normalized, params });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized) || normalized.startsWith('SELECT set_config')) return { rows: [], rowCount: 0 };
    if (normalized.startsWith('UPDATE payment_intents')) return { rows: [], rowCount: 1 };
    if (normalized.startsWith('INSERT INTO audit_events')) return { rows: [], rowCount: 1 };
    if (normalized.includes('FOR UPDATE OF pi, fi')) return { rows: [{ id: intentId, invoice_id: invoiceId, payment_id: null, provider_reference: referenceId, amount: '1000.00', currency: 'LRD', status: 'PENDING', invoice_number: 'RIA-2026-1', invoice_status: 'ISSUED', student_id: 'student-id', total: '1000.00', paid: '0.00' }], rowCount: 1 };
    if (normalized.startsWith('INSERT INTO payments')) return { rows: [{ id: 'payment-id', receipt_number: 'RIA-20261023-ABC123', amount: '1000.00', currency: 'LRD', channel: 'MTN_MOMO', status: 'SUCCEEDED', provider_fee_amount: '25.00' }], rowCount: 1 };
    if (normalized.startsWith('INSERT INTO payment_allocations')) return { rows: [], rowCount: 1 };
    if (normalized.startsWith('UPDATE fee_invoices')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected runtime-pool query in MoMo test: ${normalized}`);
  }
  release() {}
}

async function start(t, environment = 'PRODUCTION') {
  const authClient = new AuthClient();
  const pool = new RuntimePool();
  const providerCalls = [];
  const currency = environment === 'SANDBOX' ? 'EUR' : 'LRD';
  const momoClient = {
    config: { enabled: true, environment, currency, feeRateBps: 250, reason: '' },
    async requestToPay(input) { providerCalls.push({ method: 'requestToPay', input }); return { accepted: true, status: 'PENDING', referenceId: input.referenceId || referenceId }; },
    async getRequestStatus(input) { providerCalls.push({ method: 'getRequestStatus', input }); return { status: 'SUCCESSFUL', amount: environment === 'SANDBOX' ? '1.00' : '1000.00', currency, externalId: intentId, financialTransactionId: 'MTN-TRANSACTION-123', referenceId: input }; },
  };
  const app = express(); app.use(express.json());
  app.use('/api/operations', createOperationsRouter({
    pool, momoClient,
    authenticate(req, _res, next) {
      req.auth = { account: { id: userId, roles: ['FINANCE'], permissions: ['finance.write'] }, claims: { schoolId, userId, csrfToken: 'csrf-test-token' }, client: authClient };
      next();
    },
  }));
  const server = createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, authClient, pool, providerCalls };
}

const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-test-token' };

test('Collections request stays pending until status confirms success, then posts gross invoice amount and 2.5% fee', async t => {
  const { url, authClient, pool, providerCalls } = await start(t);
  const createResponse = await fetch(`${url}/api/operations/finance/momo/intents`, {
    method: 'POST', headers, body: JSON.stringify({ invoiceId, amount: 1000, payerPhone: '+231 770 123 456' }),
  });
  assert.equal(createResponse.status, 202);
  const created = await createResponse.json();
  assert.equal(created.intent.status, 'PENDING');
  assert.equal(providerCalls[0].method, 'requestToPay');
  assert.equal(providerCalls[0].input.msisdn, '231770123456');
  assert.equal(authClient.statements.some(item => item.sql.startsWith('INSERT INTO payments')), false);

  const checkResponse = await fetch(`${url}/api/operations/finance/momo/intents/${intentId}/check`, { method: 'POST', headers, body: '{}' });
  assert.equal(checkResponse.status, 200);
  const checked = await checkResponse.json();
  assert.equal(checked.status, 'SUCCEEDED');
  assert.equal(checked.providerFee, '25.00');
  assert.equal(providerCalls[1].method, 'getRequestStatus');
  const paymentInsert = pool.statements.find(item => item.sql.startsWith('INSERT INTO payments'));
  assert.ok(paymentInsert);
  assert.equal(paymentInsert.params[3], '1000.00');
  assert.equal(paymentInsert.params[8], '25.00');
  assert.equal(paymentInsert.params[9], 250);
  assert.ok(pool.statements.some(item => item.sql.startsWith('INSERT INTO payment_allocations')));
});

test('sandbox test request and status check never write a payment or invoice allocation', async t => {
  const { url, authClient, pool, providerCalls } = await start(t, 'SANDBOX');
  const createResponse = await fetch(`${url}/api/operations/finance/momo/sandbox-test`, {
    method: 'POST', headers, body: JSON.stringify({ amount: 1, msisdn: '123456789012' }),
  });
  assert.equal(createResponse.status, 202);
  const created = await createResponse.json();
  assert.equal(created.status, 'PENDING');
  assert.ok(created.referenceId);
  assert.equal(providerCalls[0].method, 'requestToPay');
  assert.equal(providerCalls[0].input.currency, 'EUR');
  assert.equal(providerCalls[0].input.msisdn, '123456789012');
  assert.equal(authClient.statements.some(item => /INSERT INTO (payments|payment_allocations|payment_intents)/i.test(item.sql)), false);

  const checkResponse = await fetch(`${url}/api/operations/finance/momo/sandbox-test/${created.referenceId}/check`, { method: 'POST', headers, body: '{}' });
  assert.equal(checkResponse.status, 200);
  const checked = await checkResponse.json();
  assert.equal(checked.status, 'SUCCESSFUL');
  assert.equal(checked.currency, 'EUR');
  assert.equal(providerCalls[1].method, 'getRequestStatus');
  assert.equal(providerCalls[1].input, created.referenceId);
  assert.equal(pool.statements.some(item => /INSERT INTO (payments|payment_allocations|payment_intents)|UPDATE fee_invoices/i.test(item.sql)), false);
});

test('sandbox test rejects real Liberia phone format and amounts above the test cap', async t => {
  const { url, providerCalls } = await start(t, 'SANDBOX');
  const realPhone = await fetch(`${url}/api/operations/finance/momo/sandbox-test`, { method: 'POST', headers, body: JSON.stringify({ amount: 1, msisdn: '231770123456' }) });
  assert.equal(realPhone.status, 400);
  const excessiveAmount = await fetch(`${url}/api/operations/finance/momo/sandbox-test`, { method: 'POST', headers, body: JSON.stringify({ amount: 101, msisdn: '123456789012' }) });
  assert.equal(excessiveAmount.status, 400);
  assert.equal(providerCalls.length, 0);
});
