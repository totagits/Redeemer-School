import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../src/components/PublicAdmissionsPage.tsx',import.meta.url),'utf8');
test('public admission requires explicit review prior to posting',()=>{
 assert.match(page,/if \(!review\)/);
 assert.match(page,/Review before submitting/);
 assert.match(page,/No application has been submitted yet/);
 assert.match(page,/Confirm and submit application/);
 assert.match(page,/Edit application/);
 assert.match(page,/setReview\(null\)/);
});
test('class choices match education level and reset when level changes',()=>{
 assert.match(page,/group\.education_level_id === selectedLevel/);
 assert.match(page,/setSelectedClass\(''\)/);
 assert.match(page,/value=\{selectedClass\}/);
});
