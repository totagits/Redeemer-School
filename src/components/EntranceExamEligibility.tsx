import React, {useState} from 'react';

type Candidate = {application_id:string;application_number:string;first_name:string;last_name:string;application_status:string;assignment_status:string;fee_amount:string|null;currency:string|null;settlement_kind:string|null;settlement_reference:string|null;eligibility_status:string};
type EligibilityResponse = {candidates:Candidate[];note?:string;error?:string};
export const EntranceExamEligibility:React.FC<{examId:string}>=({examId})=>{
 const [rows,setRows]=useState<Candidate[]|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const check=async()=>{
   setBusy(true);setError('');
   try{
     const response=await fetch('/api/operations/admissions/entrance-exams/'+encodeURIComponent(examId)+'/eligibility',{credentials:'same-origin',cache:'no-store'});
     const result:EligibilityResponse=await response.json();
     if(!response.ok)throw Error(result.error||'Unable to verify examination eligibility.');
     setRows(result.candidates||[]);
   }catch(cause){setRows(null);setError(cause instanceof Error?cause.message:'Could not load eligibility.');}
   finally{setBusy(false);}
 };
 return <section aria-label="Examination eligibility" className="mt-4 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div><h4 className="text-sm font-extrabold text-[#071d3e]">Examination eligibility</h4><p className="text-xs text-slate-600">Staff-only preview of assignment and Finance settlement. This does not grant examination access.</p></div>
   <button type="button" disabled={busy} onClick={()=>void check()} className="rounded-lg border border-[#273a99] bg-white px-3 py-2 text-xs font-bold text-[#273a99] disabled:opacity-60">{busy?'Checking…':'Check eligibility'}</button>
  </div>
  {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  {rows&&<div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs">
   <thead><tr className="border-b text-slate-700"><th className="p-2">Applicant</th><th className="p-2">Verified settlement</th><th className="p-2">Assignment</th><th className="p-2">Eligibility</th></tr></thead>
   <tbody>{rows.map(candidate=><tr key={candidate.application_id} className="border-b border-slate-200">
    <td className="p-2"><strong>{candidate.application_number}</strong><span className="block">{candidate.first_name} {candidate.last_name}</span></td>
    <td className="p-2">{candidate.settlement_kind==='PAYMENT'?('Payment — '+candidate.currency+' '+candidate.fee_amount):candidate.settlement_kind==='WAIVER'?'Authorized waiver':candidate.fee_amount==='0'?'No examination fee':'No verified settlement'}</td>
    <td className="p-2">{candidate.assignment_status.replaceAll('_',' ')}</td>
    <td className="p-2"><span className={'font-bold '+(candidate.eligibility_status==='ELIGIBLE'?'text-emerald-700':'text-amber-800')}>{candidate.eligibility_status.replaceAll('_',' ')}</span></td>
   </tr>)}</tbody></table>{rows.length===0&&<p className="p-2 text-sm text-slate-600">No assigned applicants for this examination.</p>}</div>}
 </section>;
};
