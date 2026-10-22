import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  computeAgingReport, 
  computeInventoryCategoryReport, 
  computeDepartmentHeadcountReport, 
  executeCustomReport 
} from './erpReporting.ts';
import type { CustomerInvoice } from './erpFinance.ts';
import type { InventoryItem } from './erpInventory.ts';
import type { Employee } from './erpHr.ts';

test('Reporting: computeAgingReport correctly segments overdue invoices into aging buckets', () => {
  const invoices: CustomerInvoice[] = [
    {
      id: 'inv-1',
      invoiceNumber: 'INV-001',
      customerId: 'c1',
      customerName: 'Client Alpha',
      issueDate: '2026-09-01',
      dueDate: '2026-10-10', // 10 days past ref date 2026-10-20 -> bucket current_0_30
      items: [],
      totalAmount: 5000,
      paidAmount: 2000,
      balanceDue: 3000,
      status: 'PARTIALLY_PAID'
    },
    {
      id: 'inv-2',
      invoiceNumber: 'INV-002',
      customerId: 'c2',
      customerName: 'Client Beta',
      issueDate: '2026-07-01',
      dueDate: '2026-08-15', // 66 days past ref date -> bucket past_61_90
      items: [],
      totalAmount: 10000,
      paidAmount: 0,
      balanceDue: 10000,
      status: 'OVERDUE'
    }
  ];

  const report = computeAgingReport(invoices, '2026-10-20');
  assert.equal(report.buckets.total, 13000);
  assert.equal(report.buckets.current_0_30, 3000);
  assert.equal(report.buckets.past_61_90, 10000);
});

test('Reporting: computeInventoryCategoryReport calculates valuation and gross margin by category', () => {
  const items: InventoryItem[] = [
    {
      id: 'i1',
      sku: 'SKU-1',
      name: 'Actuator',
      category: 'Hardware',
      unitOfMeasure: 'PCS',
      unitCost: 100,
      sellingPrice: 200,
      currentStock: 10,
      reorderLevel: 5,
      warehouseLocation: 'Bay 1',
      status: 'IN_STOCK'
    },
    {
      id: 'i2',
      sku: 'SKU-2',
      name: 'Bracket',
      category: 'Hardware',
      unitOfMeasure: 'PCS',
      unitCost: 20,
      sellingPrice: 50,
      currentStock: 20,
      reorderLevel: 10,
      warehouseLocation: 'Bay 2',
      status: 'IN_STOCK'
    }
  ];

  const report = computeInventoryCategoryReport(items);
  assert.equal(report.length, 1);
  const hw = report[0];
  assert.equal(hw.category, 'Hardware');
  assert.equal(hw.totalUnits, 30);
  // Cost = (10 * 100) + (20 * 20) = 1000 + 400 = 1400
  assert.equal(hw.totalValuationCost, 1400);
  // Retail = (10 * 200) + (20 * 50) = 2000 + 1000 = 3000
  assert.equal(hw.totalRetailValue, 3000);
  // Margin = 3000 - 1400 = 1600
  assert.equal(hw.unrealizedGrossMargin, 1600);
});

test('Reporting: executeCustomReport dynamically aggregates query metrics', () => {
  const employees: Employee[] = [
    {
      id: 'e1',
      employeeCode: 'E1',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@test.com',
      phone: '123',
      department: 'Engineering',
      designation: 'Dev',
      hireDate: '2024-01-01',
      employmentType: 'FULL_TIME',
      baseSalary: 10000,
      allowances: 1000,
      bankAccount: '123',
      status: 'ACTIVE',
      paidLeaveBalance: 20
    },
    {
      id: 'e2',
      employeeCode: 'E2',
      firstName: 'Bob',
      lastName: 'Jones',
      email: 'bob@test.com',
      phone: '456',
      department: 'Engineering',
      designation: 'QA',
      hireDate: '2024-01-01',
      employmentType: 'FULL_TIME',
      baseSalary: 8000,
      allowances: 500,
      bankAccount: '456',
      status: 'ACTIVE',
      paidLeaveBalance: 20
    }
  ];

  const result = executeCustomReport(
    {
      id: 'r1',
      title: 'Engineering Total Comp',
      module: 'HR',
      groupBy: 'department',
      metric: 'totalComp',
      aggregation: 'SUM'
    },
    { invoices: [], bills: [], inventory: [], employees }
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].dimension, 'Engineering');
  // (10000+1000) + (8000+500) = 11000 + 8500 = 19500
  assert.equal(result[0].value, 19500);
  assert.equal(result[0].count, 2);
});
