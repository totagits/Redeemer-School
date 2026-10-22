/**
 * PDF Generation & Helper Utilities
 * Produces valid, standards-compliant PDF 1.4 documents encoded as Base64 strings.
 * Can be run in pure Node.js (unit tests) and in the browser.
 */

export interface TranscriptData {
  schoolName?: string;
  studentName: string;
  studentId: string;
  gradeLevel: string;
  section: string;
  academicYear: string;
  campus: string;
  gpa: string;
  subjects: Array<{ name: string; score: number; grade: string; remarks: string }>;
}

export interface BirthCertData {
  certificateNumber: string;
  childName: string;
  dateOfBirth: string;
  gender: string;
  placeOfBirth: string;
  county: string;
  motherName: string;
  fatherName: string;
  registrarName: string;
  issueDate: string;
}

/**
 * Encodes an ASCII/binary string into Base64 (isomorphic for Node and browser)
 */
export function stringToBase64(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'binary').toString('base64');
  }
  return btoa(str);
}

/**
 * Constructs a valid, standalone PDF 1.4 document containing text content.
 */
export function buildSimplePdf(contentStream: string): string {
  const objects: string[] = [];

  // 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // 3: Page (Letter size: 612 x 792 pt)
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n'
  );

  // 4: Regular Font (Helvetica)
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  // 5: Bold Font (Helvetica-Bold)
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');

  // 6: Contents stream
  const streamLength = contentStream.length;
  objects.push(
    `6 0 obj\n<< /Length ${streamLength} >>\nstream\n${contentStream}\nendstream\nendobj\n`
  );

  let pdfBody = '%PDF-1.4\n';
  const offsets: number[] = [];

  for (const obj of objects) {
    offsets.push(pdfBody.length);
    pdfBody += obj;
  }

  const xrefOffset = pdfBody.length;
  pdfBody += 'xref\n';
  pdfBody += `0 ${objects.length + 1}\n`;
  pdfBody += '0000000000 65535 f \n';

  for (const offset of offsets) {
    pdfBody += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }

  pdfBody += 'trailer\n';
  pdfBody += `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdfBody += 'startxref\n';
  pdfBody += `${xrefOffset}\n`;
  pdfBody += '%%EOF\n';

  return `data:application/pdf;base64,${stringToBase64(pdfBody)}`;
}

/**
 * Escapes characters for PDF stream strings
 */
function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Generates an official Base64-encoded PDF Academic Transcript for The Redeemer School
 */
export function generateOfficialTranscriptPdfBase64(data: TranscriptData): string {
  const school = data.schoolName || 'THE REDEEMER SCHOOL';
  const lines: string[] = [
    // Header border
    '0.5 0.5 0.5 RG',
    '2 w',
    '36 36 540 720 re',
    'S',
    // Decorative navy top banner
    '0.1 0.18 0.37 rg',
    '38 690 536 64 re',
    'f',
    // Header title in white
    'BT',
    '/F2 18 Tf',
    '1 1 1 rg',
    '150 725 Td',
    `(${escapePdfText(school)}) Tj`,
    'ET',
    // Sub-title in banner
    'BT',
    '/F1 10 Tf',
    '1 1 1 rg',
    '170 705 Td',
    '(OFFICIAL ACADEMIC TRANSCRIPT OF SCHOLASTIC RECORDS) Tj',
    'ET',
    // School metadata
    'BT',
    '/F1 9 Tf',
    '0.2 0.2 0.2 rg',
    '50 670 Td',
    '(Monrovia, Republic of Liberia | Ministry of Education EMIS: LBR-MOE-MON-20419) Tj',
    'ET',
    // Student Information Box
    '0.92 0.94 0.97 rg',
    '50 580 512 75 re',
    'f',
    '0.7 0.75 0.82 RG',
    '1 w',
    '50 580 512 75 re',
    'S',
    // Student Info text
    'BT',
    '/F2 10 Tf',
    '0.1 0.1 0.1 rg',
    '65 635 Td',
    `(${escapePdfText(`Student Name: ${data.studentName}`)}) Tj`,
    'ET',
    'BT',
    '/F1 9 Tf',
    '0.2 0.2 0.2 rg',
    '65 620 Td',
    `(${escapePdfText(`Student ID: ${data.studentId}     |     Academic Level: ${data.gradeLevel} - Section ${data.section}`)}) Tj`,
    'ET',
    'BT',
    '/F1 9 Tf',
    '0.2 0.2 0.2 rg',
    '65 605 Td',
    `(${escapePdfText(`Campus: ${data.campus}     |     Academic Year: ${data.academicYear}`)}) Tj`,
    'ET',
    'BT',
    '/F2 10 Tf',
    '0.1 0.45 0.2 rg',
    '65 590 Td',
    `(${escapePdfText(`Cumulative Grade Point Average (GPA): ${data.gpa} / 4.00`)}) Tj`,
    'ET',
    // Subject Table Header
    '0.18 0.24 0.35 rg',
    '50 545 512 20 re',
    'f',
    'BT',
    '/F2 9 Tf',
    '1 1 1 rg',
    '65 551 Td',
    '(SUBJECT / CURRICULUM DISCIPLINE) Tj',
    '300 0 Td',
    '(SCORE) Tj',
    '50 0 Td',
    '(LETTER) Tj',
    '50 0 Td',
    '(EVALUATION) Tj',
    'ET'
  ];

  let y = 525;
  data.subjects.forEach((subj, idx) => {
    const isAlt = idx % 2 === 1;
    if (isAlt) {
      lines.push(`0.97 0.98 0.99 rg 50 ${y - 4} 512 18 re f`);
    }
    lines.push(
      'BT',
      '/F1 9 Tf',
      '0.15 0.15 0.15 rg',
      `65 ${y} Td`,
      `(${escapePdfText(subj.name)}) Tj`,
      'ET',
      'BT',
      '/F1 9 Tf',
      '0.15 0.15 0.15 rg',
      `365 ${y} Td`,
      `(${escapePdfText(String(subj.score))}) Tj`,
      'ET',
      'BT',
      '/F2 9 Tf',
      '0.1 0.1 0.1 rg',
      `415 ${y} Td`,
      `(${escapePdfText(subj.grade)}) Tj`,
      'ET',
      'BT',
      '/F1 8 Tf',
      '0.3 0.3 0.3 rg',
      `465 ${y} Td`,
      `(${escapePdfText(subj.remarks)}) Tj`,
      'ET'
    );
    y -= 19;
  });

  // Footer & Official Stamp
  lines.push(
    '0.8 0.8 0.8 RG',
    '1 w',
    '50 130 512 1 re',
    'S',
    'BT',
    '/F2 9 Tf',
    '0.2 0.2 0.2 rg',
    '65 110 Td',
    '(Authorized School Official) Tj',
    '320 0 Td',
    '(School Principal) Tj',
    'ET',
    'BT',
    '/F1 8 Tf',
    '0.4 0.4 0.4 rg',
    '65 98 Td',
    '(Academic Registrar & Dean of Studies) Tj',
    '320 0 Td',
    '(Principal / Head of Institution) Tj',
    'ET',
    // Security Seal watermark note
    'BT',
    '/F1 7 Tf',
    '0.5 0.5 0.5 rg',
    '130 50 Td',
    '(AUTHENTICATED VIA REDEEMER SCHOOL ERP - DIGITAL SECURE DOCUMENT REPOSITORY) Tj',
    'ET'
  );

  return buildSimplePdf(lines.join('\n'));
}

/**
 * Generates an official Base64-encoded PDF Birth Certificate for Republic of Liberia
 */
export function generateBirthCertificatePdfBase64(data: BirthCertData): string {
  const lines: string[] = [
    // Double border
    '0.6 0.45 0.2 RG',
    '3 w',
    '36 36 540 720 re',
    'S',
    '0.7 0.55 0.3 RG',
    '1 w',
    '42 42 528 708 re',
    'S',
    // Heading
    'BT',
    '/F2 16 Tf',
    '0.1 0.1 0.1 rg',
    '165 710 Td',
    '(REPUBLIC OF LIBERIA) Tj',
    'ET',
    'BT',
    '/F2 12 Tf',
    '0.2 0.2 0.2 rg',
    '175 690 Td',
    '(MINISTRY OF HEALTH & SOCIAL WELFARE) Tj',
    'ET',
    'BT',
    '/F1 10 Tf',
    '0.3 0.3 0.3 rg',
    '180 675 Td',
    '(BUREAU OF VITAL STATISTICS & RECORDS) Tj',
    'ET',
    // Certificate Title Banner
    '0.95 0.92 0.85 rg',
    '60 625 492 35 re',
    'f',
    '0.7 0.55 0.3 RG',
    '1 w',
    '60 625 492 35 re',
    'S',
    'BT',
    '/F2 14 Tf',
    '0.4 0.25 0.1 rg',
    '160 638 Td',
    '(CERTIFICATE OF BIRTH REGISTRATION) Tj',
    'ET',
    // Certificate Number
    'BT',
    '/F2 10 Tf',
    '0.6 0.1 0.1 rg',
    '380 605 Td',
    `(${escapePdfText(`Certificate No: ${data.certificateNumber}`)}) Tj`,
    'ET',
    // Info Table
    'BT',
    '/F1 10 Tf',
    '0.2 0.2 0.2 rg',
    '70 560 Td',
    '(THIS IS TO CERTIFY that according to records in the Vital Statistics Archives:) Tj',
    'ET',
    'BT',
    '/F2 11 Tf',
    '0.1 0.1 0.1 rg',
    '70 525 Td',
    `(${escapePdfText(`Full Name of Child: ${data.childName}`)}) Tj`,
    'ET',
    'BT',
    '/F1 10 Tf',
    '0.2 0.2 0.2 rg',
    '70 495 Td',
    `(${escapePdfText(`Date of Birth: ${data.dateOfBirth}     |     Sex / Gender: ${data.gender}`)}) Tj`,
    'ET',
    'BT',
    '/F1 10 Tf',
    '0.2 0.2 0.2 rg',
    '70 465 Td',
    `(${escapePdfText(`Place of Birth: ${data.placeOfBirth}     |     County: ${data.county}`)}) Tj`,
    'ET',
    'BT',
    '/F1 10 Tf',
    '0.2 0.2 0.2 rg',
    '70 435 Td',
    `(${escapePdfText(`Full Name of Mother: ${data.motherName}`)}) Tj`,
    'ET',
    'BT',
    '/F1 10 Tf',
    '0.2 0.2 0.2 rg',
    '70 405 Td',
    `(${escapePdfText(`Full Name of Father: ${data.fatherName}`)}) Tj`,
    'ET',
    'BT',
    '/F1 10 Tf',
    '0.2 0.2 0.2 rg',
    '70 375 Td',
    `(${escapePdfText(`Date of Registration / Issuance: ${data.issueDate}`)}) Tj`,
    'ET',
    // Golden Official Stamp representation
    '0.9 0.75 0.3 rg',
    '100 220 80 80 re',
    'f',
    '0.7 0.5 0.1 RG',
    '2 w',
    '100 220 80 80 re',
    'S',
    'BT',
    '/F2 8 Tf',
    '0.3 0.2 0.05 rg',
    '112 265 Td',
    '(REPUBLIC OF LIBERIA) Tj',
    'ET',
    'BT',
    '/F2 7 Tf',
    '0.3 0.2 0.05 rg',
    '118 245 Td',
    '(OFFICIAL VITAL SEAL) Tj',
    'ET',
    // Signatures
    '0.6 0.6 0.6 RG',
    '1 w',
    '280 230 220 1 re',
    'S',
    'BT',
    '/F2 9 Tf',
    '0.2 0.2 0.2 rg',
    '280 215 Td',
    `(${escapePdfText(data.registrarName)}) Tj`,
    'ET',
    'BT',
    '/F1 8 Tf',
    '0.4 0.4 0.4 rg',
    '280 202 Td',
    '(Registrar General, Bureau of Vital Statistics, Monrovia) Tj',
    'ET',
    // Disclaimer
    'BT',
    '/F1 7 Tf',
    '0.5 0.5 0.5 rg',
    '110 80 Td',
    '(DIGITALLY ENCODED AND VERIFIED FOR THE REDEEMER SCHOOL ERP ARCHIVES) Tj',
    'ET'
  ];

  return buildSimplePdf(lines.join('\n'));
}

/**
 * Validates whether an uploaded file is a valid PDF within constraints.
 */
export function validatePdfFile(file: { name: string; size: number; type: string }): {
  valid: boolean;
  error?: string;
} {
  const maxBytes = 10 * 1024 * 1024; // 10 MB limit
  const isPdfExtension = file.name.toLowerCase().endsWith('.pdf');
  const isPdfMime = file.type === 'application/pdf' || file.type === '';

  if (!isPdfExtension && file.type !== 'application/pdf') {
    return {
      valid: false,
      error: 'Security restriction: Only PDF files (.pdf) are permitted for transcript and birth certificate uploads.'
    };
  }

  if (file.size <= 0) {
    return {
      valid: false,
      error: 'File is empty (0 bytes). Please select a valid document.'
    };
  }

  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed limit of 10.0 MB.`
    };
  }

  return { valid: true };
}
