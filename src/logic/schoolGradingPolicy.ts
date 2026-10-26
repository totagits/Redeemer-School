export type SchoolGradeOutcome = 'FAIL' | 'PASS' | 'REVIEW_REQUIRED';

export interface SchoolGradingPolicy {
  failMin: number;
  failMax: number;
  passMin: number;
  gapHandling?: 'FAIL' | 'PASS' | 'REVIEW_REQUIRED';
}

export interface SchoolGradeResult {
  score: number;
  outcome: SchoolGradeOutcome;
}

export const DEFAULT_SCHOOL_GRADING_POLICY: SchoolGradingPolicy = {
  failMin: 1,
  failMax: 60,
  passMin: 70,
  gapHandling: 'FAIL',
};

/**
 * Applies the school's configured pass/fail thresholds. Under the current
 * school rule, scores 1–69 fail and 70–100 pass. A recorded zero remains for
 * review until the school confirms how zero scores should be handled.
 */
export function classifySchoolGrade(
  score: number,
  policy: SchoolGradingPolicy = DEFAULT_SCHOOL_GRADING_POLICY,
): SchoolGradeResult {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new RangeError('Score must be a number from 0 to 100.');
  }
  if (
    !Number.isFinite(policy.failMin) ||
    !Number.isFinite(policy.failMax) ||
    !Number.isFinite(policy.passMin) ||
    policy.failMin < 0 ||
    policy.failMax < policy.failMin ||
    policy.passMin <= policy.failMax ||
    policy.passMin > 100
  ) {
    throw new RangeError('Grading thresholds must be valid, non-overlapping percentages.');
  }

  if (score >= policy.failMin && score <= policy.failMax) {
    return { score, outcome: 'FAIL' };
  }
  if (score >= policy.passMin) {
    return { score, outcome: 'PASS' };
  }
  if (policy.gapHandling === 'FAIL') {
    return { score, outcome: 'FAIL' };
  }
  if (policy.gapHandling === 'PASS') {
    return { score, outcome: 'PASS' };
  }
  return { score, outcome: 'REVIEW_REQUIRED' };
}
