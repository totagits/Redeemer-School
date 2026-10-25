-- Encrypted remote parent/guardian photo submissions. These are NOT approved learner portraits.
CREATE TABLE portal_photo_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 student_id uuid NOT NULL,
 guardian_id uuid NOT NULL,
 submitted_by uuid NOT NULL,
 subject_type text NOT NULL CHECK(subject_type IN ('STUDENT','GUARDIAN')),
 media_type text NOT NULL CHECK(media_type IN ('image/jpeg','image/png')),
 original_filename text NOT NULL,
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 3145728),
 checksum_sha256 text NOT NULL,
 file_content bytea NOT NULL,
 content_nonce bytea NOT NULL,
 content_auth_tag bytea NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 submitted_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid,
 reviewed_at timestamptz,
 review_note text,
 approved_document_id uuid,
 FOREIGN KEY (school_id,student_id) REFERENCES students(school_id,id) ON DELETE CASCADE,
 FOREIGN KEY (school_id,guardian_id) REFERENCES guardians(school_id,id),
 FOREIGN KEY (school_id,submitted_by) REFERENCES user_accounts(school_id,id),
 FOREIGN KEY (school_id,reviewed_by) REFERENCES user_accounts(school_id,id),
 UNIQUE(school_id,id)
);
CREATE INDEX portal_photo_submissions_queue ON portal_photo_submissions(school_id,status,submitted_at DESC);
CREATE INDEX portal_photo_submissions_student ON portal_photo_submissions(school_id,student_id,submitted_at DESC);
ALTER TABLE portal_photo_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_photo_submissions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON portal_photo_submissions
 USING(school_id=app.current_school_id())
 WITH CHECK(school_id=app.current_school_id());
GRANT SELECT,INSERT,UPDATE ON portal_photo_submissions TO redeemer_runtime;
