import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createStagingReviewRouter,stagingReviewEnabled} from './stagingReview.js';
import {reviewFeedbackPayload} from '../src/logic/reviewFeedback.ts';
import {parseWebsiteRequest} from './websiteRequests.js';
import {readFile} from 'node:fs/promises';

test('review downloads require staging mode and a clean HTTPS school address',async t=>{
  const staging={EMAIL_MODE:'staging',APP_PUBLIC_URL:'https://redeemer-staging.example.invalid'};
  assert.equal(stagingReviewEnabled(staging),true);
  for(const env of [{...staging,EMAIL_MODE:'production'},{...staging,APP_PUBLIC_URL:'http://school.example.invalid'},{...staging,APP_PUBLIC_URL:'https://user:password@school.example.invalid'},{}])assert.equal(stagingReviewEnabled(env),false);
  for(const [env,enabled] of [[staging,true],[{...staging,EMAIL_MODE:'production'},false]]){
    const app=express();app.use(createStagingReviewRouter({env}));const server=createServer(app).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
    const url=`http://127.0.0.1:${server.address().port}`;
    assert.equal((await(await fetch(url+'/status')).json()).enabled,enabled);
    const rules=await fetch(url+'/payroll-rules');assert.equal(rules.status,enabled?200:404);assert.equal(rules.headers.get('Cache-Control'),'no-store');
    if(enabled){assert.match(await rules.text(),/Draft for school approval/);const roster=await fetch(url+'/account-roster');const text=await roster.text();assert.match(text,/Reviewer name,Email,Requested role/);assert.doesNotMatch(text,/password|mgwoah|tonieh/i);}
  }
});
test('review feedback uses the existing private enquiry contract without granting a role or approving a policy',()=>{
  const body=reviewFeedbackPayload({contactName:'TEST Reviewer',email:'test@example.invalid',role:'Principal',workspace:'Payroll',outcome:'School policy proposal',expected:'A separate leader should approve.',observed:'Reviewed the fictional manual payroll flow.',policy:'TEST proposal only; no employee values.'},'RIA',randomUUID(),true);
  const parsed=parseWebsiteRequest(body);
  assert.equal(parsed.category,'ENQUIRY');assert.match(parsed.subject,/^STAGING REVIEW/);assert.match(parsed.message,/self-described, not an authorization/);
  assert.equal(body.approved,undefined);assert.equal(body.role,undefined);assert.equal(body.recipient,undefined);
  assert.throws(()=>reviewFeedbackPayload({observed:'x'.repeat(2200)},'RIA',randomUUID(),true),/shorten/);
  assert.throws(()=>parseWebsiteRequest({...body,consent:false}));
});
test('public review instructions contain family access and feedback but no staff entry URL or automatic role registration',async()=>{
  const source=await readFile(new URL('../src/components/SchoolReviewPage.tsx',import.meta.url),'utf8');
  assert.match(source,/href="\/portal"/);assert.match(source,/href="\/review\/payroll"/);assert.match(source,/private Website requests queue/);
  assert.doesNotMatch(source,/href="\/staff|https?:\/\/[^\s]+\/staff|password.*defaultValue|create-account|self-register/);
});
