-- Seed every school with the standard role catalog, including schools created after migration 002.
-- The initial-school bootstrap used to create only SCHOOL_ADMIN, leaving the account-creation
-- workflow unable to assign Principal, Registrar, Teacher, Student, Guardian, and other roles.
CREATE OR REPLACE FUNCTION app.seed_standard_school_roles(target_school_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'A database administrator is required to seed school roles.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM schools WHERE id = target_school_id) THEN
    RAISE EXCEPTION 'The target school does not exist.';
  END IF;

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
  INSERT INTO school_roles (school_id, code, name, is_system_role, active)
  SELECT target_school_id, code, name, true, true
  FROM role_seed
  ON CONFLICT (school_id, code) DO UPDATE
    SET name = EXCLUDED.name, is_system_role = true, active = true;

  -- The school administrator gets the full permission catalog for this school.
  INSERT INTO role_permissions (school_id, role_id, permission_code)
  SELECT target_school_id, r.id, p.code
  FROM school_roles r CROSS JOIN permissions p
  WHERE r.school_id = target_school_id AND r.code = 'SCHOOL_ADMIN'
  ON CONFLICT (school_id, role_id, permission_code) DO NOTHING;

  WITH grants(role_code, permission_code) AS (
    VALUES
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
      ('PARENT', 'students.read'), ('PARENT', 'guardian.portal.read'),
      ('PARENT', 'curriculum.read'), ('PARENT', 'timetable.read'), ('PARENT', 'attendance.read'),
      ('STUDENT', 'students.read'), ('STUDENT', 'student.portal.read'),
      ('STUDENT', 'curriculum.read'), ('STUDENT', 'timetable.read'), ('STUDENT', 'attendance.read'),
      ('AUDITOR', 'admissions.read'), ('AUDITOR', 'students.read'), ('AUDITOR', 'attendance.read'),
      ('AUDITOR', 'finance.read'), ('AUDITOR', 'staff.read'), ('AUDITOR', 'reports.read'), ('AUDITOR', 'audit.read'),
      ('CAMPUS_ADMIN', 'curriculum.read'), ('CAMPUS_ADMIN', 'curriculum.manage'),
      ('CAMPUS_ADMIN', 'timetable.read'), ('CAMPUS_ADMIN', 'timetable.manage'),
      ('PRINCIPAL', 'curriculum.read'), ('PRINCIPAL', 'curriculum.manage'),
      ('PRINCIPAL', 'timetable.read'), ('PRINCIPAL', 'timetable.manage'),
      ('DEPARTMENT_HEAD', 'curriculum.read'), ('DEPARTMENT_HEAD', 'curriculum.manage'),
      ('DEPARTMENT_HEAD', 'timetable.read'),
      ('TEACHER', 'curriculum.read'), ('TEACHER', 'timetable.read')
  )
  INSERT INTO role_permissions (school_id, role_id, permission_code)
  SELECT target_school_id, r.id, g.permission_code
  FROM school_roles r JOIN grants g ON g.role_code = r.code
  WHERE r.school_id = target_school_id
  ON CONFLICT (school_id, role_id, permission_code) DO NOTHING;
END;
$$;

-- Repair existing schools, including the staging tenant created after migration 002.
DO $$
DECLARE
  school_row record;
BEGIN
  FOR school_row IN SELECT id FROM schools LOOP
    PERFORM app.seed_standard_school_roles(school_row.id);
  END LOOP;
END;
$$;

-- Ensure every existing user whose legacy role now has a catalog entry has an RBAC assignment.
INSERT INTO user_role_assignments (school_id, user_id, role_id)
SELECT u.school_id, u.id, r.id
FROM user_accounts u
JOIN school_roles r ON r.school_id = u.school_id AND r.code = u.role
ON CONFLICT DO NOTHING;
