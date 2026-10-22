import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvitationSecret, hashInvitationToken, sendAccountInvitation } from './invitations.js';

const trackedEnv = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'APP_PUBLIC_URL', 'EMAIL_MODE', 'EMAIL_ALLOWED_RECIPIENTS'];

function withEnv(values, action) {
  const previous = Object.fromEntries(trackedEnv.map(key => [key, process.env[key]]));
  for (const key of trackedEnv) delete process.env[key];
  Object.assign(process.env, values);
  return Promise.resolve().then(action).finally(() => {
    for (const key of trackedEnv) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}

test('invitation tokens are high entropy and stored as one-way SHA-256 hashes', () => {
  const first = createInvitationSecret();
  const second = createInvitationSecret();
  assert.equal(first.token.length, 43);
  assert.equal(first.tokenHash, hashInvitationToken(first.token));
  assert.equal(first.tokenHash.length, 64);
  assert.notEqual(first.token, first.tokenHash);
  assert.notEqual(first.token, second.token);
});

test('staging invitation emails are limited to allowlisted recipients and use configured sender/link', async () => {
  await withEnv({
    RESEND_API_KEY: 're_test_only',
    RESEND_FROM_EMAIL: "Redeemer ERP Staging <staging@mail.redeemer.totag.network>",
    APP_PUBLIC_URL: 'https://redeemer-staging.totag.network',
    EMAIL_MODE: 'staging',
    EMAIL_ALLOWED_RECIPIENTS: 'tester@example.test',
  }, async () => {
    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200 };
    };
    try {
      await sendAccountInvitation({ email: 'Tester@example.test', fullName: '<Test User>', role: 'TEACHER', token: 'x'.repeat(43) });
      assert.equal(request.url, 'https://api.resend.com/emails');
      const body = JSON.parse(request.options.body);
      assert.deepEqual(body.to, ['Tester@example.test']);
      assert.match(body.from, /staging@mail\.redeemer\.totag\.network/);
      assert.match(body.html, /&lt;Test User&gt;/);
      assert.match(body.html, /https:\/\/redeemer-staging\.totag\.network\/set-password\?token=/);
      assert.match(body.text, /expires in 48 hours/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('staging invitation email fails closed for recipients outside the test allowlist', async () => {
  await withEnv({
    RESEND_API_KEY: 're_test_only',
    RESEND_FROM_EMAIL: 'Redeemer ERP Staging <staging@mail.redeemer.totag.network>',
    APP_PUBLIC_URL: 'https://redeemer-staging.totag.network',
    EMAIL_MODE: 'staging',
    EMAIL_ALLOWED_RECIPIENTS: 'approved@example.test',
  }, async () => {
    await assert.rejects(
      sendAccountInvitation({ email: 'parent@example.test', fullName: 'Test Parent', role: 'PARENT', token: 'x'.repeat(43) }),
      /approved test inboxes/
    );
  });
});
