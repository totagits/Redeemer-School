import test from 'node:test';
import assert from 'node:assert/strict';
import { buildYearEndReportCard, validateYearEndWeights } from './yearEndReportCards.js';

const categories = ['ASSIGNMENT', 'QUIZ', 'TEST', 'EXAM'];
const periods = ['1st', '2nd', '3rd', 'Exam', '4th', '5th', '6th', 'Exam']
  .map((label, index) => ({ id: `period-${index + 1}`, label, sort_order: index + 1 }));
const student = { id: 'student-1', student_number: 'RIA-001', first_name: 'Test', last_name: 'Learner' };
const subject = { id: 'subject-1', name: 'Mathematics' };
const fullMarks = (score = 70) => periods.flatMap(period => categories.map(assessment_type => ({
  student_id: student.id,
  subject_id: subject.id,
  reporting_period_id: period.id,
  assessment_type,
  score,
  max_score: 100,
})));

test('year-end report validates configured category weights total exactly 100 percent', () => {
  assert.deepEqual(validateYearEndWeights({ ASSIGNMENT: 20, QUIZ: 10, TEST: 30, EXAM: 40 }), { ASSIGNMENT: 20, QUIZ: 10, TEST: 30, EXAM: 40 });
  assert.equal(validateYearEndWeights({ ASSIGNMENT: 20, QUIZ: 10, TEST: 30, EXAM: 30 }), null);
});

test('year-end report creates eight period averages and passes at 70 percent', () => {
  const result = buildYearEndReportCard({ student, subjects: [subject], periods, markRows: fullMarks(70) });
  assert.equal(result.periods.length, 8);
  assert.deepEqual(result.periods.map(period => period.label), ['1st', '2nd', '3rd', 'Exam', '4th', '5th', '6th', 'Exam']);
  assert.equal(result.subjects[0].periods[0].score, 70);
  assert.equal(result.subjects[0].annualAverage, 70);
  assert.equal(result.overallAverage, 70);
  assert.equal(result.overallOutcome, 'PASS');
  assert.equal(result.readyForPrincipal, true);
});

test('year-end average below 70 fails and missing category marks block approval', () => {
  const failed = buildYearEndReportCard({ student, subjects: [subject], periods, markRows: fullMarks(69) });
  assert.equal(failed.overallOutcome, 'FAIL');
  const missing = buildYearEndReportCard({ student, subjects: [subject], periods, markRows: fullMarks().slice(0, -1) });
  assert.equal(missing.complete, false);
  assert.equal(missing.overallOutcome, 'INCOMPLETE');
  assert.equal(missing.readyForPrincipal, false);
});
