import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('./migrations/102_admission_entrance_exams.sql',import.meta.url),'utf8');
const ops=readFileSync(new URL('./operations.js',import.meta.url),'utf8');
test('entrance exam records are tenant isolated and scores remain private',()=>{
 for(const name of ['admission_entrance_exams','admission_exam_assignments']){
  assert.match(migration,new RegExp('CREATE TABLE '+name));
  assert.match(migration,new RegExp('ALTER TABLE '+name+' FORCE ROW LEVEL SECURITY'));
 }
 assert.equal((migration.match(/CREATE POLICY tenant_school_scope/g)||[]).length,2);
 assert.match(migration,/released_at IS NULL OR score_approved_at IS NOT NULL/);
 assert.match(migration,/UNIQUE\(school_id,exam_id,application_id\)/);
});
test('scheduling and assignments require admissions write permission, CSRF and audit',()=>{
 assert.match(ops,/router.post\('\/admissions\/entrance-exams',needsPermission\('admissions.write'\),csrf/);
 assert.match(ops,/router.post\('\/admissions\/entrance-exams\/:examId\/assign',needsPermission\('admissions.write'\),csrf/);
 assert.match(ops,/ENTRANCE_EXAM_DRAFT_CREATED/);
 assert.match(ops,/ENTRANCE_EXAM_APPLICANT_ASSIGNED/);
 assert.doesNotMatch(migration,/REFERENCES public_school_posts/);
});
