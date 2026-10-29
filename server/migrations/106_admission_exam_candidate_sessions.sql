-- Migration 106: candidate examination session foundation (not a login endpoint).
-- Apply only to isolated staging after review and verified backup; depends on 102-105.
CREATE TABLE admission_exam_candidate_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 exam_id uuid NOT NULL,
 application_id uuid NOT NULL,
 credential_id uuid NOT NULL,
 session_hash char(64) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CHECK (expires_at > created_at),
 UNIQUE(school_id,session_hash),
 FOREIGN KEY(school_id,exam_id,application_id)
   REFERENCES admission_exam_assignments(school_id,exam_id,application_id),
 FOREIGN KEY(credential_id) REFERENCES admission_exam_candidate_credentials(id)
);
CREATE UNIQUE INDEX admission_exam_active_session_per_applicant
 ON admission_exam_candidate_sessions(school_id,exam_id,application_id)
 WHERE revoked_at IS NULL;
CREATE INDEX admission_exam_sessions_expiry_idx
 ON admission_exam_candidate_sessions(school_id,expires_at);
GRANT SELECT,INSERT,UPDATE,DELETE ON admission_exam_candidate_sessions TO redeemer_runtime;
ALTER TABLE admission_exam_candidate_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_exam_candidate_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON admission_exam_candidate_sessions
 USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
