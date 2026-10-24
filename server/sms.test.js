import test from 'node:test';
import assert from 'node:assert/strict';
import { sendSchoolSms, smsReadiness } from './sms.js';

test('SMS adapter sends only through an HTTPS configured gateway', async t => {
  const previous={url:process.env.SMS_GATEWAY_URL,token:process.env.SMS_GATEWAY_TOKEN,sender:process.env.SMS_GATEWAY_SENDER,fetch:globalThis.fetch};
  t.after(()=>{for(const [key,value] of [['SMS_GATEWAY_URL',previous.url],['SMS_GATEWAY_TOKEN',previous.token],['SMS_GATEWAY_SENDER',previous.sender]])value===undefined?delete process.env[key]:process.env[key]=value;globalThis.fetch=previous.fetch;});
  process.env.SMS_GATEWAY_URL='https://gateway.example.test/messages';process.env.SMS_GATEWAY_TOKEN='test-secret';process.env.SMS_GATEWAY_SENDER='RIA';let sent;
  globalThis.fetch=async(url,options)=>{sent={url,options};return {ok:true,json:async()=>({messageId:'provider-123'})};};
  assert.equal(smsReadiness(),true);assert.deepEqual(await sendSchoolSms({to:'+231770000000',message:'School notice'}),{providerMessageId:'provider-123'});
  assert.equal(String(sent.url),'https://gateway.example.test/messages');assert.equal(sent.options.headers.Authorization,'Bearer test-secret');assert.deepEqual(JSON.parse(sent.options.body),{to:'+231770000000',sender:'RIA',message:'School notice'});
  process.env.SMS_GATEWAY_URL='http://insecure.example.test';await assert.rejects(sendSchoolSms({to:'231770000000',message:'test'}),/HTTPS/i);
});
