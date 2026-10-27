import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendGraduationHonors, type ApprovedGraduationResult } from './graduationHonors.ts';

const result = (studentId: string, overallAverage: number, overallOutcome = 'PASS'): ApprovedGraduationResult => ({
  studentId, studentNumber: `RIA-${studentId}`, firstName: `First ${studentId}`, lastName: 'Learner', className: 'Grade 12 A', overallAverage, overallOutcome, approvedAt: '2026-10-01T00:00:00Z',
});

test('recommends the top two passing learners at or above 95 from approved results', () => {
  const rows = recommendGraduationHonors([result('3', 94.99), result('2', 96), result('1', 98)]);
  assert.equal(rows.find(row => row.studentId === '1')?.recommendation, 'VALEDICTORIAN_CANDIDATE');
  assert.equal(rows.find(row => row.studentId === '2')?.recommendation, 'SALUTATORIAN_CANDIDATE');
  assert.equal(rows.find(row => row.studentId === '3')?.recommendation, 'BELOW_THRESHOLD');
});

test('does not recommend a learner with a failing final outcome even when their average is 95+', () => {
  const rows = recommendGraduationHonors([result('1', 98, 'FAIL'), result('2', 96)]);
  assert.equal(rows.find(row => row.studentId === '1')?.recommendation, 'FAILED');
  assert.equal(rows.find(row => row.studentId === '2')?.recommendation, 'VALEDICTORIAN_CANDIDATE');
});

test('flags a tie for either top position for Principal review without assigning an award', () => {
  const topTie = recommendGraduationHonors([result('1', 98), result('2', 98), result('3', 96)]);
  assert.equal(topTie.filter(row => row.recommendation === 'TOP_TIE_REVIEW').length, 2);
  assert.equal(topTie.find(row => row.studentId === '3')?.recommendation, 'ELIGIBLE');

  const secondTie = recommendGraduationHonors([result('1', 99), result('2', 98), result('3', 98)]);
  assert.equal(secondTie.find(row => row.studentId === '1')?.recommendation, 'VALEDICTORIAN_CANDIDATE');
  assert.equal(secondTie.filter(row => row.recommendation === 'TOP_TIE_REVIEW').length, 2);
});
