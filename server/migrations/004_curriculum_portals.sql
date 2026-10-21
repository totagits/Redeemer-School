-- Grade-level curriculum, resource catalogue and learner-to-login mapping.
CREATE TABLE grade_curriculum_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  grade_level_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  academic_term_id uuid,
  weekly_minutes integer NOT NULL CHECK (weekly_minutes BETWEEN 1 AND 3000),
  periods_per_week integer NOT NULL CHECK (periods_per_week BETWEEN 1 AND 50),
  required boolean NOT NULL DEFAULT true,
  learning_objectives text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id),
  FOREIGN KEY (school_id, grade_level_id) REFERENCES grade_levels(school_id, id),
  FOREIGN KEY (school_id, subject_id) REFERENCES subjects(school_id, id),
  FOREIGN KEY (school_id, academic_term_id) REFERENCES academic_terms(school_id, id),
  FOREIGN KEY (school_id, created_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);
CREATE UNIQUE INDEX grade_curriculum_subject_unique_idx ON grade_curriculum_subjects
  (school_id, academic_year_id, grade_level_id, subject_id, COALESCE(academic_term_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE curriculum_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  curriculum_subject_id uuid NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('TEXTBOOK', 'BOOK', 'WORKBOOK', 'TEACHING_MATERIAL', 'LINK', 'OTHER')),
  title text NOT NULL,
  author text,
  publisher text,
  isbn text,
  edition text,
  description text,
  resource_url text,
  storage_key text,
  required boolean NOT NULL DEFAULT false,
  visible_to_students boolean NOT NULL DEFAULT true,
  visible_to_guardians boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, curriculum_subject_id) REFERENCES grade_curriculum_subjects(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, created_by) REFERENCES user_accounts(school_id, id),
  CHECK (resource_url IS NULL OR resource_url ~ '^https://'),
  CHECK (resource_url IS NOT NULL OR storage_key IS NOT NULL OR resource_type IN ('TEXTBOOK', 'BOOK', 'WORKBOOK', 'OTHER')),
  UNIQUE (school_id, id)
);

CREATE TABLE student_portal_links (
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  user_id uuid NOT NULL,
  linked_by uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, student_id),
  UNIQUE (school_id, user_id),
  FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, user_id) REFERENCES user_accounts(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, linked_by) REFERENCES user_accounts(school_id, id)
);

INSERT INTO permissions (code, description) VALUES
  ('curriculum.read', 'View grade curriculum and assigned learning resources'),
  ('curriculum.manage', 'Configure grade curriculum, subject time and resources'),
  ('timetable.read', 'View class timetables in assigned or linked scope'),
  ('timetable.manage', 'Manage periods and assigned class schedules'),
  ('student.portal.read', 'View the signed-in learner own portal'),
  ('guardian.portal.read', 'View linked learners allowed by guardian relationship')
ON CONFLICT (code) DO NOTHING;

WITH grants(role_code, permission_code) AS (VALUES
  ('SCHOOL_ADMIN', 'curriculum.read'), ('SCHOOL_ADMIN', 'curriculum.manage'), ('SCHOOL_ADMIN', 'timetable.read'), ('SCHOOL_ADMIN', 'timetable.manage'),
  ('CAMPUS_ADMIN', 'curriculum.read'), ('CAMPUS_ADMIN', 'curriculum.manage'), ('CAMPUS_ADMIN', 'timetable.read'), ('CAMPUS_ADMIN', 'timetable.manage'),
  ('PRINCIPAL', 'curriculum.read'), ('PRINCIPAL', 'curriculum.manage'), ('PRINCIPAL', 'timetable.read'), ('PRINCIPAL', 'timetable.manage'),
  ('DEPARTMENT_HEAD', 'curriculum.read'), ('DEPARTMENT_HEAD', 'curriculum.manage'), ('DEPARTMENT_HEAD', 'timetable.read'),
  ('TEACHER', 'curriculum.read'), ('TEACHER', 'timetable.read'),
  ('STUDENT', 'student.portal.read'), ('STUDENT', 'curriculum.read'), ('STUDENT', 'timetable.read'), ('STUDENT', 'attendance.read'),
  ('PARENT', 'guardian.portal.read'), ('PARENT', 'curriculum.read'), ('PARENT', 'timetable.read'), ('PARENT', 'attendance.read')
)
INSERT INTO role_permissions (school_id, role_id, permission_code)
SELECT r.school_id, r.id, g.permission_code
FROM school_roles r JOIN grants g ON g.role_code = r.code
ON CONFLICT (school_id, role_id, permission_code) DO NOTHING;

-- Migration 003 grants only tables existing when it is first applied. Grant and
-- force tenant isolation explicitly for these newly introduced tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON grade_curriculum_subjects, curriculum_resources, student_portal_links TO redeemer_runtime;
ALTER TABLE grade_curriculum_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_curriculum_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON grade_curriculum_subjects
  USING (school_id = app.current_school_id()) WITH CHECK (school_id = app.current_school_id());
ALTER TABLE curriculum_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_resources FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON curriculum_resources
  USING (school_id = app.current_school_id()) WITH CHECK (school_id = app.current_school_id());
ALTER TABLE student_portal_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_portal_links FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_school_scope ON student_portal_links
  USING (school_id = app.current_school_id()) WITH CHECK (school_id = app.current_school_id());
