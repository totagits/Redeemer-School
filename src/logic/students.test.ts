import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  detectDuplicateStudent, 
  convertApplicantToStudent,
  type StudentProfile,
  type AdmissionApplicant 
} from './students.ts';

test('Students: detectDuplicateStudent flags matching full name and date of birth', () => {
  const existing: StudentProfile[] = [
    {
      id: 's-1',
      studentId: 'STU-2026-0041',
      moeLearnerId: 'LBR-001',
      firstName: 'Kormassa',
      lastName: 'Weah',
      dateOfBirth: '2010-04-12',
      gender: 'FEMALE',
      countyOfResidence: 'Montserrado',
      address: 'Sinkor, Monrovia',
      gradeLevel: 'Grade 10',
      section: 'A',
      campus: 'Main',
      enrollmentDate: '2026-08-25',
      status: 'ENROLLED',
      guardians: [
        {
          name: 'Musu Weah',
          relation: 'Mother',
          phone: '+231886112233',
          email: 'musu@test.com',
          isPrimary: true,
          authorizedPickup: true
        }
      ],
      specialNeeds: false,
      correctionLog: []
    }
  ];

  // Exact match on Name and DOB
  const dupCheck = detectDuplicateStudent(
    { firstName: 'kormassa', lastName: 'WEAH', dateOfBirth: '2010-04-12' },
    existing
  );
  assert.equal(dupCheck.isDuplicate, true);
  assert.equal(dupCheck.matchedStudent?.studentId, 'STU-2026-0041');

  // Different person
  const uniqueCheck = detectDuplicateStudent(
    { firstName: 'Varney', lastName: 'Sherman', dateOfBirth: '2010-08-20' },
    existing
  );
  assert.equal(uniqueCheck.isDuplicate, false);
});

test('Students: convertApplicantToStudent converts accepted applicant to longitudinal student profile', () => {
  const applicant: AdmissionApplicant = {
    id: 'app-1',
    applicationNumber: 'APP-2026-0104',
    firstName: 'Mamadee',
    lastName: 'Kamara',
    dateOfBirth: '2010-09-14',
    gender: 'MALE',
    county: 'Montserrado',
    targetGrade: 'Grade 10',
    guardianName: 'Sekou Kamara',
    guardianRelation: 'Father',
    guardianPhone: '+231886778899',
    guardianEmail: 'sekou@kamara.lr',
    status: 'ACCEPTED',
    appliedDate: '2026-10-10',
    documents: [
      { title: 'Birth Certificate', submitted: true, verified: true }
    ]
  };

  const student = convertApplicantToStudent(applicant, 'B', 'Snapper Hill Campus', 52);
  assert.equal(student.firstName, 'Mamadee');
  assert.equal(student.lastName, 'Kamara');
  assert.equal(student.gradeLevel, 'Grade 10');
  assert.equal(student.section, 'B');
  assert.equal(student.status, 'ENROLLED');
  assert.equal(student.studentId, 'STU-2026-0052');
  assert.equal(student.guardians.length, 1);
  assert.equal(student.guardians[0].name, 'Sekou Kamara');
  assert.equal(student.guardians[0].authorizedPickup, true);
});

import { 
  validatePdfFile, 
  generateOfficialTranscriptPdfBase64, 
  generateBirthCertificatePdfBase64 
} from './pdfHelper.ts';
import { 
  addDocumentToStudent, 
  removeDocumentFromStudent, 
  verifyStudentDocument, 
  filterDocumentsByType,
  formatDocumentSize,
  type StudentDocument
} from './students.ts';

test('PDF Security: validatePdfFile permits standard PDFs under 10MB and rejects non-PDFs', () => {
  // Valid PDF
  const valid = validatePdfFile({ name: 'transcript_2026.pdf', size: 1024 * 500, type: 'application/pdf' });
  assert.equal(valid.valid, true);

  // Valid PDF without MIME reported (common in file dialogs)
  const validExtOnly = validatePdfFile({ name: 'birth_certificate.PDF', size: 2048, type: '' });
  assert.equal(validExtOnly.valid, true);

  // Rejected non-PDF executable or image
  const rejectedExe = validatePdfFile({ name: 'malware.exe', size: 1000, type: 'application/octet-stream' });
  assert.equal(rejectedExe.valid, false);
  assert.match(rejectedExe.error || '', /Only PDF files/);

  const rejectedPng = validatePdfFile({ name: 'photo.png', size: 50000, type: 'image/png' });
  assert.equal(rejectedPng.valid, false);

  // Rejected empty file
  const empty = validatePdfFile({ name: 'empty.pdf', size: 0, type: 'application/pdf' });
  assert.equal(empty.valid, false);
  assert.match(empty.error || '', /empty/i);

  // Rejected oversized file (>10MB)
  const oversized = validatePdfFile({ name: 'huge_archive.pdf', size: 11 * 1024 * 1024, type: 'application/pdf' });
  assert.equal(oversized.valid, false);
  assert.match(oversized.error || '', /exceeds the maximum/i);
});

test('PDF Generator: creates valid Base64-encoded PDF transcripts and birth certificates', () => {
  const transcriptBase64 = generateOfficialTranscriptPdfBase64({
    studentName: 'Kormassa Weah',
    studentId: 'STU-2026-0041',
    gradeLevel: 'Grade 10',
    section: 'A',
    academicYear: '2026/2027',
    campus: 'Snapper Hill Main Campus',
    gpa: '3.88',
    subjects: [
      { name: 'Mathematics & Algebra', score: 94, grade: 'A', remarks: 'Distinction' },
      { name: 'English Language & Lit', score: 89, grade: 'B', remarks: 'Proficient' }
    ]
  });

  assert.ok(transcriptBase64.startsWith('data:application/pdf;base64,'));
  // Decode base64 header
  const rawBase64 = transcriptBase64.replace('data:application/pdf;base64,', '');
  const decoded = Buffer.from(rawBase64, 'base64').toString('ascii');
  assert.ok(decoded.includes('%PDF-1.4'));
  assert.ok(decoded.includes('THE REDEEMER SCHOOL'));
  assert.ok(decoded.includes('Kormassa Weah'));
  assert.ok(decoded.includes('%%EOF'));

  const birthCertBase64 = generateBirthCertificatePdfBase64({
    certificateNumber: 'LBR-VS-2010-8819',
    childName: 'Kormassa Weah',
    dateOfBirth: '2010-04-12',
    gender: 'Female',
    placeOfBirth: 'JFK Memorial Hospital, Monrovia',
    county: 'Montserrado',
    motherName: 'Musu K. Weah',
    fatherName: 'Arthur Weah',
    registrarName: 'Hon. J. Patrick Benson',
    issueDate: '2010-04-20'
  });

  assert.ok(birthCertBase64.startsWith('data:application/pdf;base64,'));
  const decodedCert = Buffer.from(birthCertBase64.replace('data:application/pdf;base64,', ''), 'base64').toString('ascii');
  assert.ok(decodedCert.includes('REPUBLIC OF LIBERIA'));
  assert.ok(decodedCert.includes('CERTIFICATE OF BIRTH REGISTRATION'));
});

test('Student Profile: links and manages base64 PDF documents with verification status', () => {
  const student = convertApplicantToStudent({
    id: 'app-99',
    applicationNumber: 'APP-2026-0099',
    firstName: 'Darlington',
    lastName: 'Nimely',
    dateOfBirth: '2011-03-22',
    gender: 'MALE',
    county: 'Montserrado',
    targetGrade: 'Grade 9',
    guardianName: 'Helena Nimely',
    guardianRelation: 'Mother',
    guardianPhone: '+231886001122',
    guardianEmail: 'helena@nimely.lr',
    status: 'ACCEPTED',
    appliedDate: '2026-09-01',
    documents: []
  }, 'A', 'Main Campus', 99);

  assert.equal(student.documents?.length, 0);

  // Add Academic Transcript
  const updatedWithTranscript = addDocumentToStudent(student, {
    studentId: student.studentId,
    type: 'ACADEMIC_TRANSCRIPT',
    title: 'Junior High Transcript (Grades 7-8)',
    fileName: 'nimely_transcript.pdf',
    fileSizeBytes: 1024 * 340,
    mimeType: 'application/pdf',
    base64Data: 'data:application/pdf;base64,JVBERi0xLjQK...',
    uploadedBy: 'Admissions Desk',
    verified: false
  });

  assert.equal(updatedWithTranscript.documents?.length, 1);
  const docId = updatedWithTranscript.documents![0].id;
  assert.equal(updatedWithTranscript.documents![0].type, 'ACADEMIC_TRANSCRIPT');
  assert.equal(updatedWithTranscript.documents![0].verified, false);

  // Add Birth Certificate
  const updatedWithBoth = addDocumentToStudent(updatedWithTranscript, {
    studentId: student.studentId,
    type: 'BIRTH_CERTIFICATE',
    title: 'Ministry of Health Birth Certificate',
    fileName: 'nimely_birth_cert.pdf',
    fileSizeBytes: 1024 * 180,
    mimeType: 'application/pdf',
    base64Data: 'data:application/pdf;base64,JVBERi0xLjQK...',
    uploadedBy: 'Admissions Desk',
    verified: false
  });

  assert.equal(updatedWithBoth.documents?.length, 2);

  // Filter by type
  const transcripts = filterDocumentsByType(updatedWithBoth.documents!, 'ACADEMIC_TRANSCRIPT');
  assert.equal(transcripts.length, 1);
  assert.equal(transcripts[0].title, 'Junior High Transcript (Grades 7-8)');

  const birthCerts = filterDocumentsByType(updatedWithBoth.documents!, 'BIRTH_CERTIFICATE');
  assert.equal(birthCerts.length, 1);

  // Verify document
  const verifiedStudent = verifyStudentDocument(updatedWithBoth, docId, 'Registrar Coleman', true);
  const verifiedDoc = verifiedStudent.documents?.find(d => d.id === docId);
  assert.equal(verifiedDoc?.verified, true);
  assert.equal(verifiedDoc?.verifiedBy, 'Registrar Coleman');
  assert.ok(verifiedDoc?.verifiedAt);

  // Remove document
  const removedDocStudent = removeDocumentFromStudent(verifiedStudent, docId);
  assert.equal(removedDocStudent.documents?.length, 1);
  assert.equal(removedDocStudent.documents![0].type, 'BIRTH_CERTIFICATE');

  // Format document size
  assert.equal(formatDocumentSize(512), '512 B');
  assert.equal(formatDocumentSize(1024 * 350), '350.0 KB');
  assert.equal(formatDocumentSize(1024 * 1024 * 2.5), '2.50 MB');
});

