import { hashCandidateSecret } from './admissionExamCredential.js';
import { examSittingWindow } from './admissionExamAccess.js';

// Read-only database validator, intended for use by future authenticated exam routes.
// The caller must run this inside a tenant-scoped transaction, obtain the bearer token
// only from a secure HttpOnly cookie, and enforce CSRF on all writes.
export async function validateCandidateExamSession(client,{schoolId,examId,sessionToken,now=new Date()}) {
  const hash=hashCandidateSecret(sessionToken);
  if(!schoolId||!examId||!hash) return {ok:false,reason:'INVALID_SESSION'};
  const result=await client.query(`SELECT s.id,s.application_id,s.expires_at,s.revoked_at,
      e.status AS exam_status,e.starts_at,e.ends_at,
      a.status AS assignment_status,app.status AS application_status,
      c.redeemed_at AS credential_redeemed_at,c.revoked_at AS credential_revoked_at
    FROM admission_exam_candidate_sessions s
    JOIN admission_entrance_exams e ON e.school_id=s.school_id AND e.id=s.exam_id
    JOIN admission_exam_assignments a ON a.school_id=s.school_id AND a.exam_id=s.exam_id
      AND a.application_id=s.application_id
    JOIN admission_applications app ON app.school_id=s.school_id AND app.id=s.application_id
    JOIN admission_exam_candidate_credentials c ON c.school_id=s.school_id
      AND c.exam_id=s.exam_id AND c.application_id=s.application_id AND c.id=s.credential_id
    WHERE s.school_id=$1 AND s.exam_id=$2 AND s.session_hash=$3
    LIMIT 1`,[schoolId,examId,hash]);
  const row=result.rows[0];
  if(!row) return {ok:false,reason:'INVALID_SESSION'};
  const current=new Date(now).valueOf(),expiry=new Date(row.expires_at).valueOf();
  if(!Number.isFinite(current)||!Number.isFinite(expiry)||row.revoked_at||current>=expiry)
    return {ok:false,reason:'SESSION_EXPIRED'};
  if(!row.credential_redeemed_at||row.credential_revoked_at)
    return {ok:false,reason:'CREDENTIAL_NOT_ACTIVE'};
  if(row.application_status==='WITHDRAWN'||row.application_status==='REJECTED'||row.application_status==='ENROLLED')
    return {ok:false,reason:'APPLICATION_INACTIVE'};
  if(row.assignment_status!=='INVITED')
    return {ok:false,reason:'ASSIGNMENT_NOT_ACTIVE'};
  const time=examSittingWindow({status:row.exam_status,starts_at:row.starts_at,ends_at:row.ends_at},now);
  if(!time.allowed)return {ok:false,reason:time.reason};
  return {ok:true,sessionId:row.id,applicationId:row.application_id,examId,endsAt:time.endsAt};
}
