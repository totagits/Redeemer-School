import test from 'node:test';
import assert from 'node:assert/strict';
import { examEligibility, examSittingWindow, canSubmitExamAttempt } from './admissionExamAccess.js';

const exam = {status:'SCHEDULED',starts_at:'2026-11-05T09:00:00Z',ends_at:'2026-11-05T10:00:00Z'};
const paid = {kind:'PAYMENT',channel:'CASH',amount:'500.00',currency:'LRD',verified_at:'2026-10-29T12:00:00Z'};
const base = {exam,application:{status:'UNDER_REVIEW'},assignment:{status:'INVITED'},fee:{amount:'500.00',currency:'LRD'},settlement:paid};
test('verified correct-currency payment passes, unverified and underpayment fail',()=>{
 assert.equal(examEligibility(base).allowed,true);
 assert.equal(examEligibility({...base,settlement:null}).allowed,false);
 assert.equal(examEligibility({...base,settlement:{...paid,amount:'400.00'}}).allowed,false);
 assert.equal(examEligibility({...base,settlement:{...paid,verified_at:null}}).allowed,false);
 assert.equal(examEligibility({...base,settlement:{...paid,currency:'USD'}}).allowed,false);
});
test('authorized waiver passes; malformed waiver does not',()=>{
 assert.equal(examEligibility({...base,settlement:{kind:'WAIVER',channel:'WAIVER',amount:0,reason:'Approved by Principal'}}).allowed,true);
 assert.equal(examEligibility({...base,settlement:{kind:'WAIVER',channel:'WAIVER',amount:0,reason:'ok'}}).allowed,false);
});
test('unscheduled or withdrawn applicants cannot sit, and zero fee needs configuration',()=>{
 assert.equal(examEligibility({...base,exam:{...exam,status:'DRAFT'}}).allowed,false);
 assert.equal(examEligibility({...base,application:{status:'WITHDRAWN'}}).allowed,false);
 assert.equal(examEligibility({...base,fee:null}).allowed,false);
 assert.equal(examEligibility({...base,fee:{amount:0,currency:'LRD'},settlement:null}).allowed,true);
});
test('GMT exam window is inclusive at start, exclusive at end',()=>{
 assert.equal(examSittingWindow(exam,'2026-11-05T08:59:59Z').allowed,false);
 assert.equal(examSittingWindow(exam,'2026-11-05T09:00:00Z').allowed,true);
 assert.equal(examSittingWindow(exam,'2026-11-05T10:00:00Z').allowed,false);
});
test('identity and submitted attempts fail closed',()=>{
 const common={eligibility:{allowed:true},window:{allowed:true},attempt:{status:'IN_PROGRESS'},authenticatedApplicationId:'a',applicationId:'a'};
 assert.equal(canSubmitExamAttempt(common).allowed,true);
 assert.equal(canSubmitExamAttempt({...common,authenticatedApplicationId:'b'}).allowed,false);
 assert.equal(canSubmitExamAttempt({...common,attempt:{status:'SUBMITTED'}}).allowed,false);
});
