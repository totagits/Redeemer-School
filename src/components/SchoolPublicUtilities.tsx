import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, CircleHelp, GraduationCap, LoaderCircle, Phone, Search, ShieldCheck } from 'lucide-react';
import { SCHOOL_CONTACT } from '../data/schoolContact.ts';

type Option={id:string;name:string;grade_level?:string;education_level_id?:string|null};
type AdmissionsOptions={schoolName:string;levels:Option[];classes:Option[]};
const questions=[
 {group:'Admissions',question:'How do I apply for admission?',answer:'Select Apply Online and complete the official application. The Registrar reviews the submission and contacts the guardian with the next steps.',url:'/apply',link:'Apply online'},
 {group:'Admissions',question:'Which grades are accepting applications?',answer:'Grade offerings may change by academic year. Check the current grade listing below or contact the Registrar to verify whether places are available.',url:'/school/enrollment-process',link:'View enrollment information'},
 {group:'Admissions',question:'What documents do I need to enroll?',answer:'Document requirements depend on the learner’s grade and educational history. Confirm the current official checklist with the Registrar before uploading documents.',url:'/school/admission-requirements',link:'Admission requirements'},
 {group:'Tuition',question:'Where can I see my child’s tuition balance?',answer:'Authorized parents and guardians can check linked learners’ outstanding invoices and balances inside the secure Guardian Portal. Tuition records are not publicly accessible.',url:'/portal',link:'Guardian Portal'},
 {group:'Tuition',question:'Can I pay school fees with Mobile Money?',answer:'The school is preparing MTN MoMo checkout in the secure portals. Do not send a payment to an unverified number or treat a pending request as a receipt. Contact Finance for the currently approved payment channels.',url:'/portal',link:'Family Portal'},
 {group:'Academics',question:'How do I access grades and report cards?',answer:'Sign in to the Student or Guardian Portal using your issued credentials. Published reports are visible only to properly linked accounts.',url:'/portal',link:'Student & Guardian Portal'},
 {group:'Academics',question:'How can parents review attendance and notices?',answer:'Use the secure family portal to see attendance records and school notices intended for your linked learner.',url:'/portal',link:'Family Portal'},
 {group:'Support',question:'What if my portal login is not working?',answer:'Contact the school office for account verification and assistance. Never share your password or one-time login codes in public messages.',url:'/school/contact-us',link:'Contact the school'},
 {group:'Support',question:'How do I request student records?',answer:'Contact the Registrar. Records are provided only after authorization and identity verification. Do not upload confidential documents to public inquiry channels.',url:'/school/records-requests',link:'Records requests'},
 {group:'Support',question:'How do I arrange a school visit?',answer:'Call the school office to confirm an appointment and visiting hours.',url:'/school/school-visits',link:'School visits'},
];
export function SchoolFAQ({compact=false}:{compact?:boolean}){
 const [query,setQuery]=useState('');
 const [topic,setTopic]=useState('All');
 const [expanded,setExpanded]=useState<string[]>([]);
 const entries=useMemo(()=>questions.filter(item=>(topic==='All'||item.group===topic)&&(`${item.question} ${item.answer}`.toLowerCase().includes(query.trim().toLowerCase()))),[query,topic]);
 return <section aria-labelledby="school-faq-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
  <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#173b67]">Family information</p>
  <h2 id="school-faq-title" className="mt-2 text-2xl font-extrabold text-[#071d3e]">Frequently asked questions</h2>
  <p className="mt-2 text-sm leading-6 text-slate-600">Find the right process for admissions, tuition, academic results and family accounts.</p>
  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
    <label className="relative flex-1"><span className="sr-only">Search school questions</span><Search aria-hidden="true" className="absolute left-3 top-3.5 h-4 w-4 text-slate-500"/><input value={query} onChange={event=>setQuery(event.target.value)} type="search" placeholder="Search questions…" className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-3 text-sm focus:border-[#071d3e] focus:outline-2 focus:outline-[#071d3e]"/></label>
    <label className="sm:w-48"><span className="sr-only">Filter questions by topic</span><select value={topic} onChange={event=>setTopic(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm focus:border-[#071d3e]">{['All','Admissions','Tuition','Academics','Support'].map(option=><option key={option} value={option}>{option==='All'?'All topics':option}</option>)}</select></label>
  </div>
  <div className="mt-5 divide-y divide-slate-200">{entries.slice(0,compact?4:undefined).map(item=>{
    const open=expanded.includes(item.question);
    return <article key={item.question} className="py-3">
      <button type="button" aria-expanded={open} onClick={()=>setExpanded(current=>open?current.filter(entry=>entry!==item.question):[...current,item.question])} className="flex w-full items-center justify-between gap-4 py-2 text-left font-bold text-[#071d3e] hover:text-blue-700"><span>{item.question}</span><span className="text-xl">{open?'−':'+'}</span></button>
      {open&&<div className="pb-2 text-sm leading-7 text-slate-600"><p>{item.answer}</p><a className="mt-2 inline-flex items-center gap-1 font-bold text-blue-800 underline" href={item.url}>{item.link}<ArrowRight className="h-3.5 w-3.5"/></a></div>}
    </article>;
  })}{!entries.length&&<p className="py-5 text-sm text-slate-600">No questions matched your search. Contact the school office for help.</p>}</div>
  {compact&&<a href="/school/parent-faq" className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-blue-800 underline">View all school FAQs <ArrowRight className="h-4 w-4"/></a>}
 </section>;
}

export function LiveAdmissionsGuide({onApply}:{onApply:()=>void}){
 const [options,setOptions]=useState<AdmissionsOptions|null>(null);
 const [state,setState]=useState<'loading'|'ready'|'error'>('loading');
 const [selectedLevel,setSelectedLevel]=useState('');
 const [reload,setReload]=useState(0);
 useEffect(()=>{
   let active=true;
   const controller=new AbortController();
   setState('loading');
   fetch('/api/public/admissions/options?schoolCode=RIA',{credentials:'same-origin',cache:'no-store',signal:controller.signal})
    .then(async response=>{if(!response.ok)throw new Error('School admission options unavailable');return response.json() as Promise<AdmissionsOptions>;})
    .then(result=>{if(active){setOptions(result);setState('ready');}})
    .catch(error=>{if(active&&error.name!=='AbortError')setState('error');});
   return()=>{active=false;controller.abort();};
 },[reload]);
 const levels=options?.levels||[];
 const classes=(options?.classes||[]).filter(item=>!selectedLevel||item.education_level_id===selectedLevel);
 return <section aria-labelledby="admission-guide-title" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
   <div className="flex items-center gap-2 text-[#071d3e]"><GraduationCap className="h-6 w-6"/><h2 id="admission-guide-title" className="text-xl font-extrabold">Explore current admission options</h2></div>
   <p className="mt-3 text-sm leading-7 text-slate-600">The grade and education-level options below are drawn from the school's admissions configuration. Listing a class does not guarantee available seats; the Registrar confirms availability and decisions.</p>
   {state==='loading'&&<p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin"/>Loading school admission options…</p>}
   {state==='error'&&<div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><p>Current admission options could not be loaded. You can contact the school or try again.</p><button type="button" onClick={()=>setReload(v=>v+1)} className="mt-2 font-bold underline">Retry</button></div>}
   {state==='ready'&&<div className="mt-5 space-y-4">
     <label className="block text-sm font-semibold text-[#071d3e]">Education level<select value={selectedLevel} onChange={event=>setSelectedLevel(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 bg-white p-3 text-sm"><option value="">All configured levels</option>{levels.map(level=><option key={level.id} value={level.id}>{level.name}</option>)}</select></label>
     {classes.length?<div className="grid gap-2 sm:grid-cols-2">{classes.map(item=><div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700"><CheckCircle2 className="h-4 w-4 shrink-0 text-blue-700"/>{item.name}</div>)}</div>:<p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No active classes are currently listed for this selection. Contact the Registrar for availability.</p>}
   </div>}
   <div className="mt-6 flex flex-wrap items-center gap-3"><button type="button" onClick={onApply} className="inline-flex items-center gap-2 rounded-lg bg-[#071d3e] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#173b67]">Apply online <ArrowRight className="h-4 w-4"/></button><a href="/school/contact-us" className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-bold text-[#071d3e] hover:bg-slate-50">Ask admissions</a></div>
 </section>;
}
export function PublicSchoolSupport(){
 return <section aria-label="School office support" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
  <div className="flex items-center gap-2 text-[#071d3e]"><Phone className="h-5 w-5"/><h2 className="text-xl font-extrabold">Contact the school office</h2></div>
  <p className="mt-2 text-sm leading-7 text-slate-600">For enrollment inquiries, visits and records support, call the school directly.</p>
  <div className="mt-4 flex flex-wrap gap-2">{SCHOOL_CONTACT.phones.map(phone=><a key={phone} href={`tel:${phone}`} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-[#071d3e] hover:bg-blue-100">{phone}</a>)}</div>
  <p className="mt-4 text-xs leading-6 text-slate-500">Please do not send student identification, transcripts or account passwords through public messages. The Registrar will explain how to submit records securely.</p>
 </section>;
}
