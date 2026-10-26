-- Eight ordered reporting columns support the school's two-semester report-card layout.
CREATE TABLE grade_reporting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 40),
  sort_order smallint NOT NULL CHECK (sort_order BETWEEN 1 AND 8),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, created_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, academic_year_id, sort_order),
  UNIQUE (school_id, id)
);

ALTER TABLE assessments ADD COLUMN reporting_period_id uuid;
ALTER TABLE assessments ADD CONSTRAINT assessments_reporting_period_fk
  FOREIGN KEY (school_id, reporting_period_id) REFERENCES grade_reporting_periods(school_id, id);
CREATE INDEX assessments_year_end_period_idx
  ON assessments (school_id, reporting_period_id, teacher_assignment_id, assessment_type)
  WHERE status = 'PUBLISHED';

CREATE TABLE year_end_assessment_weights (
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  assessment_type text NOT NULL CHECK (assessment_type IN ('ASSIGNMENT', 'QUIZ', 'TEST', 'EXAM')),
  weight_percent numeric(5,2) NOT NULL CHECK (weight_percent > 0 AND weight_percent <= 100),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, updated_by) REFERENCES user_accounts(school_id, id),
  PRIMARY KEY (school_id, academic_year_id, assessment_type)
);

CREATE INDEX year_end_assessment_weights_year_idx
  ON year_end_assessment_weights (school_id, academic_year_id);
