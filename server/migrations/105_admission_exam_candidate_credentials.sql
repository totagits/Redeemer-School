-- Migration 105: scoped entrance-exam candidate credential storage.
-- Requires reviewed migrations 102-104. No credential issuance or login endpoints yet.
-- Never store plaintext exam credentials; use HMAC/SHA-256 token hashes generated from
-- cryptographically random 32-byte secrets, with rate-limited redemption in later API.
CREATE TABLE admission_exam_candidate_credentials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 exam_id uuid NOT NULL,
 application_id uuid NOT NULL,
 token_hash char(64) NOT NULL,
 issued_by uuid NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 redeemed_at timestamptz,
 revoked_at timestamptz,
 CHECK(expires_at>issued_at),
 CHECK(redeemed_at IS NULL OR redeemed_at >= issued_at),
 UNIQUE(school_id,token_hash),
 FOREIGN KEY(school_id,exam_id,application_id)
   REFERENCES admission_exam_assignments(school_id,exam_id,application_id),
 FOREIGN KEY(school_id,issued_by) REFERENCES user_accounts(school_id,id)
);
CREATE UNIQUE INDEX admission_exam_active_credential_idx
 ON admission_exam_candidate_credentials(school_id,exam_id,application_id)
 WHERE revoked_at IS NULL AND redeemed_at IS NULL;
CREATE INDEX admission_exam_credentials_expiry_idx
 ON admission_exam_candidate_credentials(school_id,expires_at);
GRANT SELECT,INSERT,UPDATE,DELETE ON admission_exam_candidate_credentials TO redeemer_runtime;
ALTER TABLE admission_exam_candidate_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_exam_candidate_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON admission_exam_candidate_credentials
 USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
