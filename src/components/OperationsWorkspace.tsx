import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Boxes, Check, ClipboardList, FileBarChart, GraduationCap, LayoutDashboard, LoaderCircle, Menu, MessageSquareText, Plus, RefreshCw, School, Settings2, Users, Wallet, X } from 'lucide-react';
import type { SchoolAccount } from './SignInPage.tsx';
import { classifySchoolGrade } from '../logic/schoolGradingPolicy.ts';

type Row = Record<string, string | null | undefined>;
type Assessment = Row & { id: string; teacher_assignment_id: string; title: string; assessment_type: string; max_score: string; status: string; class_name: string; subject_name: string; teacher_name: string; scored_students: number };
type Setup = { school: Row; years: Row[]; subjects: Row[]; classes: Row[]; teachers: Row[]; students: Row[]; assignments: Row[]; educationLevels: Row[]; gradeLevels: Row[]; terms: Row[]; curriculum: Row[]; resources: Row[]; periods: Row[]; timetable: Row[]; assessments: Assessment[] };
type Portal = { role: string; linked?: boolean; message?: string; student?: Row; subjects?: Row[]; timetable?: Row[]; attendance?: Row[]; grades?: Row[]; resources?: Row[]; children?: Array<Row & { subjects: Row[]; timetable: Row[]; attendance: Row[]; grades: Row[]; resources: Row[] }> };
type Dashboard = { school: Row | null; cards: Array<{ label: string; value: number }>; permissions: string[] };
type RosterEntry = { id: string; student_number: string; first_name: string; last_name: string; attendance_status: string | null; note: string | null };
type StudentsWorkspaceData = { students: Row[]; classes: Row[]; canEnroll: boolean };
type FinanceWorkspaceData = { invoices: Array<Row & { total: string; paid: string; balance: string }>; payments: Row[]; students: Row[]; years: Row[]; canWrite: boolean; momo: { enabled: boolean; environment: string; currency: string; feeRateBps: number; reason: string }; momoIntents: Row[] };
type ReportsWorkspaceData = { reports: { students?: Row & { classes: Row[] }; attendance?: Row[]; finance?: Row[]; staff?: Row[] } };
type OperationalWorkspaceData = StudentsWorkspaceData | FinanceWorkspaceData | ReportsWorkspaceData | null;
const today = () => new Date().toLocaleDateString('en-CA');
const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';
const labelClass = 'block text-sm font-semibold text-slate-700';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60';
const sectionClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';

interface Props { account: SchoolAccount; csrfToken: string; busy: boolean; error: string; onSignOut: () => void; onPasswordChanged: () => void; }
type PostOperation = (path: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;

export const OperationsWorkspace: React.FC<Props> = ({ account, csrfToken, busy: signOutBusy, error: authError, onSignOut, onPasswordChanged }) => {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [portal, setPortal] = useState<Portal | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [moduleData, setModuleData] = useState<OperationalWorkspaceData>(null);
  const [moduleLoading, setModuleLoading] = useState(false);
  const [moduleError, setModuleError] = useState('');
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
      const canViewSetup = account.permissions.includes('academics.configure') || ['attendance.read', 'grades.enter', 'grades.moderate', 'grades.publish'].some(permission => account.permissions.includes(permission));
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

  const loadModule = useCallback(async (workspace: string) => {
    if (!['students', 'finance', 'reports'].includes(workspace)) { setModuleData(null); setModuleError(''); return; }
    setModuleLoading(true); setModuleError('');
    try {
      const response = await fetch(`/api/operations/${workspace}`, { credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Could not load ${workspace}.`);
      setModuleData(result as OperationalWorkspaceData);
    } catch (cause) { setModuleData(null); setModuleError(cause instanceof Error ? cause.message : 'Could not load this workspace.'); }
    finally { setModuleLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void loadModule(activeWorkspace); }, [activeWorkspace, loadModule]);

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
    try { const successMessage = await action(form); await refresh(); await loadModule(activeWorkspace); setNotice(successMessage || 'Saved to the staging database.'); form.reset(); }
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
  const workspaceItems = isPortalUser ? [{ id: 'overview', label: 'My learning', icon: GraduationCap, status: 'available' as const }] : [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, status: 'available' as const },
    ...(canConfigure ? [{ id: 'academics', label: 'School setup', icon: Settings2, status: 'available' as const }] : []),
    ...(canManageCurriculum || account.permissions.includes('curriculum.read') ? [{ id: 'curriculum', label: 'Curriculum & timetable', icon: BookOpen, status: canManageCurriculum ? 'available' as const : 'connecting' as const }] : []),
    ...(canManageStaff || account.permissions.includes('users.manage') || canEnroll ? [{ id: 'people', label: 'People & accounts', icon: Users, status: 'partial' as const }] : []),
    ...(canReviewGrades || canTakeAttendance ? [{ id: 'teaching', label: 'Teaching & learning', icon: ClipboardList, status: 'partial' as const }] : []),
    ...(account.permissions.includes('admissions.read') ? [{ id: 'admissions', label: 'Admissions', icon: Users, status: 'connecting' as const }] : []),
    ...(account.permissions.includes('students.read') ? [{ id: 'students', label: 'Student records', icon: GraduationCap, status: 'partial' as const }] : []),
    ...(account.permissions.includes('finance.read') ? [{ id: 'finance', label: 'Finance', icon: Wallet, status: 'partial' as const }] : []),
    ...(account.permissions.includes('staff.read') ? [{ id: 'staff', label: 'Staff & HR', icon: Users, status: 'connecting' as const }] : []),
    ...(account.roles.includes('INVENTORY_MANAGER') || account.permissions.some(permission => permission.startsWith('inventory.')) ? [{ id: 'inventory', label: 'Inventory & procurement', icon: Boxes, status: 'connecting' as const }] : []),
    ...(account.permissions.some(permission => permission.startsWith('communications.')) ? [{ id: 'communications', label: 'Communications', icon: MessageSquareText, status: 'connecting' as const }] : []),
    ...(account.permissions.includes('reports.read') || account.permissions.includes('emis.export') ? [{ id: 'reports', label: 'Reports & EMIS', icon: FileBarChart, status: 'partial' as const }] : []),
    ...(account.permissions.includes('users.manage') ? [{ id: 'accounts', label: 'User access', icon: Settings2, status: 'partial' as const }] : []),
  ];
  const quickWorkspaces = [
    { id: 'students', title: 'Student records', subtitle: 'Find learners and review enrollment', icon: GraduationCap },
    { id: 'teaching', title: 'Attendance', subtitle: 'Open class roll call and attendance', icon: Check },
    { id: 'finance', title: 'Fee balances', subtitle: 'Invoices, payments, and balances', icon: Wallet },
    { id: 'reports', title: 'School reports', subtitle: 'View role-authorized school metrics', icon: FileBarChart },
  ].filter(link => workspaceItems.some(item => item.id === link.id));
  const dashboardTarget = (label: string) => ({
    'Active students': 'students', 'Open fee invoices': 'finance', 'Applications in review': 'admissions',
    "Today's attendance records": 'teaching', 'Assessments awaiting review': 'teaching', 'Active staff records': 'staff',
  }[label]);

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
        <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4 lg:justify-start lg:gap-3"><button aria-label="Go to overview" onClick={() => setActiveWorkspace('overview')} className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-800 hover:bg-blue-200"><School className="h-5 w-5" /></button><div className="min-w-0 flex-1 lg:flex-none"><p className="truncate text-xs font-bold uppercase tracking-wider text-blue-700">Redeemer ERP</p><p className="truncate text-xs text-slate-500">{account.roles[0]?.replaceAll('_', ' ') || 'School user'}</p></div><button aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"><X className="h-5 w-5" /></button></div>
        <nav className="space-y-1">{workspaceItems.map(item => { const Icon = item.icon; const stateLabel = item.status === 'connecting' ? 'Connecting' : item.status === 'partial' ? 'Partial' : ''; return <button key={item.id} onClick={() => { setActiveWorkspace(item.id); setMobileNavOpen(false); }} aria-current={activeWorkspace === item.id ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${activeWorkspace === item.id ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}><Icon className="h-4 w-4 shrink-0"/><span className="min-w-0 flex-1 truncate">{item.label}</span>{stateLabel && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.status === 'connecting' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>{stateLabel}</span>}</button>; })}</nav>
        <div className="mt-8 rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Signed in as</p><p className="mt-1 truncate text-sm font-semibold text-slate-800">{account.fullName}</p><p className="truncate text-xs text-slate-500">{account.email}</p></div>
      </aside>
      {mobileNavOpen && <button aria-label="Close navigation overlay" onClick={() => setMobileNavOpen(false)} className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" />}
      <div className="min-w-0 flex-1">
      <header className="mb-7 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><button aria-label="Open navigation" onClick={() => setMobileNavOpen(true)} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 lg:hidden"><Menu className="h-5 w-5" /></button><button aria-label="Go to overview" onClick={() => setActiveWorkspace('overview')} className="hidden h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-800 hover:bg-blue-200 sm:grid"><School className="h-6 w-6" /></button>
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">{isPortalUser ? 'Student & family portal' : 'School operations · Staging'}</p><h1 className="mt-1 text-2xl font-extrabold text-slate-950">{workspaceItems.find(item => item.id === activeWorkspace)?.label || 'Overview'}</h1>
            <p className="mt-1 text-sm text-slate-600">Welcome, {account.fullName}. Your menu and data are limited to your school role.</p></div></div>
        <div className="flex gap-2"><button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /> Refresh</button>
          <button onClick={onSignOut} disabled={signOutBusy} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{signOutBusy ? 'Signing out…' : 'Sign out'}</button></div>
      </header>
      {(error || authError) && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error || authError}</div>}
      {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div>}
      {loading ? <div className="grid min-h-48 place-items-center text-slate-600"><LoaderCircle className="h-5 w-5 animate-spin" /></div> : portal ? <PortalDashboard portal={portal} /> : dashboard ? <>
        {activeWorkspace !== 'overview' ? moduleLoading ? <div className="grid min-h-48 place-items-center text-slate-600"><LoaderCircle className="h-5 w-5 animate-spin" /></div> : moduleError ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{moduleError}</p> : activeWorkspace === 'finance' && moduleData && 'invoices' in moduleData ? <FinanceWorkspace data={moduleData} post={post} onSaved={() => loadModule('finance')} /> : activeWorkspace === 'students' && moduleData && 'students' in moduleData ? <StudentsWorkspace data={moduleData as StudentsWorkspaceData} post={post} onSaved={() => loadModule('students')} /> : activeWorkspace === 'reports' && moduleData && 'reports' in moduleData ? <ReportsWorkspace data={moduleData} /> : activeWorkspace === 'teaching' && setup ? <div className="space-y-5">{canTakeAttendance && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Attendance is connected to the school database. Use the class roll call below to record or correct attendance.</p>}{canReviewGrades && <AssessmentGradebook setup={setup} account={account} csrfToken={csrfToken} onUpdated={refresh} />}</div> : <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">Database workflow being connected</p><h2 className="mt-2 text-xl font-extrabold text-slate-950">{workspaceItems.find(item => item.id === activeWorkspace)?.label}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">This area appears because your role has permission to access it. Its complete day-to-day database workflow is still being built, so this page does not accept or change records yet.</p></section> : <>
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Your school dashboard</p>
          <h2 className="mt-2 text-2xl font-extrabold text-slate-950">{dashboard.school?.name || account.schoolName}</h2>
          <p className="mt-2 text-sm text-slate-600">This view shows aggregate information and the access granted to your account. Personal records remain restricted to the authorized workflows.</p>
          {dashboard.cards.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{dashboard.cards.map(card => { const target = dashboardTarget(card.label); const enabled = Boolean(target && workspaceItems.some(item => item.id === target)); return enabled ? <button key={card.label} onClick={() => setActiveWorkspace(target!)} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:border-blue-300 hover:bg-blue-50"><p className="text-sm text-slate-500">{card.label} <span className="float-right text-blue-700">Open →</span></p><p className="mt-1 text-2xl font-extrabold text-slate-950">{card.value}</p></button> : <div key={card.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm text-slate-500">{card.label}</p><p className="mt-1 text-2xl font-extrabold text-slate-950">{card.value}</p></div>; })}</div> : <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No summary metrics are available for this account yet.</p>}
          {quickWorkspaces.length > 0 && <div className="mt-6"><h3 className="font-bold text-slate-900">Quick access</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{quickWorkspaces.map(link => { const Icon = link.icon; return <button key={link.id} onClick={() => setActiveWorkspace(link.id)} className="flex min-h-28 items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-300 hover:bg-blue-50"><span className="rounded-lg bg-blue-100 p-2 text-blue-800"><Icon className="h-4 w-4"/></span><span><b className="block text-sm text-slate-900">{link.title}</b><span className="mt-1 block text-xs leading-5 text-slate-500">{link.subtitle}</span><span className="mt-2 block text-xs font-bold text-blue-700">Open workspace →</span></span></button>; })}</div></div>}
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
        {activeWorkspace === 'finance' && moduleLoading && <div className="grid min-h-48 place-items-center text-slate-600"><LoaderCircle className="h-5 w-5 animate-spin" /></div>}
        {activeWorkspace === 'finance' && moduleError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{moduleError}</p>}
        {activeWorkspace === 'finance' && !moduleLoading && !moduleError && moduleData && 'invoices' in moduleData && <FinanceWorkspace data={moduleData} post={post} onSaved={() => loadModule('finance')} />}
        {activeWorkspace === 'students' && moduleLoading && <div className="grid min-h-48 place-items-center text-slate-600"><LoaderCircle className="h-5 w-5 animate-spin" /></div>}
        {activeWorkspace === 'students' && moduleError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{moduleError}</p>}
        {activeWorkspace === 'students' && !moduleLoading && !moduleError && moduleData && 'students' in moduleData && <StudentsWorkspace data={moduleData as StudentsWorkspaceData} post={post} onSaved={() => loadModule('students')} />}
        {activeWorkspace === 'reports' && moduleLoading && <div className="grid min-h-48 place-items-center text-slate-600"><LoaderCircle className="h-5 w-5 animate-spin" /></div>}
        {activeWorkspace === 'reports' && moduleError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{moduleError}</p>}
        {activeWorkspace === 'reports' && !moduleLoading && !moduleError && moduleData && 'reports' in moduleData && <ReportsWorkspace data={moduleData} />}
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
        {activeWorkspace !== 'overview' && !['academics', 'curriculum', 'people', 'teaching', 'finance', 'students', 'reports'].includes(activeWorkspace) && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">Database workflow being connected</p><h2 className="mt-2 text-xl font-extrabold text-slate-950">{workspaceItems.find(item => item.id === activeWorkspace)?.label || 'Workspace'}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">This workspace is shown because your role has access to this area. Its complete day-to-day workflow is not available yet, so this page does not accept or change records. Use a workspace marked <b>Partial</b> or return to Overview while this area is being completed.</p><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-900">No demo records</span><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-900">No writes enabled</span></div></section>}
        {activeWorkspace === 'overview' && <p className="mt-6 text-center text-xs leading-5 text-slate-500">Staging workflow: academic setup, teacher assignments, student enrollment, assessments, and attendance are database-backed. Finance, HR, inventory, communications, and remaining school workflows are still in development.</p>}
      </>}
      </div>
    </div>
  </section>;
};

const FinanceWorkspace: React.FC<{ data: FinanceWorkspaceData; post: PostOperation; onSaved: () => Promise<void> }> = ({ data, post, onSaved }) => {
  const [working, setWorking] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [checkingIntent, setCheckingIntent] = useState('');
  const [testingMomo, setTestingMomo] = useState(false);
  const save = (kind: 'invoice' | 'payment') => async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setWorking(true); setError(''); setNotice('');
    const form = event.currentTarget; const values = new FormData(form);
    try {
      if (kind === 'invoice') {
        await post('finance/invoices', { studentId: values.get('studentId'), academicYearId: values.get('academicYearId'), invoiceNumber: values.get('invoiceNumber'), currency: values.get('currency'), dueOn: values.get('dueOn') || null, description: values.get('description'), amount: Number(values.get('amount')) });
        setNotice('Invoice issued and saved to the school database.');
      } else {
        const result = await post('finance/payments', { invoiceId: values.get('invoiceId'), channel: values.get('channel'), amount: Number(values.get('amount')), payerReference: values.get('payerReference'), note: values.get('note') });
        const payment = result.payment as Row | undefined;
        setNotice(`Payment recorded. Receipt ${payment?.receipt_number || 'created'} issued.`);
      }
      form.reset(); await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The finance action could not be completed.'); }
    finally { setWorking(false); }
  };
  const startMomoPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setWorking(true); setError(''); setNotice('');
    const form = event.currentTarget; const values = new FormData(form);
    try {
      const result = await post('finance/momo/intents', { invoiceId: values.get('invoiceId'), amount: Number(values.get('amount')), payerPhone: values.get('payerPhone') });
      const intent = result.intent as Row | undefined;
      setNotice(String(result.message || `MTN payment request created${intent?.id ? ` (${intent.id})` : ''}.`));
      form.reset(); await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The MTN payment request could not be started.'); }
    finally { setWorking(false); }
  };
  const checkMomoStatus = async (intentId: string) => {
    setCheckingIntent(intentId); setError(''); setNotice('');
    try {
      const result = await post(`finance/momo/intents/${encodeURIComponent(intentId)}/check`, {});
      setNotice(String(result.message || `MTN status: ${result.status || 'checked'}.`));
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not check the MTN payment status.'); }
    finally { setCheckingIntent(''); }
  };
  const testMomoConnection = async () => {
    setTestingMomo(true); setError(''); setNotice('');
    try {
      const result = await post('finance/momo/test-connection', {});
      setNotice(String(result.message || 'MTN sandbox credentials were accepted. No payment was created.'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not verify MTN sandbox credentials.'); }
    finally { setTestingMomo(false); }
  };
  const outstanding = data.invoices.filter(invoice => ['ISSUED','PARTIALLY_PAID','OVERDUE'].includes(String(invoice.status)) && Number(invoice.balance) > 0);
  return <div className="space-y-6">
    <section className={sectionClass}><div className="mb-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Finance workspace</p><h2 className="mt-1 text-xl font-extrabold text-slate-950">Fees, invoices & payments</h2><p className="mt-1 text-sm text-slate-600">Balances stay separated by currency. Every issued invoice and payment is recorded against the selected learner.</p></div>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{(['USD','LRD'] as const).map(currency => { const matching=data.invoices.filter(invoice=>invoice.currency===currency); const due=matching.reduce((sum,invoice)=>sum+Number(invoice.balance),0); const collected=data.payments.filter(payment=>payment.currency===currency && payment.status==='SUCCEEDED').reduce((sum,payment)=>sum+Number(payment.amount),0); return <div key={currency} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{currency} outstanding</p><p className="mt-1 text-xl font-extrabold">{currency} {due.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</p><p className="mt-2 text-xs text-slate-500">Collected: {currency} {collected.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</p></div>; })}<div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Open invoices</p><p className="mt-1 text-xl font-extrabold">{outstanding.length}</p><p className="mt-2 text-xs text-slate-500">Across both currencies</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Payments recorded</p><p className="mt-1 text-xl font-extrabold">{data.payments.length}</p><p className="mt-2 text-xs text-slate-500">Most recent 100</p></div></div>
      {data.canWrite && <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <form className="space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={save('invoice')}><h3 className="font-bold text-slate-900">Issue a fee invoice</h3><label className={labelClass}>Student<select required name="studentId" className={inputClass}><option value="">Choose learner</option>{data.students.map(student=><option key={student.id} value={student.id!}>{student.first_name} {student.last_name} · {student.student_number}</option>)}</select></label><label className={labelClass}>Academic year<select required name="academicYearId" className={inputClass}><option value="">Choose year</option>{data.years.map(year=><option key={year.id} value={year.id!}>{year.name}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Invoice number<input required name="invoiceNumber" maxLength={40} placeholder="RIA-2026-0001" className={inputClass}/></label><label className={labelClass}>Currency<select name="currency" className={inputClass}><option value="LRD">LRD</option><option value="USD">USD</option></select></label><label className={labelClass}>Charge description<input required name="description" maxLength={180} placeholder="Tuition · Term 1" className={inputClass}/></label><label className={labelClass}>Amount<input required name="amount" type="number" min="0.01" step="0.01" className={inputClass}/></label><label className={labelClass}>Due date (optional)<input name="dueOn" type="date" className={inputClass}/></label></div><button disabled={working || !data.students.length || !data.years.length} className={buttonClass}><Plus className="h-4 w-4"/> Issue invoice</button></form>
        <form className="space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={save('payment')}><h3 className="font-bold text-slate-900">Record a verified payment</h3><p className="text-xs leading-5 text-slate-600">Cash, bank, and other manually verified payments are recorded as received by the signed-in finance user. Use the MTN Collections request below for MoMo so provider confirmation is captured before posting.</p><label className={labelClass}>Open invoice<select required name="invoiceId" className={inputClass}><option value="">Choose invoice</option>{outstanding.map(invoice=><option key={invoice.id} value={invoice.id!}>{invoice.invoice_number} · {invoice.first_name} {invoice.last_name} · {invoice.currency} {Number(invoice.balance).toFixed(2)} due</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Amount received<input required name="amount" type="number" min="0.01" step="0.01" className={inputClass}/></label><label className={labelClass}>Channel<select name="channel" className={inputClass}><option value="CASH">Cash</option><option value="BANK">Bank transfer</option><option value="OTHER">Other verified method</option></select></label><label className={labelClass}>Payer / bank reference<input name="payerReference" maxLength={100} className={inputClass}/></label><label className={labelClass}>Note<input name="note" maxLength={500} className={inputClass}/></label></div><button disabled={working || !outstanding.length} className={buttonClass}><Check className="h-4 w-4"/> Record payment & issue receipt</button></form>
      </div>}
      {data.canWrite && <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-950">MTN MoMo Collections</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">The payer approves a request on their phone. The school invoice is credited only after MTN confirms success. The confirmed transaction fee is 2.5% of the gross payment; it is tracked as a settlement cost and does not increase the student’s invoice.</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${data.momo.enabled ? data.momo.environment === 'SANDBOX' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800' : 'bg-white text-amber-900'}`}>{data.momo.enabled ? data.momo.environment === 'SANDBOX' ? 'Sandbox' : 'Connected' : 'Not configured'}</span></div>
        {!data.momo.enabled ? <p className="mt-3 text-sm text-amber-900">{data.momo.reason || 'Add the MTN Collections credentials as server-side Coolify secrets to enable this payment method.'} Cash, bank, and manually verified payments remain available.</p> : data.momo.environment === 'SANDBOX' ? <div className="mt-4 rounded-lg border border-blue-200 bg-white p-4"><p className="text-sm leading-6 text-slate-700">MTN sandbox uses <b>EUR test currency</b>. It is separate from school invoices in LRD and USD, so the app will not post sandbox requests to student accounts. Verify the credentials here; this check only requests an authentication token and creates no payment.</p><button type="button" onClick={() => void testMomoConnection()} disabled={testingMomo} className={`${buttonClass} mt-3`}>{testingMomo ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Check className="h-4 w-4"/>} Test sandbox credentials</button></div> : <form className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={startMomoPayment}>
          <label className={labelClass}>Outstanding LRD invoice<select required name="invoiceId" className={inputClass}><option value="">Choose LRD invoice</option>{outstanding.filter(invoice => invoice.currency === data.momo.currency).map(invoice=><option key={invoice.id} value={invoice.id!}>{invoice.invoice_number} · {invoice.first_name} {invoice.last_name} · {invoice.currency} {Number(invoice.balance).toFixed(2)} due</option>)}</select></label>
          <label className={labelClass}>Amount to collect<input required name="amount" type="number" min="0.01" step="0.01" className={inputClass}/></label>
          <label className={labelClass}>Payer mobile number<input required name="payerPhone" inputMode="tel" autoComplete="tel" placeholder="231XXXXXXXXX" pattern="\\+?231[0-9]{9}" className={inputClass}/><span className="mt-1 block text-xs font-normal text-slate-500">Use the Liberia country code 231 followed by 9 digits. +231 format is accepted too.</span></label>
          <div className="flex items-end"><button disabled={working || !outstanding.some(invoice => invoice.currency === data.momo.currency)} className={buttonClass}><Wallet className="h-4 w-4"/> Send MoMo request</button></div>
          <p className="text-xs leading-5 text-slate-600 sm:col-span-2 xl:col-span-4">Fee estimate: 2.5% of the requested amount, paid from settlement proceeds. For example, LRD 1,000.00 has an estimated LRD 25.00 fee and LRD 975.00 net settlement. MTN’s final settlement report remains authoritative.</p>
        </form>}
        {data.momoIntents.length > 0 && <div className="mt-5 overflow-x-auto"><h4 className="mb-2 text-sm font-bold text-slate-900">MTN requests and reconciliation</h4><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-white/70 text-xs uppercase text-slate-500"><tr><th className="p-3">Invoice</th><th className="p-3">Learner</th><th className="p-3">Amount</th><th className="p-3">Payer</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y divide-amber-100">{data.momoIntents.map(intent=><tr key={intent.id}><td className="p-3 font-semibold">{intent.invoice_number}</td><td className="p-3">{intent.first_name} {intent.last_name}</td><td className="p-3">{intent.currency} {Number(intent.amount).toFixed(2)}</td><td className="p-3">•••• {intent.payer_msisdn_last4 || '—'}</td><td className="p-3">{intent.status}{intent.provider_status ? <span className="block text-xs text-slate-500">{intent.provider_status}</span> : null}</td><td className="p-3">{['CREATED','PENDING'].includes(String(intent.status)) && <button type="button" onClick={() => void checkMomoStatus(String(intent.id))} disabled={Boolean(checkingIntent)} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-bold text-blue-800 disabled:opacity-60">{checkingIntent === intent.id ? 'Checking…' : 'Check status'}</button>}{intent.status === 'REVIEW' && <span className="text-xs font-bold text-amber-900">Finance review required</span>}</td></tr>)}</tbody></table></div>}
      </section>}
    </section>
    <section className={sectionClass}><h3 className="mb-3 text-lg font-extrabold text-slate-950">Fee invoices & balances</h3>{data.invoices.length ? <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Invoice</th><th className="p-3">Learner</th><th className="p-3">Year</th><th className="p-3">Total</th><th className="p-3">Paid</th><th className="p-3">Balance</th><th className="p-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{data.invoices.map(invoice=><tr key={invoice.id}><td className="p-3 font-semibold">{invoice.invoice_number}</td><td className="p-3">{invoice.first_name} {invoice.last_name}<span className="block text-xs text-slate-500">{invoice.student_number}</span></td><td className="p-3">{invoice.academic_year_name}</td><td className="p-3">{invoice.currency} {Number(invoice.total).toFixed(2)}</td><td className="p-3">{invoice.currency} {Number(invoice.paid).toFixed(2)}</td><td className="p-3 font-bold">{invoice.currency} {Number(invoice.balance).toFixed(2)}</td><td className="p-3">{invoice.status}</td></tr>)}</tbody></table></div> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No invoices have been issued in this school yet.</p>}</section>
    <section className={sectionClass}><h3 className="mb-3 text-lg font-extrabold text-slate-950">Recent payments & receipts</h3>{data.payments.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Receipt</th><th className="p-3">Learner</th><th className="p-3">Invoice</th><th className="p-3">Gross payment</th><th className="p-3">Provider fee</th><th className="p-3">Net settlement</th><th className="p-3">Channel</th><th className="p-3">Date</th></tr></thead><tbody className="divide-y divide-slate-100">{data.payments.map((payment,index)=>{const gross=Number(payment.amount);const fee=Number(payment.provider_fee_amount||0);return <tr key={`${payment.id}-${index}`}><td className="p-3 font-mono text-xs">{payment.receipt_number || 'Pending'}</td><td className="p-3">{payment.first_name} {payment.last_name}</td><td className="p-3">{payment.invoice_number || 'Unallocated'}</td><td className="p-3">{payment.currency} {gross.toFixed(2)}</td><td className="p-3">{payment.currency} {fee.toFixed(2)}{Number(payment.provider_fee_rate_bps)>0&&<span className="block text-xs text-slate-500">{(Number(payment.provider_fee_rate_bps)/100).toFixed(2)}%</span>}</td><td className="p-3">{payment.currency} {(gross-fee).toFixed(2)}</td><td className="p-3">{payment.channel}</td><td className="p-3">{payment.received_at ? String(payment.received_at).slice(0,10) : '—'}</td></tr>})}</tbody></table></div> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No payments have been recorded yet.</p>}</section>
  </div>;
};

const StudentsWorkspace: React.FC<{ data: StudentsWorkspaceData; post: PostOperation; onSaved: () => Promise<void> }> = ({ data, post, onSaved }) => {
  const [search,setSearch]=useState(''); const [working,setWorking]=useState(false); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  const students=data.students.filter(student=>`${student.student_number} ${student.first_name} ${student.middle_name||''} ${student.last_name} ${student.class_name||''}`.toLowerCase().includes(search.toLowerCase()));
  const enroll=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();setWorking(true);setError('');setNotice('');const form=event.currentTarget;const values=new FormData(form);try{await post('students',{studentNumber:values.get('studentNumber'),firstName:values.get('firstName'),lastName:values.get('lastName'),classGroupId:values.get('classGroupId')});setNotice('Student record created and enrolled.');form.reset();await onSaved();}catch(cause){setError(cause instanceof Error?cause.message:'Could not save student record.');}finally{setWorking(false);}};
  return <div className="space-y-6"><section className={sectionClass}><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Student records workspace</p><h2 className="mt-1 text-xl font-extrabold text-slate-950">Learner directory</h2><p className="mt-1 text-sm text-slate-600">Student names, school IDs, current class, attendance activity, and open invoice count from the school database.</p></div><label className={`${labelClass} sm:w-72`}>Search learners<input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Name, ID, or class" className={inputClass}/></label></div>
    {error&&<p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice&&<p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {data.canEnroll&&<details className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><summary className="cursor-pointer font-bold text-slate-900">Add and enroll a student</summary><form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={enroll}><label className={labelClass}>Student ID<input required name="studentNumber" maxLength={40} className={inputClass}/></label><label className={labelClass}>First name<input required name="firstName" className={inputClass}/></label><label className={labelClass}>Last name<input required name="lastName" className={inputClass}/></label><label className={labelClass}>Class<select required name="classGroupId" className={inputClass}><option value="">Choose class</option>{data.classes.map(group=><option key={group.id} value={group.id!}>{group.name} · {group.academic_year_name}</option>)}</select></label><button disabled={working||!data.classes.length} className={buttonClass}><Plus className="h-4 w-4"/> Save student and enroll</button></form><p className="mt-2 text-xs text-slate-500">This quick enrollment form stores the minimum roster fields. Restricted learner details require the fuller student profile workflow.</p></details>}
    <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Student ID</th><th className="p-3">Learner</th><th className="p-3">Class</th><th className="p-3">Academic year</th><th className="p-3">Attendance records</th><th className="p-3">Open invoices</th><th className="p-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{students.map(student=><tr key={student.id}><td className="p-3 font-mono text-xs">{student.student_number}</td><td className="p-3 font-semibold">{student.first_name} {student.middle_name} {student.last_name}</td><td className="p-3">{student.class_name||'Not enrolled'}</td><td className="p-3">{student.academic_year_name||'—'}</td><td className="p-3">{student.attendance_records||'0'}</td><td className="p-3">{student.open_invoices||'0'}</td><td className="p-3">{student.status}</td></tr>)}</tbody></table>{!students.length&&<p className="rounded-b-lg bg-slate-50 p-4 text-sm text-slate-600">{search?'No learners match that search.':'No student records are available for this account.'}</p>}</div>
  </section></div>;
};

const ReportsWorkspace: React.FC<{ data: ReportsWorkspaceData }> = ({ data }) => {
  const reports=data.reports;
  const download=(fileName:string,headers:string[],rows:Array<Array<string|number>>)=>{const csv=[headers,...rows].map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=fileName;anchor.click();URL.revokeObjectURL(url);};
  return <div className="space-y-6"><section className={sectionClass}><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Reports workspace</p><h2 className="mt-1 text-xl font-extrabold text-slate-950">School operations insights</h2><p className="mt-1 text-sm text-slate-600">Every figure below is calculated from records your role is permitted to view. Exports contain only the summary rows shown here.</p>
    {!reports.students&&!reports.attendance&&!reports.finance&&!reports.staff&&<p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Your account can open this reporting workspace, but no report dataset is currently included in its permissions. Ask a school administrator to grant the specific report permissions you need.</p>}
    {reports.students&&<div className="mt-5"><h3 className="font-bold text-slate-900">Enrollment</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Active students</p><p className="mt-1 text-2xl font-extrabold">{reports.students.active_students||'0'}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Inactive students</p><p className="mt-1 text-2xl font-extrabold">{reports.students.inactive_students||'0'}</p></div></div><div className="mt-4 flex items-center justify-between"><h4 className="font-semibold">Students by class</h4><button onClick={()=>download('redeemer-students-by-class.csv',['Class','Students'],(reports.students?.classes||[]).map(row=>[row.class_name||'',row.students||0]))} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-blue-800">Export CSV</button></div><div className="mt-2 divide-y divide-slate-100">{(reports.students.classes||[]).map(row=><div key={row.class_name} className="flex justify-between py-2 text-sm"><span>{row.class_name}</span><b>{row.students}</b></div>)}</div></div>}
    {reports.attendance&&<div className="mt-6"><div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">Attendance recorded this month</h3><button onClick={()=>download('redeemer-monthly-attendance.csv',['Status','Records'],reports.attendance!.map(row=>[row.status||'',row.count||0]))} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-blue-800">Export CSV</button></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{reports.attendance.length?reports.attendance.map(row=><div key={row.status} className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">{row.status}</p><p className="mt-1 text-2xl font-extrabold">{row.count}</p></div>):<p className="text-sm text-slate-500">No attendance entries this month.</p>}</div></div>}
    {reports.finance&&<div className="mt-6"><div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">Fee collection by currency</h3><button onClick={()=>download('redeemer-fee-summary.csv',['Currency','Open invoices','Billed','Collected'],reports.finance!.map(row=>[row.currency||'',row.open_invoices||0,row.billed||0,row.collected||0]))} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-blue-800">Export CSV</button></div><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Currency</th><th className="p-3">Open invoices</th><th className="p-3">Billed</th><th className="p-3">Collected</th></tr></thead><tbody className="divide-y divide-slate-100">{reports.finance.map(row=><tr key={row.currency}><td className="p-3 font-bold">{row.currency}</td><td className="p-3">{row.open_invoices}</td><td className="p-3">{row.currency} {Number(row.billed).toFixed(2)}</td><td className="p-3">{row.currency} {Number(row.collected).toFixed(2)}</td></tr>)}</tbody></table></div></div>}
    {reports.staff&&<div className="mt-6"><div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">Staff by status</h3><button onClick={()=>download('redeemer-staff-summary.csv',['Employment status','Staff'],reports.staff!.map(row=>[row.employment_status||'',row.count||0]))} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-blue-800">Export CSV</button></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{reports.staff.length?reports.staff.map(row=><div key={row.employment_status} className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">{row.employment_status}</p><p className="mt-1 text-2xl font-extrabold">{row.count}</p></div>):<p className="text-sm text-slate-500">No staff records to report.</p>}</div></div>}
  </section></div>;
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
