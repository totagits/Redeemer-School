import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync(new URL('./operations.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('./migrations/103_admission_exam_fees.sql',import.meta.url),'utf8');
const finance=readFileSync(new URL('../src/components/EntranceExamFinance.tsx',import.meta.url),'utf8');
const workspace=readFileSync(new URL('../src/components/OperationsWorkspace.tsx',import.meta.url),'utf8');

test('exam fees and settlements have school-specific forced RLS, unique receipts and reference integrity',()=>{
 for(const table of ['admission_exam_fee_schedules','admission_exam_fee_settlements']){
  assert.match(sql,new RegExp('CREATE TABLE '+table));
  assert.match(sql,new RegExp('ALTER TABLE '+table+' FORCE ROW LEVEL SECURITY'));
 }
 assert.equal((sql.match(/CREATE POLICY tenant_school_scope/g)||[]).length,2);
 assert.match(sql,/UNIQUE\(school_id,exam_id,application_id\)/);
 assert.match(sql,/UNIQUE\(school_id,reference\)/);
 assert.match(sql,/REFERENCES admission_exam_assignments\(school_id,exam_id,application_id\)/);
});
test('Finance-only actions use CSRF, migration readiness and independent proof acknowledgment',()=>{
 assert.match(api,/router\.get\('\/finance\/entrance-exam-fees',needsPermission\('finance.read'\)/);
 assert.match(api,/router\.post\('\/finance\/entrance-exams\/:examId\/fee',needsPermission\('finance.write'\),csrf/);
 assert.match(api,/router\.post\('\/finance\/entrance-exams\/:examId\/applicants\/:applicationId\/settlement',needsPermission\('finance.write'\),csrf/);
 assert.match(api,/migrationRequired:'103_admission_exam_fees.sql'/);
 assert.match(api,/verifiedEvidence===true/);
 assert.match(api,/\['CASH','BANK_TRANSFER'\]\.includes\(channel\)/);
 assert.match(api,/ENTRANCE_EXAM_FEE_SETTLED/);
 assert.match(api,/ENTRANCE_EXAM_FEE_CONFIGURED/);
});
test('Finance user interface clearly separates applicant exam fees from tuition and prohibits unverified MTN',()=>{
 assert.match(workspace,/EntranceExamFinance canWrite=\{data.canWrite\}/);
 assert.match(finance,/Applicant exam charges are separate from enrolled-student tuition/);
 assert.match(finance,/Mobile Money is not yet connected/);
 assert.match(finance,/Record verified payment \/ waiver/);
 assert.match(finance,/verifiedEvidence:true/);
});
