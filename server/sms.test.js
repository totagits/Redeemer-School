import test from 'node:test';
import assert from 'node:assert/strict';
import { sendSchoolSms, smsReadiness } from './sms.js';

const variables = ['SMS_GATEWAY_URL','SMS_GATEWAY_TOKEN','SMS_GATEWAY_SENDER','ORANGE_SMS_CLIENT_ID','ORANGE_SMS_CLIENT_SECRET','ORANGE_SMS_SENDER_NAME','ORANGE_SMS_SENDER_NUMBER'];
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
