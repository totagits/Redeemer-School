import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, IdCard, LoaderCircle, ShieldCheck, XCircle } from 'lucide-react';
import { qrcodegen } from '../logic/qrcodegen.ts';

type Card = {
  studentId: string;
  studentNumber: string;
  fullName: string;
  schoolName: string;
  className: string | null;
  academicYear: string | null;
  photoAvailable: boolean;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'NOT_ISSUED';
  issuedAt: string | null;
  expiresAt: string | null;
  qrPayload: string | null;
};

const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-40';

function SecureQR({ payload }: { payload: string }) {
  const qr = useMemo(() => qrcodegen.QrCode.encodeText(payload, qrcodegen.QrCode.Ecc.MEDIUM), [payload]);
  const modules: Array<[number,number]> = [];
  for (let row=0; row<qr.size; row++) for (let col=0; col<qr.size; col++) {
    if (qr.getModule(col,row)) modules.push([col,row]);
  }
  return <svg role="img" aria-label="Scannable school-issued digital student ID QR code" viewBox={`-4 -4 ${qr.size+8} ${qr.size+8}`} className="h-32 w-32 shrink-0 bg-white p-1" shapeRendering="crispEdges">
    <rect x="-4" y="-4" width={qr.size+8} height={qr.size+8} fill="white" />
    {modules.map(([x,y])=><rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#111827" />)}
  </svg>;
}

export const DigitalStudentId: React.FC<{ studentId?: string; csrfToken?: string; staffMode?: boolean }> = ({studentId,csrfToken='',staffMode=false}) => {
  const [card,setCard]=useState<Card|null>(null);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [photoReviewed,setPhotoReviewed]=useState(false);
  const endpoint=staffMode? `/api/student-id/students/${encodeURIComponent(studentId||'')}` : '/api/student-id/me';
  const photoEndpoint=staffMode? `/api/student-id/students/${encodeURIComponent(studentId||'')}/photo` : '/api/student-id/me/photo';

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const res=await fetch(endpoint,{credentials:'same-origin',cache:'no-store'});
      const result=await res.json();
      if(!res.ok)throw new Error(result.error||'Could not load the student ID.');
      setCard(result.card as Card);
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not load the student ID.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[endpoint]);
  const change=async(action:'issue'|'revoke')=>{
    if(!staffMode||!studentId)return;
    if(action==='issue'&&!photoReviewed){setError('Review the student photo and confirm the checkbox before issuing a credential.');return;}
    if(action==='revoke'&&!window.confirm('Revoke this student ID immediately? The printed QR code will stop verifying.'))return;
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch(`/api/student-id/students/${encodeURIComponent(studentId)}/${action}`,{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},
        body:JSON.stringify(action==='issue'?{photoReviewed:true}:{})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Could not update the student ID.');
      setNotice(action==='issue'?'School-issued digital ID activated.':'Student ID revoked; the old QR code is no longer valid.');
      setPhotoReviewed(false);
      await load();
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not update the student ID.');}
    finally{setBusy(false);}
  };

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <style>{`@media print {
      @page { size: A4; margin: 12mm; }
      body * { visibility: hidden !important; }
      #school-digital-id-print, #school-digital-id-print * { visibility: visible !important; }
      #school-digital-id-print { position: fixed !important; left: 12mm !important; top: 12mm !important; width: 86mm !important; min-height: 54mm !important; box-shadow: none !important; break-inside: avoid !important; }
      #school-digital-id-print .id-qr { width: 25mm !important; height: 25mm !important; }
    }`}</style>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="flex items-center gap-2 text-lg font-extrabold text-slate-900"><IdCard className="h-5 w-5 text-blue-700"/> Digital Student ID</h3>
        <p className="mt-1 text-xs text-slate-600">{staffMode?'Registrar: issue, inspect or revoke the learner credential.':'Your school-issued identification card.'}</p>
      </div>
      <button type="button" onClick={()=>void load()} disabled={busy||loading} className="rounded-lg border px-3 py-2 text-xs font-bold">Refresh ID</button>
    </div>
    {error&&<p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice&&<p role="status" className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {loading?<div className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin"/> Loading card…</div>:card&&<>
      <div id="school-digital-id-print" className="mx-auto max-w-xl overflow-hidden rounded-2xl border-2 border-blue-900 bg-white shadow">
        <header className="bg-blue-950 px-4 py-3 text-white"><p className="text-sm font-extrabold">{card.schoolName}</p><p className="text-[10px] font-semibold uppercase tracking-widest text-blue-200">Official Digital Student ID</p></header>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="h-28 w-24 shrink-0 overflow-hidden rounded-lg border bg-slate-100">
            {card.photoAvailable?<img src={photoEndpoint} alt={`School photograph of ${card.fullName}`} className="h-full w-full object-cover"/>:
            <div className="flex h-full items-center justify-center px-2 text-center text-xs text-slate-500">Student photo not available</div>}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-base font-extrabold text-slate-950">{card.fullName}</p>
            <p className="text-xs text-slate-600">ID: <b>{card.studentNumber}</b></p>
            <p className="text-xs text-slate-600">Class: {card.className||'Not assigned'}</p>
            <p className="text-xs text-slate-600">Academic year: {card.academicYear||'Not assigned'}</p>
            <p className="text-xs font-bold text-blue-900">Status: {card.status.replaceAll('_',' ')}</p>
          </div>
          {card.status==='ACTIVE'&&card.qrPayload?<div className="id-qr text-center"><SecureQR payload={card.qrPayload}/><p className="text-[9px] font-bold uppercase text-slate-600">Scan to verify</p></div>:null}
        </div>
        <footer className="flex items-center justify-between gap-2 border-t bg-slate-50 px-4 py-2 text-[10px] text-slate-600">
          <span>Issued: {card.issuedAt?new Date(card.issuedAt).toLocaleDateString():'Not issued'}</span>
          <span>Valid until: {card.expiresAt?new Date(card.expiresAt).toLocaleDateString():'—'}</span>
        </footer>
      </div>
      {card.status==='ACTIVE'&&card.qrPayload&&<div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={()=>window.print()} className={primaryButton}><Download className="h-4 w-4"/> Print / Save as PDF</button>
        <span className="flex items-center gap-1 text-xs text-emerald-700"><ShieldCheck className="h-4 w-4"/> Signed, revocable verification QR</span>
      </div>}
      {card.status!=='ACTIVE'&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><XCircle className="mr-1 inline h-4 w-4"/> This ID is not active. Contact an authorized school registrar.</p>}
      {staffMode&&<div className="mt-4 border-t pt-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={photoReviewed} onChange={event=>setPhotoReviewed(event.target.checked)}/> I have reviewed the student's photograph and enrollment.</label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={busy||!photoReviewed||!card.photoAvailable} onClick={()=>void change('issue')} className={primaryButton}><CheckCircle2 className="h-4 w-4"/> {card.status==='ACTIVE'?'Renew / reissue ID':'Issue Digital ID'}</button>
          <button disabled={busy||card.status!=='ACTIVE'} onClick={()=>void change('revoke')} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-800 disabled:opacity-40">Revoke ID</button>
        </div>
      </div>}
      <p className="mt-3 text-xs text-slate-500">The QR contains an opaque, signed credential—not private student information. It verifies school identity only; library, meal-plan and event eligibility must be checked separately.</p>
    </>}
  </section>;
};

export const DigitalStudentIdVerifier: React.FC<{csrfToken:string}> = ({csrfToken}) => {
  const [token,setToken]=useState('');
  const [purpose,setPurpose]=useState('GENERAL');
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<{valid:boolean;student?:{name:string;studentNumber:string;className:string|null}}|null>(null);
  const [error,setError]=useState('');
  const verify=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setBusy(true);setError('');setResult(null);
    try{
      const response=await fetch('/api/student-id/verify',{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},
        body:JSON.stringify({token:token.trim(),purpose})});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'Could not verify ID.');
      setResult(body);
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not verify ID.');}
    finally{setBusy(false);}
  };
  return <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <summary className="cursor-pointer font-extrabold text-slate-900">Verify a Digital Student ID (authorized staff)</summary>
    <p className="mt-2 text-xs text-slate-600">Scan a student QR using a compatible scanner that types the code, or paste its decoded RIA1 credential below. This confirms identity only; library, meal and event entitlements require their own checks.</p>
    <form onSubmit={verify} className="mt-3 grid gap-3 sm:grid-cols-3">
      <label className="text-sm font-semibold sm:col-span-2">Scanned credential<input required value={token} onChange={e=>setToken(e.target.value)} autoComplete="off" placeholder="RIA1.…" className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs"/></label>
      <label className="text-sm font-semibold">Verification purpose<select value={purpose} onChange={e=>setPurpose(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="GENERAL">School identity</option><option value="LIBRARY">Library entry</option><option value="MEAL">Meal service</option><option value="EVENT">Campus event</option></select></label>
      <button disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40 sm:col-span-3">{busy?'Verifying…':'Verify credential'}</button>
    </form>
    {error&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {result&&<p role="status" className={`mt-3 rounded-lg p-3 text-sm ${result.valid?'bg-emerald-50 text-emerald-900':'bg-red-50 text-red-900'}`}>{result.valid?`Valid school ID: ${result.student?.name} · ${result.student?.studentNumber} · ${result.student?.className||'Class not assigned'}. Check service eligibility separately.`:'ID invalid, expired or revoked. Do not treat this scan as valid identification.'}</p>}
  </details>;
};
