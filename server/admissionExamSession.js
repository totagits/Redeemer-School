import { hashCandidateSecret } from './admissionExamCredential.js';
import { examEligibility, examSittingWindow } from './admissionExamAccess.js';

// Read-only database validator, intended for use by future authenticated exam routes.
// The caller must run this inside a tenant-scoped transaction, obtain the bearer token
// only from a secure HttpOnly cookie, and enforce CSRF on all writes.
export async function validateCandidateExamSession(client,{schoolId,examId,sessionToken,now=new Date()}) {
  const hash=hashCandidateSecret(sessionToken);
  if(!schoolId||!examId||!hash) return {ok:false,reason:'INVALID_SESSION'};
  const result=await client.query(`SELECT s.id,s.application_id,s.expires_at,s.revoked_at,
      e.status AS exam_status,e.mode AS exam_mode,e.starts_at,e.ends_at,
      a.status AS assignment_status,app.status AS application_status,
      c.redeemed_at AS credential_redeemed_at,c.revoked_at AS credential_revoked_at,
      f.amount AS fee_amount,f.currency AS fee_currency,
      settled.kind AS settlement_kind,settled.channel AS settlement_channel,
      settled.amount AS settlement_amount,settled.currency AS settlement_currency,
      settled.reason AS settlement_reason,settled.verified_at AS settlement_verified_at
    FROM admission_exam_candidate_sessions s
    JOIN admission_entrance_exams e ON e.school_id=s.school_id AND e.id=s.exam_id
    JOIN admission_exam_assignments a ON a.school_id=s.school_id AND a.exam_id=s.exam_id
      AND a.application_id=s.application_id
    JOIN admission_applications app ON app.school_id=s.school_id AND app.id=s.application_id
    JOIN admission_exam_candidate_credentials c ON c.school_id=s.school_id
      AND c.exam_id=s.exam_id AND c.application_id=s.application_id AND c.id=s.credential_id
    LEFT JOIN admission_exam_fee_schedules f ON f.school_id=s.school_id AND f.exam_id=s.exam_id
    LEFT JOIN admission_exam_fee_settlements settled ON settled.school_id=s.school_id
      AND settled.exam_id=s.exam_id AND settled.application_id=s.application_id
    WHERE s.school_id=$1 AND s.exam_id=$2 AND s.session_hash=$3
    LIMIT 1 FOR SHARE OF s,e,a,app,c`,[schoolId,examId,hash]);
  const row=result.rows[0];
  if(!row) return {ok:false,reason:'INVALID_SESSION'};
  const current=new Date(now).valueOf(),expiry=new Date(row.expires_at).valueOf();
  if(!Number.isFinite(current)||!Number.isFinite(expiry)||row.revoked_at||current>=expiry)
    return {ok:false,reason:'SESSION_EXPIRED'};
  if(!row.credential_redeemed_at||row.credential_revoked_at)
    return {ok:false,reason:'CREDENTIAL_NOT_ACTIVE'};
  if(row.exam_mode!=='ONLINE')return {ok:false,reason:'EXAM_NOT_ONLINE'};
  const eligibility=examEligibility({exam:{status:row.exam_status},application:{status:row.application_status},
    assignment:{status:row.assignment_status},
    fee:row.fee_amount==null?null:{amount:row.fee_amount,currency:row.fee_currency},
    settlement:row.settlement_kind?{kind:row.settlement_kind,channel:row.settlement_channel,
      amount:row.settlement_amount,currency:row.settlement_currency,reason:row.settlement_reason,
      verified_at:row.settlement_verified_at}:null});
  if(!eligibility.allowed)return {ok:false,reason:eligibility.reason};
  const time=examSittingWindow({status:row.exam_status,starts_at:row.starts_at,ends_at:row.ends_at},now);
  if(!time.allowed)return {ok:false,reason:time.reason};
  return {ok:true,sessionId:row.id,applicationId:row.application_id,examId,endsAt:time.endsAt};
}
