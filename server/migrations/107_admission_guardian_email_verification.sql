-- Draft staging foundation. No email is sent and no public endpoint is enabled.
CREATE TABLE admission_guardian_email_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL,
 application_id uuid NOT NULL,
 guardian_first_name text NOT NULL,
 guardian_last_name text NOT NULL,
 guardian_relationship text NOT NULL,
 email text NOT NULL CHECK(email=lower(btrim(email)) AND char_length(email)<=254),
 token_hash char(64) NOT NULL CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 requested_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 verified_at timestamptz,
 revoked_at timestamptz,
 CHECK(expires_at>created_at),
 CHECK(verified_at IS NULL OR (verified_at>=created_at AND verified_at<expires_at)),
 UNIQUE(school_id,token_hash),
 UNIQUE(school_id,application_id,id),
 FOREIGN KEY(school_id,application_id,guardian_first_name,guardian_last_name,guardian_relationship)
   REFERENCES admission_guardians(school_id,application_id,first_name,last_name,relationship) ON DELETE CASCADE,
 FOREIGN KEY(school_id,requested_by) REFERENCES user_accounts(school_id,id)
);
CREATE INDEX admission_guardian_verified_email_idx
 ON admission_guardian_email_verifications(school_id,application_id,email) WHERE verified_at IS NOT NULL AND revoked_at IS NULL;
GRANT SELECT,INSERT,UPDATE ON admission_guardian_email_verifications TO redeemer_runtime;
ALTER TABLE admission_guardian_email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_guardian_email_verifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON admission_guardian_email_verifications
 USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());

ALTER TABLE admission_exam_candidate_credentials ADD COLUMN guardian_verification_id uuid;
ALTER TABLE admission_exam_candidate_credentials ADD CONSTRAINT admission_exam_verified_guardian_fk
 FOREIGN KEY(school_id,application_id,guardian_verification_id)
 REFERENCES admission_guardian_email_verifications(school_id,application_id,id);
