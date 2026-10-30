import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const operations=readFileSync(new URL('./operations.js',import.meta.url),'utf8');
const from=operations.indexOf("router.post('/admissions/entrance-exams/:examId/questions'");
const to=operations.indexOf("router.get('/finance/entrance-exam-fees'",from);
const route=operations.slice(from,to);

test('question authoring is authenticated, permission-gated and CSRF-protected',()=>{
 assert.ok(from>=0 && to>from);
 assert.match(route,/needsPermission\('admissions.write'\),csrf/);
});
test('draft and no-existing-attempt safeguards occur in tenant-scoped insertion',()=>{
 assert.match(route,/e.school_id=\$1 AND e.id=\$2 AND e.status='DRAFT'/);
 assert.match(route,/NOT EXISTS \(SELECT 1 FROM admission_exam_attempts/);
 assert.match(route,/t.school_id=e.school_id AND t.exam_id=e.id/);
});
test('multiple choice validates choice list, integer key and valid index',()=>{
 assert.match(route,/options.length>=2 && options.length<=8/);
 assert.match(route,/Number.isInteger\(key\) && key>=0 && key<options.length/);
 assert.match(route,/Number.isFinite\(points\) \|\| points<=0 \|\| points>100/);
});
test('question create response does not select or expose answer key',()=>{
 const match=route.match(/RETURNING ([^\x60]+)/);
 assert.ok(match);
 assert.doesNotMatch(match[1],/answer_key/);
 assert.match(route,/ENTRANCE_EXAM_QUESTION_CREATED/);
});
