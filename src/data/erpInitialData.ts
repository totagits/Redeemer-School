import { 
  Account, 
  JournalEntry, 
  CustomerInvoice, 
  VendorBill, 
  DEFAULT_CHART_OF_ACCOUNTS 
} from '../logic/erpFinance.ts';
import { Employee, LeaveRequest } from '../logic/erpHr.ts';
import { InventoryItem, StockMovement } from '../logic/erpInventory.ts';
import { StudentProfile, StudentDocument } from '../logic/students.ts';
import { generateOfficialTranscriptPdfBase64, generateBirthCertificatePdfBase64 } from '../logic/pdfHelper.ts';
import { StudentAttendanceRecord } from '../logic/attendance.ts';

export const THE_REDEEMER_SCHOOL_INFO = {
  name: 'The Redeemer School',
  formalName: 'The Redeemer School of Monrovia',
  motto: 'Wisdom, Character & Service in Christ',
  founded: 1984,
  affiliation: 'Association of Christian Schools & Private Educators of Liberia',
  moeEmisCode: 'LBR-MOE-MON-2024-0312',
  moePermitNumber: 'MOE/DE/2026/0544',
  county: 'Montserrado County',
  district: 'Greater Monrovia School District',
  address: 'Snapper Hill & 15th Street Sinkor, Monrovia, Liberia',
  campuses: [
    { id: 'main', name: 'Main Campus (Snapper Hill)', grades: 'Grades 7 - 12 (Junior & Senior High)' },
    { id: 'annex', name: 'Junior Annex (Sinkor)', grades: 'Kindergarten & Grades 1 - 6 (Elementary)' }
  ],
  academicYear: '2026/2027',
  currentTerm: 'Term 1 (First Semester)',
  principal: 'Rev. Dr. Emmanuel Doe',
  bursar: 'Marcus Vance, CPA'
};

export const INITIAL_ACCOUNTS: Account[] = DEFAULT_CHART_OF_ACCOUNTS;

export const INITIAL_JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: 'je-001',
    entryNumber: 'JE-2026-001',
    date: '2026-10-01',
    description: "Opening Balance & Redeemer School Capital Endowment",
    status: 'POSTED',
    sourceModule: 'MANUAL',
    createdBy: 'Chief Bursar Marcus Vance',
    postedAt: '2026-10-01T08:00:00Z',
    lines: [
      { accountId: '1010', accountName: 'Cash and Operating Bank', debit: 250000, credit: 0, memo: 'Operating checking capital deposit (Ecobank Liberia)' },
      { accountId: '3010', accountName: "Owner's Contributed Capital", debit: 0, credit: 250000, memo: 'School Foundation Endowment & Operating Reserve' }
    ]
  },
  {
    id: 'je-002',
    entryNumber: 'JE-2026-002',
    date: '2026-10-04',
    description: 'WASSCE Curriculum Textbooks & School Store Intake',
    status: 'POSTED',
    sourceModule: 'INVENTORY',
    createdBy: 'Storekeeper Kofi Mensah',
    postedAt: '2026-10-04T11:30:00Z',
    lines: [
      { accountId: '1030', accountName: 'Merchandise Inventory Asset', debit: 45000, credit: 0, memo: 'Bulk textbook & lab equipment shipment' },
      { accountId: '2010', accountName: 'Accounts Payable', debit: 0, credit: 45000, memo: 'Net 30 terms with Macmillan Educational Publishers' }
    ]
  },
  {
    id: 'je-003',
    entryNumber: 'JE-2026-003',
    date: '2026-10-08',
    description: 'Term 1 Senior High Tuition & Laboratory Fees Billed',
    status: 'POSTED',
    sourceModule: 'AR_BILLING',
    createdBy: 'Registrar Assistant Hawa Gbanyan',
    postedAt: '2026-10-08T14:15:00Z',
    lines: [
      { accountId: '1020', accountName: 'Accounts Receivable', debit: 38500, credit: 0, memo: 'Invoice INV-2026-1001 issued for Senior High Science Track' },
      { accountId: '4010', accountName: 'Operating Sales Revenue', debit: 0, credit: 38500, memo: 'Term 1 Tuition & Registration Revenue' }
    ]
  },
  {
    id: 'je-004',
    entryNumber: 'JE-2026-004',
    date: '2026-10-12',
    description: 'Guardian Tuition Wire Payments Cleared (Ecobank Liberia)',
    status: 'POSTED',
    sourceModule: 'AR_BILLING',
    createdBy: 'Chief Bursar Marcus Vance',
    postedAt: '2026-10-12T09:45:00Z',
    lines: [
      { accountId: '1010', accountName: 'Cash and Operating Bank', debit: 38500, credit: 0, memo: 'Wire receipt for INV-2026-1001' },
      { accountId: '1020', accountName: 'Accounts Receivable', debit: 0, credit: 38500, memo: 'Clear balance on INV-2026-1001' }
    ]
  },
  {
    id: 'je-005',
    entryNumber: 'JE-2026-005',
    date: '2026-10-15',
    description: 'Main Campus Facility Lease & Generator Diesel Power Fuel',
    status: 'POSTED',
    sourceModule: 'AP_VENDOR',
    createdBy: 'Accounts Clerk Hawa Gbanyan',
    postedAt: '2026-10-15T16:00:00Z',
    lines: [
      { accountId: '5030', accountName: 'Facility Rent & Utilities', debit: 6500, credit: 0, memo: 'Campus facility grounds maintenance' },
      { accountId: '5040', accountName: 'Technology & Cloud Infrastructure', debit: 2200, credit: 0, memo: 'Dedicated fiber link (Orange Liberia)' },
      { accountId: '1010', accountName: 'Cash and Operating Bank', debit: 0, credit: 8700, memo: 'Electronic disbursement voucher' }
    ]
  }
];

export const INITIAL_INVOICES: CustomerInvoice[] = [
  {
    id: 'inv-1001',
    invoiceNumber: 'INV-2026-1001',
    customerId: 'cust-01',
    customerName: 'Senior High Science Cohort (Lead: Cllr. Famatta Sherman)',
    issueDate: '2026-10-08',
    dueDate: '2026-11-08',
    items: [
      { description: 'Term 1 Senior High Tuition & WASSCE Prep Fee (Varney Sherman)', quantity: 20, unitPrice: 1500.00, amount: 30000.00 },
      { description: 'Science Laboratory Access & Chemistry Reagent Kit', quantity: 1, unitPrice: 8500.00, amount: 8500.00 }
    ],
    totalAmount: 38500.00,
    paidAmount: 38500.00,
    balanceDue: 0.00,
    status: 'PAID'
  },
  {
    id: 'inv-1002',
    invoiceNumber: 'INV-2026-1002',
    customerId: 'cust-02',
    customerName: 'Junior Division Student Accounts (Lead: Musu K. Weah)',
    issueDate: '2026-10-14',
    dueDate: '2026-11-14',
    items: [
      { description: 'Term 1 Junior High Tuition & IT Lab Access (Kormassa Weah)', quantity: 45, unitPrice: 320.00, amount: 14400.00 },
      { description: 'Official Redeemer Crested Blazers & Uniform Sets', quantity: 45, unitPrice: 60.00, amount: 2700.00 }
    ],
    totalAmount: 17100.00,
    paidAmount: 5000.00,
    balanceDue: 12100.00,
    status: 'PARTIALLY_PAID'
  },
  {
    id: 'inv-1003',
    invoiceNumber: 'INV-2026-1003',
    customerId: 'cust-03',
    customerName: 'Redeemer Alumni & PTA Scholarship Endowment Group',
    issueDate: '2026-10-18',
    dueDate: '2026-11-18',
    items: [
      { description: 'WASSCE Candidate National Registration & Mock Exam Vouchers', quantity: 30, unitPrice: 480.00, amount: 14400.00 }
    ],
    totalAmount: 14400.00,
    paidAmount: 0.00,
    balanceDue: 14400.00,
    status: 'SENT'
  }
];

export const INITIAL_BILLS: VendorBill[] = [
  {
    id: 'bill-401',
    billNumber: 'BILL-2026-401',
    vendorId: 'ven-01',
    vendorName: 'Macmillan Educational Publishers (West Africa)',
    billDate: '2026-10-04',
    dueDate: '2026-11-04',
    category: 'Inventory Procurement',
    amount: 45000.00,
    paidAmount: 20000.00,
    balanceDue: 25000.00,
    status: 'APPROVED'
  },
  {
    id: 'bill-402',
    billNumber: 'BILL-2026-402',
    vendorId: 'ven-02',
    vendorName: 'TotalEnergies Liberia (Bulk Generator Diesel)',
    billDate: '2026-10-15',
    dueDate: '2026-10-31',
    category: 'Facility Rent',
    amount: 6500.00,
    paidAmount: 6500.00,
    balanceDue: 0.00,
    status: 'PAID'
  },
  {
    id: 'bill-403',
    billNumber: 'BILL-2026-403',
    vendorId: 'ven-03',
    vendorName: 'Orange Liberia Enterprise Broadband (Campus Fiber)',
    billDate: '2026-10-15',
    dueDate: '2026-11-15',
    category: 'Technology & Cloud',
    amount: 2200.00,
    paidAmount: 2200.00,
    balanceDue: 0.00,
    status: 'PAID'
  }
];

export const INITIAL_EMPLOYEES: Employee[] = [
  {
    id: 'emp-01',
    employeeCode: 'EMP-0101',
    firstName: 'Emmanuel',
    lastName: 'Doe',
    email: 'principal@redeemerschool.edu.lr',
    phone: '+231 (0) 777 555 101',
    department: 'Administration',
    designation: 'Principal & Superintendent',
    hireDate: '2020-01-15',
    employmentType: 'FULL_TIME',
    baseSalary: 12500.00,
    allowances: 1000.00,
    bankAccount: 'LR-ECOBANK-****8821',
    status: 'ACTIVE',
    paidLeaveBalance: 24
  },
  {
    id: 'emp-02',
    employeeCode: 'EMP-0102',
    firstName: 'Marcus',
    lastName: 'Vance',
    email: 'bursar@redeemerschool.edu.lr',
    phone: '+231 (0) 886 444 202',
    department: 'Finance',
    designation: 'Chief Bursar & Financial Controller',
    hireDate: '2022-03-01',
    employmentType: 'FULL_TIME',
    baseSalary: 11000.00,
    allowances: 800.00,
    bankAccount: 'LR-LBDI-****4109',
    status: 'ACTIVE',
    paidLeaveBalance: 18
  },
  {
    id: 'emp-03',
    employeeCode: 'EMP-0103',
    firstName: 'Evelyn',
    lastName: 'Coleman',
    email: 'academics@redeemerschool.edu.lr',
    phone: '+231 (0) 776 333 303',
    department: 'Human Resources',
    designation: 'Dean of Academic Affairs & HR Director',
    hireDate: '2021-06-10',
    employmentType: 'FULL_TIME',
    baseSalary: 8500.00,
    allowances: 600.00,
    bankAccount: 'LR-UBA-****9932',
    status: 'ACTIVE',
    paidLeaveBalance: 15
  },
  {
    id: 'emp-04',
    employeeCode: 'EMP-0104',
    firstName: 'Isaac',
    lastName: 'Kollie',
    email: 'science.kollie@redeemerschool.edu.lr',
    phone: '+231 (0) 880 222 404',
    department: 'Academics',
    designation: 'Head of Science & Senior Physics Faculty',
    hireDate: '2023-02-01',
    employmentType: 'FULL_TIME',
    baseSalary: 7800.00,
    allowances: 500.00,
    bankAccount: 'LR-ACCESS-****1245',
    status: 'ACTIVE',
    paidLeaveBalance: 20
  },
  {
    id: 'emp-05',
    employeeCode: 'EMP-0105',
    firstName: 'Musu',
    lastName: 'Fahnbulleh',
    email: 'english.musu@redeemerschool.edu.lr',
    phone: '+231 (0) 775 111 505',
    department: 'Academics',
    designation: 'Senior English & Literature Teacher',
    hireDate: '2024-05-15',
    employmentType: 'FULL_TIME',
    baseSalary: 7200.00,
    allowances: 1200.00,
    bankAccount: 'LR-GTBANK-****5678',
    status: 'ACTIVE',
    paidLeaveBalance: 14
  }
];

export const INITIAL_LEAVE_REQUESTS: LeaveRequest[] = [
  {
    id: 'leave-01',
    employeeId: 'emp-04',
    employeeName: 'Isaac Kollie',
    leaveType: 'ANNUAL',
    startDate: '2026-11-02',
    endDate: '2026-11-06',
    days: 5,
    reason: 'West African Science Educators Symposium in Accra.',
    status: 'APPROVED',
    appliedDate: '2026-10-15',
    approvedBy: 'Sister Evelyn Coleman'
  },
  {
    id: 'leave-02',
    employeeId: 'emp-05',
    employeeName: 'Musu Fahnbulleh',
    leaveType: 'SICK',
    startDate: '2026-10-21',
    endDate: '2026-10-22',
    days: 2,
    reason: 'Dental appointment and recovery.',
    status: 'PENDING',
    appliedDate: '2026-10-19'
  }
];

export const INITIAL_INVENTORY: InventoryItem[] = [
  {
    id: 'inv-item-01',
    sku: 'SKU-WSC-TXT',
    name: 'WASSCE Core Mathematics & Science Textbooks (Macmillan 2026)',
    category: 'Hardware',
    unitOfMeasure: 'PCS',
    unitCost: 85.00,
    sellingPrice: 150.00,
    currentStock: 140,
    reorderLevel: 50,
    warehouseLocation: 'Campus Storehouse - Room 104',
    status: 'IN_STOCK'
  },
  {
    id: 'inv-item-02',
    sku: 'SKU-CHM-LAB',
    name: 'Chemistry & Biology Laboratory Glassware & Reagent Kit',
    category: 'Hardware',
    unitOfMeasure: 'PCS',
    unitCost: 160.00,
    sellingPrice: 320.00,
    currentStock: 28,
    reorderLevel: 35, // Triggering low stock!
    warehouseLocation: 'Senior Science Wing - Lab Storage 2',
    status: 'LOW_STOCK'
  },
  {
    id: 'inv-item-03',
    sku: 'SKU-UNI-SENIOR',
    name: 'Redeemer Crested Senior Blazer & Uniform Set (Navy/Gold)',
    category: 'Finished Goods',
    unitOfMeasure: 'PCS',
    unitCost: 210.00,
    sellingPrice: 480.00,
    currentStock: 65,
    reorderLevel: 25,
    warehouseLocation: 'Bursary Uniform Depot - Shelf A',
    status: 'IN_STOCK'
  },
  {
    id: 'inv-item-04',
    sku: 'SKU-DSL-GEN',
    name: 'Perkins Generator Diesel Fuel Reserve (50L Barrels)',
    category: 'Hardware',
    unitOfMeasure: 'SET',
    unitCost: 24.00,
    sellingPrice: 60.00,
    currentStock: 180,
    reorderLevel: 60,
    warehouseLocation: 'Power House Compound - Safe Bunker',
    status: 'IN_STOCK'
  },
  {
    id: 'inv-item-05',
    sku: 'SKU-EXM-PPR',
    name: 'Official MoE / WASSCE Examination Duplicating Paper (Box)',
    category: 'Raw Materials',
    unitOfMeasure: 'PCS',
    unitCost: 45.00,
    sellingPrice: 95.00,
    currentStock: 0,
    reorderLevel: 20, // Triggering out of stock!
    warehouseLocation: 'Administration Print Center - Rack 1',
    status: 'OUT_OF_STOCK'
  }
];

export const INITIAL_STOCK_MOVEMENTS: StockMovement[] = [
  {
    id: 'sm-001',
    itemId: 'inv-item-01',
    sku: 'SKU-WSC-TXT',
    itemName: 'WASSCE Core Mathematics & Science Textbooks',
    movementType: 'STOCK_IN',
    quantity: 200,
    previousStock: 0,
    newStock: 200,
    unitCostAtMovement: 85.00,
    referenceNumber: 'PO-2026-8801',
    reason: 'Initial textbook delivery from Macmillan Publishers',
    performedBy: 'Kofi Mensah',
    timestamp: '2026-10-04T10:15:00Z'
  },
  {
    id: 'sm-002',
    itemId: 'inv-item-01',
    sku: 'SKU-WSC-TXT',
    itemName: 'WASSCE Core Mathematics & Science Textbooks',
    movementType: 'STOCK_OUT',
    quantity: 60,
    previousStock: 200,
    newStock: 140,
    unitCostAtMovement: 85.00,
    referenceNumber: 'SO-2026-1001',
    reason: 'Issued to enrolled Grade 10 Science section students',
    performedBy: 'Kofi Mensah',
    timestamp: '2026-10-09T14:30:00Z'
  },
  {
    id: 'sm-003',
    itemId: 'inv-item-02',
    sku: 'SKU-CHM-LAB',
    itemName: 'Chemistry & Biology Laboratory Glassware & Reagent Kit',
    movementType: 'STOCK_OUT',
    quantity: 45,
    previousStock: 73,
    newStock: 28,
    unitCostAtMovement: 160.00,
    referenceNumber: 'SO-2026-1002',
    reason: 'Issued to Senior Physics & Chemistry Practical Labs',
    performedBy: 'Kofi Mensah',
    timestamp: '2026-10-14T16:00:00Z'
  }
];

export const INITIAL_USERS = [
  {
    id: 'user-01',
    username: 'dr_doe',
    fullName: 'Rev. Dr. Emmanuel Doe',
    email: 'principal@redeemerschool.edu.lr',
    department: 'School Administration',
    role: 'ADMINISTRATOR' as const,
    status: 'ACTIVE' as const,
    twoFactorEnabled: true,
    createdAt: '2024-01-10',
    lastLoginAt: '2026-10-20 08:30'
  },
  {
    id: 'user-02',
    username: 'marcus_v',
    fullName: 'Marcus Vance, CPA',
    email: 'bursar@redeemerschool.edu.lr',
    department: 'Finance & Accounts',
    role: 'ACCOUNTANT' as const,
    status: 'ACTIVE' as const,
    twoFactorEnabled: true,
    createdAt: '2024-02-15',
    lastLoginAt: '2026-10-20 08:15'
  },
  {
    id: 'user-03',
    username: 'evelyn_c',
    fullName: 'Sister Evelyn Coleman',
    email: 'academics@redeemerschool.edu.lr',
    department: 'Dean of Academics & HR',
    role: 'HR_MANAGER' as const,
    status: 'ACTIVE' as const,
    twoFactorEnabled: true,
    createdAt: '2024-01-20',
    lastLoginAt: '2026-10-19 16:45'
  },
  {
    id: 'user-04',
    username: 'kofi_m',
    fullName: 'Kofi Mensah',
    email: 'storekeeper@redeemerschool.edu.lr',
    department: 'Campus Storehouse',
    role: 'INVENTORY_CLERK' as const,
    status: 'ACTIVE' as const,
    twoFactorEnabled: false,
    createdAt: '2024-03-01',
    lastLoginAt: '2026-10-20 07:10'
  },
  {
    id: 'user-05',
    username: 'tamba_f',
    fullName: 'Inspector Tamba Flomo',
    email: 'tamba.flomo@moe.gov.lr',
    department: 'MoE External Compliance',
    role: 'EXECUTIVE_AUDITOR' as const,
    status: 'ACTIVE' as const,
    twoFactorEnabled: true,
    createdAt: '2024-06-15',
    lastLoginAt: '2026-10-18 14:00'
  }
];

export const INITIAL_SECURITY_AUDIT_LOGS = [
  {
    id: 'sec-001',
    timestamp: '2026-10-20T08:15:22Z',
    userId: 'user-02',
    userName: 'Marcus Vance, CPA',
    userRole: 'ACCOUNTANT' as const,
    action: 'JOURNAL_POSTED',
    module: 'FINANCE' as const,
    details: 'Posted double-entry journal JE-2026-005 (Campus Facility Lease & Diesel Fuel $8,700.00)',
    ipAddress: '197.231.42.10',
    status: 'SUCCESS' as const
  },
  {
    id: 'sec-002',
    timestamp: '2026-10-19T16:30:10Z',
    userId: 'user-03',
    userName: 'Sister Evelyn Coleman',
    userRole: 'HR_MANAGER' as const,
    action: 'LEAVE_APPROVED',
    module: 'HR' as const,
    details: 'Approved 5-day professional conference leave for Science Head Master Isaac Kollie',
    ipAddress: '197.231.42.15',
    status: 'SUCCESS' as const
  },
  {
    id: 'sec-003',
    timestamp: '2026-10-19T11:20:45Z',
    userId: 'user-04',
    userName: 'Kofi Mensah',
    userRole: 'INVENTORY_CLERK' as const,
    action: 'STOCK_MOVEMENT',
    module: 'INVENTORY' as const,
    details: 'Dispatched 45 kits of SKU-CHM-LAB for Senior High Science practicals',
    ipAddress: '197.231.42.22',
    status: 'SUCCESS' as const
  },
  {
    id: 'sec-004',
    timestamp: '2026-10-18T14:02:18Z',
    userId: 'user-05',
    userName: 'Inspector Tamba Flomo',
    userRole: 'EXECUTIVE_AUDITOR' as const,
    action: 'REPORT_EXPORTED',
    module: 'REPORTS' as const,
    details: 'Generated complete Redeemer School GAAP Balance Sheet and MoE EMIS Compliance summary',
    ipAddress: '197.231.42.12',
    status: 'SUCCESS' as const
  },
  {
    id: 'sec-005',
    timestamp: '2026-10-17T09:12:00Z',
    userId: 'user-04',
    userName: 'Kofi Mensah',
    userRole: 'INVENTORY_CLERK' as const,
    action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
    module: 'SECURITY_ADMIN' as const,
    details: 'Access denied: Attempted to view executive faculty compensation table (permission hr.compensation.view_sensitive required)',
    ipAddress: '197.231.42.22',
    status: 'ACCESS_DENIED' as const
  }
];

export const INITIAL_STUDENTS: StudentProfile[] = [
  {
    id: 'stu-001',
    studentId: 'STU-2026-0041',
    moeLearnerId: 'LBR-STU-009182',
    firstName: 'Kormassa',
    lastName: 'Weah',
    dateOfBirth: '2010-04-12',
    gender: 'FEMALE' as const,
    countyOfResidence: 'Montserrado',
    address: 'Old Road, Sinkor, Monrovia',
    gradeLevel: 'Grade 10',
    section: 'A',
    campus: 'Main Campus (Snapper Hill)',
    enrollmentDate: '2026-08-25',
    status: 'ENROLLED' as const,
    guardians: [
      {
        name: 'Musu K. Weah',
        relation: 'Mother',
        phone: '+231 (0) 886 112 233',
        email: 'musu.weah@gmail.com',
        isPrimary: true,
        authorizedPickup: true
      },
      {
        name: 'Arthur Weah',
        relation: 'Father',
        phone: '+231 (0) 777 223 344',
        email: 'a.weah@gov.lr',
        isPrimary: false,
        authorizedPickup: true
      }
    ],
    documents: [
      {
        id: 'doc-001-trn',
        studentId: 'STU-2026-0041',
        type: 'ACADEMIC_TRANSCRIPT',
        title: 'Official Senior High Academic Transcript (Term 1)',
        fileName: 'weah_kormassa_academic_transcript_2026.pdf',
        fileSizeBytes: 2840,
        mimeType: 'application/pdf',
        base64Data: generateOfficialTranscriptPdfBase64({
          studentName: 'Kormassa Weah',
          studentId: 'STU-2026-0041',
          gradeLevel: 'Grade 10',
          section: 'A',
          academicYear: '2026/2027',
          campus: 'Snapper Hill Main Campus',
          gpa: '3.88',
          subjects: [
            { name: 'Mathematics & Algebra', score: 94, grade: 'A', remarks: 'Distinction' },
            { name: 'English Language & Literature', score: 89, grade: 'B', remarks: 'Proficient' },
            { name: 'General Chemistry', score: 92, grade: 'A', remarks: 'High Honors' },
            { name: 'Biology & Environmental Science', score: 91, grade: 'A', remarks: 'Distinction' },
            { name: 'History of Liberia & Civics', score: 96, grade: 'A', remarks: 'Exemplary' }
          ]
        }),
        uploadedAt: '2026-08-25T10:15:00Z',
        uploadedBy: 'Sister Evelyn Coleman, Registrar',
        verified: true,
        verifiedBy: 'Sister Evelyn Coleman, Registrar',
        verifiedAt: '2026-08-26T09:00:00Z',
        notes: 'Official transcript signed by Principal Rev. Dr. Doe'
      },
      {
        id: 'doc-001-brt',
        studentId: 'STU-2026-0041',
        type: 'BIRTH_CERTIFICATE',
        title: 'Republic of Liberia Birth Certificate',
        fileName: 'weah_kormassa_birth_certificate.pdf',
        fileSizeBytes: 2450,
        mimeType: 'application/pdf',
        base64Data: generateBirthCertificatePdfBase64({
          certificateNumber: 'LBR-VS-2010-09412',
          childName: 'Kormassa Weah',
          dateOfBirth: '2010-04-12',
          gender: 'Female',
          placeOfBirth: 'JFK Memorial Hospital, Monrovia',
          county: 'Montserrado',
          motherName: 'Musu K. Weah',
          fatherName: 'Arthur Weah',
          registrarName: 'Hon. J. Patrick Benson',
          issueDate: '2010-04-20'
        }),
        uploadedAt: '2026-08-25T10:20:00Z',
        uploadedBy: 'Sister Evelyn Coleman, Registrar',
        verified: true,
        verifiedBy: 'Sister Evelyn Coleman, Registrar',
        verifiedAt: '2026-08-26T09:05:00Z',
        notes: 'Original certificate verified against Ministry records'
      }
    ],
    specialNeeds: false,
    previousSchool: 'Monrovia Demonstration Elementary School',
    medicalNotes: 'No known allergies',
    correctionLog: []
  },
  {
    id: 'stu-002',
    studentId: 'STU-2026-0042',
    moeLearnerId: 'LBR-STU-009183',
    firstName: 'Varney',
    lastName: 'Sherman',
    dateOfBirth: '2010-08-20',
    gender: 'MALE' as const,
    countyOfResidence: 'Montserrado',
    address: 'Tubman Blvd, Congo Town, Monrovia',
    gradeLevel: 'Grade 10',
    section: 'A',
    campus: 'Main Campus (Snapper Hill)',
    enrollmentDate: '2026-08-26',
    status: 'ENROLLED' as const,
    guardians: [
      {
        name: 'Cllr. Famatta Sherman',
        relation: 'Mother',
        phone: '+231 (0) 888 334 455',
        email: 'famatta.sherman@lawfirm.lr',
        isPrimary: true,
        authorizedPickup: true
      }
    ],
    documents: [
      {
        id: 'doc-002-trn',
        studentId: 'STU-2026-0042',
        type: 'ACADEMIC_TRANSCRIPT',
        title: 'Junior High Academic Transcript & Evaluation',
        fileName: 'sherman_varney_junior_transcript.pdf',
        fileSizeBytes: 2790,
        mimeType: 'application/pdf',
        base64Data: generateOfficialTranscriptPdfBase64({
          studentName: 'Varney Sherman',
          studentId: 'STU-2026-0042',
          gradeLevel: 'Grade 10',
          section: 'A',
          academicYear: '2026/2027',
          campus: 'Snapper Hill Main Campus',
          gpa: '3.75',
          subjects: [
            { name: 'Mathematics & Geometry', score: 90, grade: 'A', remarks: 'Excellent' },
            { name: 'English Language', score: 85, grade: 'B', remarks: 'Good' },
            { name: 'Introductory Physics', score: 88, grade: 'B', remarks: 'Proficient' },
            { name: 'French Language', score: 92, grade: 'A', remarks: 'Distinction' }
          ]
        }),
        uploadedAt: '2026-08-26T11:00:00Z',
        uploadedBy: 'Sister Evelyn Coleman, Registrar',
        verified: true,
        verifiedBy: 'Sister Evelyn Coleman, Registrar',
        verifiedAt: '2026-08-26T14:30:00Z',
        notes: 'Transferred from J.J. Roberts Methodist School'
      },
      {
        id: 'doc-002-brt',
        studentId: 'STU-2026-0042',
        type: 'BIRTH_CERTIFICATE',
        title: 'Vital Statistics Birth Registration',
        fileName: 'sherman_varney_birth_cert.pdf',
        fileSizeBytes: 2420,
        mimeType: 'application/pdf',
        base64Data: generateBirthCertificatePdfBase64({
          certificateNumber: 'LBR-VS-2010-10822',
          childName: 'Varney Sherman',
          dateOfBirth: '2010-08-20',
          gender: 'Male',
          placeOfBirth: 'St. Joseph Catholic Hospital, Monrovia',
          county: 'Montserrado',
          motherName: 'Cllr. Famatta Sherman',
          fatherName: 'Varney Sherman Sr.',
          registrarName: 'Hon. J. Patrick Benson',
          issueDate: '2010-09-02'
        }),
        uploadedAt: '2026-08-26T11:05:00Z',
        uploadedBy: 'Sister Evelyn Coleman, Registrar',
        verified: true,
        verifiedBy: 'Sister Evelyn Coleman, Registrar',
        verifiedAt: '2026-08-26T14:35:00Z'
      }
    ],
    specialNeeds: false,
    previousSchool: 'J.J. Roberts United Methodist School',
    medicalNotes: 'Asthma inhaler kept in school infirmary',
    correctionLog: []
  },
  {
    id: 'stu-003',
    studentId: 'STU-2026-0043',
    moeLearnerId: 'LBR-STU-009184',
    firstName: 'Fatu',
    lastName: 'Kamara',
    dateOfBirth: '2008-11-03',
    gender: 'FEMALE' as const,
    countyOfResidence: 'Montserrado',
    address: 'Broad Street, Central Monrovia',
    gradeLevel: 'Grade 12',
    section: 'B',
    campus: 'Main Campus (Snapper Hill)',
    enrollmentDate: '2024-09-01',
    status: 'ENROLLED' as const,
    guardians: [
      {
        name: 'Dr. Sekou Kamara',
        relation: 'Father',
        phone: '+231 (0) 770 445 566',
        email: 's.kamara@jfk-medical.org',
        isPrimary: true,
        authorizedPickup: true
      }
    ],
    documents: [
      {
        id: 'doc-003-trn',
        studentId: 'STU-2026-0043',
        type: 'ACADEMIC_TRANSCRIPT',
        title: 'Grade 11 Scholastic Record Transcript',
        fileName: 'kamara_fatu_transcript_grade11.pdf',
        fileSizeBytes: 2810,
        mimeType: 'application/pdf',
        base64Data: generateOfficialTranscriptPdfBase64({
          studentName: 'Fatu Kamara',
          studentId: 'STU-2026-0043',
          gradeLevel: 'Grade 12',
          section: 'B',
          academicYear: '2026/2027',
          campus: 'Snapper Hill Main Campus',
          gpa: '3.92',
          subjects: [
            { name: 'Advanced Biology', score: 95, grade: 'A', remarks: 'Exemplary' },
            { name: 'Pure Chemistry', score: 93, grade: 'A', remarks: 'High Honors' },
            { name: 'Calculus & Advanced Math', score: 91, grade: 'A', remarks: 'Distinction' },
            { name: 'Literature in English', score: 94, grade: 'A', remarks: 'Distinction' }
          ]
        }),
        uploadedAt: '2025-09-02T08:30:00Z',
        uploadedBy: 'Sister Evelyn Coleman, Registrar',
        verified: true,
        verifiedBy: 'Sister Evelyn Coleman, Registrar',
        verifiedAt: '2025-09-03T10:00:00Z'
      },
      {
        id: 'doc-003-brt',
        studentId: 'STU-2026-0043',
        type: 'BIRTH_CERTIFICATE',
        title: 'Certified Birth Certificate',
        fileName: 'kamara_fatu_birth_cert.pdf',
        fileSizeBytes: 2430,
        mimeType: 'application/pdf',
        base64Data: generateBirthCertificatePdfBase64({
          certificateNumber: 'LBR-VS-2008-07119',
          childName: 'Fatu Kamara',
          dateOfBirth: '2008-11-03',
          gender: 'Female',
          placeOfBirth: 'Monrovia, Montserrado',
          county: 'Montserrado',
          motherName: 'Mariama Kamara',
          fatherName: 'Dr. Sekou Kamara',
          registrarName: 'Hon. J. Patrick Benson',
          issueDate: '2008-11-15'
        }),
        uploadedAt: '2024-09-01T09:00:00Z',
        uploadedBy: 'Sister Evelyn Coleman, Registrar',
        verified: true,
        verifiedBy: 'Sister Evelyn Coleman, Registrar',
        verifiedAt: '2024-09-02T11:00:00Z'
      }
    ],
    specialNeeds: false,
    previousSchool: 'Redeemer Junior High',
    medicalNotes: 'Mild peanut sensitivity',
    correctionLog: []
  },
  {
    id: 'stu-004',
    studentId: 'STU-2026-0044',
    moeLearnerId: 'LBR-STU-009185',
    firstName: 'Emmanuel',
    lastName: 'Kortu',
    dateOfBirth: '2013-02-14',
    gender: 'MALE' as const,
    countyOfResidence: 'Montserrado',
    address: '15th Street Sinkor, Monrovia',
    gradeLevel: 'Grade 7',
    section: 'A',
    campus: 'Junior Annex (Sinkor)',
    enrollmentDate: '2026-09-02',
    status: 'ENROLLED' as const,
    guardians: [
      {
        name: 'Grace Kortu',
        relation: 'Mother',
        phone: '+231 (0) 886 998 877',
        email: 'grace.kortu@gmail.com',
        isPrimary: true,
        authorizedPickup: true
      }
    ],
    documents: [],
    specialNeeds: false,
    medicalNotes: 'Routine checkup up to date',
    correctionLog: []
  },
  {
    id: 'stu-005',
    studentId: 'STU-2026-0045',
    moeLearnerId: 'LBR-STU-009186',
    firstName: 'Blessing',
    lastName: 'Tweh',
    dateOfBirth: '2009-06-18',
    gender: 'FEMALE' as const,
    countyOfResidence: 'Montserrado',
    address: 'Paynesville Red Light, Monrovia',
    gradeLevel: 'Grade 11',
    section: 'A',
    campus: 'Main Campus (Snapper Hill)',
    enrollmentDate: '2025-09-01',
    status: 'ENROLLED' as const,
    guardians: [
      {
        name: 'Pastor Joseph Tweh',
        relation: 'Father',
        phone: '+231 (0) 777 665 544',
        email: 'j.tweh@church.org.lr',
        isPrimary: true,
        authorizedPickup: true
      }
    ],
    documents: [],
    specialNeeds: false,
    medicalNotes: 'Spectacles for reading',
    correctionLog: []
  }
];


export const INITIAL_ADMISSION_APPLICANTS = [
  {
    id: 'app-01',
    applicationNumber: 'ADM-2026-0081',
    firstName: 'Comfort',
    lastName: 'Gaye',
    dateOfBirth: '2010-09-15',
    gender: 'FEMALE' as const,
    county: 'Montserrado',
    targetGrade: 'Grade 10',
    appliedDate: '2026-10-05',
    status: 'ACCEPTED' as const,
    guardianName: 'Christian Gaye',
    guardianRelation: 'Father',
    guardianPhone: '+231 (0) 886 771 122',
    guardianEmail: 'c.gaye@customs.gov.lr',
    decisionNotes: 'Entrance Exam Score: 88/100. Strong analytical aptitude; highly recommended for WASSCE Science Track.',
    documents: [
      { title: 'Birth Certificate', submitted: true, verified: true },
      { title: 'Previous Transcripts', submitted: true, verified: true },
      { title: 'Vaccination Card', submitted: true, verified: true },
      { title: 'Passport Photos', submitted: true, verified: true }
    ]
  },
  {
    id: 'app-02',
    applicationNumber: 'ADM-2026-0082',
    firstName: 'Jonathan',
    lastName: 'Sirleaf',
    dateOfBirth: '2013-05-22',
    gender: 'MALE' as const,
    county: 'Montserrado',
    targetGrade: 'Grade 7',
    appliedDate: '2026-10-12',
    status: 'UNDER_REVIEW' as const,
    guardianName: 'Helena Sirleaf',
    guardianRelation: 'Mother',
    guardianPhone: '+231 (0) 776 882 233',
    guardianEmail: 'helena.sirleaf@bank.lr',
    decisionNotes: 'Entrance Exam Score: 76/100. Entrance interview scheduled with Academic Dean Sister Evelyn Coleman.',
    documents: [
      { title: 'Birth Certificate', submitted: true, verified: true },
      { title: 'Previous Transcripts', submitted: true, verified: false }
    ]
  },
  {
    id: 'app-03',
    applicationNumber: 'ADM-2026-0083',
    firstName: 'Precious',
    lastName: 'Dolo',
    dateOfBirth: '2011-01-30',
    gender: 'FEMALE' as const,
    county: 'Margibi',
    targetGrade: 'Grade 9',
    appliedDate: '2026-10-18',
    status: 'SUBMITTED' as const,
    guardianName: 'Moses Dolo',
    guardianRelation: 'Father',
    guardianPhone: '+231 (0) 880 443 322',
    guardianEmail: 'moses.dolo@rubber-estate.com',
    decisionNotes: 'Application fee settled. Academic transcripts pending verification.',
    documents: [
      { title: 'Application Form', submitted: true, verified: true },
      { title: 'Birth Certificate', submitted: false, verified: false }
    ]
  }
];

export const INITIAL_ATTENDANCE_RECORDS: StudentAttendanceRecord[] = [
  // --- Kormassa Weah (STU-2026-0041, Grade 10-A) : 11 sessions, 10 Present, 1 Late = 97.7% ---
  { id: 'att-kw-01', date: '2026-10-05', studentId: 'STU-2026-0041', studentName: 'Kormassa Weah', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-05T08:00:00Z' },
  { id: 'att-kw-02', date: '2026-10-06', studentId: 'STU-2026-0041', studentName: 'Kormassa Weah', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-06T08:00:00Z' },
  { id: 'att-kw-03', date: '2026-10-07', studentId: 'STU-2026-0041', studentName: 'Kormassa Weah', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-07T08:00:00Z' },
  { id: 'att-kw-04', date: '2026-10-08', studentId: 'STU-2026-0041', studentName: 'Kormassa Weah', gradeLevel: 'Grade 10', section: 'A', status: 'LATE', arrivalTime: '08:25 AM', reason: 'Sinkor traffic congestion', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-08T08:25:00Z' },
  { id: 'att-kw-05', date: '2026-10-09', studentId: 'STU-2026-0041', studentName: 'Kormassa Weah', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-09T08:00:00Z' },
  { id: 'att-kw-06', date: '2026-10-12', studentId: 'STU-2026-0041', studentName: 'Kormassa Weah', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-12T08:00:00Z' },
  { id: 'att-kw-07', date: '2026-10-13', studentId: 'STU-2026-0041', studentName: 'Kormassa Weah', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-13T08:00:00Z' },
  { id: 'att-kw-08', date: '2026-10-14', studentId: 'STU-2026-0041', studentName: 'Kormassa Weah', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-14T08:00:00Z' },
  { id: 'att-kw-09', date: '2026-10-15', studentId: 'STU-2026-0041', studentName: 'Kormassa Weah', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-15T08:00:00Z' },
  { id: 'att-kw-10', date: '2026-10-16', studentId: 'STU-2026-0041', studentName: 'Kormassa Weah', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-16T08:00:00Z' },
  { id: 'att-kw-11', date: '2026-10-19', studentId: 'STU-2026-0041', studentName: 'Kormassa Weah', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-19T08:00:00Z' },

  // --- Varney Sherman (STU-2026-0042, Grade 10-A) : 11 sessions, 7 Present, 1 Late, 3 Absent = 70.5% (Triggers Low Attendance Alert!) ---
  { id: 'att-vs-01', date: '2026-10-05', studentId: 'STU-2026-0042', studentName: 'Varney Sherman', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-05T08:00:00Z' },
  { id: 'att-vs-02', date: '2026-10-06', studentId: 'STU-2026-0042', studentName: 'Varney Sherman', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-06T08:00:00Z' },
  { id: 'att-vs-03', date: '2026-10-07', studentId: 'STU-2026-0042', studentName: 'Varney Sherman', gradeLevel: 'Grade 10', section: 'A', status: 'ABSENT', reason: 'Acute asthma attack - treated at St. Joseph Catholic Hospital', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-07T08:00:00Z' },
  { id: 'att-vs-04', date: '2026-10-08', studentId: 'STU-2026-0042', studentName: 'Varney Sherman', gradeLevel: 'Grade 10', section: 'A', status: 'ABSENT', reason: 'Asthma recovery - medical note submitted by Cllr. Famatta Sherman', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-08T08:00:00Z' },
  { id: 'att-vs-05', date: '2026-10-09', studentId: 'STU-2026-0042', studentName: 'Varney Sherman', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-09T08:00:00Z' },
  { id: 'att-vs-06', date: '2026-10-12', studentId: 'STU-2026-0042', studentName: 'Varney Sherman', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-12T08:00:00Z' },
  { id: 'att-vs-07', date: '2026-10-13', studentId: 'STU-2026-0042', studentName: 'Varney Sherman', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-13T08:00:00Z' },
  { id: 'att-vs-08', date: '2026-10-14', studentId: 'STU-2026-0042', studentName: 'Varney Sherman', gradeLevel: 'Grade 10', section: 'A', status: 'LATE', arrivalTime: '08:35 AM', reason: 'Pharmacy pickup of prescription inhaler', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-14T08:35:00Z' },
  { id: 'att-vs-09', date: '2026-10-15', studentId: 'STU-2026-0042', studentName: 'Varney Sherman', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-15T08:00:00Z' },
  { id: 'att-vs-10', date: '2026-10-16', studentId: 'STU-2026-0042', studentName: 'Varney Sherman', gradeLevel: 'Grade 10', section: 'A', status: 'ABSENT', reason: 'Unexcused Friday absence - Guardian notified via SMS', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-16T08:00:00Z' },
  { id: 'att-vs-11', date: '2026-10-19', studentId: 'STU-2026-0042', studentName: 'Varney Sherman', gradeLevel: 'Grade 10', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-19T08:00:00Z' },

  // --- Fatu Kamara (STU-2026-0043, Grade 12-B) : 11 sessions, 11 Present = 100% ---
  { id: 'att-fk-01', date: '2026-10-05', studentId: 'STU-2026-0043', studentName: 'Fatu Kamara', gradeLevel: 'Grade 12', section: 'B', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-05T08:00:00Z' },
  { id: 'att-fk-02', date: '2026-10-06', studentId: 'STU-2026-0043', studentName: 'Fatu Kamara', gradeLevel: 'Grade 12', section: 'B', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-06T08:00:00Z' },
  { id: 'att-fk-03', date: '2026-10-07', studentId: 'STU-2026-0043', studentName: 'Fatu Kamara', gradeLevel: 'Grade 12', section: 'B', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-07T08:00:00Z' },
  { id: 'att-fk-04', date: '2026-10-08', studentId: 'STU-2026-0043', studentName: 'Fatu Kamara', gradeLevel: 'Grade 12', section: 'B', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-08T08:00:00Z' },
  { id: 'att-fk-05', date: '2026-10-09', studentId: 'STU-2026-0043', studentName: 'Fatu Kamara', gradeLevel: 'Grade 12', section: 'B', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-09T08:00:00Z' },
  { id: 'att-fk-06', date: '2026-10-12', studentId: 'STU-2026-0043', studentName: 'Fatu Kamara', gradeLevel: 'Grade 12', section: 'B', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-12T08:00:00Z' },
  { id: 'att-fk-07', date: '2026-10-13', studentId: 'STU-2026-0043', studentName: 'Fatu Kamara', gradeLevel: 'Grade 12', section: 'B', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-13T08:00:00Z' },
  { id: 'att-fk-08', date: '2026-10-14', studentId: 'STU-2026-0043', studentName: 'Fatu Kamara', gradeLevel: 'Grade 12', section: 'B', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-14T08:00:00Z' },
  { id: 'att-fk-09', date: '2026-10-15', studentId: 'STU-2026-0043', studentName: 'Fatu Kamara', gradeLevel: 'Grade 12', section: 'B', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-15T08:00:00Z' },
  { id: 'att-fk-10', date: '2026-10-16', studentId: 'STU-2026-0043', studentName: 'Fatu Kamara', gradeLevel: 'Grade 12', section: 'B', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-16T08:00:00Z' },
  { id: 'att-fk-11', date: '2026-10-19', studentId: 'STU-2026-0043', studentName: 'Fatu Kamara', gradeLevel: 'Grade 12', section: 'B', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-19T08:00:00Z' },

  // --- Emmanuel Kortu (STU-2026-0044, Grade 7-A) : 11 sessions, 10 Present, 1 Excused = 100% ---
  { id: 'att-ek-01', date: '2026-10-05', studentId: 'STU-2026-0044', studentName: 'Emmanuel Kortu', gradeLevel: 'Grade 7', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-05T08:00:00Z' },
  { id: 'att-ek-02', date: '2026-10-06', studentId: 'STU-2026-0044', studentName: 'Emmanuel Kortu', gradeLevel: 'Grade 7', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-06T08:00:00Z' },
  { id: 'att-ek-03', date: '2026-10-07', studentId: 'STU-2026-0044', studentName: 'Emmanuel Kortu', gradeLevel: 'Grade 7', section: 'A', status: 'EXCUSED', reason: 'Dental appointment at JFK Medical', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-07T08:00:00Z' },
  { id: 'att-ek-04', date: '2026-10-08', studentId: 'STU-2026-0044', studentName: 'Emmanuel Kortu', gradeLevel: 'Grade 7', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-08T08:00:00Z' },
  { id: 'att-ek-05', date: '2026-10-09', studentId: 'STU-2026-0044', studentName: 'Emmanuel Kortu', gradeLevel: 'Grade 7', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-09T08:00:00Z' },
  { id: 'att-ek-06', date: '2026-10-12', studentId: 'STU-2026-0044', studentName: 'Emmanuel Kortu', gradeLevel: 'Grade 7', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-12T08:00:00Z' },
  { id: 'att-ek-07', date: '2026-10-13', studentId: 'STU-2026-0044', studentName: 'Emmanuel Kortu', gradeLevel: 'Grade 7', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-13T08:00:00Z' },
  { id: 'att-ek-08', date: '2026-10-14', studentId: 'STU-2026-0044', studentName: 'Emmanuel Kortu', gradeLevel: 'Grade 7', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-14T08:00:00Z' },
  { id: 'att-ek-09', date: '2026-10-15', studentId: 'STU-2026-0044', studentName: 'Emmanuel Kortu', gradeLevel: 'Grade 7', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-15T08:00:00Z' },
  { id: 'att-ek-10', date: '2026-10-16', studentId: 'STU-2026-0044', studentName: 'Emmanuel Kortu', gradeLevel: 'Grade 7', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-16T08:00:00Z' },
  { id: 'att-ek-11', date: '2026-10-19', studentId: 'STU-2026-0044', studentName: 'Emmanuel Kortu', gradeLevel: 'Grade 7', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-19T08:00:00Z' },

  // --- Blessing Tweh (STU-2026-0045, Grade 11-A) : 11 sessions, 8 Present, 3 Absent = 72.7% (Also below 75% threshold!) ---
  { id: 'att-bt-01', date: '2026-10-05', studentId: 'STU-2026-0045', studentName: 'Blessing Tweh', gradeLevel: 'Grade 11', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-05T08:00:00Z' },
  { id: 'att-bt-02', date: '2026-10-06', studentId: 'STU-2026-0045', studentName: 'Blessing Tweh', gradeLevel: 'Grade 11', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-06T08:00:00Z' },
  { id: 'att-bt-03', date: '2026-10-07', studentId: 'STU-2026-0045', studentName: 'Blessing Tweh', gradeLevel: 'Grade 11', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-07T08:00:00Z' },
  { id: 'att-bt-04', date: '2026-10-08', studentId: 'STU-2026-0045', studentName: 'Blessing Tweh', gradeLevel: 'Grade 11', section: 'A', status: 'ABSENT', reason: 'County church revival trip with Pastor Tweh', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-08T08:00:00Z' },
  { id: 'att-bt-05', date: '2026-10-09', studentId: 'STU-2026-0045', studentName: 'Blessing Tweh', gradeLevel: 'Grade 11', section: 'A', status: 'ABSENT', reason: 'Delayed return from Grand Bassa County', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-09T08:00:00Z' },
  { id: 'att-bt-06', date: '2026-10-12', studentId: 'STU-2026-0045', studentName: 'Blessing Tweh', gradeLevel: 'Grade 11', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-12T08:00:00Z' },
  { id: 'att-bt-07', date: '2026-10-13', studentId: 'STU-2026-0045', studentName: 'Blessing Tweh', gradeLevel: 'Grade 11', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-13T08:00:00Z' },
  { id: 'att-bt-08', date: '2026-10-14', studentId: 'STU-2026-0045', studentName: 'Blessing Tweh', gradeLevel: 'Grade 11', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-14T08:00:00Z' },
  { id: 'att-bt-09', date: '2026-10-15', studentId: 'STU-2026-0045', studentName: 'Blessing Tweh', gradeLevel: 'Grade 11', section: 'A', status: 'ABSENT', reason: 'Unexcused absence - parent follow-up pending', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-15T08:00:00Z' },
  { id: 'att-bt-10', date: '2026-10-16', studentId: 'STU-2026-0045', studentName: 'Blessing Tweh', gradeLevel: 'Grade 11', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-16T08:00:00Z' },
  { id: 'att-bt-11', date: '2026-10-19', studentId: 'STU-2026-0045', studentName: 'Blessing Tweh', gradeLevel: 'Grade 11', section: 'A', status: 'PRESENT', loggedBy: 'Sister Evelyn Coleman', loggedByRole: 'HR_MANAGER', loggedAt: '2026-10-19T08:00:00Z' }
];

