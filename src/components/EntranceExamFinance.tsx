import React, { useCallback, useEffect, useState } from 'react';

type ExamFee = { exam_id:string;title:string;grade_label:string;starts_at:string;status:string;amount:string|null;currency:string|null;applicant_count:number };
type Settlement = {id:string;exam_id:string;application_id:string;kind:string;channel:string;amount:string;currency:string;reference:string;verified_at:string;application_number:string;first_name:string;last_name:string};
type Assignment = {exam_id:string;application_id:string;application_number:string;first_name:string;last_name:string;settled:boolean};
type Props = {canWrite:boolean;post:(path:string,body:Record<string,unknown>)=>Promise<Record<string,unknown>>};
export const EntranceExamFinance:React.FC<Props> = ({canWrite,post})=>{
 const [fees,setFees]=useState<ExamFee[]>([]);
 const [settlements,setSettlements]=useState<Settlement[]>([]);
 const [assignments,setAssignments]=useState<Assignment[]>([]);
 const [ready,setReady]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [loading,setLoading]=useState(true);
 const load=useCallback(async()=>{
   try{
     const response=await fetch('/api/operations/finance/entrance-exam-fees',{credentials:'same-origin'});
     const result=await response.json();
     if(!response.ok)throw Error(result.error||'Unable to load examination fees.');
     setFees(result.fees||[]);setSettlements(result.settlements||[]);setAssignments(result.assignments||[]);setReady(true);setError('');
   }catch(cause){setReady(false);setError(cause instanceof Error?cause.message:'Unable to load fees.');}
   finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const save=async(event:React.FormEvent<HTMLFormElement>,id:string)=>{
   event.preventDefault();const form=event.currentTarget;const data=new FormData(form);
   setBusy(true);setNotice('');setError('');
   try{
     await post('finance/entrance-exams/'+encodeURIComponent(id)+'/fee',{amount:String(data.get('amount')||''),currency:String(data.get('currency')||'LRD')});
     setNotice('Examination fee configured. No payment has been collected.');await load();
   }catch(cause){setError(cause instanceof Error?cause.message:'Unable to save the fee.');}
   finally{setBusy(false);}
 };
 const settle=async(event:React.FormEvent<HTMLFormElement>,examId:string)=>{
  event.preventDefault();const form=event.currentTarget;const values=new FormData(form);
  const kind=String(values.get('kind')||'PAYMENT');
  const applicant=String(values.get('applicationId')||'');
  if(!applicant){setError('Select an assigned applicant.');return;}
  if(!window.confirm(kind==='WAIVER'?'Record an authorized exemption?':'Confirm Finance independently verified the full examination fee, amount and receipt/reference before recording payment?'))return;
  setBusy(true);setError('');setNotice('');
  try{
   await post('finance/entrance-exams/'+encodeURIComponent(examId)+'/applicants/'+encodeURIComponent(applicant)+'/settlement',{
    kind,channel:kind==='WAIVER'?'WAIVER':String(values.get('channel')||'CASH'),
    reference:String(values.get('reference')||''),reason:String(values.get('reason')||''),verifiedEvidence:true,
   });
   setNotice(kind==='WAIVER'?'Examination fee waiver recorded and audited.':'Payment recorded as Finance-verified. This is not MTN provider confirmation.');
   await load();form.reset();
  }catch(cause){setError(cause instanceof Error?cause.message:'Unable to record the settlement.');}
  finally{setBusy(false);}
 };
 return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
  <h2 className="text-lg font-extrabold text-[#071d3e]">Entrance examination fees</h2>
  <p className="mt-1 text-sm text-slate-600">Applicant exam charges are separate from enrolled-student tuition. Only Finance may configure fees and verify payment or a waiver.</p>
  {loading&&<p role="status" className="mt-3 text-sm">Checking examination fee storage…</p>}
  {!loading&&!ready&&<p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><strong>Not enabled yet.</strong> {error} Migration 103 must be verified before fee configuration is available.</p>}
  {ready&&<>
   {error&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
   {notice&&<p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
   {fees.length===0&&<p className="mt-4 text-sm text-slate-500">No entrance examination sessions recorded.</p>}
   <div className="mt-4 grid gap-3">
    {fees.map(fee=><article key={fee.exam_id} className="rounded-xl border border-slate-200 p-4">
      <h3 className="font-bold text-[#071d3e]">{fee.title}</h3>
      <p className="mt-1 text-xs text-slate-600">{fee.grade_label} · {fee.status} · {fee.applicant_count} applicants</p>
      <p className="mt-2 text-sm font-semibold">{fee.amount==null?'No exam fee configured':fee.currency+' '+fee.amount}</p>
      {canWrite&&fee.amount!=null&&Number(fee.amount)>0&&assignments.some(a=>a.exam_id===fee.exam_id&&!a.settled)&&<form onSubmit={event=>void settle(event,fee.exam_id)} className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
       <label className="text-xs font-bold sm:col-span-2">Assigned applicant
        <select name="applicationId" required defaultValue="" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm">
         <option value="" disabled>Select applicant reference</option>
         {assignments.filter(a=>a.exam_id===fee.exam_id&&!a.settled).map(a=><option key={a.application_id} value={a.application_id}>{a.application_number} — {a.first_name} {a.last_name}</option>)}
        </select>
       </label>
       <label className="text-xs font-bold">Type<select name="kind" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"><option value="PAYMENT">Verified payment</option><option value="WAIVER">Authorized fee waiver</option></select></label>
       <label className="text-xs font-bold">Channel (payment only)<select name="channel" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option></select></label>
       <label className="text-xs font-bold">Receipt / authorization reference<input required minLength={3} maxLength={120} name="reference" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" placeholder="Unique receipt or waiver reference"/></label>
       <label className="text-xs font-bold">Waiver reason (minimum 10 characters)<input name="reason" maxLength={500} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" placeholder="Required only for an authorized waiver"/></label>
       <p className="text-xs text-amber-900 sm:col-span-2">Record only funds independently verified by Finance or a properly authorized waiver. Unconfirmed MTN Mobile Money transactions cannot be marked paid here.</p>
       <button disabled={busy} className="w-fit rounded-lg bg-[#071d3e] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Record verified payment / waiver</button>
      </form>}
      {canWrite&&fee.status==='DRAFT'&&<form onSubmit={e=>void save(e,fee.exam_id)} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs font-bold">Amount<input required name="amount" type="number" min="0" max="1000000" step="0.01" defaultValue={fee.amount||''} className="mt-1 block w-36 rounded-lg border border-slate-300 p-2 text-sm"/></label>
        <label className="text-xs font-bold">Currency<select name="currency" defaultValue={fee.currency||'LRD'} className="mt-1 block rounded-lg border border-slate-300 p-2 text-sm"><option value="LRD">LRD</option><option value="USD">USD</option></select></label>
        <button disabled={busy} className="rounded-lg bg-[#071d3e] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Save exam fee</button>
      </form>}
    </article>)}
   </div>
   <h3 className="mt-6 text-sm font-bold text-[#071d3e]">Finance-verified payment and waiver history</h3>
   <p className="mt-1 text-xs text-slate-600">Payments must be independently verified before creating a settlement record. Mobile Money is not yet connected to this applicant-fee ledger.</p>
   {settlements.length===0?<p className="mt-3 text-sm text-slate-500">No verified entrance exam payments or waivers.</p>:
    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b text-xs text-slate-600"><th className="p-2">Applicant</th><th className="p-2">Type</th><th className="p-2">Amount</th><th className="p-2">Reference</th><th className="p-2">Verified</th></tr></thead><tbody>{settlements.map(s=><tr key={s.id} className="border-b"><td className="p-2">{s.application_number} · {s.first_name} {s.last_name}</td><td className="p-2">{s.kind} / {s.channel}</td><td className="p-2">{s.currency} {s.amount}</td><td className="p-2 font-mono text-xs">{s.reference}</td><td className="p-2">{new Date(s.verified_at).toLocaleDateString('en-LR',{timeZone:'Africa/Monrovia'})}</td></tr>)}</tbody></table></div>}
  </>}
 </section>;
};
