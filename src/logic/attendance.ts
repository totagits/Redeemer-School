/**
 * Student Daily Attendance Logic & Statistical Engine
 * Supports grade-level attendance logging, percentage calculations,
 * streak tracking, and threshold-based truancy/drop alerts.
 */

import type { StudentProfile } from './students.ts';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface StudentAttendanceRecord {
  id: string;
  sessionId?: string;
  date: string;                   // YYYY-MM-DD
  studentId: string;              // e.g. "STU-2026-0041"
  studentName: string;
  gradeLevel: string;             // e.g. "Grade 10"
  section: string;                // e.g. "A"
  status: AttendanceStatus;
  arrivalTime?: string;           // e.g. "08:15 AM" for late arrivals
  reason?: string;                // e.g. "Malaria treatment at JFK Hospital"
  loggedBy: string;               // e.g. "Sister Evelyn Coleman"
  loggedByRole: string;           // e.g. "HR_MANAGER" | "TEACHER" | "ADMINISTRATOR"
  loggedAt: string;               // ISO string
  notes?: string;
}

export interface DailyClassAttendanceSession {
  id: string;
  date: string;                   // YYYY-MM-DD
  gradeLevel: string;
  section: string;
  academicYear: string;           // e.g. "2026/2027"
  recordedBy: string;
  recordedByRole: string;
  recordedAt: string;
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  attendancePercentage: number;   // Daily attendance rate for the session
  records: StudentAttendanceRecord[];
}

export interface StudentAttendanceStats {
  studentId: string;
  studentName: string;
  gradeLevel: string;
  section: string;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  effectivePresentCount: number; // e.g. Present + 0.5 * Late
  attendancePercentage: number;   // Percentage rounded to 1 decimal place
  isBelowThreshold: boolean;
  threshold: number;
  riskLevel: 'NORMAL' | 'WARNING' | 'CRITICAL';
  recentStatuses: Array<{ date: string; status: AttendanceStatus; reason?: string }>;
  guardianPhone?: string;
  guardianName?: string;
}

export const DEFAULT_ATTENDANCE_THRESHOLD = 75; // 75% MoE / School benchmark

/**
 * Roles authorized to log student daily attendance.
 * Teachers, HR Managers (Deans of Academics), and Administrators have authorization.
 */
export const AUTHORIZED_ATTENDANCE_ROLES = [
  'ADMINISTRATOR',
  'HR_MANAGER',
  'TEACHER',
  'DEAN_OF_STUDENTS',
  'REGISTRAR'
];

/**
 * Checks whether a given user role is authorized to submit or edit attendance.
 */
export function isAuthorizedToLogAttendance(userRole: string): boolean {
  if (!userRole) return false;
  const normalized = userRole.toUpperCase().trim();
  return AUTHORIZED_ATTENDANCE_ROLES.includes(normalized);
}

/**
 * Calculates attendance percentage:
 * Present counts as 1.0, Late counts as 0.75, Excused counts as 1.0 (or excluded if not penalized), Absent counts as 0.
 * Standard Liberia MoE calculation: (Present + Late * 0.75 + Excused) / Total * 100
 */
export function calculateAttendancePercentage(
  present: number,
  late: number,
  excused: number,
  total: number
): number {
  if (total <= 0) return 100;
  const weighted = present + (late * 0.75) + excused;
  const percentage = (weighted / total) * 100;
  return Math.min(100, Math.max(0, Math.round(percentage * 10) / 10));
}

/**
 * Calculates simple pure present percentage: (Present / Total) * 100
 */
export function calculateStrictPresentPercentage(present: number, total: number): number {
  if (total <= 0) return 100;
  const pct = (present / total) * 100;
  return Math.min(100, Math.max(0, Math.round(pct * 10) / 10));
}

/**
 * Evaluates whether an attendance rate falls below the threshold and determines risk level.
 */
export function evaluateAttendanceRisk(
  attendancePercentage: number,
  threshold: number = DEFAULT_ATTENDANCE_THRESHOLD
): { isBelowThreshold: boolean; riskLevel: 'NORMAL' | 'WARNING' | 'CRITICAL' } {
  if (attendancePercentage < threshold) {
    // If more than 10% below threshold, mark as CRITICAL
    const riskLevel = attendancePercentage < (threshold - 10) ? 'CRITICAL' : 'WARNING';
    return { isBelowThreshold: true, riskLevel };
  }
  return { isBelowThreshold: false, riskLevel: 'NORMAL' };
}

/**
 * Computes individual attendance statistics for a single student from history.
 */
export function computeStudentAttendanceStats(
  student: { id: string; studentId: string; firstName: string; lastName: string; gradeLevel: string; section: string; guardians?: Array<{ name: string; phone: string }> },
  history: StudentAttendanceRecord[],
  threshold: number = DEFAULT_ATTENDANCE_THRESHOLD
): StudentAttendanceStats {
  const studentRecords = history
    .filter(r => r.studentId === student.studentId || r.studentId === student.id)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

  const totalSessions = studentRecords.length;
  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;

  studentRecords.forEach(r => {
    switch (r.status) {
      case 'PRESENT':
        presentCount++;
        break;
      case 'ABSENT':
        absentCount++;
        break;
      case 'LATE':
        lateCount++;
        break;
      case 'EXCUSED':
        excusedCount++;
        break;
    }
  });

  const attendancePercentage = calculateAttendancePercentage(presentCount, lateCount, excusedCount, totalSessions);
  const { isBelowThreshold, riskLevel } = evaluateAttendanceRisk(attendancePercentage, threshold);

  const primaryGuardian = student.guardians && student.guardians.length > 0 ? student.guardians[0] : undefined;

  return {
    studentId: student.studentId,
    studentName: `${student.firstName} ${student.lastName}`,
    gradeLevel: student.gradeLevel,
    section: student.section,
    totalSessions,
    presentCount,
    absentCount,
    lateCount,
    excusedCount,
    effectivePresentCount: presentCount + lateCount * 0.75 + excusedCount,
    attendancePercentage,
    isBelowThreshold: totalSessions > 0 && isBelowThreshold,
    threshold,
    riskLevel: totalSessions > 0 ? riskLevel : 'NORMAL',
    recentStatuses: studentRecords.slice(0, 5).map(r => ({
      date: r.date,
      status: r.status,
      reason: r.reason
    })),
    guardianPhone: primaryGuardian?.phone,
    guardianName: primaryGuardian?.name
  };
}

/**
 * Scans all students and identifies any whose attendance percentage has dropped below the threshold.
 * Returns sorted list with lowest attendance rate first.
 */
export function identifyAtRiskStudents(
  students: StudentProfile[],
  history: StudentAttendanceRecord[],
  threshold: number = DEFAULT_ATTENDANCE_THRESHOLD
): StudentAttendanceStats[] {
  const atRisk: StudentAttendanceStats[] = [];

  students.forEach(student => {
    const stats = computeStudentAttendanceStats(student, history, threshold);
    if (stats.totalSessions > 0 && stats.isBelowThreshold) {
      atRisk.push(stats);
    }
  });

  return atRisk.sort((a, b) => a.attendancePercentage - b.attendancePercentage);
}

/**
 * Creates or updates an attendance session for a class on a given date.
 */
export function createAttendanceSession(
  date: string,
  gradeLevel: string,
  section: string,
  records: StudentAttendanceRecord[],
  recordedBy: string,
  recordedByRole: string,
  academicYear: string = '2026/2027'
): DailyClassAttendanceSession {
  const presentCount = records.filter(r => r.status === 'PRESENT').length;
  const absentCount = records.filter(r => r.status === 'ABSENT').length;
  const lateCount = records.filter(r => r.status === 'LATE').length;
  const excusedCount = records.filter(r => r.status === 'EXCUSED').length;
  const totalStudents = records.length;

  const attendancePercentage = calculateAttendancePercentage(presentCount, lateCount, excusedCount, totalStudents);

  return {
    id: `att-session-${date}-${gradeLevel.replace(/\s+/g, '')}-${section}`,
    date,
    gradeLevel,
    section,
    academicYear,
    recordedBy,
    recordedByRole,
    recordedAt: new Date().toISOString(),
    totalStudents,
    presentCount,
    absentCount,
    lateCount,
    excusedCount,
    attendancePercentage,
    records
  };
}

/**
 * Returns color badges and styling for attendance status.
 */
export function getAttendanceStatusStyle(status: AttendanceStatus): {
  label: string;
  badgeClass: string;
  textClass: string;
  bgClass: string;
} {
  switch (status) {
    case 'PRESENT':
      return {
        label: 'Present',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-300',
        textClass: 'text-emerald-700',
        bgClass: 'bg-emerald-600'
      };
    case 'LATE':
      return {
        label: 'Late / Tardy',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-300',
        textClass: 'text-amber-700',
        bgClass: 'bg-amber-500'
      };
    case 'EXCUSED':
      return {
        label: 'Excused',
        badgeClass: 'bg-sky-50 text-sky-700 border-sky-300',
        textClass: 'text-sky-700',
        bgClass: 'bg-sky-600'
      };
    case 'ABSENT':
      return {
        label: 'Absent',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-300',
        textClass: 'text-rose-700',
        bgClass: 'bg-rose-600'
      };
  }
}
