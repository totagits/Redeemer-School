import React,{useEffect,useState} from 'react';
type Item={id:string;student_id?:string;subject_type:'STUDENT'|'GUARDIAN';status:string;original_filename:string;submitted_at:string;reviewed_at?:string;review_note?:string;student_first_name?:string;student_last_name?:string;guardian_first_name?:string;guardian_last_name?:string;student_number?:string};
const field='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
export const ParentPhotoUploads:React.FC<{studentId:string;studentName:string;csrfToken:string}>=({studentId,studentName,csrfToken})=>{
 const [items,setItems]=useState<Item[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=async()=>{try{const response=await fetch(`/api/portal-photos/mine/${encodeURIComponent(studentId)}`,{credentials:'same-origin',cache:'no-store'});const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not load photograph submissions.');setItems(body.submissions||[]);}catch(e){setError(e instanceof Error?e.message:'Unable to load submissions.')}};
 useEffect(()=>{void load()},[studentId]);
 const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=event.currentTarget,data=new FormData(form),file=data.get('photo');if(!(file instanceof File)||!file.size)return;setError('');setNotice('');
 if(!['image/jpeg','image/png'].includes(file.type)||file.size>3*1024*1024){setError('Choose a JPG or PNG file up to 3 MB.');return;}
 setBusy(true);try{const query=new URLSearchParams({subject:String(data.get('subject')),filename:file.name});
 const response=await fetch(`/api/portal-photos/mine/${encodeURIComponent(studentId)}?${query}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type,'X-CSRF-Token':csrfToken},body:file});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Submission failed.');
 setNotice('Photograph submitted securely. The school must review it before use.');form.reset();await load();
 }catch(e){setError(e instanceof Error?e.message:'Could not submit photograph.')}finally{setBusy(false)}};
 return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
 <h3 className="font-extrabold text-slate-900">Family photographs · {studentName}</h3>
 <p className="mt-1 text-xs text-slate-600">Upload your own guardian photograph or your linked child's photograph from a phone or computer. School staff must approve it. Pending images do not change official IDs.</p>
 <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-3">
 <label className="text-sm font-semibold">Photograph of<select name="subject" required className={field}><option value="STUDENT">My child (student)</option><option value="GUARDIAN">Myself (parent / guardian)</option></select></label>
 <label className="text-sm font-semibold sm:col-span-2">Photo JPG/PNG up to 3 MB<input className={field} name="photo" type="file" accept="image/jpeg,image/png" capture="user" required/></label>
 <button disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 sm:col-span-3">{busy?'Uploading securely…':'Submit for school approval'}</button>
 </form>
 {notice&&<p role="status" className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-900">{notice}</p>}
 {error&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
 <h4 className="mt-4 text-sm font-bold">Your photo submissions</h4>
 {items.length?<ul className="mt-2 space-y-3">{items.map(item=><li key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
 <img src={`/api/portal-photos/${encodeURIComponent(item.id)}/image`} alt={`${item.subject_type.toLowerCase()} submission`} className="h-20 w-20 rounded object-cover"/>
 <div className="min-w-0 text-xs"><p className="font-bold">{item.subject_type==='STUDENT'?'Student photo':'Guardian photo'} · {item.status}</p>
 <p className="break-all text-slate-600">{item.original_filename}</p><p className="text-slate-600">{new Date(item.submitted_at).toLocaleString()}</p>{item.review_note&&<p className="text-red-700">School note: {item.review_note}</p>}</div></li>)}</ul>:<p className="mt-2 text-sm text-slate-600">No photos submitted yet.</p>}
 </section>;
};

export const FamilyPhotoReviewQueue:React.FC<{csrfToken:string}>=({csrfToken})=>{
 const [items,setItems]=useState<Item[]>([]),[loading,setLoading]=useState(true),[working,setWorking]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=async()=>{setLoading(true);try{const response=await fetch('/api/portal-photos/queue',{credentials:'same-origin',cache:'no-store'});const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not load photo review queue.');setItems(body.submissions||[]);}catch(e){setError(e instanceof Error?e.message:'Could not load photo review queue.')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 const review=async(item:Item,decision:'APPROVED'|'REJECTED')=>{
 const note=decision==='REJECTED'?window.prompt('Enter a reason for rejection (required):'):'';
 if(decision==='REJECTED'&&!note?.trim())return;
 if(decision==='APPROVED'&&!window.confirm(`Approve this ${item.subject_type.toLowerCase()} photo? For a student, this replaces the official photo and revokes the previous Digital ID.`))return;
 setWorking(item.id);setError('');setNotice('');
 try{const response=await fetch(`/api/portal-photos/${encodeURIComponent(item.id)}/review`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:JSON.stringify({decision,note})});const body=await response.json();if(!response.ok)throw new Error(body.error||'Review failed.');
 setNotice(decision==='APPROVED'?(body.digitalIdRequiresReissue?'Student photo approved; the old Digital ID was revoked. Review and reissue the ID.':'Guardian photo approved and stored securely.'):'Photo rejected; guardian can see the reason.');await load();
 }catch(e){setError(e instanceof Error?e.message:'Review failed.')}finally{setWorking('')}};
 return <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
 <summary className="cursor-pointer font-bold">Parent-submitted photographs · approval queue {items.length? `(${items.length} pending)`:''}</summary>
 <p className="mt-2 text-xs text-slate-600">Review identity before approval. Student photo approval replaces the official portrait and revokes the existing QR credential. Guardian photographs are stored separately.</p>
 <button type="button" className="mt-2 rounded border px-3 py-1.5 text-xs font-bold" onClick={()=>void load()}>Refresh submissions</button>
 {error&&<p role="alert" className="mt-2 rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
 {notice&&<p role="status" className="mt-2 rounded bg-green-50 p-2 text-sm text-green-800">{notice}</p>}
 {loading?<p className="mt-2 text-sm">Loading…</p>:!items.length?<p className="mt-2 text-sm text-slate-600">No photographs awaiting review.</p>:
 <div className="mt-3 grid gap-3 md:grid-cols-2">{items.map(item=><article key={item.id} className="rounded-lg border p-3">
 <p className="font-bold">{item.student_first_name} {item.student_last_name} · {item.student_number}</p>
 <p className="text-xs text-slate-600">Submitted by guardian: {item.guardian_first_name} {item.guardian_last_name} · Subject: {item.subject_type}</p>
 <img src={`/api/portal-photos/${encodeURIComponent(item.id)}/image`} className="mt-2 max-h-60 max-w-full rounded object-contain" alt="Photograph pending school review"/>
 <div className="mt-3 flex gap-2"><button type="button" disabled={Boolean(working)} onClick={()=>void review(item,'APPROVED')} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Approve</button>
 <button type="button" disabled={Boolean(working)} onClick={()=>void review(item,'REJECTED')} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50">Reject</button></div>
 </article>)}</div>}
 </details>;
};
