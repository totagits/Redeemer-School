import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../src/components/',import.meta.url);
const scheduling=readFileSync(new URL('EntranceExamScheduling.tsx',root),'utf8');
const operations=readFileSync(new URL('OperationsWorkspace.tsx',root),'utf8');
const api=readFileSync(new URL('./operations.js',import.meta.url),'utf8');
test('admissions dashboards expose an isolated examination scheduling form',()=>{
 assert.match(operations,/EntranceExamScheduling applications=\{data\.applications\}/);
 assert.match(scheduling,/Create private exam draft/);
 assert.match(scheduling,/Confirm examination schedule/);
 assert.match(scheduling,/Assign eligible applicant/);
 assert.match(scheduling,/timeZone:'Africa\/Monrovia'/);
 assert.match(scheduling,/Private scheduling only/);
});
test('entrance exams require separate migration readiness and restrict writes',()=>{
 assert.match(api,/requireEntranceExamSchema\(req,res\)/);
 assert.match(api,/migrationRequired:'102_admission_entrance_exams.sql'/);
 assert.match(api,/router\.post\('\/admissions\/entrance-exams\/:examId\/schedule',needsPermission\('admissions.write'\),csrf/);
 assert.match(api,/ENTRANCE_EXAM_SCHEDULED/);
 assert.match(api,/EXISTS\(SELECT 1 FROM admission_exam_assignments/);
 assert.match(api,/e\.starts_at>now\(\)/);
});
test('private entrance exam module never exposes individual scores to public updates',()=>{
 assert.doesNotMatch(scheduling,/public_school_posts|publish publicly|Send SMS/);
 assert.doesNotMatch(api.slice(api.indexOf('router.post(\'/admissions/entrance-exams/:examId/schedule\''),api.indexOf('// Admissions, HR, stock control')),/public_school_posts/);
});
