import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { generateVapidKeys, sendWebPush } from './webPush.js';

test('web push encrypts the payload and signs a VAPID request', async t => {
  const previous = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY, sub: process.env.VAPID_SUBJECT, fetch: globalThis.fetch };
  t.after(() => { for (const [key,value] of [['VAPID_PUBLIC_KEY',previous.pub],['VAPID_PRIVATE_KEY',previous.priv],['VAPID_SUBJECT',previous.sub]]) value === undefined ? delete process.env[key] : process.env[key]=value; globalThis.fetch=previous.fetch; });
  const keys=generateVapidKeys();process.env.VAPID_PUBLIC_KEY=keys.publicKey;process.env.VAPID_PRIVATE_KEY=keys.privateKey;process.env.VAPID_SUBJECT='mailto:security@example.test';
  const client=createECDH('prime256v1');client.generateKeys();let request;
  globalThis.fetch=async(url,options)=>{request={url,options};return {ok:true,status:201};};
  const result=await sendWebPush({endpoint:'https://push.example.test/send/abc',p256dh:client.getPublicKey().toString('base64url'),auth_secret:randomBytes(16).toString('base64url')},{title:'Test alert',body:'Encrypted message',url:'/portal'});
  assert.deepEqual(result,{sent:true});assert.equal(request.options.method,'POST');assert.match(request.options.headers.Authorization,/^vapid t=.+, k=.+$/);assert.equal(request.options.headers['Content-Encoding'],'aes128gcm');assert.ok(Buffer.isBuffer(request.options.body));assert.ok(request.options.body.length>100);
});

test('web push stays disabled until its VAPID credentials are configured', async t => {
  const previous=[process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY,process.env.VAPID_SUBJECT];
  delete process.env.VAPID_PUBLIC_KEY;delete process.env.VAPID_PRIVATE_KEY;delete process.env.VAPID_SUBJECT;
  t.after(()=>{for(const [i,key] of ['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'].entries())previous[i]===undefined?delete process.env[key]:process.env[key]=previous[i];});
  const result=await sendWebPush({},{});assert.equal(result.sent,false);assert.match(result.reason,/not configured/i);
});
