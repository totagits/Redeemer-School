import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { liberiaExamInstant, liberiaExamDate, liberiaExamTime, examTimeOptions } from '../src/logic/entranceExamTime.ts';

const scheduling=readFileSync(new URL('../src/components/EntranceExamScheduling.tsx',import.meta.url),'utf8');
const operations=readFileSync(new URL('./operations.js',import.meta.url),'utf8');

test('nine oclock Liberia time is 09:00Z regardless of browser locale',()=>{
 assert.equal(liberiaExamInstant('2026-11-05','09:00'),'2026-11-05T09:00:00.000Z');
 assert.equal(liberiaExamInstant('2026-11-05','10:00'),'2026-11-05T10:00:00.000Z');
 assert.equal(liberiaExamTime('2026-11-05T09:00:00.000Z'),'09:00');
 assert.equal(liberiaExamDate('2026-11-05T09:00:00.000Z'),'2026-11-05');
 assert.equal(examTimeOptions.length,96);
 assert.deepEqual(examTimeOptions[36],{value:'09:00',label:'9:00 AM'});
 assert.deepEqual(examTimeOptions[60],{value:'15:00',label:'3:00 PM'});
 assert.throws(()=>liberiaExamInstant('2026-02-30','09:00'));
 assert.throws(()=>liberiaExamInstant('2026-11-05','25:00'));
});
test('scheduling form avoids browser datetime-local conversion and supports correction',()=>{
 assert.doesNotMatch(scheduling,/type="datetime-local"/);
 assert.match(scheduling,/name="startTime"/);
 assert.match(scheduling,/name="endTime"/);
 assert.match(scheduling,/liberiaExamInstant\(date/);
 assert.match(scheduling,/Correct examination date\/time/);
 assert.match(scheduling,/Save corrected schedule/);
 assert.match(scheduling,/timeZone:'Africa\/Monrovia'/);
});
test('reschedule is authorized and audited and cannot rewrite attended or graded session',()=>{
 assert.match(operations,/router.post\('\/admissions\/entrance-exams\/:examId\/reschedule',needsPermission\('admissions.write'\),csrf/);
 assert.match(operations,/ENTRANCE_EXAM_TIME_CORRECTED/);
 assert.match(operations,/a\.status IN \('ATTENDED','COMPLETED'\) OR a\.score IS NOT NULL/);
});

test('reschedule validator recognizes real ISO timestamps instead of literal backslash characters',()=>{
 const match=operations.match(/const validInstant=(\/\^.*?\$\/);/);
 assert.ok(match, 'rescheduling validator exists');
 const validator=Function('return '+match[1])();
 assert.equal(validator.test('2026-11-05T09:00:00.000Z'),true);
 assert.equal(validator.test('2026-11-05T10:00:00.000Z'),true);
 assert.equal(validator.test('2026-11-05T15:00:00.000Z'),true);
 assert.equal(validator.test('2026-11-05 09:00:00'),false);
});
