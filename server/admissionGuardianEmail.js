import { issueCandidateSecret, hashCandidateSecret } from './admissionExamCredential.js';

// Internal transaction helpers only. HTTP callers must authenticate staff requests,
// enforce CSRF/rate limits and deliver the returned token privately to the stored
// guardian address. Never accept a replacement recipient from a public request.
export async function createGuardianEmailChallenge(client, {schoolId,applicationId,firstName,lastName,relationship,requestedBy}) {
  // Serialize all guardian sends for an application, including parallel requests
  // for different guardians on the same application.
  await client.query('SELECT id FROM admission_applications WHERE school_id=$1 AND id=$2 FOR UPDATE',[schoolId,applicationId]);
  await client.query(`SELECT school_id FROM admission_guardians WHERE school_id=$1 AND application_id=$2
    AND first_name=$3 AND last_name=$4 AND relationship=$5 FOR UPDATE`,[schoolId,applicationId,firstName,lastName,relationship]);
  const secret=issueCandidateSecret();
  const result=await client.query(`INSERT INTO admission_guardian_email_verifications
    (school_id,application_id,guardian_first_name,guardian_last_name,guardian_relationship,email,token_hash,requested_by,expires_at)
    SELECT g.school_id,g.application_id,g.first_name,g.last_name,g.relationship,
      lower(btrim(g.email)),$6,$7,now()+interval '30 minutes'
    FROM admission_guardians g
    WHERE g.school_id=$1 AND g.application_id=$2 AND g.first_name=$3 AND g.last_name=$4 AND g.relationship=$5
      AND (SELECT count(*) FROM admission_guardian_email_verifications v WHERE v.school_id=g.school_id
        AND v.application_id=g.application_id AND v.created_at>now()-interval '15 minutes')<3
      AND char_length(btrim(g.email)) BETWEEN 3 AND 254
      AND btrim(g.email) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    RETURNING id,email,expires_at`,[schoolId,applicationId,firstName,lastName,relationship,secret.tokenHash,requestedBy]);
  if(result.rowCount!==1)return {ok:false,reason:'GUARDIAN_EMAIL_UNAVAILABLE'};
  return {ok:true,id:result.rows[0].id,email:result.rows[0].email,expiresAt:result.rows[0].expires_at,token:secret.token};
}

// Atomically consume a mailbox-verification token. The school must be resolved
// server-side. This proves mailbox control, not legal guardianship or admission.
export async function verifyGuardianEmail(client,{schoolId,token}) {
  const hash=hashCandidateSecret(token);
  if(!schoolId||!hash)return {ok:false};
  const result=await client.query(`UPDATE admission_guardian_email_verifications v SET verified_at=now()
    FROM admission_guardians g
    WHERE v.school_id=$1 AND v.token_hash=$2 AND v.verified_at IS NULL AND v.revoked_at IS NULL
      AND v.created_at<=now() AND v.expires_at>now()
      AND g.school_id=v.school_id AND g.application_id=v.application_id
      AND g.first_name=v.guardian_first_name AND g.last_name=v.guardian_last_name AND g.relationship=v.guardian_relationship
      AND lower(btrim(g.email))=v.email RETURNING v.id`,[schoolId,hash]);
  return {ok:result.rowCount===1};
}

export async function findVerifiedGuardianEmail(client,{schoolId,applicationId,email}) {
  if(typeof email!=='string')return null;
  const result=await client.query(`SELECT v.id,v.email FROM admission_guardian_email_verifications v
    JOIN admission_guardians g ON g.school_id=v.school_id AND g.application_id=v.application_id
      AND g.first_name=v.guardian_first_name AND g.last_name=v.guardian_last_name AND g.relationship=v.guardian_relationship
      AND lower(btrim(g.email))=v.email
    WHERE v.school_id=$1 AND v.application_id=$2 AND v.email=$3
      AND v.verified_at IS NOT NULL AND v.revoked_at IS NULL
      AND v.verified_at>=now()-interval '30 days'
    ORDER BY v.verified_at DESC LIMIT 1 FOR SHARE OF g,v`,[schoolId,applicationId,email.trim().toLowerCase()]);
  return result.rows[0]||null;
}
