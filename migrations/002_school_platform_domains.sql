-- Additive domain schema for the Liberia Private-School Operations Platform.
-- 001_school_operations_foundation.sql remains the base migration.
-- File contents and provider secrets belong in private object storage / a secret manager,
-- never in these tables or source control.

CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO PUBLIC;

CREATE OR REPLACE FUNCTION app.current_school_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  configured_id text;
BEGIN
  configured_id := NULLIF(current_setting('app.current_school_id', true), '');
  IF configured_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN configured_id::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION app.current_school_id() TO PUBLIC;

-- School identity and configuration. Ministry identifiers remain optional external IDs.
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS school_type text,
  ADD COLUMN IF NOT EXISTS ownership_type text,
  ADD COLUMN IF NOT EXISTS moe_school_emis_code text,
  ADD COLUMN IF NOT EXISTS permit_status text,
  ADD COLUMN IF NOT EXISTS permit_number text,
  ADD COLUMN IF NOT EXISTS permit_issued_on date,
  ADD COLUMN IF NOT EXISTS permit_expires_on date,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS county text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS logo_storage_key text,
  ADD COLUMN IF NOT EXISTS brand_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retention_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS schools_moe_emis_code_unique
  ON schools (moe_school_emis_code)
  WHERE moe_school_emis_code IS NOT NULL;

ALTER TABLE campuses
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS county text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS moe_campus_code text;

CREATE TABLE school_settings (
  school_id uuid PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, updated_by) REFERENCES user_accounts(school_id, id)
);

-- Role and permission assignments support multiple roles and optional campus scope.
CREATE TABLE permissions (
  code text PRIMARY KEY,
  description text NOT NULL
);

INSERT INTO permissions (code, description) VALUES
  ('school.configure', 'Configure school identity and operating policies'),
  ('users.manage', 'Invite, suspend, and assign school users'),
  ('admissions.read', 'View applications and applicant documents'),
  ('admissions.write', 'Create and update applications and decisions'),
  ('students.read', 'View learner records within assigned scope'),
  ('students.write', 'Create and update learner records'),
  ('students.sensitive.read', 'View restricted learner information'),
  ('attendance.read', 'View attendance within assigned scope'),
  ('attendance.write', 'Record and correct attendance'),
  ('academics.configure', 'Configure classes, subjects, calendars, and grading'),
  ('grades.enter', 'Enter marks for assigned classes and subjects'),
  ('grades.moderate', 'Moderate and approve marks'),
  ('grades.publish', 'Publish approved results and report cards'),
  ('finance.read', 'View school financial records'),
  ('finance.write', 'Create charges and record payments'),
  ('finance.reverse', 'Approve payment reversal or refund'),
  ('staff.read', 'View staff records'),
  ('staff.write', 'Manage staff records and assignments'),
  ('staff.time.review', 'Review and correct staff time records'),
  ('reports.read', 'View permitted reports'),
  ('emis.export', 'Prepare and download approved-template EMIS exports'),
  ('emis.import', 'Preview and confirm approved reference-data imports'),
  ('audit.read', 'View authorized audit history')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE school_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  is_system_role boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, code),
  UNIQUE (school_id, id)
);

CREATE TABLE role_permissions (
  school_id uuid NOT NULL,
  role_id uuid NOT NULL,
  permission_code text NOT NULL REFERENCES permissions(code),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, role_id, permission_code),
  FOREIGN KEY (school_id, role_id) REFERENCES school_roles(school_id, id) ON DELETE CASCADE
);

CREATE TABLE user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  campus_id uuid,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  FOREIGN KEY (school_id, user_id) REFERENCES user_accounts(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, role_id) REFERENCES school_roles(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, campus_id) REFERENCES campuses(school_id, id),
  FOREIGN KEY (school_id, assigned_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);
CREATE INDEX user_role_assignments_user_idx ON user_role_assignments (school_id, user_id, ends_at);

-- Seed standard school roles and least-privilege permissions for existing accounts.
-- Platform-operator access is intentionally managed outside a school tenant.
WITH role_seed(code, name) AS (
  VALUES
    ('SCHOOL_ADMIN', 'School administrator'),
    ('CAMPUS_ADMIN', 'Campus administrator'),
    ('PRINCIPAL', 'Principal / head of school'),
    ('REGISTRAR', 'Registrar / admissions officer'),
    ('TEACHER', 'Teacher'),
    ('DEPARTMENT_HEAD', 'Department head / academic coordinator'),
    ('FINANCE', 'Bursar / finance officer'),
    ('HR_MANAGER', 'HR / staff administrator'),
    ('INVENTORY_MANAGER', 'Inventory manager'),
    ('PARENT', 'Parent / guardian'),
    ('STUDENT', 'Learner'),
    ('AUDITOR', 'Auditor / read-only reviewer')
)
INSERT INTO school_roles (school_id, code, name, is_system_role)
SELECT s.id, r.code, r.name, true
FROM schools s CROSS JOIN role_seed r
ON CONFLICT (school_id, code) DO NOTHING;

WITH grants(role_code, permission_code) AS (
  VALUES
    ('SCHOOL_ADMIN', 'school.configure'), ('SCHOOL_ADMIN', 'users.manage'),
    ('SCHOOL_ADMIN', 'admissions.read'), ('SCHOOL_ADMIN', 'admissions.write'),
    ('SCHOOL_ADMIN', 'students.read'), ('SCHOOL_ADMIN', 'students.write'),
    ('SCHOOL_ADMIN', 'students.sensitive.read'), ('SCHOOL_ADMIN', 'attendance.read'),
    ('SCHOOL_ADMIN', 'attendance.write'), ('SCHOOL_ADMIN', 'academics.configure'),
    ('SCHOOL_ADMIN', 'grades.enter'), ('SCHOOL_ADMIN', 'grades.moderate'),
    ('SCHOOL_ADMIN', 'grades.publish'), ('SCHOOL_ADMIN', 'finance.read'),
    ('SCHOOL_ADMIN', 'finance.write'), ('SCHOOL_ADMIN', 'finance.reverse'),
    ('SCHOOL_ADMIN', 'staff.read'), ('SCHOOL_ADMIN', 'staff.write'),
    ('SCHOOL_ADMIN', 'staff.time.review'), ('SCHOOL_ADMIN', 'reports.read'),
    ('SCHOOL_ADMIN', 'emis.export'), ('SCHOOL_ADMIN', 'emis.import'), ('SCHOOL_ADMIN', 'audit.read'),
    ('CAMPUS_ADMIN', 'admissions.read'), ('CAMPUS_ADMIN', 'admissions.write'),
    ('CAMPUS_ADMIN', 'students.read'), ('CAMPUS_ADMIN', 'students.write'),
    ('CAMPUS_ADMIN', 'attendance.read'), ('CAMPUS_ADMIN', 'attendance.write'),
    ('CAMPUS_ADMIN', 'academics.configure'), ('CAMPUS_ADMIN', 'grades.moderate'),
    ('CAMPUS_ADMIN', 'reports.read'),
    ('PRINCIPAL', 'admissions.read'), ('PRINCIPAL', 'students.read'),
    ('PRINCIPAL', 'students.sensitive.read'), ('PRINCIPAL', 'attendance.read'),
    ('PRINCIPAL', 'academics.configure'), ('PRINCIPAL', 'grades.moderate'),
    ('PRINCIPAL', 'grades.publish'), ('PRINCIPAL', 'reports.read'), ('PRINCIPAL', 'audit.read'),
    ('REGISTRAR', 'admissions.read'), ('REGISTRAR', 'admissions.write'),
    ('REGISTRAR', 'students.read'), ('REGISTRAR', 'students.write'), ('REGISTRAR', 'emis.export'),
    ('TEACHER', 'students.read'), ('TEACHER', 'attendance.read'), ('TEACHER', 'attendance.write'),
    ('TEACHER', 'grades.enter'), ('TEACHER', 'reports.read'),
    ('DEPARTMENT_HEAD', 'students.read'), ('DEPARTMENT_HEAD', 'attendance.read'),
    ('DEPARTMENT_HEAD', 'grades.enter'), ('DEPARTMENT_HEAD', 'grades.moderate'),
    ('DEPARTMENT_HEAD', 'reports.read'),
    ('FINANCE', 'students.read'), ('FINANCE', 'finance.read'), ('FINANCE', 'finance.write'),
    ('FINANCE', 'reports.read'),
    ('HR_MANAGER', 'staff.read'), ('HR_MANAGER', 'staff.write'), ('HR_MANAGER', 'staff.time.review'),
    ('HR_MANAGER', 'reports.read'),
    ('INVENTORY_MANAGER', 'reports.read'),
    ('PARENT', 'students.read'),
    ('STUDENT', 'students.read'),
    ('AUDITOR', 'admissions.read'), ('AUDITOR', 'students.read'), ('AUDITOR', 'attendance.read'),
    ('AUDITOR', 'finance.read'), ('AUDITOR', 'staff.read'), ('AUDITOR', 'reports.read'), ('AUDITOR', 'audit.read')
)
INSERT INTO role_permissions (school_id, role_id, permission_code)
SELECT r.school_id, r.id, g.permission_code
FROM school_roles r JOIN grants g ON g.role_code = r.code
ON CONFLICT (school_id, role_id, permission_code) DO NOTHING;

INSERT INTO user_role_assignments (school_id, user_id, role_id)
SELECT u.school_id, u.id, r.id
FROM user_accounts u
JOIN school_roles r ON r.school_id = u.school_id AND r.code = u.role
ON CONFLICT DO NOTHING;

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS must_reset_password boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

-- Configurable school structure. Existing class_groups remain the class/section assignment target.
CREATE TABLE education_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (school_id, code),
  UNIQUE (school_id, id)
);

CREATE TABLE grade_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  education_level_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  FOREIGN KEY (school_id, education_level_id) REFERENCES education_levels(school_id, id),
  UNIQUE (school_id, education_level_id, code),
  UNIQUE (school_id, id)
);

ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS education_level_id uuid;
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS grade_level_id uuid;
ALTER TABLE class_groups
  ADD CONSTRAINT class_groups_education_level_fk
  FOREIGN KEY (school_id, education_level_id) REFERENCES education_levels(school_id, id);
ALTER TABLE class_groups
  ADD CONSTRAINT class_groups_grade_level_fk
  FOREIGN KEY (school_id, grade_level_id) REFERENCES grade_levels(school_id, id);

CREATE TABLE academic_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'ACTIVE', 'CLOSED')),
  CHECK (ends_on >= starts_on),
  FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id),
  UNIQUE (school_id, academic_year_id, name),
  UNIQUE (school_id, id)
);

CREATE TABLE school_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  campus_id uuid,
  academic_year_id uuid,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  CHECK (ends_on >= starts_on),
  FOREIGN KEY (school_id, campus_id) REFERENCES campuses(school_id, id),
  FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  campus_id uuid NOT NULL,
  room_code text NOT NULL,
  name text NOT NULL,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  active boolean NOT NULL DEFAULT true,
  FOREIGN KEY (school_id, campus_id) REFERENCES campuses(school_id, id),
  UNIQUE (school_id, campus_id, room_code),
  UNIQUE (school_id, id)
);

CREATE TABLE timetable_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  CHECK (ends_at > starts_at),
  UNIQUE (school_id, name),
  UNIQUE (school_id, id)
);

CREATE TABLE timetable_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  teacher_assignment_id uuid NOT NULL,
  room_id uuid,
  period_id uuid NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  effective_from date NOT NULL,
  effective_to date,
  FOREIGN KEY (school_id, teacher_assignment_id) REFERENCES teacher_subject_assignments(school_id, id),
  FOREIGN KEY (school_id, room_id) REFERENCES rooms(school_id, id),
  FOREIGN KEY (school_id, period_id) REFERENCES timetable_periods(school_id, id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE (school_id, id)
);
CREATE INDEX timetable_slots_assignment_idx ON timetable_slots (school_id, teacher_assignment_id, day_of_week);

CREATE TABLE teacher_substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  timetable_slot_id uuid NOT NULL,
  substitute_teacher_id uuid NOT NULL,
  on_date date NOT NULL,
  reason text NOT NULL,
  approved_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, timetable_slot_id) REFERENCES timetable_slots(school_id, id),
  FOREIGN KEY (school_id, substitute_teacher_id) REFERENCES teacher_profiles(school_id, user_id),
  FOREIGN KEY (school_id, approved_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, timetable_slot_id, on_date)
);

-- Guardians and longitudinal learner lifecycle.
CREATE TABLE guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id uuid,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  preferred_language text NOT NULL DEFAULT 'en',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, user_id) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id),
  UNIQUE (school_id, user_id)
);
CREATE INDEX guardians_phone_idx ON guardians (school_id, phone);

CREATE TABLE student_guardians (
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  guardian_id uuid NOT NULL,
  relationship text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  emergency_contact boolean NOT NULL DEFAULT false,
  authorized_pickup boolean NOT NULL DEFAULT false,
  can_view_results boolean NOT NULL DEFAULT true,
  can_view_finance boolean NOT NULL DEFAULT false,
  communication_consent boolean NOT NULL DEFAULT false,
  consent_updated_at timestamptz,
  PRIMARY KEY (school_id, student_id, guardian_id),
  FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, guardian_id) REFERENCES guardians(school_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX student_one_primary_guardian_idx
  ON student_guardians (school_id, student_id) WHERE is_primary;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS preferred_name text,
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS external_learner_id text,
  ADD COLUMN IF NOT EXISTS photo_storage_key text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_on date,
  ADD COLUMN IF NOT EXISTS withdrawal_reason text;
CREATE UNIQUE INDEX students_external_learner_id_unique
  ON students (school_id, external_learner_id)
  WHERE external_learner_id IS NOT NULL;

CREATE TABLE admission_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  campus_id uuid,
  application_number text NOT NULL,
  first_name text NOT NULL,
  middle_name text,
  last_name text NOT NULL,
  date_of_birth date,
  sex text,
  requested_level_id uuid,
  requested_class_group_id uuid,
  application_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'RECEIVED' CHECK (status IN (
    'RECEIVED', 'UNDER_REVIEW', 'INTERVIEW_SCHEDULED', 'OFFERED', 'ACCEPTED',
    'WAITLISTED', 'REJECTED', 'WITHDRAWN', 'ENROLLED'
  )),
  decision text,
  decision_reason text,
  notes text,
  created_by uuid NOT NULL,
  converted_student_id uuid,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, campus_id) REFERENCES campuses(school_id, id),
  FOREIGN KEY (school_id, requested_level_id) REFERENCES education_levels(school_id, id),
  FOREIGN KEY (school_id, requested_class_group_id) REFERENCES class_groups(school_id, id),
  FOREIGN KEY (school_id, created_by) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, converted_student_id) REFERENCES students(school_id, id),
  UNIQUE (school_id, application_number),
  UNIQUE (school_id, id)
);

CREATE TABLE admission_guardians (
  school_id uuid NOT NULL,
  application_id uuid NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  relationship text NOT NULL,
  phone text,
  email text,
  is_primary boolean NOT NULL DEFAULT false,
  PRIMARY KEY (school_id, application_id, first_name, last_name, relationship),
  FOREIGN KEY (school_id, application_id) REFERENCES admission_applications(school_id, id) ON DELETE CASCADE
);

CREATE TABLE admission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  application_id uuid NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (school_id, application_id) REFERENCES admission_applications(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, actor_user_id) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE student_enrollment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  academic_year_id uuid,
  campus_id uuid,
  class_group_id uuid,
  status text NOT NULL CHECK (status IN ('APPLICANT', 'ENROLLED', 'TRANSFERRED_IN', 'TRANSFERRED_OUT', 'WITHDRAWN', 'COMPLETED', 'GRADUATED', 'RE_ENROLLED')),
  effective_on date NOT NULL,
  ended_on date,
  prior_school text,
  reason text,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_on IS NULL OR ended_on >= effective_on),
  FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id),
  FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id),
  FOREIGN KEY (school_id, campus_id) REFERENCES campuses(school_id, id),
  FOREIGN KEY (school_id, class_group_id) REFERENCES class_groups(school_id, id),
  FOREIGN KEY (school_id, recorded_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);
CREATE INDEX student_enrollment_history_student_idx ON student_enrollment_history (school_id, student_id, effective_on DESC);

CREATE TABLE document_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  required_for_admission boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'RESTRICTED' CHECK (visibility IN ('STAFF_ONLY', 'GUARDIAN_VISIBLE', 'RESTRICTED')),
  retention_days integer CHECK (retention_days IS NULL OR retention_days > 0),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (school_id, code),
  UNIQUE (school_id, id)
);

CREATE TABLE student_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  category_id uuid,
  title text NOT NULL,
  object_storage_key text NOT NULL,
  original_filename text NOT NULL,
  media_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 text NOT NULL,
  visibility text NOT NULL DEFAULT 'RESTRICTED' CHECK (visibility IN ('STAFF_ONLY', 'GUARDIAN_VISIBLE', 'RESTRICTED')),
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  retention_until date,
  deleted_at timestamptz,
  FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, category_id) REFERENCES document_categories(school_id, id),
  FOREIGN KEY (school_id, uploaded_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

-- Attendance capture, correction trail, and offline idempotency.
CREATE TABLE attendance_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  counts_as_present boolean NOT NULL DEFAULT false,
  requires_follow_up boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (school_id, code),
  UNIQUE (school_id, id)
);
INSERT INTO attendance_codes (school_id, code, label, counts_as_present, requires_follow_up)
SELECT s.id, x.code, x.label, x.present, x.follow_up
FROM schools s
CROSS JOIN (VALUES ('PRESENT','Present',true,false),('ABSENT','Absent',false,true),('LATE','Late',true,true),('EXCUSED','Excused',false,false)) AS x(code,label,present,follow_up)
ON CONFLICT (school_id, code) DO NOTHING;

ALTER TABLE student_attendance
  ADD COLUMN IF NOT EXISTS client_mutation_id uuid,
  ADD COLUMN IF NOT EXISTS corrected_by uuid,
  ADD COLUMN IF NOT EXISTS corrected_at timestamptz,
  ADD COLUMN IF NOT EXISTS correction_reason text,
  ADD COLUMN IF NOT EXISTS sync_state text NOT NULL DEFAULT 'SYNCED' CHECK (sync_state IN ('PENDING', 'SYNCED', 'CONFLICT'));
CREATE UNIQUE INDEX IF NOT EXISTS student_attendance_school_id_unique
  ON student_attendance (school_id, id);
ALTER TABLE student_attendance
  ADD CONSTRAINT student_attendance_corrected_by_fk
  FOREIGN KEY (school_id, corrected_by) REFERENCES user_accounts(school_id, id);
CREATE UNIQUE INDEX student_attendance_client_mutation_unique
  ON student_attendance (school_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

CREATE TABLE attendance_correction_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  attendance_id uuid NOT NULL,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  reason text NOT NULL,
  corrected_by uuid NOT NULL,
  corrected_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, attendance_id) REFERENCES student_attendance(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, corrected_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE offline_sync_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  batch_key uuid NOT NULL,
  state text NOT NULL DEFAULT 'RECEIVED' CHECK (state IN ('RECEIVED', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'REJECTED')),
  received_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (school_id, user_id) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, user_id, device_id, batch_key),
  UNIQUE (school_id, id)
);

CREATE TABLE offline_sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  client_mutation_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  reason text NOT NULL,
  resolution text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, batch_id) REFERENCES offline_sync_batches(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, resolved_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

-- Configurable assessment, grade publication, and report-card lifecycle.
CREATE TABLE grading_scales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  FOREIGN KEY (school_id, created_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, name, version),
  UNIQUE (school_id, id)
);

CREATE TABLE grading_scale_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  grading_scale_id uuid NOT NULL,
  label text NOT NULL,
  min_score numeric(5,2) NOT NULL CHECK (min_score >= 0 AND min_score <= 100),
  max_score numeric(5,2) NOT NULL CHECK (max_score >= 0 AND max_score <= 100),
  interpretation text,
  result_category text NOT NULL CHECK (result_category IN ('PASS', 'FAIL', 'REVIEW_REQUIRED', 'OTHER')),
  sort_order integer NOT NULL DEFAULT 0,
  CHECK (max_score >= min_score),
  FOREIGN KEY (school_id, grading_scale_id) REFERENCES grading_scales(school_id, id) ON DELETE CASCADE,
  UNIQUE (school_id, grading_scale_id, label),
  UNIQUE (school_id, id)
);

CREATE TABLE assessment_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  teacher_assignment_id uuid NOT NULL,
  academic_term_id uuid NOT NULL,
  name text NOT NULL,
  assessment_type text NOT NULL CHECK (assessment_type IN ('QUIZ', 'TEST', 'EXAM', 'ASSIGNMENT', 'PROJECT', 'OTHER')),
  weight_percent numeric(5,2) NOT NULL CHECK (weight_percent > 0 AND weight_percent <= 100),
  max_score numeric(7,2) NOT NULL CHECK (max_score > 0),
  required boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, teacher_assignment_id) REFERENCES teacher_subject_assignments(school_id, id),
  FOREIGN KEY (school_id, academic_term_id) REFERENCES academic_terms(school_id, id),
  FOREIGN KEY (school_id, created_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE grade_publication_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_group_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  academic_term_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'MODERATION', 'APPROVED', 'PUBLISHED', 'LOCKED', 'REOPENED')),
  submitted_by uuid,
  approved_by uuid,
  published_by uuid,
  submitted_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  reopened_by uuid,
  reopened_at timestamptz,
  reopen_reason text,
  FOREIGN KEY (school_id, class_group_id) REFERENCES class_groups(school_id, id),
  FOREIGN KEY (school_id, subject_id) REFERENCES subjects(school_id, id),
  FOREIGN KEY (school_id, academic_term_id) REFERENCES academic_terms(school_id, id),
  FOREIGN KEY (school_id, submitted_by) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, approved_by) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, published_by) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, reopened_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, class_group_id, subject_id, academic_term_id),
  UNIQUE (school_id, id)
);

CREATE TABLE report_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  academic_term_id uuid,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'PUBLISHED', 'LOCKED')),
  attendance_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  academic_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  promotion_status text,
  teacher_comment text,
  principal_comment text,
  calculated_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  snapshot_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id),
  FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id),
  FOREIGN KEY (school_id, academic_term_id) REFERENCES academic_terms(school_id, id),
  FOREIGN KEY (school_id, approved_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);
CREATE UNIQUE INDEX report_cards_term_snapshot_unique
  ON report_cards (school_id, student_id, academic_year_id, academic_term_id, snapshot_version)
  WHERE academic_term_id IS NOT NULL;
CREATE UNIQUE INDEX report_cards_year_snapshot_unique
  ON report_cards (school_id, student_id, academic_year_id, snapshot_version)
  WHERE academic_term_id IS NULL;

-- Finance: explicit currencies and immutable transaction/reversal history.
CREATE TABLE fee_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (school_id, code),
  UNIQUE (school_id, id)
);

CREATE TABLE fee_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  education_level_id uuid,
  grade_level_id uuid,
  currency char(3) NOT NULL CHECK (currency IN ('LRD', 'USD')),
  name text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  created_by uuid NOT NULL,
  FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id),
  FOREIGN KEY (school_id, education_level_id) REFERENCES education_levels(school_id, id),
  FOREIGN KEY (school_id, grade_level_id) REFERENCES grade_levels(school_id, id),
  FOREIGN KEY (school_id, created_by) REFERENCES user_accounts(school_id, id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE (school_id, id)
);

CREATE TABLE fee_schedule_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  fee_schedule_id uuid NOT NULL,
  fee_item_id uuid NOT NULL,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  due_offset_days integer NOT NULL DEFAULT 0,
  installment_no integer NOT NULL DEFAULT 1 CHECK (installment_no > 0),
  FOREIGN KEY (school_id, fee_schedule_id) REFERENCES fee_schedules(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, fee_item_id) REFERENCES fee_items(school_id, id),
  UNIQUE (school_id, fee_schedule_id, fee_item_id, installment_no),
  UNIQUE (school_id, id)
);

CREATE TABLE fee_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  invoice_number text NOT NULL,
  currency char(3) NOT NULL CHECK (currency IN ('LRD', 'USD')),
  issued_on date NOT NULL DEFAULT CURRENT_DATE,
  due_on date,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID')),
  created_by uuid NOT NULL,
  approved_by uuid,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id),
  FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id),
  FOREIGN KEY (school_id, created_by) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, approved_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, invoice_number),
  UNIQUE (school_id, id)
);

CREATE TABLE fee_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  fee_item_id uuid,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount numeric(14,2) NOT NULL CHECK (unit_amount >= 0),
  line_amount numeric(14,2) GENERATED ALWAYS AS (quantity * unit_amount) STORED,
  fee_schedule_line_id uuid,
  FOREIGN KEY (school_id, invoice_id) REFERENCES fee_invoices(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, fee_item_id) REFERENCES fee_items(school_id, id),
  FOREIGN KEY (school_id, fee_schedule_line_id) REFERENCES fee_schedule_lines(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE learner_concessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  concession_type text NOT NULL CHECK (concession_type IN ('DISCOUNT', 'BURSARY', 'SCHOLARSHIP', 'CREDIT', 'ADJUSTMENT')),
  currency char(3) NOT NULL CHECK (currency IN ('LRD', 'USD')),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED')),
  requested_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id),
  FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id),
  FOREIGN KEY (school_id, requested_by) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, approved_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  currency char(3) NOT NULL CHECK (currency IN ('LRD', 'USD')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  channel text NOT NULL CHECK (channel IN ('CASH', 'BANK', 'MTN_MOMO', 'OTHER')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'PARTIALLY_REVERSED', 'REVERSED')),
  payer_reference text,
  provider_transaction_id text,
  receipt_number text,
  cashier_user_id uuid,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  note text,
  FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id),
  FOREIGN KEY (school_id, cashier_user_id) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);
CREATE UNIQUE INDEX payments_provider_transaction_unique
  ON payments (school_id, channel, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX payments_receipt_unique
  ON payments (school_id, receipt_number)
  WHERE receipt_number IS NOT NULL;
CREATE INDEX payments_student_date_idx ON payments (school_id, student_id, received_at DESC);

CREATE TABLE payment_allocations (
  school_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  allocated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, payment_id, invoice_id),
  FOREIGN KEY (school_id, payment_id) REFERENCES payments(school_id, id),
  FOREIGN KEY (school_id, invoice_id) REFERENCES fee_invoices(school_id, id)
);

CREATE TABLE payment_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL CHECK (currency IN ('LRD', 'USD')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED')),
  requested_by uuid NOT NULL,
  approved_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY (school_id, payment_id) REFERENCES payments(school_id, id),
  FOREIGN KEY (school_id, requested_by) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, approved_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE payment_provider_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('MTN_MOMO', 'BANK', 'OTHER')),
  product text NOT NULL DEFAULT 'COLLECTIONS' CHECK (product IN ('COLLECTIONS', 'DISBURSEMENTS')),
  country_code char(2) NOT NULL DEFAULT 'LR',
  environment text NOT NULL CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  credential_secret_ref text NOT NULL,
  callback_url text,
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, provider, environment),
  UNIQUE (school_id, id)
);

CREATE TABLE payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  provider_profile_id uuid NOT NULL,
  payment_id uuid,
  idempotency_key uuid NOT NULL,
  provider_reference text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL CHECK (currency IN ('LRD', 'USD')),
  payer_msisdn_ciphertext bytea,
  payer_msisdn_last4 char(4),
  status text NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED')),
  expires_at timestamptz,
  provider_status text,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY (school_id, invoice_id) REFERENCES fee_invoices(school_id, id),
  FOREIGN KEY (school_id, provider_profile_id) REFERENCES payment_provider_profiles(school_id, id),
  FOREIGN KEY (school_id, payment_id) REFERENCES payments(school_id, id),
  UNIQUE (school_id, idempotency_key),
  UNIQUE (school_id, provider_profile_id, provider_reference),
  UNIQUE (school_id, id)
);

CREATE TABLE payment_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  provider_profile_id uuid NOT NULL,
  payment_intent_id uuid,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload_sha256 text NOT NULL,
  signature_valid boolean NOT NULL,
  processing_status text NOT NULL DEFAULT 'RECEIVED' CHECK (processing_status IN ('RECEIVED', 'PROCESSED', 'REJECTED', 'RETRY')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error_code text,
  FOREIGN KEY (school_id, provider_profile_id) REFERENCES payment_provider_profiles(school_id, id),
  FOREIGN KEY (school_id, payment_intent_id) REFERENCES payment_intents(school_id, id),
  UNIQUE (school_id, provider_profile_id, provider_event_id),
  UNIQUE (school_id, id)
);

CREATE TABLE cashier_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  campus_id uuid,
  cashier_user_id uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_cash numeric(14,2) NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  closed_at timestamptz,
  counted_cash numeric(14,2),
  expected_cash numeric(14,2),
  variance numeric(14,2),
  closeout_note text,
  FOREIGN KEY (school_id, campus_id) REFERENCES campuses(school_id, id),
  FOREIGN KEY (school_id, cashier_user_id) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

-- Parent-facing communication with explicit consent and delivery tracking.
CREATE TABLE communication_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  guardian_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP')),
  enabled boolean NOT NULL DEFAULT false,
  consent_status text NOT NULL DEFAULT 'UNKNOWN' CHECK (consent_status IN ('UNKNOWN', 'GRANTED', 'WITHDRAWN')),
  consent_recorded_at timestamptz,
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, guardian_id) REFERENCES guardians(school_id, id) ON DELETE CASCADE,
  UNIQUE (school_id, guardian_id, channel)
);

CREATE TABLE message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP')),
  language_code text NOT NULL DEFAULT 'en',
  subject text,
  body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, updated_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, code, channel, language_code),
  UNIQUE (school_id, id)
);

CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  campus_id uuid,
  class_group_id uuid,
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL CHECK (audience IN ('ALL_GUARDIANS', 'CAMPUS', 'CLASS', 'STAFF', 'LEARNERS')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'CANCELLED')),
  created_by uuid NOT NULL,
  approved_by uuid,
  publish_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, campus_id) REFERENCES campuses(school_id, id),
  FOREIGN KEY (school_id, class_group_id) REFERENCES class_groups(school_id, id),
  FOREIGN KEY (school_id, created_by) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, approved_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  guardian_id uuid,
  user_id uuid,
  announcement_id uuid,
  template_id uuid,
  channel text NOT NULL CHECK (channel IN ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP')),
  recipient_ref text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED')),
  provider_message_id text,
  error_code text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  FOREIGN KEY (school_id, guardian_id) REFERENCES guardians(school_id, id),
  FOREIGN KEY (school_id, user_id) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, announcement_id) REFERENCES announcements(school_id, id),
  FOREIGN KEY (school_id, template_id) REFERENCES message_templates(school_id, id),
  UNIQUE (school_id, id)
);
CREATE INDEX notification_deliveries_queue_idx ON notification_deliveries (school_id, status, queued_at);

-- Staff HR records are separate from user login identities; teacher_profiles remain the academic identity link.
CREATE TABLE staff_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id uuid,
  campus_id uuid,
  employee_number text NOT NULL,
  first_name text NOT NULL,
  middle_name text,
  last_name text NOT NULL,
  email text,
  phone text,
  job_title text,
  department text,
  hired_on date,
  employment_status text NOT NULL DEFAULT 'ACTIVE' CHECK (employment_status IN ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED', 'INACTIVE')),
  emergency_contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  qualifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, user_id) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, campus_id) REFERENCES campuses(school_id, id),
  UNIQUE (school_id, employee_number),
  UNIQUE (school_id, user_id),
  UNIQUE (school_id, id)
);

ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS staff_record_id uuid;
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS external_teacher_id text;
ALTER TABLE teacher_profiles
  ADD CONSTRAINT teacher_profiles_staff_record_fk
  FOREIGN KEY (school_id, staff_record_id) REFERENCES staff_records(school_id, id);
CREATE UNIQUE INDEX teacher_profiles_external_teacher_id_unique
  ON teacher_profiles (school_id, external_teacher_id)
  WHERE external_teacher_id IS NOT NULL;

CREATE TABLE staff_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  staff_record_id uuid NOT NULL,
  contract_type text NOT NULL CHECK (contract_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'HOURLY')),
  compensation_basis text NOT NULL CHECK (compensation_basis IN ('MONTHLY_SALARY', 'APPROVED_HOURLY', 'PER_ASSIGNMENT')),
  currency char(3) NOT NULL CHECK (currency IN ('LRD', 'USD')),
  rate numeric(14,2) NOT NULL CHECK (rate >= 0),
  starts_on date NOT NULL,
  ends_on date,
  approved_by uuid NOT NULL,
  payroll_ruleset_ref text,
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  FOREIGN KEY (school_id, staff_record_id) REFERENCES staff_records(school_id, id),
  FOREIGN KEY (school_id, approved_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE staff_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  staff_record_id uuid NOT NULL,
  leave_type text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  CHECK (ends_on >= starts_on),
  FOREIGN KEY (school_id, staff_record_id) REFERENCES staff_records(school_id, id),
  FOREIGN KEY (school_id, reviewed_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE staff_attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  staff_record_id uuid NOT NULL,
  clocked_in_at timestamptz NOT NULL,
  clocked_out_at timestamptz,
  source text NOT NULL DEFAULT 'WEB' CHECK (source IN ('WEB', 'MOBILE', 'ADMIN_CORRECTION', 'BIOMETRIC')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'CORRECTED')),
  corrected_by uuid,
  correction_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (clocked_out_at IS NULL OR clocked_out_at >= clocked_in_at),
  CHECK ((corrected_by IS NULL) = (correction_reason IS NULL)),
  FOREIGN KEY (school_id, staff_record_id) REFERENCES staff_records(school_id, id),
  FOREIGN KEY (school_id, corrected_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);
CREATE INDEX staff_attendance_staff_date_idx ON staff_attendance_sessions (school_id, staff_record_id, clocked_in_at DESC);

CREATE TABLE payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REVIEW', 'APPROVED', 'PAID', 'CANCELLED')),
  ruleset_ref text,
  created_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  CHECK (period_end >= period_start),
  FOREIGN KEY (school_id, created_by) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, approved_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE payroll_run_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  payroll_run_id uuid NOT NULL,
  staff_record_id uuid NOT NULL,
  currency char(3) NOT NULL CHECK (currency IN ('LRD', 'USD')),
  gross_amount numeric(14,2) NOT NULL CHECK (gross_amount >= 0),
  approved_hours numeric(10,2) CHECK (approved_hours IS NULL OR approved_hours >= 0),
  additions jsonb NOT NULL DEFAULT '[]'::jsonb,
  deductions jsonb NOT NULL DEFAULT '[]'::jsonb,
  net_amount numeric(14,2) NOT NULL CHECK (net_amount >= 0),
  calculation_notes text,
  FOREIGN KEY (school_id, payroll_run_id) REFERENCES payroll_runs(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, staff_record_id) REFERENCES staff_records(school_id, id),
  UNIQUE (school_id, payroll_run_id, staff_record_id)
);

-- Data import workflow supports preview, validation, duplicate review, and explicit commit.
CREATE TABLE data_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('LEARNER', 'GUARDIAN', 'STAFF', 'CLASS', 'BALANCE', 'EMIS_REFERENCE')),
  source_storage_key text NOT NULL,
  source_filename text NOT NULL,
  state text NOT NULL DEFAULT 'UPLOADED' CHECK (state IN ('UPLOADED', 'PREVIEWED', 'VALIDATED', 'COMMITTED', 'ROLLED_BACK', 'FAILED')),
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  valid_count integer NOT NULL DEFAULT 0 CHECK (valid_count >= 0),
  error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  created_by uuid NOT NULL,
  committed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  FOREIGN KEY (school_id, created_by) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, committed_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);

CREATE TABLE data_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  row_number integer NOT NULL CHECK (row_number > 0),
  proposed_values jsonb NOT NULL,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  duplicate_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision text NOT NULL DEFAULT 'PENDING' CHECK (decision IN ('PENDING', 'ACCEPT', 'SKIP', 'MERGE_REVIEW')),
  committed_entity_id uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  FOREIGN KEY (school_id, batch_id) REFERENCES data_import_batches(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, reviewed_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, batch_id, row_number),
  UNIQUE (school_id, id)
);

-- Versioned EMIS file exchange only. No Ministry login automation or unapproved live connector.
CREATE TABLE emis_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  schema_name text NOT NULL,
  version text NOT NULL,
  effective_from date,
  effective_to date,
  source_title text NOT NULL,
  source_url text,
  source_received_on date,
  approved_by_school_user_id uuid,
  approval_note text,
  template_storage_key text,
  mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, approved_by_school_user_id) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, schema_name, version),
  UNIQUE (school_id, id)
);

CREATE TABLE emis_exchange_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  template_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('EXPORT', 'IMPORT')),
  status text NOT NULL DEFAULT 'PREVIEW' CHECK (status IN ('PREVIEW', 'VALIDATED', 'DOWNLOADED', 'RECEIVED', 'APPLIED', 'FAILED', 'CANCELLED')),
  reporting_period_start date,
  reporting_period_end date,
  template_version text NOT NULL,
  mapping_snapshot jsonb NOT NULL,
  artifact_storage_key text,
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  valid_count integer NOT NULL DEFAULT 0 CHECK (valid_count >= 0),
  error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  initiated_by uuid NOT NULL,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  external_receipt_reference text,
  external_acknowledgment text,
  FOREIGN KEY (school_id, template_id) REFERENCES emis_templates(school_id, id),
  FOREIGN KEY (school_id, initiated_by) REFERENCES user_accounts(school_id, id),
  CHECK (reporting_period_end IS NULL OR reporting_period_start IS NULL OR reporting_period_end >= reporting_period_start),
  UNIQUE (school_id, id)
);

CREATE TABLE emis_exchange_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  run_id uuid NOT NULL,
  row_number integer NOT NULL CHECK (row_number > 0),
  record_type text NOT NULL,
  internal_record_id uuid,
  external_record_id text,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  row_status text NOT NULL DEFAULT 'VALID' CHECK (row_status IN ('VALID', 'INVALID', 'SKIPPED', 'APPLIED', 'CONFLICT')),
  FOREIGN KEY (school_id, run_id) REFERENCES emis_exchange_runs(school_id, id) ON DELETE CASCADE,
  UNIQUE (school_id, run_id, row_number),
  UNIQUE (school_id, id)
);

-- Optional general-ledger, inventory, and procurement extensions, independent of school core.
CREATE TABLE ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  account_code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  currency char(3) CHECK (currency IS NULL OR currency IN ('LRD', 'USD')),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (school_id, account_code),
  UNIQUE (school_id, id)
);

CREATE TABLE journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  entry_number text NOT NULL,
  entry_date date NOT NULL,
  description text NOT NULL,
  source_module text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED')),
  created_by uuid NOT NULL,
  posted_by uuid,
  posted_at timestamptz,
  reversal_of_id uuid,
  FOREIGN KEY (school_id, created_by) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, posted_by) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, reversal_of_id) REFERENCES journal_entries(school_id, id),
  UNIQUE (school_id, entry_number),
  UNIQUE (school_id, id)
);

CREATE TABLE journal_lines (
  school_id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  line_no integer NOT NULL CHECK (line_no > 0),
  ledger_account_id uuid NOT NULL,
  currency char(3) NOT NULL CHECK (currency IN ('LRD', 'USD')),
  debit numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  memo text,
  PRIMARY KEY (school_id, journal_entry_id, line_no),
  CHECK ((debit = 0) <> (credit = 0)),
  FOREIGN KEY (school_id, journal_entry_id) REFERENCES journal_entries(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, ledger_account_id) REFERENCES ledger_accounts(school_id, id)
);

CREATE TABLE inventory_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  campus_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  FOREIGN KEY (school_id, campus_id) REFERENCES campuses(school_id, id),
  UNIQUE (school_id, code),
  UNIQUE (school_id, id)
);

CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  unit text NOT NULL,
  reorder_level numeric(12,2) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, sku),
  UNIQUE (school_id, id)
);

CREATE TABLE stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  item_id uuid NOT NULL,
  location_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('RECEIPT', 'ISSUE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT')),
  quantity numeric(12,2) NOT NULL CHECK (quantity > 0),
  movement_date timestamptz NOT NULL DEFAULT now(),
  reference text,
  reason text NOT NULL,
  related_movement_id uuid,
  recorded_by uuid NOT NULL,
  FOREIGN KEY (school_id, item_id) REFERENCES inventory_items(school_id, id),
  FOREIGN KEY (school_id, location_id) REFERENCES inventory_locations(school_id, id),
  FOREIGN KEY (school_id, related_movement_id) REFERENCES stock_movements(school_id, id),
  FOREIGN KEY (school_id, recorded_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, id)
);
CREATE INDEX stock_movements_item_location_date_idx ON stock_movements (school_id, item_id, location_id, movement_date DESC);

CREATE TABLE procurement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  request_number text NOT NULL,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ORDERED', 'CANCELLED')),
  justification text NOT NULL,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, requested_by) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, approved_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, request_number),
  UNIQUE (school_id, id)
);

CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  purchase_order_number text NOT NULL,
  vendor_name text NOT NULL,
  currency char(3) NOT NULL CHECK (currency IN ('LRD', 'USD')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
  procurement_request_id uuid,
  requested_by uuid NOT NULL,
  approved_by uuid,
  ordered_at timestamptz,
  received_at timestamptz,
  FOREIGN KEY (school_id, procurement_request_id) REFERENCES procurement_requests(school_id, id),
  FOREIGN KEY (school_id, requested_by) REFERENCES user_accounts(school_id, id),
  FOREIGN KEY (school_id, approved_by) REFERENCES user_accounts(school_id, id),
  UNIQUE (school_id, purchase_order_number),
  UNIQUE (school_id, id)
);

CREATE TABLE purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  purchase_order_id uuid NOT NULL,
  item_id uuid NOT NULL,
  quantity numeric(12,2) NOT NULL CHECK (quantity > 0),
  received_quantity numeric(12,2) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0 AND received_quantity <= quantity),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  FOREIGN KEY (school_id, purchase_order_id) REFERENCES purchase_orders(school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, item_id) REFERENCES inventory_items(school_id, id),
  UNIQUE (school_id, purchase_order_id, item_id)
);

-- Append-only audit history. Application code must record before/after summaries without sensitive payloads.
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS campus_id uuid;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS request_id text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS ip_address inet;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_campus_fk
  FOREIGN KEY (school_id, campus_id) REFERENCES campuses(school_id, id);

-- Row-level tenant isolation, deny-by-default. Each application transaction must set
-- app.current_school_id only after authenticating the user and verifying school membership.
-- Use a non-superuser application DB role. Do not share an unrestricted owner credential.
DO $$
DECLARE
  target_table record;
BEGIN
  FOR target_table IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'school_id'
    GROUP BY c.table_name
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table.table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target_table.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_school_scope ON public.%I', target_table.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_school_scope ON public.%I USING (school_id = app.current_school_id()) WITH CHECK (school_id = app.current_school_id())',
      target_table.table_name
    );
  END LOOP;

  ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
  ALTER TABLE schools FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS tenant_school_scope ON schools;
  CREATE POLICY tenant_school_scope ON schools
    USING (id = app.current_school_id())
    WITH CHECK (id = app.current_school_id());
END;
$$;

