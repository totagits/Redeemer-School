import React, { useState } from 'react';
import { 
  DollarSign, 
  BookOpen, 
  FileText, 
  CreditCard, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  ArrowUpRight, 
  FileCheck2, 
  Printer, 
  PieChart 
} from 'lucide-react';
import { 
  Account, 
  JournalEntry, 
  CustomerInvoice, 
  VendorBill, 
  validateJournalEntryBalance, 
  computeFinancialStatements 
} from '../logic/erpFinance.ts';

interface FinanceModuleProps {
  accounts: Account[];
  journalEntries: JournalEntry[];
  invoices: CustomerInvoice[];
  bills: VendorBill[];
  onAddJournalEntry: (entry: Omit<JournalEntry, 'id' | 'entryNumber' | 'status' | 'postedAt'>) => void;
  onAddInvoice: (inv: Omit<CustomerInvoice, 'id' | 'invoiceNumber' | 'paidAmount' | 'balanceDue' | 'status'>) => void;
  onPayInvoice: (invoiceId: string, amount: number) => void;
  onAddBill: (bill: Omit<VendorBill, 'id' | 'billNumber' | 'paidAmount' | 'balanceDue' | 'status'>) => void;
  onPayBill: (billId: string, amount: number) => void;
}

export const FinanceModule: React.FC<FinanceModuleProps> = ({
  accounts,
  journalEntries,
  invoices,
  bills,
  onAddJournalEntry,
  onAddInvoice,
  onPayInvoice,
  onAddBill,
  onPayBill
}) => {
  const [activeTab, setActiveTab] = useState<'journals' | 'accounts' | 'ar' | 'ap' | 'statements'>('journals');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [showNewJournalModal, setShowNewJournalModal] = useState(false);
  const [showNewInvoiceModal, setShowNewInvoiceModal] = useState(false);
  const [showNewBillModal, setShowNewBillModal] = useState(false);
  const [paymentModalData, setPaymentModalData] = useState<{ type: 'INVOICE' | 'BILL'; id: string; number: string; balanceDue: number } | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState('');

  // New Journal Entry Form State
  const [jeDate, setJeDate] = useState(new Date().toISOString().split('T')[0]);
  const [jeDescription, setJeDescription] = useState('');
  const [jeLines, setJeLines] = useState<Array<{ accountId: string; accountName: string; debit: number; credit: number; memo: string }>>([
    { accountId: '1010', accountName: 'Cash and Operating Bank', debit: 0, credit: 0, memo: '' },
    { accountId: '4010', accountName: 'Operating Sales Revenue', debit: 0, credit: 0, memo: '' }
  ]);

  // New Invoice Form State
  const [invCustomer, setInvCustomer] = useState('');
  const [invDueDate, setInvDueDate] = useState('');
  const [invItems, setInvItems] = useState([
    { description: 'Consulting & Engineering Implementation Services', quantity: 1, unitPrice: 5000 }
  ]);

  // New Vendor Bill State
  const [billVendor, setBillVendor] = useState('');
  const [billDueDate, setBillDueDate] = useState('');
  const [billCategory, setBillCategory] = useState('Raw Materials');
  const [billAmount, setBillAmount] = useState('');

  // Financial Statements
  const statements = computeFinancialStatements(accounts, journalEntries);

  // Journal Entry line handler
  const handleLineChange = (index: number, field: 'accountId' | 'debit' | 'credit' | 'memo', value: any) => {
    const updated = [...jeLines];
    if (field === 'accountId') {
      const selectedAcc = accounts.find(a => a.code === value);
      updated[index].accountId = value;
      updated[index].accountName = selectedAcc ? selectedAcc.name : '';
    } else if (field === 'debit') {
      updated[index].debit = Number(value) || 0;
      if (Number(value) > 0) updated[index].credit = 0; // standard single side entry
    } else if (field === 'credit') {
      updated[index].credit = Number(value) || 0;
      if (Number(value) > 0) updated[index].debit = 0;
    } else {
      updated[index].memo = value;
    }
    setJeLines(updated);
  };

  const addLine = () => {
    setJeLines([
      ...jeLines,
      { accountId: '1010', accountName: 'Cash and Operating Bank', debit: 0, credit: 0, memo: '' }
    ]);
  };

  const removeLine = (index: number) => {
    if (jeLines.length <= 2) return;
    setJeLines(jeLines.filter((_, i) => i !== index));
  };

  const balanceValidation = validateJournalEntryBalance(jeLines);

  const submitJournalEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!balanceValidation.isBalanced || !jeDescription.trim()) return;

    onAddJournalEntry({
      date: jeDate,
      description: jeDescription,
      lines: jeLines,
      sourceModule: 'MANUAL',
      createdBy: 'Finance Officer'
    });

    setShowNewJournalModal(false);
    setJeDescription('');
    setJeLines([
      { accountId: '1010', accountName: 'Cash and Operating Bank', debit: 0, credit: 0, memo: '' },
      { accountId: '4010', accountName: 'Operating Sales Revenue', debit: 0, credit: 0, memo: '' }
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Module Title & Tab Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-slate-800" />
            The Redeemer School — Bursary & General Ledger
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Double-entry bursary ledger, student tuition accounts receivable, vendor disbursements, and certified financial statements
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => setActiveTab('journals')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'journals' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            General Ledger ({journalEntries.length})
          </button>
          <button
            onClick={() => setActiveTab('accounts')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'accounts' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Chart of Accounts
          </button>
          <button
            onClick={() => setActiveTab('ar')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'ar' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Receivables (A/R)
          </button>
          <button
            onClick={() => setActiveTab('ap')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'ap' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Payables (A/P)
          </button>
          <button
            onClick={() => setActiveTab('statements')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'statements' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Statements
          </button>
        </div>
      </div>

      {/* TAB 1: General Ledger & Journals */}
      {activeTab === 'journals' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search journal entries..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-400"
              />
            </div>

            <button
              onClick={() => setShowNewJournalModal(true)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Post Journal Entry
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Entry #</th>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Description</th>
                    <th className="py-2.5 px-4">Module</th>
                    <th className="py-2.5 px-4 text-right">Debit ($)</th>
                    <th className="py-2.5 px-4 text-right">Credit ($)</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {journalEntries
                    .filter(je => 
                      je.entryNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      je.description.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((je) => {
                      const totalDebit = je.lines.reduce((s, l) => s + l.debit, 0);
                      const totalCredit = je.lines.reduce((s, l) => s + l.credit, 0);
                      return (
                        <React.Fragment key={je.id}>
                          <tr className="hover:bg-slate-50/80 transition-colors font-medium">
                            <td className="py-2.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                              {je.entryNumber}
                            </td>
                            <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">{je.date}</td>
                            <td className="py-2.5 px-4 text-slate-900 max-w-md">
                              <div>{je.description}</div>
                              <div className="text-[11px] text-slate-400 mt-0.5 font-normal">
                                Posted by {je.createdBy}
                              </div>
                            </td>
                            <td className="py-2.5 px-4">
                              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-sm">
                                {je.sourceModule}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 font-mono tabular-nums text-right font-bold text-slate-900">
                              ${totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-4 font-mono tabular-nums text-right font-bold text-slate-900">
                              ${totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-4">
                              <span className="text-emerald-700 text-xs font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Posted
                              </span>
                            </td>
                          </tr>
                          {/* Expanded double entry lines */}
                          <tr className="bg-slate-50/40 border-b border-slate-100">
                            <td colSpan={7} className="px-4 py-2">
                              <div className="pl-6 space-y-1 text-[11px] text-slate-600 border-l-2 border-slate-200">
                                {je.lines.map((line, idx) => (
                                  <div key={idx} className="flex items-center justify-between py-0.5">
                                    <span className="font-mono">
                                      <strong className="text-slate-800">{line.accountId}</strong> - {line.accountName}
                                      {line.memo && <span className="text-slate-400 ml-2 italic">({line.memo})</span>}
                                    </span>
                                    <div className="flex items-center gap-6 font-mono tabular-nums">
                                      <span className="w-24 text-right text-slate-700">
                                        {line.debit > 0 ? `$${line.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                                      </span>
                                      <span className="w-24 text-right text-slate-700">
                                        {line.credit > 0 ? `$${line.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Chart of Accounts */}
      {activeTab === 'accounts' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Standard Chart of Accounts (GAAP Standard)
            </h2>
            <span className="text-xs text-slate-500">
              {accounts.length} Accounts Configured
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-2.5 px-4">Account Code</th>
                  <th className="py-2.5 px-4">Account Title</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4">Normal Balance</th>
                  <th className="py-2.5 px-4">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {accounts.map((acc) => (
                  <tr key={acc.code} className="hover:bg-slate-50/75 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                      {acc.code}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">
                      {acc.name}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                        acc.category === 'ASSET' ? 'bg-blue-50 text-blue-700' :
                        acc.category === 'LIABILITY' ? 'bg-amber-50 text-amber-700' :
                        acc.category === 'EQUITY' ? 'bg-purple-50 text-purple-700' :
                        acc.category === 'REVENUE' ? 'bg-emerald-50 text-emerald-700' :
                        'bg-rose-50 text-rose-700'
                      }`}>
                        {acc.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">
                      {acc.normalBalance}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 max-w-sm">
                      {acc.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Accounts Receivable (AR) */}
      {activeTab === 'ar' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Customer Invoices & Receivables Ledger
            </h2>
            <button
              onClick={() => setShowNewInvoiceModal(true)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Customer Invoice
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Invoice #</th>
                    <th className="py-2.5 px-4">Customer Name</th>
                    <th className="py-2.5 px-4">Issue Date</th>
                    <th className="py-2.5 px-4">Due Date</th>
                    <th className="py-2.5 px-4 text-right">Total ($)</th>
                    <th className="py-2.5 px-4 text-right">Balance Due ($)</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                        {inv.invoiceNumber}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-slate-800">
                        {inv.customerName}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{inv.issueDate}</td>
                      <td className="py-2.5 px-4 text-slate-600">{inv.dueDate}</td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-right font-bold text-slate-900">
                        ${inv.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-right font-bold text-slate-900">
                        ${inv.balanceDue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                          inv.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' :
                          inv.status === 'PARTIALLY_PAID' ? 'bg-blue-50 text-blue-700' :
                          inv.status === 'SENT' ? 'bg-amber-50 text-amber-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {inv.balanceDue > 0 ? (
                          <button
                            onClick={() => {
                              setPaymentModalData({
                                type: 'INVOICE',
                                id: inv.id,
                                number: inv.invoiceNumber,
                                balanceDue: inv.balanceDue
                              });
                              setPaymentAmountInput(String(inv.balanceDue));
                            }}
                            className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer"
                          >
                            Receive Payment
                          </button>
                        ) : (
                          <span className="text-slate-400 text-xs">Settled</span>
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

      {/* TAB 4: Accounts Payable (AP) */}
      {activeTab === 'ap' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Vendor Invoices & Accounts Payable Ledger
            </h2>
            <button
              onClick={() => setShowNewBillModal(true)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Enter Vendor Bill
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Bill #</th>
                    <th className="py-2.5 px-4">Vendor Name</th>
                    <th className="py-2.5 px-4">Category</th>
                    <th className="py-2.5 px-4">Due Date</th>
                    <th className="py-2.5 px-4 text-right">Total ($)</th>
                    <th className="py-2.5 px-4 text-right">Balance Due ($)</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {bills.map((bill) => (
                    <tr key={bill.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                        {bill.billNumber}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-slate-800">
                        {bill.vendorName}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{bill.category}</td>
                      <td className="py-2.5 px-4 text-slate-600">{bill.dueDate}</td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-right font-bold text-slate-900">
                        ${bill.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-right font-bold text-slate-900">
                        ${bill.balanceDue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                          bill.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' :
                          bill.status === 'APPROVED' ? 'bg-amber-50 text-amber-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {bill.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {bill.balanceDue > 0 ? (
                          <button
                            onClick={() => {
                              setPaymentModalData({
                                type: 'BILL',
                                id: bill.id,
                                number: bill.billNumber,
                                balanceDue: bill.balanceDue
                              });
                              setPaymentAmountInput(String(bill.balanceDue));
                            }}
                            className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors cursor-pointer"
                          >
                            Disburse Payment
                          </button>
                        ) : (
                          <span className="text-slate-400 text-xs">Paid in Full</span>
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

      {/* TAB 5: Financial Statements (Income Statement & Balance Sheet) */}
      {activeTab === 'statements' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Income Statement */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Income Statement (Profit & Loss)
                </h3>
                <span className="text-xs text-slate-500">For the period ending October 2026</span>
              </div>
              <PieChart className="w-4 h-4 text-slate-500" />
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="font-semibold text-slate-700">Total Operating Revenue</span>
                <span className="font-mono font-bold tabular-nums text-slate-900">
                  ${statements.incomeStatement.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="font-semibold text-slate-700">Total Operating Expenses</span>
                <span className="font-mono font-bold tabular-nums text-rose-700">
                  (${statements.incomeStatement.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t-2 border-slate-900 font-bold text-sm">
                <span className="text-slate-900">Net Operating Income</span>
                <span className={`font-mono tabular-nums ${
                  statements.incomeStatement.netIncome >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  ${statements.incomeStatement.netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Balance Sheet */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Balance Sheet (Financial Position)
                </h3>
                <span className="text-xs text-slate-500">As of Current Reporting Date</span>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="font-semibold text-slate-700">Total Assets (Liquid, A/R, Inventory)</span>
                <span className="font-mono font-bold tabular-nums text-slate-900">
                  ${statements.balanceSheet.totalAssets.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="font-semibold text-slate-700">Total Liabilities (A/P, Accruals)</span>
                <span className="font-mono font-bold tabular-nums text-slate-900">
                  ${statements.balanceSheet.totalLiabilities.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="font-semibold text-slate-700">Total Shareholder Equity (Capital + Net Retained)</span>
                <span className="font-mono font-bold tabular-nums text-slate-900">
                  ${statements.balanceSheet.totalEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t-2 border-slate-900 font-bold text-sm">
                <span className="text-slate-900">Total Liabilities & Equity</span>
                <span className="font-mono tabular-nums text-slate-900">
                  ${(statements.balanceSheet.totalLiabilities + statements.balanceSheet.totalEquity).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="mt-4 p-2.5 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span><strong>Accounting Equation Verified:</strong> Assets = Liabilities + Equity (Balanced)</span>
            </div>
          </div>

        </div>
      )}

      {/* MODAL: New Journal Entry with Double Entry Balancing Validation */}
      {showNewJournalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Post Double-Entry Journal Transaction
                </h3>
                <p className="text-xs text-slate-500">
                  Debits and credits must be in exact balance before posting to General Ledger
                </p>
              </div>
              <button
                onClick={() => setShowNewJournalModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitJournalEntry} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Posting Date
                  </label>
                  <input
                    type="date"
                    required
                    value={jeDate}
                    onChange={(e) => setJeDate(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Entry Description / Memo
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Q4 Machinery Maintenance"
                    value={jeDescription}
                    onChange={(e) => setJeDescription(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-slate-400"
                  />
                </div>
              </div>

              {/* Journal Lines Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2">Account</th>
                      <th className="p-2 w-28 text-right">Debit ($)</th>
                      <th className="p-2 w-28 text-right">Credit ($)</th>
                      <th className="p-2">Memo</th>
                      <th className="p-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {jeLines.map((line, idx) => (
                      <tr key={idx}>
                        <td className="p-2">
                          <select
                            value={line.accountId}
                            onChange={(e) => handleLineChange(idx, 'accountId', e.target.value)}
                            className="w-full text-xs bg-white border border-slate-300 rounded-md p-1 font-mono"
                          >
                            {accounts.map((acc) => (
                              <option key={acc.code} value={acc.code}>
                                {acc.code} - {acc.name} ({acc.category})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={line.debit || ''}
                            onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                            className="w-full text-xs font-mono text-right bg-white border border-slate-300 rounded-md p-1"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={line.credit || ''}
                            onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                            className="w-full text-xs font-mono text-right bg-white border border-slate-300 rounded-md p-1"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            placeholder="Optional memo"
                            value={line.memo}
                            onChange={(e) => handleLineChange(idx, 'memo', e.target.value)}
                            className="w-full text-xs bg-white border border-slate-300 rounded-md p-1"
                          />
                        </td>
                        <td className="p-2 text-center">
                          {jeLines.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="text-slate-400 hover:text-rose-600 font-bold"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={addLine}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                >
                  + Add Entry Line
                </button>

                {/* Imbalance Indicator */}
                <div className="text-right text-xs">
                  <div className="flex gap-4 font-mono font-bold">
                    <span>Total Debit: ${balanceValidation.totalDebit.toFixed(2)}</span>
                    <span>Total Credit: ${balanceValidation.totalCredit.toFixed(2)}</span>
                  </div>
                  {balanceValidation.isBalanced ? (
                    <span className="text-emerald-700 font-semibold flex items-center justify-end gap-1 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Balanced ($0.00 Imbalance)
                    </span>
                  ) : (
                    <span className="text-rose-600 font-semibold flex items-center justify-end gap-1 mt-0.5">
                      <AlertCircle className="w-3.5 h-3.5" /> Imbalance: ${balanceValidation.imbalance.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewJournalModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!balanceValidation.isBalanced}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-xs cursor-pointer"
                >
                  Post to General Ledger
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Record Payment for AR or AP */}
      {paymentModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              {paymentModalData.type === 'INVOICE' ? 'Receive Customer Payment' : 'Disburse Vendor Payment'}
            </h3>
            <p className="text-xs text-slate-500">
              Reference: <strong className="font-mono text-slate-800">{paymentModalData.number}</strong>
              <br />
              Outstanding Balance Due: <strong className="font-mono text-slate-900">${paymentModalData.balanceDue.toFixed(2)}</strong>
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Payment Amount ($)
              </label>
              <input
                type="number"
                step="0.01"
                max={paymentModalData.balanceDue}
                value={paymentAmountInput}
                onChange={(e) => setPaymentAmountInput(e.target.value)}
                className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setPaymentModalData(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const amt = Number(paymentAmountInput);
                  if (amt > 0) {
                    if (paymentModalData.type === 'INVOICE') {
                      onPayInvoice(paymentModalData.id, amt);
                    } else {
                      onPayBill(paymentModalData.id, amt);
                    }
                    setPaymentModalData(null);
                  }
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Confirm Settlement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create New Customer Invoice */}
      {showNewInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Generate Commercial Customer Invoice (A/R)
            </h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Customer / Entity Name</label>
              <input
                type="text"
                placeholder="e.g. Apex Industrial Systems"
                value={invCustomer}
                onChange={(e) => setInvCustomer(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date</label>
              <input
                type="date"
                value={invDueDate}
                onChange={(e) => setInvDueDate(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Service / Item Description</label>
              <input
                type="text"
                value={invItems[0].description}
                onChange={(e) => setInvItems([{ ...invItems[0], description: e.target.value }])}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity</label>
                <input
                  type="number"
                  value={invItems[0].quantity}
                  onChange={(e) => setInvItems([{ ...invItems[0], quantity: Number(e.target.value) }])}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Unit Price ($)</label>
                <input
                  type="number"
                  value={invItems[0].unitPrice}
                  onChange={(e) => setInvItems([{ ...invItems[0], unitPrice: Number(e.target.value) }])}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setShowNewInvoiceModal(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (invCustomer.trim()) {
                    const total = invItems[0].quantity * invItems[0].unitPrice;
                    onAddInvoice({
                      customerId: `cust-${Date.now()}`,
                      customerName: invCustomer,
                      issueDate: new Date().toISOString().split('T')[0],
                      dueDate: invDueDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
                      items: [{ ...invItems[0], amount: total }],
                      totalAmount: total
                    });
                    setShowNewInvoiceModal(false);
                    setInvCustomer('');
                  }
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Issue Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create New Vendor Bill */}
      {showNewBillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Enter Vendor Bill (A/P)
            </h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Vendor Name</label>
              <input
                type="text"
                placeholder="e.g. Continental Precision Castings"
                value={billVendor}
                onChange={(e) => setBillVendor(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
              <select
                value={billCategory}
                onChange={(e) => setBillCategory(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
              >
                <option value="Raw Materials">Raw Materials</option>
                <option value="Inventory Procurement">Inventory Procurement</option>
                <option value="Facility Rent & Utilities">Facility Rent & Utilities</option>
                <option value="Technology & Cloud">Technology & Cloud</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bill Amount ($)</label>
              <input
                type="number"
                placeholder="0.00"
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date</label>
              <input
                type="date"
                value={billDueDate}
                onChange={(e) => setBillDueDate(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setShowNewBillModal(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const amt = Number(billAmount);
                  if (billVendor.trim() && amt > 0) {
                    onAddBill({
                      vendorId: `ven-${Date.now()}`,
                      vendorName: billVendor,
                      billDate: new Date().toISOString().split('T')[0],
                      dueDate: billDueDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
                      category: billCategory,
                      amount: amt
                    });
                    setShowNewBillModal(false);
                    setBillVendor('');
                    setBillAmount('');
                  }
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Save Bill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
