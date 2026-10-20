/**
 * Liberia Ministry of Education (MoE) EMIS Compatibility Engine
 * Grounded in MoE Liberia EMIS guidelines and School Permit System.
 * Distinguishes verified current file-based behavior from future direct API gateways.
 */

export interface MoESchoolProfile {
  emisCode: string;               // e.g. "LBR-MOE-MON-2024-0419"
  permitNumber: string;           // e.g. "MOE/DE/2026/0882"
  permitStatus: 'VALID' | 'PENDING_RENEWAL' | 'EXPIRED';
  permitExpiryDate: string;
  county: string;                 // Liberia 15 counties
  district: string;
  schoolType: 'FAITH_BASED' | 'INDEPENDENT_PRIVATE' | 'MISSION_COMMUNITY';
  ownership: string;
  levelsOffered: string[];
}

export interface EmisLearnerRecord {
  internalLearnerId: string;
  moeLearnerId: string | null;    // Nullable external MoE identifier
  firstName: string;
  lastName: string;
  gender: 'MALE' | 'FEMALE';
  dateOfBirth: string;
  countyOfResidence: string;
  gradeLevel: string;
  enrollmentDate: string;
  guardianName: string;
  guardianPhone: string;
  specialNeeds: boolean;
  status: 'ENROLLED' | 'WITHDRAWN' | 'GRADUATED';
}

export interface EmisValidationResult {
  recordId: string;
  learnerName: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface EmisExportPackage {
  templateName: string;
  templateVersion: string;
  generatedAt: string;
  schoolEmisCode: string;
  totalRecords: number;
  validRecordsCount: number;
  warningRecordsCount: number;
  errorRecordsCount: number;
  csvContent: string;
  validationDetails: EmisValidationResult[];
}

export const LIBERIA_COUNTIES = [
  'Bomi',
  'Bong',
  'Gbarpolu',
  'Grand Bassa',
  'Grand Cape Mount',
  'Grand Gedeh',
  'Grand Kru',
  'Lofa',
  'Margibi',
  'Maryland',
  'Montserrado',
  'Nimba',
  'River Cess',
  'River Gee',
  'Sinoe'
] as const;

export function validateLearnerForMoE(learner: EmisLearnerRecord, schoolEmisCode: string): EmisValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!schoolEmisCode || schoolEmisCode.trim() === '') {
    errors.push('School MoE EMIS Code is missing or unverified.');
  }

  if (!learner.firstName || learner.firstName.trim() === '') {
    errors.push('First name is required for MoE census.');
  }

  if (!learner.lastName || learner.lastName.trim() === '') {
    errors.push('Last name is required for MoE census.');
  }

  if (!learner.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(learner.dateOfBirth)) {
    errors.push('Valid Date of Birth (YYYY-MM-DD) is required.');
  } else {
    // Check age plausibility for K-12
    const birthYear = parseInt(learner.dateOfBirth.split('-')[0], 10);
    const currentYear = 2026;
    const age = currentYear - birthYear;
    if (age < 3 || age > 25) {
      warnings.push(`Plausibility alert: Age ${age} falls outside typical K-12 range.`);
    }
  }

  if (!['MALE', 'FEMALE'].includes(learner.gender)) {
    errors.push('Sex/Gender must be specified as MALE or FEMALE per MoE census spec.');
  }

  if (!learner.gradeLevel || learner.gradeLevel.trim() === '') {
    errors.push('Grade level is required.');
  }

  if (!LIBERIA_COUNTIES.includes(learner.countyOfResidence as any)) {
    warnings.push(`County "${learner.countyOfResidence}" may not match one of 15 official Liberian counties.`);
  }

  if (!learner.moeLearnerId) {
    warnings.push('MoE National Learner ID is unassigned (optional nullable external field).');
  }

  return {
    recordId: learner.internalLearnerId,
    learnerName: `${learner.firstName} ${learner.lastName}`,
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

export function generateMoECsvExport(
  school: MoESchoolProfile,
  learners: EmisLearnerRecord[],
  templateVersion: string = '2.1-2026'
): EmisExportPackage {
  const validationDetails = learners.map(l => validateLearnerForMoE(l, school.emisCode));
  
  const validRecordsCount = validationDetails.filter(v => v.isValid).length;
  const errorRecordsCount = validationDetails.filter(v => !v.isValid).length;
  const warningRecordsCount = validationDetails.filter(v => v.warnings.length > 0).length;

  const headers = [
    'MOE_SCHOOL_EMIS',
    'INTERNAL_ID',
    'MOE_LEARNER_ID',
    'SURNAME',
    'FIRST_NAME',
    'GENDER',
    'DOB',
    'COUNTY',
    'GRADE_LEVEL',
    'ENROLLMENT_DATE',
    'SPECIAL_NEEDS',
    'STATUS'
  ];

  const rows = learners.map(l => {
    return [
      school.emisCode,
      l.internalLearnerId,
      l.moeLearnerId || 'UNASSIGNED',
      `"${l.lastName.replace(/"/g, '""')}"`,
      `"${l.firstName.replace(/"/g, '""')}"`,
      l.gender,
      l.dateOfBirth,
      `"${l.countyOfResidence}"`,
      `"${l.gradeLevel}"`,
      l.enrollmentDate,
      l.specialNeeds ? 'YES' : 'NO',
      l.status
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');

  return {
    templateName: 'Republic of Liberia Ministry of Education - Annual School Census & Enrollment Registry',
    templateVersion,
    generatedAt: new Date().toISOString(),
    schoolEmisCode: school.emisCode,
    totalRecords: learners.length,
    validRecordsCount,
    warningRecordsCount,
    errorRecordsCount,
    csvContent,
    validationDetails
  };
}
