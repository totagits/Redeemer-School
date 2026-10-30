import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../src/components/EntranceExamFinance.tsx',import.meta.url),'utf8');
test('receipt action is accessible on verified ledger rows',()=>{
 assert.match(source,/Finance-verified payment and waiver history/);
 assert.match(source,/onClick=\{\(\)=>setReceipt\(s\)\}/);
 assert.match(source,/aria-label=\{'View printable '/);
});
test('waivers cannot be mistaken for cash receipts',()=>{
 assert.match(source,/AUTHORIZED FEE WAIVER — NO CASH RECEIVED/);
 assert.match(source,/FINANCE-VERIFIED PAYMENT/);
});
test('receipt disclaims independent payment provider confirmation',()=>{
 assert.match(source,/not confirmation from MTN Mobile Money/);
 assert.match(source,/timeZone:'Africa\/Monrovia'/);
});
test('print-only styles and close control exist',()=>{
 assert.match(source,/@media print/);
 assert.match(source,/window\.print\(\)/);
 assert.match(source,/setReceipt\(null\)/);
});
