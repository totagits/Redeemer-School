import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync(new URL('./operations.js',import.meta.url),'utf8');
const finance=readFileSync(new URL('../src/components/EntranceExamFinance.tsx',import.meta.url),'utf8');
const roles=readFileSync(new URL('./migrations/006_seed_standard_school_roles.sql',import.meta.url),'utf8');
test('administrator and Finance role can configure future scheduled exam fees',()=>{
 assert.match(roles,/r\.code = 'SCHOOL_ADMIN'/);
 assert.match(roles,/\('FINANCE', 'finance\.write'\)/);
 assert.match(api,/needsPermission\('finance\.write'\),csrf/);
 assert.match(api,/e\.status IN \('DRAFT','SCHEDULED'\) AND e\.starts_at>now\(\)/);
 assert.match(finance,/\['DRAFT','SCHEDULED'\]\.includes\(fee\.status\)/);
 assert.match(finance,/Authorized School Administrators and Finance\/Bursar staff/);
});
test('cannot edit fees after settlements or after start time',()=>{
 assert.match(api,/NOT EXISTS \(SELECT 1 FROM admission_exam_fee_settlements s/);
 assert.match(finance,/!settlements\.some\(item=>item\.exam_id===fee\.exam_id\)/);
 assert.match(finance,/new Date\(fee\.starts_at\)\.getTime\(\)>Date\.now\(\)/);
});
test('finance exam fee accepts numeric decimal amount without stray escaping',()=>{
 const block=api.slice(api.indexOf("router.post('/finance/entrance-exams/:examId/fee'"));
 const match=block.match(/!((?:\/\^).*?\$\/).test\(rawAmount\)/);
 assert.ok(match,'amount regex exists');
 const validator=Function('return '+match[1])();
 assert.equal(validator.test('500.00'),true);
 assert.equal(validator.test('20.50'),true);
 assert.equal(validator.test('500.001'),false);
});
