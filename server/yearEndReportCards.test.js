import test from 'node:test';
import assert from 'node:assert/strict';
import { buildYearEndReportCard, validateYearEndWeights } from './yearEndReportCards.js';

const periods = ['1st', '2nd', '3rd', 'Exam', '4th', '5th', '6th', 'Exam']
  .map((label, index) => ({ id: `period-${index + 1}`, label, sort_order: index + 1 }));
const student = { id: 'student-1', student_number: 'RIA-001', first_name: 'Test', last_name: 'Learner' };
const subject = { id: 'subject-1', name: 'Mathematics' };
const completeMarks = (score = 70) => periods.flatMap(period => {
  const periodCategories = [4, 8].includes(period.sort_order) ? ['EXAM'] : ['ASSIGNMENT', 'QUIZ', 'TEST'];
  return periodCategories.map(assessment_type => ({
  student_id: student.id,
  subject_id: subject.id,
  reporting_period_id: period.id,
  assessment_type,
  score,
  max_score: 100,
  }));
});

test('year-end report validates configured category weights total exactly 100 percent', () => {
  assert.deepEqual(validateYearEndWeights({ ASSIGNMENT: 20, QUIZ: 30, TEST: 50 }), { ASSIGNMENT: 20, QUIZ: 30, TEST: 50, EXAM: 100 });
  assert.deepEqual(validateYearEndWeights({ ASSIGNMENT: 25, QUIZ: 25, TEST: 25, EXAM: 25 }), { ASSIGNMENT: 33.33, QUIZ: 33.33, TEST: 33.34, EXAM: 100 });
  assert.equal(validateYearEndWeights({ ASSIGNMENT: 20, QUIZ: 10, TEST: 30 }), null);
});

test('year-end report creates eight period averages and passes at 70 percent', () => {
  const result = buildYearEndReportCard({ student, subjects: [subject], periods, markRows: completeMarks(70) });
  assert.equal(result.periods.length, 8);
  assert.deepEqual(result.periods.map(period => period.label), ['1st', '2nd', '3rd', 'Exam', '4th', '5th', '6th', 'Exam']);
  assert.equal(result.subjects[0].periods[0].score, 70);
  assert.equal(result.subjects[0].annualAverage, 70);
  assert.equal(result.overallAverage, 70);
  assert.equal(result.overallOutcome, 'PASS');
  assert.equal(result.readyForPrincipal, true);
});

test('year-end average below 70 fails and missing category marks block approval', () => {
  const failed = buildYearEndReportCard({ student, subjects: [subject], periods, markRows: completeMarks(69) });
  assert.equal(failed.overallOutcome, 'FAIL');
  const missing = buildYearEndReportCard({ student, subjects: [subject], periods, markRows: completeMarks().slice(0, -1) });
  assert.equal(missing.complete, false);
  assert.equal(missing.overallOutcome, 'INCOMPLETE');
  assert.equal(missing.readyForPrincipal, false);
});

test('regular periods need assignment, quiz, and test while exam periods need only an exam', () => {
  const marks = completeMarks(70);
  const withUnneededExamMarksRemoved = marks.filter(mark => mark.assessment_type !== 'EXAM' || [4, 8].includes(periods.find(period => period.id === mark.reporting_period_id).sort_order));
  const result = buildYearEndReportCard({ student, subjects: [subject], periods, markRows: withUnneededExamMarksRemoved });
  assert.equal(result.complete, true);
  assert.equal(result.subjects[0].periods[0].score, 70);
  assert.equal(result.subjects[0].periods[3].score, 70);

  const missingRegularTest = withUnneededExamMarksRemoved.filter(mark => !(mark.reporting_period_id === 'period-1' && mark.assessment_type === 'TEST'));
  const incomplete = buildYearEndReportCard({ student, subjects: [subject], periods, markRows: missingRegularTest });
  assert.deepEqual(incomplete.subjects[0].periods[0].missingCategories, ['TEST']);
  assert.equal(incomplete.subjects[0].periods[0].score, null);
});
