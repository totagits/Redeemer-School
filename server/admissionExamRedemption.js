// Transaction-oriented redemption helper. Caller must supply a tenant-scoped DB
// transaction, an independently verified applicant identity, and a rate limit.
// Never return a token or question answer key from this module.
import { issueCandidateSecret, hashCandidateSecret, credentialUsable } from './admissionExamCredential.js';
import { examEligibility, examSittingWindow } from './admissionExamAccess.js';

export async function redeemExamCredential(client, { schoolId, examId, applicationId, token, now = new Date() }) {
  const tokenHash = hashCandidateSecret(token);
  if (!tokenHash || !schoolId || !examId || !applicationId) return { ok: false, reason: 'INVALID_CREDENTIAL' };
  // Lock the credential to serialize parallel redemption. Call within BEGIN/COMMIT.
  const record = await client.query(`SELECT c.id,c.issued_at,c.expires_at,c.revoked_at,c.redeemed_at,
      e.status AS exam_status,e.mode AS exam_mode,e.starts_at,e.ends_at,
      a.status AS assignment_status,app.status AS application_status,
      f.amount AS fee_amount,f.currency AS fee_currency,
      s.kind AS settlement_kind,s.channel AS settlement_channel,
      s.amount AS settlement_amount,s.currency AS settlement_currency,
      s.reason AS settlement_reason,s.verified_at AS settlement_verified_at
    FROM admission_exam_candidate_credentials c
    JOIN admission_entrance_exams e ON e.school_id=c.school_id AND e.id=c.exam_id
    JOIN admission_exam_assignments a ON a.school_id=c.school_id AND a.exam_id=c.exam_id AND a.application_id=c.application_id
    JOIN admission_applications app ON app.school_id=c.school_id AND app.id=c.application_id
    LEFT JOIN admission_exam_fee_schedules f ON f.school_id=c.school_id AND f.exam_id=c.exam_id
    LEFT JOIN admission_exam_fee_settlements s ON s.school_id=c.school_id AND s.exam_id=c.exam_id AND s.application_id=c.application_id
    WHERE c.school_id=$1 AND c.exam_id=$2 AND c.application_id=$3 AND c.token_hash=$4
    FOR UPDATE OF c`,[schoolId,examId,applicationId,tokenHash]);
  if (record.rowCount !== 1) return {ok:false,reason:'INVALID_CREDENTIAL'};
  const c=record.rows[0];
  if(!credentialUsable(c,now)) return {ok:false,reason:'CREDENTIAL_EXPIRED_OR_USED'};
  if(c.exam_mode!=='ONLINE')return {ok:false,reason:'EXAM_NOT_ONLINE'};
  const eligibility=examEligibility({
    exam:{status:c.exam_status},
    application:{status:c.application_status},
    assignment:{status:c.assignment_status},
    fee:c.fee_amount==null?null:{amount:c.fee_amount,currency:c.fee_currency},
    settlement:c.settlement_kind?{kind:c.settlement_kind,channel:c.settlement_channel,
      amount:c.settlement_amount,currency:c.settlement_currency,reason:c.settlement_reason,
      verified_at:c.settlement_verified_at}:null,
  });
  if(!eligibility.allowed)return {ok:false,reason:'NOT_ELIGIBLE'};
  const window=examSittingWindow({status:c.exam_status,starts_at:c.starts_at,ends_at:c.ends_at},now);
  if(!window.allowed)return {ok:false,reason:window.reason};
  const secret=issueCandidateSecret();
  const inserted=await client.query(`INSERT INTO admission_exam_candidate_sessions
    (school_id,exam_id,application_id,credential_id,session_hash,expires_at)
    SELECT $1,$2,$3,$4,$5,$6 WHERE NOT EXISTS(
      SELECT 1 FROM admission_exam_candidate_sessions
      WHERE school_id=$1 AND exam_id=$2 AND application_id=$3 AND revoked_at IS NULL)
    RETURNING id,expires_at`,[schoolId,examId,applicationId,c.id,secret.tokenHash,c.ends_at]);
  if(inserted.rowCount!==1)return {ok:false,reason:'SESSION_ALREADY_EXISTS'};
  const used=await client.query(`UPDATE admission_exam_candidate_credentials
    SET redeemed_at=$5 WHERE school_id=$1 AND exam_id=$2 AND application_id=$3 AND id=$4
    AND redeemed_at IS NULL AND revoked_at IS NULL RETURNING id`,
    [schoolId,examId,applicationId,c.id,now]);
  if(used.rowCount!==1) throw new Error('Credential redemption concurrency conflict');
  return {ok:true,sessionId:inserted.rows[0].id,sessionToken:secret.token,
    expiresAt:inserted.rows[0].expires_at};
}
