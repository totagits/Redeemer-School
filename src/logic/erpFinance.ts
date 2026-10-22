/**
 * ERP Finance Logic: General Ledger, Chart of Accounts, Double-Entry Validation,
 * Accounts Receivable (AR), Accounts Payable (AP), and Financial Statements.
 */

export type AccountCategory = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface Account {
  code: string;       // e.g. "1010"
  name: string;       // e.g. "Cash & Bank Balances"
  category: AccountCategory;
  description: string;
  normalBalance: 'DEBIT' | 'CREDIT';
}

export interface JournalLine {
  accountId: string;  // references Account.code
  accountName: string;
  debit: number;
  credit: number;
  memo?: string;
}

export interface JournalEntry {
  id: string;
  entryNumber: string; // e.g. "JE-2026-001"
  date: string;
  description: string;
  lines: JournalLine[];
  status: 'DRAFT' | 'POSTED' | 'VOIDED';
  sourceModule: 'MANUAL' | 'AR_BILLING' | 'AP_VENDOR' | 'PAYROLL' | 'INVENTORY';
  createdBy: string;
  postedAt?: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface CustomerInvoice {
  id: string;
  invoiceNumber: string; // e.g. "INV-2026-1001"
  customerId: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  items: InvoiceItem[];
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE';
}

export interface VendorBill {
  id: string;
  billNumber: string; // e.g. "BILL-2026-401"
  vendorId: string;
  vendorName: string;
  billDate: string;
  dueDate: string;
  category: string;
  amount: number;
  paidAmount: number;
  balanceDue: number;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'PAID' | 'OVERDUE';
}

/** Standard Chart of Accounts */
export const DEFAULT_CHART_OF_ACCOUNTS: Account[] = [
  { code: '1010', name: 'Cash and Operating Bank', category: 'ASSET', normalBalance: 'DEBIT', description: 'Liquid cash in commercial operating accounts' },
  { code: '1020', name: 'Accounts Receivable', category: 'ASSET', normalBalance: 'DEBIT', description: 'Customer receivables from issued invoices' },
  { code: '1030', name: 'Merchandise Inventory Asset', category: 'ASSET', normalBalance: 'DEBIT', description: 'Value of physical stock on hand at cost' },
  { code: '1050', name: 'Prepaid Expenses', category: 'ASSET', normalBalance: 'DEBIT', description: 'Prepaid insurance, software licenses, or rent' },
  { code: '1510', name: 'Property, Plant & Equipment', category: 'ASSET', normalBalance: 'DEBIT', description: 'Office hardware, machinery, facilities' },
  
  { code: '2010', name: 'Accounts Payable', category: 'LIABILITY', normalBalance: 'CREDIT', description: 'Vendor payables for supplies and services' },
  { code: '2020', name: 'Accrued Payroll & Benefits', category: 'LIABILITY', normalBalance: 'CREDIT', description: 'Earned employee wages awaiting disbursement' },
  { code: '2030', name: 'Statutory Taxes Payable', category: 'LIABILITY', normalBalance: 'CREDIT', description: 'Withheld income tax, social security, pension' },
  { code: '2050', name: 'Short-Term Notes Payable', category: 'LIABILITY', normalBalance: 'CREDIT', description: 'Revolving credit and bank obligations' },
  
  { code: '3010', name: "Owner's Contributed Capital", category: 'EQUITY', normalBalance: 'CREDIT', description: 'Shareholder and founder capital investments' },
  { code: '3020', name: 'Retained Earnings', category: 'EQUITY', normalBalance: 'CREDIT', description: 'Cumulative historical net operating profit' },
  
  { code: '4010', name: 'Operating Sales Revenue', category: 'REVENUE', normalBalance: 'CREDIT', description: 'Primary commercial product sales and billing' },
  { code: '4020', name: 'Professional Services Revenue', category: 'REVENUE', normalBalance: 'CREDIT', description: 'Consulting, onboarding, and service fees' },
  
  { code: '5010', name: 'Cost of Goods Sold (COGS)', category: 'EXPENSE', normalBalance: 'DEBIT', description: 'Direct inventory cost of products delivered' },
  { code: '5020', name: 'Salaries and Employee Wages', category: 'EXPENSE', normalBalance: 'DEBIT', description: 'Gross compensation for all full-time staff' },
  { code: '5030', name: 'Facility Rent & Utilities', category: 'EXPENSE', normalBalance: 'DEBIT', description: 'Office lease, power, water, facilities' },
  { code: '5040', name: 'Technology & Cloud Infrastructure', category: 'EXPENSE', normalBalance: 'DEBIT', description: 'Hosting, SaaS licenses, connectivity' }
];

/** Validates double-entry constraint: Sum of debits must equal sum of credits */
export function validateJournalEntryBalance(lines: JournalLine[]): {
  isBalanced: boolean;
  totalDebit: number;
  totalCredit: number;
  imbalance: number;
} {
  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const totalDebitRounded = Math.round(totalDebit * 100) / 100;
  const totalCreditRounded = Math.round(totalCredit * 100) / 100;
  const imbalance = Math.abs(totalDebitRounded - totalCreditRounded);

  return {
    isBalanced: imbalance < 0.01 && totalDebitRounded > 0,
    totalDebit: totalDebitRounded,
    totalCredit: totalCreditRounded,
    imbalance: Math.round(imbalance * 100) / 100
  };
}

/** Computes trial balance and net balance for each account */
export function computeAccountBalances(accounts: Account[], entries: JournalEntry[]): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const acc of accounts) {
    balances[acc.code] = 0;
  }

  for (const entry of entries) {
    if (entry.status !== 'POSTED') continue;
    for (const line of entry.lines) {
      if (balances[line.accountId] === undefined) {
        balances[line.accountId] = 0;
      }
      const acc = accounts.find(a => a.code === line.accountId);
      const isDebitNormal = acc ? acc.normalBalance === 'DEBIT' : true;
      if (isDebitNormal) {
        balances[line.accountId] += (line.debit - line.credit);
      } else {
        balances[line.accountId] += (line.credit - line.debit);
      }
    }
  }

  return balances;
}

/** Generates dynamic Income Statement and Balance Sheet from posted entries */
export function computeFinancialStatements(accounts: Account[], entries: JournalEntry[]) {
  const balances = computeAccountBalances(accounts, entries);
  
  let totalRevenue = 0;
  let totalExpense = 0;
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquityBase = 0;

  for (const acc of accounts) {
    const bal = balances[acc.code] || 0;
    if (acc.category === 'REVENUE') totalRevenue += bal;
    else if (acc.category === 'EXPENSE') totalExpense += bal;
    else if (acc.category === 'ASSET') totalAssets += bal;
    else if (acc.category === 'LIABILITY') totalLiabilities += bal;
    else if (acc.category === 'EQUITY') totalEquityBase += bal;
  }

  const netIncome = Math.round((totalRevenue - totalExpense) * 100) / 100;
  const totalEquity = Math.round((totalEquityBase + netIncome) * 100) / 100;

  return {
    incomeStatement: {
      revenue: Math.round(totalRevenue * 100) / 100,
      expenses: Math.round(totalExpense * 100) / 100,
      netIncome
    },
    balanceSheet: {
      totalAssets: Math.round(totalAssets * 100) / 100,
      totalLiabilities: Math.round(totalLiabilities * 100) / 100,
      totalEquity,
      isBalanced: Math.abs(Math.round(totalAssets * 100) - Math.round((totalLiabilities + totalEquity) * 100)) <= 1
    }
  };
}
