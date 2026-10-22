import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAttendancePercentage,
  calculateStrictPresentPercentage,
  evaluateAttendanceRisk,
  computeStudentAttendanceStats,
  identifyAtRiskStudents,
  isAuthorizedToLogAttendance,
  createAttendanceSession,
  type StudentAttendanceRecord
} from './attendance.ts';
import type { StudentProfile } from './students.ts';

test('calculateAttendancePercentage handles normal, weighted late, and zero division', () => {
  // 10 total: 10 present = 100%
  assert.equal(calculateAttendancePercentage(10, 0, 0, 10), 100);

  // 10 total: 8 present, 0 late, 0 excused = 80%
  assert.equal(calculateAttendancePercentage(8, 0, 0, 10), 80);

  // 10 total: 7 present, 2 late (2 * 0.75 = 1.5), 0 excused = 8.5/10 = 85%
  assert.equal(calculateAttendancePercentage(7, 2, 0, 10), 85);

  // 0 total returns 100% fallback safely without NaN
  assert.equal(calculateAttendancePercentage(0, 0, 0, 0), 100);
});

test('calculateStrictPresentPercentage accurately divides present by total', () => {
  assert.equal(calculateStrictPresentPercentage(9, 10), 90);
  assert.equal(calculateStrictPresentPercentage(0, 5), 0);
  assert.equal(calculateStrictPresentPercentage(0, 0), 100);
});

test('evaluateAttendanceRisk triggers below threshold and flags risk level', () => {
  // Default threshold 75%
  const normal = evaluateAttendanceRisk(85, 75);
  assert.equal(normal.isBelowThreshold, false);
  assert.equal(normal.riskLevel, 'NORMAL');

  // Exact threshold is not below
  const exact = evaluateAttendanceRisk(75, 75);
  assert.equal(exact.isBelowThreshold, false);
  assert.equal(exact.riskLevel, 'NORMAL');

  // 72% is below threshold (within 10%), should be WARNING
  const warning = evaluateAttendanceRisk(72, 75);
  assert.equal(warning.isBelowThreshold, true);
  assert.equal(warning.riskLevel, 'WARNING');

  // 60% is >10% below threshold, should be CRITICAL
  const critical = evaluateAttendanceRisk(60, 75);
  assert.equal(critical.isBelowThreshold, true);
  assert.equal(critical.riskLevel, 'CRITICAL');
});

test('isAuthorizedToLogAttendance verifies roles', () => {
  assert.equal(isAuthorizedToLogAttendance('ADMINISTRATOR'), true);
  assert.equal(isAuthorizedToLogAttendance('HR_MANAGER'), true);
  assert.equal(isAuthorizedToLogAttendance('TEACHER'), true);
  assert.equal(isAuthorizedToLogAttendance('dean_of_students'), true);
  assert.equal(isAuthorizedToLogAttendance('INVENTORY_CLERK'), false);
  assert.equal(isAuthorizedToLogAttendance('EXECUTIVE_AUDITOR'), false);
  assert.equal(isAuthorizedToLogAttendance(''), false);
});

test('computeStudentAttendanceStats calculates student totals and flags alerts', () => {
  const dummyStudent: StudentProfile = {
    id: 'stu-test-01',
    studentId: 'STU-2026-0099',
    moeLearnerId: 'LBR-001',
    firstName: 'Tenneh',
    lastName: 'Johnson',
    dateOfBirth: '2010-01-01',
    gender: 'FEMALE',
    countyOfResidence: 'Montserrado',
    address: 'Monrovia',
    gradeLevel: 'Grade 10',
    section: 'A',
    campus: 'Main Campus',
    enrollmentDate: '2026-08-01',
    status: 'ENROLLED',
    specialNeeds: false,
    guardians: [{ name: 'Mother Johnson', relation: 'Mother', phone: '+231888111222', email: 'm@j.lr', isPrimary: true, authorizedPickup: true }],
    correctionLog: []
  };

  const history: StudentAttendanceRecord[] = [
    { id: '1', date: '2026-10-01', studentId: 'STU-2026-0099', studentName: 'Tenneh Johnson', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Teacher', loggedByRole: 'TEACHER', loggedAt: '2026-10-01' },
    { id: '2', date: '2026-10-02', studentId: 'STU-2026-0099', studentName: 'Tenneh Johnson', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Teacher', loggedByRole: 'TEACHER', loggedAt: '2026-10-02' },
    { id: '3', date: '2026-10-03', studentId: 'STU-2026-0099', studentName: 'Tenneh Johnson', gradeLevel: 'Grade 10', section: 'A', status: 'ABSENT', reason: 'Unexcused absence', loggedBy: 'Teacher', loggedByRole: 'TEACHER', loggedAt: '2026-10-03' },
    { id: '4', date: '2026-10-04', studentId: 'STU-2026-0099', studentName: 'Tenneh Johnson', gradeLevel: 'Grade 10', section: 'A', status: 'ABSENT', reason: 'Fever', loggedBy: 'Teacher', loggedByRole: 'TEACHER', loggedAt: '2026-10-04' }
  ];

  // 4 sessions: 2 present, 2 absent = 50% attendance
  const stats = computeStudentAttendanceStats(dummyStudent, history, 75);
  assert.equal(stats.totalSessions, 4);
  assert.equal(stats.presentCount, 2);
  assert.equal(stats.absentCount, 2);
  assert.equal(stats.attendancePercentage, 50);
  assert.equal(stats.isBelowThreshold, true);
  assert.equal(stats.riskLevel, 'CRITICAL');
});

test('identifyAtRiskStudents accurately lists students with attendance below threshold', () => {
  const studentGood: StudentProfile = {
    id: 's1', studentId: 'STU-001', moeLearnerId: null, firstName: 'A', lastName: 'Good',
    dateOfBirth: '2010', gender: 'FEMALE', countyOfResidence: 'Montserrado', address: 'X',
    gradeLevel: 'Grade 10', section: 'A', campus: 'Main', enrollmentDate: '2026', status: 'ENROLLED', specialNeeds: false,
    guardians: [], correctionLog: []
  };

  const studentLow: StudentProfile = {
    id: 's2', studentId: 'STU-002', moeLearnerId: null, firstName: 'B', lastName: 'Low',
    dateOfBirth: '2010', gender: 'MALE', countyOfResidence: 'Montserrado', address: 'Y',
    gradeLevel: 'Grade 10', section: 'A', campus: 'Main', enrollmentDate: '2026', status: 'ENROLLED', specialNeeds: false,
    guardians: [], correctionLog: []
  };

  const history: StudentAttendanceRecord[] = [
    // Good: 9 present, 1 absent = 90%
    ...Array(9).fill(null).map((_, i) => ({ id: `g-${i}`, date: `2026-10-${i+1}`, studentId: 'STU-001', studentName: 'A Good', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT' as const, loggedBy: 'Admin', loggedByRole: 'ADMINISTRATOR', loggedAt: '2026' })),
    { id: 'g-10', date: '2026-10-10', studentId: 'STU-001', studentName: 'A Good', gradeLevel: 'Grade 10', section: 'A', status: 'ABSENT' as const, loggedBy: 'Admin', loggedByRole: 'ADMINISTRATOR', loggedAt: '2026' },

    // Low: 6 present, 4 absent = 60%
    ...Array(6).fill(null).map((_, i) => ({ id: `l-${i}`, date: `2026-10-${i+1}`, studentId: 'STU-002', studentName: 'B Low', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT' as const, loggedBy: 'Admin', loggedByRole: 'ADMINISTRATOR', loggedAt: '2026' })),
    ...Array(4).fill(null).map((_, i) => ({ id: `l-abs-${i}`, date: `2026-10-${i+7}`, studentId: 'STU-002', studentName: 'B Low', gradeLevel: 'Grade 10', section: 'A', status: 'ABSENT' as const, loggedBy: 'Admin', loggedByRole: 'ADMINISTRATOR', loggedAt: '2026' }))
  ];

  const atRisk = identifyAtRiskStudents([studentGood, studentLow], history, 75);
  assert.equal(atRisk.length, 1);
  assert.equal(atRisk[0].studentId, 'STU-002');
  assert.equal(atRisk[0].attendancePercentage, 60);
  assert.equal(atRisk[0].isBelowThreshold, true);
});

test('createAttendanceSession calculates class totals and percentage', () => {
  const records: StudentAttendanceRecord[] = [
    { id: '1', date: '2026-10-20', studentId: 'STU-01', studentName: 'One', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Teacher', loggedByRole: 'TEACHER', loggedAt: '2026' },
    { id: '2', date: '2026-10-20', studentId: 'STU-02', studentName: 'Two', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Teacher', loggedByRole: 'TEACHER', loggedAt: '2026' },
    { id: '3', date: '2026-10-20', studentId: 'STU-03', studentName: 'Three', gradeLevel: 'Grade 10', section: 'A', status: 'LATE', arrivalTime: '08:20 AM', loggedBy: 'Teacher', loggedByRole: 'TEACHER', loggedAt: '2026' },
    { id: '4', date: '2026-10-20', studentId: 'STU-04', studentName: 'Four', gradeLevel: 'Grade 10', section: 'A', status: 'ABSENT', loggedBy: 'Teacher', loggedByRole: 'TEACHER', loggedAt: '2026' }
  ];

  const session = createAttendanceSession('2026-10-20', 'Grade 10', 'A', records, 'Sister Evelyn Coleman', 'HR_MANAGER');
  assert.equal(session.totalStudents, 4);
  assert.equal(session.presentCount, 2);
  assert.equal(session.lateCount, 1);
  assert.equal(session.absentCount, 1);
  // (2 + 1*0.75) / 4 = 2.75 / 4 = 68.8%
  assert.equal(session.attendancePercentage, 68.8);
});
