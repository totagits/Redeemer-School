import React, { useState } from 'react';
import { 
  FileCode, 
  Database, 
  ShieldCheck, 
  CheckCircle2, 
  Workflow, 
  Layers, 
  Copy, 
  Check, 
  Download 
} from 'lucide-react';

export const ArchitectureView: React.FC = () => {
  const [activeSchemaTab, setActiveSchemaTab] = useState<'finance' | 'hr' | 'inventory' | 'rbac'>('finance');
  const [copied, setCopied] = useState(false);

  const schemas = {
    finance: `// ==========================================
// 1. FINANCE MODULE DATA STRUCTURES & SCHEMAS
// ==========================================

export type AccountCategory = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

// Chart of Accounts Schema
export interface Account {
  code: string;               // Primary Key (e.g. "1010", "2010", "4010")
  name: string;               // e.g. "Cash and Operating Bank"
  category: AccountCategory;
  description: string;
  normalBalance: 'DEBIT' | 'CREDIT';
}

// General Ledger Double-Entry Line Schema
export interface JournalLine {
  accountId: string;          // Foreign Key -> Account.code
  accountName: string;
  debit: number;              // Numeric(15,2) >= 0
  credit: number;             // Numeric(15,2) >= 0
  memo?: string;
}

// Immutable Journal Entry Header Schema
export interface JournalEntry {
  id: string;                 // Primary Key (UUID)
  entryNumber: string;        // Unique Sequence (e.g. "JE-2026-001")
  date: string;               // ISO Date (YYYY-MM-DD)
  description: string;
  lines: JournalLine[];       // Enforces Constraint: SUM(debit) === SUM(credit)
  status: 'DRAFT' | 'POSTED' | 'VOIDED';
  sourceModule: 'MANUAL' | 'AR_BILLING' | 'AP_VENDOR' | 'PAYROLL' | 'INVENTORY';
  createdBy: string;
  postedAt?: string;
}

// Accounts Receivable (AR) Customer Invoice Schema
export interface CustomerInvoice {
  id: string;                 // Primary Key
  invoiceNumber: string;      // Unique (e.g. "INV-2026-1001")
  customerId: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;         // Computed: totalAmount - paidAmount
  status: 'DRAFT' | 'SENT' | 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE';
}

// Accounts Payable (AP) Vendor Bill Schema
export interface VendorBill {
  id: string;                 // Primary Key
  billNumber: string;         // Unique (e.g. "BILL-2026-401")
  vendorId: string;
  vendorName: string;
  billDate: string;
  dueDate: string;
  category: string;
  amount: number;
  paidAmount: number;
  balanceDue: number;         // Computed: amount - paidAmount
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'PAID' | 'OVERDUE';
}`,
    hr: `// ==========================================
// 2. HUMAN RESOURCES (HR) DATA STRUCTURES & SCHEMAS
// ==========================================

// Core Employee Profile Schema
export interface Employee {
  id: string;                 // Primary Key (UUID)
  employeeCode: string;       // Unique (e.g. "EMP-0101")
  firstName: string;
  lastName: string;
  email: string;              // Unique RFC 5322
  phone: string;
  department: 'Engineering' | 'Finance' | 'Operations' | 'Sales & Marketing' | 'Human Resources';
  designation: string;
  hireDate: string;           // ISO Date (YYYY-MM-DD)
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';
  baseSalary: number;         // Monthly Base Compensation
  allowances: number;         // Standard Monthly Benefits
  bankAccount: string;        // Disbursal Account Identifier
  status: 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
  paidLeaveBalance: number;   // Accrued Days Bank
}

// Paid Leave & Absence Request Schema
export interface LeaveRequest {
  id: string;                 // Primary Key
  employeeId: string;         // Foreign Key -> Employee.id
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

// Statutory Payroll Line & Disbursement Schema
export interface PayslipItem {
  employeeId: string;         // Foreign Key -> Employee.id
  employeeCode: string;
  employeeName: string;
  department: string;
  baseSalary: number;
  allowances: number;
  grossPay: number;           // baseSalary + allowances
  incomeTax: number;          // 15% Standard Withholding
  pensionContribution: number;// 6% Social Security Contribution
  healthInsurance: number;    // Group Health Plan
  totalDeductions: number;    // incomeTax + pension + health
  netPay: number;             // grossPay - totalDeductions
  status: 'DRAFT' | 'APPROVED' | 'DISBURSED';
}

// Aggregate Payroll Run Schema
export interface PayrollRun {
  id: string;                 // Primary Key
  payPeriod: string;          // e.g. "October 2026"
  runDate: string;
  totalGross: number;
  totalDeductions: number;
  totalNetPay: number;
  status: 'DRAFT' | 'POSTED_TO_GL';
  payslips: PayslipItem[];
  journalEntryId?: string;    // Foreign Key -> JournalEntry.id (GL Bridge)
}`,
    inventory: `// ==========================================
// 3. INVENTORY MANAGEMENT DATA STRUCTURES & SCHEMAS
// ==========================================

export type UnitOfMeasure = 'PCS' | 'BOX' | 'KG' | 'SET' | 'METERS';
export type MovementType = 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT' | 'TRANSFER';

// Item Master Catalog Schema
export interface InventoryItem {
  id: string;                 // Primary Key (UUID)
  sku: string;                // Unique Stock Keeping Unit (e.g. "SKU-ACT-100")
  name: string;
  category: 'Hardware' | 'Office Supplies' | 'Raw Materials' | 'Packaging' | 'Finished Goods';
  unitOfMeasure: UnitOfMeasure;
  unitCost: number;           // FIFO Purchase Valuation Cost
  sellingPrice: number;       // Catalog Sales Price
  currentStock: number;       // Physical units on hand
  reorderLevel: number;       // Safety Stock Threshold
  warehouseLocation: string;  // Aisle / Bay / Bin designation
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'; // Evaluated dynamically
}

// Immutable Stock Movement Audit Schema
export interface StockMovement {
  id: string;                 // Primary Key
  itemId: string;             // Foreign Key -> InventoryItem.id
  sku: string;
  itemName: string;
  movementType: MovementType; // IN (PO receipt), OUT (Fulfillment), ADJUSTMENT (Cycle count)
  quantity: number;           // Absolute quantity shifted
  previousStock: number;
  newStock: number;
  unitCostAtMovement: number; // For Inventory Asset ledger valuation
  referenceNumber: string;    // PO-xxxx, SO-xxxx, or Count ID
  reason: string;
  performedBy: string;
  timestamp: string;          // ISO Timestamp
}`,
    rbac: `// ==========================================
// 4. USER ROLES & PERMISSION MATRIX (RBAC)
// ==========================================

Role: Chief Financial Officer (CFO) / Controller
  - Permissions:
    * Full CRUD on General Ledger & Chart of Accounts
    * Review & Post Manual Journal Entries
    * Authorize Vendor Bill Disbursements & AP Settlements
    * Access Executive Balance Sheet, Income Statement, and Cash Flow
    * Reopen / Void audited financial periods

Role: Human Resources Director / People Operations
  - Permissions:
    * Manage Employee Directory (Onboard, update status, compensation)
    * Adjudicate Paid Leave & Absence Requests
    * Execute Monthly Payroll Runs
    * Trigger Automated Cross-Module Payroll Posting to General Ledger
    * Issue Official Employee Payslips

Role: Inventory / Warehouse Operations Manager
  - Permissions:
    * Maintain Master Item Catalog & SKU specifications
    * Record Stock Movements (Stock In, Stock Out, Cycle Counts)
    * Configure Reorder Safety Thresholds and Bay Locations
    * Generate Purchase Order Reorder Requests
    * Audit Physical Stock Discrepancies

Role: Operations Director / Executive Leadership
  - Permissions:
    * Cross-Module Operational KPI Oversight
    * Read-only inspection across GL, Workforce, and Warehouses
    * System-wide Audit Log Review`
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(schemas[activeSchemaTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-600" />
          The Redeemer School — System Architecture & Data Schema Blueprint
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Comprehensive technical outline of data models, double-entry constraints, student records, and cross-module workflows
        </p>
      </div>

      {/* 3 Core Architecture Pillars Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-blue-700 font-bold text-xs uppercase tracking-wider mb-2">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            Finance Core (GL, AR, AP)
          </div>
          <h2 className="text-sm font-bold text-slate-900">
            Double-Entry Accounting Engine
          </h2>
          <ul className="text-xs text-slate-600 mt-2 space-y-1.5 list-disc list-inside">
            <li>Strict mathematical parity: Debits equal Credits per transaction</li>
            <li>Real-time trial balance calculation directly from posted entries</li>
            <li>Direct integration with A/R billing and A/P vendor settlements</li>
            <li>GAAP automated Income Statement and Balance Sheet generation</li>
          </ul>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-purple-700 font-bold text-xs uppercase tracking-wider mb-2">
            <span className="w-2 h-2 rounded-full bg-purple-600"></span>
            HR & Workforce Engine
          </div>
          <h2 className="text-sm font-bold text-slate-900">
            People & Statutory Payroll
          </h2>
          <ul className="text-xs text-slate-600 mt-2 space-y-1.5 list-disc list-inside">
            <li>Longitudinal employee records across departments & pay tiers</li>
            <li>Leave balance bank with automated deduction on approval</li>
            <li>Calculates Gross Pay, 15% Tax, 6% Pension, and Net Disbursed</li>
            <li>Auto-posts balanced Journal Entry to GL Account 5020 and 2030</li>
          </ul>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase tracking-wider mb-2">
            <span className="w-2 h-2 rounded-full bg-amber-600"></span>
            Inventory Logistics
          </div>
          <h2 className="text-sm font-bold text-slate-900">
            Stock Tracking & Valuation
          </h2>
          <ul className="text-xs text-slate-600 mt-2 space-y-1.5 list-disc list-inside">
            <li>SKU item master with dual cost (valuation) and selling price</li>
            <li>Real-time stock state machine: In Stock, Low Stock, Out of Stock</li>
            <li>Immutable audit movement logs for PO Receipts and Shipments</li>
            <li>Inventory Asset carried directly on Balance Sheet Account 1030</li>
          </ul>
        </div>
      </div>

      {/* Cross-Module Integration Workflow Diagram */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Workflow className="w-4 h-4 text-slate-700" />
          Cross-Module Transaction Flow & Relational Linkage
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          How operational actions in HR and Inventory automatically update the Financial General Ledger:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs">
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <span className="font-bold text-slate-900 block mb-1">
              1. Payroll Run $\rightarrow$ General Ledger
            </span>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              When HR executes a monthly payroll run, the system computes Gross, Deductions, and Net Pay, then posts:
              <br />
              <code className="text-slate-800 font-mono text-[10px] block mt-1">
                DR: 5020 Salaries Expense ($47,000)<br />
                CR: 2030 Taxes Payable ($10,480)<br />
                CR: 1010 Operating Cash ($36,520)
              </code>
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <span className="font-bold text-slate-900 block mb-1">
              2. PO Receipt $\rightarrow$ Inventory & A/P
            </span>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              When Warehouse receives physical items from a vendor, stock count increases and a balanced transaction is created:
              <br />
              <code className="text-slate-800 font-mono text-[10px] block mt-1">
                DR: 1030 Inventory Asset ($45,000)<br />
                CR: 2010 Accounts Payable ($45,000)
              </code>
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <span className="font-bold text-slate-900 block mb-1">
              3. Order Fulfillment $\rightarrow$ A/R & COGS
            </span>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              When items ship to a client, an invoice is issued and inventory cost is transferred to operating expense:
              <br />
              <code className="text-slate-800 font-mono text-[10px] block mt-1">
                DR: 1020 Accounts Receivable ($38,500)<br />
                CR: 4010 Sales Revenue ($38,500)
              </code>
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Code & Schema Browser */}
      <div className="bg-slate-900 text-slate-100 rounded-xl overflow-hidden shadow-md">
        <div className="px-5 py-3 bg-slate-800/80 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Data Structure & Schema Definitions
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Schema Selector Tabs */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-900 rounded-md">
              <button
                onClick={() => setActiveSchemaTab('finance')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-sm transition-colors cursor-pointer ${
                  activeSchemaTab === 'finance' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Finance Schema
              </button>
              <button
                onClick={() => setActiveSchemaTab('hr')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-sm transition-colors cursor-pointer ${
                  activeSchemaTab === 'hr' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                HR Schema
              </button>
              <button
                onClick={() => setActiveSchemaTab('inventory')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-sm transition-colors cursor-pointer ${
                  activeSchemaTab === 'inventory' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Inventory Schema
              </button>
              <button
                onClick={() => setActiveSchemaTab('rbac')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-sm transition-colors cursor-pointer ${
                  activeSchemaTab === 'rbac' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                RBAC Matrix
              </button>
            </div>

            <button
              onClick={handleCopy}
              className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md transition-colors flex items-center gap-1 text-xs cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <div className="p-5 overflow-x-auto max-h-[500px]">
          <pre className="font-mono text-xs text-slate-300 leading-relaxed">
            {schemas[activeSchemaTab]}
          </pre>
        </div>
      </div>
    </div>
  );
};
