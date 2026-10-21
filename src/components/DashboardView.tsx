import React from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  Users, 
  Package, 
  AlertTriangle, 
  PlusCircle, 
  FileCheck2, 
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  GraduationCap,
  BookOpen,
  Calendar,
  Building,
  School
} from 'lucide-react';
import { JournalEntry, CustomerInvoice, VendorBill } from '../logic/erpFinance.ts';
import { Employee, LeaveRequest, PayrollRun } from '../logic/erpHr.ts';
import { InventoryItem, StockMovement } from '../logic/erpInventory.ts';
import { StudentProfile, AdmissionApplicant } from '../logic/students.ts';
import { THE_REDEEMER_SCHOOL_INFO } from '../data/schoolProfile.ts';
import { ERPView } from './Header.tsx';

interface DashboardViewProps {
  onNavigate: (view: ERPView) => void;
  journalEntries: JournalEntry[];
  invoices: CustomerInvoice[];
  bills: VendorBill[];
  employees: Employee[];
  leaveRequests: LeaveRequest[];
  payrollRuns: PayrollRun[];
  inventory: InventoryItem[];
  stockMovements: StockMovement[];
  students?: StudentProfile[];
  applicants?: AdmissionApplicant[];
  onOpenNewJournalModal: () => void;
  onOpenNewMovementModal: () => void;
  onOpenNewEmployeeModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  journalEntries,
  invoices,
  bills,
  employees,
  leaveRequests,
  inventory,
  stockMovements,
  students = [],
  applicants = [],
  onOpenNewJournalModal,
  onOpenNewMovementModal,
  onOpenNewEmployeeModal
}) => {
  // Financial metrics
  const cashAccounts = ['1010'];
  let totalCash = 0;
  for (const je of journalEntries) {
    if (je.status !== 'POSTED') continue;
    for (const l of je.lines) {
      if (cashAccounts.includes(l.accountId)) {
        totalCash += (l.debit - l.credit);
      }
    }
  }

  const openAR = invoices
    .filter(i => i.status !== 'PAID')
    .reduce((sum, i) => sum + i.balanceDue, 0);

  const openAP = bills
    .filter(b => b.status !== 'PAID')
    .reduce((sum, b) => sum + b.balanceDue, 0);

  // Inventory valuation
  const inventoryValue = inventory.reduce((sum, item) => sum + (item.currentStock * item.unitCost), 0);
  const lowStockItems = inventory.filter(i => i.currentStock <= i.reorderLevel);

  // HR metrics
  const activeStaff = employees.filter(e => e.status === 'ACTIVE').length;
  const pendingLeaves = leaveRequests.filter(l => l.status === 'PENDING').length;
  const monthlySalaryBudget = employees
    .filter(e => e.status === 'ACTIVE')
    .reduce((sum, e) => sum + e.baseSalary + e.allowances, 0);

  // Admissions metrics
  const acceptedApplicants = applicants.filter(a => a.status === 'ACCEPTED').length;
  const pendingApplicants = applicants.filter(a => a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW').length;

  return (
    <div className="space-y-6">
      {/* Redeemer School Institutional Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-2xl p-6 shadow-sm border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-amber-400 text-slate-950 rounded-md">
                Prototype Preview
              </span>
              <span className="text-xs text-slate-300 font-mono">
                MoE EMIS connection: Not configured
              </span>
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {THE_REDEEMER_SCHOOL_INFO.formalName}
            </h1>
            
            <p className="text-xs sm:text-sm text-slate-300 italic flex items-center gap-1.5">
              <span>"{THE_REDEEMER_SCHOOL_INFO.motto}"</span>
              {THE_REDEEMER_SCHOOL_INFO.campuses.length > 0 && <span className="not-italic text-slate-400">· {THE_REDEEMER_SCHOOL_INFO.campuses.map(campus => campus.name).join(' · ')}</span>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => onNavigate('students')}
              className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
            >
              <GraduationCap className="w-4 h-4" />
              Admissions & Students
            </button>
            <button
              onClick={onOpenNewJournalModal}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-emerald-400" />
              Post Journal Voucher
            </button>
            <button
              onClick={onOpenNewMovementModal}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
            >
              <Package className="w-4 h-4 text-blue-400" />
              School Store Stock
            </button>
            <button
              onClick={onOpenNewEmployeeModal}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
            >
              <Users className="w-4 h-4 text-purple-400" />
              New Faculty / Staff
            </button>
          </div>
        </div>

        {/* Current Academic Term Indicator Ribbon */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-300">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 font-medium">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              Academic Year: <strong className="text-white font-semibold">{THE_REDEEMER_SCHOOL_INFO.academicYear}</strong>
            </span>
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1.5 font-medium">
              <School className="w-3.5 h-3.5 text-blue-400" />
              Active Session: <strong className="text-white font-semibold">{THE_REDEEMER_SCHOOL_INFO.currentTerm}</strong>
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-emerald-400 font-medium">
              Finance preview · no payment provider connected
            </span>
          </div>

          <div className="text-[11px] text-slate-400">
            Superintendent: <strong>{THE_REDEEMER_SCHOOL_INFO.principal}</strong>
          </div>
        </div>
      </div>

      {/* 5 Core School Operations KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* KPI 1: Students & Admissions */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Enrolled Students
            </span>
            <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {students.length} <span className="text-xs font-normal text-slate-500">Learners</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              <span>{pendingApplicants} Applicants in Intake</span>
              {acceptedApplicants > 0 && (
                <span className="text-emerald-700 font-medium block">· {acceptedApplicants} Ready to Enroll</span>
              )}
            </div>
          </div>
          <button 
            onClick={() => onNavigate('students')}
            className="mt-3 text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
          >
            Manage Student Body <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* KPI 2: Liquid Operating Cash */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Bursar Operating Fund
            </span>
            <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              ${totalCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
              <span>Acct 1010</span>
              <span>·</span>
              <span className="text-emerald-700 font-medium">No reconciled balance available</span>
            </div>
          </div>
          <button 
            onClick={() => onNavigate('finance')}
            className="mt-3 text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
          >
            Open General Ledger <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* KPI 3: Tuition Dues vs Vendor Bills */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tuition A/R vs A/P
            </span>
            <div className="p-1.5 bg-amber-50 rounded-lg text-amber-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 space-y-1">
            <div className="flex justify-between items-baseline text-xs">
              <span className="text-slate-500">Tuition Due:</span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                ${openAR.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between items-baseline text-xs">
              <span className="text-slate-500">Vendor A/P:</span>
              <span className="font-mono tabular-nums font-bold text-rose-700">
                ${openAP.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          <button 
            onClick={() => onNavigate('finance')}
            className="mt-3 text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
          >
            Tuition Invoices & Bills <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* KPI 4: Faculty & Staff Payroll */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Faculty & Staff
            </span>
            <div className="p-1.5 bg-purple-50 rounded-lg text-purple-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {activeStaff} <span className="text-xs font-normal text-slate-500">Teachers & Admin</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <span>Payroll:</span>
              <span className="font-mono tabular-nums font-semibold text-slate-700">
                ${monthlySalaryBudget.toLocaleString('en-US')} / mo
              </span>
            </div>
          </div>
          <button 
            onClick={() => onNavigate('hr')}
            className="mt-3 text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
          >
            Faculty Directory & Payroll <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* KPI 5: School Store & Supplies */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Store & Supplies
            </span>
            <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              ${inventoryValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <span>{inventory.length} Stock SKUs</span>
              <span>·</span>
              {lowStockItems.length > 0 ? (
                <span className="text-amber-700 font-semibold flex items-center gap-0.5">
                  <AlertTriangle className="w-3 h-3 inline" /> {lowStockItems.length} Low Stock
                </span>
              ) : (
                <span className="text-emerald-700 font-medium">All Stocks Nominal</span>
              )}
            </div>
          </div>
          <button 
            onClick={() => onNavigate('inventory')}
            className="mt-3 text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
          >
            Textbooks & Supplies <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main 2-Column Section: Operational Feed & Quick Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Recent General Ledger Postings */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-slate-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Redeemer's International Academy — Recent Ledger Activity
              </h2>
            </div>
            <button 
              onClick={() => onNavigate('finance')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              View Full Bursary Ledger
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {journalEntries.slice(0, 5).map((entry) => {
              const debitTotal = entry.lines.reduce((s, l) => s + l.debit, 0);
              return (
                <div key={entry.id} className="p-4 hover:bg-slate-50/75 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold font-mono text-slate-900">
                          {entry.entryNumber}
                        </span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs text-slate-500">{entry.date}</span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-sm">
                          {entry.sourceModule}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-800 mt-1">
                        {entry.description}
                      </p>
                      <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                        <span>Created by {entry.createdBy}</span>
                        <span>·</span>
                        <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
                          <CheckCircle2 className="w-3 h-3 inline" /> Simulated in preview
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold font-mono tabular-nums text-slate-900">
                        ${debitTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {entry.lines.length} double-entry lines
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col: Campus Store Reorder Watch & MoE EMIS Readiness */}
        <div className="space-y-6">
          {/* Low Stock Watchlist */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                Store Reorder Thresholds
              </h3>
              <button
                onClick={() => onNavigate('inventory')}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                Store Catalog
              </button>
            </div>

            <div className="mt-3 space-y-2.5">
              {inventory.slice(0, 4).map((item) => (
                <div key={item.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50">
                  <div className="truncate pr-2">
                    <span className="font-mono font-bold text-slate-900 block truncate">
                      {item.sku}
                    </span>
                    <span className="text-[11px] text-slate-500 block truncate">
                      {item.name}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`font-mono font-bold ${
                      item.currentStock <= item.reorderLevel ? 'text-amber-700' : 'text-slate-800'
                    }`}>
                      {item.currentStock} {item.unitOfMeasure}
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      Min: {item.reorderLevel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ministry of Education EMIS & Compliance Status */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl p-4 shadow-sm border border-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                MoE EMIS Readiness · Not Connected
              </span>
            </div>
            <h4 className="text-sm font-bold text-white">
              MoE reporting integration is not verified
            </h4>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              This preview uses sample records. No official MoE integration, credential verification, or submission connection is configured.
            </p>
            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
              <span>Status: <strong className="text-amber-300">Not connected or verified</strong></span>
              <button
                onClick={() => onNavigate('reports')}
                className="text-amber-300 hover:text-amber-200 font-bold underline cursor-pointer"
              >
                View MoE Reports
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
