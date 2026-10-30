import React,{useEffect,useRef,useState} from 'react';
type Question={id:string;prompt:string;question_type:'SINGLE_CHOICE'|'SHORT_ANSWER';options:string[]|null;points:string;sort_order:number};
type Attempt={id:string;status:'IN_PROGRESS'|'SUBMITTED';submitted_at?:string};
type Answer=string|number;
type Bundle={attempt:Attempt|null;questions?:Question[];answers?:Array<{question_id:string;answer:Answer}>};
export function CandidateExamSitting({csrfToken,endsAt}:{csrfToken:string;endsAt:string}){
 const [bundle,setBundle]=useState<Bundle|null>(null),[answers,setAnswers]=useState<Record<string,Answer>>({});
 const [dirty,setDirty]=useState<Set<string>>(new Set()),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [confirm,setConfirm]=useState(false),[remaining,setRemaining]=useState(()=>Math.max(0,new Date(endsAt).valueOf()-Date.now()));
 const submissionId=useRef(crypto.randomUUID());
 const request=async(path:string,body?:Record<string,unknown>)=>{
  const response=await fetch('/api/candidate-exams/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();if(!response.ok)throw Error(result.error||'The examination action failed. Try again.');return result;
 };
 const accept=(data:Bundle)=>{setBundle(data);setAnswers(Object.fromEntries((data.answers||[]).map(a=>[a.question_id,a.answer])));setDirty(new Set());};
 useEffect(()=>{let active=true;void request('attempt').then(data=>{if(active)accept(data);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 useEffect(()=>{const timer=window.setInterval(()=>setRemaining(Math.max(0,new Date(endsAt).valueOf()-Date.now())),1000);return()=>window.clearInterval(timer);},[endsAt]);
 const start=async()=>{setBusy(true);setError('');try{accept(await request('start',{}));}catch(e){setError(e instanceof Error?e.message:'Could not start.');}finally{setBusy(false);}};
 const save=async(id:string)=>{
  await request('answers',{questionId:id,answer:answers[id]});
  setDirty(previous=>{const next=new Set(previous);next.delete(id);return next;});
 };
 const saveOne=async(id:string)=>{setBusy(true);setError('');setNotice('');try{await save(id);setNotice('Answer saved to the school examination record.');}catch(e){setError(e instanceof Error?e.message:'Answer was not saved.');}finally{setBusy(false);}};
 const submit=async()=>{setBusy(true);setError('');setNotice('');try{
  for(const id of dirty)await save(id);
  const result=await request('submit',{submissionId:submissionId.current});
  setBundle(previous=>({attempt:{id:previous!.attempt!.id,status:'SUBMITTED',submitted_at:result.submittedAt},questions:[],answers:[]}));
  setAnswers({});setDirty(new Set());setConfirm(false);
 }catch(e){setError(e instanceof Error?e.message:'Submission was not completed. Try again.');}finally{setBusy(false);}};
 if(bundle?.attempt?.status==='SUBMITTED')return <section className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-5"><h2 className="text-xl font-bold">Examination submitted</h2><p className="mt-2">Your answers have been received. Further changes are closed.</p><p className="mt-2 text-sm">Submitted: {new Date(bundle.attempt.submitted_at!).toLocaleString('en-GB',{timeZone:'Africa/Monrovia'})} GMT</p><p className="mt-3 text-sm">Results will be reviewed by the school. No result or admission decision has been published.</p></section>;
 return <section className="mt-6 space-y-5" aria-label="Examination questions">
  <p className="rounded-lg bg-blue-50 p-3 text-sm" aria-live="off">Time remaining: {Math.ceil(remaining/60_000)} minutes. Save each answer as you work. The school server enforces the deadline.</p>
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
  {notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
  {remaining===0&&<p role="alert" className="font-semibold text-red-800">The examination time has ended. New saves and submissions are closed. Contact the invigilator if you need assistance.</p>}
  {!bundle&&!error&&<p>Loading your examination…</p>}
  {bundle&&!bundle.attempt&&<div className="space-y-4"><p>Start when instructed by the invigilator. You may return to this page to resume the same attempt during the examination window.</p><button disabled={busy||remaining===0} onClick={()=>void start()} className="rounded-lg bg-blue-800 px-4 py-3 font-bold text-white disabled:opacity-50">Start examination</button></div>}
  {bundle?.questions?.map((q,index)=><article key={q.id} className="rounded-xl border p-4"><h3 className="font-semibold">{index+1}. {q.prompt}</h3><p className="mb-3 text-xs text-slate-500">{q.points} points</p>
   {q.question_type==='SINGLE_CHOICE'?<fieldset disabled={busy||remaining===0}><legend className="sr-only">Answer for question {index+1}</legend>{q.options?.map((option,i)=><label key={i} className="mb-2 flex items-start gap-2"><input type="radio" name={q.id} checked={answers[q.id]===i} onChange={()=>{setAnswers(a=>({...a,[q.id]:i}));setDirty(d=>new Set(d).add(q.id));setNotice('');}}/><span>{option}</span></label>)}</fieldset>:<label className="block text-sm">Your answer<textarea disabled={busy||remaining===0} maxLength={4000} value={String(answers[q.id]??'')} onChange={event=>{const value=event.target.value;setAnswers(a=>({...a,[q.id]:value}));setDirty(d=>new Set(d).add(q.id));setNotice('');}} className="mt-2 min-h-28 w-full rounded-lg border p-3"/></label>}
   <div className="mt-3 flex items-center gap-3"><button disabled={busy||remaining===0||!dirty.has(q.id)} onClick={()=>void saveOne(q.id)} className="rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-40">Save answer</button><span className="text-xs text-slate-600">{dirty.has(q.id)?'Unsaved changes':Object.hasOwn(answers,q.id)?'Saved':'Not answered'}</span></div>
  </article>)}
  {bundle?.attempt&&<div className="space-y-3 border-t pt-5"><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)} disabled={busy||remaining===0}/><span>I have reviewed my answers and am ready to submit. Submitted answers cannot be changed.</span></label><button disabled={busy||remaining===0||!confirm} onClick={()=>void submit()} className="rounded-lg bg-blue-800 px-4 py-3 font-bold text-white disabled:opacity-40">{busy?'Saving…':'Submit examination'}</button></div>}
 </section>;
}
