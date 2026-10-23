import test from 'node:test';
import assert from 'node:assert/strict';
import { createMomoClient, MomoProviderError, readMomoConfig } from './mtnMomo.js';

const configuredEnv = {
  MTN_MOMO_ENVIRONMENT: 'SANDBOX',
  MTN_MOMO_API_USER: 'sandbox-user',
  MTN_MOMO_API_KEY: 'sandbox-api-key',
  MTN_MOMO_SUBSCRIPTION_KEY: 'sandbox-subscription-key',
  MTN_MOMO_CURRENCY: 'EUR',
};

test('Collections stays disabled until all server credentials are configured', () => {
  const config = readMomoConfig({ MTN_MOMO_ENVIRONMENT: 'SANDBOX' });
  assert.equal(config.enabled, false);
  assert.equal(config.currency, 'EUR');
  assert.equal(config.feeRateBps, 250);
  assert.match(config.reason, /credentials are not configured/i);
});

test('production collections stay locked unless explicitly enabled', () => {
  const config = readMomoConfig({ ...configuredEnv, MTN_MOMO_ENVIRONMENT: 'PRODUCTION', MTN_MOMO_CURRENCY: 'LRD' });
  assert.equal(config.enabled, false);
  assert.match(config.reason, /Live MTN collections are disabled/i);
  assert.equal(readMomoConfig({ ...configuredEnv, MTN_MOMO_ENVIRONMENT: 'PRODUCTION', MTN_MOMO_CURRENCY: 'LRD', MTN_MOMO_ENABLE_LIVE_COLLECTIONS: 'true' }).enabled, true);
});

test('sandbox credentials use MTN test currency EUR, not Liberia production currency', () => {
  const wrongCurrency = readMomoConfig({ ...configuredEnv, MTN_MOMO_CURRENCY: 'LRD' });
  assert.equal(wrongCurrency.enabled, false);
  assert.match(wrongCurrency.reason, /sandbox uses EUR/i);
});

test('sandbox credential check obtains a token and does not create a payment', async () => {
  const calls = [];
  const client = createMomoClient({ env: configuredEnv, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) };
  } });
  assert.deepEqual(await client.testConnection(), { connected: true, environment: 'SANDBOX', currency: 'EUR' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/collection\/token\/$/);
});

test('sandbox request-to-pay uses the MTN test currency EUR and treats 202 as pending', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/collection/token/')) return { ok: true, status: 200, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) };
    return { ok: false, status: 202, json: async () => ({}) };
  };
  const client = createMomoClient({ env: configuredEnv, fetchImpl });
  const result = await client.requestToPay({
    referenceId: '8d451246-7891-4bee-af81-b9cf23973f18',
    externalId: '507455c0-7ed6-4302-a2c8-84bf5e50debf',
    amount: '1250.00', currency: 'EUR', msisdn: '231770123456',
  });
  assert.deepEqual(result, { referenceId: '8d451246-7891-4bee-af81-b9cf23973f18', accepted: true, status: 'PENDING' });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /sandbox\.momodeveloper\.mtn\.com\/collection\/token\/$/);
  assert.equal(calls[0].options.headers['Ocp-Apim-Subscription-Key'], 'sandbox-subscription-key');
  assert.match(calls[1].url, /\/collection\/v1_0\/requesttopay$/);
  assert.equal(calls[1].options.headers['X-Target-Environment'], 'sandbox');
  assert.equal(calls[1].options.headers['X-Reference-Id'], '8d451246-7891-4bee-af81-b9cf23973f18');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    amount: '1250.00', currency: 'EUR', externalId: '507455c0-7ed6-4302-a2c8-84bf5e50debf',
    payer: { partyIdType: 'MSISDN', partyId: '231770123456' },
    payerMessage: 'Redeemer school fee payment', payeeNote: 'Redeemer school fee payment',
  });
});

test('sandbox accepts a synthetic MTN test number but production only accepts Liberia MSISDNs', async () => {
  const fetchImpl = async url => url.endsWith('/collection/token/')
    ? { ok: true, status: 200, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) }
    : { ok: false, status: 202, json: async () => ({}) };
  const sandbox = createMomoClient({ env: configuredEnv, fetchImpl });
  const result = await sandbox.requestToPay({ amount: 1, currency: 'EUR', msisdn: '123456789012' });
  assert.equal(result.accepted, true);
  const production = createMomoClient({ env: { ...configuredEnv, MTN_MOMO_ENVIRONMENT: 'PRODUCTION', MTN_MOMO_CURRENCY: 'LRD', MTN_MOMO_ENABLE_LIVE_COLLECTIONS: 'true' }, fetchImpl: async () => { throw new Error('Should not call provider'); } });
  await assert.rejects(() => production.requestToPay({ amount: 1, currency: 'LRD', msisdn: '123456789012' }), /Liberia mobile number/i);
});

test('status lookup reads MTN result but does not equate request acceptance with success', async () => {
  let calls = 0;
  const fetchImpl = async url => {
    calls += 1;
    if (url.endsWith('/collection/token/')) return { ok: true, status: 200, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) };
    return { ok: true, status: 200, json: async () => ({ status: 'SUCCESSFUL', amount: '1250.00', currency: 'EUR', externalId: 'external-id', financialTransactionId: 'mtn-transaction' }) };
  };
  const client = createMomoClient({ env: configuredEnv, fetchImpl });
  const status = await client.getRequestStatus('8d451246-7891-4bee-af81-b9cf23973f18');
  assert.equal(status.status, 'SUCCESSFUL');
  assert.equal(status.amount, '1250.00');
  assert.equal(status.currency, 'EUR');
  assert.equal(status.externalId, 'external-id');
  assert.equal(status.financialTransactionId, 'mtn-transaction');
  assert.equal(calls, 2);
});

test('request rejects non-Liberia phone and avoids making provider calls', async () => {
  let calls = 0;
  const client = createMomoClient({ env: configuredEnv, fetchImpl: async () => { calls += 1; } });
  await assert.rejects(() => client.requestToPay({ amount: '10.00', currency: 'EUR', msisdn: '12345' }), /sandbox test number/i);
  assert.equal(calls, 0);
});

test('network failure while submitting payment is marked as an unknown outcome', async () => {
  let calls = 0;
  const fetchImpl = async url => {
    calls += 1;
    if (url.endsWith('/collection/token/')) return { ok: true, status: 200, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) };
    throw new Error('network unavailable');
  };
  const client = createMomoClient({ env: configuredEnv, fetchImpl });
  await assert.rejects(
    () => client.requestToPay({ referenceId: '8d451246-7891-4bee-af81-b9cf23973f18', externalId: 'external-id', amount: '10.00', currency: 'EUR', msisdn: '231770123456' }),
    error => error instanceof MomoProviderError && error.outcomeUnknown === true,
  );
  assert.equal(calls, 2);
});
