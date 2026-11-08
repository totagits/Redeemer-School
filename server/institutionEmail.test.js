import test from 'node:test';
import assert from 'node:assert/strict';
import {setServerInstitution} from './dedicatedInstitution.js';
import {sendAccountInvitation,sendPasswordResetEmail} from './invitations.js';
import {sendExamEmail} from './admissionExamEmail.js';

test('account and examination email use the configured school, escaped HTML and its own application origin',async()=>{
  const keys=['RESEND_API_KEY','RESEND_FROM_EMAIL','APP_PUBLIC_URL','EMAIL_MODE'];
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]])),priorFetch=globalThis.fetch,bodies=[];
  Object.assign(process.env,{RESEND_API_KEY:'fictional-not-a-key',RESEND_FROM_EMAIL:'TEST School <no-reply@example.invalid>',APP_PUBLIC_URL:'https://school.example.invalid',EMAIL_MODE:'staging'});
  setServerInstitution({school:{name:'TEST <School & Co>'}});
  const mock=async(_url,options)=>{bodies.push(JSON.parse(options.body));return {ok:true,json:async()=>({id:'TEST-NO-DELIVERY'})};};
  globalThis.fetch=mock;
  try {
    await sendAccountInvitation({email:'test@example.invalid',fullName:'TEST User',role:'TEACHER',token:'x'.repeat(43)});
    await sendPasswordResetEmail({email:'test@example.invalid',fullName:'TEST User',token:'y'.repeat(43)});
    await sendExamEmail({email:'test@example.invalid',token:'z'.repeat(43),kind:'verify',reference:'TEST-ONLY',publicUrl:process.env.APP_PUBLIC_URL,apiKey:'fictional-not-a-key',from:process.env.RESEND_FROM_EMAIL,allowedRecipients:'test@example.invalid',fetchImpl:mock});
    assert.equal(bodies.length,3);
    for(const body of bodies){assert.doesNotMatch(body.text,/Redeemer/);assert.match(body.text,/TEST <School & Co>/);assert.match(body.text,/https:\/\/school\.example\.invalid\//);}
    for(const body of bodies.slice(0,2)){assert.doesNotMatch(body.html,/<School & Co>|\$\{escapeHtml/);assert.match(body.html,/TEST &lt;School &amp; Co&gt;/);}
  }finally{
    setServerInstitution(null);globalThis.fetch=priorFetch;
    for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
  }
});
