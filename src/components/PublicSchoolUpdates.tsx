import React, { useEffect, useState } from 'react';
type PublicPost={id:string;kind:'NEWS'|'EVENT';title:string;summary:string;body:string;event_starts_at:string|null;published_at:string};
export function PublicSchoolUpdates({kind='ALL',limit=10}:{kind?:'ALL'|'NEWS'|'EVENT';limit?:number}){
 const [posts,setPosts]=useState<PublicPost[]>([]);
 const [unavailable,setUnavailable]=useState(false);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  let alive=true;const controller=new AbortController();
  fetch('/api/school-content/public?schoolCode=RIA',{signal:controller.signal,cache:'no-store'})
   .then(async response=>{if(!response.ok)throw new Error('unavailable');return response.json();})
   .then(result=>{if(alive){setPosts(Array.isArray(result.posts)?result.posts:[]);setUnavailable(false);setLoading(false);}})
   .catch(error=>{if(alive&&error.name!=='AbortError'){setUnavailable(true);setLoading(false);}});
  return()=>{alive=false;controller.abort();};
 },[]);
 const filtered=posts.filter(post=>kind==='ALL'||post.kind===kind).sort((a,b)=>{
   if(kind==='EVENT')return new Date(a.event_starts_at||0).getTime()-new Date(b.event_starts_at||0).getTime();
   return new Date(b.published_at).getTime()-new Date(a.published_at).getTime();
 }).slice(0,limit);
 return <div className="mt-5 space-y-3" aria-live="polite">
  {loading?<p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Loading school updates…</p>:
  filtered.length?filtered.map(post=><article key={post.id} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
    <p className="text-xs font-extrabold uppercase tracking-wider text-[#173b67]">{post.kind==='EVENT'?'School event':'School news'}</p>
    <h3 className="mt-2 text-lg font-extrabold text-[#071d3e]">{post.title}</h3>
    {post.kind==='EVENT'&&post.event_starts_at&&<time className="mt-2 block text-sm font-semibold text-[#173b67]" dateTime={post.event_starts_at}>{new Date(post.event_starts_at).toLocaleString('en-LR',{timeZone:'Africa/Monrovia',dateStyle:'medium',timeStyle:'short'})}</time>}
    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{post.summary}</p>
    <details className="mt-3 text-sm text-[#173b67]"><summary className="cursor-pointer font-semibold">Read full update</summary><p className="mt-3 whitespace-pre-wrap leading-7 text-slate-700">{post.body}</p></details>
  </article>):<p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{unavailable?'Published school updates are temporarily unavailable. Please contact the school office.':kind==='EVENT'?'No public school events have been published yet.':kind==='NEWS'?'No public school news has been published yet.':'No public school updates have been published yet.'}</p>}
 </div>;
}
