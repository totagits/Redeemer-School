/**
 * Core Type Definitions for Liberia SchoolOS
 */

export type UserRole = 
  | 'PLATFORM_OPERATOR'
  | 'SCHOOL_OWNER'
  | 'PRINCIPAL'
  | 'REGISTRAR'
  | 'BURSAR'
  | 'TEACHER'
  | 'HOD_ACADEMIC'
  | 'HR_ADMIN'
  | 'PARENT_GUARDIAN'
  | 'LEARNER'
  | 'AUDITOR';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  schoolId: string;
  campusId: string;
  title: string;
  phone?: string;
  assignedClasses?: string[];
  assignedSubjects?: string[];
  linkedLearnerIds?: string[]; // For Parent / Learner
}

export interface SchoolTenant {
  id: string;
  name: string;
  shortName: string;
  type: 'FAITH_BASED' | 'INDEPENDENT_PRIVATE' | 'MISSION_COMMUNITY';
  ownership: string;
  moeEmisCode: string;
  permitNumber: string;
  permitStatus: 'VALID' | 'PENDING_RENEWAL' | 'EXPIRED';
  permitExpiryDate: string;
  county: string;
  district: string;
  address: string;
  phone: string;
  email: string;
  activeAcademicYear: string;
  activeTerm: string;
  campuses: { id: string; name: string; isMain: boolean; location: string }[];
  branding: {
    primaryColor: string;
    secondaryColor: string;
    motto: string;
    establishedYear: number;
  };
}

export interface Applicant {
  id: string;
  applicationRef: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE';
  county: string;
  targetGrade: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'INTERVIEW_SCHEDULED' | 'OFFERED' | 'ACCEPTED' | 'ENROLLED' | 'REJECTED';
  documents: {
    name: string;
    type: string;
    submitted: boolean;
    verified: boolean;
  }[];
  interviewDate?: string;
  decisionNotes?: string;
  appliedDate: string;
}

export interface GuardianContact {
  name: string;
  relation: string;
  phone: string;
  email: string;
  isPrimary: boolean;
  authorizedPickup: boolean;
}

export interface LearnerCorrectionRecord {
  field: string;
  oldVal: string;
  newVal: string;
  changedBy: string;
  timestamp: string;
  reason: string;
}

export interface Learner {
  id: string;
  internalLearnerId: string;
  moeLearnerId: string | null; // Nullable external MoE identifier
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE';
  countyOfResidence: string;
  address: string;
  gradeLevel: string;
  section: string;
  campusId: string;
  enrollmentDate: string;
  status: 'ENROLLED' | 'WITHDRAWN' | 'GRADUATED' | 'ARCHIVED';
  guardians: GuardianContact[];
  medicalAlerts?: string;
  specialNeeds: boolean;
  previousSchool?: string;
  correctionHistory: LearnerCorrectionRecord[];
}

export interface SubjectItem {
  id: string;
  code: string;
  name: string;
  gradeLevel: string;
  credits: number;
  department: string;
  teacherId: string;
  teacherName: string;
}

export interface TimetableSlot {
  id: string;
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
  startTime: string;
  endTime: string;
  gradeLevel: string;
  section: string;
  subjectCode: string;
  subjectName: string;
  teacherName: string;
  room: string;
}

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface AttendanceRecord {
  learnerId: string;
  status: AttendanceStatus;
  notes?: string;
}

export interface AttendanceSession {
  id: string;
  date: string; // YYYY-MM-DD
  gradeLevel: string;
  section: string;
  sessionType: 'MORNING' | 'AFTERNOON';
  takenBy: string;
  takenByRole: string;
  records: AttendanceRecord[];
  submittedAt: string;
  isOfflineCaptured?: boolean;
  correctionReason?: string;
}

export type GradeWorkflowStatus = 'DRAFT' | 'SUBMITTED' | 'MODERATED' | 'APPROVED' | 'PUBLISHED_LOCKED';

export interface GradeEntry {
  id: string;
  learnerId: string;
  subjectId: string;
  subjectCode: string;
  term: string;
  quizzes: number;      // 20%
  assignments: number;  // 10%
  midterm: number;      // 30%
  exam: number;         // 40%
  total: number;
  letterGrade: string;
  wassceGrade: string;
  teacherComment: string;
  status: GradeWorkflowStatus;
  teacherName: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface StaffMember {
  id: string;
  moeTeacherId: string | null;
  name: string;
  role: string;
  email: string;
  phone: string;
  department: string;
  qualification: string;
  employmentDate: string;
  status: 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
  assignedClasses: string[];
  assignedSubjects: string[];
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  audience: 'ALL' | 'PARENTS' | 'TEACHERS' | 'STUDENTS';
  authorName: string;
  authorRole: string;
  date: string;
  urgent: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  category: 'AUTH' | 'ADMISSION' | 'ATTENDANCE' | 'ACADEMICS' | 'FINANCE' | 'EMIS' | 'SYSTEM';
  details: string;
  ipAddress: string;
}
