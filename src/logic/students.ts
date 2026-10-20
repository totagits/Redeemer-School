/**
 * Students & Enrollment Management Logic
 * Handles applicant lifecycle, duplicate detection, learner profile generation,
 * and guardian contact linkage.
 */

export interface GuardianInfo {
  name: string;
  relation: string;
  phone: string;
  email: string;
  isPrimary: boolean;
  authorizedPickup: boolean;
}

export type StudentDocumentType = 
  | 'ACADEMIC_TRANSCRIPT' 
  | 'BIRTH_CERTIFICATE' 
  | 'WAEC_SLIP' 
  | 'NATIONAL_ID' 
  | 'MEDICAL_CLEARANCE' 
  | 'OTHER';

export interface StudentDocument {
  id: string;
  studentId: string;              // e.g. "STU-2026-0041"
  type: StudentDocumentType;
  title: string;                  // e.g. "Official Senior High Academic Transcript"
  fileName: string;               // e.g. "transcripts_grade10_weah.pdf"
  fileSizeBytes: number;
  mimeType: 'application/pdf';
  base64Data: string;             // data:application/pdf;base64,...
  uploadedAt: string;             // ISO string
  uploadedBy: string;             // staff name or registrar
  verified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  notes?: string;
}

export interface StudentProfile {
  id: string;
  studentId: string;              // e.g. "STU-2026-0041"
  moeLearnerId: string | null;    // Nullable external MoE identifier
  firstName: string;
  lastName: string;
  dateOfBirth: string;            // YYYY-MM-DD
  gender: 'MALE' | 'FEMALE';
  countyOfResidence: string;
  address: string;
  gradeLevel: string;             // e.g. "Grade 10"
  section: string;                // e.g. "A"
  campus: string;
  enrollmentDate: string;
  status: 'ENROLLED' | 'WITHDRAWN' | 'GRADUATED' | 'ARCHIVED';
  guardians: GuardianInfo[];
  documents?: StudentDocument[];
  medicalNotes?: string;
  specialNeeds: boolean;
  previousSchool?: string;
  correctionLog: Array<{
    field: string;
    oldValue: string;
    newValue: string;
    changedBy: string;
    timestamp: string;
    reason: string;
  }>;
}

export type AdmissionStatus = 
  | 'SUBMITTED' 
  | 'UNDER_REVIEW' 
  | 'INTERVIEW_SCHEDULED' 
  | 'OFFERED' 
  | 'ACCEPTED' 
  | 'ENROLLED' 
  | 'REJECTED';

export interface AdmissionApplicant {
  id: string;
  applicationNumber: string;      // e.g. "APP-2026-0104"
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE';
  county: string;
  targetGrade: string;
  guardianName: string;
  guardianRelation: string;
  guardianPhone: string;
  guardianEmail: string;
  status: AdmissionStatus;
  appliedDate: string;
  interviewDate?: string;
  decisionNotes?: string;
  documents: Array<{
    title: string;
    submitted: boolean;
    verified: boolean;
  }>;
}

/**
 * Evaluates duplicate applicant/learner profiles based on matching signals:
 * Exact match on First + Last name (case-insensitive) AND either Date of Birth OR Guardian Phone.
 */
export function detectDuplicateStudent(
  candidate: { firstName: string; lastName: string; dateOfBirth: string; guardianPhone?: string },
  existingStudents: StudentProfile[]
): { isDuplicate: boolean; matchedStudent?: StudentProfile; matchReason?: string } {
  const normFirst = candidate.firstName.trim().toLowerCase();
  const normLast = candidate.lastName.trim().toLowerCase();

  for (const s of existingStudents) {
    const sFirst = s.firstName.trim().toLowerCase();
    const sLast = s.lastName.trim().toLowerCase();

    if (normFirst === sFirst && normLast === sLast) {
      if (candidate.dateOfBirth && candidate.dateOfBirth === s.dateOfBirth) {
        return {
          isDuplicate: true,
          matchedStudent: s,
          matchReason: `Exact match on full name and Date of Birth (${s.dateOfBirth})`
        };
      }

      if (candidate.guardianPhone) {
        const phoneMatch = s.guardians.some(g => g.phone.replace(/\D/g, '') === candidate.guardianPhone?.replace(/\D/g, ''));
        if (phoneMatch) {
          return {
            isDuplicate: true,
            matchedStudent: s,
            matchReason: `Match on full name and Guardian Phone (${candidate.guardianPhone})`
          };
        }
      }
    }
  }

  return { isDuplicate: false };
}

/**
 * Converts an accepted applicant into an active enrolled student profile
 */
export function convertApplicantToStudent(
  applicant: AdmissionApplicant,
  assignedSection: string = 'A',
  campus: string = 'Main Campus',
  counter: number
): StudentProfile {
  const currentYear = new Date().getFullYear();
  const studentId = `STU-${currentYear}-${String(counter).padStart(4, '0')}`;

  return {
    id: `student-${Date.now()}`,
    studentId,
    moeLearnerId: null, // Nullable external until Ministry issuance
    firstName: applicant.firstName,
    lastName: applicant.lastName,
    dateOfBirth: applicant.dateOfBirth,
    gender: applicant.gender,
    countyOfResidence: applicant.county,
    address: 'Monrovia, Liberia',
    gradeLevel: applicant.targetGrade,
    section: assignedSection,
    campus,
    enrollmentDate: new Date().toISOString().split('T')[0],
    status: 'ENROLLED',
    guardians: [
      {
        name: applicant.guardianName,
        relation: applicant.guardianRelation || 'Guardian',
        phone: applicant.guardianPhone,
        email: applicant.guardianEmail,
        isPrimary: true,
        authorizedPickup: true
      }
    ],
    specialNeeds: false,
    previousSchool: 'Transfer Institution',
    correctionLog: [],
    documents: []
  };
}

/**
 * Attaches a secure document to a student profile, maintaining immutability
 */
export function addDocumentToStudent(
  student: StudentProfile,
  docData: Omit<StudentDocument, 'id' | 'uploadedAt'> & { id?: string; uploadedAt?: string }
): StudentProfile {
  const newDoc: StudentDocument = {
    ...docData,
    id: docData.id || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    uploadedAt: docData.uploadedAt || new Date().toISOString()
  };

  const existingDocs = student.documents || [];
  return {
    ...student,
    documents: [newDoc, ...existingDocs]
  };
}

/**
 * Removes a document from a student record by ID
 */
export function removeDocumentFromStudent(
  student: StudentProfile,
  documentId: string
): StudentProfile {
  const existingDocs = student.documents || [];
  return {
    ...student,
    documents: existingDocs.filter(d => d.id !== documentId)
  };
}

/**
 * Sets document verification status
 */
export function verifyStudentDocument(
  student: StudentProfile,
  documentId: string,
  verifiedBy: string,
  verified: boolean = true
): StudentProfile {
  const existingDocs = student.documents || [];
  return {
    ...student,
    documents: existingDocs.map(d => {
      if (d.id !== documentId) return d;
      return {
        ...d,
        verified,
        verifiedBy: verified ? verifiedBy : undefined,
        verifiedAt: verified ? new Date().toISOString() : undefined
      };
    })
  };
}

/**
 * Filters documents by type (or returns all if undefined)
 */
export function filterDocumentsByType(
  documents: StudentDocument[],
  type?: StudentDocumentType
): StudentDocument[] {
  if (!type) return documents;
  return documents.filter(d => d.type === type);
}

/**
 * Human-readable document byte size formatter
 */
export function formatDocumentSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

