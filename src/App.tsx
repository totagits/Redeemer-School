/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Header, ERPView } from './components/Header.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { FinanceModule } from './components/FinanceModule.tsx';
import { HrModule } from './components/HrModule.tsx';
import { InventoryModule } from './components/InventoryModule.tsx';
import { StudentsEnrollmentModule } from './components/StudentsEnrollmentModule.tsx';
import { ReportingModule } from './components/ReportingModule.tsx';
import { UserManagementModule } from './components/UserManagementModule.tsx';
import { ArchitectureView } from './components/ArchitectureView.tsx';
import { HomeLandingPage } from './components/HomeLandingPage.tsx';
import { InvitationPasswordSetupPage, SchoolAccount, SignInPage } from './components/SignInPage.tsx';
import { OperationsWorkspace } from './components/OperationsWorkspace.tsx';
import { PublicAdmissionsPage } from './components/PublicAdmissionsPage.tsx';
import { THE_REDEEMER_SCHOOL_INFO } from './data/schoolProfile.ts';

import { 
  Account, 
  JournalEntry, 
  CustomerInvoice, 
  VendorBill 
} from './logic/erpFinance.ts';
import { Employee, LeaveRequest, PayrollRun } from './logic/erpHr.ts';
import { InventoryItem, StockMovement, processStockMovement } from './logic/erpInventory.ts';
import { 
  StudentProfile, 
  AdmissionApplicant, 
  AdmissionStatus, 
  StudentDocument,
  convertApplicantToStudent 
} from './logic/students.ts';
import { StudentAttendanceRecord } from './logic/attendance.ts';
import { 
  ErpUser, 
  ErpSystemRole, 
  SecurityAuditRecord, 
  createAuditLog 
} from './logic/erpAuth.ts';

export default function App() {
  const [currentView, setCurrentView] = useState<ERPView>('home');
  const [currentRole, setCurrentRole] = useState<ErpSystemRole>('ADMINISTRATOR');
  const [authAccount, setAuthAccount] = useState<SchoolAccount | null>(null);
  const [csrfToken, setCsrfToken] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [showSignIn, setShowSignIn] = useState(false);
  const [pathname, setPathname] = useState(window.location.pathname);
  const [requestedWorkspace, setRequestedWorkspace] = useState<string | undefined>();
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [authError, setAuthError] = useState('');

  const navigate = (path: string, replace = false) => {
    if (replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
    setPathname(path);
  };

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const openSignIn = (workspace?: string) => {
    setRequestedWorkspace(workspace);
    setShowSignIn(true);
    navigate('/staff');
  };
  const openPortalSignIn = () => { setRequestedWorkspace(undefined); setShowSignIn(true); navigate('/portal'); };

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then(async response => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error('Could not verify the saved sign-in session.');
        return await response.json() as { account: SchoolAccount; csrfToken: string };
      })
      .then(session => {
        if (!active) return;
        if (session) {
          setAuthAccount(session.account);
          setCsrfToken(session.csrfToken);
        }
      })
      .catch(cause => {
        if (active) setAuthError(cause instanceof Error ? cause.message : 'Sign-in service could not be reached.');
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleSignOut = async () => {
    setSignOutBusy(true);
    setAuthError('');
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Sign-out failed. Please try again.');
      }
      setAuthAccount(null);
      setCsrfToken('');
      setRequestedWorkspace(undefined);
      setShowSignIn(false);
      navigate('/');
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : 'Could not reach the sign-out service.');
    } finally {
      setSignOutBusy(false);
    }
  };

  // Application State
  const [accounts] = useState<Account[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [bills, setBills] = useState<VendorBill[]>([]);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);

  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [applicants, setApplicants] = useState<AdmissionApplicant[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<StudentAttendanceRecord[]>([]);

  const [users, setUsers] = useState<ErpUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<SecurityAuditRecord[]>([]);

  // Success Notification / Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const activeUser = users.find(u => u.role === currentRole);

  const recordAudit = (action: string, module: SecurityAuditRecord['module'], details: string) => {
    if (!activeUser) return;
    const log = createAuditLog(activeUser, action, module, details);
    setAuditLogs([log, ...auditLogs]);
  };

  // --- FINANCE HANDLERS ---
  const handleAddJournalEntry = (entry: Omit<JournalEntry, 'id' | 'entryNumber' | 'status' | 'postedAt'>) => {
    const nextNum = journalEntries.length + 1;
    const entryNumber = `JE-2026-${String(nextNum).padStart(3, '0')}`;
    const newEntry: JournalEntry = {
      ...entry,
      id: `je-${Date.now()}`,
      entryNumber,
      status: 'POSTED',
      postedAt: new Date().toISOString()
    };
    setJournalEntries([newEntry, ...journalEntries]);
    recordAudit('JOURNAL_POSTED', 'FINANCE', `Posted entry ${entryNumber}: ${entry.description}`);
    triggerToast(`Journal Entry ${entryNumber} successfully posted to General Ledger.`);
  };

  const handleAddInvoice = (inv: Omit<CustomerInvoice, 'id' | 'invoiceNumber' | 'paidAmount' | 'balanceDue' | 'status'>) => {
    const nextNum = 1000 + invoices.length + 1;
    const invoiceNumber = `INV-2026-${nextNum}`;
    const newInvoice: CustomerInvoice = {
      ...inv,
      id: `inv-${Date.now()}`,
      invoiceNumber,
      paidAmount: 0,
      balanceDue: inv.totalAmount,
      status: 'SENT'
    };
    setInvoices([newInvoice, ...invoices]);

    handleAddJournalEntry({
      date: inv.issueDate,
      description: `Invoice ${invoiceNumber} issued to ${inv.customerName}`,
      lines: [
        { accountId: '1020', accountName: 'Accounts Receivable', debit: inv.totalAmount, credit: 0, memo: invoiceNumber },
        { accountId: '4010', accountName: 'Operating Sales Revenue', debit: 0, credit: inv.totalAmount, memo: inv.customerName }
      ],
      sourceModule: 'AR_BILLING',
      createdBy: activeUser?.fullName ?? ''
    });

    recordAudit('INVOICE_CREATED', 'FINANCE', `Issued customer invoice ${invoiceNumber} for $${inv.totalAmount.toFixed(2)} to ${inv.customerName}`);
    triggerToast(`Invoice ${invoiceNumber} created & posted to Accounts Receivable.`);
  };

  const handlePayInvoice = (invoiceId: string, amount: number) => {
    setInvoices(invoices.map((inv) => {
      if (inv.id !== invoiceId) return inv;
      const newPaid = inv.paidAmount + amount;
      const newBal = Math.max(0, inv.totalAmount - newPaid);
      const newStatus = newBal === 0 ? 'PAID' : 'PARTIALLY_PAID';
      
      handleAddJournalEntry({
        date: new Date().toISOString().split('T')[0],
        description: `Customer payment received for ${inv.invoiceNumber} (${inv.customerName})`,
        lines: [
          { accountId: '1010', accountName: 'Cash and Operating Bank', debit: amount, credit: 0, memo: inv.invoiceNumber },
          { accountId: '1020', accountName: 'Accounts Receivable', debit: 0, credit: amount, memo: 'Payment clear' }
        ],
        sourceModule: 'AR_BILLING',
        createdBy: activeUser?.fullName ?? ''
      });

      recordAudit('PAYMENT_RECEIVED', 'FINANCE', `Settled $${amount.toFixed(2)} against invoice ${inv.invoiceNumber}`);
      return {
        ...inv,
        paidAmount: newPaid,
        balanceDue: newBal,
        status: newStatus
      };
    }));
    triggerToast(`Payment of $${amount.toFixed(2)} recorded.`);
  };

  const handleAddBill = (bill: Omit<VendorBill, 'id' | 'billNumber' | 'paidAmount' | 'balanceDue' | 'status'>) => {
    const nextNum = 400 + bills.length + 1;
    const billNumber = `BILL-2026-${nextNum}`;
    const newBill: VendorBill = {
      ...bill,
      id: `bill-${Date.now()}`,
      billNumber,
      paidAmount: 0,
      balanceDue: bill.amount,
      status: 'APPROVED'
    };
    setBills([newBill, ...bills]);

    handleAddJournalEntry({
      date: bill.billDate,
      description: `Vendor Bill ${billNumber} from ${bill.vendorName} (${bill.category})`,
      lines: [
        { accountId: '5010', accountName: 'Cost of Goods Sold (COGS)', debit: bill.amount, credit: 0, memo: billNumber },
        { accountId: '2010', accountName: 'Accounts Payable', debit: 0, credit: bill.amount, memo: bill.vendorName }
      ],
      sourceModule: 'AP_VENDOR',
      createdBy: activeUser?.fullName ?? ''
    });

    recordAudit('BILL_APPROVED', 'FINANCE', `Approved vendor bill ${billNumber} for $${bill.amount.toFixed(2)} from ${bill.vendorName}`);
    triggerToast(`Vendor Bill ${billNumber} approved for payment.`);
  };

  const handlePayBill = (billId: string, amount: number) => {
    setBills(bills.map((bill) => {
      if (bill.id !== billId) return bill;
      const newPaid = bill.paidAmount + amount;
      const newBal = Math.max(0, bill.amount - newPaid);

      handleAddJournalEntry({
        date: new Date().toISOString().split('T')[0],
        description: `Disbursement to vendor ${bill.vendorName} for ${bill.billNumber}`,
        lines: [
          { accountId: '2010', accountName: 'Accounts Payable', debit: amount, credit: 0, memo: bill.billNumber },
          { accountId: '1010', accountName: 'Cash and Operating Bank', debit: 0, credit: amount, memo: 'EFT Wire' }
        ],
        sourceModule: 'AP_VENDOR',
        createdBy: activeUser?.fullName ?? ''
      });

      recordAudit('BILL_DISBURSED', 'FINANCE', `Disbursed $${amount.toFixed(2)} to vendor ${bill.vendorName} for ${bill.billNumber}`);
      return {
        ...bill,
        paidAmount: newPaid,
        balanceDue: newBal,
        status: newBal === 0 ? 'PAID' : 'APPROVED'
      };
    }));
    triggerToast(`Disbursed $${amount.toFixed(2)} to vendor.`);
  };

  // --- HR HANDLERS ---
  const handleAddEmployee = (empData: Omit<Employee, 'id' | 'employeeCode' | 'paidLeaveBalance'>) => {
    const nextCode = `EMP-01${String(employees.length + 1).padStart(2, '0')}`;
    const newEmp: Employee = {
      ...empData,
      id: `emp-${Date.now()}`,
      employeeCode: nextCode,
      paidLeaveBalance: 20
    };
    setEmployees([...employees, newEmp]);
    recordAudit('EMPLOYEE_ONBOARDED', 'HR', `Onboarded employee ${newEmp.firstName} ${newEmp.lastName} (${nextCode}) in ${newEmp.department}`);
    triggerToast(`Employee ${newEmp.firstName} ${newEmp.lastName} onboarded as ${nextCode}.`);
  };

  const handleApproveLeave = (leaveId: string) => {
    const req = leaveRequests.find(l => l.id === leaveId);
    if (!req) return;

    setLeaveRequests(leaveRequests.map(l => l.id === leaveId ? { ...l, status: 'APPROVED' } : l));
    setEmployees(employees.map(emp => {
      if (emp.id === req.employeeId) {
        return {
          ...emp,
          paidLeaveBalance: Math.max(0, emp.paidLeaveBalance - req.days)
        };
      }
      return emp;
    }));
    recordAudit('LEAVE_APPROVED', 'HR', `Approved ${req.days}-day ${req.leaveType} leave for ${req.employeeName}`);
    triggerToast(`Leave request for ${req.employeeName} approved.`);
  };

  const handleRejectLeave = (leaveId: string) => {
    const req = leaveRequests.find(l => l.id === leaveId);
    setLeaveRequests(leaveRequests.map(l => l.id === leaveId ? { ...l, status: 'REJECTED' } : l));
    recordAudit('LEAVE_REJECTED', 'HR', `Rejected leave request for ${req ? req.employeeName : leaveId}`);
    triggerToast('Leave request rejected.');
  };

  const handlePostPayrollToGL = (payrollRun: PayrollRun) => {
    handleAddJournalEntry({
      date: new Date().toISOString().split('T')[0],
      description: `Monthly Payroll Run Disbursed (${payrollRun.payPeriod}) for ${payrollRun.payslips.length} Employees`,
      lines: [
        { 
          accountId: '5020', 
          accountName: 'Salaries and Employee Wages', 
          debit: payrollRun.totalGross, 
          credit: 0, 
          memo: `Gross Wages (${payrollRun.payPeriod})` 
        },
        { 
          accountId: '2030', 
          accountName: 'Statutory Taxes Payable', 
          debit: 0, 
          credit: payrollRun.totalDeductions, 
          memo: 'Withheld Income Tax & Pension' 
        },
        { 
          accountId: '1010', 
          accountName: 'Cash and Operating Bank', 
          debit: 0, 
          credit: payrollRun.totalNetPay, 
          memo: 'Direct Deposit Net Payroll' 
        }
      ],
      sourceModule: 'PAYROLL',
      createdBy: activeUser?.fullName ?? ''
    });

    setPayrollRuns([...payrollRuns, { ...payrollRun, status: 'POSTED_TO_GL' }]);
    recordAudit('PAYROLL_POSTED_TO_GL', 'HR', `Executed payroll for ${payrollRun.payPeriod}: Total Gross $${payrollRun.totalGross.toFixed(2)}`);
    triggerToast(`Payroll for ${payrollRun.payPeriod} posted to General Ledger: $${payrollRun.totalGross.toFixed(2)}.`);
  };

  // --- INVENTORY HANDLERS ---
  const handleRecordMovement = ({
    itemId,
    type,
    quantity,
    referenceNumber,
    reason,
    performedBy
  }: {
    itemId: string;
    type: any;
    quantity: number;
    referenceNumber: string;
    reason: string;
    performedBy: string;
  }) => {
    const targetItem = inventory.find(i => i.id === itemId);
    if (!targetItem) return;

    const { updatedItem, movement } = processStockMovement(
      targetItem,
      type,
      quantity,
      referenceNumber,
      reason,
      performedBy
    );

    setInventory(inventory.map(i => i.id === itemId ? updatedItem : i));
    setStockMovements([movement, ...stockMovements]);

    if (type === 'STOCK_IN') {
      const costValue = quantity * targetItem.unitCost;
      handleAddJournalEntry({
        date: new Date().toISOString().split('T')[0],
        description: `Inventory Stock In: ${quantity} x ${targetItem.sku} (${referenceNumber})`,
        lines: [
          { accountId: '1030', accountName: 'Merchandise Inventory Asset', debit: costValue, credit: 0, memo: targetItem.sku },
          { accountId: '2010', accountName: 'Accounts Payable', debit: 0, credit: costValue, memo: 'Stock Procurement' }
        ],
        sourceModule: 'INVENTORY',
        createdBy: performedBy
      });
    }

    recordAudit('STOCK_MOVEMENT', 'INVENTORY', `${type} for ${targetItem.sku} (${quantity} units, Ref: ${referenceNumber})`);
    triggerToast(`Stock ${type.replace('_', ' ')} recorded for ${targetItem.sku}. Current stock: ${updatedItem.currentStock}.`);
  };

  const handleQuickReorder = (itemId: string, qty: number) => {
    handleRecordMovement({
      itemId,
      type: 'STOCK_IN',
      quantity: qty,
      referenceNumber: `PO-${Date.now().toString().slice(-4)}`,
      reason: 'Automated reorder replenishment triggered',
      performedBy: activeUser?.fullName ?? ''
    });
  };

  // --- STUDENTS & ADMISSIONS HANDLERS ---
  const handleAddApplicant = (applicantData: Omit<AdmissionApplicant, 'id' | 'applicationNumber'>) => {
    const appNum = `APP-2026-${String(100 + applicants.length + 1).padStart(4, '0')}`;
    const newApp: AdmissionApplicant = {
      ...applicantData,
      id: `app-${Date.now()}`,
      applicationNumber: appNum
    };
    setApplicants([newApp, ...applicants]);
    recordAudit('APPLICANT_SUBMITTED', 'SECURITY_ADMIN', `Admissions intake registered: ${newApp.firstName} ${newApp.lastName} (${appNum}) for ${newApp.targetGrade}`);
    triggerToast(`Application ${appNum} for ${newApp.firstName} ${newApp.lastName} submitted.`);
  };

  const handleUpdateApplicantStatus = (applicantId: string, newStatus: AdmissionStatus) => {
    const target = applicants.find(a => a.id === applicantId);
    setApplicants(applicants.map(a => a.id === applicantId ? { ...a, status: newStatus } : a));
    recordAudit('ADMISSION_STATUS_UPDATED', 'SECURITY_ADMIN', `Applicant ${target ? target.applicationNumber : applicantId} transitioned to ${newStatus}`);
    triggerToast(`Applicant status updated to ${newStatus.replace('_', ' ')}.`);
  };

  const handleEnrollApplicant = (applicantId: string, targetSection: string) => {
    const applicant = applicants.find(a => a.id === applicantId);
    if (!applicant) return;

    const newStudent = convertApplicantToStudent(applicant, targetSection, 'Snapper Hill Main Campus', 40 + students.length + 1);
    setStudents([newStudent, ...students]);
    setApplicants(applicants.map(a => a.id === applicantId ? { ...a, status: 'ENROLLED' } : a));

    recordAudit('STUDENT_ENROLLED', 'SECURITY_ADMIN', `Enrolled student ${newStudent.firstName} ${newStudent.lastName} with ID ${newStudent.studentId} in ${newStudent.gradeLevel}-${newStudent.section}`);
    triggerToast(`Learner ${newStudent.firstName} ${newStudent.lastName} enrolled as ${newStudent.studentId}.`);
  };

  const handleIssueTuitionInvoice = (student: StudentProfile) => {
    const primaryGuardian = student.guardians.find(g => g.isPrimary) || student.guardians[0];
    const tuitionAmount = 450.00; // Standard term tuition & lab fee
    
    handleAddInvoice({
      customerId: student.studentId,
      customerName: `${student.firstName} ${student.lastName} (Guardian: ${primaryGuardian?.name || 'Self'})`,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      items: [
        { description: `Term Academic Tuition Fee (${student.gradeLevel})`, quantity: 1, unitPrice: 380.00, amount: 380.00 },
        { description: 'Science & Computer Laboratory Levy', quantity: 1, unitPrice: 70.00, amount: 70.00 }
      ],
      totalAmount: tuitionAmount
    });

    setCurrentView('finance');
    triggerToast(`Tuition invoice for ${student.firstName} ${student.lastName} issued in Finance A/R.`);
  };

  const handleUpdateStudentDocuments = (studentId: string, updatedDocs: StudentDocument[]) => {
    setStudents(students.map(s => s.id === studentId ? { ...s, documents: updatedDocs } : s));
  };

  const handleSaveAttendanceSession = (newRecords: StudentAttendanceRecord[], sessionDate: string, gradeLevel: string) => {
    const newStudentIds = new Set(newRecords.map(r => r.studentId));
    const filtered = attendanceRecords.filter(r => !(r.date === sessionDate && newStudentIds.has(r.studentId)));
    setAttendanceRecords([...newRecords, ...filtered]);
  };

  // --- USER MANAGEMENT HANDLERS ---
  const handleRegisterUser = (newUserData: Omit<ErpUser, 'id' | 'createdAt' | 'lastLoginAt'>) => {
    const newUser: ErpUser = {
      ...newUserData,
      id: `user-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
      lastLoginAt: 'Never'
    };
    setUsers([...users, newUser]);
    recordAudit('USER_REGISTERED', 'SECURITY_ADMIN', `Provisioned new user account @${newUser.username} with role ${newUser.role}`);
    triggerToast(`User @${newUser.username} registered successfully.`);
  };

  const handleUpdateUserRole = (userId: string, newRole: ErpSystemRole) => {
    const target = users.find(u => u.id === userId);
    setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    recordAudit('ROLE_ASSIGNED', 'SECURITY_ADMIN', `Changed role for user @${target ? target.username : userId} to ${newRole}`);
    triggerToast(`Role updated to ${newRole}.`);
  };

  const handleToggleUserStatus = (userId: string) => {
    const target = users.find(u => u.id === userId);
    const newStatus = target?.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setUsers(users.map(u => u.id === userId ? { ...u, status: newStatus } : u));
    recordAudit('USER_STATUS_CHANGED', 'SECURITY_ADMIN', `User @${target?.username} status toggled to ${newStatus}`);
    triggerToast(`User account status: ${newStatus}.`);
  };

  const lowStockCount = inventory.filter(i => i.currentStock <= i.reorderLevel).length;

  const isPortalAccount = Boolean(authAccount?.roles.some(role => ['STUDENT', 'PARENT'].includes(role)));
  useEffect(() => {
    if (!authAccount) return;
    const destination = isPortalAccount ? '/portal' : '/staff';
    if (pathname !== destination && pathname !== '/set-password' && pathname !== '/reset-password') navigate(destination, true);
  }, [authAccount, isPortalAccount]);

  if (pathname === '/set-password' || pathname === '/reset-password') {
    return <InvitationPasswordSetupPage onContinue={() => {
      navigate('/staff', true);
      setShowSignIn(true);
    }} />;
  }

  if (authLoading) return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-medium text-slate-600">Checking secure school access…</div>;

  if (authAccount) return <div className="min-h-screen bg-slate-50 font-sans">
    {isPortalAccount ? <div className="border-b border-blue-100 bg-blue-50 px-4 py-2 text-center text-xs font-semibold text-blue-900">Redeemer Student & Family Portal · Installable on your phone · Your view is limited to linked learners</div> : null}
    <OperationsWorkspace account={authAccount} csrfToken={csrfToken} busy={signOutBusy} error={authError} initialWorkspace={requestedWorkspace} onSignOut={handleSignOut} onPasswordChanged={() => setAuthAccount(current => current ? { ...current, mustResetPassword: false } : current)} />
  </div>;

  return <div className="min-h-screen bg-white font-sans">
    <Header currentView="home" onSelectView={() => { setRequestedWorkspace(undefined); setShowSignIn(false); navigate('/'); }} lowStockCount={0} onSignIn={() => openSignIn()} onPortalSignIn={openPortalSignIn} />
    <main>
      {pathname === '/staff' || (showSignIn && pathname !== '/portal') ? <SignInPage audience="STAFF" onCancel={() => { setRequestedWorkspace(undefined); setShowSignIn(false); navigate('/'); }} onSignedIn={(account, token) => { setAuthAccount(account); setCsrfToken(token); setAuthError(''); navigate(account.roles.some(role => ['STUDENT', 'PARENT'].includes(role)) ? '/portal' : '/staff', true); }} /> : pathname === '/portal' ? <SignInPage audience="PORTAL" onCancel={() => { setShowSignIn(false); navigate('/'); }} onSignedIn={(account, token) => { setAuthAccount(account); setCsrfToken(token); setAuthError(''); navigate('/portal', true); }} /> : pathname === '/apply' ? <PublicAdmissionsPage schoolCode={THE_REDEEMER_SCHOOL_INFO.schoolCode} onBack={() => navigate('/')} /> : <HomeLandingPage onSignIn={openSignIn} onPortalSignIn={openPortalSignIn} onApply={() => navigate('/apply')} />}
    </main>
  </div>;

  if (authLoading || authAccount || showSignIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        {!authAccount && <Header
          currentView="home"
          onSelectView={() => { setRequestedWorkspace(undefined); setShowSignIn(false); }}
          lowStockCount={0}
          onSignIn={() => openSignIn()}
        />}
        <main className="flex-1">
          {authLoading ? (
            <div className="grid min-h-[60vh] place-items-center text-sm font-medium text-slate-600">Checking staging sign-in…</div>
          ) : authAccount ? (
            <OperationsWorkspace account={authAccount!} csrfToken={csrfToken} busy={signOutBusy} error={authError} initialWorkspace={requestedWorkspace} onSignOut={handleSignOut} onPasswordChanged={() => setAuthAccount(current => current ? { ...current, mustResetPassword: false } : current)} />
          ) : showSignIn ? (
            <SignInPage
              onCancel={() => { setRequestedWorkspace(undefined); setShowSignIn(false); }}
              onSignedIn={(account, token) => {
                setAuthAccount(account);
                setCsrfToken(token);
                setAuthError('');
              }}
            />
          ) : null}
        </main>
        {authAccount && <div className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500">Staging environment · Academic setup and attendance workflows are connected to persistent school records</div>}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 border border-slate-700 animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <Header
        currentView={currentView}
        onSelectView={setCurrentView}
        lowStockCount={lowStockCount}
        onSignIn={() => openSignIn()}
      />

      {/* Main Content Area */}
      <main className={`flex-1 ${currentView === 'home' ? 'w-full' : 'max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6'}`}>
        {currentView === 'home' && <HomeLandingPage onSignIn={openSignIn} onPortalSignIn={openPortalSignIn} onApply={() => navigate('/apply')} />}
        {currentView === 'dashboard' && (
          <DashboardView
            onNavigate={setCurrentView}
            journalEntries={journalEntries}
            invoices={invoices}
            bills={bills}
            employees={employees}
            leaveRequests={leaveRequests}
            payrollRuns={payrollRuns}
            inventory={inventory}
            stockMovements={stockMovements}
            students={students}
            applicants={applicants}
            onOpenNewJournalModal={() => setCurrentView('finance')}
            onOpenNewMovementModal={() => setCurrentView('inventory')}
            onOpenNewEmployeeModal={() => setCurrentView('hr')}
          />
        )}

        {currentView === 'students' && (
          <StudentsEnrollmentModule
            students={students}
            applicants={applicants}
            attendanceRecords={attendanceRecords}
            activeUserName={activeUser?.fullName ?? ''}
            activeUserRole={currentRole}
            onAddApplicant={handleAddApplicant}
            onUpdateApplicantStatus={handleUpdateApplicantStatus}
            onEnrollApplicant={handleEnrollApplicant}
            onIssueTuitionInvoice={handleIssueTuitionInvoice}
            onUpdateStudentDocuments={handleUpdateStudentDocuments}
            onSaveAttendanceSession={handleSaveAttendanceSession}
            onAuditLog={(action, details) => recordAudit(action, 'SECURITY_ADMIN', details)}
            onNotification={triggerToast}
          />
        )}

        {currentView === 'finance' && (
          <FinanceModule
            accounts={accounts}
            journalEntries={journalEntries}
            invoices={invoices}
            bills={bills}
            onAddJournalEntry={handleAddJournalEntry}
            onAddInvoice={handleAddInvoice}
            onPayInvoice={handlePayInvoice}
            onAddBill={handleAddBill}
            onPayBill={handlePayBill}
          />
        )}

        {currentView === 'hr' && (
          <HrModule
            employees={employees}
            leaveRequests={leaveRequests}
            payrollRuns={payrollRuns}
            onAddEmployee={handleAddEmployee}
            onApproveLeave={handleApproveLeave}
            onRejectLeave={handleRejectLeave}
            onPostPayrollToGL={handlePostPayrollToGL}
          />
        )}

        {currentView === 'inventory' && (
          <InventoryModule
            inventory={inventory}
            stockMovements={stockMovements}
            onRecordMovement={handleRecordMovement}
            onQuickReorder={handleQuickReorder}
          />
        )}

        {currentView === 'reports' && (
          <ReportingModule
            accounts={accounts}
            journalEntries={journalEntries}
            invoices={invoices}
            bills={bills}
            inventory={inventory}
            employees={employees}
            students={students}
          />
        )}

        {currentView === 'users' && (
          <UserManagementModule
            users={users}
            auditLogs={auditLogs}
            onRegisterUser={handleRegisterUser}
            onUpdateUserRole={handleUpdateUserRole}
            onToggleUserStatus={handleToggleUserStatus}
          />
        )}

        {currentView === 'architecture' && (
          <ArchitectureView />
        )}
      </main>

      {/* Footer */}
      {currentView !== 'home' && <footer className="border-t border-slate-200 bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900">Redeemer's International Academy ERP</span>
            <span>·</span>
            <span>Paynesville, Liberia · MoE EMIS integration not connected</span>
            <span className="hidden md:inline">·</span>
            <span className="hidden md:inline">School workspace access is being prepared</span>
          </div>
          <div>
            <span className="font-medium text-slate-600">No demo records loaded · Database-backed sign-in and workflows are not enabled yet</span>
          </div>
        </div>
      </footer>}
    </div>
  );
}
