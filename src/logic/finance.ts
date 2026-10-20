/**
 * Liberia School Finance Logic: Strict Dual-Currency Engine
 * In Liberia, schools bill tuition in USD and activity/PTA fees often in Liberian Dollars (LRD)
 * or vice versa. The master prompt mandates:
 * "Support USD and Liberian dollars (LRD) as separate currencies; never silently mix or convert amounts."
 */

export type Currency = 'USD' | 'LRD';

export type PaymentMethod = 
  | 'CASH'
  | 'LONESTAR_MTN_MOMO'
  | 'ORANGE_MONEY'
  | 'ECOBANK_DEPOSIT'
  | 'UBA_DEPOSIT'
  | 'GTBANK_DEPOSIT'
  | 'SCHOLARSHIP_WAIVER';

export interface FeeItem {
  id: string;
  name: string;
  amount: number;
  currency: Currency;
  category: 'TUITION' | 'REGISTRATION' | 'PTA' | 'LAB' | 'UNIFORM' | 'EXAM';
  required: boolean;
}

export interface Transaction {
  id: string;
  receiptNumber: string;
  learnerId: string;
  learnerName: string;
  date: string;
  type: 'INVOICE' | 'PAYMENT' | 'DISCOUNT' | 'REVERSAL';
  amount: number;
  currency: Currency;
  paymentMethod?: PaymentMethod;
  referenceNumber?: string;
  cashierName: string;
  notes?: string;
  status: 'COMPLETED' | 'REVERSED';
  reversalReason?: string;
  reversedAt?: string;
  reversedBy?: string;
}

export interface StudentBalanceSummary {
  usd: {
    billed: number;
    paid: number;
    discounts: number;
    balanceDue: number;
  };
  lrd: {
    billed: number;
    paid: number;
    discounts: number;
    balanceDue: number;
  };
}

export function calculateStudentBalances(transactions: Transaction[], learnerId?: string): StudentBalanceSummary {
  const relevant = learnerId 
    ? transactions.filter(t => t.learnerId === learnerId) 
    : transactions;

  const summary: StudentBalanceSummary = {
    usd: { billed: 0, paid: 0, discounts: 0, balanceDue: 0 },
    lrd: { billed: 0, paid: 0, discounts: 0, balanceDue: 0 }
  };

  for (const tx of relevant) {
    if (tx.status === 'REVERSED') {
      // Reversals neutralize the transaction in an audited ledger
      continue;
    }

    const curr = tx.currency.toLowerCase() as 'usd' | 'lrd';
    if (tx.type === 'INVOICE') {
      summary[curr].billed += tx.amount;
    } else if (tx.type === 'PAYMENT') {
      summary[curr].paid += tx.amount;
    } else if (tx.type === 'DISCOUNT') {
      summary[curr].discounts += tx.amount;
    }
  }

  summary.usd.balanceDue = Math.max(0, summary.usd.billed - summary.usd.paid - summary.usd.discounts);
  summary.lrd.balanceDue = Math.max(0, summary.lrd.billed - summary.lrd.paid - summary.lrd.discounts);

  return summary;
}

export function generateReceiptNumber(schoolPrefix: string, counter: number): string {
  const year = new Date().getFullYear();
  const padded = String(counter).padStart(5, '0');
  return `${schoolPrefix}-REC-${year}-${padded}`;
}

export function formatCurrency(amount: number, currency: Currency): string {
  if (currency === 'USD') {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else {
    return `L$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
