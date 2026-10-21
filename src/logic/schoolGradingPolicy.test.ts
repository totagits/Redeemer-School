import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySchoolGrade } from './schoolGradingPolicy.ts';

test('classifies requested fail and pass score ranges', () => {
  assert.equal(classifySchoolGrade(1).outcome, 'FAIL');
  assert.equal(classifySchoolGrade(60).outcome, 'FAIL');
  assert.equal(classifySchoolGrade(70).outcome, 'PASS');
  assert.equal(classifySchoolGrade(100).outcome, 'PASS');
});

test('holds scores the school policy has not defined for review', () => {
  assert.equal(classifySchoolGrade(0).outcome, 'REVIEW_REQUIRED');
  assert.equal(classifySchoolGrade(61).outcome, 'REVIEW_REQUIRED');
  assert.equal(classifySchoolGrade(69.99).outcome, 'REVIEW_REQUIRED');
});

test('rejects out-of-range marks and invalid policy thresholds', () => {
  assert.throws(() => classifySchoolGrade(-1), RangeError);
  assert.throws(() => classifySchoolGrade(101), RangeError);
  assert.throws(() => classifySchoolGrade(70, { failMin: 1, failMax: 80, passMin: 70 }), RangeError);
});
