import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, ClipboardList, GraduationCap, LayoutDashboard, LoaderCircle, Menu, Plus, RefreshCw, School, Settings2, Users, X } from 'lucide-react';
import type { SchoolAccount } from './SignInPage.tsx';
import { classifySchoolGrade } from '../logic/schoolGradingPolicy.ts';

type Row = Record<string, string | null | undefined>;
type Assessment = Row & { id: string; teacher_assignment_id: string; title: string; assessment_type: string; max_score: string; status: string; class_name: string; subject_name: string; teacher_name: string; scored_students: number };
type Setup = { school: Row; years: Row[]; subjects: Row[]; classes: Row[]; teachers: Row[]; students: Row[]; assignments: Row[]; educationLevels: Row[]; gradeLevels: Row[]; terms: Row[]; curriculum: Row[]; resources: Row[]; periods: Row[]; timetable: Row[]; assessments: Assessment[] };
type Portal = { role: string; linked?: boolean; message?: string; student?: Row; subjects?: Row[]; timetable?: Row[]; attendance?: Row[]; grades?: Row[]; resources?: Row[]; children?: Array<Row & { subjects: Row[]; timetable: Row[]; attendance: Row[]; grades: Row[]; resources: Row[] }> };
type Dashboard = { school: Row | null; cards: Array<{ label: string; value: number }>; permissions: string[] };
type RosterEntry = { id: string; student_number: string; first_name: string; last_name: string; attendance_status: string | null; note: string | null };
const today = () => new Date().toLocaleDateString('en-CA');
const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';
const labelClass = 'block text-sm font-semibold text-slate-700';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60';
const sectionClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';

interface Props { account: SchoolAccount; csrfToken: string; busy: boolean; error: string; onSignOut: () => void; onPasswordChanged: () => void; }

export const OperationsWorkspace: React.FC<Props> = ({ account, csrfToken, busy: signOutBusy, error: authError, onSignOut, onPasswordChanged }) => {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [portal, setPortal] = useState<Portal | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(today());
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendance, setAttendance] = useState<Record<string, { status: string; note: string }>>({});
  const [sessionTopic, setSessionTopic] = useState('');
  const [sessionTime, setSessionTime] = useState('08:00');
  const [correctionReason, setCorrectionReason] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [activeWorkspace, setActiveWorkspace] = useState(() => account.roles.includes('TEACHER') ? 'teaching' : 'overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const isPortalUser = account.roles.includes('STUDENT') || account.roles.includes('PARENT');
      const canViewSetup = account.permissions.includes('academics.configure') || (account.roles.includes('TEACHER') && account.permissions.includes('attendance.read'));
      const response = await fetch(isPortalUser ? '/api/operations/portal' : canViewSetup ? '/api/operations/setup' : '/api/operations/dashboard', { credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load school setup.');
      setDashboard(null);
      if (isPortalUser) { setPortal(result as Portal); setSetup(null); }
      else if (canViewSetup) { setSetup(result as Setup); setPortal(null); }
      else { setDashboard(result as Dashboard); setSetup(null); setPortal(null); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load school setup.'); }
    finally { setLoading(false); }
  }, [account.roles]);

  useEffect(() => { void refresh(); }, [refresh]);

  const post = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(`/api/operations/${path}`, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
    return result;
  };

  const submit = (action: (form: HTMLFormElement) => Promise<string | void>) => async (event: React.FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try { const successMessage = await action(form); await refresh(); setNotice(successMessage || 'Saved to the staging database.'); form.reset(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The request could not be completed.'); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    if (!assignmentId || !attendanceDate) { setRoster([]); setAttendance({}); return; }
    let active = true;
    setAttendanceLoading(true); setError('');
    fetch(`/api/operations/attendance/roster?assignmentId=${encodeURIComponent(assignmentId)}&date=${encodeURIComponent(attendanceDate)}&time=${encodeURIComponent(sessionTime)}`, { credentials: 'same-origin' })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not load class roster.'); return result; })
      .then(result => {
        if (!active) return;
        const entries = result.students as RosterEntry[];
        setRoster(entries);
        setCorrectionReason('');
        setAttendance(Object.fromEntries(entries.map(student => [student.id, { status: student.attendance_status || '', note: student.note || '' }])));
        if (result.session?.topic) setSessionTopic(result.session.topic);
      })
      .catch(cause => { if (active) { setRoster([]); setError(cause instanceof Error ? cause.message : 'Could not load class roster.'); } })
      .finally(() => { if (active) setAttendanceLoading(false); });
    return () => { active = false; };
  }, [assignmentId, attendanceDate, sessionTime]);

  const markedCount = useMemo(() => roster.filter(student => Boolean(attendance[student.id]?.status)).length, [attendance, roster]);
  const hasCorrectionChange = useMemo(() => roster.some(student => student.attendance_status && attendance[student.id]?.status !== student.attendance_status), [attendance, roster]);

  const saveRollCall = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await post('attendance/roll-call', { assignmentId, date: attendanceDate, time: sessionTime, topic: sessionTopic,
        correctionReason,
        attendance: roster.map(student => ({ studentId: student.id, ...attendance[student.id] })) });
      setNotice(`Roll call saved. ${result.recorded} students recorded.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save roll call.'); }
    finally { setSaving(false); }
  };

  const canConfigure = account.permissions.includes('academics.configure');
  const canManageStaff = account.permissions.includes('staff.write');
  const canEnroll = account.permissions.includes('students.write');
  const canTakeAttendance = account.permissions.includes('attendance.write');
  const canManageCurriculum = account.permissions.includes('curriculum.manage');
  const canManageTimetable = account.permissions.includes('timetable.manage');
  const canReviewGrades = ['grades.enter', 'grades.moderate', 'grades.publish'].some(permission => account.permissions.includes(permission));
  const isPortalUser = account.roles.includes('STUDENT') || account.roles.includes('PARENT');
  const workspaceItems = isPortalUser ? [{ id: 'overview', label: 'My learning', icon: GraduationCap }] : setup ? [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    ...(canConfigure ? [{ id: 'academics', label: 'School setup', icon: Settings2 }] : []),
    ...(canManageCurriculum ? [{ id: 'curriculum', label: 'Curriculum & timetable', icon: BookOpen }] : []),
    ...(canManageStaff || account.permissions.includes('users.manage') || canEnroll ? [{ id: 'people', label: 'People & accounts', icon: Users }] : []),
    ...(canReviewGrades || canTakeAttendance ? [{ id: 'teaching', label: 'Teaching & learning', icon: ClipboardList }] : []),
  ] : [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    ...(account.permissions.includes('students.read') ? [{ id: 'students', label: 'Student records', icon: Users }] : []),
    ...(account.permissions.includes('finance.read') ? [{ id: 'finance', label: 'Finance', icon: ClipboardList }] : []),
    ...(account.permissions.includes('staff.read') ? [{ id: 'staff', label: 'Staff', icon: Users }] : []),
    ...(account.permissions.includes('reports.read') ? [{ id: 'reports', label: 'Reports', icon: ClipboardList }] : []),
  ];

  useEffect(() => {
    setActiveWorkspace(account.roles.includes('TEACHER') ? 'teaching' : 'overview');
    setMobileNavOpen(false);
  }, [account.id, account.roles]);

  if (account.mustResetPassword) return <section className="grid min-h-[calc(100vh-4rem)] place-items-center bg-slate-50 px-4 py-10"><form className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onSubmit={async event => {
    event.preventDefault(); setPasswordBusy(true); setPasswordError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/password', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword') }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not change password.');
      onPasswordChanged();
    } catch (cause) { setPasswordError(cause instanceof Error ? cause.message : 'Could not change password.'); }
    finally { setPasswordBusy(false); }
  }}><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Secure your account</p><h1 className="mt-2 text-2xl font-extrabold text-slate-950">Change temporary password</h1><p className="mt-2 text-sm leading-6 text-slate-600">Set a private password before opening school records.</p><label className={`${labelClass} mt-5`}>Temporary password<input required type="password" autoComplete="current-password" name="currentPassword" className={inputClass}/></label><label className={`${labelClass} mt-4`}>New password (at least 12 characters)<input required minLength={12} type="password" autoComplete="new-password" name="newPassword" className={inputClass}/></label>{passwordError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{passwordError}</p>}<button disabled={passwordBusy} className={`${buttonClass} mt-5 w-full`}>{passwordBusy ? 'Changing password…' : 'Set new password'}</button></form></section>;

  return <section className="min-h-[calc(100vh-4rem)] bg-slate-50 px-3 py-4 sm:px-5 lg:px-6 lg:py-6">
    <div className="mx-auto flex max-w-[1600px] gap-5">
      <aside className={`${mobileNavOpen ? 'block' : 'hidden'} fixed inset-y-0 left-0 z-40 w-72 overflow-y-auto border-r border-slate-200 bg-white p-4 shadow-xl lg:static lg:block lg:w-64 lg:shrink-0 lg:rounded-2xl lg:border lg:shadow-sm`} aria-label="Main navigation">
        <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4 lg:justify-start lg:gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-800"><School className="h-5 w-5" /></span><div className="min-w-0 flex-1 lg:flex-none"><p className="truncate text-xs font-bold uppercase tracking-wider text-blue-700">Redeemer ERP</p><p className="truncate text-xs text-slate-500">{account.roles[0]?.replaceAll('_', ' ') || 'School user'}</p></div><button aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"><X className="h-5 w-5" /></button></div>
        <nav className="space-y-1">{workspaceItems.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => { setActiveWorkspace(item.id); setMobileNavOpen(false); }} aria-current={activeWorkspace === item.id ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${activeWorkspace === item.id ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}><Icon className="h-4 w-4 shrink-0"/><span>{item.label}</span></button>; })}</nav>
        <div className="mt-8 rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Signed in as</p><p className="mt-1 truncate text-sm font-semibold text-slate-800">{account.fullName}</p><p className="truncate text-xs text-slate-500">{account.email}</p></div>
      </aside>
      {mobileNavOpen && <button aria-label="Close navigation overlay" onClick={() => setMobileNavOpen(false)} className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" />}
      <div className="min-w-0 flex-1">
      <header className="mb-7 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><button aria-label="Open navigation" onClick={() => setMobileNavOpen(true)} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 lg:hidden"><Menu className="h-5 w-5" /></button><span className="hidden h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-800 sm:grid"><School className="h-6 w-6" /></span>
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">{isPortalUser ? 'Student & family portal' : 'School operations · Staging'}</p><h1 className="mt-1 text-2xl font-extrabold text-slate-950">{workspaceItems.find(item => item.id === activeWorkspace)?.label || 'Overview'}</h1>
            <p className="mt-1 text-sm text-slate-600">Welcome, {account.fullName}. Your menu and data are limited to your school role.</p></div></div>
        <div className="flex gap-2"><button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /> Refresh</button>
          <button onClick={onSignOut} disabled={signOutBusy} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{signOutBusy ? 'Signing out…' : 'Sign out'}</button></div>
      </header>
      {(error || authError) && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error || authError}</div>}
      {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div>}
      {loading ? <div className="grid min-h-48 place-items-center text-slate-600"><LoaderCircle className="h-5 w-5 animate-spin" /></div> : portal ? <PortalDashboard portal={portal} /> : dashboard ? <>
        {activeWorkspace !== 'overview' ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">Workspace is being connected</p><h2 className="mt-2 text-xl font-extrabold text-slate-950">{workspaceItems.find(item => item.id === activeWorkspace)?.label}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">Your account has permission to access this area, but its database-backed tasks are not available in this staging build yet. No records can be changed from this page. Return to Overview to see the information currently available to your role.</p><button onClick={() => setActiveWorkspace('overview')} className="mt-4 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800">Return to overview</button></section> : <>
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Your school dashboard</p>
          <h2 className="mt-2 text-2xl font-extrabold text-slate-950">{dashboard.school?.name || account.schoolName}</h2>
          <p className="mt-2 text-sm text-slate-600">This view shows aggregate information and the access granted to your account. Personal records remain restricted to the authorized workflows.</p>
          {dashboard.cards.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{dashboard.cards.map(card => <div key={card.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm text-slate-500">{card.label}</p><p className="mt-1 text-2xl font-extrabold text-slate-950">{card.value}</p></div>)}</div> : <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No summary metrics are available for this account yet.</p>}
          <div className="mt-6"><h3 className="font-bold text-slate-900">Granted permissions</h3><div className="mt-2 flex flex-wrap gap-2">{dashboard.permissions.map(permission => <span key={permission} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">{permission}</span>)}</div></div>
        </section>
        </>}
      </> : !setup ? <p>School data could not be loaded.</p> : <>
        {activeWorkspace === 'overview' && <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[['Academic years', setup.years.length], ['Classes', setup.classes.length], ['Teachers', setup.teachers.length], ['Enrolled students', setup.students.length]].map(([label, count]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-extrabold text-slate-950">{count}</p></div>)}
        </div>}
        {activeWorkspace === 'overview' && <section className={`${sectionClass} mb-6`}><h2 className="text-lg font-extrabold text-slate-950">Getting started</h2><p className="mt-2 text-sm text-slate-600">Choose a workspace from the left menu. Setup items that depend on another record will become available after you create the required school structure.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{workspaceItems.filter(item => item.id !== 'overview').map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setActiveWorkspace(item.id)} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-300 hover:bg-blue-50"><span className="rounded-lg bg-blue-100 p-2 text-blue-800"><Icon className="h-4 w-4"/></span><span><b className="block text-sm text-slate-900">{item.label}</b><span className="mt-1 block text-xs text-slate-500">Open workspace</span></span></button>; })}</div></section>}
        {canConfigure && activeWorkspace === 'academics' && <section className={`${sectionClass} mb-6`}><div className="mb-5 flex items-center gap-2"><BookOpen className="h-5 w-5 text-blue-700"/><h2 className="text-lg font-extrabold text-slate-950">Academic setup</h2></div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <form className="space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={submit(async form => { const data = new FormData(form); await post('academic-years', { name: data.get('name'), startsOn: data.get('startsOn'), endsOn: data.get('endsOn') }); })}>
              <h3 className="font-bold text-slate-900">Academic year</h3><label className={labelClass}>Year name<input required name="name" placeholder="2026–2027" className={inputClass}/></label><div className="grid grid-cols-2 gap-2"><label className={labelClass}>Starts<input required type="date" name="startsOn" className={inputClass}/></label><label className={labelClass}>Ends<input required type="date" name="endsOn" className={inputClass}/></label></div><button disabled={saving} className={buttonClass}><Plus className="h-4 w-4"/> Add year</button>
            </form>
            <form className="space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={submit(async form => { const data = new FormData(form); await post('subjects', { code: data.get('code'), name: data.get('name') }); })}>
              <h3 className="font-bold text-slate-900">Subject</h3><label className={labelClass}>Subject code<input required name="code" placeholder="MATH" className={inputClass}/></label><label className={labelClass}>Subject name<input required name="name" placeholder="Mathematics" className={inputClass}/></label><button disabled={saving} className={buttonClass}><Plus className="h-4 w-4"/> Add subject</button>
            </form>
            <form className="space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={submit(async form => { const data = new FormData(form); await post('education-levels', { code: data.get('code'), name: data.get('name') }); })}>
              <h3 className="font-bold text-slate-900">Education stage</h3><label className={labelClass}>Code<input required name="code" placeholder="PRIMARY" className={inputClass}/></label><label className={labelClass}>Name<input required name="name" placeholder="Primary School" className={inputClass}/></label><button disabled={saving} className={buttonClass}><Plus className="h-4 w-4"/> Add stage</button>
            </form>
            <form className="space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={submit(async form => { const data = new FormData(form); await post('grade-levels', { educationLevelId: data.get('educationLevelId'), code: data.get('code'), name: data.get('name') }); })}>
              <h3 className="font-bold text-slate-900">Grade level</h3><label className={labelClass}>Education stage<select required name="educationLevelId" className={inputClass}><option value="">Choose stage</option>{setup.educationLevels.map(row => <option key={row.id} value={row.id!}>{row.name}</option>)}</select></label><label className={labelClass}>Code<input required name="code" placeholder="GRADE_4" className={inputClass}/></label><label className={labelClass}>Display name<input required name="name" placeholder="Grade 4" className={inputClass}/></label><button disabled={saving || !setup.educationLevels.length} className={buttonClass}><Plus className="h-4 w-4"/> Add grade</button>
            </form>
            <form className="space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={submit(async form => { const data = new FormData(form); await post('classes', { academicYearId: data.get('academicYearId'), name: data.get('name'), gradeLevel: data.get('gradeLevel'), section: data.get('section') }); })}>
              <h3 className="font-bold text-slate-900">Class / section</h3><label className={labelClass}>Academic year<select required name="academicYearId" className={inputClass}><option value="">Choose year</option>{setup.years.map(row => <option key={row.id} value={row.id!}>{row.name}</option>)}</select></label><label className={labelClass}>Grade level<select name="gradeLevelId" className={inputClass}><option value="">Other / legacy grade</option>{setup.gradeLevels.map(row => <option key={row.id} value={row.id!}>{row.education_level_name} · {row.name}</option>)}</select></label><label className={labelClass}>Class name<input required name="name" placeholder="Grade 4 A" className={inputClass}/></label><div className="grid grid-cols-2 gap-2"><label className={labelClass}>Grade label<input required name="gradeLevel" placeholder="Grade 4" className={inputClass}/></label><label className={labelClass}>Section<input required name="section" placeholder="A" className={inputClass}/></label></div><button disabled={saving || !setup.years.length} className={buttonClass}><Plus className="h-4 w-4"/> Add class</button>
            </form>
          </div>
        </section>}
        {canManageCurriculum && activeWorkspace === 'curriculum' && <section className={`${sectionClass} mb-6`}><div className="mb-5 flex items-center gap-2"><BookOpen className="h-5 w-5 text-blue-700"/><h2 className="text-lg font-extrabold text-slate-950">Curriculum, books & timetable</h2></div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <form className="space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={submit(async form => { const d = new FormData(form); await post('curriculum', { academicYearId: d.get('academicYearId'), gradeLevelId: d.get('gradeLevelId'), subjectId: d.get('subjectId'), termId: d.get('termId'), weeklyMinutes: Number(d.get('weeklyMinutes')), periodsPerWeek: Number(d.get('periodsPerWeek')), learningObjectives: d.get('learningObjectives') }); })}>
              <h3 className="font-bold text-slate-900">Subject time by grade</h3><label className={labelClass}>Academic year<select required name="academicYearId" className={inputClass}><option value="">Choose year</option>{setup.years.map(x => <option key={x.id} value={x.id!}>{x.name}</option>)}</select></label><label className={labelClass}>Grade<select required name="gradeLevelId" className={inputClass}><option value="">Choose grade</option>{setup.gradeLevels.map(x => <option key={x.id} value={x.id!}>{x.education_level_name} · {x.name}</option>)}</select></label><label className={labelClass}>Subject<select required name="subjectId" className={inputClass}><option value="">Choose subject</option>{setup.subjects.map(x => <option key={x.id} value={x.id!}>{x.name}</option>)}</select></label><label className={labelClass}>Term<select name="termId" className={inputClass}><option value="">Whole academic year</option>{setup.terms.map(x => <option key={x.id} value={x.id!}>{x.name}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label className={labelClass}>Minutes / week<input required min="1" max="3000" type="number" name="weeklyMinutes" placeholder="240" className={inputClass}/></label><label className={labelClass}>Lessons / week<input required min="1" max="50" type="number" name="periodsPerWeek" placeholder="4" className={inputClass}/></label></div><label className={labelClass}>Learning objectives<textarea name="learningObjectives" rows={2} className={inputClass}/></label><button disabled={saving || !setup.gradeLevels.length || !setup.subjects.length} className={buttonClass}><Plus className="h-4 w-4"/> Save curriculum</button>
            </form>
            <form className="space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={submit(async form => { const d = new FormData(form); await post('resources', { curriculumSubjectId: d.get('curriculumSubjectId'), resourceType: d.get('resourceType'), title: d.get('title'), author: d.get('author'), publisher: d.get('publisher'), isbn: d.get('isbn'), edition: d.get('edition'), resourceUrl: d.get('resourceUrl'), description: d.get('description'), required: d.get('required') === 'on' }); })}>
              <h3 className="font-bold text-slate-900">Books & learning materials</h3><label className={labelClass}>Grade · subject · year<select required name="curriculumSubjectId" className={inputClass}><option value="">Choose curriculum subject</option>{setup.curriculum.map(x => <option key={x.id} value={x.id!}>{x.grade_name} · {x.subject_name} · {x.academic_year_name}</option>)}</select></label><label className={labelClass}>Type<select name="resourceType" className={inputClass}><option value="TEXTBOOK">Textbook</option><option value="BOOK">Book</option><option value="WORKBOOK">Workbook</option><option value="TEACHING_MATERIAL">Teaching material</option><option value="LINK">Online resource link</option><option value="OTHER">Other</option></select></label><label className={labelClass}>Title<input required name="title" className={inputClass}/></label><div className="grid grid-cols-2 gap-2"><label className={labelClass}>Author<input name="author" className={inputClass}/></label><label className={labelClass}>Publisher<input name="publisher" className={inputClass}/></label><label className={labelClass}>ISBN<input name="isbn" className={inputClass}/></label><label className={labelClass}>Edition<input name="edition" className={inputClass}/></label></div><label className={labelClass}>Description<textarea name="description" rows={2} className={inputClass}/></label><label className={labelClass}>Secure HTTPS link (required for online links)<input type="url" name="resourceUrl" placeholder="https://…" className={inputClass}/></label><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="required"/> Required for this grade</label><button disabled={saving || !setup.curriculum.length} className={buttonClass}><Plus className="h-4 w-4"/> Add resource</button>
            </form>
            <form className="space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={submit(async form => { const d = new FormData(form); await post('periods', { name: d.get('name'), startsAt: d.get('startsAt'), endsAt: d.get('endsAt') }); })}>
              <h3 className="font-bold text-slate-900">Bell schedule period</h3><label className={labelClass}>Period name<input required name="name" placeholder="Period 1" className={inputClass}/></label><div className="grid grid-cols-2 gap-2"><label className={labelClass}>Starts<input required type="time" name="startsAt" className={inputClass}/></label><label className={labelClass}>Ends<input required type="time" name="endsAt" className={inputClass}/></label></div><button disabled={saving} className={buttonClass}><Plus className="h-4 w-4"/> Add period</button>
            </form>
            {canManageTimetable && <form className="space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={submit(async form => { const d = new FormData(form); await post('timetable', { assignmentId: d.get('assignmentId'), periodId: d.get('periodId'), dayOfWeek: Number(d.get('dayOfWeek')), effectiveFrom: d.get('effectiveFrom'), effectiveTo: d.get('effectiveTo') }); })}>
              <h3 className="font-bold text-slate-900">Class & teacher timetable</h3><label className={labelClass}>Assigned class and teacher<select required name="assignmentId" className={inputClass}><option value="">Choose assignment</option>{setup.assignments.map(x => <option key={x.id} value={x.id!}>{x.class_name} · {x.subject_name} · {x.teacher_name}</option>)}</select></label><label className={labelClass}>Period<select required name="periodId" className={inputClass}><option value="">Choose period</option>{setup.periods.map(x => <option key={x.id} value={x.id!}>{x.name} · {x.starts_at?.slice(0,5)}–{x.ends_at?.slice(0,5)}</option>)}</select></label><label className={labelClass}>Weekday<select name="dayOfWeek" className={inputClass}>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((x,i) => <option key={x} value={i+1}>{x}</option>)}</select></label><label className={labelClass}>Effective from<input required type="date" name="effectiveFrom" defaultValue={today()} className={inputClass}/></label><label className={labelClass}>Until (optional)<input type="date" name="effectiveTo" className={inputClass}/></label><button disabled={saving || !setup.periods.length || !setup.assignments.length} className={buttonClass}><Plus className="h-4 w-4"/> Schedule class</button>
            </form>}
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2"><div><h3 className="mb-2 font-bold text-slate-900">Configured curriculum</h3><ul className="divide-y divide-slate-100">{setup.curriculum.map(x => <li key={x.id} className="py-2 text-sm text-slate-700">{x.grade_name} · {x.subject_name}: {x.weekly_minutes} min / {x.periods_per_week} lessons weekly <span className="text-slate-500">({x.academic_year_name}{x.term_name ? ` · ${x.term_name}` : ''})</span></li>)}</ul></div><div><h3 className="mb-2 font-bold text-slate-900">Scheduled classes</h3><ul className="divide-y divide-slate-100">{setup.timetable.map(x => <li key={x.id} className="py-2 text-sm text-slate-700">{['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'][Number(x.day_of_week)]} {x.starts_at?.slice(0,5)} · {x.class_name} · {x.subject_name} <span className="text-slate-500">({x.teacher_name})</span></li>)}</ul></div></div>
        </section>}
        {activeWorkspace === 'teaching' && canReviewGrades && <AssessmentGradebook setup={setup} account={account} csrfToken={csrfToken} onUpdated={refresh} />}
        {(activeWorkspace === 'people' || activeWorkspace === 'teaching') && <div className="grid gap-6 xl:grid-cols-2">
          {activeWorkspace === 'people' && canManageStaff && <section className={sectionClass}><div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-blue-700"/><h2 className="text-lg font-extrabold text-slate-950">Teacher records</h2></div>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit(async form => { const data = new FormData(form); const result = await post('teachers', { fullName: data.get('fullName'), email: data.get('email'), employeeNumber: data.get('employeeNumber') }); return result.notice as string; })}>
              <label className={labelClass}>Full name<input required name="fullName" autoComplete="name" className={inputClass}/></label><label className={labelClass}>Employee number<input required name="employeeNumber" className={inputClass}/></label><label className={`${labelClass} sm:col-span-2`}>Teacher email<input required type="email" name="email" autoComplete="email" className={inputClass}/></label><button disabled={saving} className={buttonClass}><Plus className="h-4 w-4"/> Create teacher login</button>
            </form>
          </section>}
          {activeWorkspace === 'people' && account.permissions.includes('users.manage') && <section className={sectionClass}><div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-blue-700"/><h2 className="text-lg font-extrabold text-slate-950">Staff accounts & test roles</h2></div>
            <p className="mb-4 text-sm leading-6 text-slate-600">Create fictional staging users for school leadership and operations. Each account gets only the permissions configured for its school role. If a pending staff member missed the setup email, submit the same role and email again to send a fresh link; the old link will stop working.</p>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit(async form => { const d = new FormData(form); const result = await post('staff-accounts', { role: d.get('role'), fullName: d.get('fullName'), email: d.get('email'), employeeNumber: d.get('employeeNumber'), jobTitle: d.get('jobTitle') }); return result.notice as string; })}>
              <label className={labelClass}>School role<select required name="role" className={inputClass}><option value="">Choose role</option><option value="PRINCIPAL">Principal</option><option value="REGISTRAR">Registrar</option><option value="FINANCE">Finance / bursar</option><option value="HR_MANAGER">HR manager</option><option value="INVENTORY_MANAGER">Inventory manager</option><option value="DEPARTMENT_HEAD">Department head</option><option value="AUDITOR">Auditor (read-only)</option></select></label>
              <label className={labelClass}>Employee number<input required name="employeeNumber" className={inputClass}/></label>
              <label className={labelClass}>Full name<input required name="fullName" autoComplete="name" className={inputClass}/></label>
              <label className={labelClass}>Job title<input required name="jobTitle" className={inputClass}/></label>
              <label className={`${labelClass} sm:col-span-2`}>Login email<input required type="email" name="email" autoComplete="email" className={inputClass}/></label>
              <button disabled={saving} className={buttonClass}><Plus className="h-4 w-4"/> Create staff login</button>
            </form>
          </section>}
          {activeWorkspace === 'people' && canConfigure && <section className={sectionClass}><div className="mb-4 flex items-center gap-2"><BookOpen className="h-5 w-5 text-blue-700"/><h2 className="text-lg font-extrabold text-slate-950">Assign teaching responsibility</h2></div>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit(async form => { const data = new FormData(form); await post('teacher-assignments', { teacherId: data.get('teacherId'), subjectId: data.get('subjectId'), classGroupId: data.get('classGroupId'), academicYearId: data.get('academicYearId'), effectiveFrom: data.get('effectiveFrom') }); })}>
              <label className={labelClass}>Teacher<select required name="teacherId" className={inputClass}><option value="">Choose teacher</option>{setup.teachers.map(row => <option key={row.id} value={row.id!}>{row.full_name} · {row.employee_number}</option>)}</select></label><label className={labelClass}>Subject<select required name="subjectId" className={inputClass}><option value="">Choose subject</option>{setup.subjects.map(row => <option key={row.id} value={row.id!}>{row.name} ({row.code})</option>)}</select></label><label className={labelClass}>Class<select required name="classGroupId" className={inputClass}><option value="">Choose class</option>{setup.classes.map(row => <option key={row.id} value={row.id!}>{row.name} · {row.academic_year_name}</option>)}</select></label><label className={labelClass}>Academic year<select required name="academicYearId" className={inputClass}><option value="">Choose year</option>{setup.years.map(row => <option key={row.id} value={row.id!}>{row.name}</option>)}</select></label><label className={labelClass}>Effective from<input required type="date" name="effectiveFrom" defaultValue={today()} className={inputClass}/></label><button disabled={saving} className={`${buttonClass} self-end`}><Plus className="h-4 w-4"/> Save assignment</button>
            </form>
            <ul className="mt-4 divide-y divide-slate-100">{setup.assignments.map(row => <li key={row.id} className="py-2 text-sm text-slate-700"><b>{row.teacher_name}</b> · {row.subject_name} · {row.class_name} <span className="text-slate-500">({row.academic_year_name})</span></li>)}</ul>
          </section>}
          {activeWorkspace === 'people' && canEnroll && <section className={sectionClass}><div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-blue-700"/><h2 className="text-lg font-extrabold text-slate-950">Student records & enrollment</h2></div>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit(async form => { const data = new FormData(form); await post('students', { studentNumber: data.get('studentNumber'), firstName: data.get('firstName'), lastName: data.get('lastName'), classGroupId: data.get('classGroupId') }); })}>
              <label className={labelClass}>Student ID<input required name="studentNumber" className={inputClass}/></label><label className={labelClass}>First name<input required name="firstName" className={inputClass}/></label><label className={labelClass}>Last name<input required name="lastName" className={inputClass}/></label><label className={labelClass}>Class<select required name="classGroupId" className={inputClass}><option value="">Choose class</option>{setup.classes.map(row => <option key={row.id} value={row.id!}>{row.name} · {row.academic_year_name}</option>)}</select></label><button disabled={saving || !setup.classes.length} className={buttonClass}><Plus className="h-4 w-4"/> Save student & enroll</button>
            </form>
            <p className="mt-3 text-xs leading-5 text-slate-500">This initial roster form stores only student ID and name. Add guardian, birth, and sensitive details through the later controlled student-record workflow.</p>
          </section>}
          {activeWorkspace === 'people' && account.permissions.includes('users.manage') && <section className={sectionClass}><div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-blue-700"/><h2 className="text-lg font-extrabold text-slate-950">Student & guardian portal accounts</h2></div>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit(async form => { const d = new FormData(form); const result = await post('portal-accounts', { type: d.get('type'), studentId: d.get('studentId'), fullName: d.get('fullName'), email: d.get('email'), relationship: d.get('relationship'), canViewResults: d.get('canViewResults') === 'on', canViewFinance: d.get('canViewFinance') === 'on', communicationConsent: d.get('communicationConsent') === 'on' }); return result.notice as string; })}>
              <label className={labelClass}>Create account for<select name="type" className={inputClass}><option value="STUDENT">Student</option><option value="PARENT">Parent / guardian</option></select></label><label className={labelClass}>Link to student<select required name="studentId" className={inputClass}><option value="">Choose student</option>{setup.students.map(x => <option key={x.id} value={x.id!}>{x.first_name} {x.last_name} · {x.student_number}</option>)}</select></label><label className={labelClass}>Full name<input required name="fullName" className={inputClass}/></label><label className={labelClass}>Login email<input required type="email" name="email" className={inputClass}/></label><label className={labelClass}>Relationship (guardian only)<input name="relationship" placeholder="Parent, aunt, guardian" className={inputClass}/></label><div className="space-y-2 self-end text-sm text-slate-700"><label className="flex items-center gap-2"><input type="checkbox" name="canViewResults" defaultChecked/> Guardian may view published grades</label><label className="flex items-center gap-2"><input type="checkbox" name="canViewFinance"/> Guardian may view finance details</label><label className="flex items-center gap-2"><input type="checkbox" name="communicationConsent"/> Guardian consents to school communications</label></div><button disabled={saving || !setup.students.length} className={buttonClass}><Plus className="h-4 w-4"/> Create linked portal login</button>
            </form><p className="mt-3 text-xs leading-5 text-slate-500">Portal logins are linked to exactly one learner per student account. Guardian permissions are attached to that learner relationship, so they do not grant access to unrelated records.</p>
          </section>}
          {activeWorkspace === 'teaching' && canTakeAttendance && <section className={`${sectionClass} xl:col-span-2`}><div className="mb-4 flex items-center gap-2"><Check className="h-5 w-5 text-blue-700"/><h2 className="text-lg font-extrabold text-slate-950">Teacher class roll call</h2></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className={labelClass}>Assigned class & subject<select value={assignmentId} onChange={event => setAssignmentId(event.target.value)} className={inputClass}><option value="">Choose an assignment</option>{setup.assignments.map(row => <option key={row.id} value={row.id!}>{row.class_name} · {row.subject_name} — {row.teacher_name}</option>)}</select></label><label className={labelClass}>Lesson date<input type="date" value={attendanceDate} onChange={event => setAttendanceDate(event.target.value)} className={inputClass}/></label><label className={labelClass}>Lesson time<input type="time" value={sessionTime} onChange={event => setSessionTime(event.target.value)} className={inputClass}/></label><label className={labelClass}>Topic taught<input value={sessionTopic} onChange={event => setSessionTopic(event.target.value)} placeholder="Lesson topic" className={inputClass}/></label></div>
            {attendanceLoading ? <p className="mt-5 flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin"/> Loading enrolled students…</p> : assignmentId ? <>
              {roster.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-3 pr-3">Student ID</th><th className="py-3 pr-3">Student</th><th className="py-3 pr-3">Attendance</th><th className="py-3">Note</th></tr></thead><tbody className="divide-y divide-slate-100">{roster.map(student => <tr key={student.id}><td className="py-2.5 pr-3 font-mono text-xs">{student.student_number}</td><td className="py-2.5 pr-3 font-semibold text-slate-900">{student.first_name} {student.last_name}</td><td className="py-2.5 pr-3"><select aria-label={`Attendance for ${student.first_name} ${student.last_name}`} value={attendance[student.id]?.status || ''} onChange={event => setAttendance(current => ({ ...current, [student.id]: { ...current[student.id], status: event.target.value, note: current[student.id]?.note || '' } }))} className="rounded-lg border border-slate-300 bg-white px-2 py-2"><option value="">Select status</option><option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="LATE">Late</option><option value="EXCUSED">Excused</option></select></td><td className="py-2.5"><input aria-label={`Attendance note for ${student.first_name} ${student.last_name}`} value={attendance[student.id]?.note || ''} onChange={event => setAttendance(current => ({ ...current, [student.id]: { ...current[student.id], status: current[student.id]?.status || '', note: event.target.value } }))} placeholder="Optional note" className="w-full rounded-lg border border-slate-300 px-2 py-2"/></td></tr>)}</tbody></table></div> : <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No active students are enrolled in this class yet. Add the class roster above first.</p>}
              {hasCorrectionChange && <label className={`${labelClass} mt-4 block`}>Reason for changing previously recorded attendance<textarea required value={correctionReason} onChange={event => setCorrectionReason(event.target.value)} maxLength={500} className={inputClass} rows={2}/></label>}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">Marked {markedCount} of {roster.length} students. All students need a status before saving.</p><button onClick={() => void saveRollCall()} disabled={saving || !roster.length || markedCount !== roster.length || !sessionTopic.trim() || (hasCorrectionChange && !correctionReason.trim())} className={buttonClass}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Check className="h-4 w-4"/>} Save roll call</button></div>
            </> : <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">First set up an academic year, class, students, teacher, subject, and teaching assignment above.</p>}
          </section>}
        </div>}
        {activeWorkspace !== 'overview' && !workspaceItems.some(item => item.id === activeWorkspace) && <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">This area is not available for your account.</p>}
        {activeWorkspace === 'overview' && <p className="mt-6 text-center text-xs leading-5 text-slate-500">Staging workflow: academic setup, teacher assignments, student enrollment, assessments, and attendance are database-backed. Finance, HR, inventory, communications, and remaining school workflows are still in development.</p>}
      </>}
      </div>
    </div>
  </section>;
};

const AssessmentGradebook: React.FC<{ setup: Setup; account: SchoolAccount; csrfToken: string; onUpdated: () => Promise<void> }> = ({ setup, account, csrfToken, onUpdated }) => {
  const [selectedId, setSelectedId] = useState('');
  const [assessment, setAssessment] = useState<{ id: string; title: string; type: string; maxScore: number; status: string; className: string; subjectName: string } | null>(null);
  const [students, setStudents] = useState<Array<{ id: string; studentNumber: string; firstName: string; lastName: string; score: string; feedback: string }>>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canEnter = account.permissions.includes('grades.enter');
  const canModerate = account.permissions.includes('grades.moderate');
  const canPublish = account.permissions.includes('grades.publish');
  const selected = setup.assessments.find(item => item.id === selectedId);

  const loadRoster = useCallback(async (id: string) => {
    if (!id) return;
    setLoadingRoster(true); setError('');
    try {
      const response = await fetch(`/api/operations/assessments/${encodeURIComponent(id)}/roster`, { credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load assessment marks.');
      setAssessment(result.assessment);
      setStudents((result.students || []).map((student: Record<string, unknown>) => ({
        id: String(student.id), studentNumber: String(student.studentNumber), firstName: String(student.firstName), lastName: String(student.lastName),
        score: student.score == null ? '' : String(student.score), feedback: student.feedback == null ? '' : String(student.feedback),
      })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load assessment marks.'); setAssessment(null); setStudents([]); }
    finally { setLoadingRoster(false); }
  }, []);

  useEffect(() => {
    if (!selectedId && setup.assessments.length) setSelectedId(setup.assessments[0].id);
    if (selectedId && !setup.assessments.some(item => item.id === selectedId)) setSelectedId('');
  }, [selectedId, setup.assessments]);

  useEffect(() => { if (selectedId) void loadRoster(selectedId); }, [selectedId, loadRoster]);

  const sendAction = async (path: string, body: Record<string, unknown> = {}) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/operations/${path}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The grade operation could not be completed.');
      await onUpdated();
      if (selectedId) await loadRoster(selectedId);
      return result;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The grade operation could not be completed.'); return null; }
    finally { setBusy(false); }
  };

  const createAssessment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setBusy(true); setError(''); setNotice('');
    try {
      const rawDueAt = String(data.get('dueAt') || '');
      const response = await fetch('/api/operations/assessments', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ assignmentId: data.get('assignmentId'), title: data.get('title'), assessmentType: data.get('assessmentType'), maxScore: Number(data.get('maxScore')), dueAt: rawDueAt ? new Date(rawDueAt).toISOString() : null }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not create the assessment.');
      form.reset(); setSelectedId(result.assessment.id); setNotice('Assessment created. Enter marks for the enrolled students below.'); await onUpdated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create the assessment.'); }
    finally { setBusy(false); }
  };

  const saveScores = async () => {
    if (!selectedId) return;
    const scores = students.filter(student => student.score.trim() !== '').map(student => ({ studentId: student.id, score: Number(student.score), feedback: student.feedback }));
    if (!scores.length || scores.some(item => !Number.isFinite(item.score) || item.score < 0 || item.score > Number(assessment?.maxScore))) { setError('Enter valid marks between zero and the assessment maximum.'); return; }
    const result = await sendAction(`assessments/${encodeURIComponent(selectedId)}/scores`, { scores });
    if (result) setNotice(`${result.saved} mark${result.saved === 1 ? '' : 's'} saved.`);
  };

  const completeCount = students.filter(student => student.score.trim() !== '').length;
  return <section className={`${sectionClass} mb-6`}>
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Teaching & learning</p><h2 className="mt-1 text-lg font-extrabold text-slate-950">Assessments & gradebook</h2><p className="mt-1 text-sm text-slate-600">Create quizzes, tests, exams, assignments, or projects; record marks and route results for review.</p></div>
      {selected && <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{selected.status.replaceAll('_', ' ')}</span>}
    </div>
    {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.75fr)_minmax(0,1.5fr)]">
      {canEnter && <form onSubmit={createAssessment} className="space-y-3 rounded-xl bg-slate-50 p-4">
        <h3 className="font-bold text-slate-900">Create assessment</h3>
        <label className={labelClass}>My assigned class and subject<select required name="assignmentId" className={inputClass}><option value="">Choose assignment</option>{setup.assignments.map(row => <option key={row.id} value={row.id!}>{row.class_name} · {row.subject_name}{account.roles.includes('TEACHER') ? '' : ` · ${row.teacher_name}`}</option>)}</select></label>
        <label className={labelClass}>Title<input required name="title" maxLength={160} className={inputClass} placeholder="Quiz 1: Fractions"/></label>
        <div className="grid grid-cols-2 gap-3"><label className={labelClass}>Type<select name="assessmentType" className={inputClass}><option value="QUIZ">Quiz</option><option value="TEST">Test</option><option value="EXAM">Exam</option><option value="ASSIGNMENT">Assignment</option><option value="PROJECT">Project</option></select></label><label className={labelClass}>Maximum mark<input required name="maxScore" type="number" min="0.01" max="9999.99" step="0.01" defaultValue="100" className={inputClass}/></label></div>
        <label className={labelClass}>Due date (optional)<input name="dueAt" type="datetime-local" className={inputClass}/></label>
        <button disabled={busy || !setup.assignments.length} className={buttonClass}><Plus className="h-4 w-4"/> Create assessment</button>
        {!setup.assignments.length && <p className="text-xs text-slate-500">Set up a teacher and assign a class and subject before creating assessments.</p>}
      </form>}
      <div className="space-y-4">
        <label className={labelClass}>Assessment<select value={selectedId} onChange={event => setSelectedId(event.target.value)} className={inputClass}><option value="">Choose an assessment</option>{setup.assessments.map(item => <option key={item.id} value={item.id}>{item.class_name} · {item.subject_name} · {item.title} ({item.status.replaceAll('_', ' ')})</option>)}</select></label>
        {loadingRoster ? <p className="flex items-center gap-2 py-8 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin"/> Loading class marks…</p> : assessment ? <>
          <div className="flex flex-wrap justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm"><span><b>{assessment.className}</b> · {assessment.subjectName} · {assessment.type}</span><span>Maximum: <b>{assessment.maxScore}</b></span></div>
          {students.length ? <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Student</th><th className="px-3 py-3">Mark / {assessment.maxScore}</th><th className="px-3 py-3">Outcome</th><th className="px-3 py-3">Feedback</th></tr></thead><tbody className="divide-y divide-slate-100">{students.map(student => {
            const numericScore = student.score.trim() ? Number(student.score) : null;
            let outcome = '—'; let percentLabel = '';
            if (numericScore !== null && Number.isFinite(numericScore) && assessment.maxScore > 0 && numericScore >= 0 && numericScore <= assessment.maxScore) {
              const percent = numericScore / assessment.maxScore * 100; percentLabel = `${percent.toFixed(1)}%`;
              const result = classifySchoolGrade(percent);
              outcome = result.outcome === 'FAIL' ? 'Fail' : result.outcome === 'PASS' ? 'Pass' : 'Review required';
            }
            return <tr key={student.id}><td className="px-3 py-2.5"><span className="font-semibold">{student.firstName} {student.lastName}</span><span className="block text-xs text-slate-500">{student.studentNumber}</span></td><td className="px-3 py-2.5">{canEnter && assessment.status === 'OPEN' ? <input aria-label={`Mark for ${student.firstName} ${student.lastName}`} type="number" min="0" max={assessment.maxScore} step="0.01" value={student.score} onChange={event => setStudents(current => current.map(row => row.id === student.id ? { ...row, score: event.target.value } : row))} className="w-28 rounded-lg border border-slate-300 px-2 py-2"/> : student.score || '—'}</td><td className="px-3 py-2.5"><span className={outcome === 'Pass' ? 'font-semibold text-emerald-700' : outcome === 'Fail' ? 'font-semibold text-red-700' : 'font-semibold text-amber-700'}>{outcome}</span>{percentLabel && <span className="ml-1 text-xs text-slate-500">{percentLabel}</span>}</td><td className="px-3 py-2.5">{canEnter && assessment.status === 'OPEN' ? <input aria-label={`Feedback for ${student.firstName} ${student.lastName}`} value={student.feedback} onChange={event => setStudents(current => current.map(row => row.id === student.id ? { ...row, feedback: event.target.value } : row))} maxLength={1000} className="w-full rounded-lg border border-slate-300 px-2 py-2"/> : student.feedback || '—'}</td></tr>;
          })}</tbody></table></div> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No active students are enrolled in this class yet.</p>}
          <p className="text-xs leading-5 text-slate-500">Score bands use percentage of the assessment maximum: 1–60% fail, 70–100% pass. Scores from 0 to below 1% and above 60% but below 70% are held for review under the current policy.</p>
          <div className="flex flex-wrap gap-2">
            {canEnter && assessment.status === 'OPEN' && <><button onClick={() => void saveScores()} disabled={busy || completeCount === 0} className={buttonClass}>{busy ? 'Saving…' : 'Save marks'}</button><button onClick={() => void sendAction(`assessments/${encodeURIComponent(selectedId)}/submit`)} disabled={busy || students.length === 0 || completeCount !== students.length} className="rounded-lg border border-blue-300 px-4 py-2.5 text-sm font-bold text-blue-800 disabled:opacity-50">Submit all marks for review</button></>}
            {canModerate && assessment.status === 'SUBMITTED_FOR_REVIEW' && <button onClick={() => void sendAction(`assessments/${encodeURIComponent(selectedId)}/approve`)} disabled={busy} className={buttonClass}>Approve marks</button>}
            {canPublish && assessment.status === 'APPROVED' && <button onClick={() => void sendAction(`assessments/${encodeURIComponent(selectedId)}/publish`)} disabled={busy} className={buttonClass}>Publish results to portals</button>}
          </div>
        </> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Choose an assessment to view its class roster and marks. Newly created assessments appear here.</p>}
      </div>
    </div>
  </section>;
};

const PortalDashboard: React.FC<{ portal: Portal }> = ({ portal }) => {
  const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
  const childView = (student: Row, data: { subjects: Row[]; timetable: Row[]; attendance: Row[]; grades: Row[]; resources: Row[] }, canViewResults: boolean) => <div key={student.id} className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3"><div className={card}><p className="text-xs font-bold uppercase text-slate-500">Learner</p><p className="mt-1 text-lg font-bold">{student.first_name} {student.last_name}</p><p className="text-sm text-slate-600">{student.class_name || 'Class not assigned'} · {student.student_number}</p></div><div className={card}><p className="text-xs font-bold uppercase text-slate-500">Subjects</p><p className="mt-1 text-2xl font-bold">{data.subjects.length}</p></div><div className={card}><p className="text-xs font-bold uppercase text-slate-500">Recent attendance records</p><p className="mt-1 text-2xl font-bold">{data.attendance.length}</p></div></div>
    <div className="grid gap-5 lg:grid-cols-2"><section className={card}><h2 className="font-extrabold">My subjects</h2>{data.subjects.length ? <ul className="mt-3 divide-y divide-slate-100">{data.subjects.map((x,i) => <li key={`${x.subject_name}-${i}`} className="py-2 text-sm"><b>{x.subject_name}</b><span className="text-slate-600"> · {x.weekly_minutes} minutes / {x.periods_per_week} lessons weekly</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">Curriculum has not been published for this grade yet.</p>}</section>
      <section className={card}><h2 className="font-extrabold">Class timetable</h2>{data.timetable.length ? <ul className="mt-3 divide-y divide-slate-100">{data.timetable.map((x,i) => <li key={`${x.day_of_week}-${x.period_name}-${i}`} className="py-2 text-sm">{['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][Number(x.day_of_week)]} · {String(x.starts_at).slice(0,5)}–{String(x.ends_at).slice(0,5)} · <b>{x.subject_name}</b><span className="text-slate-600"> · {x.teacher_name}</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No lessons are scheduled yet.</p>}</section>
      <section className={card}><h2 className="font-extrabold">Published grades</h2>{!canViewResults ? <p className="mt-3 text-sm text-slate-500">The school has not enabled grade visibility for this guardian account.</p> : data.grades.length ? <ul className="mt-3 divide-y divide-slate-100">{data.grades.map((x,i) => { const percent = Number(x.max_score) ? Number(x.score) / Number(x.max_score) * 100 : 0; const result = classifySchoolGrade(percent); const outcome = result.outcome === 'FAIL' ? 'Fail' : result.outcome === 'PASS' ? 'Pass' : 'Review required'; return <li key={`${x.title}-${i}`} className="flex justify-between gap-3 py-2 text-sm"><span><b>{x.subject_name}</b> · {x.title} <span className="text-slate-500">({x.assessment_type})</span></span><span className="font-semibold">{x.score}/{x.max_score} · {outcome}</span></li>; })}</ul> : <p className="mt-3 text-sm text-slate-500">No grades have been published.</p>}</section>
      <section className={card}><h2 className="font-extrabold">Books & learning materials</h2>{data.resources.length ? <ul className="mt-3 divide-y divide-slate-100">{data.resources.map((x,i) => <li key={`${x.title}-${i}`} className="py-2 text-sm"><b>{x.title}</b><span className="text-slate-600"> · {x.subject_name} · {x.resource_type}{x.required ? ' · Required' : ''}</span>{x.author && <span className="text-slate-500"> · {x.author}</span>}{x.resource_url && <a className="ml-2 text-blue-700 underline" href={String(x.resource_url)} target="_blank" rel="noreferrer">Open resource</a>}</li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No materials have been added for this grade.</p>}</section>
      <section className={`${card} lg:col-span-2`}><h2 className="font-extrabold">Recent attendance</h2>{data.attendance.length ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-xs uppercase text-slate-500"><th className="py-2">Date</th><th>Subject</th><th>Status</th></tr></thead><tbody className="divide-y divide-slate-100">{data.attendance.slice(0,12).map((x,i) => <tr key={`${x.scheduled_at}-${i}`}><td className="py-2">{String(x.scheduled_at).slice(0,10)}</td><td>{x.subject_name}</td><td>{x.status}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-slate-500">No attendance history recorded.</p>}</section></div>
  </div>;
  return <div className="space-y-6"><div className="rounded-2xl bg-slate-950 p-6 text-white"><p className="text-xs font-bold uppercase tracking-widest text-blue-200">{portal.role === 'PARENT' ? 'Parent & guardian portal' : 'Learner portal'}</p><h1 className="mt-2 text-2xl font-extrabold">{portal.role === 'PARENT' ? 'Your linked learners' : `Welcome${portal.student?.first_name ? `, ${portal.student.first_name}` : ''}`}</h1><p className="mt-2 text-sm text-slate-300">Academic information is shown only for records linked to this account.</p></div>
    {!portal.linked && portal.role === 'STUDENT' && <div className={card}><p className="font-semibold">{portal.message}</p><p className="mt-2 text-sm text-slate-600">Ask the school administrator to create and link your learner portal account.</p></div>}
    {portal.role === 'STUDENT' && portal.linked && portal.student && childView(portal.student, { subjects: portal.subjects || [], timetable: portal.timetable || [], attendance: portal.attendance || [], grades: portal.grades || [], resources: portal.resources || [] }, true)}
    {portal.role === 'PARENT' && portal.children?.length === 0 && <div className={card}><p className="font-semibold">No learners are linked to this guardian login.</p><p className="mt-2 text-sm text-slate-600">Ask the school administrator to connect your account to the correct learner records.</p></div>}
    {portal.role === 'PARENT' && portal.children?.map(child => <section key={child.id} className="space-y-3"><div><h2 className="text-lg font-extrabold">{child.first_name} {child.last_name}</h2><p className="text-sm text-slate-600">{child.relationship} · {child.class_name || 'Class not assigned'}</p></div>{childView(child, child, Boolean(child.can_view_results))}<p className="text-xs text-slate-500">Finance visibility: {child.financeVisible ? 'enabled by school relationship permissions' : 'not enabled'}. Balance details are shown when the finance module is connected.</p></section>)}
  </div>;
};
