import test from 'node:test';
import assert from 'node:assert/strict';
import { sendSchoolSms, smsProviderName, smsReadiness } from './sms.js';

const variables = ['SMS_PROVIDER','SMS_GATEWAY_URL','SMS_GATEWAY_TOKEN','SMS_GATEWAY_SENDER','ORANGE_SMS_CLIENT_ID','ORANGE_SMS_CLIENT_SECRET','ORANGE_SMS_SENDER_NAME','ORANGE_SMS_SENDER_NUMBER','MTN_SMS_CLIENT_ID','MTN_SMS_CLIENT_SECRET','MTN_SMS_SENDER_ADDRESS','MTN_SMS_ENABLE_LIVE'];
function restoreEnvironment(t) {
  const previous = Object.fromEntries(variables.map(key => [key, process.env[key]]));
  const fetch = globalThis.fetch;
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
    globalThis.fetch = fetch;
  });
  for (const key of variables) delete process.env[key];
}

test('Orange SMS authenticates once, normalizes Liberia recipient and sends to any operator', async t => {
  restoreEnvironment(t);
  process.env.ORANGE_SMS_CLIENT_ID = 'orange-client';
  process.env.ORANGE_SMS_CLIENT_SECRET = 'orange-secret';
  process.env.ORANGE_SMS_SENDER_NAME = 'Redeemers';
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/oauth/v3/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'access-token', expires_in: 3600 }) };
    return { ok: true, status: 201, headers: { get: () => null }, json: async () => ({ outboundSMSMessageRequest: { resourceURL: 'https://api.orange.com/request/sms-abc123' } }) };
  };

  assert.equal(smsReadiness(), true);
  assert.deepEqual(await sendSchoolSms({ to: '0778786116', message: 'School notice' }), { providerMessageId: 'sms-abc123' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.orange.com/oauth/v3/token');
  assert.equal(calls[0].options.headers.Authorization, `Basic ${Buffer.from('orange-client:orange-secret').toString('base64')}`);
  assert.equal(calls[1].url, 'https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B2310000/requests');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer access-token');
  assert.deepEqual(JSON.parse(calls[1].options.body), { outboundSMSMessageRequest: {
    address: 'tel:+231778786116', senderAddress: 'tel:+2310000', senderName: 'Redeemers', outboundSMSTextMessage: { message: 'School notice' },
  } });
  await sendSchoolSms({ to: '+231778786116', message: 'Another notice' });
  assert.equal(calls.length, 3, 'uses the cached OAuth token for another send');
});

test('Orange SMS rejects invalid recipients and shortens long notices to 160 characters', async t => {
  restoreEnvironment(t);
  process.env.ORANGE_SMS_CLIENT_ID = 'client';
  process.env.ORANGE_SMS_CLIENT_SECRET = 'secret';
  const calls=[];
  globalThis.fetch = async (url, options) => {
    calls.push({url:String(url),options});
    if(String(url).endsWith('/oauth/v3/token'))return {ok:true,status:200,json:async()=>({access_token:'another-token',expires_in:3600})};
    return {ok:true,status:201,headers:{get:()=>null},json:async()=>({})};
  };
  await assert.rejects(sendSchoolSms({ to: 'not-a-number', message: 'test' }), /international phone number/i);
  await sendSchoolSms({ to: '+231778786116', message: 'x'.repeat(161) });
  const payload=JSON.parse(calls.at(-1).options.body).outboundSMSMessageRequest.outboundSMSTextMessage.message;
  assert.equal(Array.from(payload).length,160);
  assert.ok(payload.endsWith('...'));
});

test('generic SMS adapter sends only through a configured HTTPS gateway', async t => {
  restoreEnvironment(t);
  process.env.SMS_GATEWAY_URL = 'https://gateway.example.test/messages';
  process.env.SMS_GATEWAY_TOKEN = 'test-secret';
  process.env.SMS_GATEWAY_SENDER = 'RIA';
  let sent;
  globalThis.fetch = async (url, options) => { sent = { url, options }; return { ok: true, json: async () => ({ messageId: 'provider-123' }) }; };
  assert.equal(smsReadiness(), true);
  assert.deepEqual(await sendSchoolSms({ to: '+231770000000', message: 'School notice' }), { providerMessageId: 'provider-123' });
  assert.equal(String(sent.url), 'https://gateway.example.test/messages');
  assert.equal(sent.options.headers.Authorization, 'Bearer test-secret');
  assert.deepEqual(JSON.parse(sent.options.body), { to: '+231770000000', sender: 'RIA', message: 'School notice' });
  process.env.SMS_GATEWAY_URL = 'http://insecure.example.test';
  await assert.rejects(sendSchoolSms({ to: '231770000000', message: 'test' }), /HTTPS/i);
});

test('MTN SMS V2 uses production OAuth and sends a correlated SMS to a Liberia number', async t => {
  restoreEnvironment(t);
  process.env.SMS_PROVIDER = 'MTN';
  process.env.MTN_SMS_CLIENT_ID = 'consumer-key';
  process.env.MTN_SMS_CLIENT_SECRET = 'consumer-secret';
  process.env.MTN_SMS_SENDER_ADDRESS = 'Redeemer';
  process.env.MTN_SMS_ENABLE_LIVE = 'true';
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/oauth/access_token')) return { ok: true, status: 200, json: async () => ({ access_token: 'mtn-token', expires_in: '3599' }) };
    return { ok: true, status: 200, headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json' : null }, json: async () => ({ statusCode: '200', transactionId: 'mtn-transaction', data: { requestId: 'mtn-request', isChargeable: 'true' } }) };
  };

  assert.equal(smsReadiness(), true);
  assert.equal(smsProviderName(), 'MTN SMS V2');
  assert.deepEqual(await sendSchoolSms({ to: '0778786116', message: 'School notice' }), { providerMessageId: 'mtn-request' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.mtn.com/v1/oauth/access_token?grant_type=client_credentials');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(String(calls[0].options.body), 'client_id=consumer-key&client_secret=consumer-secret');
  assert.equal(calls[1].url, 'https://api.mtn.com/v1/messages/sms/outbound');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer mtn-token');
  const payload = JSON.parse(calls[1].options.body);
  assert.deepEqual({ ...payload, clientCorrelator: undefined }, { senderAddress: 'Redeemer', receiverAddress: ['tel:+231778786116'], message: 'School notice', clientCorrelator: undefined });
  assert.ok(payload.clientCorrelator);
  assert.ok(calls[1].options.headers.transactionId);
  await sendSchoolSms({ to: '+231778786116', message: 'Another notice' });
  assert.equal(calls.length, 3, 'reuses the cached MTN OAuth token');
});

test('MTN SMS requires explicit production selection and does not accept an HTML 200 page as sent', async t => {
  restoreEnvironment(t);
  process.env.MTN_SMS_CLIENT_ID = 'consumer-key';
  process.env.MTN_SMS_CLIENT_SECRET = 'consumer-secret';
  process.env.MTN_SMS_SENDER_ADDRESS = 'Redeemer';
  assert.equal(smsReadiness(), false, 'MTN production is not selected implicitly');
  process.env.SMS_PROVIDER = 'MTN';
  assert.equal(smsReadiness(), false, 'live SMS remains disabled until explicitly enabled');
  let providerCalls = 0;
  globalThis.fetch = async () => { providerCalls++; throw new Error('provider should not be called while live sending is disabled'); };
  await assert.rejects(sendSchoolSms({ to: '0778786116', message: 'notice' }), /live sending is disabled/i);
  assert.equal(providerCalls, 0);
  process.env.MTN_SMS_ENABLE_LIVE = 'true';
  assert.equal(smsReadiness(), true);
  globalThis.fetch = async url => String(url).includes('/oauth/access_token')
    ? { ok: true, status: 200, json: async () => ({ access_token: 'mtn-token', expires_in: 3600 }) }
    : { ok: true, status: 200, headers: { get: () => 'text/html' }, json: async () => ({}) };
  await assert.rejects(sendSchoolSms({ to: '0778786116', message: 'notice' }), /non-JSON response/i);
});
