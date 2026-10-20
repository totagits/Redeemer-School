/**
 * ERP Reporting and Analytics Engine
 * Provides standard reporting computations (A/R Aging, Inventory Valuation,
 * Department Headcount & Payroll Rollup) and a dynamic custom report builder.
 */

import type { CustomerInvoice, VendorBill, JournalEntry, Account } from './erpFinance.ts';
import type { InventoryItem, StockMovement } from './erpInventory.ts';
import type { Employee, LeaveRequest, PayrollRun } from './erpHr.ts';

export interface AgingBucket {
  current_0_30: number;
  past_31_60: number;
  past_61_90: number;
  past_over_90: number;
  total: number;
}

export function computeAgingReport(
  invoices: CustomerInvoice[],
  referenceDateStr: string = '2026-10-20'
): { buckets: AgingBucket; itemsWithAge: Array<CustomerInvoice & { daysOverdue: number }> } {
  const refDate = new Date(referenceDateStr).getTime();
  const buckets: AgingBucket = {
    current_0_30: 0,
    past_31_60: 0,
    past_61_90: 0,
    past_over_90: 0,
    total: 0
  };

  const itemsWithAge = invoices
    .filter(inv => inv.balanceDue > 0)
    .map(inv => {
      const due = new Date(inv.dueDate).getTime();
      const diffDays = Math.max(0, Math.floor((refDate - due) / (1000 * 60 * 60 * 24)));

      if (diffDays <= 30) {
        buckets.current_0_30 += inv.balanceDue;
      } else if (diffDays <= 60) {
        buckets.past_31_60 += inv.balanceDue;
      } else if (diffDays <= 90) {
        buckets.past_61_90 += inv.balanceDue;
      } else {
        buckets.past_over_90 += inv.balanceDue;
      }
      buckets.total += inv.balanceDue;

      return {
        ...inv,
        daysOverdue: diffDays
      };
    });

  return { buckets, itemsWithAge };
}

export interface InventoryValuationRow {
  category: string;
  itemCount: number;
  totalUnits: number;
  totalValuationCost: number;
  totalRetailValue: number;
  unrealizedGrossMargin: number;
  marginPercent: number;
}

export function computeInventoryCategoryReport(items: InventoryItem[]): InventoryValuationRow[] {
  const categories: Record<string, { itemCount: number; totalUnits: number; cost: number; retail: number }> = {};

  for (const item of items) {
    if (!categories[item.category]) {
      categories[item.category] = { itemCount: 0, totalUnits: 0, cost: 0, retail: 0 };
    }
    const cat = categories[item.category];
    cat.itemCount += 1;
    cat.totalUnits += item.currentStock;
    cat.cost += item.currentStock * item.unitCost;
    cat.retail += item.currentStock * item.sellingPrice;
  }

  return Object.keys(categories).map(catName => {
    const data = categories[catName];
    const margin = data.retail - data.cost;
    const marginPercent = data.retail > 0 ? Math.round((margin / data.retail) * 1000) / 10 : 0;
    return {
      category: catName,
      itemCount: data.itemCount,
      totalUnits: data.totalUnits,
      totalValuationCost: Math.round(data.cost * 100) / 100,
      totalRetailValue: Math.round(data.retail * 100) / 100,
      unrealizedGrossMargin: Math.round(margin * 100) / 100,
      marginPercent
    };
  });
}

export interface DepartmentHeadcountRow {
  department: string;
  headcount: number;
  totalMonthlyBase: number;
  totalMonthlyAllowances: number;
  totalMonthlyCompensation: number;
  avgSalaryPerEmployee: number;
}

export function computeDepartmentHeadcountReport(employees: Employee[]): DepartmentHeadcountRow[] {
  const depts: Record<string, { count: number; base: number; allowances: number }> = {};

  for (const emp of employees) {
    if (emp.status === 'TERMINATED') continue;
    if (!depts[emp.department]) {
      depts[emp.department] = { count: 0, base: 0, allowances: 0 };
    }
    depts[emp.department].count += 1;
    depts[emp.department].base += emp.baseSalary;
    depts[emp.department].allowances += emp.allowances;
  }

  return Object.keys(depts).map(dName => {
    const d = depts[dName];
    const totalComp = d.base + d.allowances;
    const avg = d.count > 0 ? Math.round((totalComp / d.count) * 100) / 100 : 0;
    return {
      department: dName,
      headcount: d.count,
      totalMonthlyBase: Math.round(d.base * 100) / 100,
      totalMonthlyAllowances: Math.round(d.allowances * 100) / 100,
      totalMonthlyCompensation: Math.round(totalComp * 100) / 100,
      avgSalaryPerEmployee: avg
    };
  });
}

export interface CustomReportConfig {
  id: string;
  title: string;
  module: 'FINANCE' | 'INVENTORY' | 'HR';
  groupBy: string;
  metric: string;
  aggregation: 'SUM' | 'AVG' | 'COUNT';
}

export interface CustomReportResultRow {
  dimension: string;
  value: number;
  count: number;
}

export function executeCustomReport(
  config: CustomReportConfig,
  data: {
    invoices: CustomerInvoice[];
    bills: VendorBill[];
    inventory: InventoryItem[];
    employees: Employee[];
  }
): CustomReportResultRow[] {
  const groups: Record<string, { sum: number; count: number }> = {};

  if (config.module === 'INVENTORY') {
    for (const item of data.inventory) {
      const dim = config.groupBy === 'status' ? item.status : item.category;
      let val = 0;
      if (config.metric === 'currentStock') val = item.currentStock;
      else if (config.metric === 'unitCost') val = item.unitCost;
      else if (config.metric === 'valuation') val = item.currentStock * item.unitCost;
      else val = 1;

      if (!groups[dim]) groups[dim] = { sum: 0, count: 0 };
      groups[dim].sum += val;
      groups[dim].count += 1;
    }
  } else if (config.module === 'HR') {
    for (const emp of data.employees) {
      if (emp.status === 'TERMINATED') continue;
      const dim = config.groupBy === 'department' ? emp.department : emp.employmentType;
      let val = 0;
      if (config.metric === 'baseSalary') val = emp.baseSalary;
      else if (config.metric === 'allowances') val = emp.allowances;
      else if (config.metric === 'totalComp') val = emp.baseSalary + emp.allowances;
      else val = 1;

      if (!groups[dim]) groups[dim] = { sum: 0, count: 0 };
      groups[dim].sum += val;
      groups[dim].count += 1;
    }
  } else if (config.module === 'FINANCE') {
    for (const inv of data.invoices) {
      const dim = config.groupBy === 'status' ? inv.status : inv.customerName;
      let val = 0;
      if (config.metric === 'totalAmount') val = inv.totalAmount;
      else if (config.metric === 'balanceDue') val = inv.balanceDue;
      else val = 1;

      if (!groups[dim]) groups[dim] = { sum: 0, count: 0 };
      groups[dim].sum += val;
      groups[dim].count += 1;
    }
  }

  return Object.keys(groups).map(k => {
    const g = groups[k];
    let finalVal = g.sum;
    if (config.aggregation === 'AVG') {
      finalVal = g.count > 0 ? g.sum / g.count : 0;
    } else if (config.aggregation === 'COUNT') {
      finalVal = g.count;
    }
    return {
      dimension: k,
      value: Math.round(finalVal * 100) / 100,
      count: g.count
    };
  });
}
