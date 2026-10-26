import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateYearEndSubjectGrade, reviewYearEndPromotion, type PublishedMark } from './yearEndPromotion.ts';

const completeMarks: PublishedMark[] = [
  { assessmentType: 'QUIZ', score: 80, maxScore: 100, status: 'PUBLISHED' },
  { assessmentType: 'ASSIGNMENT', score: 90, maxScore: 100, status: 'PUBLISHED' },
  { assessmentType: 'TEST', score: 70, maxScore: 100, status: 'PUBLISHED' },
  { assessmentType: 'EXAM', score: 60, maxScore: 100, status: 'PUBLISHED' },
];

test('year-end subject grade combines quiz, assignment, test and exam at 20/10/30/40', () => {
  const result = calculateYearEndSubjectGrade(completeMarks);
  assert.equal(result.finalScore, 70);
  assert.equal(result.outcome, 'PASS');
  assert.deepEqual(result.categoryPercentages, { QUIZ: 80, ASSIGNMENT: 90, TEST: 70, EXAM: 60 });
});

test('category mark uses total points and excludes unpublished grades', () => {
  const result = calculateYearEndSubjectGrade([
    ...completeMarks,
    { assessmentType: 'QUIZ', score: 50, maxScore: 100, status: 'DRAFT' },
    { assessmentType: 'QUIZ', score: 50, maxScore: 100, status: 'PUBLISHED' },
  ]);
  assert.equal(result.categoryPercentages.QUIZ, 65);
  assert.equal(result.finalScore, 67);
  assert.equal(result.outcome, 'FAIL');
});

test('missing assessment category is incomplete rather than silently counted as zero', () => {
  const result = calculateYearEndSubjectGrade(completeMarks.filter(mark => mark.assessmentType !== 'EXAM'));
  assert.equal(result.complete, false);
  assert.equal(result.finalScore, null);
  assert.deepEqual(result.missingCategories, ['EXAM']);
  assert.equal(result.outcome, 'INCOMPLETE');
});

test('school year-end boundaries fail below 70, pass at 70, and review a zero', () => {
  const withScore = (score: number) => calculateYearEndSubjectGrade([
    { assessmentType: 'QUIZ', score, maxScore: 100, status: 'PUBLISHED' },
    { assessmentType: 'ASSIGNMENT', score, maxScore: 100, status: 'PUBLISHED' },
    { assessmentType: 'TEST', score, maxScore: 100, status: 'PUBLISHED' },
    { assessmentType: 'EXAM', score, maxScore: 100, status: 'PUBLISHED' },
  ]).outcome;
  assert.equal(withScore(0), 'REVIEW_REQUIRED');
  assert.equal(withScore(61), 'FAIL');
  assert.equal(withScore(69.99), 'FAIL');
  assert.equal(withScore(70), 'PASS');
});

test('year-end review requires all subject grades and leaves final promotion to staff', () => {
  const pass = calculateYearEndSubjectGrade(completeMarks);
  const result = reviewYearEndPromotion([{ subject: 'Mathematics', grade: pass }, { subject: 'English', grade: pass }], false);
  assert.equal(result.promotionRecommendation, 'ELIGIBLE');
  assert.equal(result.honorCandidate, false);
  const incomplete = calculateYearEndSubjectGrade(completeMarks.slice(1));
  assert.equal(reviewYearEndPromotion([{ subject: 'Science', grade: incomplete }], false).promotionRecommendation, 'NEEDS_REVIEW');
});

test('95+ honor candidates are flagged only within a graduating cohort', () => {
  const honors = [20, 10, 30, 40].map((weight, index) => ({
    assessmentType: (['QUIZ', 'ASSIGNMENT', 'TEST', 'EXAM'] as const)[index],
    score: 96,
    maxScore: 100,
    status: 'PUBLISHED',
  }));
  const grade = calculateYearEndSubjectGrade(honors);
  assert.equal(reviewYearEndPromotion([{ subject: 'Mathematics', grade }], true).honorCandidate, true);
  assert.equal(reviewYearEndPromotion([{ subject: 'Mathematics', grade }], false).honorCandidate, false);
});
