import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  validateJournalEntryBalance, 
  computeAccountBalances, 
  computeFinancialStatements, 
  DEFAULT_CHART_OF_ACCOUNTS,
  type JournalEntry,
  type Account
} from './erpFinance.ts';
import { 
  calculateEmployeePayroll, 
  generatePayrollRun, 
  type Employee 
} from './erpHr.ts';
import { 
  processStockMovement, 
  calculateInventoryValuation, 
  evaluateStockStatus, 
  type InventoryItem 
} from './erpInventory.ts';

test('Finance: validateJournalEntryBalance verifies double-entry debits equal credits', () => {
  const balancedLines = [
    { accountId: '1010', accountName: 'Cash', debit: 5000, credit: 0 },
    { accountId: '4010', accountName: 'Operating Sales', debit: 0, credit: 5000 }
  ];
  const balancedResult = validateJournalEntryBalance(balancedLines);
  assert.equal(balancedResult.isBalanced, true);
  assert.equal(balancedResult.imbalance, 0);

  const unbalancedLines = [
    { accountId: '1010', accountName: 'Cash', debit: 5000, credit: 0 },
    { accountId: '4010', accountName: 'Operating Sales', debit: 0, credit: 4800 }
  ];
  const unbalancedResult = validateJournalEntryBalance(unbalancedLines);
  assert.equal(unbalancedResult.isBalanced, false);
  assert.equal(unbalancedResult.imbalance, 200);
});

test('Finance: computeFinancialStatements derives correct net income and balanced balance sheet', () => {
  const sampleEntries: JournalEntry[] = [
    {
      id: 'je1',
      entryNumber: 'JE-001',
      date: '2026-10-01',
      description: 'Initial Owner Capital Injection',
      status: 'POSTED',
      sourceModule: 'MANUAL',
      createdBy: 'Admin',
      lines: [
        { accountId: '1010', accountName: 'Cash', debit: 100000, credit: 0 },
        { accountId: '3010', accountName: "Owner's Equity", debit: 0, credit: 100000 }
      ]
    },
    {
      id: 'je2',
      entryNumber: 'JE-002',
      date: '2026-10-05',
      description: 'Product Sales Cash Receipt',
      status: 'POSTED',
      sourceModule: 'AR_BILLING',
      createdBy: 'Sales',
      lines: [
        { accountId: '1010', accountName: 'Cash', debit: 25000, credit: 0 },
        { accountId: '4010', accountName: 'Sales Revenue', debit: 0, credit: 25000 }
      ]
    },
    {
      id: 'je3',
      entryNumber: 'JE-003',
      date: '2026-10-10',
      description: 'Facility Rent Paid in Cash',
      status: 'POSTED',
      sourceModule: 'AP_VENDOR',
      createdBy: 'Finance',
      lines: [
        { accountId: '5030', accountName: 'Rent Expense', debit: 4000, credit: 0 },
        { accountId: '1010', accountName: 'Cash', debit: 0, credit: 4000 }
      ]
    }
  ];

  const statements = computeFinancialStatements(DEFAULT_CHART_OF_ACCOUNTS, sampleEntries);
  assert.equal(statements.incomeStatement.revenue, 25000);
  assert.equal(statements.incomeStatement.expenses, 4000);
  assert.equal(statements.incomeStatement.netIncome, 21000);

  // Total Assets = Cash 100,000 + 25,000 - 4,000 = 121,000
  assert.equal(statements.balanceSheet.totalAssets, 121000);
  // Equity = 100,000 (Owner) + 21,000 (Net Income) = 121,000
  assert.equal(statements.balanceSheet.totalEquity, 121000);
  assert.equal(statements.balanceSheet.isBalanced, true);
});

test('HR: calculateEmployeePayroll computes deductions and net pay correctly', () => {
  const emp: Employee = {
    id: 'emp-1',
    employeeCode: 'EMP-01',
    firstName: 'Evelyn',
    lastName: 'Vance',
    email: 'evelyn@erp.org',
    phone: '+1 555 0192',
    department: 'Engineering',
    designation: 'Senior Architect',
    hireDate: '2022-03-15',
    employmentType: 'FULL_TIME',
    baseSalary: 8000,
    allowances: 500,
    bankAccount: 'US-CHASE-****4912',
    status: 'ACTIVE',
    paidLeaveBalance: 18
  };

  const payslip = calculateEmployeePayroll(emp);
  // Gross = 8000 + 500 = 8500
  assert.equal(payslip.grossPay, 8500);
  // Tax (15%) = 1275
  assert.equal(payslip.incomeTax, 1275);
  // Pension (6%) = 510
  assert.equal(payslip.pensionContribution, 510);
  // Health = 120
  assert.equal(payslip.healthInsurance, 120);
  // Total Deductions = 1275 + 510 + 120 = 1905
  assert.equal(payslip.totalDeductions, 1905);
  // Net = 8500 - 1905 = 6595
  assert.equal(payslip.netPay, 6595);
});

test('Inventory: processStockMovement and valuation calculation track inventory accurately', () => {
  const item: InventoryItem = {
    id: 'item-1',
    sku: 'SKU-001',
    name: 'Industrial Valve Assembly',
    category: 'Hardware',
    unitOfMeasure: 'PCS',
    unitCost: 45.00,
    sellingPrice: 85.00,
    currentStock: 50,
    reorderLevel: 20,
    warehouseLocation: 'Warehouse A - Bin 14',
    status: 'IN_STOCK'
  };

  // Stock Out movement (e.g. 40 pcs sold)
  const { updatedItem, movement } = processStockMovement(
    item,
    'STOCK_OUT',
    40,
    'SO-2026-99',
    'Customer order fulfillment',
    'Warehouse Lead'
  );

  assert.equal(updatedItem.currentStock, 10);
  assert.equal(updatedItem.status, 'LOW_STOCK');
  assert.equal(movement.movementType, 'STOCK_OUT');
  assert.equal(movement.newStock, 10);

  const valuation = calculateInventoryValuation([updatedItem]);
  // 10 pcs * 45 cost = 450
  assert.equal(valuation.totalValuationCost, 450);
  assert.equal(valuation.lowStockItemsCount, 1);
});
