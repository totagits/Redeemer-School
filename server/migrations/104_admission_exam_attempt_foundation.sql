-- Migration 104: private entrance examination foundation; staging only after backup.
-- Requires migrations 102 and 103. No applicant-facing API is enabled by this migration.
CREATE TABLE admission_exam_questions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 exam_id uuid NOT NULL,
 prompt text NOT NULL CHECK (char_length(trim(prompt)) BETWEEN 3 AND 5000),
 question_type text NOT NULL CHECK (question_type IN ('SINGLE_CHOICE','SHORT_ANSWER')),
 options jsonb,
 answer_key jsonb NOT NULL,
 points numeric(7,2) NOT NULL CHECK (points > 0 AND points <= 100),
 sort_order integer NOT NULL CHECK (sort_order > 0),
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (school_id,exam_id,sort_order),
 UNIQUE (school_id,exam_id,id),
 FOREIGN KEY (school_id,exam_id) REFERENCES admission_entrance_exams(school_id,id) ON DELETE CASCADE,
 FOREIGN KEY (school_id,created_by) REFERENCES user_accounts(school_id,id),
 CHECK ((
   (question_type='SINGLE_CHOICE'
     AND jsonb_typeof(options)='array'
     AND jsonb_array_length(options) BETWEEN 2 AND 8
     AND jsonb_typeof(answer_key)='number'
     AND (answer_key #>> '{}') ~ '^[0-7]$'
     AND (answer_key #>> '{}')::integer < jsonb_array_length(options))
   OR
   (question_type='SHORT_ANSWER' AND options IS NULL
     AND jsonb_typeof(answer_key)='string')
 ) IS TRUE)
);
CREATE TABLE admission_exam_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 exam_id uuid NOT NULL,
 application_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'IN_PROGRESS' CHECK(status IN ('IN_PROGRESS','SUBMITTED','VOID')),
 started_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz,
 client_submission_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(submitted_at IS NULL OR submitted_at >= started_at),
 CHECK((status='SUBMITTED' AND submitted_at IS NOT NULL) OR (status<>'SUBMITTED' AND submitted_at IS NULL)),
 UNIQUE(school_id,exam_id,application_id),
 UNIQUE(school_id,exam_id,id),
 FOREIGN KEY(school_id,exam_id,application_id) REFERENCES admission_exam_assignments(school_id,exam_id,application_id)
);
CREATE TABLE admission_exam_answers (
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 exam_id uuid NOT NULL,
 attempt_id uuid NOT NULL,
 question_id uuid NOT NULL,
 answer jsonb NOT NULL CHECK(jsonb_typeof(answer) IN ('string','number')),
 saved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(school_id,attempt_id,question_id),
 FOREIGN KEY(school_id,exam_id,attempt_id) REFERENCES admission_exam_attempts(school_id,exam_id,id) ON DELETE CASCADE,
 FOREIGN KEY(school_id,exam_id,question_id) REFERENCES admission_exam_questions(school_id,exam_id,id)
);
CREATE INDEX admission_exam_attempts_school_status_idx ON admission_exam_attempts(school_id,exam_id,status);
GRANT SELECT,INSERT,UPDATE,DELETE ON admission_exam_questions,admission_exam_attempts,admission_exam_answers TO redeemer_runtime;
ALTER TABLE admission_exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_exam_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE admission_exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_exam_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE admission_exam_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_exam_answers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON admission_exam_questions USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
CREATE POLICY tenant_school_scope ON admission_exam_attempts USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
CREATE POLICY tenant_school_scope ON admission_exam_answers USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
