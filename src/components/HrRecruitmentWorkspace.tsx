import { useEffect, useState } from 'react';
type Job={id:string;code:string;title:string;department:string;description:string;requirements:string;positions:number;closing_on:string;status:string;revision:number};
type Applicant={id:string;first_name:string;last_name:string;email:string;phone:string;qualifications:string;status:string;revision:number;staff_record_id?:string;employee_number?:string};
type Interview={id:string;application_id:string;scheduled_at:string;interviewer:string;venue:string;status:string;feedback:string};
type Event={id:string;application_id?:string;action:string;note:string;actor_name:string;created_at:string};
type Post=(path:string,body:Record<string,unknown>)=>Promise<Record<string,unknown>>;
const field='mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm font-normal';
const button='rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50';
const card='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const readable=(value:string)=>value.replaceAll('_',' ').toLowerCase();
const checks=[['identityVerified','Identity verified'],['referencesChecked','References checked'],['contractSigned','Contract signed'],['safeguardingComplete','Safeguarding induction complete'],['orientationComplete','School orientation complete']] as const;

export function HrRecruitmentWorkspace({post,onStaffUpdated}:{post:Post;onStaffUpdated:()=>Promise<void>}) {
 const [jobs,setJobs]=useState<Job[]>([]),[selected,setSelected]=useState(''),[job,setJob]=useState<Job|null>(null);
 const [apps,setApps]=useState<Applicant[]>([]),[interviews,setInterviews]=useState<Interview[]>([]),[events,setEvents]=useState<Event[]>([]);
 const [canManage,setCanManage]=useState(false),[canApprove,setCanApprove]=useState(false);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function get(path:string,signal?:AbortSignal){const response=await fetch('/api/operations/'+path,{credentials:'same-origin',cache:'no-store',signal});const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not load recruitment.');return body;}
 async function load(id=selected,signal?:AbortSignal){
  const list=await get('hr/recruitment',signal);
  const detail=id?await get('hr/recruitment/'+encodeURIComponent(id),signal):null;
  if(signal?.aborted)return;
  setJobs(list.vacancies);setCanManage(list.canManage);setCanApprove(list.canApprove);
  if(detail){setJob(detail.vacancy);setApps(detail.applications);setInterviews(detail.interviews);setEvents(detail.events);}
 }
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);setError('');setJob(null);setApps([]);setInterviews([]);setEvents([]);
  void load(selected,controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[selected]);
 async function save(path:string,body:Record<string,unknown>,message:string,form?:HTMLFormElement){
  setBusy(true);setError('');setNotice('');
  try{await post(path,body);if(path.endsWith('/onboard'))await onStaffUpdated();await load();form?.reset();setNotice(message);}
  catch(e){setError(e instanceof Error?e.message:'The recruitment action could not be saved.');}finally{setBusy(false);}
 }
 const submit=(action:(values:FormData,form:HTMLFormElement)=>void)=>(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();action(new FormData(event.currentTarget),event.currentTarget);};
 const today=new Date().toISOString().slice(0,10);
 if(loading)return <p role="status" className={card}>Loading recruitment records…</p>;
 return <div className="space-y-5">
  <section className={card}><p className="text-xs font-bold uppercase tracking-wide text-blue-800">Staff recruitment</p><h2 className="mt-1 text-xl font-extrabold">Recruitment & onboarding</h2><p className="mt-2 text-sm leading-6 text-slate-600">HR manages vacancies, candidates, interviews and onboarding. A Principal or School Administrator authorizes vacancies and hiring. Use the school-approved application route and record interview and offer evidence here.</p></section>
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}
  {notice&&<p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}
  <section className={card}><label className="text-sm font-bold">Vacancy<select disabled={busy} value={selected} onChange={e=>setSelected(e.target.value)} className={field}><option value="">Choose vacancy</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.code} · {j.title} · {readable(j.status)}</option>)}</select></label>{!jobs.length&&!error&&<p className="mt-3 text-sm text-slate-600">No vacancies have been recorded.</p>}</section>
  {canManage&&<details className={card}><summary className="cursor-pointer font-bold">Create vacancy</summary><form onSubmit={submit((v,form)=>void save('hr/recruitment',{code:v.get('code'),title:v.get('title'),department:v.get('department'),description:v.get('description'),requirements:v.get('requirements'),positions:Number(v.get('positions')),closingOn:v.get('closingOn')},'Vacancy saved as a draft for another authorized leader to approve.',form))} className="mt-4 grid gap-3 sm:grid-cols-2">
   <label className="text-sm font-semibold">Vacancy code<input required name="code" maxLength={40} pattern="[A-Za-z0-9_-]{2,40}" className={field}/></label>
   <label className="text-sm font-semibold">Job title<input required name="title" maxLength={120} className={field}/></label>
   <label className="text-sm font-semibold">Department<input required name="department" maxLength={120} className={field}/></label>
   <label className="text-sm font-semibold">Positions<input required name="positions" type="number" min={1} max={100} defaultValue={1} className={field}/></label>
   <label className="text-sm font-semibold">Closing date<input required name="closingOn" type="date" min={today} className={field}/></label>
   <label className="text-sm font-semibold sm:col-span-2">Job description<textarea required name="description" maxLength={5000} rows={3} className={field}/></label>
   <label className="text-sm font-semibold sm:col-span-2">Requirements<textarea required name="requirements" maxLength={5000} rows={3} className={field}/></label>
   <div><button disabled={busy} className={button}>Save vacancy draft</button></div>
  </form></details>}
  {job&&<>
   <section className={card}><h3 className="text-lg font-extrabold">{job.title}</h3><p className="mt-1 text-sm text-slate-600">{job.code} · {job.department} · {job.positions} position(s) · Closing {String(job.closing_on).slice(0,10)}</p><p className="mt-2 inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase text-blue-900">{readable(job.status)}</p><h4 className="mt-4 font-bold">Job description</h4><p className="mt-1 whitespace-pre-wrap text-sm">{job.description}</p><h4 className="mt-3 font-bold">Requirements</h4><p className="mt-1 whitespace-pre-wrap text-sm">{job.requirements}</p>
    <div className="mt-4 flex flex-wrap gap-2">
     {canApprove&&job.status==='DRAFT'&&<button disabled={busy} onClick={()=>void save('hr/recruitment/'+job.id+'/status',{revision:job.revision,status:'APPROVED'},'Vacancy approved. HR can open intake.')} className={button}>Approve vacancy</button>}
     {canManage&&job.status==='APPROVED'&&<button disabled={busy} onClick={()=>void save('hr/recruitment/'+job.id+'/status',{revision:job.revision,status:'OPEN'},'Vacancy open for HR intake. Publish approved application instructions through School website content.')} className={button}>Open vacancy</button>}
     {canManage&&job.status!=='CLOSED'&&<button disabled={busy} onClick={()=>void save('hr/recruitment/'+job.id+'/status',{revision:job.revision,status:'CLOSED'},'Vacancy closed to new applications.')} className="rounded-lg border p-2 text-sm font-bold">Close intake</button>}
    </div><p className="mt-3 text-xs text-slate-600">Publish approved vacancy information and application instructions through the school website editor. Candidate records remain in this restricted workspace.</p>
   </section>
   {canManage&&job.status==='OPEN'&&<details className={card}><summary className="cursor-pointer font-bold">Record application</summary><form onSubmit={submit((v,form)=>void save('hr/recruitment/'+job.id+'/applications',Object.fromEntries(v),'Applicant recorded.',form))} className="mt-4 grid gap-3 sm:grid-cols-2">
    <label className="text-sm font-semibold">First name<input required name="firstName" maxLength={120} className={field}/></label><label className="text-sm font-semibold">Last name<input required name="lastName" maxLength={120} className={field}/></label>
    <label className="text-sm font-semibold">Applicant email<input required name="email" type="email" maxLength={254} className={field}/></label><label className="text-sm font-semibold">Phone<input name="phone" maxLength={40} className={field}/></label>
    <label className="text-sm font-semibold sm:col-span-2">Qualifications and application summary<textarea required name="qualifications" maxLength={3000} rows={3} className={field}/></label><div><button disabled={busy} className={button}>Save application</button></div>
   </form></details>}
   <section className={card}><h3 className="text-lg font-extrabold">Applicant pipeline</h3>{!apps.length&&<p className="mt-3 text-sm text-slate-600">No applications recorded for this vacancy.</p>}
    <div className="mt-4 space-y-4">{apps.map(a=><details key={a.id+'-'+a.revision} className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-bold">{a.first_name} {a.last_name} <span className="ml-2 text-xs font-semibold uppercase text-blue-800">{readable(a.status)}</span></summary>
     <p className="mt-3 text-sm">{a.email} · {a.phone||'Phone not recorded'}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{a.qualifications}</p>
     {interviews.filter(i=>i.application_id===a.id).map(i=><section key={i.id} className="mt-3 rounded-lg bg-slate-50 p-3"><h4 className="text-sm font-bold">Interview · {readable(i.status)}</h4><p className="mt-1 text-sm">{new Date(i.scheduled_at).toLocaleString()} · {i.interviewer} · {i.venue}</p>{i.feedback&&<p className="mt-2 whitespace-pre-wrap text-sm">{i.feedback}</p>}
      {canManage&&i.status==='SCHEDULED'&&a.status==='INTERVIEW_SCHEDULED'&&<form onSubmit={submit((v)=>void save('hr/applications/'+a.id+'/interviews/'+i.id+'/complete',{revision:a.revision,feedback:v.get('feedback')},'Interview feedback recorded.'))} className="mt-3"><label className="text-sm font-semibold">Interview feedback<textarea required name="feedback" minLength={10} maxLength={3000} className={field}/></label><button disabled={busy} className={button+' mt-2'}>Complete interview</button></form>}
     </section>)}
     {canManage&&['SHORTLISTED','INTERVIEWED'].includes(a.status)&&<form onSubmit={submit(v=>void save('hr/applications/'+a.id+'/interviews',{revision:a.revision,scheduledAt:new Date(String(v.get('scheduledAt'))).toISOString(),interviewer:v.get('interviewer'),venue:v.get('venue')},'Interview scheduled.'))} className="mt-4 grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
      <label className="text-sm font-semibold">Interview date and time<input required name="scheduledAt" type="datetime-local" className={field}/></label><label className="text-sm font-semibold">Interviewer / panel<input required name="interviewer" maxLength={120} className={field}/></label><label className="text-sm font-semibold">Venue or meeting reference<input required name="venue" maxLength={200} className={field}/></label><button disabled={busy} className={button}>Schedule interview</button>
     </form>}
     {(canManage||canApprove)&&!['ONBOARDED','DECLINED','WITHDRAWN'].includes(a.status)&&<form onSubmit={submit(v=>void save('hr/applications/'+a.id+'/action',{revision:a.revision,action:v.get('action'),note:v.get('note'),offerReference:v.get('offerReference')},'Hiring stage updated.'))} className="mt-4 space-y-3 rounded-lg border p-3">
      <label className="text-sm font-semibold">Next action<select name="action" required className={field}><option value="">Choose action</option>
       {canManage&&a.status==='APPLIED'&&<option value="SHORTLIST">Shortlist for interview</option>}
       {canManage&&a.status==='INTERVIEWED'&&<option value="RECOMMEND">Recommend hiring</option>}
       {canApprove&&a.status==='RECOMMENDED'&&<option value="APPROVE">Authorize hire</option>}
       {canApprove&&['APPLIED','SHORTLISTED','INTERVIEWED','RECOMMENDED'].includes(a.status)&&<option value="DECLINE">Decline application</option>}
       {canManage&&a.status==='APPROVED'&&<option value="OFFER">Record offer issued</option>}
       {canManage&&a.status==='OFFERED'&&<option value="ACCEPT">Record candidate acceptance</option>}
       {canManage&&<option value="WITHDRAW">Record withdrawal</option>}
      </select></label>
      {canManage&&a.status==='APPROVED'&&<label className="block text-sm font-semibold">Approved offer reference<input required name="offerReference" maxLength={200} className={field}/></label>}
      <label className="block text-sm font-semibold">Action note / evidence reference<textarea required name="note" maxLength={2000} className={field}/></label><button disabled={busy} className={button}>Save hiring action</button>
     </form>}
     {canManage&&a.status==='ACCEPTED'&&<form onSubmit={submit(v=>void save('hr/applications/'+a.id+'/onboard',{revision:a.revision,employeeNumber:v.get('employeeNumber'),startsOn:v.get('startsOn'),note:v.get('note'),checks:Object.fromEntries(checks.map(([key])=>[key,v.get(key)==='on']))},'Employee onboarded. The staff record is available in Staff & HR. An authorized administrator can separately link an account.'))} className="mt-4 space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
      <h4 className="font-bold">Complete onboarding</h4><label className="block text-sm font-semibold">Employee number<input required name="employeeNumber" maxLength={40} className={field}/></label><label className="block text-sm font-semibold">Employment start date<input required name="startsOn" type="date" className={field}/></label>
      {checks.map(([key,label])=><label key={key} className="flex items-center gap-2 text-sm"><input required type="checkbox" name={key}/>{label}</label>)}
      <label className="block text-sm font-semibold">Onboarding completion note<textarea required name="note" maxLength={2000} className={field}/></label><button disabled={busy} className={button}>Complete onboarding</button>
     </form>}
     {a.status==='ONBOARDED'&&<p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">Employee record created · {a.employee_number}. Account linking is managed through People & accounts.</p>}
    </details>)}</div>
   </section>
   <section className={card}><h3 className="font-bold">Recruitment history</h3><div className="mt-3 divide-y">{events.map(e=><article key={e.id} className="py-3 text-sm"><p className="font-semibold capitalize">{readable(e.action)}</p><p className="text-xs text-slate-600">{e.actor_name} · {new Date(e.created_at).toLocaleString()}</p>{e.note&&<p className="mt-1 whitespace-pre-wrap">{e.note}</p>}</article>)}</div></section>
  </>}
 </div>;
}
