/**
 * ERP Human Resources Logic: Employee Management, Leaves, and Payroll Calculation.
 */

export interface Employee {
  id: string;
  employeeCode: string; // e.g. "EMP-0104"
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: 'Engineering' | 'Finance' | 'Operations' | 'Sales & Marketing' | 'Human Resources' | 'Administration' | 'Academics';
  designation: string;
  hireDate: string;
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';
  baseSalary: number; // Monthly base
  allowances: number;
  bankAccount: string;
  status: 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
  paidLeaveBalance: number; // Days
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: 'ANNUAL' | 'SICK' | 'MATERNITY_PATERNITY' | 'UNPAID';
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  appliedDate: string;
  approvedBy?: string;
}

export interface PayslipItem {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  baseSalary: number;
  allowances: number;
  grossPay: number;
  incomeTax: number;       // e.g. 15%
  pensionContribution: number; // e.g. 6%
  healthInsurance: number;     // e.g. fixed or 2%
  totalDeductions: number;
  netPay: number;
  status: 'DRAFT' | 'APPROVED' | 'DISBURSED';
}

export interface PayrollRun {
  id: string;
  payPeriod: string; // e.g. "October 2026"
  runDate: string;
  totalGross: number;
  totalDeductions: number;
  totalNetPay: number;
  status: 'DRAFT' | 'POSTED_TO_GL';
  payslips: PayslipItem[];
  journalEntryId?: string;
}

export function calculateEmployeePayroll(emp: Employee): PayslipItem {
  const grossPay = Math.round((emp.baseSalary + emp.allowances) * 100) / 100;
  // Standard statutory rates
  const incomeTax = Math.round(grossPay * 0.15 * 100) / 100;
  const pensionContribution = Math.round(grossPay * 0.06 * 100) / 100;
  const healthInsurance = 120.00; // Standard monthly group plan
  const totalDeductions = Math.round((incomeTax + pensionContribution + healthInsurance) * 100) / 100;
  const netPay = Math.round((grossPay - totalDeductions) * 100) / 100;

  return {
    employeeId: emp.id,
    employeeCode: emp.employeeCode,
    employeeName: `${emp.firstName} ${emp.lastName}`,
    department: emp.department,
    baseSalary: emp.baseSalary,
    allowances: emp.allowances,
    grossPay,
    incomeTax,
    pensionContribution,
    healthInsurance,
    totalDeductions,
    netPay,
    status: 'DRAFT'
  };
}

export function generatePayrollRun(employees: Employee[], payPeriod: string): PayrollRun {
  const activeEmployees = employees.filter(e => e.status !== 'TERMINATED');
  const payslips = activeEmployees.map(calculateEmployeePayroll);

  const totalGross = Math.round(payslips.reduce((sum, p) => sum + p.grossPay, 0) * 100) / 100;
  const totalDeductions = Math.round(payslips.reduce((sum, p) => sum + p.totalDeductions, 0) * 100) / 100;
  const totalNetPay = Math.round(payslips.reduce((sum, p) => sum + p.netPay, 0) * 100) / 100;

  return {
    id: `pr-${Date.now()}`,
    payPeriod,
    runDate: new Date().toISOString().split('T')[0],
    totalGross,
    totalDeductions,
    totalNetPay,
    status: 'DRAFT',
    payslips
  };
}
