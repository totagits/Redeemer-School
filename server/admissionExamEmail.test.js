import test from 'node:test';
import assert from 'node:assert/strict';
import { sendExamEmail } from './admissionExamEmail.js';
import { issueCandidateSecret } from './admissionExamCredential.js';

const config={email:'guardian@example.invalid',allowedRecipients:'guardian@example.invalid',token:issueCandidateSecret().token,kind:'access',reference:'test-exam',publicUrl:'https://school.example',apiKey:'test-key',from:'Test School <test@example.invalid>',idempotencyKey:'test-email-only'};

test('staging verification, examination and result messages require an exact approved mailbox',async()=>{
 for(const kind of ['verify','access','result'])for(const allowedRecipients of ['', 'other@example.invalid', '*@example.invalid', 'example.invalid', 'guardian@example.invalid.attacker.test']){
  let called=false;
  await assert.rejects(sendExamEmail({...config,kind,allowedRecipients,fetchImpl:async()=>{called=true;return {ok:true};}}),/approved test recipient/);
  assert.equal(called,false);
 }
});

test('approved mailbox matching normalizes case and list separators',async()=>{
 let called=false;
 await sendExamEmail({...config,allowedRecipients:'other@example.invalid; GUARDIAN@EXAMPLE.INVALID\nsecond@example.invalid',fetchImpl:async()=>{called=true;return {ok:true};}});
 assert.equal(called,true);
});

test('production messages do not depend on the staging recipient list',async()=>{
 let called=false;
 await sendExamEmail({...config,staging:false,allowedRecipients:'',fetchImpl:async()=>{called=true;return {ok:true};}});
 assert.equal(called,true);
});
test('access email is sent only to its supplied verified recipient and never puts codes in a URL',async()=>{
 let body;
 await sendExamEmail({...config,fetchImpl:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');assert.equal(options.headers['Idempotency-Key'],config.idempotencyKey);body=JSON.parse(options.body);return {ok:true};}});
 assert.deepEqual(body.to,[config.email]);
 assert.match(body.subject,/^\[STAGING\]/);
 assert.ok(body.text.includes(config.token));
 assert.match(body.text,/https:\/\/school.example\/examination\n/);
 assert.ok(!body.text.includes('?token='));
});
test('invalid configuration is rejected before contacting the email service',async()=>{
 for(const change of [{email:'invalid'},{publicUrl:'http://school.example'},{token:'bad'},{apiKey:''},{kind:'other'}]){
  let called=false;
  await assert.rejects(sendExamEmail({...config,...change,fetchImpl:async()=>{called=true;return {ok:true};}}));
  assert.equal(called,false);
 }
});
test('provider failures do not disclose provider response contents',async()=>{
 await assert.rejects(sendExamEmail({...config,fetchImpl:async()=>({ok:false,text:async()=> 'sensitive-provider-response'})}),error=>error.message==='Examination email could not be delivered.');
});

test('result notifications contain a private code rather than marks or public result links',async()=>{
 let body;
 await sendExamEmail({...config,kind:'result',fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return {ok:true};}});
 assert.match(body.subject,/private examination result is ready/);
 assert.ok(body.text.includes('https://school.example/examination/results'));
 assert.ok(body.text.includes(config.token));
 assert.ok(!body.text.includes('?token='));
 assert.ok(!body.text.includes('75.00'));
});
