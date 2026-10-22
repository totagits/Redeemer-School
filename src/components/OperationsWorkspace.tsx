import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, LoaderCircle, Plus, RefreshCw, School, Users } from 'lucide-react';
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

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const isPortalUser = account.roles.includes('STUDENT') || account.roles.includes('PARENT');
      const canViewSetup = account.permissions.includes('academics.configure') || (account.roles.includes('TEACHER') && account.permissions.includes('attendance.read'));
      const response = await fetch(isPortalUser ? '/api/operations/portal' : canViewSetup ? '/api/operations/setup' : '/api/operations/dashboard', { credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not loa