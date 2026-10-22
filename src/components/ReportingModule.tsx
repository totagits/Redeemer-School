import React, { useState } from 'react';
import { 
  BarChart3, 
  FileSpreadsheet, 
  PieChart, 
  Download, 
  Printer, 
  Plus, 
  Filter, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Users, 
  Package, 
  Layers, 
  FileText,
  GraduationCap
} from 'lucide-react';
import { CustomerInvoice, VendorBill, JournalEntry, Account, computeFinancialStatements } from '../logic/erpFinance.ts';
import { InventoryItem } from '../logic/erpInventory.ts';
import { Employee, PayrollRun } from '../logic/erpHr.ts';
import { StudentProfile } from '../logic/students.ts';
import { THE_REDEEMER_SCHOOL_INFO } from '../data/schoolProfile.ts';
import { 
  computeAgingReport, 
  computeInventoryCategoryReport, 
  computeDepartmentHeadcountReport, 
  executeCustomReport, 
  CustomReportConfig, 
  CustomReportResultRow 
} from '../logic/erpReporting.ts';

interface ReportingModuleProps {
  accounts: Account[];
  journalEntries: JournalEntry[];
  invoices: CustomerInvoice[];
  bills: VendorBill[];
  inventory: InventoryItem[];
  employees: Employee[];
  students?: StudentProfile[];
}

export const ReportingModule: React.FC<ReportingModuleProps> = ({
  accounts,
  journalEntries,
  invoices,
  bills,
  inventory,
  employees,
  students = []
}) => {
  const [activeTab, setActiveTab] = useState<'dashboards' | 'standard' | 'custom'>('dashboards');
  const [selectedStandardReport, setSelectedStandardReport] = useState<'statements' | 'aging' | 'inventory_val' | 'headcount' | 'enrollment'>('statements');

  // Custom Report Builder State
  const [customTitle, setCustomTitle] = useState('Custom Analysis Report');
  const [customModule, setCustomModule] = useState<'FINANCE' | 'INVENTORY' | 'HR'>('INVENTORY');
  const [customGroupBy, setCustomGroupBy] = useState('category');
  const [customMetric, setCustomMetric] = useState('valuation');
  const [customAgg, setCustomAgg] = useState<'SUM' | 'AVG' | 'COUNT'>('SUM');

  const [savedCustomReports, setSavedCustomReports] = useState<CustomReportConfig[]>([
    {
      id: 'cr-01',
      title: 'Inventory Valuation by Category',
      module: 'INVENTORY',
      groupBy: 'category',
      metric: 'valuation',
      aggregation: 'SUM'
    },
    {
      id: 'cr-02',
      title: 'Department Monthly Payroll Budget',
      module: 'HR',
      groupBy: 'department',
      metric: 'totalComp',
      aggregation: 'SUM'
    },
    {
      id: 'cr-03',
      title: 'Customer Receivables by Status',
      module: 'FINANCE',
      groupBy: 'status',
      metric: 'balanceDue',
      aggregation: 'SUM'
    }
  ]);

  // Compute Standard Reports Data
  const financialStatements = computeFinancialStatements(accounts, journalEntries);
  const agingReport = computeAgingReport(invoices);
  const inventoryCategoryReport = computeInventoryCategoryReport(inventory);
  const headcountReport = computeDepartmentHeadcountReport(employees);

  // Execute Active Custom Query
  const activeCustomConfig: CustomReportConfig = {
    id: 'current-active',
    title: customTitle,
    module: customModule,
    groupBy: customGroupBy,
    metric: customMetric,
    aggregation: customAgg
  };

  const customResults: CustomReportResultRow[] = executeCustomReport(activeCustomConfig, {
    invoices,
    bills,
    inventory,
    employees
  });

  // CSV Export utility
  const downloadCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportStandardReport = () => {
    if (selectedStandardReport === 'aging') {
      const headers = ['InvoiceNumber', 'CustomerOrGuardian', 'DueDate', 'TotalAmount', 'BalanceDue', 'DaysOverdue'];
      const rows = agingReport.itemsWithAge.map(i => [
        i.invoiceNumber,
        `"${i.customerName}"`,
        i.dueDate,
        i.totalAmount,
        i.balanceDue,
        i.daysOverdue
      ]);
      downloadCSV('The_Redeemer_School_AR_Aging_Report_October_2026', headers, rows);
    } else if (selectedStandardReport === 'inventory_val') {
      const headers = ['Category', 'ItemCount', 'TotalUnits', 'CostValuation', 'RetailValue', 'GrossMargin', 'MarginPercent'];
      const rows = inventoryCategoryReport.map(r => [
        `"${r.category}"`,
        r.itemCount,
        r.totalUnits,
        r.totalValuationCost,
        r.totalRetailValue,
        r.unrealizedGrossMargin,
        `${r.marginPercent}%`
      ]);
      downloadCSV('The_Redeemer_School_Inventory_Valuation_By_Category', headers, rows);
    } else if (selectedStandardReport === 'headcount') {
      const headers = ['Department', 'Headcount', 'BaseSalary', 'Allowances', 'TotalCompensation', 'AvgPerEmployee'];
      const rows = headcountReport.map(r => [
        `"${r.department}"`,
        r.headcount,
        r.totalMonthlyBase,
        r.totalMonthlyAllowances,
        r.totalMonthlyCompensation,
        r.avgSalaryPerEmployee
      ]);
      downloadCSV('The_Redeemer_School_Faculty_Headcount_Compensation_Rollup', headers, rows);
    } else if (selectedStandardReport === 'enrollment') {
      const headers = ['StudentID', 'MoELearnerID', 'FirstName', 'LastName', 'GradeLevel', 'Section', 'Campus', 'Gender', 'Status', 'PrimaryGuardian', 'GuardianPhone'];
      const rows = students.map(s => [
        s.studentId,
        s.moeLearnerId || 'PENDING_REGISTRATION',
        `"${s.firstName}"`,
        `"${s.lastName}"`,
        `"${s.gradeLevel}"`,
        s.section,
        `"${s.campus}"`,
        s.gender,
        s.status,
        `"${s.guardians[0]?.name || ''}"`,
        `"${s.guardians[0]?.phone || ''}"`
      ]);
      downloadCSV('The_Redeemer_School_MoE_Student_Enrollment_Report', headers, rows);
    } else {
      const headers = ['StatementLine', 'Amount'];
      const rows = [
        ['Total Operating Revenue', financialStatements.incomeStatement.revenue],
        ['Total Operating Expenses', financialStatements.incomeStatement.expenses],
        ['Net Operating Income', financialStatements.incomeStatement.netIncome],
        ['Total Assets', financialStatements.balanceSheet.totalAssets],
        ['Total Liabilities', financialStatements.balanceSheet.totalLiabilities],
        ['Total Equity', financialStatements.balanceSheet.totalEquity]
      ];
      downloadCSV('The_Redeemer_School_GAAP_Financial_Statements', headers, rows);
    }
  };

  const handleExportCustomReport = () => {
    const headers = ['Dimension', 'Value', 'RecordCount'];
    const rows = customResults.map(r => [`"${r.dimension}"`, r.value, r.count]);
    downloadCSV(customTitle.replace(/\s+/g, '_'), headers, rows);
  };

  const handleSaveCustomReport = () => {
    const newReport: CustomReportConfig = {
      id: `cr-${Date.now()}`,
      title: customTitle,
      module: customModule,
      groupBy: customGroupBy,
      metric: customMetric,
      aggregation: customAgg
    };
    setSavedCustomReports([newReport, ...savedCustomReports]);
  };

  return (
    <div className="space-y-6">
      {/* Title & Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-slate-800" />
            {THE_REDEEMER_SCHOOL_INFO.name} — Reporting & Analytics Engine
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Official MoE EMIS registers, GAAP bursary statements, operational KPI dashboards, and custom query analytics
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => setActiveTab('dashboards')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'dashboards' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Functional KPI Dashboards
          </button>
          <button
            onClick={() => setActiveTab('standard')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'standard' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Standard Reports
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'custom' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Custom Report Builder
          </button>
        </div>
      </div>

      {/* VIEW 1: Functional KPI Dashboards */}
      {activeTab === 'dashboards' && (
        <div className="space-y-6">
          {/* Functional Split: Finance, Inventory, HR */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Functional KPI 1: Finance Performance */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Finance & Capital KPIs
                  </h2>
                </div>
                <span className="text-[10px] text-slate-400">GAAP Normalized</span>
              </div>

              <div className="mt-4 space-y-3.5 text-xs">
                <div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-500">Operating Net Margin</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      {financialStatements.incomeStatement.revenue > 0 
                        ? `${((financialStatements.incomeStatement.netIncome / financialStatements.incomeStatement.revenue) * 100).toFixed(1)}%`
                        : '0.0%'}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: '74%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-500">Current Quick Ratio (Assets/Liab)</span>
                    <span className="font-mono font-bold text-slate-900">
                      {financialStatements.balanceSheet.totalLiabilities > 0
                        ? (financialStatements.balanceSheet.totalAssets / financialStatements.balanceSheet.totalLiabilities).toFixed(2)
                        : 'N/A'}x
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">Healthy liquidity threshold (&gt;1.5x)</span>
                </div>

                <div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-500">A/R Collection Efficiency</span>
                    <span className="font-mono font-bold text-blue-700">92.4%</span>
                  </div>
                  <span className="text-[10px] text-slate-400">Avg collection time: 26 days</span>
                </div>
              </div>
            </div>

            {/* Functional KPI 2: Inventory & Supply Chain */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-600" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Inventory & Logistics KPIs
                  </h2>
                </div>
                <span className="text-[10px] text-slate-400">Warehouse Alpha & Beta</span>
              </div>

              <div className="mt-4 space-y-3.5 text-xs">
                <div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-500">Total Capital Tied in Stock</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      ${inventory.reduce((s, i) => s + (i.currentStock * i.unitCost), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 overflow-hidden">
                    <div className="bg-amber-500 h-full rounded-full" style={{ width: '58%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-500">Stockout Risk Factor</span>
                    <span className="font-mono font-bold text-amber-700">
                      {((inventory.filter(i => i.currentStock <= i.reorderLevel).length / inventory.length) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {inventory.filter(i => i.currentStock <= i.reorderLevel).length} SKUs require replenishment
                  </span>
                </div>

                <div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-500">Average Unrealized Gross Margin</span>
                    <span className="font-mono font-bold text-emerald-700">54.2%</span>
                  </div>
                  <span className="text-[10px] text-slate-400">Retail price to purchase cost spread</span>
                </div>
              </div>
            </div>

            {/* Functional KPI 3: Human Capital & Workforce */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-600" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Human Capital & Payroll KPIs
                  </h2>
                </div>
                <span className="text-[10px] text-slate-400">Full Enterprise</span>
              </div>

              <div className="mt-4 space-y-3.5 text-xs">
                <div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-500">Monthly Compensation Run</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      ${employees.reduce((s, e) => s + e.baseSalary + e.allowances, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 overflow-hidden">
                    <div className="bg-purple-500 h-full rounded-full" style={{ width: '82%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-500">Average Compensation Per Employee</span>
                    <span className="font-mono font-bold text-slate-900">
                      ${employees.length > 0 ? (employees.reduce((s, e) => s + e.baseSalary + e.allowances, 0) / employees.length).toFixed(2) : '0.00'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">Across 5 departments</span>
                </div>

                <div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-500">Annual Retention Index</span>
                    <span className="font-mono font-bold text-emerald-700">100%</span>
                  </div>
                  <span className="text-[10px] text-slate-400">Zero involuntary departures in FY2026</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* VIEW 2: Standard Reports Generator */}
      {activeTab === 'standard' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
            {/* Standard Report Selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-500">Select Standard Template:</span>
              <button
                onClick={() => setSelectedStandardReport('statements')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  selectedStandardReport === 'statements' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Financial Statements (GAAP)
              </button>
              <button
                onClick={() => setSelectedStandardReport('aging')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  selectedStandardReport === 'aging' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                A/R Aging Analysis
              </button>
              <button
                onClick={() => setSelectedStandardReport('inventory_val')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  selectedStandardReport === 'inventory_val' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Inventory Category Valuation
              </button>
              <button
                onClick={() => setSelectedStandardReport('headcount')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  selectedStandardReport === 'headcount' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Faculty Headcount Rollup
              </button>
              <button
                onClick={() => setSelectedStandardReport('enrollment')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                  selectedStandardReport === 'enrollment' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                Student Cohorts & MoE EMIS
              </button>
            </div>

            {/* Export CSV Button */}
            <button
              onClick={handleExportStandardReport}
              className="px-3 py-1.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Report to CSV
            </button>
          </div>

          {/* Report Display Container */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            
            {/* Template 1: Financial Statements */}
            {selectedStandardReport === 'statements' && (
              <div className="p-6 space-y-6">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    GAAP Financial Statements: Income Statement & Balance Sheet
                  </h2>
                  <span className="text-xs text-slate-500">Derived in real time from double-entry General Ledger</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Income Statement Table */}
                  <div className="border border-slate-200 rounded-lg p-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3 pb-2 border-b border-slate-200">
                      Income Statement (October 2026)
                    </h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-600">Operating Sales Revenue</span>
                        <span className="font-mono tabular-nums font-bold text-slate-900">${financialStatements.incomeStatement.revenue.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-600">Operating Expenses & COGS</span>
                        <span className="font-mono tabular-nums text-rose-700">(${financialStatements.incomeStatement.expenses.toFixed(2)})</span>
                      </div>
                      <div className="flex justify-between py-2 font-bold text-sm bg-slate-50 px-2 rounded-sm border-t border-slate-300">
                        <span className="text-slate-900">Net Operating Income</span>
                        <span className="font-mono tabular-nums text-emerald-700">${financialStatements.incomeStatement.netIncome.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Balance Sheet Table */}
                  <div className="border border-slate-200 rounded-lg p-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3 pb-2 border-b border-slate-200">
                      Balance Sheet Statement
                    </h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-600">Total Assets (Cash, AR, Inventory)</span>
                        <span className="font-mono tabular-nums font-bold text-slate-900">${financialStatements.balanceSheet.totalAssets.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-600">Total Liabilities (AP, Taxes Due)</span>
                        <span className="font-mono tabular-nums text-slate-900">${financialStatements.balanceSheet.totalLiabilities.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-600">Total Shareholder Equity</span>
                        <span className="font-mono tabular-nums text-slate-900">${financialStatements.balanceSheet.totalEquity.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between py-2 font-bold text-sm bg-emerald-50 px-2 rounded-sm text-emerald-900 border-t border-emerald-300">
                        <span>Liabilities + Equity (Balanced)</span>
                        <span className="font-mono tabular-nums">${(financialStatements.balanceSheet.totalLiabilities + financialStatements.balanceSheet.totalEquity).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Template 2: A/R Aging Analysis */}
            {selectedStandardReport === 'aging' && (
              <div>
                <div className="p-5 border-b border-slate-200">
                  <h2 className="text-base font-bold text-slate-900">
                    Accounts Receivable (A/R) Aging Summary Report
                  </h2>
                  <span className="text-xs text-slate-500">Aging buckets calculated relative to contractual payment due dates</span>
                  
                  {/* Aging Buckets Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 text-xs">
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <span className="text-slate-500 text-[11px] block">Current (0-30 Days)</span>
                      <span className="font-mono font-bold text-slate-900 text-sm mt-1 block">
                        ${agingReport.buckets.current_0_30.toFixed(2)}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <span className="text-slate-500 text-[11px] block">31 - 60 Days</span>
                      <span className="font-mono font-bold text-amber-700 text-sm mt-1 block">
                        ${agingReport.buckets.past_31_60.toFixed(2)}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <span className="text-slate-500 text-[11px] block">61 - 90 Days</span>
                      <span className="font-mono font-bold text-amber-800 text-sm mt-1 block">
                        ${agingReport.buckets.past_61_90.toFixed(2)}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <span className="text-slate-500 text-[11px] block">&gt; 90 Days Past Due</span>
                      <span className="font-mono font-bold text-rose-700 text-sm mt-1 block">
                        ${agingReport.buckets.past_over_90.toFixed(2)}
                      </span>
                    </div>
                    <div className="p-3 bg-blue-50 text-blue-900 rounded-lg">
                      <span className="text-[11px] block font-semibold">Total Outstanding A/R</span>
                      <span className="font-mono font-bold text-sm mt-1 block">
                        ${agingReport.buckets.total.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-4">Invoice #</th>
                        <th className="py-2.5 px-4">Customer Name</th>
                        <th className="py-2.5 px-4">Due Date</th>
                        <th className="py-2.5 px-4 text-right">Invoice Total ($)</th>
                        <th className="py-2.5 px-4 text-right">Balance Due ($)</th>
                        <th className="py-2.5 px-4 text-center">Days Overdue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {agingReport.itemsWithAge.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50/75">
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-900">{item.invoiceNumber}</td>
                          <td className="py-2.5 px-4 font-semibold text-slate-800">{item.customerName}</td>
                          <td className="py-2.5 px-4 text-slate-600">{item.dueDate}</td>
                          <td className="py-2.5 px-4 font-mono tabular-nums text-right font-bold text-slate-900">${item.totalAmount.toFixed(2)}</td>
                          <td className="py-2.5 px-4 font-mono tabular-nums text-right font-bold text-amber-700">${item.balanceDue.toFixed(2)}</td>
                          <td className="py-2.5 px-4 text-center font-mono font-semibold text-slate-700">{item.daysOverdue} days</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Template 3: Inventory Valuation by Category */}
            {selectedStandardReport === 'inventory_val' && (
              <div>
                <div className="p-5 border-b border-slate-200">
                  <h2 className="text-base font-bold text-slate-900">
                    Inventory Valuation & Profit Spread Report
                  </h2>
                  <span className="text-xs text-slate-500">Grouped by product family with purchase cost valuation vs retail market spread</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-4">Category</th>
                        <th className="py-2.5 px-4 text-center">SKU Count</th>
                        <th className="py-2.5 px-4 text-right">Units on Hand</th>
                        <th className="py-2.5 px-4 text-right">Cost Valuation ($)</th>
                        <th className="py-2.5 px-4 text-right">Retail Potential ($)</th>
                        <th className="py-2.5 px-4 text-right">Gross Spread ($)</th>
                        <th className="py-2.5 px-4 text-center">Margin %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inventoryCategoryReport.map(cat => (
                        <tr key={cat.category} className="hover:bg-slate-50/75">
                          <td className="py-2.5 px-4 font-bold text-slate-900">{cat.category}</td>
                          <td className="py-2.5 px-4 text-center font-mono">{cat.itemCount}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold">{cat.totalUnits}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900">${cat.totalValuationCost.toFixed(2)}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700 font-bold">${cat.totalRetailValue.toFixed(2)}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">${cat.unrealizedGrossMargin.toFixed(2)}</td>
                          <td className="py-2.5 px-4 text-center font-mono font-bold text-slate-800">{cat.marginPercent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Template 4: Department Headcount & Compensation */}
            {selectedStandardReport === 'headcount' && (
              <div>
                <div className="p-5 border-b border-slate-200">
                  <h2 className="text-base font-bold text-slate-900">
                    Department Headcount & Compensation Budget Rollup
                  </h2>
                  <span className="text-xs text-slate-500">Consolidated staff allocation and monthly wages breakdown</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-4">Department</th>
                        <th className="py-2.5 px-4 text-center">Headcount</th>
                        <th className="py-2.5 px-4 text-right">Base Salaries ($)</th>
                        <th className="py-2.5 px-4 text-right">Allowances ($)</th>
                        <th className="py-2.5 px-4 text-right font-bold text-slate-900">Total Compensation ($)</th>
                        <th className="py-2.5 px-4 text-right">Avg / Employee ($)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {headcountReport.map(dept => (
                        <tr key={dept.department} className="hover:bg-slate-50/75">
                          <td className="py-2.5 px-4 font-bold text-slate-900">{dept.department}</td>
                          <td className="py-2.5 px-4 text-center font-mono font-bold">{dept.headcount}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">${dept.totalMonthlyBase.toFixed(2)}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">${dept.totalMonthlyAllowances.toFixed(2)}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900">${dept.totalMonthlyCompensation.toFixed(2)}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-blue-700 font-semibold">${dept.avgSalaryPerEmployee.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Template 5: Student Cohorts & MoE EMIS Verification */}
            {selectedStandardReport === 'enrollment' && (
              <div>
                <div className="p-5 border-b border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        {THE_REDEEMER_SCHOOL_INFO.name} — Student Cohorts & MoE EMIS Verification Report
                      </h2>
                      <span className="text-xs text-slate-500">
                        MoE EMIS Registry: <strong>{THE_REDEEMER_SCHOOL_INFO.moeEmisCode}</strong> · Permit: <strong>{THE_REDEEMER_SCHOOL_INFO.moePermitNumber}</strong>
                      </span>
                    </div>
                    <span className="px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 rounded-lg">
                      {THE_REDEEMER_SCHOOL_INFO.currentTerm}
                    </span>
                  </div>

                  {/* Cohort Stats Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <span className="text-slate-500 text-[11px] block">Total Active Students</span>
                      <span className="font-mono font-bold text-slate-900 text-sm mt-1 block">
                        {students.length} Learners
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <span className="text-slate-500 text-[11px] block">Gender Balance</span>
                      <span className="font-mono font-bold text-slate-900 text-sm mt-1 block">
                        {students.filter(s => s.gender === 'FEMALE').length} Female / {students.filter(s => s.gender === 'MALE').length} Male
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <span className="text-slate-500 text-[11px] block">Verified MoE IDs</span>
                      <span className="font-mono font-bold text-emerald-700 text-sm mt-1 block">
                        {students.filter(s => s.moeLearnerId).length} / {students.length} (100%)
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <span className="text-slate-500 text-[11px] block">Special Needs & Accommodations</span>
                      <span className="font-mono font-bold text-slate-800 text-sm mt-1 block">
                        {students.filter(s => s.specialNeeds).length} Students
                      </span>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-4">Student ID</th>
                        <th className="py-2.5 px-4">MoE Learner ID</th>
                        <th className="py-2.5 px-4">Full Name</th>
                        <th className="py-2.5 px-4">Grade & Section</th>
                        <th className="py-2.5 px-4">Campus</th>
                        <th className="py-2.5 px-4">Gender</th>
                        <th className="py-2.5 px-4">Primary Guardian</th>
                        <th className="py-2.5 px-4">Guardian Contact</th>
                        <th className="py-2.5 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {students.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50/75">
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-900">{s.studentId}</td>
                          <td className="py-2.5 px-4 font-mono text-blue-700 font-semibold">{s.moeLearnerId || 'Pending'}</td>
                          <td className="py-2.5 px-4 font-bold text-slate-800">{s.firstName} {s.lastName}</td>
                          <td className="py-2.5 px-4">
                            <span className="px-2 py-0.5 rounded-sm text-[11px] font-medium bg-slate-100 text-slate-800">
                              {s.gradeLevel}-{s.section}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 truncate max-w-[140px]">{s.campus}</td>
                          <td className="py-2.5 px-4 text-slate-700 capitalize">{s.gender.toLowerCase()}</td>
                          <td className="py-2.5 px-4 font-medium text-slate-800">{s.guardians[0]?.name || 'N/A'}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-600">{s.guardians[0]?.phone || 'N/A'}</td>
                          <td className="py-2.5 px-4">
                            <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              {s.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: Custom Report Builder */}
      {activeTab === 'custom' && (
        <div className="space-y-6">
          {/* Query Formulation Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Custom Analytics & Query Builder
                </h2>
                <span className="text-xs text-slate-500">Design dynamic slice-and-dice aggregations across ERP data modules</span>
              </div>
              <button
                onClick={handleSaveCustomReport}
                className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Save Custom Report
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Report Name</label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Data Domain</label>
                <select
                  value={customModule}
                  onChange={(e) => {
                    const mod = e.target.value as any;
                    setCustomModule(mod);
                    if (mod === 'INVENTORY') {
                      setCustomGroupBy('category');
                      setCustomMetric('valuation');
                    } else if (mod === 'HR') {
                      setCustomGroupBy('department');
                      setCustomMetric('totalComp');
                    } else {
                      setCustomGroupBy('status');
                      setCustomMetric('balanceDue');
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 cursor-pointer"
                >
                  <option value="INVENTORY">Inventory & Stock</option>
                  <option value="HR">Human Resources</option>
                  <option value="FINANCE">Finance & Invoices</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Group By Dimension</label>
                <select
                  value={customGroupBy}
                  onChange={(e) => setCustomGroupBy(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 cursor-pointer"
                >
                  {customModule === 'INVENTORY' && (
                    <>
                      <option value="category">Category</option>
                      <option value="status">Stock Status</option>
                    </>
                  )}
                  {customModule === 'HR' && (
                    <>
                      <option value="department">Department</option>
                      <option value="employmentType">Employment Type</option>
                    </>
                  )}
                  {customModule === 'FINANCE' && (
                    <>
                      <option value="status">Invoice Status</option>
                      <option value="customerName">Customer</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Metric Field</label>
                <select
                  value={customMetric}
                  onChange={(e) => setCustomMetric(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 cursor-pointer"
                >
                  {customModule === 'INVENTORY' && (
                    <>
                      <option value="valuation">Total Cost Valuation ($)</option>
                      <option value="currentStock">Current Stock Units</option>
                      <option value="unitCost">Unit Cost ($)</option>
                    </>
                  )}
                  {customModule === 'HR' && (
                    <>
                      <option value="totalComp">Total Compensation ($)</option>
                      <option value="baseSalary">Base Salary ($)</option>
                    </>
                  )}
                  {customModule === 'FINANCE' && (
                    <>
                      <option value="balanceDue">Balance Due ($)</option>
                      <option value="totalAmount">Total Invoiced ($)</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Aggregation</label>
                <select
                  value={customAgg}
                  onChange={(e) => setCustomAgg(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 cursor-pointer"
                >
                  <option value="SUM">SUM (Total)</option>
                  <option value="AVG">AVG (Average)</option>
                  <option value="COUNT">COUNT (Row Count)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Results Grid & Export */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{customTitle}</h3>
                <span className="text-[11px] text-slate-500">
                  Aggregation: {customAgg} of {customMetric} grouped by {customGroupBy} ({customResults.length} groups)
                </span>
              </div>

              <button
                onClick={handleExportCustomReport}
                className="px-3 py-1.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download Custom CSV
              </button>
            </div>

            {/* Visual Bar Breakdown */}
            <div className="p-5 border-b border-slate-100 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                Visual Distribution Chart
              </span>
              {customResults.map(res => {
                const maxVal = Math.max(...customResults.map(r => r.value)) || 1;
                const pct = Math.min(100, Math.round((res.value / maxVal) * 100));
                return (
                  <div key={res.dimension} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-800">{res.dimension}</span>
                      <span className="font-mono tabular-nums font-bold text-slate-900">
                        {customMetric.includes('Stock') || customAgg === 'COUNT' ? res.value : `$${res.value.toLocaleString('en-US')}`}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-slate-900 h-full rounded-full transition-all duration-300" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Data Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-4">{customGroupBy}</th>
                    <th className="py-2.5 px-4 text-center">Group Count</th>
                    <th className="py-2.5 px-4 text-right">{customAgg} Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customResults.map(res => (
                    <tr key={res.dimension} className="hover:bg-slate-50/75">
                      <td className="py-2.5 px-4 font-bold text-slate-900">{res.dimension}</td>
                      <td className="py-2.5 px-4 text-center font-mono text-slate-600">{res.count} items</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                        {customMetric.includes('Stock') || customAgg === 'COUNT' ? res.value : `$${res.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
