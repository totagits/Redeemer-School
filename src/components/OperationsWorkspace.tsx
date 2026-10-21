import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Clipboard, LoaderCircle, Plus, RefreshCw, School, Users } from 'lucide-react';
import type { SchoolAccount } from './SignInPage.tsx';

type Row = Record<string, string | null | undefined>;
type Setup = { school: Row; years: Row[]; subjects: Row[]; classes: Row[]; teachers: Row[]; students: Row[]; assignments: Row[] };
type RosterEntry = { id: string; student_number: string; first_name: string; last_name: string; attendance_status: string | null; note: string | null };
const today = () => new Date().toLocaleDateString('en-CA');
const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';
const labelClass = 'block text-sm font-semibold text-slate-700';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60';
const sectionClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';

interface Props { account: SchoolAccount; csrfToken: string; busy: boolean; error: string; onSignOut: () => void; onPasswordChanged: () => void; }

export const OperationsWorkspace: React.FC<Props> = ({ account, csrfToken, busy: signOutBusy, error: authError, onSignOut, onPasswordChanged }) => {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
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

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/operations/setup', { credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load school setup.');
      setSetup(result as Setup);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load school setup.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const post = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(`/api/operations/${path}`, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
    return result;
  };

  const submit = (action: (form: HTMLFormElement) => Promise<void>) => async (event: React.FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    event.preventDefault(); setSaving(true); setError(''); setNotice(''); setTemporaryPassword('');
    try { await action(form); await refresh(); setNotice('Saved to the staging database.'); form.reset(); }
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

  return <section className="min-h-[calc(100vh-4rem)] bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <header className="mb-7 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-800"><School className="h-6 w-6" /></span>
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">School operations · Staging</p><h1 className="mt-1 text-2xl font-extrabold text-slate-950">{setup?.school?.name || account.schoolName}</h1>
            <p className="mt-1 text-sm text-slate-600">Welcome, {account.fullName}. Changes here are saved in the school database.</p></div></div>
        <div className="flex gap-2"><button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /> Refresh</button>
          <button onClick={onSignOut} disabled={signOutBusy} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{signOutBusy ? 'Signing out…' : 'Sign out'}</button></div>
      </header>
      {(error || authError) && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error || authError}</div>}
      {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div>}
      {temporaryPassword && <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-bold">Teacher created. Copy this temporary password now.</p><div className="mt-2 flex flex-wrap items-center gap-2"><code className="rounded bg-white px-3 py-2 font-mono text-base">{temporaryPassword}</code><button onClick={() => void navigator.clipboard?.writeText(temporaryPassword)} className="inline-flex items-center gap-1 rounded border border-amber-400 px-3 py-2 font-semibold"><Clipboard className="h-4 w-4" /> Copy</button></div><p className="mt-2 text-xs">Give it securely to the teacher. The teacher will be required to change it after signing in.</p></div>}
      {loading ? <div className="grid min-h-48 place-items-center text-slate-600"><LoaderCircle className="h-5 w-5 animate-spin" /></div> : !setup ? <p>School data could not be loaded.</p> : <>
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[['Academic years', setup.years.length], ['Classes', setup.classes.length], ['Teachers', setup.teachers.length], ['Enrolled students', setup.students.length]].map(([label, count]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-extrabold text-slate-950">{count}</p></div>)}
        </div>
        {canConfigure && <section className={`${sectionClass} mb-6`}><div className="mb-5 flex items-center gap-2"><BookOpen className="h-5 w-5 text-blue-700"/><h2 className="text-lg font-extrabold text-slate-950">Academic setup</h2></div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <form className="space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={submit(async form => { const data = new FormData(form); await post('academic-years', { name: data.get('name'), startsOn: data.get('startsOn'), endsOn: data.get('endsOn') }); })}>
              <h3 className="font-bold text-slate-900">Academic year</h3><label className={labelClass}>Year name<input required name="name" placeholder="2026–2027" className={inputClass}/></label><div className="grid grid-cols-2 gap-2"><label className={labelClass}>Starts<input required type="date" name="startsOn" className={inputClass}/></label><label className={labelClass}>Ends<input required type="date" name="endsOn" className={inputClass}/></label></div><button disabled={saving} className={buttonClass}><Plus className="h-4 w-4"/> Add year</button>
            </form>
            <form className="space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={submit(async form => { const data = new FormData(form); await post('subjects', { code: data.get('code'), name: data.get('name') }); })}>
              <h3 className="font-bold text-slate-900">Subject</h3><label className={labelClass}>Subject code<input required name="code" placeholder="MATH" className={inputClass}/></label><label className={labelClass}>Subject name<input required name="name" placeholder="Mathematics" className={inputClass}/></label><button disabled={saving} className={buttonClass}><Plus className="h-4 w-4"/> Add subject</button>
            </form>
            <form className="space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={submit(async form => { const data = new FormData(form); await post('classes', { academicYearId: data.get('academicYearId'), name: data.get('name'), gradeLevel: data.get('gradeLevel'), section: data.get('section') }); })}>
              <h3 className="font-bold text-slate-900">Class / section</h3><label className={labelClass}>Academic year<select required name="academicYearId" className={inputClass}><option value="">Choose year</option>{setup.years.map(row => <option key={row.id} value={row.id!}>{row.name}</option>)}</select></label><label className={labelClass}>Class name<input required name="name" placeholder="Grade 4 A" className={inputClass}/></label><div className="grid grid-cols-2 gap-2"><label className={labelClass}>Grade<input required name="gradeLevel" placeholder="Grade 4" className={inputClass}/></label><label className={labelClass}>Section<input required name="section" placeholder="A" className={inputClass}/></label></div><button disabled={saving || !setup.years.length} className={buttonClass}><Plus className="h-4 w-4"/> Add class</button>
            </form>
          </div>
        </section>}
        <div className="grid gap-6 xl:grid-cols-2">
          {canManageStaff && <section className={sectionClass}><div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-blue-700"/><h2 className="text-lg font-extrabold text-slate-950">Teacher records</h2></div>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit(async form => { const data = new FormData(form); const result = await post('teachers', { fullName: data.get('fullName'), email: data.get('email'), employeeNumber: data.get('employeeNumber') }); setTemporaryPassword(result.temporaryPassword); })}>
              <label className={labelClass}>Full name<input required name="fullName" autoComplete="name" className={inputClass}/></label><label className={labelClass}>Employee number<input required name="employeeNumber" className={inputClass}/></label><label className={`${labelClass} sm:col-span-2`}>Teacher email<input required type="email" name="email" autoComplete="email" className={inputClass}/></label><button disabled={saving} className={buttonClass}><Plus className="h-4 w-4"/> Create teacher login</button>
            </form>
          </section>}
          {canConfigure && <section className={sectionClass}><div className="mb-4 flex items-center gap-2"><BookOpen className="h-5 w-5 text-blue-700"/><h2 className="text-lg font-extrabold text-slate-950">Assign teaching responsibility</h2></div>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit(async form => { const data = new FormData(form); await post('teacher-assignments', { teacherId: data.get('teacherId'), subjectId: data.get('subjectId'), classGroupId: data.get('classGroupId'), academicYearId: data.get('academicYearId'), effectiveFrom: data.get('effectiveFrom') }); })}>
              <label className={labelClass}>Teacher<select required name="teacherId" className={inputClass}><option value="">Choose teacher</option>{setup.teachers.map(row => <option key={row.id} value={row.id!}>{row.full_name} · {row.employee_number}</option>)}</select></label><label className={labelClass}>Subject<select required name="subjectId" className={inputClass}><option value="">Choose subject</option>{setup.subjects.map(row => <option key={row.id} value={row.id!}>{row.name} ({row.code})</option>)}</select></label><label className={labelClass}>Class<select required name="classGroupId" className={inputClass}><option value="">Choose class</option>{setup.classes.map(row => <option key={row.id} value={row.id!}>{row.name} · {row.academic_year_name}</option>)}</select></label><label className={labelClass}>Academic year<select required name="academicYearId" className={inputClass}><option value="">Choose year</option>{setup.years.map(row => <option key={row.id} value={row.id!}>{row.name}</option>)}</select></label><label className={labelClass}>Effective from<input required type="date" name="effectiveFrom" defaultValue={today()} className={inputClass}/></label><button disabled={saving} className={`${buttonClass} self-end`}><Plus className="h-4 w-4"/> Save assignment</button>
            </form>
            <ul className="mt-4 divide-y divide-slate-100">{setup.assignments.map(row => <li key={row.id} className="py-2 text-sm text-slate-700"><b>{row.teacher_name}</b> · {row.subject_name} · {row.class_name} <span className="text-slate-500">({row.academic_year_name})</span></li>)}</ul>
          </section>}
          {canEnroll && <section className={sectionClass}><div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-blue-700"/><h2 className="text-lg font-extrabold text-slate-950">Student records & enrollment</h2></div>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit(async form => { const data = new FormData(form); await post('students', { studentNumber: data.get('studentNumber'), firstName: data.get('firstName'), lastName: data.get('lastName'), classGroupId: data.get('classGroupId') }); })}>
              <label className={labelClass}>Student ID<input required name="studentNumber" className={inputClass}/></label><label className={labelClass}>First name<input required name="firstName" className={inputClass}/></label><label className={labelClass}>Last name<input required name="lastName" className={inputClass}/></label><label className={labelClass}>Class<select required name="classGroupId" className={inputClass}><option value="">Choose class</option>{setup.classes.map(row => <option key={row.id} value={row.id!}>{row.name} · {row.academic_year_name}</option>)}</select></label><button disabled={saving || !setup.classes.length} className={buttonClass}><Plus className="h-4 w-4"/> Save student & enroll</button>
            </form>
            <p className="mt-3 text-xs leading-5 text-slate-500">This initial roster form stores only student ID and name. Add guardian, birth, and sensitive details through the later controlled student-record workflow.</p>
          </section>}
          {canTakeAttendance && <section className={`${sectionClass} xl:col-span-2`}><div className="mb-4 flex items-center gap-2"><Check className="h-5 w-5 text-blue-700"/><h2 className="text-lg font-extrabold text-slate-950">Teacher class roll call</h2></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className={labelClass}>Assigned class & subject<select value={assignmentId} onChange={event => setAssignmentId(event.target.value)} className={inputClass}><option value="">Choose an assignment</option>{setup.assignments.map(row => <option key={row.id} value={row.id!}>{row.class_name} · {row.subject_name} — {row.teacher_name}</option>)}</select></label><label className={labelClass}>Lesson date<input type="date" value={attendanceDate} onChange={event => setAttendanceDate(event.target.value)} className={inputClass}/></label><label className={labelClass}>Lesson time<input type="time" value={sessionTime} onChange={event => setSessionTime(event.target.value)} className={inputClass}/></label><label className={labelClass}>Topic taught<input value={sessionTopic} onChange={event => setSessionTopic(event.target.value)} placeholder="Lesson topic" className={inputClass}/></label></div>
            {attendanceLoading ? <p className="mt-5 flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin"/> Loading enrolled students…</p> : assignmentId ? <>
              {roster.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-3 pr-3">Student ID</th><th className="py-3 pr-3">Student</th><th className="py-3 pr-3">Attendance</th><th className="py-3">Note</th></tr></thead><tbody className="divide-y divide-slate-100">{roster.map(student => <tr key={student.id}><td className="py-2.5 pr-3 font-mono text-xs">{student.student_number}</td><td className="py-2.5 pr-3 font-semibold text-slate-900">{student.first_name} {student.last_name}</td><td className="py-2.5 pr-3"><select aria-label={`Attendance for ${student.first_name} ${student.last_name}`} value={attendance[student.id]?.status || ''} onChange={event => setAttendance(current => ({ ...current, [student.id]: { ...current[student.id], status: event.target.value, note: current[student.id]?.note || '' } }))} className="rounded-lg border border-slate-300 bg-white px-2 py-2"><option value="">Select status</option><option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="LATE">Late</option><option value="EXCUSED">Excused</option></select></td><td className="py-2.5"><input aria-label={`Attendance note for ${student.first_name} ${student.last_name}`} value={attendance[student.id]?.note || ''} onChange={event => setAttendance(current => ({ ...current, [student.id]: { ...current[student.id], status: current[student.id]?.status || '', note: event.target.value } }))} placeholder="Optional note" className="w-full rounded-lg border border-slate-300 px-2 py-2"/></td></tr>)}</tbody></table></div> : <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No active students are enrolled in this class yet. Add the class roster above first.</p>}
              {hasCorrectionChange && <label className={`${labelClass} mt-4 block`}>Reason for changing previously recorded attendance<textarea required value={correctionReason} onChange={event => setCorrectionReason(event.target.value)} maxLength={500} className={inputClass} rows={2}/></label>}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">Marked {markedCount} of {roster.length} students. All students need a status before saving.</p><button onClick={() => void saveRollCall()} disabled={saving || !roster.length || markedCount !== roster.length || !sessionTopic.trim() || (hasCorrectionChange && !correctionReason.trim())} className={buttonClass}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Check className="h-4 w-4"/>} Save roll call</button></div>
            </> : <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">First set up an academic year, class, students, teacher, subject, and teaching assignment above.</p>}
          </section>}
        </div>
        <p className="mt-6 text-center text-xs leading-5 text-slate-500">Staging workflow: academic setup, teacher assignments, student enrollment, and attendance are database-backed. Other ERP modules remain in development.</p>
      </>}
    </div>
  </section>;
};
