import React, { useState, useRef } from 'react';
import {
  X,
  Printer,
  Download,
  Share2,
  CheckCircle2,
  ShieldCheck,
  Award,
  RefreshCw,
  QrCode,
  Layers,
  Sparkles,
  School,
  FileCheck2,
  Copy,
  Check
} from 'lucide-react';
import { StudentProfile } from '../logic/students.ts';
import {
  StudentIdCardData,
  generateStudentIdCardData,
  generateBatchIdCards,
  DEFAULT_SCHOOL_INFO
} from '../logic/idCard.ts';

interface StudentIdCardModalProps {
  student: StudentProfile | null;
  allStudents?: StudentProfile[];
  onClose: () => void;
  onAuditLog?: (action: string, details: string) => void;
  onNotification?: (message: string) => void;
}

export const StudentIdCardModal: React.FC<StudentIdCardModalProps> = ({
  student,
  allStudents = [],
  onClose,
  onAuditLog,
  onNotification
}) => {
  const [activeSide, setActiveSide] = useState<'FRONT' | 'BACK' | 'BOTH'>('FRONT');
  const [batchMode, setBatchMode] = useState<boolean>(false);
  const [batchGrade, setBatchGrade] = useState<string>(student?.gradeLevel || 'Grade 10');
  const [copiedPayload, setCopiedPayload] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!student && (!allStudents || allStudents.length === 0)) return null;

  // Single card data
  const primaryCard: StudentIdCardData | null = student ? generateStudentIdCardData(student) : null;

  // Batch cards data
  const batchCards: StudentIdCardData[] = React.useMemo(() => {
    if (!batchMode) return primaryCard ? [primaryCard] : [];
    return generateBatchIdCards(allStudents, batchGrade);
  }, [batchMode, batchGrade, allStudents, primaryCard]);

  // Handle browser print
  const handlePrint = () => {
    if (onAuditLog && student) {
      onAuditLog(
        'STUDENT_ID_CARD_PRINTED',
        `Printed student ID card credentials for ${batchMode ? `cohort ${batchGrade}` : student.studentId + ' (' + student.firstName + ' ' + student.lastName + ')'}`
      );
    }
    if (onNotification) {
      onNotification(`ID Card print layout prepared for ${batchMode ? `${batchCards.length} students in ${batchGrade}` : student?.firstName + ' ' + student?.lastName}.`);
    }
    window.print();
  };

  // Copy verification payload
  const handleCopyPayload = (payload: string) => {
    navigator.clipboard.writeText(payload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
    if (onNotification) {
      onNotification('MoE Verification QR payload copied to clipboard.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        
        {/* Modal Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-900 flex items-center justify-center font-black shadow-md">
              <School className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">
                  Student ID Card Preview
                </h2>
                <span className="text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded-sm">
                  Preview only · Not an official credential
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {DEFAULT_SCHOOL_INFO.name} • {DEFAULT_SCHOOL_INFO.address} • MoE EMIS: {DEFAULT_SCHOOL_INFO.moeEmisCode}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setBatchMode(!batchMode)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                batchMode 
                  ? 'bg-amber-400 text-slate-900 shadow-xs' 
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              {batchMode ? 'Single Card View' : 'Batch Class Print'}
            </button>

            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              Print ID {batchMode ? `(${batchCards.length})` : 'Card'}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar: Card Side Toggle & Batch Filter */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Display View:</span>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white">
              <button
                onClick={() => setActiveSide('FRONT')}
                className={`px-3 py-1 font-semibold rounded-md transition-colors cursor-pointer ${
                  activeSide === 'FRONT' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Front View
              </button>
              <button
                onClick={() => setActiveSide('BACK')}
                className={`px-3 py-1 font-semibold rounded-md transition-colors cursor-pointer ${
                  activeSide === 'BACK' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Reverse / Security
              </button>
              <button
                onClick={() => setActiveSide('BOTH')}
                className={`px-3 py-1 font-semibold rounded-md transition-colors cursor-pointer ${
                  activeSide === 'BOTH' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Dual Sides
              </button>
            </div>
          </div>

          {batchMode && (
            <div className="flex items-center gap-2">
              <span className="text-slate-600 font-semibold">Cohort Grade:</span>
              <select
                value={batchGrade}
                onChange={(e) => setBatchGrade(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 font-bold text-slate-900 focus:outline-hidden"
              >
                <option value="ALL">All Enrolled Grades</option>
                <option value="Grade 7">Grade 7</option>
                <option value="Grade 10">Grade 10</option>
                <option value="Grade 11">Grade 11</option>
                <option value="Grade 12">Grade 12</option>
              </select>
              <span className="text-slate-500">({batchCards.length} Cards in batch)</span>
            </div>
          )}
        </div>

        {/* Modal Body / ID Cards Container */}
        <div ref={printAreaRef} className="p-6 overflow-y-auto flex-1 bg-slate-100/70 space-y-8">
          
          {batchCards.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              No students found for the selected cohort filter.
            </div>
          ) : (
            <div className={`grid gap-8 justify-center ${
              batchCards.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
            }`}>
              {batchCards.map((card) => (
                <div key={card.studentId} className="flex flex-col items-center gap-4">
                  {/* Card Front Side */}
                  {(activeSide === 'FRONT' || activeSide === 'BOTH') && (
                    <div className="w-[380px] h-[240px] bg-white rounded-xl shadow-md border-2 border-slate-800 overflow-hidden flex flex-col relative select-none print:shadow-none print:border-slate-800">
                      
                      {/* Card Header */}
                      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-2.5 border-b-2 border-amber-400 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-amber-400 text-slate-950 font-black flex items-center justify-center text-sm border-2 border-white shadow-xs">
                            ✝
                          </div>
                          <div>
                            <div className="text-[12px] font-black uppercase tracking-wider text-amber-300">
                              {card.schoolName}
                            </div>
                            <div className="text-[8px] text-slate-300 tracking-tight">
                              PAYNESVILLE, LIBERIA • EST. 2022
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[8px] font-bold bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded-xs tracking-tight">
                            {card.academicYear}
                          </div>
                          <div className="text-[7px] text-slate-300 mt-0.5">
                            MoE: {card.schoolEmisCode}
                          </div>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-3 flex-1 flex gap-3 bg-gradient-to-br from-white via-slate-50/50 to-indigo-50/30">
                        {/* Student Photo Avatar */}
                        <div className="flex flex-col items-center shrink-0">
                          <div className="w-20 h-24 rounded-lg bg-gradient-to-b from-slate-200 to-slate-300 border-2 border-slate-800 shadow-xs flex flex-col items-center justify-center overflow-hidden relative">
                            <div className="w-12 h-12 rounded-full bg-slate-700 text-white font-black text-lg flex items-center justify-center shadow-xs">
                              {card.firstName[0]}{card.lastName[0]}
                            </div>
                            <span className="text-[8px] font-bold text-slate-700 mt-1 uppercase tracking-wider">
                              Verified
                            </span>
                            {/* Watermark pin */}
                            <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white" />
                          </div>
                          <span className="text-[8px] font-black text-indigo-950 mt-1 tracking-tighter">
                            {card.studentId}
                          </span>
                        </div>

                        {/* Student Details Fields */}
                        <div className="flex-1 flex flex-col justify-between text-left">
                          <div>
                            <div className="text-sm font-black text-slate-950 leading-tight">
                              {card.fullName}
                            </div>
                            <div className="text-[9px] font-semibold text-indigo-700">
                              {card.gradeLevel} — {card.section}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[8.5px] mt-1 text-slate-700">
                            <div>
                              <span className="text-slate-400">MoE ID: </span>
                              <strong className="text-slate-900 font-bold">{card.moeLearnerId || 'Pending'}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400">DOB: </span>
                              <strong>{card.dateOfBirth}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400">Gender: </span>
                              <strong>{card.gender}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400">County: </span>
                              <strong>{card.countyOfResidence}</strong>
                            </div>
                            <div className="col-span-2 truncate">
                              <span className="text-slate-400">Emergency: </span>
                              <strong>{card.emergencyContactPhone}</strong>
                            </div>
                          </div>

                          {/* Barcode Strip */}
                          <div className="mt-1 pt-1 border-t border-slate-200">
                            <div 
                              className="h-6 w-full overflow-hidden"
                              dangerouslySetInnerHTML={{ __html: card.barcodeSvg }}
                            />
                            <div className="text-[7.5px] tracking-widest text-slate-500 font-mono text-center">
                              *{card.studentId}*
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Card Bottom Ribbon */}
                      <div className="bg-slate-900 text-white px-3 py-1 flex items-center justify-between text-[8px]">
                        <span className="text-amber-300 font-semibold flex items-center gap-1">
                          <ShieldCheck className="w-2.5 h-2.5" />
                          Preview only · Ministry verification not configured
                        </span>
                        <span className="text-slate-300">Expires: {card.validThrough}</span>
                      </div>
                    </div>
                  )}

                  {/* Card Back Side (Reverse) */}
                  {(activeSide === 'BACK' || activeSide === 'BOTH') && (
                    <div className="w-[380px] h-[240px] bg-slate-900 text-white rounded-xl shadow-md border-2 border-slate-800 overflow-hidden flex flex-col justify-between p-3.5 select-none print:shadow-none">
                      
                      {/* Top Header */}
                      <div className="border-b border-slate-700 pb-2 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-black uppercase text-amber-400 tracking-wider">
                            {card.schoolName}
                          </div>
                          <div className="text-[7.5px] text-slate-400">
                            {DEFAULT_SCHOOL_INFO.address}
                          </div>
                        </div>
                        <span className="text-[7px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded-sm">
                          Card: {card.cardSerialNumber}
                        </span>
                      </div>

                      {/* Terms & Lost Notice */}
                      <div className="space-y-1.5 text-[8px] text-slate-300 leading-snug">
                        <p>
                          1. This preview is not an issued student identity credential.
                        </p>
                        <p>
                          2. Confirm school, student and Ministry details before issuing any printed identity card.
                        </p>
                        <p className="text-amber-200/90 font-medium">
                          School office: {DEFAULT_SCHOOL_INFO.address}
                        </p>
                      </div>

                      {/* Signatures & Seal */}
                      <div className="pt-2 border-t border-slate-700 flex items-end justify-between">
                        <div className="text-left">
                          <div className="font-serif italic text-amber-300 text-xs tracking-wider">
                            {card.principalName}
                          </div>
                          <div className="text-[7px] text-slate-400 uppercase tracking-wider">
                            School Principal & Registrar
                          </div>
                        </div>

                        {/* Copy the payload; the preview does not display a scannable QR code. */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCopyPayload(card.qrPayload)}
                            className="p-1 bg-slate-800 hover:bg-slate-700 rounded-sm border border-slate-600 text-slate-300 hover:text-white transition-colors cursor-pointer"
                            title="Copy verification payload"
                          >
                            {copiedPayload ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                          <div className="w-10 h-10 bg-white p-1 rounded-sm flex items-center justify-center">
                            <span className="text-[6px] font-bold text-slate-700 text-center">PAYLOAD<br />ONLY</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <div className="text-slate-500 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Printed cards conform to standard Liberian student credential card dimensions (85.60 × 53.98 mm).</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-4 h-4" />
              Print Selected ID {batchMode ? `Cards (${batchCards.length})` : 'Card'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
