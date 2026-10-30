import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./operations.js',import.meta.url),'utf8');
const start=source.indexOf("router.get('/admissions/entrance-exams/:examId/eligibility'");
const end=source.indexOf("router.get('/finance/entrance-exam-fees'",start);
const route=source.slice(start,end);
test('eligibility route enforces staff admissions read permission',()=>{
 assert.ok(start>=0&&end>start);assert.match(route,/needsPermission\('admissions.read'\)/);
});
test('eligibility queries are scoped to authenticated school and requested exam',()=>{
 assert.match(route,/const schoolId=req.auth.claims.schoolId/);
 assert.match(route,/WHERE school_id=\$1 AND id=\$2/);
 assert.match(route,/WHERE a.school_id=\$1 AND a.exam_id=\$2/);
 assert.match(route,/app.school_id=a.school_id/);
 assert.match(route,/s.school_id=a.school_id/);
});
test('unpaid and unverified payments are not eligible',()=>{
 assert.match(route,/WHEN s.id IS NULL OR s.verified_at IS NULL THEN 'PAYMENT_REQUIRED'/);
 assert.match(route,/WHEN s.kind = 'PAYMENT' THEN 'PAYMENT_MISMATCH'/);
});
test('mismatched payment amount, currency and channel cannot be eligible',()=>{
 assert.match(route,/s.channel IN \('CASH','BANK_TRANSFER','MTN_MOMO_VERIFIED'\)/);
 assert.match(route,/s.amount = f.amount AND s.currency = f.currency/);
});
test('inactive applications, unscheduled exams and non-invited assignments are refused',()=>{
 assert.match(route,/e.status <> 'SCHEDULED'/);
 assert.match(route,/app.status IN \('REJECTED','WITHDRAWN','ENROLLED'\)/);
 assert.match(route,/a.status <> 'INVITED'/);
});
