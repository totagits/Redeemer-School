import { EntranceExamQuestions } from './EntranceExamQuestions.tsx';
import React, { useCallback, useEffect, useState } from 'react';
import { EntranceExamEligibility } from './EntranceExamEligibility.tsx';
import { examTimeOptions, liberiaExamInstant, liberiaExamDate, liberiaExamTime } from '../logic/entranceExamTime.ts';

type Exam = { id: string; title: string; grade_label: string; mode: 'PAPER'|'ONLINE'|'INTERVIEW'; venue: string; starts_at: string; ends_at: string; status: string; applicant_count: number };
type Applicant = { id: string; application_number: string; first_name?: string; last_name?: string; status: string };
type Props = { applications: Applicant[]; canWrite: boolean; canApproveQuestions: boolean; post: (path: string, body: Record<string, unknown>) => Promise<Record<string, unknown>> };

export const EntranceExamScheduling: React.FC<Props> = ({ applications, canWrite, canApproveQuestions, post }) => {
  const [exams,setExams] = useState<Exam[]>([]);
  const [loading,setLoading] = useState(true);
  const [ready,setReady] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const [editingExamId,setEditingExamId] = useState('');
  const refresh = useCallback(async () => {
    try {
      const response=await fetch('/api/operations/admissions/entrance-exams',{credentials:'same-origin'});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error || 'Could not load entrance examinations.');
      setExams(result.exams || []);setReady(true);setError('');
    }catch(cause){setReady(false);setError(cause instanceof Error?cause.message:'Could not load examinations.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const perform=async(path:string,body:Record<string,unknown>,message:string)=>{
    setBusy(true);setError('');setNotice('');
    try{await post(path,body);setNotice(message);await refresh();}
    catch(cause){setError(cause instanceof Error?cause.message:'The operation could not be completed.');}
    finally{setBusy(false);}
  };
  const create=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const form=event.currentTarget;const values=new FormData(form);
    try {
      const date=String(values.get('examDate')||'');
      const startsAt=liberiaExamInstant(date,String(values.get('startTime')||''));
      const endsAt=liberiaExamInstant(date,String(values.get('endTime')||''));
      const begins=new Date(startsAt),ends=new Date(endsAt);
      if(ends<=begins || ends.getTime()-begins.getTime()>8*60*60*1000){setError('End time must be after start time and within eight hours on the selected date.');return;}
      await perform('admissions/entrance-exams',{
        title:String(values.get('title')||''),gradeLabel:String(values.get('gradeLabel')||''),
        mode:String(values.get('mode')||'PAPER'),venue:String(values.get('venue')||''),
        startsAt,endsAt,
      },'Private examination draft created. Assign applicants before scheduling.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Invalid examination date or time.');}
  };
  const eligible=applications.filter(app=>!['REJECTED','WITHDRAWN','ENROLLED'].includes(app.status));
  return <section aria-labelledby="entrance-exams-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <h2 id="entrance-exams-heading" className="text-lg font-extrabold text-[#071d3e]">Entrance examination scheduling</h2>
    <p className="mt-1 text-sm text-slate-600">Draft, assign, and schedule entrance examinations for applicants. Results remain private and are not posted to school announcements.</p>
    {loading&&<p role="status" className="mt-3 text-sm text-slate-600">Checking entrance examination database readiness…</p>}
    {!loading&&!ready&&<p role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><strong>Not enabled in staging yet.</strong> {error} Do not enter or announce examination results until the approved database migration and workflows are ready.</p>}
    {ready&&<>
      {error&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice&&<p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {canWrite&&<form onSubmit={event=>void create(event)} className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-semibold text-slate-800">Examination title<input name="title" required minLength={3} maxLength={160} placeholder="Grade 4 entrance assessment" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5"/></label>
        <label className="text-sm font-semibold text-slate-800">Entry grade / level<input name="gradeLabel" required maxLength={100} placeholder="Grade 4" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5"/></label>
        <label className="text-sm font-semibold text-slate-800">Examination mode<select name="mode" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5"><option value="PAPER">Paper examination</option><option value="ONLINE">Computer-based examination</option><option value="INTERVIEW">Interview / assessment</option></select></label>
        <label className="text-sm font-semibold text-slate-800">Examination date (Liberia)<input required name="examDate" type="date" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5"/></label>
        <label className="text-sm font-semibold text-slate-800">Start time (Liberia · GMT)<select required name="startTime" defaultValue="09:00" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5">{examTimeOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="text-sm font-semibold text-slate-800">End time (Liberia · GMT)<select required name="endTime" defaultValue="10:00" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5">{examTimeOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="text-sm font-semibold text-slate-800">Venue or examination instructions<input required name="venue" maxLength={200} placeholder="Redeemer campus, Room 1" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5"/></label>
        <div className="sm:col-span-2 lg:col-span-3"><button type="submit" disabled={busy} className="rounded-lg bg-[#071d3e] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Create private exam draft</button></div>
      </form>}
      <div className="mt-5 space-y-3">
        {exams.length===0&&<p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No entrance exam sessions recorded yet.</p>}
        {exams.map(exam=><article key={exam.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h3 className="font-bold text-[#071d3e]">{exam.title}</h3><p className="mt-1 text-xs text-slate-600">{exam.grade_label} · {exam.mode} · {exam.venue}</p><p className="mt-1 text-sm text-slate-700">{new Date(exam.starts_at).toLocaleString('en-LR',{timeZone:'Africa/Monrovia'})} – {new Date(exam.ends_at).toLocaleTimeString('en-LR',{timeZone:'Africa/Monrovia',hour:'numeric',minute:'2-digit'})}</p></div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{exam.status.replaceAll('_',' ')} · {exam.applicant_count} assigned</span>
          </div>
          {canWrite&&['DRAFT','SCHEDULED'].includes(exam.status)&&<div className="mt-3">
            <button type="button" onClick={()=>setEditingExamId(editingExamId===exam.id?'':exam.id)} className="rounded-lg border border-[#071d3e] px-3 py-2 text-xs font-bold text-[#071d3e]">Correct examination date/time</button>
            {editingExamId===exam.id&&<form className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-amber-50 p-3" onSubmit={async event=>{
              event.preventDefault();const values=new FormData(event.currentTarget);
              try{
                const examDate=String(values.get('examDate')||'');
                const startsAt=liberiaExamInstant(examDate,String(values.get('startTime')||''));
                const endsAt=liberiaExamInstant(examDate,String(values.get('endTime')||''));
                if(new Date(endsAt)<=new Date(startsAt)){setError('The end time must follow the start time.');return;}
                if(!window.confirm('Correct this examination schedule? Existing applicant assignments remain linked. No invitations will be sent.'))return;
                await perform('admissions/entrance-exams/'+encodeURIComponent(exam.id)+'/reschedule',{startsAt,endsAt},'Examination time corrected and recorded in the audit log.');
                setEditingExamId('');
              }catch(cause){setError(cause instanceof Error?cause.message:'Invalid examination time.');}
            }}>
              <label className="text-xs font-semibold">Date<input required type="date" name="examDate" defaultValue={liberiaExamDate(exam.starts_at)} className="mt-1 block rounded-lg border p-2"/></label>
              <label className="text-xs font-semibold">Start (GMT)<select name="startTime" defaultValue={liberiaExamTime(exam.starts_at)} className="mt-1 block rounded-lg border p-2">{examTimeOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="text-xs font-semibold">End (GMT)<select name="endTime" defaultValue={liberiaExamTime(exam.ends_at)} className="mt-1 block rounded-lg border p-2">{examTimeOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <button disabled={busy} className="rounded-lg bg-[#071d3e] px-4 py-2 text-sm font-bold text-white">Save corrected schedule</button>
            </form>}
          </div>}
          {canWrite&&['DRAFT','SCHEDULED'].includes(exam.status)&&<form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={event=>{event.preventDefault();const values=new FormData(event.currentTarget);void perform('admissions/entrance-exams/'+encodeURIComponent(exam.id)+'/assign',{applicationId:String(values.get('applicationId')||'')},'Applicant assigned to entrance examination.');}}>
            <label className="min-w-56 flex-1 text-xs font-semibold text-slate-700">Assign eligible applicant<select required name="applicationId" defaultValue="" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"><option value="" disabled>Select application reference</option>{eligible.map(app=><option key={app.id} value={app.id}>{app.application_number} — {app.first_name} {app.last_name}</option>)}</select></label>
            <button type="submit" disabled={busy||!eligible.length} className="rounded-lg border border-[#071d3e] px-3 py-2.5 text-sm font-bold text-[#071d3e] disabled:opacity-50">Assign applicant</button>
          </form>}
          {exam.mode==='ONLINE'&&exam.status==='DRAFT'&&<EntranceExamQuestions examId={exam.id} post={post} canWrite={canWrite} canApprove={canApproveQuestions}/>}
          <EntranceExamEligibility examId={exam.id} canWrite={canWrite&&exam.mode==='ONLINE'} post={post} />
          {canWrite&&exam.status==='DRAFT'&&<button type="button" disabled={busy||Number(exam.applicant_count)<1} onClick={()=>{if(window.confirm('Schedule this entrance examination for its assigned applicants? This does not send invitations.')) void perform('admissions/entrance-exams/'+encodeURIComponent(exam.id)+'/schedule',{},'Examination scheduled. Invitation delivery is not yet enabled.');}} className="mt-3 rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-[#071d3e] disabled:cursor-not-allowed disabled:opacity-50">Confirm examination schedule</button>}
        </article>)}
      </div>
      <p className="mt-4 text-xs text-slate-500">Private scheduling only. Exam questions, candidate login, grading, approvals, and secure result notifications will be enabled in subsequent verified phases.</p>
    </>}
  </section>;
};
