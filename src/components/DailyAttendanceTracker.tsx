import React, { useState, useMemo } from 'react';
import {
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  AlertTriangle,
  UserCheck,
  Search,
  Filter,
  Save,
  BellRing,
  Phone,
  Send,
  Download,
  ShieldCheck,
  ShieldAlert,
  Percent,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  Info
} from 'lucide-react';
import { StudentProfile } from '../logic/students.ts';
import {
  StudentAttendanceRecord,
  AttendanceStatus,
  DEFAULT_ATTENDANCE_THRESHOLD,
  isAuthorizedToLogAttendance,
  computeStudentAttendanceStats,
  calculateAttendancePercentage,
  identifyAtRiskStudents,
  getAttendanceStatusStyle
} from '../logic/attendance.ts';

interface DailyAttendanceTrackerProps {
  students: StudentProfile[];
  attendanceRecords: StudentAttendanceRecord[];
  activeUserName: string;
  activeUserRole: string;
  onSaveAttendanceSession: (newRecords: StudentAttendanceRecord[], sessionDate: string, gradeLevel: string) => void;
  onAuditLog?: (action: string, details: string) => void;
  onNotification?: (message: string) => void;
  onViewStudentProfile?: (student: StudentProfile) => void;
  onGenerateIdCard?: (student: StudentProfile) => void;
}

export const DailyAttendanceTracker: React.FC<DailyAttendanceTrackerProps> = ({
  students,
  attendanceRecords,
  activeUserName,
  activeUserRole,
  onSaveAttendanceSession,
  onAuditLog,
  onNotification,
  onViewStudentProfile,
  onGenerateIdCard
}) => {
  // Navigation & Date Selection
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedGrade, setSelectedGrade] = useState<string>('Grade 10');
  const [selectedSection, setSelectedSection] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AT_RISK' | 'ABSENT' | 'LATE'>('ALL');
  const [threshold, setThreshold] = useState<number>(DEFAULT_ATTENDANCE_THRESHOLD);
  const [isSavedRecently, setIsSavedRecently] = useState(false);
  const [notifiedStudents, setNotifiedStudents] = useState<Record<string, boolean>>({});

  // Authorization check
  const isAuthorized = isAuthorizedToLogAttendance(activeUserRole);

  // Available grade levels
  const availableGrades = useMemo(() => {
    const set = new Set(students.map(s => s.gradeLevel));
    return Array.from(set).sort();
  }, [students]);

  // Students in selected grade
  const gradeStudents = useMemo(() => {
    return students.filter(s => {
      const matchGrade = selectedGrade === 'ALL' || s.gradeLevel === selectedGrade;
      const matchSection = selectedSection === 'ALL' || s.section === selectedSection;
      return matchGrade && matchSection;
    });
  }, [students, selectedGrade, selectedSection]);

  // Working state for the current session register: studentId -> { status, arrivalTime, reason }
  // Pre-populated from existing records for this date if already logged, otherwise default to PRESENT
  const [sessionDraft, setSessionDraft] = useState<Record<string, { status: AttendanceStatus; arrivalTime?: string; reason?: string }>>({});

  // Synchronize draft when selectedDate or selectedGrade changes
  React.useEffect(() => {
    const initialDraft: Record<string, { status: AttendanceStatus; arrivalTime?: string; reason?: string }> = {};

    gradeStudents.forEach(student => {
      // Find existing record for this date
      const existing = attendanceRecords.find(
        r => (r.studentId === student.studentId || r.studentId === student.id) && r.date === selectedDate
      );

      if (existing) {
        initialDraft[student.studentId] = {
          status: existing.status,
          arrivalTime: existing.arrivalTime,
          reason: existing.reason
        };
      } else {
        // Default to PRESENT for easy one-click intake
        initialDraft[student.studentId] = {
          status: 'PRESENT'
        };
      }
    });

    setSessionDraft(initialDraft);
    setIsSavedRecently(false);
  }, [selectedDate, selectedGrade, selectedSection, gradeStudents, attendanceRecords]);

  // Calculate cumulative stats for all students
  const studentStatsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeStudentAttendanceStats>>();
    students.forEach(s => {
      const stats = computeStudentAttendanceStats(s, attendanceRecords, threshold);
      map.set(s.studentId, stats);
    });
    return map;
  }, [students, attendanceRecords, threshold]);

  // At-risk students based on current threshold
  const atRiskStudents = useMemo(() => {
    return identifyAtRiskStudents(students, attendanceRecords, threshold);
  }, [students, attendanceRecords, threshold]);

  // Grade-level attendance summary
  const gradeSummary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;

    gradeStudents.forEach(s => {
      const draft = sessionDraft[s.studentId];
      if (!draft) return;
      if (draft.status === 'PRESENT') present++;
      else if (draft.status === 'ABSENT') absent++;
      else if (draft.status === 'LATE') late++;
      else if (draft.status === 'EXCUSED') excused++;
    });

    const total = gradeStudents.length;
    const dailyPct = calculateAttendancePercentage(present, late, excused, total);

    return {
      total,
      present,
      absent,
      late,
      excused,
      dailyPct
    };
  }, [gradeStudents, sessionDraft]);

  // Overall schoolwide attendance percentage
  const overallSchoolStats = useMemo(() => {
    let totalPresent = 0;
    let totalLate = 0;
    let totalExcused = 0;
    let totalRecords = attendanceRecords.length;

    attendanceRecords.forEach(r => {
      if (r.status === 'PRESENT') totalPresent++;
      else if (r.status === 'LATE') totalLate++;
      else if (r.status === 'EXCUSED') totalExcused++;
    });

    const overallPct = calculateAttendancePercentage(totalPresent, totalLate, totalExcused, totalRecords);
    return {
      totalRecords,
      overallPct,
      atRiskCount: atRiskStudents.length
    };
  }, [attendanceRecords, atRiskStudents]);

  // Change individual student status
  const handleSetStatus = (studentId: string, status: AttendanceStatus) => {
    if (!isAuthorized) {
      if (onNotification) {
        onNotification('Access Restricted: You must be a logged-in Administrator, Dean of Academics, or Teacher to modify attendance.');
      }
      return;
    }

    setSessionDraft(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status,
        arrivalTime: status === 'LATE' ? (prev[studentId]?.arrivalTime || '08:20 AM') : undefined,
        reason: status === 'PRESENT' ? undefined : prev[studentId]?.reason
      }
    }));
    setIsSavedRecently(false);
  };

  // Change arrival time or reason
  const handleUpdateDetails = (studentId: string, field: 'arrivalTime' | 'reason', val: string) => {
    if (!isAuthorized) return;
    setSessionDraft(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: val
      }
    }));
    setIsSavedRecently(false);
  };

  // Bulk: Mark all present
  const handleMarkAllPresent = () => {
    if (!isAuthorized) return;
    const updated: Record<string, { status: AttendanceStatus; arrivalTime?: string; reason?: string }> = {};
    gradeStudents.forEach(s => {
      updated[s.studentId] = { status: 'PRESENT' };
    });
    setSessionDraft(updated);
    setIsSavedRecently(false);
    if (onNotification) {
      onNotification(`Marked all ${gradeStudents.length} students in ${selectedGrade} as PRESENT.`);
    }
  };

  // Save attendance session
  const handleSaveAttendance = () => {
    if (!isAuthorized) {
      if (onNotification) {
        onNotification('Error: Only authorized personnel can submit daily attendance.');
      }
      return;
    }

    const recordsToSave: StudentAttendanceRecord[] = gradeStudents.map(student => {
      const draft = sessionDraft[student.studentId] || { status: 'PRESENT' as AttendanceStatus };
      return {
        id: `att-${selectedDate}-${student.studentId}`,
        date: selectedDate,
        studentId: student.studentId,
        studentName: `${student.firstName} ${student.lastName}`,
        gradeLevel: student.gradeLevel,
        section: student.section,
        status: draft.status,
        arrivalTime: draft.arrivalTime,
        reason: draft.reason,
        loggedBy: activeUserName,
        loggedByRole: activeUserRole,
        loggedAt: new Date().toISOString()
      };
    });

    onSaveAttendanceSession(recordsToSave, selectedDate, selectedGrade);
    setIsSavedRecently(true);

    // Audit log
    if (onAuditLog) {
      onAuditLog(
        'ATTENDANCE_REGISTER_SUBMITTED',
        `Logged ${selectedGrade} daily attendance for ${selectedDate} (${recordsToSave.length} records, ${gradeSummary.dailyPct}% attendance rate) by ${activeUserName}`
      );
    }

    // Check if any student in this grade is below the threshold and trigger alert
    const newlyAtRisk = recordsToSave.filter(r => {
      const student = gradeStudents.find(s => s.studentId === r.studentId);
      if (!student) return false;
      // Recompute stats with newly submitted record
      const simulatedHistory = [...attendanceRecords.filter(h => !(h.date === selectedDate && h.studentId === r.studentId)), r];
      const stats = computeStudentAttendanceStats(student, simulatedHistory, threshold);
      return stats.isBelowThreshold;
    });

    if (newlyAtRisk.length > 0 && onNotification) {
      onNotification(
        `⚠️ ATTENDANCE THRESHOLD ALERT: ${newlyAtRisk.length} student(s) in ${selectedGrade} have attendance below the ${threshold}% standard!`
      );
    } else if (onNotification) {
      onNotification(`Daily Attendance for ${selectedGrade} on ${selectedDate} recorded successfully (${gradeSummary.dailyPct}% present).`);
    }
  };

  // Trigger Parent SMS / Truancy Notice
  const handleSendParentNotice = (stats: ReturnType<typeof computeStudentAttendanceStats>) => {
    setNotifiedStudents(prev => ({ ...prev, [stats.studentId]: true }));
    const msg = `Automated MoE Truancy SMS dispatched to ${stats.guardianName || 'Guardian'} (${stats.guardianPhone || 'Phone on file'}): "${stats.studentName}'s attendance at The Redeemer School has dropped to ${stats.attendancePercentage}%, falling below the mandatory ${threshold}% threshold. Please contact the Academic Office."`;
    
    if (onNotification) {
      onNotification(msg);
    }
    if (onAuditLog) {
      onAuditLog('ATTENDANCE_PARENT_ALERT_SENT', msg);
    }
  };

  // Date navigation helpers
  const handleShiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // Filter students displayed in table
  const displayedStudents = gradeStudents.filter(student => {
    const stats = studentStatsMap.get(student.studentId);
    const draft = sessionDraft[student.studentId];

    // Search query
    const matchSearch = 
      student.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.studentId.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchSearch) return false;

    // Filter pill
    if (statusFilter === 'AT_RISK') {
      return stats?.isBelowThreshold;
    }
    if (statusFilter === 'ABSENT') {
      return draft?.status === 'ABSENT';
    }
    if (statusFilter === 'LATE') {
      return draft?.status === 'LATE';
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner: Authorization & Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                <Calendar className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  Daily Attendance Tracker & Truancy Alert System
                  <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                    Academic Year 2026/2027
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Roll-call register per grade level, automated cumulative percentage tracking, and Liberian MoE truancy drop alerts
                </p>
              </div>
            </div>
          </div>

          {/* Authorization Indicator */}
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${
              isAuthorized 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}>
              {isAuthorized ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Authorized to Log: <strong>{activeUserName}</strong> ({activeUserRole})</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  <span>Read-Only Mode: <strong>{activeUserRole}</strong> role lacks roll-call authority</span>
                </>
              )}
            </div>

            {/* Threshold Configuration Control */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs">
              <Percent className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-600 font-medium">Alert Threshold:</span>
              <select
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-bold text-slate-800 focus:outline-hidden"
              >
                <option value={70}>70%</option>
                <option value={75}>75% (MoE Std)</option>
                <option value={80}>80%</option>
                <option value={85}>85% (Honors)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Schoolwide & Grade Metrics Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              {selectedGrade} Daily Attendance
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900">{gradeSummary.dailyPct}%</span>
              <span className="text-xs text-slate-500 font-medium">
                ({gradeSummary.present}/{gradeSummary.total} Present)
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
              <div 
                className={`h-1.5 rounded-full transition-all ${
                  gradeSummary.dailyPct >= threshold ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
                style={{ width: `${gradeSummary.dailyPct}%` }}
              />
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Today's Session Absences
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-rose-600">{gradeSummary.absent}</span>
              <span className="text-xs text-slate-500 font-medium">
                {gradeSummary.late > 0 ? `+ ${gradeSummary.late} late arrivals` : 'No tardiness'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {gradeSummary.excused > 0 ? `${gradeSummary.excused} excused medical/travel` : 'Standard register'}
            </p>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              School Cumulative Rate
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-indigo-700">{overallSchoolStats.overallPct}%</span>
              <span className="text-xs text-slate-500 font-medium">
                {overallSchoolStats.totalRecords} logged sessions
              </span>
            </div>
            <p className="text-[11px] text-emerald-600 font-medium mt-1">
              Above MoE 75% minimum quota
            </p>
          </div>

          <div className={`p-3 rounded-lg border transition-all ${
            atRiskStudents.length > 0 
              ? 'bg-rose-50/80 border-rose-200' 
              : 'bg-emerald-50/80 border-emerald-200'
          }`}>
            <div className={`text-[11px] font-semibold uppercase tracking-wider ${
              atRiskStudents.length > 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}>
              At-Risk Truancy Alert
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-2xl font-bold ${
                atRiskStudents.length > 0 ? 'text-rose-700' : 'text-emerald-700'
              }`}>
                {atRiskStudents.length}
              </span>
              <span className="text-xs text-slate-600 font-medium">
                Below {threshold}% quota
              </span>
            </div>
            <p className={`text-[11px] font-medium mt-1 ${
              atRiskStudents.length > 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}>
              {atRiskStudents.length > 0 ? 'Parent notices pending' : 'All students in compliance'}
            </p>
          </div>
        </div>
      </div>

      {/* CRITICAL ALERT BANNER: Students Below Attendance Threshold */}
      {atRiskStudents.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-100 text-rose-700 rounded-lg shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-rose-900 flex items-center gap-2">
                    ATTENDANCE DROP WARNING — {atRiskStudents.length} Student(s) Below {threshold}% Mandatory Threshold
                  </h3>
                  <p className="text-xs text-rose-700 mt-0.5">
                    Students with attendance below {threshold}% are flagged under Liberia Ministry of Education regulations and require intervention.
                  </p>
                </div>
                <button
                  onClick={() => setStatusFilter(statusFilter === 'AT_RISK' ? 'ALL' : 'AT_RISK')}
                  className="px-3 py-1 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  {statusFilter === 'AT_RISK' ? 'Show All Students' : 'Filter At-Risk Learners'}
                </button>
              </div>

              {/* At-risk student cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-3">
                {atRiskStudents.map(student => (
                  <div key={student.studentId} className="bg-white border border-rose-200 rounded-lg p-3 shadow-2xs">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-xs text-slate-900">{student.studentName}</div>
                        <div className="text-[11px] text-slate-500">{student.studentId} • {student.gradeLevel}-{student.section}</div>
                      </div>
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-md ${
                        student.riskLevel === 'CRITICAL' 
                          ? 'bg-rose-100 text-rose-800 border border-rose-300' 
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}>
                        {student.attendancePercentage}% Rate
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-600 mt-2 pt-2 border-t border-slate-100">
                      <span>Missed: <strong>{student.absentCount}</strong> sessions</span>
                      <span>Late: <strong>{student.lateCount}</strong> sessions</span>
                    </div>

                    <div className="flex items-center gap-1.5 mt-2.5">
                      <button
                        onClick={() => handleSendParentNotice(student)}
                        disabled={notifiedStudents[student.studentId]}
                        className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                          notifiedStudents[student.studentId]
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-rose-600 hover:bg-rose-700 text-white shadow-2xs'
                        }`}
                      >
                        {notifiedStudents[student.studentId] ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Notice Sent
                          </>
                        ) : (
                          <>
                            <Send className="w-3 h-3" />
                            Dispatch SMS Alert
                          </>
                        )}
                      </button>

                      {onViewStudentProfile && (
                        <button
                          onClick={() => {
                            const fullProfile = students.find(s => s.studentId === student.studentId);
                            if (fullProfile) onViewStudentProfile(fullProfile);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          Profile
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Control Toolbar: Date, Grade Selector, Search & Bulk Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Date Selector with Quick Step */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => handleShiftDate(-1)}
                className="p-1.5 hover:bg-white text-slate-600 hover:text-slate-900 rounded-md transition-colors cursor-pointer"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent px-2 py-1 text-xs font-bold text-slate-800 focus:outline-hidden"
              />
              <button
                onClick={() => handleShiftDate(1)}
                className="p-1.5 hover:bg-white text-slate-600 hover:text-slate-900 rounded-md transition-colors cursor-pointer"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => setSelectedDate(todayStr)}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                selectedDate === todayStr 
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Today
            </button>
          </div>

          {/* Grade Level & Section Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
              <span className="text-xs font-semibold text-slate-600">Grade:</span>
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-900 focus:outline-hidden cursor-pointer"
              >
                {availableGrades.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
              <span className="text-xs font-semibold text-slate-600">Section:</span>
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-900 focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">All Sections</option>
                <option value="A">Section A</option>
                <option value="B">Section B</option>
              </select>
            </div>

            {/* Quick action buttons */}
            {isAuthorized && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleMarkAllPresent}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Mark All Present
                </button>

                <button
                  onClick={handleSaveAttendance}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Register
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Search & Filter Pills */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search student in roll..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-400 mr-1">Filter:</span>
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({gradeStudents.length})
            </button>
            <button
              onClick={() => setStatusFilter('AT_RISK')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                statusFilter === 'AT_RISK'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              Below {threshold}% ({atRiskStudents.filter(s => s.gradeLevel === selectedGrade).length})
            </button>
            <button
              onClick={() => setStatusFilter('ABSENT')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                statusFilter === 'ABSENT'
                  ? 'bg-rose-700 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Absent Today ({gradeSummary.absent})
            </button>
            <button
              onClick={() => setStatusFilter('LATE')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                statusFilter === 'LATE'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Late Today ({gradeSummary.late})
            </button>
          </div>
        </div>
      </div>

      {/* Attendance Register Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">Grade & Section</th>
                <th className="py-3 px-4">Cumulative Rate</th>
                <th className="py-3 px-4">Today's Attendance Status ({selectedDate})</th>
                <th className="py-3 px-4">Arrival Time / Absence Note</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Info className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    No students match the selected filter criteria for {selectedGrade}.
                  </td>
                </tr>
              ) : (
                displayedStudents.map((student) => {
                  const draft = sessionDraft[student.studentId] || { status: 'PRESENT' as AttendanceStatus };
                  const stats = studentStatsMap.get(student.studentId);
                  const statusStyle = getAttendanceStatusStyle(draft.status);
                  const isBelow = stats?.isBelowThreshold;

                  return (
                    <tr 
                      key={student.studentId} 
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isBelow ? 'bg-rose-50/30' : ''
                      }`}
                    >
                      {/* Student Info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-800 text-white font-bold flex items-center justify-center text-xs shrink-0">
                            {student.firstName[0]}{student.lastName[0]}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              {student.firstName} {student.lastName}
                              {isBelow && (
                                <span className="p-0.5 text-rose-600" title={`Below ${threshold}% attendance quota`}>
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">{student.studentId}</div>
                          </div>
                        </div>
                      </td>

                      {/* Class */}
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800">{student.gradeLevel}</span>
                        <span className="text-slate-400 ml-1">Section {student.section}</span>
                      </td>

                      {/* Cumulative Rate */}
                      <td className="py-3 px-4">
                        {stats ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold text-xs ${
                                stats.isBelowThreshold 
                                  ? 'text-rose-600 font-extrabold' 
                                  : stats.attendancePercentage >= 90 
                                    ? 'text-emerald-700' 
                                    : 'text-slate-800'
                              }`}>
                                {stats.attendancePercentage}%
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.2 rounded-xs border font-semibold ${
                                stats.riskLevel === 'CRITICAL'
                                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                                  : stats.riskLevel === 'WARNING'
                                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}>
                                {stats.riskLevel === 'NORMAL' ? 'Compliant' : 'Alert'}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {stats.presentCount}P • {stats.lateCount}L • {stats.absentCount}A ({stats.totalSessions} sessions)
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">No records</span>
                        )}
                      </td>

                      {/* Attendance Buttons */}
                      <td className="py-3 px-4">
                        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 gap-0.5">
                          <button
                            onClick={() => handleSetStatus(student.studentId, 'PRESENT')}
                            disabled={!isAuthorized}
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                              draft.status === 'PRESENT'
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                            title="Mark Present"
                          >
                            Present
                          </button>
                          <button
                            onClick={() => handleSetStatus(student.studentId, 'LATE')}
                            disabled={!isAuthorized}
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                              draft.status === 'LATE'
                                ? 'bg-amber-500 text-white shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                            title="Mark Late"
                          >
                            Late
                          </button>
                          <button
                            onClick={() => handleSetStatus(student.studentId, 'EXCUSED')}
                            disabled={!isAuthorized}
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                              draft.status === 'EXCUSED'
                                ? 'bg-sky-600 text-white shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                            title="Mark Excused"
                          >
                            Excused
                          </button>
                          <button
                            onClick={() => handleSetStatus(student.studentId, 'ABSENT')}
                            disabled={!isAuthorized}
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                              draft.status === 'ABSENT'
                                ? 'bg-rose-600 text-white shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                            title="Mark Absent"
                          >
                            Absent
                          </button>
                        </div>
                      </td>

                      {/* Notes / Arrival Time input */}
                      <td className="py-3 px-4">
                        {draft.status === 'LATE' && (
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <input
                              type="text"
                              placeholder="e.g. 08:20 AM"
                              value={draft.arrivalTime || ''}
                              onChange={(e) => handleUpdateDetails(student.studentId, 'arrivalTime', e.target.value)}
                              disabled={!isAuthorized}
                              className="w-24 px-2 py-1 text-[11px] bg-amber-50/50 border border-amber-200 rounded text-slate-800 focus:outline-hidden"
                            />
                            <input
                              type="text"
                              placeholder="Reason for late arrival..."
                              value={draft.reason || ''}
                              onChange={(e) => handleUpdateDetails(student.studentId, 'reason', e.target.value)}
                              disabled={!isAuthorized}
                              className="w-44 px-2 py-1 text-[11px] bg-white border border-slate-200 rounded text-slate-800 focus:outline-hidden"
                            />
                          </div>
                        )}

                        {(draft.status === 'ABSENT' || draft.status === 'EXCUSED') && (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              placeholder={draft.status === 'ABSENT' ? 'Absence explanation / parent call...' : 'Official excuse / doctor note...'}
                              value={draft.reason || ''}
                              onChange={(e) => handleUpdateDetails(student.studentId, 'reason', e.target.value)}
                              disabled={!isAuthorized}
                              className={`w-64 px-2 py-1 text-[11px] rounded border focus:outline-hidden ${
                                draft.status === 'ABSENT' 
                                  ? 'bg-rose-50/50 border-rose-200 text-rose-900' 
                                  : 'bg-sky-50/50 border-sky-200 text-sky-900'
                              }`}
                            />
                          </div>
                        )}

                        {draft.status === 'PRESENT' && (
                          <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            In Class & Engaged
                          </span>
                        )}
                      </td>

                      {/* Actions Column: ID Card & Profile */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {onGenerateIdCard && (
                            <button
                              onClick={() => onGenerateIdCard(student)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold transition-colors cursor-pointer"
                              title="Generate Student ID Card"
                            >
                              ID Card
                            </button>
                          )}

                          {onViewStudentProfile && (
                            <button
                              onClick={() => onViewStudentProfile(student)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium transition-colors cursor-pointer"
                              title="View Longitudinal Profile"
                            >
                              Profile
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info & submission status */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-slate-500 gap-2">
          <div className="flex items-center gap-2">
            <span>Showing {displayedStudents.length} of {gradeStudents.length} enrolled in {selectedGrade}</span>
            {isSavedRecently && (
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Session saved & synchronized
              </span>
            )}
          </div>

          {isAuthorized && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveAttendance}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Save & Submit {selectedGrade} Register
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
