import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Upload, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  Eye, 
  Download, 
  Trash2, 
  Copy, 
  Check, 
  FileCheck, 
  Lock,
  ExternalLink,
  Info
} from 'lucide-react';
import { 
  StudentProfile, 
  StudentDocument, 
  StudentDocumentType, 
  formatDocumentSize,
  filterDocumentsByType 
} from '../logic/students.ts';
import { validatePdfFile } from '../logic/pdfHelper.ts';

interface StudentDocumentUploadProps {
  student: StudentProfile;
  activeUserName: string;
  onUpdateDocuments: (studentId: string, updatedDocs: StudentDocument[]) => void;
  onAuditLog?: (action: string, details: string) => void;
  onNotification?: (message: string) => void;
}

export const StudentDocumentUpload: React.FC<StudentDocumentUploadProps> = ({
  student,
  activeUserName,
  onUpdateDocuments,
  onAuditLog,
  onNotification
}) => {
  const documents = student.documents || [];

  // Filter state
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<StudentDocumentType | 'ALL'>('ALL');

  // Form State
  const [docType, setDocType] = useState<StudentDocumentType>('ACADEMIC_TRANSCRIPT');
  const [docTitle, setDocTitle] = useState('Official Academic Transcript');
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Modals
  const [previewDoc, setPreviewDoc] = useState<StudentDocument | null>(null);
  const [inspectDoc, setInspectDoc] = useState<StudentDocument | null>(null);
  const [copiedBase64, setCopiedBase64] = useState(false);
  const [docToDelete, setDocToDelete] = useState<StudentDocument | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Default titles according to type
  const handleTypeChange = (type: StudentDocumentType) => {
    setDocType(type);
    if (type === 'ACADEMIC_TRANSCRIPT') {
      setDocTitle('Official Senior High Academic Transcript');
    } else if (type === 'BIRTH_CERTIFICATE') {
      setDocTitle('Republic of Liberia Birth Certificate');
    } else if (type === 'WAEC_SLIP') {
      setDocTitle('WAEC / WASSCE Examination Slip');
    } else if (type === 'NATIONAL_ID') {
      setDocTitle('NIR National Identification Card');
    } else if (type === 'MEDICAL_CLEARANCE') {
      setDocTitle('School Health Clearance Certificate');
    } else {
      setDocTitle('Official Student Document');
    }
  };

  const handleFileSelection = (file: File) => {
    const validation = validatePdfFile({
      name: file.name,
      size: file.size,
      type: file.type
    });

    if (!validation.valid) {
      setFileError(validation.error || 'Invalid file.');
      setSelectedFile(null);
      return;
    }

    setFileError(null);
    setSelectedFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleSaveDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setFileError('Please select a PDF document to upload.');
      return;
    }

    setIsUploading(true);

    try {
      // Convert File to Base64 data URL
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(selectedFile);
      });

      const newDoc: StudentDocument = {
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        studentId: student.studentId,
        type: docType,
        title: docTitle.trim() || selectedFile.name,
        fileName: selectedFile.name,
        fileSizeBytes: selectedFile.size,
        mimeType: 'application/pdf',
        base64Data,
        uploadedAt: new Date().toISOString(),
        uploadedBy: activeUserName,
        verified: false,
        notes: notes.trim() || undefined
      };

      const updatedDocs = [newDoc, ...documents];
      onUpdateDocuments(student.id, updatedDocs);

      if (onAuditLog) {
        onAuditLog(
          'STUDENT_DOC_UPLOADED',
          `Uploaded ${docType} (${selectedFile.name}, ${formatDocumentSize(selectedFile.size)}) for student ${student.firstName} ${student.lastName} (${student.studentId}) as Base64 string`
        );
      }

      if (onNotification) {
        onNotification(`Secure document "${newDoc.title}" stored & linked to ${student.firstName}'s record.`);
      }

      // Reset form
      setSelectedFile(null);
      setNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setFileError('Failed to encode document to Base64. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleToggleVerification = (doc: StudentDocument) => {
    const newStatus = !doc.verified;
    const updated = documents.map(d => {
      if (d.id !== doc.id) return d;
      return {
        ...d,
        verified: newStatus,
        verifiedBy: newStatus ? activeUserName : undefined,
        verifiedAt: newStatus ? new Date().toISOString() : undefined
      };
    });

    onUpdateDocuments(student.id, updated);

    if (onAuditLog) {
      onAuditLog(
        newStatus ? 'STUDENT_DOC_VERIFIED' : 'STUDENT_DOC_UNVERIFIED',
        `${newStatus ? 'Verified' : 'Revoked verification of'} document "${doc.title}" for ${student.studentId} by ${activeUserName}`
      );
    }

    if (onNotification) {
      onNotification(`Document "${doc.title}" marked as ${newStatus ? 'Verified' : 'Pending Review'}.`);
    }
  };

  const handleConfirmDelete = () => {
    if (!docToDelete) return;
    const updated = documents.filter(d => d.id !== docToDelete.id);
    onUpdateDocuments(student.id, updated);

    if (onAuditLog) {
      onAuditLog(
        'STUDENT_DOC_DELETED',
        `Deleted document "${docToDelete.title}" (${docToDelete.fileName}) for student ${student.studentId}`
      );
    }

    if (onNotification) {
      onNotification(`Document "${docToDelete.title}" removed.`);
    }

    setDocToDelete(null);
  };

  const handleDownload = (doc: StudentDocument) => {
    try {
      const link = document.createElement('a');
      link.href = doc.base64Data;
      link.download = doc.fileName || `${student.studentId}_${doc.type}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (onNotification) {
        onNotification(`Downloaded "${doc.fileName}"`);
      }
    } catch (err) {
      alert('Unable to initiate download. You can preview or copy the base64 string.');
    }
  };

  const handleCopyBase64 = (base64: string) => {
    navigator.clipboard.writeText(base64).then(() => {
      setCopiedBase64(true);
      setTimeout(() => setCopiedBase64(false), 2000);
    });
  };

  // Filtered documents
  const filteredDocs = selectedTypeFilter === 'ALL'
    ? documents
    : filterDocumentsByType(documents, selectedTypeFilter);

  const transcriptsCount = documents.filter(d => d.type === 'ACADEMIC_TRANSCRIPT').length;
  const birthCertCount = documents.filter(d => d.type === 'BIRTH_CERTIFICATE').length;
  const verifiedCount = documents.filter(d => d.verified).length;

  return (
    <div className="space-y-5">
      {/* Overview Stat Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Total Vault Documents</span>
          <div className="text-lg font-bold text-slate-900 mt-0.5 flex items-center justify-between">
            {documents.length}
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
        </div>

        <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-2.5">
          <span className="text-[10px] uppercase font-bold text-blue-700 tracking-wider block">Transcripts Stored</span>
          <div className="text-lg font-bold text-blue-900 mt-0.5 flex items-center justify-between">
            {transcriptsCount}
            <FileCheck className="w-4 h-4 text-blue-500" />
          </div>
        </div>

        <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-2.5">
          <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block">Birth Certificates</span>
          <div className="text-lg font-bold text-amber-900 mt-0.5 flex items-center justify-between">
            {birthCertCount}
            <ShieldCheck className="w-4 h-4 text-amber-600" />
          </div>
        </div>

        <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-2.5">
          <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">Verified Credentials</span>
          <div className="text-lg font-bold text-emerald-900 mt-0.5 flex items-center justify-between">
            {verifiedCount} / {documents.length}
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
        </div>
      </div>

      {/* Upload Component Card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-blue-600" />
              Secure Document Upload & Base64 Vault
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Upload PDF copies of academic transcripts or birth certificates. Files are converted into Base64 strings and bound to student record <span className="font-mono font-semibold text-slate-700">{student.studentId}</span>.
            </p>
          </div>

        </div>

        <form onSubmit={handleSaveDocument} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Document Type <span className="text-rose-500">*</span>
              </label>
              <select
                value={docType}
                onChange={(e) => handleTypeChange(e.target.value as StudentDocumentType)}
                aria-label="Select Document Type"
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-slate-400 focus:outline-hidden cursor-pointer"
              >
                <option value="ACADEMIC_TRANSCRIPT">Academic Transcript</option>
                <option value="BIRTH_CERTIFICATE">Birth Certificate</option>
                <option value="WAEC_SLIP">Grade 9 / WAEC / WASSCE Slip</option>
                <option value="NATIONAL_ID">National ID / Resident Card</option>
                <option value="MEDICAL_CLEARANCE">Medical / Immunization Clearance</option>
                <option value="OTHER">Other Official Scholastic Record</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Document Title / Record Label <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="e.g. Official Senior High Academic Transcript"
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-slate-400 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Drag & Drop File Zone */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Select or Drop PDF File (Max 10 MB) <span className="text-rose-500">*</span>
            </label>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                isDragOver 
                  ? 'border-blue-500 bg-blue-50/50 scale-[1.01]' 
                  : selectedFile 
                    ? 'border-emerald-400 bg-emerald-50/30' 
                    : 'border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileInputChange}
                className="hidden"
                aria-label="Upload PDF file"
              />

              {selectedFile ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      {selectedFile.name}
                      <span className="text-[10px] font-normal text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-sm">
                        PDF Validated
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {formatDocumentSize(selectedFile.size)} · Ready for Base64 encoding
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="ml-auto text-xs text-rose-600 hover:underline cursor-pointer"
                  >
                    Change file
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="mx-auto w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                    <Upload className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-semibold text-slate-700">
                    Click to browse or drag and drop your PDF here
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Secure PDF format only (Academic Transcripts & Birth Certificates) · Up to 10.0 MB
                  </div>
                </div>
              )}
            </div>

            {fileError && (
              <div className="mt-2 text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {fileError}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Internal Registry Memo / Verification Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Certified true copy issued by MoH or previous school registrar"
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-slate-400 focus:outline-hidden"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={!selectedFile || isUploading}
              className={`px-4 py-2 text-xs font-bold text-white rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                !selectedFile || isUploading
                  ? 'bg-slate-300 cursor-not-allowed text-slate-500'
                  : 'bg-slate-900 hover:bg-slate-800 shadow-xs'
              }`}
            >
              {isUploading ? (
                <>Encoding Base64 PDF...</>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Upload & Store Base64 Document
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Filter Tabs & Documents List */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Linked Documents Vault
            </h4>
            <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
              {filteredDocs.length} {filteredDocs.length === 1 ? 'file' : 'files'}
            </span>
          </div>

          {/* Type Filter Buttons */}
          <div className="flex items-center gap-1 overflow-x-auto p-1 bg-slate-100 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setSelectedTypeFilter('ALL')}
              className={`px-2.5 py-1 font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                selectedTypeFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({documents.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedTypeFilter('ACADEMIC_TRANSCRIPT')}
              className={`px-2.5 py-1 font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                selectedTypeFilter === 'ACADEMIC_TRANSCRIPT' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Transcripts ({transcriptsCount})
            </button>
            <button
              type="button"
              onClick={() => setSelectedTypeFilter('BIRTH_CERTIFICATE')}
              className={`px-2.5 py-1 font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                selectedTypeFilter === 'BIRTH_CERTIFICATE' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Birth Certs ({birthCertCount})
            </button>
          </div>
        </div>

        {filteredDocs.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
            <FileText className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-600">No documents found in this category</p>
            <p className="text-[11px] text-slate-400">
              Upload a PDF transcript or birth certificate using the form above.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredDocs.map((doc) => {
              const isTranscript = doc.type === 'ACADEMIC_TRANSCRIPT';
              const isBirthCert = doc.type === 'BIRTH_CERTIFICATE';

              return (
                <div
                  key={doc.id}
                  className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs hover:border-slate-300 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isTranscript 
                        ? 'bg-blue-100 text-blue-700' 
                        : isBirthCert 
                          ? 'bg-amber-100 text-amber-800' 
                          : 'bg-slate-100 text-slate-700'
                    }`}>
                      <FileText className="w-5 h-5" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-xs">
                          {doc.title}
                        </span>

                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                          isTranscript 
                            ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                            : isBirthCert 
                              ? 'bg-amber-50 text-amber-800 border border-amber-200' 
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {isTranscript ? 'Academic Transcript' : isBirthCert ? 'Birth Certificate' : doc.type.replace('_', ' ')}
                        </span>

                        {doc.verified ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Verified
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            Pending Verification
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-500 flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-slate-600">{doc.fileName}</span>
                        <span>•</span>
                        <span>{formatDocumentSize(doc.fileSizeBytes)}</span>
                        <span>•</span>
                        <span>Uploaded: {doc.uploadedAt.split('T')[0]} by {doc.uploadedBy}</span>
                        {doc.verifiedBy && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-700">Verified by {doc.verifiedBy}</span>
                          </>
                        )}
                      </div>

                      {doc.notes && (
                        <div className="text-[11px] text-slate-600 italic bg-slate-50 px-2 py-1 rounded-md border border-slate-200/60 mt-1">
                          Note: {doc.notes}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => setPreviewDoc(doc)}
                      className="px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                      title="View PDF Document"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View PDF
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownload(doc)}
                      className="px-2 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                      title="Download PDF file"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>

                    <button
                      type="button"
                      onClick={() => setInspectDoc(doc)}
                      className="px-2 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                      title="Inspect Base64 Encoded String"
                    >
                      <Info className="w-3.5 h-3.5" />
                      Base64
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleVerification(doc)}
                      className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                        doc.verified 
                          ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' 
                          : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                      }`}
                      title={doc.verified ? 'Revoke verification status' : 'Verify document authenticity'}
                    >
                      {doc.verified ? 'Unverify' : 'Verify'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setDocToDelete(doc)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                      title="Delete document"
                      aria-label={`Delete ${doc.title}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL 1: PDF Document Viewer */}
      {previewDoc && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full h-[85vh] flex flex-col border border-slate-200 overflow-hidden">
            {/* PDF Viewer Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-700" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {previewDoc.title}
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {previewDoc.fileName} · {formatDocumentSize(previewDoc.fileSizeBytes)} · Linked to {student.studentId}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(previewDoc)}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                  title="Download PDF to local disk"
                >
                  <Download className="w-3.5 h-3.5" />
                  Save .PDF File
                </button>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="text-slate-400 hover:text-slate-700 font-bold p-1 rounded-md text-base leading-none cursor-pointer"
                  aria-label="Close PDF viewer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Render the uploaded file itself; do not synthesize transcript or certificate records. */}
            <div className="flex-1 bg-slate-100 p-4 sm:p-6 overflow-y-auto">
              <div className="max-w-4xl h-full min-h-[60vh] mx-auto bg-white rounded-xl border border-slate-300 shadow-md overflow-hidden">
                {previewDoc.base64Data ? (
                  <iframe title={previewDoc.title} src={previewDoc.base64Data} className="h-full min-h-[60vh] w-full" />
                ) : (
                  <div className="grid min-h-[60vh] place-items-center p-8 text-center text-sm text-slate-600">
                    No file is available to preview. Download the document or upload it again.
                  </div>
                )}
                {/* Base64 & Download Direct Bar */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Lock className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>Temporary browser-held file data ({previewDoc.base64Data.length.toLocaleString()} characters)</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyBase64(previewDoc.base64Data)}
                      className="px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      {copiedBase64 ? 'Copied!' : 'Copy Base64'}
                    </button>
                    <button
                      onClick={() => handleDownload(previewDoc)}
                      className="px-2.5 py-1 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      Download .PDF
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
              <span>Authenticated document bound to Redeemer School Student Record: {student.studentId}</span>
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-3 py-1 font-bold text-slate-700 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Inspect Base64 String Modal */}
      {inspectDoc && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-purple-600" />
                  Base64 Encoded Document String Inspector
                </h3>
                <span className="text-slate-500 font-mono text-[11px]">
                  {inspectDoc.title} ({inspectDoc.fileName})
                </span>
              </div>
              <button onClick={() => setInspectDoc(null)} className="text-slate-400 font-bold cursor-pointer">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px]">
              <div>
                <span className="text-slate-500 block">Encoding Format:</span>
                <span className="font-mono font-bold text-slate-900">data:application/pdf;base64</span>
              </div>
              <div>
                <span className="text-slate-500 block">Character Length:</span>
                <span className="font-mono font-bold text-slate-900">{inspectDoc.base64Data.length.toLocaleString()} characters</span>
              </div>
              <div>
                <span className="text-slate-500 block">Linked Student ID:</span>
                <span className="font-mono font-bold text-blue-700">{inspectDoc.studentId}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Verification Status:</span>
                <span className={`font-semibold ${inspectDoc.verified ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {inspectDoc.verified ? 'Verified' : 'Pending Verification'}
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-700 text-[11px]">Base64 Data Preview:</span>
                <button
                  onClick={() => handleCopyBase64(inspectDoc.base64Data)}
                  className="text-[11px] font-semibold text-purple-700 hover:text-purple-900 flex items-center gap-1 cursor-pointer"
                >
                  {copiedBase64 ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      Copied Base64!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy Full Base64 String
                    </>
                  )}
                </button>
              </div>

              <textarea
                readOnly
                value={inspectDoc.base64Data}
                rows={6}
                className="w-full text-[10px] font-mono bg-slate-900 text-emerald-400 p-2.5 rounded-lg border border-slate-700 focus:outline-hidden"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setInspectDoc(null)}
                className="px-4 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Delete Confirmation */}
      {docToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full border border-slate-200 p-5 space-y-3 text-xs">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-slate-900 text-sm">Delete Document</h3>
            </div>
            <p className="text-slate-600">
              Are you sure you want to remove <strong className="text-slate-900">{docToDelete.title}</strong> ({docToDelete.fileName}) from student {student.firstName} {student.lastName}'s permanent record?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDocToDelete(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
              >
                Delete Document
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
