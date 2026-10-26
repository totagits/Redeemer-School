import { classifySchoolGrade } from './schoolGradingPolicy.ts';

export type FinalAssessmentType = 'QUIZ' | 'ASSIGNMENT' | 'PROJECT' | 'TEST' | 'EXAM';
export type PublishedMark = {
  assessmentType: FinalAssessmentType;
  score: number;
  maxScore: number;
  status: string;
};

export type YearEndSubjectGrade = {
  complete: boolean;
  missingCategories: Array<'QUIZ' | 'ASSIGNMENT' | 'TEST' | 'EXAM'>;
  categoryPercentages: Partial<Record<'QUIZ' | 'ASSIGNMENT' | 'TEST' | 'EXAM', number>>;
  finalScore: number | null;
  outcome: 'INCOMPLETE' | 'FAIL' | 'PASS' | 'REVIEW_REQUIRED';
};

const weights = { QUIZ: 20, ASSIGNMENT: 10, TEST: 30, EXAM: 40 } as const;
const categories = Object.keys(weights) as Array<keyof typeof weights>;

function categoryFor(type: FinalAssessmentType): keyof typeof weights {
  return type === 'PROJECT' ? 'ASSIGNMENT' : type;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates one subject's annual mark using teacher-published marks only.
 * Multiple marks in a category are combined by points earned / points possible;
 * the four resulting category percentages use the school's existing 20/10/30/40
 * weights (quiz, assignment/project, test, exam). A missing category is never
 * silently counted as zero.
 */
export function calculateYearEndSubjectGrade(marks: PublishedMark[]): YearEndSubjectGrade {
  const totals = Object.fromEntries(categories.map(category => [category, { score: 0, maxScore: 0 }])) as Record<keyof typeof weights, { score: number; maxScore: number }>;

  for (const mark of marks) {
    if (mark.status !== 'PUBLISHED') continue;
    if (!Number.isFinite(mark.score) || !Number.isFinite(mark.maxScore) || mark.maxScore <= 0 || mark.score < 0 || mark.score > mark.maxScore) {
      throw new RangeError('Published marks must be between zero and a positive assessment maximum.');
    }
    const category = categoryFor(mark.assessmentType);
    totals[category].score += mark.score;
    totals[category].maxScore += mark.maxScore;
  }

  const missingCategories = categories.filter(category => totals[category].maxScore === 0);
  const categoryPercentages: YearEndSubjectGrade['categoryPercentages'] = {};
  for (const category of categories) {
    if (totals[category].maxScore > 0) categoryPercentages[category] = round2((totals[category].score / totals[category].maxScore) * 100);
  }
  if (missingCategories.length) return { complete: false, missingCategories, categoryPercentages, finalScore: null, outcome: 'INCOMPLETE' };

  const finalScore = round2(categories.reduce((sum, category) => sum + (categoryPercentages[category] || 0) * weights[category] / 100, 0));
  const grade = classifySchoolGrade(finalScore);
  return { complete: true, missingCategories: [], categoryPercentages, finalScore, outcome: grade.outcome };
}

export type StudentYearEndReview = {
  complete: boolean;
  subjectCount: number;
  averageScore: number | null;
  failedSubjects: string[];
  subjectsNeedingReview: string[];
  promotionRecommendation: 'NEEDS_REVIEW' | 'NOT_ELIGIBLE' | 'ELIGIBLE';
  honorCandidate: boolean;
};

/**
 * Produces a review recommendation only. It never promotes or ranks a learner;
 * an authorized school officer makes and records the final decision.
 */
export function reviewYearEndPromotion(
  subjects: Array<{ subject: string; grade: YearEndSubjectGrade }>,
  graduatingCohort: boolean,
): StudentYearEndReview {
  const failedSubjects = subjects.filter(item => item.grade.outcome === 'FAIL').map(item => item.subject);
  const subjectsNeedingReview = subjects.filter(item => !item.grade.complete || item.grade.outcome === 'INCOMPLETE' || item.grade.outcome === 'REVIEW_REQUIRED').map(item => item.subject);
  const complete = subjects.length > 0 && subjects.every(item => item.grade.complete && item.grade.finalScore !== null);
  const averageScore = complete ? round2(subjects.reduce((sum, item) => sum + (item.grade.finalScore || 0), 0) / subjects.length) : null;
  const promotionRecommendation = !complete || subjectsNeedingReview.length
    ? 'NEEDS_REVIEW'
    : failedSubjects.length
      ? 'NOT_ELIGIBLE'
      : 'ELIGIBLE';
  return {
    complete,
    subjectCount: subjects.length,
    averageScore,
    failedSubjects,
    subjectsNeedingReview,
    promotionRecommendation,
    honorCandidate: graduatingCohort && promotionRecommendation === 'ELIGIBLE' && averageScore !== null && averageScore >= 95,
  };
}
