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
  const [verification,setVerification]=useState<{valid:boolean;student?:{name:string;studentNumber:string;className:string|null}}|null>(null);
  const verifyIssuedCard=async()=>{
    if(!staffMode||!card?.qrPayload)return;
    setBusy(true);setError('');setVerification(null);
    try{
      const response=await fetch('/api/student-id/verify',{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},
        body:JSON.stringify({token:card.qrPayload,purpose:'GENERAL'})});
      const answer=await response.json();
      if(!response.ok)throw new Error(answer.error||'Could not verify the displayed ID.');
      setVerification(answer);
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not verify this ID.');}
    finally{setBusy(false);}
  };
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

  // Print in a standalone document so the ERP sidebar and tall page layout cannot
  // add blank pages or shrink the credential. Keep the QR's complete quiet zone.
  const printCard=async()=>{
    if(!card || card.status!=='ACTIVE' || !card.qrPayload)return;
    const printWindow=window.open('','_blank','width=850,height=650');
    if(!printWindow){setError('Allow pop-ups for this school site to print the ID card.');return;}
    const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]||char));
    try{
      const qr=qrcodegen.QrCode.encodeText(card.qrPayload,qrcodegen.QrCode.Ecc.MEDIUM);
      let modules='';
      for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(qr.getModule(x,y))modules+=`<rect x="${x}" y="${y}" width="1" height="1"/>`;
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${qr.size+8} ${qr.size+8}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges"><rect x="-4" y="-4" width="${qr.size+8}" height="${qr.size+8}" fill="white"/><g fill="#0f172a">${modules}</g></svg>`;
      let photo='';
      if(card.photoAvailable){
        const response=await fetch(photoEndpoint,{credentials:'same-origin',cache:'no-store'});
        if(!response.ok)throw new Error('Student photo could not be loaded for printing.');
        const blob=await response.blob();
        photo=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Unable to prepare the photograph.'));reader.readAsDataURL(blob);});
      }
      const name=escapeHtml(card.fullName),school=escapeHtml(card.schoolName);
      const schoolLogo=escapeHtml(new URL('/redeemer-seal.svg?v=3',window.location.origin).toString());
      const studentNumber=escapeHtml(card.studentNumber),studentClass=escapeHtml(card.className||'Not assigned');
      const year=escapeHtml(card.academicYear||'Not assigned');
      const issued=card.issuedAt?new Date(card.issuedAt).toLocaleDateString():'—';
      const expires=card.expiresAt?new Date(card.expiresAt).toLocaleDateString():'—';
      const html=`<!doctype html><html><head><meta charset="utf-8"><title>Digital Student ID - ${name}</title>
<style>
@page { size: A4 portrait; margin: 12mm; }
* { box-sizing: border-box; }
html,body { margin:0; padding:0; background:white; font-family:Arial,Helvetica,sans-serif; }
.card { width:85.6mm; height:54mm; overflow:hidden; border:0.35mm solid #1e3a8a; border-radius:2mm; break-inside:avoid; page-break-inside:avoid; color:#111827; background:white; }
.heading {height:10mm; display:flex; align-items:center; gap:2mm; background:#172554; color:white; padding:1.5mm 3mm; print-color-adjust:exact; -webkit-print-color-adjust:exact;}
.logo {width:7mm;height:7mm;object-fit:contain;flex:none;background:white;border-radius:50%;padding:.4mm;}
.heading-copy {min-width:0;flex:1;}
.school {font-size:10pt;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.caption {font-size:5.5pt;letter-spacing:.7px;margin-top:1mm;}
.middle {height:37mm;display:flex;align-items:center;gap:2mm;padding:2mm 3mm;}
.photo {width:17mm;height:25mm;border:0.2mm solid #cbd5e1;border-radius:1mm;object-fit:cover;flex:none;}
.empty-photo {display:flex;align-items:center;justify-content:center;text-align:center;font-size:6pt;color:#64748b;background:#f1f5f9;}
.details {min-width:0;flex:1;align-self:center; font-size:6.5pt;line-height:1.4;overflow:hidden;}
.name {font-size:9pt;font-weight:800;margin-bottom:1.5mm;overflow-wrap:anywhere;}
.details div {overflow-wrap:anywhere;}
.status {font-weight:800;color:#1e40af;}
.qr {width:23mm;min-width:23mm;text-align:center;margin-left:auto;}
.qr svg {display:block;width:22mm;height:22mm;background:white;}
.scan {font-size:4.5pt;font-weight:800;letter-spacing:.3px;margin-top:.5mm;}
.foot {height:7mm;border-top:.2mm solid #cbd5e1;background:#f8fafc;padding:2mm 3mm;display:flex;justify-content:space-between;font-size:5.5pt;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
@media screen {body{padding:20px;background:#f1f5f9;} .card{box-shadow:0 2px 9px #94a3b8;}}
</style></head><body><article class="card"><div class="heading"><img class="logo" src="${schoolLogo}" alt=""><div class="heading-copy"><div class="school">${school}</div><div class="caption">OFFICIAL DIGITAL STUDENT ID</div></div></div>
<div class="middle">${photo?`<img class="photo" src="${photo}" alt="Student photograph">`:'<div class="photo empty-photo">No photo</div>'}
<div class="details"><div class="name">${name}</div><div>ID: <b>${studentNumber}</b></div><div>Class: ${studentClass}</div><div>Year: ${year}</div><div class="status">ACTIVE</div></div>
<div class="qr">${svg}<div class="scan">SCAN TO VERIFY</div></div></div>
<div class="foot"><span>Issued: ${escapeHtml(issued)}</span><span>Valid until: ${escapeHtml(expires)}</span></div></article>
<script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),250);});<\/script></body></html>`;
      printWindow.document.open();printWindow.document.write(html);printWindow.document.close();
    }catch(cause){printWindow.close();setError(cause instanceof Error?cause.message:'Could not prepare printable ID.');}
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
        <header className="flex items-center gap-3 bg-blue-950 px-4 py-3 text-white"><img src="/redeemer-seal.svg?v=3" alt="Redeemer's International Academy seal" className="h-10 w-10 shrink-0 rounded-full bg-white p-0.5 object-contain"/><div className="min-w-0"><p className="text-sm font-extrabold">{card.schoolName}</p><p className="text-[10px] font-semibold uppercase tracking-widest text-blue-200">Official Digital Student ID</p></div></header>
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
        <button type="button" onClick={()=>void printCard()} className={primaryButton}><Download className="h-4 w-4"/> Print / Save as PDF</button>
        <span className="flex items-center gap-1 text-xs text-emerald-700"><ShieldCheck className="h-4 w-4"/> Signed, revocable verification QR</span>
      </div>}
      {card.status!=='ACTIVE'&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><XCircle className="mr-1 inline h-4 w-4"/> This ID is not active. Contact an authorized school registrar.</p>}
      {staffMode&&card.status==='ACTIVE'&&card.qrPayload&&<div className="mt-3">
        <button type="button" disabled={busy} onClick={()=>void verifyIssuedCard()} className="rounded-lg border border-blue-300 px-4 py-2 text-sm font-bold text-blue-800 disabled:opacity-40">Verify this displayed ID</button>
        <p className="mt-1 text-xs text-slate-500">Checks the issued QR credential directly with the verification service. This tests server-side verification; it does not test scanning a photographed QR.</p>
        {verification&&<p role="status" className={`mt-2 rounded-lg p-3 text-sm ${verification.valid?'bg-emerald-50 text-emerald-900':'bg-red-50 text-red-900'}`}>{verification.valid?`Verified active ID: ${verification.student?.name} · ${verification.student?.studentNumber}.`:'ID is invalid, expired or revoked.'}</p>}
      </div>}
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
  const [scanning,setScanning]=useState(false);
  const scanWithCamera=async()=>{
    setError('');
    const picker=document.createElement('input');
    picker.type='file';
    picker.accept='image/*';
    // On mobile, the browser offers a camera or an existing photo. Desktop
    // browsers can upload a QR screenshot directly.
    picker.onchange=async()=>{
      const file=picker.files?.[0];if(!file)return;
      setScanning(true);setResult(null);
      try{
        if(file.size>8*1024*1024)throw new Error('Choose a QR image smaller than 8 MB.');
        const image=await createImageBitmap(file);
        try{
          let decoded='';
          const Detector=(window as unknown as {BarcodeDetector?:new(options:{formats:string[]})=>{detect(source:ImageBitmap):Promise<Array<{rawValue:string}> >}}).BarcodeDetector;
          if(Detector){
            try{
              const detected=await new Detector({formats:['qr_code']}).detect(image);
              decoded=detected.find(item=>item.rawValue.startsWith('RIA1.'))?.rawValue||'';
            }catch{ /* Use the bundled offline decoder if native decoding fails. */ }
          }
          if(!decoded){
            const canvas=document.createElement('canvas');
            const maximumDimension=1600,ratio=Math.min(1,maximumDimension/Math.max(image.width,image.height));
            canvas.width=Math.max(1,Math.round(image.width*ratio));
            canvas.height=Math.max(1,Math.round(image.height*ratio));
            const context=canvas.getContext('2d',{willReadFrequently:true});
            if(!context)throw new Error('QR image processing is not available in this browser.');
            context.drawImage(image,0,0,canvas.width,canvas.height);
            const pixels=context.getImageData(0,0,canvas.width,canvas.height);
            const {default:jsQR}=await import('../logic/jsQRDecoder.js');
            decoded=jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'})?.data||'';
          }
          if(!decoded.startsWith('RIA1.'))throw new Error('No Redeemer student QR credential was found. Upload a clear image of the QR code, not the printed student number.');
          setToken(decoded);
        }finally{image.close();}
      }catch(cause){setError(cause instanceof Error?cause.message:'Could not read QR code.');}
      finally{setScanning(false);}
    };
    picker.click();
  };
  const verify=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!/^RIA1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/i.test(token.trim())){
      setError('This is a student number or incomplete scan, not an encoded QR credential. Upload a clear QR image or use Verify this displayed ID in the student profile.');
      setResult(null);return;
    }
    setBusy(true);setError('');setResult(null);
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
    <button type="button" disabled={scanning||busy} onClick={()=>void scanWithCamera()} className="mt-2 rounded-lg border border-blue-300 px-3 py-2 text-xs font-bold text-blue-800 disabled:opacity-40">{scanning?'Reading QR…':'Scan / upload QR photo'}</button>
    <p className="mt-1 text-xs text-slate-500">Use a phone camera or upload a QR screenshot. The decoder works offline even when native browser QR support is unavailable; then click Verify credential.</p>
    {error&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {result&&<p role="status" className={`mt-3 rounded-lg p-3 text-sm ${result.valid?'bg-emerald-50 text-emerald-900':'bg-red-50 text-red-900'}`}>{result.valid?`Valid school ID: ${result.student?.name} · ${result.student?.studentNumber} · ${result.student?.className||'Class not assigned'}. Check service eligibility separately.`:'ID invalid, expired or revoked. Do not treat this scan as valid identification.'}</p>}
  </details>;
};
