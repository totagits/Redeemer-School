import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateBarcodeSvg,
  generateVerificationPayload,
  generateStudentIdCardData,
  generateBatchIdCards
} from './idCard.ts';
import type { StudentProfile } from './students.ts';

test('generateBarcodeSvg produces valid SVG markup with bars and correct attributes', () => {
  const svg = generateBarcodeSvg('STU-2026-0041');
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('</svg>'));
  assert.ok(svg.includes('<rect'));
  assert.ok(svg.includes('fill="#0f172a"'));
});

test('generateVerificationPayload creates valid JSON containing student identity', () => {
  const dummyStudent: StudentProfile = {
    id: 's1',
    studentId: 'STU-2026-0041',
    moeLearnerId: 'LBR-STU-009182',
    firstName: 'Kormassa',
    lastName: 'Weah',
    dateOfBirth: '2010-04-12',
    gender: 'FEMALE',
    countyOfResidence: 'Montserrado',
    address: 'Sinkor, Monrovia',
    gradeLevel: 'Grade 10',
    section: 'A',
    campus: 'Main Campus',
    enrollmentDate: '2026-08-25',
    status: 'ENROLLED',
    specialNeeds: false,
    guardians: [{ name: 'Musu Weah', relation: 'Mother', phone: '+231886112233', email: 'm@w.lr', isPrimary: true, authorizedPickup: true }],
    correctionLog: []
  };

  const payloadStr = generateVerificationPayload(dummyStudent);
  const parsed = JSON.parse(payloadStr);
  assert.equal(parsed.id, 'STU-2026-0041');
  assert.equal(parsed.moe, 'LBR-STU-009182');
  assert.equal(parsed.name, 'Kormassa Weah');
  assert.equal(parsed.grade, 'Grade 10-A');
});

test('generateStudentIdCardData builds full credential structure with school metadata', () => {
  const dummyStudent: StudentProfile = {
    id: 's2',
    studentId: 'STU-2026-0042',
    moeLearnerId: 'LBR-STU-009183',
    firstName: 'Varney',
    lastName: 'Sherman',
    dateOfBirth: '2010-08-20',
    gender: 'MALE',
    countyOfResidence: 'Montserrado',
    address: 'Congo Town, Monrovia',
    gradeLevel: 'Grade 10',
    section: 'A',
    campus: 'Main Campus',
    enrollmentDate: '2026-08-26',
    status: 'ENROLLED',
    specialNeeds: false,
    guardians: [{ name: 'Cllr. Famatta Sherman', relation: 'Mother', phone: '+231888334455', email: 'f@s.lr', isPrimary: true, authorizedPickup: true }],
    correctionLog: []
  };

  const card = generateStudentIdCardData(dummyStudent, '2026/2027');
  assert.equal(card.studentId, 'STU-2026-0042');
  assert.equal(card.fullName, 'Varney Sherman');
  assert.equal(card.schoolName, "Redeemer's International Academy");
  assert.equal(card.emergencyContactName, 'Cllr. Famatta Sherman');
  assert.equal(card.emergencyContactPhone, '+231888334455');
  assert.ok(card.barcodeSvg.includes('<svg'));
  assert.ok(card.cardSerialNumber.includes('RDS-ID-2026-0042'));
  assert.equal(card.status, 'ACTIVE');
});

test('generateBatchIdCards filters by grade or generates for all students', () => {
  const students: StudentProfile[] = [
    { id: '1', studentId: 'S1', moeLearnerId: null, firstName: 'A', lastName: 'B', dateOfBirth: '2010', gender: 'FEMALE', countyOfResidence: 'M', address: '', gradeLevel: 'Grade 10', section: 'A', campus: 'C', enrollmentDate: '2026', status: 'ENROLLED', specialNeeds: false, guardians: [], correctionLog: [] },
    { id: '2', studentId: 'S2', moeLearnerId: null, firstName: 'C', lastName: 'D', dateOfBirth: '2010', gender: 'MALE', countyOfResidence: 'M', address: '', gradeLevel: 'Grade 10', section: 'A', campus: 'C', enrollmentDate: '2026', status: 'ENROLLED', specialNeeds: false, guardians: [], correctionLog: [] },
    { id: '3', studentId: 'S3', moeLearnerId: null, firstName: 'E', lastName: 'F', dateOfBirth: '2008', gender: 'FEMALE', countyOfResidence: 'M', address: '', gradeLevel: 'Grade 12', section: 'B', campus: 'C', enrollmentDate: '2026', status: 'ENROLLED', specialNeeds: false, guardians: [], correctionLog: [] }
  ];

  const allCards = generateBatchIdCards(students);
  assert.equal(allCards.length, 3);

  const grade10Cards = generateBatchIdCards(students, 'Grade 10');
  assert.equal(grade10Cards.length, 2);

  const grade12Cards = generateBatchIdCards(students, 'Grade 12');
  assert.equal(grade12Cards.length, 1);
  assert.equal(grade12Cards[0].studentId, 'S3');
});
