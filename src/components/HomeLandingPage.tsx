import {SCHOOL_LOGO_URL,SCHOOL_LOGO_ALT,INSTITUTION,IS_CONFIGURED_INSTITUTION,SCHOOL_PORTAL_NAME} from '../data/institution.ts';
import {PublishedPageAssets,usePublishedPage,useWebsiteProfile} from './PublishedWebsiteContent.tsx';
import {WEBSITE_DEFAULTS as websiteDefaults} from './PublishedWebsiteContent.tsx';
import React from 'react';
import { PublicSchoolUpdates } from './PublicSchoolUpdates.tsx';
import { SchoolFAQ } from './SchoolPublicUtilities.tsx';
import { CampusHeroCarousel } from './CampusHeroCarousel.tsx';
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, ClipboardList, GraduationCap, HeartHandshake, Mail, MapPin, Phone, ShieldCheck, Users } from 'lucide-react';
import { SCHOOL_CONTACT } from '../data/schoolContact.ts';

interface HomeLandingPageProps {
  onPortalSignIn: () => void;
  onApply: () => void;
}

const schoolValues = [
  { title: 'Academic growth', description: 'Learning experiences that strengthen knowledge, understanding, and confident problem-solving.', icon: BookOpen },
  { title: 'Character & community', description: 'A school culture centered on respect, responsibility, service, and moral excellence.', icon: HeartHandshake },
  { title: 'Family partnership', description: 'A shared commitment between educators and families to support every learner.', icon: Users },
];
const guide = [
  { title: 'Explore our school', description: `Learn about ${INSTITUTION.name}, its mission and school community.`, href: '#about' },
  { title: 'Discover learning', description: 'Find out about teaching, curriculum, and the school experience.', href: '#academics' },
  { title: 'Apply for admission', description: 'Begin an application through the school’s official admissions process.', href: '#admissions' },
  { title: 'Stay connected', description: 'Access approved school notices and contact the school office.', href: '#community' },
];

export const HomeLandingPage: React.FC<HomeLandingPageProps> = ({ onPortalSignIn, onApply }) => {
 const profile=useWebsiteProfile(),home=usePublishedPage('home')||websiteDefaults.home;
 return (
  <div className="bg-white text-slate-900">
    <section style={IS_CONFIGURED_INSTITUTION?{backgroundColor:INSTITUTION.primaryColor}:undefined} className="relative overflow-hidden bg-[#071d3e] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_15%,rgba(24,91,164,.32),transparent_45%)]"/>
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-12 sm:px-8 md:py-16 lg:grid-cols-[.95fr_1.05fr] lg:px-10">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300/50 bg-amber-300/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-widest text-white">Welcome to our school</div>
          <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.12] tracking-tight sm:text-5xl xl:text-[3.6rem]">{home.heading}</h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-slate-200 sm:text-lg">{home.intro}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button type="button" onClick={onApply} className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-5 py-3 text-sm font-extrabold text-slate-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-amber-300">Apply for admission <ArrowRight className="h-4 w-4"/></button>
            <a href="/school/about-us" className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:border-white/50 hover:bg-white/20">Discover our school</a>
          </div>
          <div className="mt-9 flex flex-wrap gap-3 text-xs font-semibold text-blue-100"><span className="rounded-md border border-white/15 px-3 py-2">{profile.founded?`Established ${profile.founded}`:INSTITUTION.name}</span><span className="rounded-md border border-white/15 px-3 py-2">{profile.address}</span><span className="rounded-md border border-white/15 px-3 py-2">{profile.motto}</span></div>
        </div>
        <div className="min-w-0 w-full lg:pl-4">
          {home.images.length?<PublishedPageAssets page={{images:home.images.slice(0,1)}}/>:IS_CONFIGURED_INSTITUTION?<div className="grid aspect-video place-items-center rounded-2xl border border-white/20 bg-white/5 p-8"><img src={SCHOOL_LOGO_URL} alt={SCHOOL_LOGO_ALT} className="h-40 w-40 object-contain"/></div>:<CampusHeroCarousel/>}
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-300">{home.images.length?'School-approved photographs':IS_CONFIGURED_INSTITUTION?'School photographs will appear after publication':'Illustrative school-life images · Staging preview'}</p>
            <a href="/school/photo-albums" className="inline-flex shrink-0 items-center gap-2 text-sm font-bold text-white hover:text-amber-300">View gallery <ArrowRight className="h-4 w-4"/></a>
          </div>
        </div>
      </div>
    </section>

    {home.images.length?<div className="mx-auto max-w-7xl space-y-5 px-5 py-10"><PublishedPageAssets page={home}/></div>:IS_CONFIGURED_INSTITUTION?null:<section aria-label="Our school in photographs" className="border-b border-slate-200 bg-white py-10">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Our campus</p><h2 className="mt-1 text-2xl font-extrabold">A vision of the school experience</h2></div><a href="/school/photo-albums" className="text-sm font-bold text-blue-800 hover:underline">Explore the photo gallery →</a></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm"><img src="/school-photos/featured/03-campus-courtyard.webp" alt="Illustrative view of a school courtyard" loading="lazy" className="aspect-video w-full object-cover"/><figcaption className="p-4 text-sm font-semibold text-slate-700">Illustrative campus environment</figcaption></figure>
          <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm"><img src="/school-photos/featured/02-classroom-learning.webp" alt="Illustrative school classroom with learners" loading="lazy" className="mx-auto h-44 w-44 object-cover sm:h-52 sm:w-52"/><figcaption className="p-4 text-sm font-semibold text-slate-700">Illustrative classroom experience</figcaption></figure>
        </div>
      </div>
    </section>}

    <div className="mx-auto max-w-7xl space-y-5 px-5">{home.sections.map(section=><section key={section.title} className="rounded-2xl border bg-white p-6"><h2 className="text-2xl font-bold">{section.title}</h2><p className="mt-3 whitespace-pre-wrap leading-7">{section.body}</p></section>)}</div>
    <section id="about" className="scroll-mt-24 bg-slate-50 py-16">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="max-w-3xl"><p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Our school</p><h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">{home.blocks!.about.title}</h2><p className="mt-4 leading-8 text-slate-600">{home.blocks!.about.body}</p></div>
        <div className="mt-9 grid gap-5 md:grid-cols-3">{schoolValues.map(({title,description,icon:Icon})=><article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><span className="inline-flex rounded-xl bg-blue-50 p-3 text-blue-800"><Icon className="h-6 w-6"/></span><h3 className="mt-5 text-lg font-bold">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-600">{description}</p></article>)}</div>
      </div>
    </section>

    <section id="academics" className="scroll-mt-24 py-16"><div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
      <p className="text-xs font-bold uppercase tracking-widest text-blue-700">Teaching & learning</p><h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">{home.blocks!.academics.title}</h2><p className="mt-4 max-w-3xl leading-8 text-slate-600">{home.blocks!.academics.body}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{guide.map(item=><a key={item.title} href={item.href} className="group rounded-xl border border-slate-200 p-5 transition hover:border-blue-300 hover:bg-blue-50"><h3 className="flex items-center justify-between font-bold">{item.title}<ArrowRight className="h-4 w-4 text-blue-700 transition group-hover:translate-x-1"/></h3><p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p></a>)}</div>
    </div></section>

    <section id="admissions" className="scroll-mt-24 bg-blue-950 py-16 text-white"><div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10">
      <div><p className="text-xs font-bold uppercase tracking-widest text-sky-300">Admissions</p><h2 className="mt-3 text-3xl font-extrabold">{home.blocks!.admissions.title}</h2><p className="mt-4 max-w-2xl leading-7 text-slate-200">{home.blocks!.admissions.body}</p><p className="mt-3 text-sm text-slate-300">Admission is subject to the school's published requirements and available places.</p></div>
      <button type="button" onClick={onApply} className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-6 py-3 font-bold text-slate-950 hover:bg-amber-300">Apply online <ArrowRight className="h-4 w-4"/></button>
    </div></section>

    <section id="community" className="scroll-mt-24 py-16"><div className="mx-auto grid max-w-7xl gap-6 px-5 sm:px-8 md:grid-cols-2 lg:px-10">
      <article className="rounded-2xl border border-slate-200 bg-white p-7"><div className="flex items-center gap-3"><CalendarDays className="h-6 w-6 text-blue-700"/><h2 className="text-2xl font-extrabold">News & school calendar</h2></div><p className="mt-4 leading-7 text-slate-600">School-approved public announcements, event dates, and calendars will appear here when published. Private class and guardian notices remain inside the secure family portal.</p><PublicSchoolUpdates kind="ALL" limit={4}/></article>
      <article id="families" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-7"><div className="flex items-center gap-3"><Users className="h-6 w-6 text-blue-700"/><h2 className="text-2xl font-extrabold">{home.blocks!.families.title}</h2></div><p className="mt-4 leading-7 text-slate-600">{home.blocks!.families.body}</p><div className="mt-6 flex flex-wrap gap-3"><button onClick={onPortalSignIn} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800">Student & guardian portal <ArrowRight className="h-4 w-4"/></button><a href="#contact" className="rounded-lg border border-blue-200 px-5 py-3 text-sm font-semibold text-blue-800 hover:bg-blue-50">Contact the school</a></div></article>
    </div></section>

    <section aria-label="Frequently asked school questions" className="bg-slate-50 py-14">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10"><SchoolFAQ compact/></div>
    </section>

    <section id="contact" className="scroll-mt-24 bg-slate-50 py-16"><div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10"><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Get in touch</p><h2 className="mt-3 text-3xl font-extrabold">Visit {profile.name}</h2><div className="mt-7 grid gap-4 md:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-white p-6"><MapPin className="h-6 w-6 text-blue-800"/><h3 className="mt-3 font-bold">School address</h3><p className="mt-2 leading-7 text-slate-600">{profile.address}</p></div><div className="rounded-xl border border-slate-200 bg-white p-6"><Phone className="h-6 w-6 text-blue-800"/><h3 className="mt-3 font-bold">Call the school</h3>{profile.phones.map(phone=><p key={phone} className="mt-2"><a className="text-blue-800 underline hover:text-blue-950" href={`tel:${phone}`}>{phone}</a></p>)}</div></div></div></section>
    <footer style={IS_CONFIGURED_INSTITUTION?{backgroundColor:INSTITUTION.primaryColor}:undefined} className="bg-[#081b3c] px-5 py-9 text-sm text-slate-300"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><img className="h-10 w-10 rounded-full bg-white object-contain p-1" src={SCHOOL_LOGO_URL} alt="School seal"/><span>© {new Date().getFullYear()} {profile.name}</span></div><p>{profile.motto}</p></div></footer>
  </div>
);
};
