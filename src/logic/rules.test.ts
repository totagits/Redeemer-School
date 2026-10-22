import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  calculateWeightedTotal, 
  evaluateWassceGrade, 
  computeStudentTerminalGPA 
} from './grading.ts';
import { 
  calculateStudentBalances, 
  generateReceiptNumber, 
  formatCurrency, 
  type Transaction 
} from './finance.ts';
import { 
  validateLearnerForMoE, 
  generateMoECsvExport, 
  type EmisLearnerRecord, 
  type MoESchoolProfile 
} from './emis.ts';

test('Grading: calculateWeightedTotal respects Liberian continuous assessment weights (20/10/30/40)', () => {
  const score = calculateWeightedTotal({
    quizzes: 80,      // 80 * 0.20 = 16
    assignments: 90,  // 90 * 0.10 = 9
    midterm: 75,      // 75 * 0.30 = 22.5
    exam: 85          // 85 * 0.40 = 34
  });
  // Total: 16 + 9 + 22.5 + 34 = 81.5
  assert.equal(score, 81.5);
});

test('Grading: evaluateWassceGrade correctly categorizes scores into WAEC standard', () => {
  const a1 = evaluateWassceGrade(82);
  assert.equal(a1.wassceGrade, 'A1');
  assert.equal(a1.isPassing, true);

  const c4 = evaluateWassceGrade(62);
  assert.equal(c4.wassceGrade, 'C4');
  assert.equal(c4.isPassing, true);

  const f9 = evaluateWassceGrade(32);
  assert.equal(f9.wassceGrade, 'F9');
  assert.equal(f9.isPassing, false);
});

test('Grading: computeStudentTerminalGPA computes GPA and promotion status', () => {
  const subjects = [
    { score: 85, credits: 3 }, // A1 -> 4.0 * 3 = 12
    { score: 72, credits: 3 }, // B2 -> 3.5 * 3 = 10.5
    { score: 68, credits: 3 }, // B3 -> 3.0 * 3 = 9
    { score: 55, credits: 2 }  // C5 -> 2.0 * 2 = 4
  ];
  const result = computeStudentTerminalGPA(subjects);
  assert.equal(result.totalCredits, 11);
  assert.equal(result.passedSubjectsCount, 4);
  assert.equal(result.promoted, true);
  assert.ok(result.gpa > 3.0);
});

test('Finance: calculateStudentBalances strictly keeps USD and LRD separate with no silent conversion', () => {
  const mockTransactions: Transaction[] = [
    {
      id: 'tx1',
      receiptNumber: 'STC-REC-2026-00001',
      learnerId: 'STU-001',
      learnerName: 'Varney Sherman',
      date: '2026-09-01',
      type: 'INVOICE',
      amount: 450,
      currency: 'USD',
      cashierName: 'Bursar Dennis',
      status: 'COMPLETED'
    },
    {
      id: 'tx2',
      receiptNumber: 'STC-REC-2026-00002',
      learnerId: 'STU-001',
      learnerName: 'Varney Sherman',
      date: '2026-09-01',
      type: 'INVOICE',
      amount: 15000,
      currency: 'LRD',
      cashierName: 'Bursar Dennis',
      status: 'COMPLETED'
    },
    {
      id: 'tx3',
      receiptNumber: 'STC-REC-2026-00003',
      learnerId: 'STU-001',
      learnerName: 'Varney Sherman',
      date: '2026-09-05',
      type: 'PAYMENT',
      amount: 250,
      currency: 'USD',
      paymentMethod: 'LONESTAR_MTN_MOMO',
      cashierName: 'Bursar Dennis',
      status: 'COMPLETED'
    },
    {
      id: 'tx4',
      receiptNumber: 'STC-REC-2026-00004',
      learnerId: 'STU-001',
      learnerName: 'Varney Sherman',
      date: '2026-09-06',
      type: 'PAYMENT',
      amount: 15000,
      currency: 'LRD',
      paymentMethod: 'CASH',
      cashierName: 'Bursar Dennis',
      status: 'COMPLETED'
    },
    {
      id: 'tx5',
      receiptNumber: 'STC-REC-2026-00005',
      learnerId: 'STU-001',
      learnerName: 'Varney Sherman',
      date: '2026-09-07',
      type: 'PAYMENT',
      amount: 50,
      currency: 'USD',
      status: 'REVERSED',
      cashierName: 'Bursar Dennis',
      reversalReason: 'Duplicate entry reversed by supervisor'
    }
  ];

  const balances = calculateStudentBalances(mockTransactions, 'STU-001');

  // USD: 450 billed - 250 paid (reversed tx5 is ignored) = 200 due
  assert.equal(balances.usd.billed, 450);
  assert.equal(balances.usd.paid, 250);
  assert.equal(balances.usd.balanceDue, 200);

  // LRD: 15,000 billed - 15,000 paid = 0 due
  assert.equal(balances.lrd.billed, 15000);
  assert.equal(balances.lrd.paid, 15000);
  assert.equal(balances.lrd.balanceDue, 0);

  assert.equal(formatCurrency(200, 'USD'), '$200.00');
  assert.equal(formatCurrency(15000, 'LRD'), 'L$15,000.00');
});

test('Finance: generateReceiptNumber produces standard school sequence', () => {
  const rec = generateReceiptNumber('STC', 42);
  const currentYear = new Date().getFullYear();
  assert.equal(rec, `STC-REC-${currentYear}-00042`);
});

test('MoE EMIS: validateLearnerForMoE checks mandatory fields and flags missing data', () => {
  const validLearner: EmisLearnerRecord = {
    internalLearnerId: 'STU-2026-001',
    moeLearnerId: 'LBR-STU-00821',
    firstName: 'Kormassa',
    lastName: 'Weah',
    gender: 'FEMALE',
    dateOfBirth: '2010-04-12',
    countyOfResidence: 'Montserrado',
    gradeLevel: 'Grade 10',
    enrollmentDate: '2026-08-25',
    guardianName: 'Musu Weah',
    guardianPhone: '+231886123456',
    specialNeeds: false,
    status: 'ENROLLED'
  };

  const validResult = validateLearnerForMoE(validLearner, 'LBR-MOE-MON-2024-0419');
  assert.equal(validResult.isValid, true);
  assert.equal(validResult.errors.length, 0);

  const invalidLearner: EmisLearnerRecord = {
    ...validLearner,
    dateOfBirth: 'not-a-date',
    gender: 'UNKNOWN' as any,
    moeLearnerId: null
  };

  const invalidResult = validateLearnerForMoE(invalidLearner, 'LBR-MOE-MON-2024-0419');
  assert.equal(invalidResult.isValid, false);
  assert.ok(invalidResult.errors.some(e => e.includes('Date of Birth')));
  assert.ok(invalidResult.warnings.some(w => w.includes('MoE National Learner ID')));
});

test('MoE EMIS: generateMoECsvExport packages valid CSV output', () => {
  const mockSchool: MoESchoolProfile = {
    emisCode: 'LBR-MOE-MON-2024-0419',
    permitNumber: 'MOE/DE/2026/0882',
    permitStatus: 'VALID',
    permitExpiryDate: '2027-06-30',
    county: 'Montserrado',
    district: 'Greater Monrovia',
    schoolType: 'FAITH_BASED',
    ownership: 'Catholic Archdiocese of Monrovia',
    levelsOffered: ['Junior High', 'Senior High']
  };

  const learners: EmisLearnerRecord[] = [
    {
      internalLearnerId: 'STU-2026-001',
      moeLearnerId: 'LBR-STU-00821',
      firstName: 'Kormassa',
      lastName: 'Weah',
      gender: 'FEMALE',
      dateOfBirth: '2010-04-12',
      countyOfResidence: 'Montserrado',
      gradeLevel: 'Grade 10',
      enrollmentDate: '2026-08-25',
      guardianName: 'Musu Weah',
      guardianPhone: '+231886123456',
      specialNeeds: false,
      status: 'ENROLLED'
    }
  ];

  const pkg = generateMoECsvExport(mockSchool, learners);
  assert.equal(pkg.totalRecords, 1);
  assert.equal(pkg.validRecordsCount, 1);
  assert.ok(pkg.csvContent.includes('LBR-MOE-MON-2024-0419'));
  assert.ok(pkg.csvContent.includes('Kormassa'));
});
