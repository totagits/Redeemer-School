-- Staging-gated foundation for private entrance-examination scheduling and result approval.
-- Never publish individual marks via public_school_posts or school announcements.
CREATE TABLE admission_entrance_exams (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 160),
 grade_label text NOT NULL CHECK (char_length(grade_label) BETWEEN 1 AND 100),
 mode text NOT NULL CHECK (mode IN ('PAPER','ONLINE','INTERVIEW')),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 venue text NOT NULL CHECK (char_length(venue) BETWEEN 1 AND 200),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SCHEDULED','CANCELLED','COMPLETED')),
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at>starts_at),
 FOREIGN KEY(school_id,created_by) REFERENCES user_accounts(school_id,id),
 UNIQUE(school_id,id)
);
CREATE INDEX admission_entrance_exams_schedule_idx ON admission_entrance_exams(school_id,starts_at);
CREATE TABLE admission_exam_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 exam_id uuid NOT NULL,
 application_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'INVITED' CHECK(status IN ('INVITED','ATTENDED','ABSENT','COMPLETED','EXCUSED')),
 score numeric(6,2) CHECK(score IS NULL OR (score BETWEEN 0 AND 100)),
 score_entered_by uuid,
 score_entered_at timestamptz,
 score_approved_by uuid,
 score_approved_at timestamptz,
 released_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,exam_id,application_id),
 FOREIGN KEY(school_id,exam_id) REFERENCES admission_entrance_exams(school_id,id) ON DELETE CASCADE,
 FOREIGN KEY(school_id,application_id) REFERENCES admission_applications(school_id,id),
 FOREIGN KEY(school_id,score_entered_by) REFERENCES user_accounts(school_id,id),
 FOREIGN KEY(school_id,score_approved_by) REFERENCES user_accounts(school_id,id),
 CHECK (score_approved_at IS NULL OR (score IS NOT NULL AND score_approved_by IS NOT NULL)),
 CHECK (released_at IS NULL OR score_approved_at IS NOT NULL)
);
CREATE INDEX admission_exam_assignments_app_idx ON admission_exam_assignments(school_id,application_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON admission_entrance_exams,admission_exam_assignments TO redeemer_runtime;
ALTER TABLE admission_entrance_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_entrance_exams FORCE ROW LEVEL SECURITY;
ALTER TABLE admission_exam_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_exam_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON admission_entrance_exams USING (school_id=app.current_school_id()) WITH CHECK (school_id=app.current_school_id());
CREATE POLICY tenant_school_scope ON admission_exam_assignments USING (school_id=app.current_school_id()) WITH CHECK (school_id=app.current_school_id());
