CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Africa/Monrovia',
  default_currency char(3) NOT NULL DEFAULT 'LRD' CHECK (default_currency IN ('LRD', 'USD')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, code),
  UNIQUE (school_id, id)
);

CREATE TABLE user_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  campus_id uuid,
  email text NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN (
    'SCHOOL_ADMIN', 'CAMPUS_ADMIN', 'TEACHER', 'REGISTRAR', 'FINANCE',
    'HR_MANAGER', 'INVENTORY_MANAGER', 'PARENT', 'STUDENT', 'AUDITOR'
  )),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INVITED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, campus_id) REFERENCES campuses(school_id, id),
  UNIQUE (school_id, id)
);

CREATE UNIQUE INDEX user_accounts_school_email_unique ON user_accounts (school_id, lower(email));

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, user_id) REFERENCES user_accounts(school_id, id) ON DELETE CASCADE
);

CREATE INDEX auth_sessions_expiry_idx ON auth_sessions (expires_at);

CREATE TABLE academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'ACTIVE', 'CLOSED')),
  CHECK (ends_on > starts_on),
  UNIQUE (school_id, id),
  UNIQUE (school_id, name)
);

CREATE TABLE subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (school_id, id),
  UNIQUE (school_id, code)
);

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  campus_id uuid,
  student_number text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('APPLICANT', 'ACTIVE', 'WITHDRAWN', 'GRADUATED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, campus_id) REFERENCES campuses(school_id, id),
  UNIQUE (school_id, id),
  UNIQUE (school_id, student_number)
);

CREATE TABLE class_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  campus_id uuid,
  academic_year_id uuid NOT NULL,
  name text NOT NULL,
  grade_level text NOT NULL,
  section text NOT NULL,
  FOREIGN KEY (school_id, campus_id) REFERENCES campuses(school_id, id),
  FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id),
  UNIQUE (school_id, id),
  UNIQUE (school_id, academic_year_id, name)
);

CREATE TABLE class_enrollments (
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  class_group_id uuid NOT NULL,
  enrolled_on date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'WITHDRAWN', 'COMPLETED')),
  PRIMARY KEY (school_id, student_id, class_group_id),
  FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, class_group_id) REFERENCES class_groups(school_id, id) ON DELETE CASCADE
);

CREATE TABLE teacher_profiles (
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  employee_number text NOT NULL,
  employment_type text NOT NULL CHECK (employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'HOURLY')),
  hired_on date,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (school_id, user_id),
  FOREIGN KEY (school_id, user_id) REFERENCES user_accounts(school_id, id) ON DELETE CASCADE,
  UNIQUE (school_id, employee_number)
);

CREATE TABLE teacher_subject_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  class_group_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  assigned_by uuid NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  FOREIGN KEY (school_id, teacher_id) REFERENCES teacher_profiles(school_id, user_id),
  FOREIGN KEY (school_id, subject_id) REFERENCES subjects(school_id, id),
  FOREIGN KEY (school_id, class_group_id) REFERENCES class_groups(school_id, id),
  FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id),
  FOREIGN KEY (school_id, assigned_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  teacher_assignment_id uuid NOT NULL,
  scheduled_at timestamptz NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  topic text,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  FOREIGN KEY (school_id, teacher_assignment_id) REFERENCES teacher_subject_assignments(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE student_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_session_id uuid NOT NULL,
  student_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')),
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  note text,
  FOREIGN KEY (school_id, class_session_id) REFERENCES class_sessions(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id),
  FOREIGN KEY (school_id, recorded_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, class_session_id, student_id)
);

CREATE TABLE teaching_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  teacher_assignment_id uuid NOT NULL,
  created_by uuid NOT NULL,
  title text NOT NULL,
  description text,
  material_type text NOT NULL CHECK (material_type IN ('LESSON_PLAN', 'HANDOUT', 'PRESENTATION', 'HOMEWORK', 'LINK', 'OTHER')),
  storage_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, teacher_assignment_id) REFERENCES teacher_subject_assignments(school_id, id),
  FOREIGN KEY (school_id, created_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  teacher_assignment_id uuid NOT NULL,
  created_by uuid NOT NULL,
  title text NOT NULL,
  assessment_type text NOT NULL CHECK (assessment_type IN ('QUIZ', 'TEST', 'EXAM', 'ASSIGNMENT', 'PROJECT')),
  max_score numeric(6,2) NOT NULL DEFAULT 100 CHECK (max_score > 0),
  opens_at timestamptz,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED', 'SUBMITTED_FOR_REVIEW', 'APPROVED', 'PUBLISHED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, teacher_assignment_id) REFERENCES teacher_subject_assignments(school_id, id),
  FOREIGN KEY (school_id, created_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE assessment_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  student_id uuid NOT NULL,
  score numeric(7,2) NOT NULL CHECK (score >= 0),
  feedback text,
  entered_by uuid NOT NULL,
  moderated_by uuid,
  moderated_at timestamptz,
  published_at timestamptz,
  FOREIGN KEY (school_id, assessment_id) REFERENCES assessments(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id),
  FOREIGN KEY (school_id, entered_by) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, moderated_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, assessment_id, student_id)
);

CREATE TABLE grading_policies (
  school_id uuid PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  fail_min numeric(5,2) NOT NULL DEFAULT 1 CHECK (fail_min >= 0 AND fail_min <= 100),
  fail_max numeric(5,2) NOT NULL DEFAULT 60 CHECK (fail_max >= 0 AND fail_max <= 100),
  pass_min numeric(5,2) NOT NULL DEFAULT 70 CHECK (pass_min >= 0 AND pass_min <= 100),
  gap_handling text NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK (gap_handling IN ('REVIEW_REQUIRED', 'FAIL', 'PASS', 'CUSTOM')),
  active_from date NOT NULL DEFAULT CURRENT_DATE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fail_min <= fail_max AND fail_max < pass_min)
);

CREATE TABLE teacher_work_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  assigned_by uuid NOT NULL,
  title text NOT NULL,
  instructions text NOT NULL,
  due_at timestamptz,
  rubric jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'REVIEWED', 'RETURNED')),
  submitted_at timestamptz,
  review_score numeric(5,2) CHECK (review_score >= 0 AND review_score <= 100),
  reviewer_feedback text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, teacher_id) REFERENCES teacher_profiles(school_id, user_id),
  FOREIGN KEY (school_id, assigned_by) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, reviewed_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE staff_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  work_assignment_id uuid,
  entry_type text NOT NULL CHECK (entry_type IN ('CLOCK_IN', 'CLOCK_OUT', 'TASK_START', 'TASK_STOP', 'BREAK_START', 'BREAK_END')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'WEB' CHECK (source IN ('WEB', 'MOBILE', 'ADMIN_CORRECTION', 'BIOMETRIC')),
  note text,
  corrected_by uuid,
  correction_reason text,
  FOREIGN KEY (school_id, teacher_id) REFERENCES teacher_profiles(school_id, user_id),
  FOREIGN KEY (school_id, work_assignment_id) REFERENCES teacher_work_assignments(school_id, id),
  FOREIGN KEY (school_id, corrected_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id),
  CHECK ((corrected_by IS NULL) = (correction_reason IS NULL))
);

CREATE INDEX staff_time_entries_teacher_time_idx ON staff_time_entries (school_id, teacher_id, occurred_at DESC);

CREATE TABLE compensation_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  basis text NOT NULL CHECK (basis IN ('MONTHLY_SALARY', 'APPROVED_HOURLY', 'PER_ASSIGNMENT')),
  currency char(3) NOT NULL CHECK (currency IN ('LRD', 'USD')),
  rate numeric(12,2) NOT NULL CHECK (rate >= 0),
  effective_from date NOT NULL,
  effective_to date,
  approved_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  FOREIGN KEY (school_id, teacher_id) REFERENCES teacher_profiles(school_id, user_id),
  FOREIGN KEY (school_id, approved_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  actor_user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, actor_user_id) REFERENCES user_accounts(school_id, id)
);

CREATE INDEX audit_events_school_time_idx ON audit_events (school_id, occurred_at DESC);
