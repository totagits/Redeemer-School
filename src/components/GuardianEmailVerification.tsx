import React,{useEffect,useState} from 'react';
type Row=Record<string,string|null|undefined>;
type Post=(path:string,body:Record<string,unknown>)=>Promise<Record<string,unknown>>;
export function GuardianEmailVerification({applicationId,guardians,post}:{applicationId:string;guardians:Row[];post:Post}){
  const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{let active=true;fetch('/api/candidate-exams/status',{cache:'no-store'}).then(r=>r.json()).then(r=>{if(active)setEnabled(r.enabled===true);}).catch(()=>{});return()=>{active=false;};},[]);
  if(!enabled)return null;
  const send=async(g:Row)=>{setBusy(true);setMessage('');try{await post('admissions/applications/'+encodeURIComponent(applicationId)+'/guardian-email-verification',{firstName:g.firstName,lastName:g.lastName,relationship:g.relationship});setMessage('Verification code sent to the recorded guardian email.');}catch(e){setMessage(e instanceof Error?e.message:'Could not send verification.');}finally{setBusy(false);}};
  return <div className="mt-2 space-y-2 text-xs">{guardians.filter(g=>g.email).map((g,i)=><button key={i} type="button" disabled={busy} onClick={()=>void send(g)} className="block rounded border px-2 py-1 text-blue-800">Verify {g.firstName} {g.lastName}’s email</button>)}{message&&<p role="status">{message}</p>}</div>;
}
