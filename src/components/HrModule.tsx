import React, { useState } from 'react';
import { 
  Users, 
  Calendar, 
  DollarSign, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Search, 
  FileText, 
  Building, 
  Briefcase,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { Employee, LeaveRequest, PayrollRun, generatePayrollRun, calculateEmployeePayroll, PayslipItem } from '../logic/erpHr.ts';

interface HrModuleProps {
  employees: Employee[];
  leaveRequests: LeaveRequest[];
  payrollRuns: PayrollRun[];
  onAddEmployee: (emp: Omit<Employee, 'id' | 'employeeCode' | 'paidLeaveBalance'>) => void;
  onApproveLeave: (leaveId: string) => void;
  onRejectLeave: (leaveId: string) => void;
  onPostPayrollToGL: (payrollRun: PayrollRun) => void;
}

export const HrModule: React.FC<HrModuleProps> = ({
  employees,
  leaveRequests,
  payrollRuns,
  onAddEmployee,
  onApproveLeave,
  onRejectLeave,
  onPostPayrollToGL
}) => {
  const [activeTab, setActiveTab] = useState<'employees' | 'leaves' | 'payroll'>('employees');
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  
  // Modals
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [activePayslipModal, setActivePayslipModal] = useState<PayslipItem | null>(null);

  // New Employee Form State
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newDepartment, setNewDepartment] = useState<Employee['department']>('Engineering');
  const [newDesignation, setNewDesignation] = useState('');
  const [newBaseSalary, setNewBaseSalary] = useState('');
  const [newAllowances, setNewAllowances] = useState('500');

  // Staged Payroll Run
  const currentPayPeriod = 'October 2026';
  const stagedPayroll = generatePayrollRun(employees, currentPayPeriod);

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch = 
      emp.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.designation.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = departmentFilter === 'ALL' || emp.department === departmentFilter;
    return matchesSearch && matchesDept;
  });

  const handleAddEmployeeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFirstName.trim() || !newLastName.trim() || !newDesignation.trim()) return;

    onAddEmployee({
      firstName: newFirstName,
      lastName: newLastName,
      email: newEmail || `${newFirstName.toLowerCase()}.${newLastName.toLowerCase()}@enterprise-erp.com`,
      phone: newPhone || '+1 (555) 000-0000',
      department: newDepartment,
      designation: newDesignation,
      hireDate: new Date().toISOString().split('T')[0],
      employmentType: 'FULL_TIME',
      baseSalary: Number(newBaseSalary) || 6000,
      allowances: Number(newAllowances) || 0,
      bankAccount: 'US-SECURE-****8910',
      status: 'ACTIVE'
    });

    setShowAddEmployeeModal(false);
    setNewFirstName('');
    setNewLastName('');
    setNewEmail('');
    setNewPhone('');
    setNewDesignation('');
    setNewBaseSalary('');
  };

  return (
    <div className="space-y-6">
      {/* Title & Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-800" />
            The Redeemer School — Faculty & Human Resources
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Academic faculty, administrative staff directory, professional leaves, and statutory payroll processing
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => setActiveTab('employees')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'employees' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Faculty & Staff ({employees.length})
          </button>
          <button
            onClick={() => setActiveTab('leaves')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'leaves' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Leave Requests ({leaveRequests.filter(l => l.status === 'PENDING').length} Pending)
          </button>
          <button
            onClick={() => setActiveTab('payroll')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'payroll' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Payroll Processing
          </button>
        </div>
      </div>

      {/* TAB 1: Employee Directory */}
      {activeTab === 'employees' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search staff, code, role..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-400"
                />
              </div>

              {/* Department Filter */}
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                aria-label="Filter by department"
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">All Departments</option>
                <option value="Administration">Administration</option>
                <option value="Academics">Academics & Faculty</option>
                <option value="Finance">Finance & Bursary</option>
                <option value="Human Resources">Dean & HR</option>
                <option value="Operations">Operations & Grounds</option>
              </select>
            </div>

            <button
              onClick={() => setShowAddEmployeeModal(true)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Onboard Employee
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Code</th>
                    <th className="py-2.5 px-4">Employee Name</th>
                    <th className="py-2.5 px-4">Department & Role</th>
                    <th className="py-2.5 px-4">Hire Date</th>
                    <th className="py-2.5 px-4 text-right">Base Salary ($)</th>
                    <th className="py-2.5 px-4 text-center">Leave Balance</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                        {emp.employeeCode}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-slate-900">
                          {emp.firstName} {emp.lastName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-normal">
                          {emp.email}
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-slate-800">{emp.designation}</div>
                        <div className="text-[10px] text-slate-500">{emp.department}</div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 font-mono">
                        {emp.hireDate}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-right font-bold text-slate-900">
                        ${emp.baseSalary.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono font-semibold text-slate-700">
                        {emp.paidLeaveBalance} days
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                          emp.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' :
                          emp.status === 'ON_LEAVE' ? 'bg-amber-50 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {emp.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Attendance & Leave Requests */}
      {activeTab === 'leaves' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Employee Paid Leave & Absence Requests
            </h2>
            <span className="text-xs text-slate-500">
              Approvals deduct automatically from employee leave bank
            </span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Employee</th>
                    <th className="py-2.5 px-4">Leave Type</th>
                    <th className="py-2.5 px-4">Dates</th>
                    <th className="py-2.5 px-4 text-center">Duration</th>
                    <th className="py-2.5 px-4">Reason / Notes</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-center">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {leaveRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-2.5 px-4 font-bold text-slate-900">
                        {req.employeeName}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-sm">
                          {req.leaveType}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-600 text-[11px]">
                        {req.startDate} → {req.endDate}
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono font-bold text-slate-800">
                        {req.days} days
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 max-w-xs">
                        {req.reason}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                          req.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' :
                          req.status === 'REJECTED' ? 'bg-rose-50 text-rose-700' :
                          'bg-amber-50 text-amber-700'
                        }`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {req.status === 'PENDING' ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => onApproveLeave(req.id)}
                              className="px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => onRejectLeave(req.id)}
                              className="px-2 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors cursor-pointer"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">Decided</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Payroll Engine & GL Integration */}
      {activeTab === 'payroll' && (
        <div className="space-y-6">
          {/* Summary Box with Cross-Module GL Bridge */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                  Active Pay Period: {currentPayPeriod}
                </span>
                <h2 className="text-base font-bold text-slate-900 mt-0.5">
                  Monthly Compensation & Statutory Deductions
                </h2>
                <p className="text-xs text-slate-500">
                  Calculates Gross, 15% Withholding Tax, 6% Pension, and Net Take-Home Pay
                </p>
              </div>

              {/* Cross Module Action */}
              <button
                onClick={() => onPostPayrollToGL(stagedPayroll)}
                className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <DollarSign className="w-4 h-4 text-emerald-400" />
                Post Payroll to General Ledger
              </button>
            </div>

            {/* Quick KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Gross Salaries</span>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                  ${stagedPayroll.totalGross.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-slate-400">Debits Account 5020 (Salaries)</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-[11px] font-semibold text-slate-500 uppercase">Statutory Deductions (Taxes & Pension)</span>
                <div className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1">
                  ${stagedPayroll.totalDeductions.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-slate-400">Credits Account 2030 (Taxes Payable)</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-[11px] font-semibold text-slate-500 uppercase">Net Pay Disbursement</span>
                <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                  ${stagedPayroll.totalNetPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-slate-400">Credits Account 1010 (Cash/Bank)</span>
              </div>
            </div>
          </div>

          {/* Payslips Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Staff Itemized Payslips ({stagedPayroll.payslips.length} Employees)
              </h3>
              <span className="text-xs text-slate-500">
                Click "View Payslip" to inspect full tax & pension breakdown
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Employee</th>
                    <th className="py-2.5 px-4 text-right">Base ($)</th>
                    <th className="py-2.5 px-4 text-right">Gross Pay ($)</th>
                    <th className="py-2.5 px-4 text-right">Tax (15%)</th>
                    <th className="py-2.5 px-4 text-right">Pension (6%)</th>
                    <th className="py-2.5 px-4 text-right font-bold text-slate-900">Net Pay ($)</th>
                    <th className="py-2.5 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {stagedPayroll.payslips.map((ps) => (
                    <tr key={ps.employeeId} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-2.5 px-4 font-bold text-slate-900">
                        {ps.employeeName}
                        <div className="text-[10px] text-slate-400 font-mono">{ps.employeeCode} · {ps.department}</div>
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-700">
                        ${ps.baseSalary.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-right font-semibold text-slate-900">
                        ${ps.grossPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-600">
                        ${ps.incomeTax.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-600">
                        ${ps.pensionContribution.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-right font-bold text-emerald-700">
                        ${ps.netPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <button
                          onClick={() => setActivePayslipModal(ps)}
                          className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors cursor-pointer"
                        >
                          View Payslip
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add New Employee */}
      {showAddEmployeeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Onboard New Enterprise Employee
            </h3>
            
            <form onSubmit={handleAddEmployeeSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                  <select
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value as any)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                  >
                    <option value="Engineering">Engineering</option>
                    <option value="Finance">Finance</option>
                    <option value="Operations">Operations</option>
                    <option value="Sales & Marketing">Sales & Marketing</option>
                    <option value="Human Resources">Human Resources</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Designation / Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mechanical Engineer"
                    value={newDesignation}
                    onChange={(e) => setNewDesignation(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Base Salary ($)</label>
                  <input
                    type="number"
                    required
                    placeholder="7500"
                    value={newBaseSalary}
                    onChange={(e) => setNewBaseSalary(e.target.value)}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Allowances ($)</label>
                  <input
                    type="number"
                    value={newAllowances}
                    onChange={(e) => setNewAllowances(e.target.value)}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddEmployeeModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Add Employee Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Printable Official Payslip Preview */}
      {activePayslipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Vanguard ERP · Pay Period {currentPayPeriod}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  Official Employee Payslip
                </h3>
              </div>
              <button
                onClick={() => setActivePayslipModal(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Employee Name:</span>
                <span className="font-bold text-slate-900">{activePayslipModal.employeeName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Employee Code & Dept:</span>
                <span className="font-mono text-slate-800">{activePayslipModal.employeeCode} · {activePayslipModal.department}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Base Salary:</span>
                <span className="font-mono tabular-nums text-slate-900">${activePayslipModal.baseSalary.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Allowances & Benefits:</span>
                <span className="font-mono tabular-nums text-slate-900">${activePayslipModal.allowances.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1.5 font-bold text-slate-900 bg-slate-50 px-2 rounded-sm">
                <span>Total Gross Earnings:</span>
                <span className="font-mono tabular-nums">${activePayslipModal.grossPay.toFixed(2)}</span>
              </div>

              <div className="pt-2 text-slate-600">
                <span className="font-semibold block mb-1 text-[11px] text-slate-400 uppercase">Statutory Deductions</span>
                <div className="flex justify-between py-0.5 text-slate-600">
                  <span>Income Tax Withholding (15%):</span>
                  <span className="font-mono tabular-nums">(${activePayslipModal.incomeTax.toFixed(2)})</span>
                </div>
                <div className="flex justify-between py-0.5 text-slate-600">
                  <span>Social Security / Pension Contribution (6%):</span>
                  <span className="font-mono tabular-nums">(${activePayslipModal.pensionContribution.toFixed(2)})</span>
                </div>
                <div className="flex justify-between py-0.5 text-slate-600">
                  <span>Healthcare Coverage Plan:</span>
                  <span className="font-mono tabular-nums">(${activePayslipModal.healthInsurance.toFixed(2)})</span>
                </div>
              </div>

              <div className="flex justify-between py-2 border-t-2 border-slate-900 font-bold text-sm bg-emerald-50 px-2 rounded-sm text-emerald-900">
                <span>Net Disbursed Take-Home:</span>
                <span className="font-mono tabular-nums text-emerald-700">${activePayslipModal.netPay.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <button
                onClick={() => setActivePayslipModal(null)}
                className="px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Close Payslip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
