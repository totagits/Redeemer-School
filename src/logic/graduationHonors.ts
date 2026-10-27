export type ApprovedGraduationResult = {
  studentId: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  className: string;
  overallAverage: number;
  overallOutcome: string;
  approvedAt: string;
};

export type GraduationHonorsRow = ApprovedGraduationResult & {
  eligible: boolean;
  recommendation: 'VALEDICTORIAN_CANDIDATE' | 'SALUTATORIAN_CANDIDATE' | 'TOP_TIE_REVIEW' | 'ELIGIBLE' | 'BELOW_THRESHOLD' | 'FAILED';
};

/** Creates a recommendation from Principal-approved cards; it does not appoint award recipients. */
export function recommendGraduationHonors(results: ApprovedGraduationResult[]): GraduationHonorsRow[] {
  const sorted = [...results].sort((a, b) =>
    b.overallAverage - a.overallAverage ||
    a.lastName.localeCompare(b.lastName) ||
    a.firstName.localeCompare(b.firstName) ||
    a.studentNumber.localeCompare(b.studentNumber),
  );
  const eligible = sorted.filter(row => row.overallOutcome === 'PASS' && row.overallAverage >= 95);
  const recommendations = new Map<string, GraduationHonorsRow['recommendation']>();

  if (eligible.length) {
    const topScore = eligible[0].overallAverage;
    const top = eligible.filter(row => row.overallAverage === topScore);
    if (top.length > 1) {
      for (const row of top) recommendations.set(row.studentId, 'TOP_TIE_REVIEW');
    } else {
      recommendations.set(top[0].studentId, 'VALEDICTORIAN_CANDIDATE');
      const next = eligible.filter(row => row.studentId !== top[0].studentId);
      if (next.length) {
        const secondScore = next[0].overallAverage;
        const second = next.filter(row => row.overallAverage === secondScore);
        if (second.length > 1) {
          for (const row of second) recommendations.set(row.studentId, 'TOP_TIE_REVIEW');
        } else {
          recommendations.set(second[0].studentId, 'SALUTATORIAN_CANDIDATE');
        }
      }
    }
  }

  return sorted.map(row => ({
    ...row,
    eligible: row.overallOutcome === 'PASS' && row.overallAverage >= 95,
    recommendation: recommendations.get(row.studentId) || (row.overallOutcome !== 'PASS' ? 'FAILED' : row.overallAverage < 95 ? 'BELOW_THRESHOLD' : 'ELIGIBLE'),
  }));
}
