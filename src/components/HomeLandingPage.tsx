import React from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  CalendarCheck2,
  ChartNoAxesCombined,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  GraduationCap,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { SCHOOL_CONTACT } from '../data/schoolContact.ts';

interface HomeLandingPageProps {
  onSignIn: (workspace?: string) => void;
}

const capabilities = [
  {
    icon: GraduationCap,
    title: 'Student lifecycle',
    description: 'A connected view of admissions, student records, attendance, and school reporting.',
    tone: 'blue',
  },
  {
    icon: CircleDollarSign,
    title: 'Finance operations',
    description: 'Bring fee balances, invoices, payments, and financial activity into one workspace.',
    tone: 'emerald',
  },
  {
    icon: UsersRound,
    title: 'People and school resources',
    description: 'Organize faculty, staff, leave, payroll workflows, and inventory in one place.',
    tone: 'violet',
  },
  {
    icon: ChartNoAxesCombined,
    title: 'Reports and oversight',
    description: 'Give school leaders a clearer picture of operations and the work that needs attention.',
    tone: 'amber',
  },
];

const capabilityTone: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-100',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
};

export const HomeLandingPage: React.FC<HomeLandingPageProps> = ({ onSignIn }) => (
  <div className="bg-white text-slate-900">
    <section className="relative isolate overflow-hidden bg-[#071b33] text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_78%_22%,rgba(37,99,235,0.30),transparent_42%),radial-gradient(ellipse_at_14%_95%,rgba(14,116,144,0.22),transparent_42%)]" />
      <div className="absolute -right-28 top-24 -z-10 h-96 w-96 rounded-full border border-white/10" />
      <div className="absolute -right-12 top-40 -z-10 h-64 w-64 rounded-full border border-white/10" />

      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:px-10 lg:py-24">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs font-semibold text-blue-100 shadow-sm backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            SCHOOL ERP STAGING
          </div>
          <h1 className="mt-7 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.6rem]">
            More time for learning. <span className="text-blue-300">Less time chasing paperwork.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
            A school operations workspace shaped around the day-to-day needs of Redeemer’s International Academy—from student records and attendance to finance, faculty, and reporting.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button onClick={() => onSignIn()} className="group inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-bold text-slate-900 shadow-lg shadow-blue-950/25 transition hover:-translate-y-0.5 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#071b33]">
              Staff sign in <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
            <a href="#capabilities" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/[0.06]">
              See what it brings together <ArrowDownRight className="h-4 w-4" />
            </a>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-400">
            <span className="inline-flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-emerald-300" /> Built for school workflows</span>
            <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:block" />
            <span>Paynesville, Liberia</span>
            <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:block" />
            <span>Redeemer’s International Academy · Est. 2022</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[34rem] lg:ml-auto">
          <div className="absolute -inset-5 rounded-[2rem] bg-blue-400/10 blur-2xl" />
          <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-white shadow-2xl shadow-black/30">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <img src="/redeemer-seal.svg?v=2" alt="" className="h-10 w-10 rounded-xl object-contain ring-1 ring-slate-200" />
                <div>
                  <p className="text-sm font-bold text-slate-900">School overview</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Choose a workspace to open</p>
                </div>
              </div>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-800 ring-1 ring-blue-200">Staff workspaces</span>
            </div>
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 sm:gap-4 sm:p-5">
              <PreviewStat icon={GraduationCap} label="Student records" value="Connected view" color="text-blue-700 bg-blue-100" onClick={() => onSignIn('students')} />
              <PreviewStat icon={CalendarCheck2} label="Attendance" value="Daily roll call" color="text-emerald-700 bg-emerald-100" onClick={() => onSignIn('teaching')} />
              <PreviewStat icon={CircleDollarSign} label="Fee balances" value="Finance workspace" color="text-violet-700 bg-violet-100" onClick={() => onSignIn('finance')} />
              <PreviewStat icon={ClipboardCheck} label="School reports" value="Operations insights" color="text-amber-700 bg-amber-100" onClick={() => onSignIn('reports')} />
              <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-slate-900">One school day, clearer</p>
                    <p className="mt-1 text-[11px] text-slate-500">From classroom activity to school-wide oversight</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[
                      { icon: GraduationCap, label: 'Student records', workspace: 'students' },
                      { icon: BookOpenCheck, label: 'Curriculum and teaching materials', workspace: 'curriculum' },
                      { icon: UsersRound, label: 'People and accounts', workspace: 'people' },
                    ].map(({ icon: Icon, label, workspace }) => <button key={workspace} type="button" onClick={() => onSignIn(workspace)} aria-label={`Sign in to open ${label}`} title={label} className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-slate-100 text-slate-600 transition hover:bg-blue-100 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600"><Icon className="h-3.5 w-3.5" /></button>)}
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="h-1.5 flex-1 rounded-full bg-blue-600" />
                  <span className="h-1.5 flex-1 rounded-full bg-blue-500" />
                  <span className="h-1.5 flex-1 rounded-full bg-cyan-500" />
                  <span className="h-1.5 flex-1 rounded-full bg-emerald-400" />
                  <span className="h-1.5 flex-1 rounded-full bg-slate-200" />
                </div>
                <div className="mt-2 flex justify-between text-[9px] font-medium text-blue-700">{[
                  { label: 'Students', workspace: 'students' },
                  { label: 'Attendance', workspace: 'teaching' },
                  { label: 'Finance', workspace: 'finance' },
                  { label: 'Reports', workspace: 'reports' },
                ].map(item => <button type="button" key={item.workspace} onClick={() => onSignIn(item.workspace)} className="rounded px-1 py-0.5 hover:bg-blue-50 hover:text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-600">{item.label}</button>)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3 text-[10px] text-slate-500 sm:px-6">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Sign in to open a workspace · Access follows your school role
            </div>
          </div>
          <div className="absolute -bottom-5 -left-3 hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg sm:flex lg:-left-8">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><BookOpenCheck className="h-4 w-4" /></span>
            <span><span className="block text-[10px] font-bold text-slate-900">Academic and Moral Excellence</span><span className="mt-0.5 block text-[9px] text-slate-500">The school’s guiding motto</span></span>
          </div>
        </div>
      </div>
    </section>

    <section className="border-b border-slate-100 bg-white">
      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-7 sm:grid-cols-3 sm:px-8 lg:px-10">
        <TrustPoint title="A school-first view" detail="Designed around the people and routines of school life." />
        <TrustPoint title="One connected workspace" detail="Bring core operational areas into a more coherent picture." />
        <TrustPoint title="Built with Liberia in mind" detail="Grounded in Redeemer’s location and school context." />
      </div>
    </section>

    <section id="capabilities" className="scroll-mt-24 bg-slate-50 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">One school. Many moving parts.</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">The essentials of school operations, brought together.</h2>
          <p className="mt-4 text-base leading-7 text-slate-600">Give teams a shared place to manage the everyday work behind teaching and learning.</p>
        </div>
        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {capabilities.map(({ icon: Icon, title, description, tone }) => (
            <article key={title} className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-md">
              <span className={`inline-grid h-11 w-11 place-items-center rounded-xl ring-1 ${capabilityTone[tone]}`}><Icon className="h-5 w-5" /></span>
              <h3 className="mt-5 text-sm font-bold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-blue-700">Planned capability <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
            </article>
          ))}
        </div>
      </div>
    </section>

    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-2 lg:px-10">
        <div className="rounded-2xl bg-[#071b33] p-7 text-white sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">Designed around the school day</p>
          <h2 className="mt-4 max-w-lg text-2xl font-semibold tracking-tight sm:text-3xl">A clearer handoff from classroom to school office.</h2>
          <p className="mt-4 max-w-lg text-sm leading-6 text-slate-300">Teachers, administrators, finance teams, and school leaders all have different responsibilities. The ERP brings their workflows into one consistent experience.</p>
          <button onClick={() => onSignIn()} className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-white hover:text-blue-200">Staff sign in <ArrowRight className="h-4 w-4" /></button>
        </div>
        <div className="space-y-5">
          <FlowRow number="01" title="Record the day" text="Keep student, class, attendance, and staff activity organized." />
          <FlowRow number="02" title="Complete the work" text="Support teaching, learning, fee management, and resource workflows." />
          <FlowRow number="03" title="Understand what needs attention" text="Use reporting views to help teams follow up and plan ahead." />
          <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-4 text-xs leading-5 text-blue-950"><span className="font-bold">Ministry reporting:</span> EMIS requirements are a product goal. Official templates and data exchange still require validation before the system can claim compatibility.</div>
        </div>
      </div>
    </section>

    <section id="contact" className="scroll-mt-24 border-t border-slate-100 bg-slate-50 py-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Redeemer’s International Academy · Est. 2022</p><p className="mt-2 text-sm text-slate-600">{SCHOOL_CONTACT.address}</p><p className="mt-1 text-sm font-semibold text-slate-800">{SCHOOL_CONTACT.phones.join('  ·  ')}</p></div>
        <button onClick={() => onSignIn()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800">Staff sign in <ArrowRight className="h-4 w-4" /></button>
      </div>
    </section>
    <div className="border-t border-slate-200 bg-white px-5 py-4 text-center text-[11px] text-slate-500">Staging environment · Workspace access is protected by sign-in and your assigned school permissions</div>
  </div>
);

function PreviewStat({ icon: Icon, label, value, color, onClick }: { icon: typeof GraduationCap; label: string; value: string; color: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label={`Sign in to open ${label}`} className="group rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-600 sm:p-4"><span className="flex items-center justify-between"><span className="text-[10px] font-semibold text-slate-500 sm:text-[11px]">{label}</span><span className={`grid h-7 w-7 place-items-center rounded-lg ${color}`}><Icon className="h-3.5 w-3.5" /></span></span><span className="mt-3 block text-xs font-bold text-slate-900 sm:text-sm">{value}</span><span className="mt-3 block h-1 rounded-full bg-slate-100"><span className="block h-1 w-2/3 rounded-full bg-blue-500 transition group-hover:w-full" /></span><span className="mt-2 block text-[10px] font-semibold text-blue-700">Open after sign in <ArrowRight className="inline h-3 w-3" /></span></button>;
}

function TrustPoint({ title, detail }: { title: string; detail: string }) {
  return <div className="border-l-2 border-blue-600 pl-4"><p className="text-sm font-bold text-slate-900">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div>;
}

function FlowRow({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="flex gap-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-blue-800">{number}</span><div><h3 className="text-sm font-bold text-slate-900">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div></div>;
}
