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
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [authError, setAuthError] = useState('');

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
      setShowSignIn(false);
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
  const [leaveRequests, setLeaveReq