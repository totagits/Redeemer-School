/**
 * Liberia Academic Grading Logic & Standards
 * Supports Liberian West African Examinations Council (WAEC/WASSCE) grading scales
 * and terminal continuous assessment weighting.
 */

export interface MarkComponent {
  quizzes: number;      // weight 20%
  assignments: number;  // weight 10%
  midterm: number;      // weight 30%
  exam: number;         // weight 40%
}

export interface SubjectGradeResult {
  rawTotal: number;
  letterGrade: string;
  wassceGrade: string;
  gpaPoint: number;
  isPassing: boolean;
  remarks: string;
}

export function calculateWeightedTotal(components: MarkComponent): number {
  const total = 
    (Math.max(0, Math.min(100, components.quizzes)) * 0.20) +
    (Math.max(0, Math.min(100, components.assignments)) * 0.10) +
    (Math.max(0, Math.min(100, components.midterm)) * 0.30) +
    (Math.max(0, Math.min(100, components.exam)) * 0.40);
  return Math.round(total * 10) / 10;
}

export function evaluateWassceGrade(score: number): { wassceGrade: string; letterGrade: string; gpaPoint: number; isPassing: boolean; remarks: string } {
  const s = Math.round(score);
  if (s >= 75) {
    return { wassceGrade: 'A1', letterGrade: 'A', gpaPoint: 4.0, isPassing: true, remarks: 'Excellent' };
  } else if (s >= 70) {
    return { wassceGrade: 'B2', letterGrade: 'B+', gpaPoint: 3.5, isPassing: true, remarks: 'Very Good' };
  } else if (s >= 65) {
    return { wassceGrade: 'B3', letterGrade: 'B', gpaPoint: 3.0, isPassing: true, remarks: 'Good' };
  } else if (s >= 60) {
    return { wassceGrade: 'C4', letterGrade: 'C+', gpaPoint: 2.5, isPassing: true, remarks: 'Credit' };
  } else if (s >= 55) {
    return { wassceGrade: 'C5', letterGrade: 'C', gpaPoint: 2.0, isPassing: true, remarks: 'Credit' };
  } else if (s >= 50) {
    return { wassceGrade: 'C6', letterGrade: 'C-', gpaPoint: 1.5, isPassing: true, remarks: 'Credit' };
  } else if (s >= 45) {
    return { wassceGrade: 'D7', letterGrade: 'D', gpaPoint: 1.0, isPassing: true, remarks: 'Pass' };
  } else if (s >= 40) {
    return { wassceGrade: 'E8', letterGrade: 'E', gpaPoint: 0.5, isPassing: true, remarks: 'Pass' };
  } else {
    return { wassceGrade: 'F9', letterGrade: 'F', gpaPoint: 0.0, isPassing: false, remarks: 'Fail' };
  }
}

export function computeStudentTerminalGPA(subjects: { score: number; credits: number }[]): {
  averageScore: number;
  gpa: number;
  totalCredits: number;
  passedSubjectsCount: number;
  promoted: boolean;
} {
  if (subjects.length === 0) {
    return { averageScore: 0, gpa: 0, totalCredits: 0, passedSubjectsCount: 0, promoted: false };
  }

  let totalPoints = 0;
  let totalCredits = 0;
  let scoreSum = 0;
  let passedCount = 0;

  for (const sub of subjects) {
    const evaluation = evaluateWassceGrade(sub.score);
    totalPoints += evaluation.gpaPoint * sub.credits;
    totalCredits += sub.credits;
    scoreSum += sub.score;
    if (evaluation.isPassing) {
      passedCount++;
    }
  }

  const averageScore = Math.round((scoreSum / subjects.length) * 10) / 10;
  const gpa = totalCredits > 0 ? Math.round((totalPoints / totalCredits) * 100) / 100 : 0;
  // Promotion policy: must pass at least 70% of subjects including core and maintain GPA >= 1.5
  const passRate = passedCount / subjects.length;
  const promoted = passRate >= 0.70 && gpa >= 1.5;

  return {
    averageScore,
    gpa,
    totalCredits,
    passedSubjectsCount: passedCount,
    promoted
  };
}
