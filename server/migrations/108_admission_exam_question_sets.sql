-- Draft staging only. Candidate delivery uses an immutable leadership-approved snapshot.
CREATE TABLE admission_exam_question_sets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL,
 exam_id uuid NOT NULL,
 questions jsonb NOT NULL CHECK(jsonb_typeof(questions)='array' AND jsonb_array_length(questions) BETWEEN 1 AND 100),
 answer_keys jsonb NOT NULL CHECK(jsonb_typeof(answer_keys)='object'),
 published_by uuid NOT NULL,
 published_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,exam_id),
 UNIQUE(school_id,exam_id,id),
 FOREIGN KEY(school_id,exam_id) REFERENCES admission_entrance_exams(school_id,id),
 FOREIGN KEY(school_id,published_by) REFERENCES user_accounts(school_id,id)
);
GRANT SELECT,INSERT ON admission_exam_question_sets TO redeemer_runtime;
ALTER TABLE admission_exam_question_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_exam_question_sets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON admission_exam_question_sets
 USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id());
ALTER TABLE admission_exam_attempts ADD COLUMN question_set_id uuid;
ALTER TABLE admission_exam_attempts ADD CONSTRAINT admission_exam_attempt_question_set_fk
 FOREIGN KEY(school_id,exam_id,question_set_id) REFERENCES admission_exam_question_sets(school_id,exam_id,id);
