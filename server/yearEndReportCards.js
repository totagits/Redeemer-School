const REQUIRED_CATEGORIES = ['ASSIGNMENT', 'QUIZ', 'TEST', 'EXAM'];
const PERIOD_CATEGORIES = Object.freeze({ REGULAR: ['ASSIGNMENT', 'QUIZ', 'TEST'], EXAM: ['EXAM'] });
const WEIGHTED_CATEGORIES = PERIOD_CATEGORIES.REGULAR;
const DEFAULT_WEIGHTS = Object.freeze({ ASSIGNMENT: 33.34, QUIZ: 33.33, TEST: 33.33, EXAM: 100 });

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function outcomeFor(score) {
  if (score === null || score === undefined) return 'INCOMPLETE';
  if (score === 0) return 'REVIEW_REQUIRED';
  return score >= 70 ? 'PASS' : 'FAIL';
}

export function validateYearEndWeights(value) {
  if (!value || typeof value !== 'object') return null;
  const normalized = {};
  for (const category of WEIGHTED_CATEGORIES) {
    const weight = Number(value[category]);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) return null;
    normalized[category] = round2(weight);
  }
  const total = Object.values(normalized).reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(total - 100) <= 0.02) return { ...normalized, EXAM: 100 };

  // Migrate the former four-category setup in memory: old versions required
  // Assignment, Quiz, Test, and Exam weights to total 100. Preserve the
  // Assignment/Quiz/Test ratios while scaling those three to 100%.
  const oldTotal = total + Number(value.EXAM);
  if (Number.isFinite(oldTotal) && Math.abs(oldTotal - 100) <= 0.02 && total > 0) {
    const scaled = {};
    for (const category of WEIGHTED_CATEGORIES) scaled[category] = round2(normalized[category] * 100 / total);
    const scaledTotal = Object.values(scaled).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(scaledTotal - 100) <= 0.02) {
      const last = WEIGHTED_CATEGORIES[WEIGHTED_CATEGORIES.length - 1];
      scaled[last] = round2(scaled[last] + 100 - scaledTotal);
      return { ...scaled, EXAM: 100 };
    }
  }
  return null;
}

function isExamPeriod(period) {
  return Number(period.sort_order) === 4 || Number(period.sort_order) === 8;
}

/** Builds a review-only year-end report from published assessment marks. */
export function buildYearEndReportCard({ student, subjects, periods, markRows, weights = DEFAULT_WEIGHTS }) {
  const normalizedWeights = validateYearEndWeights(weights) || DEFAULT_WEIGHTS;
  const orderedPeriods = [...periods].sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  const byStudentSubjectPeriod = new Map();
  for (const row of markRows) {
    const type = row.assessment_type === 'PROJECT' ? 'ASSIGNMENT' : row.assessment_type;
    if (!REQUIRED_CATEGORIES.includes(type)) continue;
    const key = `${row.subject_id}:${row.reporting_period_id}:${type}`;
    const aggregate = byStudentSubjectPeriod.get(key) || { score: 0, max: 0 };
    aggregate.score += Number(row.score);
    aggregate.max += Number(row.max_score);
    byStudentSubjectPeriod.set(key, aggregate);
  }

  const subjectResults = subjects.map(subject => {
    const subjectPeriods = orderedPeriods.map(period => {
      const categoryScores = {};
      const missingCategories = [];
      let weightedTotal = 0;
      const periodCategories = isExamPeriod(period) ? PERIOD_CATEGORIES.EXAM : PERIOD_CATEGORIES.REGULAR;
      let activeWeightTotal = 0;
      for (const category of periodCategories) {
        const aggregate = byStudentSubjectPeriod.get(`${subject.id}:${period.id}:${category}`);
        if (!aggregate || aggregate.max <= 0) {
          categoryScores[category] = null;
          missingCategories.push(category);
          continue;
        }
        const percent = round2(aggregate.score / aggregate.max * 100);
        categoryScores[category] = percent;
        const weight = isExamPeriod(period) ? 100 : normalizedWeights[category];
        weightedTotal += percent * weight;
        activeWeightTotal += weight;
      }
      const complete = missingCategories.length === 0;
      const score = complete && activeWeightTotal > 0 ? round2(weightedTotal / activeWeightTotal) : null;
      return {
        id: period.id,
        label: period.label,
        order: Number(period.sort_order),
        categoryScores,
        missingCategories,
        score,
        outcome: outcomeFor(score),
      };
    });
    const complete = subjectPeriods.length === 8 && subjectPeriods.every(period => period.score !== null);
    const annualAverage = complete ? round2(subjectPeriods.reduce((sum, period) => sum + period.score, 0) / subjectPeriods.length) : null;
    return {
      id: subject.id,
      name: subject.name,
      periods: subjectPeriods,
      annualAverage,
      outcome: outcomeFor(annualAverage),
      complete,
    };
  });

  const complete = orderedPeriods.length === 8 && subjectResults.length > 0 && subjectResults.every(subject => subject.complete);
  const overallAverage = complete
    ? round2(subjectResults.reduce((sum, subject) => sum + subject.annualAverage, 0) / subjectResults.length)
    : null;
  return {
    student,
    periods: orderedPeriods.map(period => ({ id: period.id, label: period.label, order: Number(period.sort_order) })),
    weights: normalizedWeights,
    subjects: subjectResults,
    subjectCount: subjectResults.length,
    overallAverage,
    overallOutcome: outcomeFor(overallAverage),
    complete,
    readyForPrincipal: complete && overallAverage !== null && overallAverage > 0,
  };
}

export { DEFAULT_WEIGHTS, REQUIRED_CATEGORIES, WEIGHTED_CATEGORIES };
