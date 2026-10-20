/**
 * Phase 0: Discovery, Architecture, and MoE EMIS Compatibility Dossier
 * Liberia Private-School Operations Platform (Liberia SchoolOS / The Redeemer School ERP)
 */

export const DISCOVERY_DOSSIER_MARKDOWN = `# Phase 0: Discovery, Architecture, and MoE EMIS Compatibility Dossier
**Project:** The Redeemer School Operations ERP Platform  
**Version:** 1.0  
**Date:** October 2026  
**Context:** The Redeemer School, Monrovia, Montserrado County, Liberia

---

## 1. Product Brief & Target Customer Assumptions

### The Problem
Private and faith-based schools in Liberia educate over 50% of secondary students and a massive proportion of primary learners. These schools operate under stringent economic realities:
- **Unreliable Electricity & Connectivity:** Frequent power outages (LEC instability) and expensive, variable mobile data connections (Lonestar MTN / Orange).
- **Dual-Currency Economy:** Tuition and lab fees are charged in United States Dollars (USD), while local fees (PTA dues, uniforms, exam levies) are commonly paid in Liberian Dollars (LRD). Silent conversions cause severe balance discrepancies.
- **Paper Record Vulnerability:** Student transcripts, receipt ledgers, and attendance rosters kept in paper ledger books suffer water damage, fire loss, or unauthorized tampering.
- **Ministry of Education (MoE) Compliance:** Annual School Census filings and school operating permits require accurate aggregate and learner-level data. However, there is no public open-write API to Ministry servers as of 2026; attempts to claim a "direct live API" are fabricated. Schools need dependable, validated CSV/XLSX export formats that match the official MoE EMIS schema.

### Core Value Proposition
The Redeemer School ERP provides an offline-resilient, mobile-accessible school operations ERP with strict multi-tenant data isolation, dual-currency accounting, audited assessment approvals, and a grounded MoE EMIS file-based compatibility layer.

---

## 2. User-Role & Permission Matrix

| Role | Admissions & Intake | Student Records | Academic & Timetable | Attendance Taking | Grade Entry | Grade Approval | Fees & Receipts | MoE EMIS Export | Audit Trail |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **School Board** | Read | Read | Read | Read | Read | — | View Reports | Read | Read |
| **Principal / Superintendent** | Approve | Full | Manage | Review | Review | **Approve & Lock** | View & Reversal Auth | Approve & Export | Full Audit |
| **Registrar / Admissions** | **Full Intake** | **Full CRUD** | Assign | Read | Read | — | Read Balances | **Generate Export** | View Records |
| **Bursar / Cashier** | View Status | View Basic | — | — | — | — | **Full Billing & Cashier** | — | Finance Logs |
| **Teacher** | — | View Assigned | View Schedule | **Take Roster** | **Draft & Submit** | — | — | — | — |
| **Academic Dean / HOD** | — | View Dept | Dept Setup | Dept Review | Moderate | Pre-approve | — | — | — |
| **Parent / Guardian** | Apply | View Linked Child | View Timetable | View Child Summary | View Released Only | — | **View Statement/Receipts** | — | — |
| **Learner** | — | View Own Profile | View Timetable | View Own Attendance | View Released Report | — | — | — | — |
| **Auditor / MoE Reviewer** | Read-Only | Read-Only | Read-Only | Read-Only | Read-Only | — | Read-Only (Audited) | Inspect Validation | **Full Audit** |

---

## 3. System Architecture & Data Model

### Tenancy and Security
1. **Tenant Isolation:** Every document and database query is partitioned by \`schoolId\` and optionally scoped by \`campusId\`. Cross-tenant queries are blocked at the service layer.
2. **Audit Logging:** Every sensitive event (logins, admissions decisions, marks submission, grade approvals, payment receipts, payment reversals, and MoE EMIS exports) creates an append-only \`AuditLog\` entry with actor ID, timestamp, category, and IP address.
3. **Dual-Currency Isolation:** Financial balances in USD and LRD maintain separate ledger accounts. At no point does the application convert or merge USD with LRD balances without an explicit cashier currency-exchange transaction.

---

## 4. End-to-End Workflows

### A. Admissions & Enrollment Workflow
1. Prospective applicant files online or registrar enters paper form into "Admissions Intake".
2. **Duplicate Detection:** System evaluates \`firstName + lastName + dateOfBirth\` against existing enrolled learners. If a match is found, an explicit duplicate alert is shown for administrative review.
3. Checklist verification (MoH Birth Certificate, WAEC slips, transfer letters).
4. Registrar schedules interview or issues offer letter.
5. Upon registration fee payment, registrar triggers "Convert to Enrolled Learner", automatically generating internal learner ID (\`STU-2026-XXXX\`) and longitudinal record.

### B. Offline-Resilient Attendance Workflow
1. Teacher opens class roster on smartphone or tablet.
2. Interface displays quick-toggle status: Present, Absent, Late, Excused.
3. Duplicate submission prevention ensures only one primary session per class per day.
4. **Offline Queue:** If internet connectivity drops, attendance records are stored locally with a visual sync badge. Once restored, the queue flushes to the server.
5. Guardian absence alerts are queued for automated SMS/notice dispatch.

### C. Grade Entry, Moderation, and Report Card Publishing
1. Teacher enters continuous assessment components: Quizzes (20%), Assignments (10%), Mid-Term (30%), Final Exam (40%).
2. Scores auto-evaluate against WASSCE standard (A1 to F9) and terminal GPA.
3. Teacher submits grades -> HOD moderates -> Principal approves.
4. Once approved, marks are locked. Changes require formal administrative reopening with a logged reason.
5. Terminal report card generated with school emblem, attendance summary, conduct remarks, and signature lines.

### D. Dual-Currency Fees and Reversals
1. Tuition billed in USD; PTA and uniform fees billed in LRD.
2. Cashier registers payment via Cash, Lonestar MTN MoMo, Orange Money, or Bank Deposit.
3. Official receipt issued with sequence number (\`REC-2026-XXXXX\`).
4. Reversals never delete ledger rows: they create an offsetting audited record with supervisor authorization and reason.

---

## 5. Ministry of Education (MoE) EMIS Compatibility Plan

### Grounding & Current Reality
- **Verified Fact:** Liberia MoE operates the National EMIS portal and School Permit System.
- **No Direct API Gateway:** The Ministry does not provide a public authenticated REST/GraphQL API for third-party automated writing.
- **Integration Status:** Explicitly designated as **"File-Based / Not Connected to Live Gateway"**.
- **Learner/Teacher IDs:** National Learner IDs are treated as nullable external fields until official national issuance.

### Implementation:
1. Versioned mapping registry matching the MoE Annual School Census template.
2. Row-level validation highlighting missing birth dates, invalid counties, or missing genders.
3. Downloadable clean CSV export ready for upload to Ministry designated census portals.
4. Reconciliation audit logging export generation dates, operator identity, and row counts.
`;
