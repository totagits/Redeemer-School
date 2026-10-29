import React, { useCallback, useEffect, useState } from 'react';
type Post={id:string;kind:'NEWS'|'EVENT';title:string;summary:string;body:string;status:'DRAFT'|'PUBLISHED'|'UNPUBLISHED';event_starts_at:string|null;published_at:string|null;created_at:string};
export function PublicContentWorkspace({csrfToken}:{csrfToken:string}){
  const [posts,setPosts]=useState<Post[]>([]);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [kind,setKind]=useState<'NEWS'|'EVENT'>('NEWS');
  const [sessionExpired,setSessionExpired]=useState(false);
  const load=useCallback(async()=>{
    try{
      const response=await fetch('/api/school-content/manage',{credentials:'same-origin'});
      const result=await response.json();
      if(response.status===401){setSessionExpired(true);throw new Error('Your staff session has expired. Sign in again before saving or publishing.');}
      if(!response.ok)throw new Error(result.error||'Could not load website content.');
      setSessionExpired(false);
      setPosts(result.posts||[]);setError('');
    }catch(e){setError(e instanceof Error?e.message:'Could not load website content.');}
  },[]);
  useEffect(()=>{void load();},[load]);
  async function write(path:string,body:Record<string,unknown>){
    const response=await fetch('/api/school-content/manage'+path,{method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:JSON.stringify(body)});
    const result=await response.json().catch(()=>({}));
    if(response.status===401){setSessionExpired(true);throw new Error('Your staff session has expired. Copy your unsaved text, then sign out and sign in again.');}
    if(!response.ok)throw new Error(result.error||'School website action failed.');
    return result;
  }
  async function create(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();const form=event.currentTarget;const data=new FormData(form);
    setBusy(true);setError('');setNotice('');
    try{
      const eventStartsAt=kind==='EVENT'?String(data.get('eventDate')||'')+'T'+String(data.get('eventHour')||'').padStart(2,'0')+':'+String(data.get('eventMinute')||'').padStart(2,'0'):null;
      const result=await write('',{kind,title:data.get('title'),summary:data.get('summary'),body:data.get('body'),eventStartsAt});
      setNotice(result.notice||'Saved as draft.');form.reset();setKind('NEWS');await load();
    }catch(e){setError(e instanceof Error?e.message:'Unable to save draft.');}
    finally{setBusy(false);}
  }
  async function change(post:Post,action:'PUBLISH'|'UNPUBLISH'){
    if(action==='PUBLISH'&&!window.confirm('Publish this content to the PUBLIC school website? Confirm it contains no private learner information.'))return;
    setBusy(true);setError('');setNotice('');
    try{
      await write('/'+encodeURIComponent(post.id)+'/status',{action});
      setNotice(action==='PUBLISH'?'Published on the public school website.':'Removed from public view.');
      await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not update status.');}
    finally{setBusy(false);}
  }
  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-widest text-blue-800">School website</p>
      <h2 className="mt-2 text-xl font-extrabold">Public news & events</h2>
      <p className="mt-2 text-sm text-slate-600">Create content for public visitors. All entries are private drafts until a separate Publish action. Never include grades, invoices, private guardian messages or personal student information.</p>
      {error&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}{sessionExpired&&<> <a href="/staff" className="font-bold underline">Return to staff sign-in</a>.</>}</p>}
      {notice&&<p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <form className="mt-5 grid gap-3" onSubmit={create}>
        <label className="text-sm font-semibold">Type<select name="kind" value={kind} onChange={event=>setKind(event.target.value as 'NEWS'|'EVENT')} required className="mt-1 block w-full rounded-lg border p-3"><option value="NEWS">School news</option><option value="EVENT">School event</option></select></label>
        <label className="text-sm font-semibold">Headline<input name="title" required maxLength={180} className="mt-1 block w-full rounded-lg border p-3"/></label>
        <label className="text-sm font-semibold">Short public summary<textarea name="summary" required maxLength={500} rows={2} className="mt-1 block w-full rounded-lg border p-3"/></label>
        <label className="text-sm font-semibold">Full public description<textarea name="body" required maxLength={8000} rows={5} className="mt-1 block w-full rounded-lg border p-3"/></label>
        {kind==='EVENT'&&<fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <legend className="px-1 text-sm font-bold text-slate-900">School event date and time — Liberia</legend>
          <p className="mb-3 text-xs leading-5 text-slate-600">Choose the date, then select the hour and minute. Use 24-hour time: 10:00 is 10 AM, and 15:00 is 3 PM.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-semibold">Event date<input type="date" name="eventDate" required className="mt-1 block w-full rounded-lg border bg-white p-3"/></label>
            <label className="text-sm font-semibold">Hour (0–23)<select name="eventHour" defaultValue="10" required className="mt-1 block w-full rounded-lg border bg-white p-3">{Array.from({length:24},(_,hour)=><option key={hour} value={String(hour).padStart(2,'0')}>{String(hour).padStart(2,'0')}</option>)}</select></label>
            <label className="text-sm font-semibold">Minute<select name="eventMinute" defaultValue="00" required className="mt-1 block w-full rounded-lg border bg-white p-3">{Array.from({length:60},(_,minute)=><option key={minute} value={String(minute).padStart(2,'0')}>{String(minute).padStart(2,'0')}</option>)}</select></label>
          </div>
        </fieldset>}
        <button disabled={busy} type="submit" className="w-fit rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">Save private draft</button>
      </form>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h3 className="font-extrabold">Website content library</h3>
      {posts.length===0?<p className="mt-3 text-sm text-slate-600">No public website posts recorded.</p>:
      <div className="mt-3 space-y-3">{posts.map(post=><article key={post.id} className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap justify-between gap-3"><div><h4 className="font-bold">{post.title}</h4><p className="mt-1 text-xs text-slate-500">{post.kind} · {post.status}</p><p className="mt-2 text-sm text-slate-600">{post.summary}</p></div>
          {post.status==='PUBLISHED'?<button disabled={busy} onClick={()=>void change(post,'UNPUBLISH')} className="h-fit rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-800">Unpublish</button>:
          <button disabled={busy} onClick={()=>void change(post,'PUBLISH')} className="h-fit rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white">Publish publicly</button>}
        </div>
      </article>)}</div>}
    </section>
  </div>;
}
