import React, { useCallback, useEffect, useState } from 'react';
type Post={id:string;kind:'NEWS'|'EVENT';title:string;summary:string;body:string;status:'DRAFT'|'PUBLISHED'|'UNPUBLISHED';event_starts_at:string|null;published_at:string|null;created_at:string;has_featured_image?:boolean;image_caption?:string;image_alt?:string};
export function PublicContentWorkspace({csrfToken}:{csrfToken:string}){
  const [posts,setPosts]=useState<Post[]>([]);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [kind,setKind]=useState<'NEWS'|'EVENT'>('NEWS');
  const [sessionExpired,setSessionExpired]=useState(false);
  const [selectedPost,setSelectedPost]=useState('');
  const [imageFile,setImageFile]=useState<File|null>(null);
  const [imagePreview,setImagePreview]=useState('');
  const [imageWarning,setImageWarning]=useState('');
  const [imageAlt,setImageAlt]=useState('');
  const [imageCaption,setImageCaption]=useState('');
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
  function selectImage(file:File|undefined){
    if(imagePreview)URL.revokeObjectURL(imagePreview);
    setImageFile(null);setImagePreview('');setImageWarning('');
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024){
      setImageWarning('Use a JPG, PNG or WebP photo smaller than 8 MB.');return;
    }
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      if(img.width<1600||img.height<900){
        setImageWarning('This photo is too small for a crisp featured card. Please use an original at least 1600 × 900 pixels.');
        URL.revokeObjectURL(url);return;
      }
      setImageFile(file);setImagePreview(url);
    };
    img.onerror=()=>{setImageWarning('This image could not be opened. Choose another photo.');URL.revokeObjectURL(url);};
    img.src=url;
  }
  function removePendingImage(){
    if(imagePreview)URL.revokeObjectURL(imagePreview);
    setImageFile(null);setImagePreview('');setImageWarning('');
  }
  async function saveFeaturedImage(postId:string){
    if(!imageFile||!imageAlt.trim()||imageAlt.trim().length<5){setError('Select a sharp photo and describe it in the alt text field.');return;}
    setBusy(true);setError('');setNotice('');
    try{
      const bitmap=await createImageBitmap(imageFile);
      const ratio=16/9;
      const w=1600,h=900;
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const context=canvas.getContext('2d');if(!context)throw Error('Your browser cannot prepare this photo.');
      const sourceWidth=Math.min(bitmap.width,bitmap.height*ratio);
      const sourceHeight=sourceWidth/ratio;
      context.drawImage(bitmap,(bitmap.width-sourceWidth)/2,(bitmap.height-sourceHeight)/2,sourceWidth,sourceHeight,0,0,w,h);
      bitmap.close();
      const encoded=canvas.toDataURL('image/webp',.88);
      if(!encoded.startsWith('data:image/webp;')||encoded.length>2_100_000)throw Error('Photo cannot be safely optimized. Choose a smaller original.');
      const result=await fetch('/api/school-content/manage/'+encodeURIComponent(postId)+'/image',{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},
        body:JSON.stringify({imageData:encoded,caption:imageCaption,altText:imageAlt})
      });
      const payload=await result.json().catch(()=>({}));
      if(result.status===401){setSessionExpired(true);throw Error('Your session expired. Sign in again before uploading.');}
      if(!result.ok)throw Error(payload.error||'Could not save photo.');
      removePendingImage();setImageCaption('');setImageAlt('');setNotice(payload.notice||'Featured photo saved.');
      await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not upload photo.');}
    finally{setBusy(false);}
  }
  async function deleteFeaturedImage(post:Post){
    if(!window.confirm('Delete the featured photo from this post? The article or event will remain.'))return;
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/school-content/manage/'+encodeURIComponent(post.id)+'/image',{method:'DELETE',credentials:'same-origin',headers:{'X-CSRF-Token':csrfToken}});
      const data=await response.json().catch(()=>({}));
      if(response.status===401){setSessionExpired(true);throw Error('Your session expired. Sign in again before deleting an image.');}
      if(!response.ok)throw Error(data.error||'Could not delete photo.');
      setNotice(data.notice||'Featured photo deleted.');await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not delete photo.');}
    finally{setBusy(false);}
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
        <div className="flex flex-wrap justify-between gap-3"><div className="min-w-0 flex-1">{post.has_featured_image&&<img src={`/api/school-content/public/${encodeURIComponent(post.id)}/image?schoolCode=RIA`} alt={post.image_alt||post.title} className="mb-3 aspect-video w-full max-w-md rounded-xl object-cover" onError={event=>{event.currentTarget.style.display='none';}}/>}<h4 className="font-bold">{post.title}</h4><p className="mt-1 text-xs text-slate-500">{post.kind} · {post.status}</p><p className="mt-2 text-sm text-slate-600">{post.summary}</p></div>
          {post.status==='PUBLISHED'?<button disabled={busy} onClick={()=>void change(post,'UNPUBLISH')} className="h-fit rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-800">Unpublish</button>:
          <button disabled={busy} onClick={()=>void change(post,'PUBLISH')} className="h-fit rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white">Publish publicly</button>}
        </div>
        {post.status!=='PUBLISHED'&&<div className="mt-4 rounded-xl border border-blue-100 bg-slate-50 p-4">
          <h5 className="font-bold text-[#071d3e]">Featured news or event photo</h5>
          <p className="mt-1 text-xs text-slate-600">Use an original 1600 × 900 pixels or larger. The browser makes a 16:9 WebP preview without stretching the photo. Small photos are rejected.</p>
          {post.has_featured_image&&<div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-sm text-green-800">A featured photo is saved.</span><button type="button" disabled={busy} onClick={()=>void deleteFeaturedImage(post)} className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-bold text-red-800">Delete featured photo</button></div>}
          {selectedPost===post.id?<div className="mt-3 grid gap-3">
            <label className="text-sm font-semibold">Choose photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>selectImage(event.currentTarget.files?.[0])} className="mt-1 block w-full rounded-lg border bg-white p-2" /></label>
            {imageWarning&&<p role="alert" className="text-sm font-bold text-red-800">{imageWarning}</p>}
            {imagePreview&&<div><img src={imagePreview} alt="Local photo preview, not yet uploaded" className="aspect-video max-w-md rounded-lg object-cover"/><button type="button" onClick={removePendingImage} className="mt-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-bold text-red-800">Remove selected photo</button></div>}
            <label className="text-sm font-semibold">Alt text<input maxLength={240} value={imageAlt} onChange={event=>setImageAlt(event.target.value)} placeholder="Describe what the photo shows" className="mt-1 block w-full rounded-lg border p-3"/></label>
            <label className="text-sm font-semibold">Caption (optional)<input maxLength={240} value={imageCaption} onChange={event=>setImageCaption(event.target.value)} className="mt-1 block w-full rounded-lg border p-3"/></label>
            <button type="button" disabled={busy||!imageFile} onClick={()=>void saveFeaturedImage(post.id)} className="w-fit rounded-lg bg-[#071d3e] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Save featured photo to this draft</button>
          </div>:<button type="button" onClick={()=>{removePendingImage();setSelectedPost(post.id);}} className="mt-3 rounded-lg border border-blue-300 px-3 py-2 text-sm font-bold text-blue-900">{post.has_featured_image?'Replace featured photo':'Add featured photo'}</button>}
        </div>}
      </article>)}</div>}
    </section>
  </div>;
}
