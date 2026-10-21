import React, { useState, useMemo } from 'react';
import { 
  GraduationCap, 
  Users, 
  UserPlus, 
  Search, 
  Phone, 
  Mail, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  FileCheck2, 
  Calendar, 
  MapPin, 
  Plus, 
  ArrowRight, 
  Clock, 
  DollarSign, 
  FileText,
  Upload,
  CreditCard,
  Printer,
  QrCode,
  CalendarCheck
} from 'lucide-react';
import { 
  StudentProfile, 
  AdmissionApplicant, 
  AdmissionStatus, 
  StudentDocument,
  detectDuplicateStudent 
} from '../logic/students.ts';
import { THE_REDEEMER_SCHOOL_INFO } from '../data/erpInitialData.ts';
import { StudentDocumentUpload } from './StudentDocumentUpload.tsx';
import { DailyAttendanceTracker } from './DailyAttendanceTracker.tsx';
import { StudentIdCardModal } from './StudentIdCardModal.tsx';
import { 
  StudentAttendanceRecord, 
  computeStudentAttendanceStats, 
  DEFAULT_ATTENDANCE_THRESHOLD,
  identifyAtRiskStudents
} from '../logic/attendance.ts';

interface StudentsEnrollmentModuleProps {
  students: StudentProfile[];
  applicants: AdmissionApplicant[];
  attendanceRecords?: StudentAttendanceRecord[];
  activeUserName?: string;
  activeUserRole?: string;
  onAddApplicant: (applicant: Omit<AdmissionApplicant, 'id' | 'applicationNumber'>) => void;
  onUpdateApplicantStatus: (applicantId: string, newStatus: AdmissionStatus) => void;
  onEnrollApplicant: (applicantId: string, targetSection: string) => void;
  onIssueTuitionInvoice: (student: StudentProfile) => void;
  onUpdateStudentDocuments?: (studentId: string, updatedDocs: StudentDocument[]) => void;
  onSaveAttendanceSession?: (newRecords: StudentAttendanceRecord[], sessionDate: string, gradeLevel: string) => void;
  onAuditLog?: (action: string, details: string) => void;
  onNotification?: (message: string) => void;
}

export const StudentsEnrollmentModule: React.FC<StudentsEnrollmentModuleProps> = ({
  students,
  applicants,
  attendanceRecords = [],
  activeUserName = 'Sister Evelyn Coleman',
  activeUserRole = 'HR_MANAGER',
  onAddApplicant,
  onUpdateApplicantStatus,
  onEnrollApplicant,
  onIssueTuitionInvoice,
  onUpdateStudentDocuments,
  onSaveAttendanceSession,
  onAuditLog,
  onNotification
}) => {
  const [activeTab, setActiveTab] = useState<'students' | 'attendance' | 'idcards' | 'admissions' | 'guardians'>('students');
  const [searchTerm, setSearchTerm] = useState('');
  const [gradeFilter, setGradeFilter] = useState('ALL');

  // ID Card Generation State
  const [idCardStudent, setIdCardStudent] = useState<StudentProfile | null>(null);
  const [showIdCardModal, setShowIdCardModal] = useState<boolean>(false);
  const [attendanceThreshold] = useState<number>(DEFAULT_ATTENDANCE_THRESHOLD);

  // Compute attendance stats map and at-risk students
  const studentStatsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeStudentAttendanceStats>>();
    students.forEach(s => {
      const stats = computeStudentAttendanceStats(s, attendanceRecords, attendanceThreshold);
      map.set(s.studentId, stats);
    });
    return map;
  }, [students, attendanceRecords, attendanceThreshold]);

  const atRiskStudents = useMemo(() => {
    return identifyAtRiskStudents(students, attendanceRecords, attendanceThreshold);
  }, [students, attendanceRecords, attendanceThreshold]);

  // Modals & Drawers
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [studentModalTab, setStudentModalTab] = useState<'overview' | 'documents'>('overview');
  const [selectedApplicant, setSelectedApplicant] = useState<AdmissionApplicant | null>(null);
  const [showNewIntakeModal, setShowNewIntakeModal] = useState(false);
  const [enrollTargetSection, setEnrollTargetSection] = useState('A');

  // New Application Form State
  const [candFirst, setCandFirst] = useState('');
  const [candLast, setCandLast] = useState('');
  const [candDob, setCandDob] = useState('');
  const [candGender, setCandGender] = useState<'MALE' | 'FEMALE'>('FEMALE');
  const [candCounty, setCandCounty] = useState('Montserrado');
  const [candGrade, setCandGrade] = useState('Grade 10');
  const [candGuardian, setCandGuardian] = useState('');
  const [candRelation, setCandRelation] = useState('Mother');
  const [candPhone, setCandPhone] = useState('');
  const [candEmail, setCandEmail] = useState('');

  // Duplicate warning state
  const duplicateWarning = candFirst && candLast && candDob 
    ? detectDuplicateStudent({ firstName: candFirst, lastName: candLast, dateOfBirth: candDob, guardianPhone: candPhone }, students)
    : { isDuplicate: false };

  const filteredStudents = students.filter(s => {
    const matchesSearch = 
      s.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.studentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.moeLearnerId && s.moeLearnerId.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesGrade = gradeFilter === 'ALL' || s.gradeLevel === gradeFilter;
    return matchesSearch && matchesGrade;
  });

  const handleIntakeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!candFirst.trim() || !candLast.trim() || !candGuardian.trim()) return;

    onAddApplicant({
      firstName: candFirst,
      lastName: candLast,
      dateOfBirth: candDob,
      gender: candGender,
      county: candCounty,
      targetGrade: candGrade,
      guardianName: candGuardian,
      guardianRelation: candRelation,
      guardianPhone: candPhone,
      guardianEmail: candEmail,
      status: 'SUBMITTED',
      appliedDate: new Date().toISOString().split('T')[0],
      documents: [
        { title: 'Ministry of Health Birth Certificate', submitted: false, verified: false },
        { title: 'Previous School Transcript & Conduct Letter', submitted: false, verified: false },
        { title: 'Grade 9 WAEC / BECE Slip', submitted: false, verified: false }
      ]
    });

    setShowNewIntakeModal(false);
    setCandFirst('');
    setCandLast('');
    setCandDob('');
    setCandGuardian('');
    setCandPhone('');
    setCandEmail('');
  };

  // Distinct guardians
  const allGuardians = students.flatMap(s => 
    s.guardians.map(g => ({
      ...g,
      studentName: `${s.firstName} ${s.lastName}`,
      studentId: s.studentId,
      gradeLevel: `${s.gradeLevel}-${s.section}`
    }))
  );

  return (
    <div className="space-y-6">
      {/* Title & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-slate-800" />
              {THE_REDEEMER_SCHOOL_INFO.name} — Student Body & Admissions Registry
            </h1>
            <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-sm">
              MoE: {THE_REDEEMER_SCHOOL_INFO.moeEmisCode}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Official longitudinal learner profiles, WAEC/WASSCE candidate tracking, admissions intake pipeline, and guardian contacts
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg flex-wrap">
          <button
            onClick={() => setActiveTab('students')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'students' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Enrolled Students ({students.length})
          </button>
          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'attendance' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarCheck className="w-3.5 h-3.5 text-indigo-600" />
            Daily Attendance
            {atRiskStudents.length > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-300 rounded-full animate-pulse">
                ⚠️ {atRiskStudents.length} Alert
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('idcards')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'idcards' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 text-amber-600" />
            Student ID Cards
          </button>
          <button
            onClick={() => setActiveTab('admissions')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'admissions' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Admissions ({applicants.length})
          </button>
          <button
            onClick={() => setActiveTab('guardians')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'guardians' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Guardians ({allGuardians.length})
          </button>
        </div>
      </div>

      {/* TAB 1: Enrolled Students Directory */}
      {activeTab === 'students' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search student, ID, MoE code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-400"
                />
              </div>

              <select
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                aria-label="Filter by Grade"
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">All Grades</option>
                <option value="Grade 9">Grade 9 (Junior High)</option>
                <option value="Grade 10">Grade 10 (Senior High)</option>
                <option value="Grade 11">Grade 11 (Senior High)</option>
                <option value="Grade 12">Grade 12 (WASSCE Candidate)</option>
              </select>
            </div>

            <button
              onClick={() => {
                setActiveTab('admissions');
                setShowNewIntakeModal(true);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              New Student Application
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Student ID</th>
                    <th className="py-2.5 px-4">Learner Name</th>
                    <th className="py-2.5 px-4">Class & Section</th>
                    <th className="py-2.5 px-4">Date of Birth</th>
                    <th className="py-2.5 px-4">Primary Guardian</th>
                    <th className="py-2.5 px-4">MoE Identifier</th>
                    <th className="py-2.5 px-4">PDF Vault</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map((stu) => {
                    const primaryGuardian = stu.guardians.find(g => g.isPrimary) || stu.guardians[0];
                    const docCount = stu.documents?.length || 0;
                    return (
                      <tr key={stu.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {stu.studentId}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-bold text-slate-900">{stu.firstName} {stu.lastName}</div>
                          <div className="text-[10px] text-slate-400">{stu.gender} · {stu.countyOfResidence}</div>
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-slate-800">
                          {stu.gradeLevel}-{stu.section}
                          <div className="text-[10px] text-slate-400 font-normal">{stu.campus}</div>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600 text-[11px]">
                          {stu.dateOfBirth}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-slate-900">{primaryGuardian?.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{primaryGuardian?.phone}</div>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[11px]">
                          {stu.moeLearnerId ? (
                            <span className="text-slate-800 font-semibold">{stu.moeLearnerId}</span>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned (Optional)</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <button
                            onClick={() => {
                              setSelectedStudent(stu);
                              setStudentModalTab('documents');
                            }}
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-md border transition-colors cursor-pointer ${
                              docCount > 0 
                                ? 'text-blue-800 bg-blue-50 hover:bg-blue-100 border-blue-200' 
                                : 'text-slate-500 bg-slate-50 hover:bg-slate-100 border-slate-200'
                            }`}
                            title="Open Document Vault"
                          >
                            <FileText className="w-3 h-3 text-blue-600" />
                            <span>{docCount} PDF{docCount === 1 ? '' : 's'}</span>
                          </button>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-700">
                            {stu.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedStudent(stu);
                                setStudentModalTab('overview');
                              }}
                              className="px-2 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                            >
                              Profile
                            </button>
                            <button
                              onClick={() => {
                                setSelectedStudent(stu);
                                setStudentModalTab('documents');
                              }}
                              className="px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                              title="Open Documents"
                            >
                              <FileText className="w-3 h-3" />
                              Docs
                            </button>
                            <button
                              onClick={() => onIssueTuitionInvoice(stu)}
                              className="px-2 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                              title="Bill Tuition in Finance Module"
                            >
                              Bill Fees
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Admissions & Pipeline Kanban */}
      {activeTab === 'admissions' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Admissions Intake & Enrollment Pipeline
              </h2>
              <span className="text-xs text-slate-500">Track applicants from submission through document verification to enrollment</span>
            </div>

            <button
              onClick={() => setShowNewIntakeModal(true)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Applicant Intake
            </button>
          </div>

          {/* Pipeline Columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {(['SUBMITTED', 'UNDER_REVIEW', 'INTERVIEW_SCHEDULED', 'OFFERED', 'ACCEPTED'] as AdmissionStatus[]).map((stage) => {
              const stageApplicants = applicants.filter(a => a.status === stage);
              return (
                <div key={stage} className="bg-slate-100/70 p-3 rounded-xl border border-slate-200 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        {stage.replace('_', ' ')}
                      </span>
                      <span className="text-xs font-bold text-slate-500 bg-white px-1.5 py-0.2 rounded-sm border border-slate-200">
                        {stageApplicants.length}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {stageApplicants.map((app) => (
                        <div key={app.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs space-y-2 text-xs">
                          <div>
                            <div className="flex justify-between items-start">
                              <span className="font-mono text-[10px] text-slate-400">{app.applicationNumber}</span>
                              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1 rounded-sm">{app.targetGrade}</span>
                            </div>
                            <h4 className="font-bold text-slate-900 mt-0.5">{app.firstName} {app.lastName}</h4>
                            <span className="text-[10px] text-slate-500 block">Applied: {app.appliedDate}</span>
                          </div>

                          <div className="text-[11px] text-slate-600 bg-slate-50 p-1.5 rounded-sm">
                            <span className="font-semibold block text-slate-800">Guardian: {app.guardianName}</span>
                            <span className="font-mono text-slate-500 text-[10px]">{app.guardianPhone}</span>
                          </div>

                          {/* Action Button depending on stage */}
                          <div className="pt-1 flex items-center justify-between">
                            <button
                              onClick={() => setSelectedApplicant(app)}
                              className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer"
                            >
                              Documents ({app.documents.filter(d => d.submitted).length}/{app.documents.length})
                            </button>

                            {stage === 'ACCEPTED' ? (
                              <button
                                onClick={() => {
                                  onEnrollApplicant(app.id, enrollTargetSection);
                                }}
                                className="px-2 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors cursor-pointer"
                              >
                                Enroll as Student
                              </button>
                            ) : stage === 'OFFERED' ? (
                              <button
                                onClick={() => onUpdateApplicantStatus(app.id, 'ACCEPTED')}
                                className="px-2 py-0.5 text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-sm cursor-pointer"
                              >
                                Mark Accepted
                              </button>
                            ) : stage === 'SUBMITTED' ? (
                              <button
                                onClick={() => onUpdateApplicantStatus(app.id, 'UNDER_REVIEW')}
                                className="px-2 py-0.5 text-[10px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-sm cursor-pointer"
                              >
                                Review
                              </button>
                            ) : (
                              <button
                                onClick={() => onUpdateApplicantStatus(app.id, 'OFFERED')}
                                className="px-2 py-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-sm cursor-pointer"
                              >
                                Issue Offer
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: Guardian Directory */}
      {activeTab === 'guardians' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Parent & Guardian Contact Directory
            </h2>
            <span className="text-xs text-slate-500">Verified emergency contacts and authorized student pickup credentials</span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Guardian Name</th>
                    <th className="py-2.5 px-4">Relationship</th>
                    <th className="py-2.5 px-4">Linked Student</th>
                    <th className="py-2.5 px-4">Class</th>
                    <th className="py-2.5 px-4">Primary Phone</th>
                    <th className="py-2.5 px-4">Email Address</th>
                    <th className="py-2.5 px-4 text-center">Pickup Authorized</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allGuardians.map((g, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/75">
                      <td className="py-2.5 px-4 font-bold text-slate-900">{g.name}</td>
                      <td className="py-2.5 px-4 text-slate-700 font-medium">{g.relation}</td>
                      <td className="py-2.5 px-4 font-semibold text-slate-800">{g.studentName}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">{g.gradeLevel}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-900 font-medium">{g.phone}</td>
                      <td className="py-2.5 px-4 text-slate-500">{g.email}</td>
                      <td className="py-2.5 px-4 text-center">
                        {g.authorizedPickup ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-sm">
                            <CheckCircle2 className="w-3 h-3" /> Authorized
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Student Detailed Longitudinal Profile & Document Vault */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div>
                <span className="text-xs font-mono font-bold text-slate-500">
                  {selectedStudent.studentId} · {selectedStudent.moeLearnerId || 'No MoE ID'}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5 flex items-center gap-2">
                  {selectedStudent.firstName} {selectedStudent.lastName}
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-sm bg-blue-50 text-blue-700 border border-blue-200">
                    {selectedStudent.gradeLevel} - {selectedStudent.section}
                  </span>
                </h3>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Modal Sub-Tabs */}
                <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                  <button
                    onClick={() => setStudentModalTab('overview')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      studentModalTab === 'overview'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Overview & Bio
                  </button>
                  <button
                    onClick={() => setStudentModalTab('documents')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                      studentModalTab === 'documents'
                        ? 'bg-white text-blue-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    Document Vault
                    <span className="text-[10px] font-bold px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded-full">
                      {selectedStudent.documents?.length || 0}
                    </span>
                  </button>
                </div>

                <button
                  onClick={() => setSelectedStudent(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-md text-base leading-none cursor-pointer"
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
              {studentModalTab === 'overview' ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200/70">
                    <div>
                      <span className="text-slate-500 block text-[11px]">Class & Section:</span>
                      <span className="font-bold text-slate-900 text-sm">{selectedStudent.gradeLevel} - {selectedStudent.section}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Campus Location:</span>
                      <span className="font-bold text-slate-900 text-sm">{selectedStudent.campus}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Date of Birth:</span>
                      <span className="font-mono text-slate-800">{selectedStudent.dateOfBirth} ({selectedStudent.gender})</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">County of Origin:</span>
                      <span className="font-semibold text-slate-800">{selectedStudent.countyOfResidence}</span>
                    </div>
                  </div>

                  {/* Document Summary Card in Overview */}
                  <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                          Verified Documents Vault ({selectedStudent.documents?.length || 0} Records)
                        </h4>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Stores Base64-encoded PDF transcripts and birth certificates bound to this learner's identity.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setStudentModalTab('documents')}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-center"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Open Document Vault & Upload
                    </button>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-2">
                      Guardian & Emergency Contacts
                    </h4>
                    <div className="space-y-2">
                      {selectedStudent.guardians.map((g, idx) => (
                        <div key={idx} className="p-3 rounded-lg border border-slate-200 flex justify-between items-center bg-white shadow-2xs">
                          <div>
                            <span className="font-bold text-slate-900">{g.name}</span>
                            <span className="text-slate-500 ml-1.5">({g.relation})</span>
                            <div className="text-slate-600 font-mono text-[11px] mt-0.5">{g.phone} · {g.email}</div>
                          </div>
                          <div className="text-right">
                            {g.authorizedPickup && (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-sm border border-emerald-200 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Authorized Pickup
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedStudent.medicalNotes && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
                      <span className="font-bold block">Medical & Accommodation Alert:</span>
                      <p className="mt-0.5">{selectedStudent.medicalNotes}</p>
                    </div>
                  )}

                  {selectedStudent.correctionLog.length > 0 && (
                    <div>
                      <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-1.5">
                        Field Correction Audit History
                      </h4>
                      <div className="text-[11px] text-slate-500 space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        {selectedStudent.correctionLog.map((log, idx) => (
                          <div key={idx}>
                            <strong>{log.field}:</strong> Changed from <span className="line-through">{log.oldValue}</span> to <strong>{log.newValue}</strong> by {log.changedBy}.
                            <div className="italic text-slate-400">Reason: {log.reason}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Documents Tab: Full Upload & Management Vault */
                <StudentDocumentUpload
                  student={selectedStudent}
                  activeUserName={activeUserName}
                  onUpdateDocuments={(studentId, updatedDocs) => {
                    setSelectedStudent(prev => prev ? { ...prev, documents: updatedDocs } : null);
                    if (onUpdateStudentDocuments) {
                      onUpdateStudentDocuments(studentId, updatedDocs);
                    }
                  }}
                  onAuditLog={onAuditLog}
                  onNotification={onNotification}
                />
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {studentModalTab === 'overview' ? (
                  <button
                    onClick={() => setStudentModalTab('documents')}
                    className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Manage PDF Vault ({selectedStudent.documents?.length || 0})
                  </button>
                ) : (
                  <button
                    onClick={() => setStudentModalTab('overview')}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  >
                    ← Back to Bio Overview
                  </button>
                )}

                <button
                  onClick={() => {
                    onIssueTuitionInvoice(selectedStudent);
                    setSelectedStudent(null);
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  Bill Tuition Fees
                </button>
              </div>

              <button
                onClick={() => setSelectedStudent(null)}
                className="px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: New Application Intake with Duplicate Detection */}
      {showNewIntakeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              New Student Admissions Application Intake
            </h3>

            {/* Duplicate Learner Detection Alert */}
            {duplicateWarning.isDuplicate && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Potential Duplicate Learner Detected:</strong>
                  <p className="mt-0.5">
                    An enrolled student matching this candidate already exists: <strong>{duplicateWarning.matchedStudent?.firstName} {duplicateWarning.matchedStudent?.lastName}</strong> ({duplicateWarning.matchedStudent?.studentId}, Grade {duplicateWarning.matchedStudent?.gradeLevel}).
                    <br />
                    <em>{duplicateWarning.matchReason}</em>
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleIntakeSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={candFirst}
                    onChange={(e) => setCandFirst(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    value={candLast}
                    onChange={(e) => setCandLast(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth</label>
                  <input
                    type="date"
                    required
                    value={candDob}
                    onChange={(e) => setCandDob(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Gender</label>
                  <select
                    value={candGender}
                    onChange={(e) => setCandGender(e.target.value as any)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                  >
                    <option value="FEMALE">Female</option>
                    <option value="MALE">Male</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Grade</label>
                  <select
                    value={candGrade}
                    onChange={(e) => setCandGrade(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                  >
                    <option value="Grade 9">Grade 9</option>
                    <option value="Grade 10">Grade 10</option>
                    <option value="Grade 11">Grade 11</option>
                    <option value="Grade 12">Grade 12</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">County of Residence</label>
                  <select
                    value={candCounty}
                    onChange={(e) => setCandCounty(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                  >
                    <option value="Montserrado">Montserrado</option>
                    <option value="Margibi">Margibi</option>
                    <option value="Bong">Bong</option>
                    <option value="Nimba">Nimba</option>
                    <option value="Grand Bassa">Grand Bassa</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Guardian Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cllr. Famatta Sherman"
                    value={candGuardian}
                    onChange={(e) => setCandGuardian(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Guardian Phone</label>
                  <input
                    type="text"
                    required
                    placeholder="+231 886 123 456"
                    value={candPhone}
                    onChange={(e) => setCandPhone(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Guardian Email</label>
                  <input
                    type="email"
                    placeholder="guardian@email.com"
                    value={candEmail}
                    onChange={(e) => setCandEmail(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewIntakeModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Register Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Applicant Document Verification Checklist */}
      {selectedApplicant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Required Documents Checklist
                </h3>
                <span className="text-slate-500">{selectedApplicant.firstName} {selectedApplicant.lastName} ({selectedApplicant.applicationNumber})</span>
              </div>
              <button onClick={() => setSelectedApplicant(null)} className="text-slate-400 font-bold">✕</button>
            </div>

            <div className="space-y-2">
              {selectedApplicant.documents.map((doc, idx) => (
                <div key={idx} className="p-2.5 rounded-lg border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-800 block">{doc.title}</span>
                    <span className="text-[10px] text-slate-400">{doc.submitted ? 'Submitted to Admissions Desk' : 'Pending Submission'}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                    doc.verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {doc.verified ? 'Verified' : 'Pending Review'}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <button
                onClick={() => setSelectedApplicant(null)}
                className="px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
