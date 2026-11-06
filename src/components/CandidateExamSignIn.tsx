import { CandidateExamSitting } from './CandidateExamSitting.tsx';
import React,{useEffect,useState} from 'react';

type Session={exam:{title:string;ends_at:string};csrfToken:string;sittingAvailable:boolean};
export function CandidateExamSignIn({verifyEmail=false}:{verifyEmail?:boolean}) {
  const [enabled,setEnabled]=useState(false),[loading,setLoading]=useState(true);
  const [session,setSession]=useState<Session|null>(null),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const refresh=async()=>{
    const response=await fetch('/api/candidate-exams/session',{credentials:'same-origin',cache:'no-store'});
    if(response.ok)setSession(await response.json());else setSession(null);
  };
  useEffect(()=>{let active=true;void(async()=>{try{
    const response=await fetch('/api/candidate-exams/status',{cache:'no-store'});const state=await response.json();
    if(active)setEnabled(state.enabled===true);if(state.enabled&&!verifyEmail)await refresh();
  }catch{if(active)setError('The examination service could not be reached.');}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[verifyEmail]);
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const form=event.currentTarget;const data=new FormData(form);setBusy(true);setError('');setNotice('');
    try{const response=await fetch('/api/candidate-exams/'+(verifyEmail?'verify-email':'login'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({schoolCode:data.get('schoolCode'),code:String(data.get('code')||'').trim()})});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to continue.');
      form.reset();if(verifyEmail)setNotice('Guardian email verified. The Registrar can now send the examination access code.');else await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Unable to continue.');}finally{setBusy(false);}
  };
  const logout=async()=>{if(!session)return;setBusy(true);setError('');try{const r=await fetch('/api/candidate-exams/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:'{}'});if(!r.ok)throw Error('Sign-out failed. Try again.');setSession(null);}catch(e){setError(e instanceof Error?e.message:'Sign-out failed.');}finally{setBusy(false);}};
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-12 text-slate-900"><section className="w-full max-w-3xl rounded-2xl border bg-white p-7 shadow-sm">
    <a href="/" className="text-sm text-blue-800">Back to school website</a>
    <p className="mt-6 text-xs font-bold uppercase tracking-widest text-blue-800">Redeemer’s International Academy</p>
    <h1 className="mt-2 text-2xl font-extrabold">{verifyEmail?'Verify guardian email':'Candidate examination sign-in'}</h1>
    {loading?<p className="mt-5">Checking examination access…</p>:!enabled?<p className="mt-5 rounded-lg bg-amber-50 p-4">Online examination sign-in is not available yet. Contact the Registrar for your examination arrangements.</p>:session?<div className="mt-6 space-y-4"><h2 className="text-xl font-bold">{session.exam.title}</h2><p>Signed in. Examination window ends {new Date(session.exam.ends_at).toLocaleString('en-GB',{timeZone:'Africa/Monrovia'})} GMT.</p><CandidateExamSitting csrfToken={session.csrfToken} endsAt={session.exam.ends_at}/><button disabled={busy} onClick={()=>void logout()} className="rounded-lg border px-4 py-2">Sign out</button></div>:<form onSubmit={event=>void submit(event)} className="mt-6 space-y-4">
      <p className="text-sm text-slate-600">{verifyEmail?'Use the verification code sent to the guardian email recorded with your application.':'Use the examination access code sent to your verified guardian email. Sign in only during your scheduled examination time.'}</p>
      <label className="block text-sm font-semibold">School code<input name="schoolCode" required defaultValue="RIA" maxLength={50} autoComplete="off" className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
      <label className="block text-sm font-semibold">{verifyEmail?'Email verification code':'Examination access code'}<input name="code" type="password" required minLength={43} maxLength={43} autoComplete="one-time-code" spellCheck={false} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
      <button disabled={busy} className="w-full rounded-lg bg-blue-800 px-4 py-3 font-bold text-white disabled:opacity-50">{busy?'Checking…':verifyEmail?'Verify email':'Sign in to examination'}</button>
    </form>}
    {error&&<p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice&&<p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
  </section></main>;
}
