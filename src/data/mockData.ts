import { 
  SchoolTenant, 
  UserProfile, 
  Applicant, 
  Learner, 
  SubjectItem, 
  TimetableSlot, 
  AttendanceSession, 
  GradeEntry, 
  StaffMember, 
  Announcement, 
  AuditLog 
} from '../types/index.ts';
import { Transaction, FeeItem } from '../logic/finance.ts';

export const INITIAL_SCHOOLS: SchoolTenant[] = [
  {
    id: 'school-stc-01',
    name: "St. Teresa's Convent High School",
    shortName: 'STC Convent',
    type: 'FAITH_BASED',
    ownership: 'Catholic Archdiocese of Monrovia',
    moeEmisCode: 'LBR-MOE-MON-2024-0419',
    permitNumber: 'MOE/DE/2026/0882',
    permitStatus: 'VALID',
    permitExpiryDate: '2027-08-31',
    county: 'Montserrado',
    district: 'Greater Monrovia',
    address: 'Randall Street, Snapper Hill, Monrovia, Liberia',
    phone: '+231 (0) 777 512 884',
    email: 'admissions@st-teresa-liberia.edu.lr',
    activeAcademicYear: '2026/2027',
    activeTerm: 'Semester 1',
    campuses: [
      { id: 'campus-main', name: 'Snapper Hill Main Campus', isMain: true, location: 'Randall St, Monrovia' },
      { id: 'campus-annex', name: 'Mamba Point Junior Annex', isMain: false, location: 'United Nations Dr, Monrovia' }
    ],
    branding: {
      primaryColor: '#1e3a8a',
      secondaryColor: '#f59e0b',
      motto: 'Virtute et Sapientia (In Virtue and Wisdom)',
      establishedYear: 1932
    }
  },
  {
    id: 'school-gcma-02',
    name: 'Ganta Christian Mission Academy',
    shortName: 'Ganta Mission',
    type: 'MISSION_COMMUNITY',
    ownership: 'United Methodist Church Liberia',
    moeEmisCode: 'LBR-MOE-NIM-2023-1108',
    permitNumber: 'MOE/DE/2025/0411',
    permitStatus: 'VALID',
    permitExpiryDate: '2027-04-15',
    county: 'Nimba',
    district: 'Ganta Commercial District',
    address: 'Mission Compound, Ganta, Nimba County, Liberia',
    phone: '+231 (0) 886 429 105',
    email: 'info@gantamission.edu.lr',
    activeAcademicYear: '2026/2027',
    activeTerm: 'Semester 1',
    campuses: [
      { id: 'campus-ganta', name: 'Ganta Main Campus', isMain: true, location: 'Mission Way, Ganta' }
    ],
    branding: {
      primaryColor: '#065f46',
      secondaryColor: '#d97706',
      motto: 'Service to God and Humanity',
      establishedYear: 1954
    }
  }
];

export const INITIAL_STAFF: StaffMember[] = [
  {
    id: 'staff-01',
    moeTeacherId: 'LBR-TCH-2024-0019',
    name: 'Sister Mary Beatrice Fahnbulleh',
    role: 'Principal / Head of School',
    email: 'principal@st-teresa.edu.lr',
    phone: '+231 770 123 456',
    department: 'Administration',
    qualification: 'M.Ed. Educational Leadership (University of Liberia)',
    employmentDate: '2016-09-01',
    status: 'ACTIVE',
    assignedClasses: [],
    assignedSubjects: []
  },
  {
    id: 'staff-02',
    moeTeacherId: 'LBR-TCH-2025-0142',
    name: 'Mr. Emmanuel B. Kollie',
    role: 'Teacher & HOD Science',
    email: 'e.kollie@st-teresa.edu.lr',
    phone: '+231 886 234 567',
    department: 'Sciences',
    qualification: 'B.Sc. Chemistry & Biology (Cuttington University)',
    employmentDate: '2019-02-15',
    status: 'ACTIVE',
    assignedClasses: ['Grade 10-A', 'Grade 11-Science'],
    assignedSubjects: ['Chemistry', 'General Science']
  },
  {
    id: 'staff-03',
    moeTeacherId: 'LBR-TCH-2023-0891',
    name: 'Mrs. Musu Dennis Sirleaf',
    role: 'Teacher & Mathematics Lead',
    email: 'm.sirleaf@st-teresa.edu.lr',
    phone: '+231 776 345 678',
    department: 'Mathematics',
    qualification: 'B.Sc. Mathematics & Statistics (Tubman University)',
    employmentDate: '2021-08-20',
    status: 'ACTIVE',
    assignedClasses: ['Grade 10-A', 'Grade 10-B', 'Grade 9-A'],
    assignedSubjects: ['General Mathematics', 'Algebra']
  },
  {
    id: 'staff-04',
    moeTeacherId: 'LBR-TCH-2026-0310',
    name: 'Mr. Josephus P. Barclay',
    role: 'Bursar & Finance Officer',
    email: 'bursar@st-teresa.edu.lr',
    phone: '+231 880 456 789',
    department: 'Finance & Accounts',
    qualification: 'B.BA Accounting (Stella Maris Polytechnic)',
    employmentDate: '2020-01-10',
    status: 'ACTIVE',
    assignedClasses: [],
    assignedSubjects: []
  },
  {
    id: 'staff-05',
    moeTeacherId: 'LBR-TCH-2024-0554',
    name: 'Madam Comfort Toe Massaquoi',
    role: 'Registrar & Admissions Officer',
    email: 'registrar@st-teresa.edu.lr',
    phone: '+231 775 567 890',
    department: 'Registrar Office',
    qualification: 'B.A. Public Administration (University of Liberia)',
    employmentDate: '2018-07-01',
    status: 'ACTIVE',
    assignedClasses: [],
    assignedSubjects: []
  }
];

export const INITIAL_LEARNERS: Learner[] = [
  {
    id: 'learn-001',
    internalLearnerId: 'STC-2026-0041',
    moeLearnerId: 'LBR-STU-009182',
    firstName: 'Kormassa',
    lastName: 'Weah',
    dateOfBirth: '2010-04-12',
    gender: 'FEMALE',
    countyOfResidence: 'Montserrado',
    address: 'Sinkor Old Road, Monrovia',
    gradeLevel: 'Grade 10',
    section: 'A',
    campusId: 'campus-main',
    enrollmentDate: '2026-08-25',
    status: 'ENROLLED',
    guardians: [
      {
        name: 'Musu K. Weah',
        relation: 'Mother',
        phone: '+231 886 112 233',
        email: 'musu.weah@gmail.com',
        isPrimary: true,
        authorizedPickup: true
      },
      {
        name: 'Senator Arthur Weah',
        relation: 'Father',
        phone: '+231 777 223 344',
        email: 'arthur.weah@gov.lr',
        isPrimary: false,
        authorizedPickup: true
      }
    ],
    specialNeeds: false,
    previousSchool: 'Monrovia Demonstration Elementary School',
    correctionHistory: [
      {
        field: 'dateOfBirth',
        oldVal: '2010-04-15',
        newVal: '2010-04-12',
        changedBy: 'Registrar Massaquoi',
        timestamp: '2026-09-02T10:15:00Z',
        reason: 'Corrected per verified Ministry of Health Birth Certificate'
      }
    ]
  },
  {
    id: 'learn-002',
    internalLearnerId: 'STC-2026-0042',
    moeLearnerId: 'LBR-STU-009183',
    firstName: 'Varney',
    lastName: 'Sherman',
    dateOfBirth: '2010-08-20',
    gender: 'MALE',
    countyOfResidence: 'Montserrado',
    address: 'Congo Town, Tubman Boulevard, Monrovia',
    gradeLevel: 'Grade 10',
    section: 'A',
    campusId: 'campus-main',
    enrollmentDate: '2026-08-26',
    status: 'ENROLLED',
    guardians: [
      {
        name: 'Cllr. Famatta Sherman',
        relation: 'Mother',
        phone: '+231 888 334 455',
        email: 'famatta.sherman@lawfirm.lr',
        isPrimary: true,
        authorizedPickup: true
      }
    ],
    medicalAlerts: 'Asthma inhaler kept in nurse office',
    specialNeeds: false,
    previousSchool: 'St. Patrick High School',
    correctionHistory: []
  },
  {
    id: 'learn-003',
    internalLearnerId: 'STC-2026-0043',
    moeLearnerId: null, // Nullable external MoE identifier to test validation warning!
    firstName: 'Princess',
    lastName: 'Sirleaf',
    dateOfBirth: '2011-01-18',
    gender: 'FEMALE',
    countyOfResidence: 'Margibi',
    address: 'Kakata Highway, Robertsfield Junction',
    gradeLevel: 'Grade 10',
    section: 'A',
    campusId: 'campus-main',
    enrollmentDate: '2026-08-28',
    status: 'ENROLLED',
    guardians: [
      {
        name: 'James B. Sirleaf',
        relation: 'Uncle / Guardian',
        phone: '+231 775 445 566',
        email: 'j.sirleaf@firestone.lr',
        isPrimary: true,
        authorizedPickup: true
      }
    ],
    specialNeeds: false,
    previousSchool: 'Harbel Community Academy',
    correctionHistory: []
  },
  {
    id: 'learn-004',
    internalLearnerId: 'STC-2026-0044',
    moeLearnerId: 'LBR-STU-009185',
    firstName: 'Boakai',
    lastName: 'Kollie',
    dateOfBirth: '2009-11-04',
    gender: 'MALE',
    countyOfResidence: 'Montserrado',
    address: 'Brewerville, St. Paul Bridge',
    gradeLevel: 'Grade 10',
    section: 'A',
    campusId: 'campus-main',
    enrollmentDate: '2026-08-29',
    status: 'ENROLLED',
    guardians: [
      {
        name: 'Sarah Kollie',
        relation: 'Mother',
        phone: '+231 886 556 677',
        email: 'sarah.kollie@wfp.org',
        isPrimary: true,
        authorizedPickup: true
      }
    ],
    specialNeeds: false,
    previousSchool: 'Ricks Institute Junior High',
    correctionHistory: []
  },
  {
    id: 'learn-005',
    internalLearnerId: 'STC-2026-0045',
    moeLearnerId: 'LBR-STU-009186',
    firstName: 'Fatu',
    lastName: 'Tubman',
    dateOfBirth: '2010-06-30',
    gender: 'FEMALE',
    countyOfResidence: 'Montserrado',
    address: 'Mamba Point, Embassy Walk',
    gradeLevel: 'Grade 10',
    section: 'A',
    campusId: 'campus-main',
    enrollmentDate: '2026-08-27',
    status: 'ENROLLED',
    guardians: [
      {
        name: 'Winston Tubman Jr.',
        relation: 'Father',
        phone: '+231 777 667 788',
        email: 'wtubman@consult.lr',
        isPrimary: true,
        authorizedPickup: true
      }
    ],
    specialNeeds: false,
    previousSchool: 'American International School of Monrovia',
    correctionHistory: []
  }
];

export const INITIAL_APPLICANTS: Applicant[] = [
  {
    id: 'app-01',
    applicationRef: 'APP-2026-0089',
    firstName: 'Mamadee',
    lastName: 'Kamara',
    dateOfBirth: '2010-09-14',
    gender: 'MALE',
    county: 'Montserrado',
    targetGrade: 'Grade 10',
    guardianName: 'Sekou Kamara',
    guardianPhone: '+231 886 778 899',
    guardianEmail: 'sekou.kamara@trading.lr',
    status: 'INTERVIEW_SCHEDULED',
    interviewDate: '2026-10-24 10:00 AM',
    appliedDate: '2026-10-10',
    decisionNotes: 'Strong academic record from previous school; interview with Academic Dean scheduled.',
    documents: [
      { name: 'Birth Certificate (Ministry of Health)', type: 'PDF', submitted: true, verified: true },
      { name: 'Grade 9 WAEC / BECE Slip', type: 'PDF', submitted: true, verified: true },
      { name: 'Previous School Transcript & Conduct Letter', type: 'PDF', submitted: true, verified: false },
      { name: 'Passport Photos (2 Copies)', type: 'IMG', submitted: true, verified: true }
    ]
  },
  {
    id: 'app-02',
    applicationRef: 'APP-2026-0090',
    firstName: 'Hawa',
    lastName: 'Gbanyan',
    dateOfBirth: '2011-03-22',
    gender: 'FEMALE',
    county: 'Bong',
    targetGrade: 'Grade 9',
    guardianName: 'Dr. Jerry Gbanyan',
    guardianPhone: '+231 777 889 900',
    guardianEmail: 'j.gbanyan@phebe-hospital.org',
    status: 'OFFERED',
    appliedDate: '2026-10-12',
    decisionNotes: 'Full admission letter issued; awaiting guardian acceptance and registration deposit.',
    documents: [
      { name: 'Birth Certificate', type: 'PDF', submitted: true, verified: true },
      { name: 'Prior Year Report Card', type: 'PDF', submitted: true, verified: true },
      { name: 'Medical Clearance', type: 'PDF', submitted: true, verified: true }
    ]
  },
  {
    id: 'app-03',
    applicationRef: 'APP-2026-0091',
    firstName: 'Kormassa', // Potential duplicate test learner!
    lastName: 'Weah',
    dateOfBirth: '2010-04-12',
    gender: 'FEMALE',
    county: 'Montserrado',
    targetGrade: 'Grade 10',
    guardianName: 'Musu K. Weah',
    guardianPhone: '+231 886 112 233',
    guardianEmail: 'musu.weah@gmail.com',
    status: 'SUBMITTED',
    appliedDate: '2026-10-18',
    decisionNotes: 'System flagged prospective duplicate: matching enrolled student STC-2026-0041.',
    documents: [
      { name: 'Application Form', type: 'PDF', submitted: true, verified: false }
    ]
  }
];

export const INITIAL_SUBJECTS: SubjectItem[] = [
  {
    id: 'sub-01',
    code: 'MATH-10',
    name: 'General Mathematics',
    gradeLevel: 'Grade 10',
    credits: 3,
    department: 'Mathematics',
    teacherId: 'staff-03',
    teacherName: 'Mrs. Musu Dennis Sirleaf'
  },
  {
    id: 'sub-02',
    code: 'ENG-10',
    name: 'English Language & Literature',
    gradeLevel: 'Grade 10',
    credits: 3,
    department: 'Humanities',
    teacherId: 'staff-01',
    teacherName: 'Sister Mary Beatrice Fahnbulleh'
  },
  {
    id: 'sub-03',
    code: 'CHEM-10',
    name: 'General Chemistry',
    gradeLevel: 'Grade 10',
    credits: 3,
    department: 'Sciences',
    teacherId: 'staff-02',
    teacherName: 'Mr. Emmanuel B. Kollie'
  },
  {
    id: 'sub-04',
    code: 'BIO-10',
    name: 'Introductory Biology',
    gradeLevel: 'Grade 10',
    credits: 3,
    department: 'Sciences',
    teacherId: 'staff-02',
    teacherName: 'Mr. Emmanuel B. Kollie'
  },
  {
    id: 'sub-05',
    code: 'HIST-10',
    name: 'Liberian & African History',
    gradeLevel: 'Grade 10',
    credits: 2,
    department: 'Social Sciences',
    teacherId: 'staff-05',
    teacherName: 'Madam Comfort Toe Massaquoi'
  }
];

export const INITIAL_TIMETABLE: TimetableSlot[] = [
  { id: 'tt-01', day: 'Monday', startTime: '08:00 AM', endTime: '08:50 AM', gradeLevel: 'Grade 10', section: 'A', subjectCode: 'MATH-10', subjectName: 'General Mathematics', teacherName: 'Mrs. Musu Dennis Sirleaf', room: 'Hall 3A' },
  { id: 'tt-02', day: 'Monday', startTime: '09:00 AM', endTime: '09:50 AM', gradeLevel: 'Grade 10', section: 'A', subjectCode: 'ENG-10', subjectName: 'English Language & Lit', teacherName: 'Sister Mary Beatrice', room: 'Hall 3A' },
  { id: 'tt-03', day: 'Monday', startTime: '10:10 AM', endTime: '11:00 AM', gradeLevel: 'Grade 10', section: 'A', subjectCode: 'CHEM-10', subjectName: 'General Chemistry', teacherName: 'Mr. Emmanuel B. Kollie', room: 'Science Lab 1' },
  { id: 'tt-04', day: 'Tuesday', startTime: '08:00 AM', endTime: '08:50 AM', gradeLevel: 'Grade 10', section: 'A', subjectCode: 'BIO-10', subjectName: 'Introductory Biology', teacherName: 'Mr. Emmanuel B. Kollie', room: 'Science Lab 2' },
  { id: 'tt-05', day: 'Tuesday', startTime: '09:00 AM', endTime: '09:50 AM', gradeLevel: 'Grade 10', section: 'A', subjectCode: 'HIST-10', subjectName: 'Liberian & African History', teacherName: 'Madam Comfort Massaquoi', room: 'Hall 3A' }
];

export const INITIAL_ATTENDANCE: AttendanceSession[] = [
  {
    id: 'att-2026-10-19-10A',
    date: '2026-10-19',
    gradeLevel: 'Grade 10',
    section: 'A',
    sessionType: 'MORNING',
    takenBy: 'Mrs. Musu Dennis Sirleaf',
    takenByRole: 'TEACHER',
    submittedAt: '2026-10-19T08:15:00Z',
    records: [
      { learnerId: 'learn-001', status: 'PRESENT' },
      { learnerId: 'learn-002', status: 'PRESENT' },
      { learnerId: 'learn-003', status: 'LATE', notes: 'Arrived at 08:25 due to Sinkor traffic' },
      { learnerId: 'learn-004', status: 'ABSENT', notes: 'Unexcused; automated SMS sent to parent' },
      { learnerId: 'learn-005', status: 'PRESENT' }
    ]
  }
];

export const INITIAL_GRADES: GradeEntry[] = [
  {
    id: 'grd-001',
    learnerId: 'learn-001',
    subjectId: 'sub-01',
    subjectCode: 'MATH-10',
    term: 'Semester 1',
    quizzes: 88,
    assignments: 92,
    midterm: 85,
    exam: 89,
    total: 87.9,
    letterGrade: 'A',
    wassceGrade: 'A1',
    teacherComment: 'Exceptional mathematical problem solving and class participation.',
    status: 'APPROVED',
    teacherName: 'Mrs. Musu Dennis Sirleaf',
    approvedBy: 'Sister Mary Beatrice Fahnbulleh',
    approvedAt: '2026-10-15T14:30:00Z'
  },
  {
    id: 'grd-002',
    learnerId: 'learn-001',
    subjectId: 'sub-03',
    subjectCode: 'CHEM-10',
    term: 'Semester 1',
    quizzes: 78,
    assignments: 85,
    midterm: 74,
    exam: 80,
    total: 78.3,
    letterGrade: 'B+',
    wassceGrade: 'A1',
    teacherComment: 'Very diligent in laboratory practicals and chemical reactions analysis.',
    status: 'APPROVED',
    teacherName: 'Mr. Emmanuel B. Kollie',
    approvedBy: 'Sister Mary Beatrice Fahnbulleh',
    approvedAt: '2026-10-15T14:30:00Z'
  },
  {
    id: 'grd-003',
    learnerId: 'learn-002',
    subjectId: 'sub-01',
    subjectCode: 'MATH-10',
    term: 'Semester 1',
    quizzes: 72,
    assignments: 80,
    midterm: 68,
    exam: 75,
    total: 72.8,
    letterGrade: 'B',
    wassceGrade: 'B2',
    teacherComment: 'Good effort in algebra. Needs more review on geometric proofs.',
    status: 'APPROVED',
    teacherName: 'Mrs. Musu Dennis Sirleaf',
    approvedBy: 'Sister Mary Beatrice Fahnbulleh',
    approvedAt: '2026-10-15T14:30:00Z'
  },
  {
    id: 'grd-004',
    learnerId: 'learn-003',
    subjectId: 'sub-01',
    subjectCode: 'MATH-10',
    term: 'Semester 1',
    quizzes: 65,
    assignments: 70,
    midterm: 60,
    exam: 62,
    total: 62.8,
    letterGrade: 'C+',
    wassceGrade: 'C4',
    teacherComment: 'Credit grade earned. Regular attendance will improve exam readiness.',
    status: 'SUBMITTED', // In moderation pipeline!
    teacherName: 'Mrs. Musu Dennis Sirleaf'
  }
];

export const INITIAL_FEE_SCHEDULE: FeeItem[] = [
  { id: 'fee-01', name: 'Semester 1 Tuition', amount: 350, currency: 'USD', category: 'TUITION', required: true },
  { id: 'fee-02', name: 'Science Laboratory Fee', amount: 50, currency: 'USD', category: 'LAB', required: true },
  { id: 'fee-03', name: 'Computer / ICT Lab Fee', amount: 30, currency: 'USD', category: 'LAB', required: true },
  { id: 'fee-04', name: 'Annual PTA Dues', amount: 15000, currency: 'LRD', category: 'PTA', required: true },
  { id: 'fee-05', name: 'School Physical Education Uniform (2 Pairs)', amount: 12000, currency: 'LRD', category: 'UNIFORM', required: true },
  { id: 'fee-06', name: 'WAEC / WASSCE Preparation & Mock Exam Levy', amount: 8000, currency: 'LRD', category: 'EXAM', required: false }
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  // Learner 1 (Kormassa Weah) Billing
  {
    id: 'tx-001',
    receiptNumber: 'STC-INV-2026-0001',
    learnerId: 'learn-001',
    learnerName: 'Kormassa Weah',
    date: '2026-08-25',
    type: 'INVOICE',
    amount: 430, // 350 + 50 + 30
    currency: 'USD',
    cashierName: 'Mr. Josephus P. Barclay',
    notes: 'Semester 1 Academic & Lab Charges (USD)',
    status: 'COMPLETED'
  },
  {
    id: 'tx-002',
    receiptNumber: 'STC-INV-2026-0002',
    learnerId: 'learn-001',
    learnerName: 'Kormassa Weah',
    date: '2026-08-25',
    type: 'INVOICE',
    amount: 27000, // 15000 + 12000
    currency: 'LRD',
    cashierName: 'Mr. Josephus P. Barclay',
    notes: 'PTA Dues & PE Uniform (LRD)',
    status: 'COMPLETED'
  },
  // Learner 1 Payments
  {
    id: 'tx-003',
    receiptNumber: 'STC-REC-2026-00104',
    learnerId: 'learn-001',
    learnerName: 'Kormassa Weah',
    date: '2026-08-26',
    type: 'PAYMENT',
    amount: 300,
    currency: 'USD',
    paymentMethod: 'LONESTAR_MTN_MOMO',
    referenceNumber: 'MM-LST-890214',
    cashierName: 'Mr. Josephus P. Barclay',
    notes: 'Partial payment on Tuition via Lonestar MTN Mobile Money',
    status: 'COMPLETED'
  },
  {
    id: 'tx-004',
    receiptNumber: 'STC-REC-2026-00105',
    learnerId: 'learn-001',
    learnerName: 'Kormassa Weah',
    date: '2026-08-26',
    type: 'PAYMENT',
    amount: 27000,
    currency: 'LRD',
    paymentMethod: 'CASH',
    referenceNumber: 'CASH-REC-0891',
    cashierName: 'Mr. Josephus P. Barclay',
    notes: 'Full payment for PTA and Uniform in Liberian Dollars',
    status: 'COMPLETED'
  },
  // Learner 2 (Varney Sherman)
  {
    id: 'tx-005',
    receiptNumber: 'STC-INV-2026-0003',
    learnerId: 'learn-002',
    learnerName: 'Varney Sherman',
    date: '2026-08-25',
    type: 'INVOICE',
    amount: 430,
    currency: 'USD',
    cashierName: 'Mr. Josephus P. Barclay',
    notes: 'Semester 1 Academic & Lab Charges (USD)',
    status: 'COMPLETED'
  },
  {
    id: 'tx-006',
    receiptNumber: 'STC-INV-2026-0004',
    learnerId: 'learn-002',
    learnerName: 'Varney Sherman',
    date: '2026-08-25',
    type: 'INVOICE',
    amount: 27000,
    currency: 'LRD',
    cashierName: 'Mr. Josephus P. Barclay',
    notes: 'PTA Dues & PE Uniform (LRD)',
    status: 'COMPLETED'
  },
  {
    id: 'tx-007',
    receiptNumber: 'STC-REC-2026-00106',
    learnerId: 'learn-002',
    learnerName: 'Varney Sherman',
    date: '2026-09-02',
    type: 'PAYMENT',
    amount: 430,
    currency: 'USD',
    paymentMethod: 'ORANGE_MONEY',
    referenceNumber: 'OM-LIB-771923',
    cashierName: 'Mr. Josephus P. Barclay',
    notes: 'Full Tuition & Labs settled via Orange Money',
    status: 'COMPLETED'
  },
  // Reversal Demo Entry
  {
    id: 'tx-008',
    receiptNumber: 'STC-REC-2026-00099',
    learnerId: 'learn-002',
    learnerName: 'Varney Sherman',
    date: '2026-08-30',
    type: 'PAYMENT',
    amount: 50,
    currency: 'USD',
    paymentMethod: 'CASH',
    referenceNumber: 'CASH-VOID-11',
    cashierName: 'Mr. Josephus P. Barclay',
    notes: 'Mistaken cashier deposit credited to wrong student account',
    status: 'REVERSED',
    reversalReason: 'Wrong student ID keyed; approved by Principal Sister Beatrice',
    reversedAt: '2026-08-31T09:00:00Z',
    reversedBy: 'Mr. Josephus P. Barclay'
  }
];

export const INITIAL_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'anc-01',
    title: 'MoE Annual School Census & Verification Exercise Notice',
    content: 'All parents and guardians are requested to ensure birth certificates and previous school clearance records are verified with the Registrar before October 31 for the Ministry of Education EMIS filing.',
    audience: 'ALL',
    authorName: 'Sister Mary Beatrice Fahnbulleh',
    authorRole: 'Principal',
    date: '2026-10-18',
    urgent: true
  },
  {
    id: 'anc-02',
    title: 'Semester 1 Mid-Term Examination Schedule Released',
    content: 'The Mid-Term exam timetable for Grades 9 through 12 is published on the portal. Examination rooms open at 08:00 AM daily. Please ensure students have approved identification cards.',
    audience: 'STUDENTS',
    authorName: 'Mr. Emmanuel B. Kollie',
    authorRole: 'HOD Academics',
    date: '2026-10-15',
    urgent: false
  },
  {
    id: 'anc-03',
    title: 'PTA General Assembly & Dual-Currency Payment Update',
    content: 'The 2026/2027 First Semester PTA General Assembly convenes this Saturday at 10:00 AM in the Convent Auditorium. Bursar office will operate cash and Mobile Money desks (Lonestar & Orange) for parents convenience.',
    audience: 'PARENTS',
    authorName: 'Mrs. Musu Dennis Sirleaf',
    authorRole: 'Faculty Representative',
    date: '2026-10-12',
    urgent: false
  }
];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-001',
    timestamp: '2026-10-20T02:45:00Z',
    actorId: 'staff-01',
    actorName: 'Sister Mary Beatrice',
    actorRole: 'PRINCIPAL',
    action: 'GRADE_APPROVED',
    category: 'ACADEMICS',
    details: 'Approved Semester 1 Mathematics grades for Grade 10-A (34 students). Results locked.',
    ipAddress: '197.231.14.88 (Monrovia, LR)'
  },
  {
    id: 'log-002',
    timestamp: '2026-10-19T14:10:00Z',
    actorId: 'staff-04',
    actorName: 'Mr. Josephus P. Barclay',
    actorRole: 'BURSAR',
    action: 'PAYMENT_RECORDED',
    category: 'FINANCE',
    details: 'Issued receipt STC-REC-2026-00104 for $300.00 USD via Lonestar MTN MoMo for learner STC-2026-0041.',
    ipAddress: '197.231.14.88 (Monrovia, LR)'
  },
  {
    id: 'log-003',
    timestamp: '2026-10-18T11:20:00Z',
    actorId: 'staff-05',
    actorName: 'Madam Comfort Massaquoi',
    actorRole: 'REGISTRAR',
    action: 'EMIS_VALIDATION_RUN',
    category: 'EMIS',
    details: 'Ran MoE EMIS Census Schema v2.1 validation on Grade 10 cohort. 5 records validated, 1 warning (unassigned MoE ID).',
    ipAddress: '197.231.14.88 (Monrovia, LR)'
  },
  {
    id: 'log-004',
    timestamp: '2026-10-16T09:05:00Z',
    actorId: 'staff-04',
    actorName: 'Mr. Josephus P. Barclay',
    actorRole: 'BURSAR',
    action: 'PAYMENT_REVERSED',
    category: 'FINANCE',
    details: 'Reversed payment STC-REC-2026-00099 ($50.00 USD). Reason: Wrong student ID keyed; approved by Principal.',
    ipAddress: '197.231.14.88 (Monrovia, LR)'
  }
];

export const DEMO_USERS: Record<string, UserProfile> = {
  PRINCIPAL: {
    id: 'user-prin',
    name: 'Sister Mary Beatrice Fahnbulleh',
    email: 'principal@st-teresa.edu.lr',
    role: 'PRINCIPAL',
    schoolId: 'school-stc-01',
    campusId: 'campus-main',
    title: 'Principal & Head of School'
  },
  REGISTRAR: {
    id: 'user-reg',
    name: 'Madam Comfort Toe Massaquoi',
    email: 'registrar@st-teresa.edu.lr',
    role: 'REGISTRAR',
    schoolId: 'school-stc-01',
    campusId: 'campus-main',
    title: 'Registrar & Admissions Officer'
  },
  BURSAR: {
    id: 'user-bur',
    name: 'Mr. Josephus P. Barclay',
    email: 'bursar@st-teresa.edu.lr',
    role: 'BURSAR',
    schoolId: 'school-stc-01',
    campusId: 'campus-main',
    title: 'Bursar & Finance Officer'
  },
  TEACHER: {
    id: 'user-tch',
    name: 'Mrs. Musu Dennis Sirleaf',
    email: 'm.sirleaf@st-teresa.edu.lr',
    role: 'TEACHER',
    schoolId: 'school-stc-01',
    campusId: 'campus-main',
    title: 'Teacher (Mathematics Lead)',
    assignedClasses: ['Grade 10-A'],
    assignedSubjects: ['MATH-10']
  },
  PARENT_GUARDIAN: {
    id: 'user-par',
    name: 'Musu K. Weah',
    email: 'musu.weah@gmail.com',
    role: 'PARENT_GUARDIAN',
    schoolId: 'school-stc-01',
    campusId: 'campus-main',
    title: 'Parent / Guardian',
    linkedLearnerIds: ['learn-001']
  },
  SCHOOL_OWNER: {
    id: 'user-own',
    name: 'Archbishop Jerome Doe',
    email: 'chancery@catholic-monrovia.org',
    role: 'SCHOOL_OWNER',
    schoolId: 'school-stc-01',
    campusId: 'campus-main',
    title: 'School Board Chair / Owner'
  },
  AUDITOR: {
    id: 'user-aud',
    name: 'MoE Inspector Tamba Flomo',
    email: 'tamba.flomo@moe.gov.lr',
    role: 'AUDITOR',
    schoolId: 'school-stc-01',
    campusId: 'campus-main',
    title: 'MoE Certified School Auditor'
  }
};
