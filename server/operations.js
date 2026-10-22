import { randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { hashPassword } from './authCrypto.js';

const NAME_LIMIT = 120;
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function text(value, limit = NAME_LIMIT) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}
function validDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function sameSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function close(req, commit) {
  const client = req.auth?.client;
  if (!client) return;
  req.auth.client = null;
  try { await client.query(commit ? 'COMMIT' : 'ROLLBACK'); } finally { client.release(); }
}
async function audit(req, action, entityType, entityId, details = {}) {
  await req.auth.client.query(
    `INSERT INTO audit_events (school_id, actor_user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [req.auth.claims.schoolId, req.auth.claims.userId, action, entityType, entityId, JSON.stringify(details)]
  );
}
function needsPermission(code) {
  return async (req, res, next) => {
    if (!req.auth.account.permissions.includes(code)) {
      await close(req, false);
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}
function needsAnyPermission(codes) {
  return async (req, res, next) => {
    if (!codes.some(code => req.auth.account.permissions.includes(code))) {
      await close(req, false);
      return res.status(403).json({ error: 'You do not have permission to view grade records.' });
    }
    next();
  };
}
function csrf(req, res, next) {
  if (!sameSecret(req.get('x-csrf-token'), req.auth.claims.csrfToken)) {
    void close(req, false);
    return res.status(403).json({ error: 'Request verification failed. Refresh your session and try again.' });
  }
  next();
}
async function fail(req, res, error) {
  await close(req, false).catch(() => {});
  if (error?.code === '23505') return res.status(409).json({ error: 'That code, email, or record already exists for this school.' });
  if (error?.code === '23503' || error?.code === '23514' || error?.code === '22P02') {
    return res.status(400).json({ error: 'Some selected school data is invalid. Refresh the page and try again.' });
  }
  return res.status(500).json({ error: 'The school operation could not be completed. Please try again.' });
}
async function done(req, res, status, body) {
  try {
    await close(req, true);
    return res.status(status).json(body);
  } catch (error) {
    await close(req, false).catch(() => {});
    return res.status(500).json({ error: 'The school operation could not be completed. Please try again.' });
  }
}
function requireFields(values) { return values.every(Boolean); }

export function createOperationsRouter({ authenticate }) {
  const router = express.Router();
  router.use(authenticate);
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  router.get('/setup', async (req, res, next) => {
    const canConfigure = req.auth.account.permissions.includes('academics.configure');
    const teacherRead = req.auth.account.roles.includes('TEACHER') && req.auth.account.permissions.includes('attendance.read');
    if (canConfigure || teacherRead) return next();
    await close(req, false);
    return res.status(403).json({ error: 'You do not have permission to view school setup.' });
  }, async (req, res) => {
    try {
      const schoolId = req.auth.claims.schoolId;
      const isTeacher = req.auth.account.roles.includes('TEACHER') && !req.auth.account.permissions.includes('academics.configure');
      const [school, years, subjects, classes, teachers, students, assignments, educationLevels, gradeLevels, terms, curriculum, resources, periods, slots, assessments] = await Promise.all([
        req.auth.client.query('SELECT id, code, name, timezone FROM schools WHERE id = $1', [schoolId]),
        req.auth.client.query(`SELECT y.id, y.name, y.starts_on, y.ends_on, y.status FROM academic_years y WHERE y.school_id = $1 ${isTeacher ? 'AND EXISTS (SELECT 1 FROM teacher_subject_assignments a WHERE a.school_id = y.school_id AND a.academic_year_id = y.id AND a.teacher_id = $2)' : ''} ORDER BY y.starts_on DESC`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query(`SELECT s.id, s.code, s.name FROM subjects s WHERE s.school_id = $1 AND s.is_active ${isTeacher ? 'AND EXISTS (SELECT 1 FROM teacher_subject_assignments a WHERE a.school_id = s.school_id AND a.subject_id = s.id AND a.teacher_id = $2)' : ''} ORDER BY s.name`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query(`SELECT c.id, c.name, c.grade_level, c.section, y.name AS academic_year_name
          FROM class_groups c JOIN academic_years y ON y.school_id = c.school_id AND y.id = c.academic_year_id
          WHERE c.school_id = $1 ${isTeacher ? 'AND EXISTS (SELECT 1 FROM teacher_subject_assignments a WHERE a.school_id = c.school_id AND a.class_group_id = c.id AND a.teacher_id = $2)' : ''} ORDER BY y.starts_on DESC, c.grade_level, c.section`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query(`SELECT u.id, u.full_name, u.email, tp.employee_number
          FROM teacher_profiles tp JOIN user_accounts u ON u.school_id = tp.school_id AND u.id = tp.user_id
          WHERE tp.school_id = $1 AND tp.active AND u.status = 'ACTIVE' ${isTeacher ? 'AND u.id = $2' : ''} ORDER BY u.full_name`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query(`SELECT s.id, s.student_number, s.first_name, s.last_name, c.name AS class_name
          FROM students s LEFT JOIN class_enrollments ce ON ce.school_id = s.school_id AND ce.student_id = s.id AND ce.status = 'ACTIVE'
          LEFT JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id
          WHERE s.school_id = $1 AND s.status = 'ACTIVE' ${isTeacher ? 'AND EXISTS (SELECT 1 FROM class_enrollments scoped_ce JOIN teacher_subject_assignments scoped_a ON scoped_a.school_id = scoped_ce.school_id AND scoped_a.class_group_id = scoped_ce.class_group_id WHERE scoped_ce.school_id = s.school_id AND scoped_ce.student_id = s.id AND scoped_a.teacher_id = $2)' : ''} ORDER BY s.last_name, s.first_name`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query(`SELECT a.id, u.full_name AS teacher_name, s.name AS subject_name, c.name AS class_name, y.name AS academic_year_name
          FROM teacher_subject_assignments a JOIN teacher_profiles tp ON tp.school_id = a.school_id AND tp.user_id = a.teacher_id
          JOIN user_accounts u ON u.school_id = tp.school_id AND u.id = tp.user_id
          JOIN subjects s ON s.school_id = a.school_id AND s.id = a.subject_id
          JOIN class_groups c ON c.school_id = a.school_id AND c.id = a.class_group_id
          JOIN academic_years y ON y.school_id = a.school_id AND y.id = a.academic_year_id
          WHERE a.school_id = $1 AND a.effective_from <= CURRENT_DATE AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE) ${isTeacher ? 'AND a.teacher_id = $2' : ''}
          ORDER BY u.full_name, s.name, c.name`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query(`SELECT id, name, code FROM education_levels WHERE school_id = $1 AND active ORDER BY sort_order, name`, [schoolId]),
        req.auth.client.query(`SELECT g.id, g.education_level_id, g.name, g.code, e.name AS education_level_name FROM grade_levels g JOIN education_levels e ON e.school_id = g.school_id AND e.id = g.education_level_id WHERE g.school_id = $1 AND g.active ORDER BY e.sort_order, g.sort_order, g.name`, [schoolId]),
        req.auth.client.query(`SELECT id, academic_year_id, name FROM academic_terms WHERE school_id = $1 AND status <> 'CLOSED' ORDER BY starts_on`, [schoolId]),
        req.auth.client.query(`SELECT gc.id, gc.academic_year_id, gc.grade_level_id, gc.subject_id, gc.academic_term_id, gc.weekly_minutes, gc.periods_per_week, gc.required, gc.learning_objectives, g.name AS grade_name, s.name AS subject_name, y.name AS academic_year_name, t.name AS term_name FROM grade_curriculum_subjects gc JOIN grade_levels g ON g.school_id = gc.school_id AND g.id = gc.grade_level_id JOIN subjects s ON s.school_id = gc.school_id AND s.id = gc.subject_id JOIN academic_years y ON y.school_id = gc.school_id AND y.id = gc.academic_year_id LEFT JOIN academic_terms t ON t.school_id = gc.school_id AND t.id = gc.academic_term_id WHERE gc.school_id = $1 ${isTeacher ? 'AND EXISTS (SELECT 1 FROM teacher_subject_assignments a JOIN class_groups c ON c.school_id = a.school_id AND c.id = a.class_group_id WHERE a.school_id = gc.school_id AND a.teacher_id = $2 AND a.subject_id = gc.subject_id AND a.academic_year_id = gc.academic_year_id AND c.grade_level_id = gc.grade_level_id)' : ''} ORDER BY y.starts_on DESC, g.sort_order, s.name`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query(`SELECT r.id, r.curriculum_subject_id, r.resource_type, r.title, r.author, r.publisher, r.isbn, r.edition, r.description, r.resource_url, r.required, gc.grade_level_id, gc.subject_id FROM curriculum_resources r JOIN grade_curriculum_subjects gc ON gc.school_id = r.school_id AND gc.id = r.curriculum_subject_id WHERE r.school_id = $1 ${isTeacher ? 'AND EXISTS (SELECT 1 FROM teacher_subject_assignments a JOIN class_groups c ON c.school_id = a.school_id AND c.id = a.class_group_id WHERE a.school_id = gc.school_id AND a.teacher_id = $2 AND a.subject_id = gc.subject_id AND c.grade_level_id = gc.grade_level_id)' : ''} ORDER BY r.created_at DESC`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query('SELECT id, name, starts_at, ends_at FROM timetable_periods WHERE school_id = $1 ORDER BY starts_at', [schoolId]),
        req.auth.client.query(`SELECT ts.id, ts.teacher_assignment_id, ts.day_of_week, ts.effective_from, ts.effective_to, tp.name AS period_name, tp.starts_at, tp.ends_at, c.name AS class_name, s.name AS subject_name, u.full_name AS teacher_name FROM timetable_slots ts JOIN timetable_periods tp ON tp.school_id = ts.school_id AND tp.id = ts.period_id JOIN teacher_subject_assignments a ON a.school_id = ts.school_id AND a.id = ts.teacher_assignment_id JOIN class_groups c ON c.school_id = a.school_id AND c.id = a.class_group_id JOIN subjects s ON s.school_id = a.school_id AND s.id = a.subject_id JOIN user_accounts u ON u.school_id = a.school_id AND u.id = a.teacher_id WHERE ts.school_id = $1 ${isTeacher ? 'AND a.teacher_id = $2' : ''} ORDER BY ts.day_of_week, tp.starts_at`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query(`SELECT a.id, a.teacher_assignment_id, a.title, a.assessment_type, a.max_score, a.due_at, a.status, a.created_at,
            c.name AS class_name, s.name AS subject_name, u.full_name AS teacher_name,
            COUNT(sc.id)::int AS scored_students
          FROM assessments a
          JOIN teacher_subject_assignments ta ON ta.school_id = a.school_id AND ta.id = a.teacher_assignment_id
          JOIN class_groups c ON c.school_id = ta.school_id AND c.id = ta.class_group_id
          JOIN subjects s ON s.school_id = ta.school_id AND s.id = ta.subject_id
          JOIN user_accounts u ON u.school_id = ta.school_id AND u.id = ta.teacher_id
          LEFT JOIN assessment_scores sc ON sc.school_id = a.school_id AND sc.assessment_id = a.id
          WHERE a.school_id = $1 ${isTeacher ? 'AND ta.teacher_id = $2' : ''}
          GROUP BY a.id, c.name, s.name, u.full_name ORDER BY a.created_at DESC LIMIT 100`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
      ]);
      await close(req, true);
      return res.json({ school: school.rows[0], years: years.rows, subjects: subjects.rows, classes: classes.rows,
        teachers: teachers.rows, students: students.rows, assignments: assignments.rows, educationLevels: educationLevels.rows, gradeLevels: gradeLevels.rows, terms: terms.rows,
        curriculum: curriculum.rows, resources: resources.rows, periods: periods.rows, timetable: slots.rows, assessments: assessments.rows });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/academic-years', needsPermission('academics.configure'), csrf, async (req, res) => {
    const name = text(req.body?.name);
    const startsOn = req.body?.startsOn;
    const endsOn = req.body?.endsOn;
    if (!name || !validDate(startsOn) || !validDate(endsOn) || endsOn <= startsOn) {
      await close(req, false); return res.status(400).json({ error: 'Enter an academic year name and valid start/end dates.' });
    }
    try {
      const result = await req.auth.client.query(`INSERT INTO academic_years (school_id, name, starts_on, ends_on)
        VALUES ($1, $2, $3, $4) RETURNING id, name, starts_on, ends_on, status`, [req.auth.claims.schoolId, name, startsOn, endsOn]);
      await audit(req, 'ACADEMIC_YEAR_CREATED', 'ACADEMIC_YEAR', result.rows[0].id, { name });
      return done(req, res, 201, { academicYear: result.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/subjects', needsPermission('academics.configure'), csrf, async (req, res) => {
    const code = text(req.body?.code, 30).toUpperCase(); const name = text(req.body?.name);
    if (!/^[A-Z0-9_-]{2,30}$/.test(code) || !name) { await close(req, false); return res.status(400).json({ error: 'Enter a subject name and a code (2–30 letters or numbers).' }); }
    try {
      const result = await req.auth.client.query(`INSERT INTO subjects (school_id, code, name) VALUES ($1, $2, $3) RETURNING id, code, name`, [req.auth.claims.schoolId, code, name]);
      await audit(req, 'SUBJECT_CREATED', 'SUBJECT', result.rows[0].id, { code, name });
      return done(req, res, 201, { subject: result.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/education-levels', needsPermission('academics.configure'), csrf, async (req, res) => {
    const code = text(req.body?.code, 30).toUpperCase(); const name = text(req.body?.name);
    if (!/^[A-Z0-9_-]{2,30}$/.test(code) || !name) { await close(req, false); return res.status(400).json({ error: 'Enter an education stage name and a short code.' }); }
    try {
      const result = await req.auth.client.query(`INSERT INTO education_levels (school_id, code, name) VALUES ($1, $2, $3) RETURNING id, code, name`, [req.auth.claims.schoolId, code, name]);
      await audit(req, 'EDUCATION_LEVEL_CREATED', 'EDUCATION_LEVEL', result.rows[0].id, { code, name });
      return done(req, res, 201, { educationLevel: result.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/grade-levels', needsPermission('academics.configure'), csrf, async (req, res) => {
    const educationLevelId = text(req.body?.educationLevelId, 50); const code = text(req.body?.code, 30).toUpperCase(); const name = text(req.body?.name);
    if (!educationLevelId || !/^[A-Z0-9_-]{1,30}$/.test(code) || !name) { await close(req, false); return res.status(400).json({ error: 'Select an education stage and enter a grade name and code.' }); }
    try {
      const result = await req.auth.client.query(`INSERT INTO grade_levels (school_id, education_level_id, code, name) SELECT $1, id, $3, $4 FROM education_levels WHERE school_id = $1 AND id = $2 AND active RETURNING id, education_level_id, code, name`, [req.auth.claims.schoolId, educationLevelId, code, name]);
      if (!result.rowCount) { await close(req, false); return res.status(400).json({ error: 'Select an education stage in this school.' }); }
      await audit(req, 'GRADE_LEVEL_CREATED', 'GRADE_LEVEL', result.rows[0].id, { code, name, educationLevelId });
      return done(req, res, 201, { gradeLevel: result.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/classes', needsPermission('academics.configure'), csrf, async (req, res) => {
    const academicYearId = text(req.body?.academicYearId, 50); const name = text(req.body?.name);
    const gradeLevel = text(req.body?.gradeLevel, 40); const section = text(req.body?.section, 40);
    if (!academicYearId || !name || !gradeLevel || !section) { await close(req, false); return res.status(400).json({ error: 'Enter the academic year, class name, grade, and section.' }); }
    try {
      const gradeLevelId = text(req.body?.gradeLevelId, 50) || null;
      const result = await req.auth.client.query(`INSERT INTO class_groups (school_id, academic_year_id, name, grade_level, section, grade_level_id, education_level_id)
        SELECT $1, y.id, $3, $4, $5, g.id, g.education_level_id FROM academic_years y LEFT JOIN grade_levels g ON g.school_id = y.school_id AND g.id = $6 AND g.active WHERE y.school_id = $1 AND y.id = $2 AND ($6::uuid IS NULL OR g.id IS NOT NULL) RETURNING id, name, grade_level, section, academic_year_id, grade_level_id`, [req.auth.claims.schoolId, academicYearId, name, gradeLevel, section, gradeLevelId]);
      if (!result.rowCount) { await close(req, false); return res.status(400).json({ error: 'The selected academic year or grade does not belong to this school.' }); }
      await audit(req, 'CLASS_GROUP_CREATED', 'CLASS_GROUP', result.rows[0].id, { name, gradeLevel, section });
      return done(req, res, 201, { classGroup: result.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/students', needsPermission('students.write'), csrf, async (req, res) => {
    const studentNumber = text(req.body?.studentNumber, 40).toUpperCase(); const firstName = text(req.body?.firstName);
    const lastName = text(req.body?.lastName); const classGroupId = text(req.body?.classGroupId, 50);
    if (!studentNumber || !firstName || !lastName || !classGroupId) { await close(req, false); return res.status(400).json({ error: 'Enter the student ID, first name, last name, and class.' }); }
    try {
      const existingStudent = await req.auth.client.query(`SELECT s.id, EXISTS (SELECT 1 FROM class_enrollments ce WHERE ce.school_id = s.school_id AND ce.student_id = s.id AND ce.status = 'ACTIVE') AS actively_enrolled
        FROM students s WHERE s.school_id = $1 AND s.student_number = $2`, [req.auth.claims.schoolId, studentNumber]);
      if (existingStudent.rows[0]?.actively_enrolled) { await close(req, false); return res.status(409).json({ error: 'This student already has an active class enrollment. Use the transfer workflow to change classes.' }); }
      const classLock = await req.auth.client.query('SELECT id FROM class_groups WHERE school_id = $1 AND id = $2 FOR UPDATE', [req.auth.claims.schoolId, classGroupId]);
      if (!classLock.rowCount) { await close(req, false); return res.status(400).json({ error: 'Choose a class that belongs to this school.' }); }
      const student = await req.auth.client.query(`INSERT INTO students (school_id, student_number, first_name, last_name)
        VALUES ($1, $2, $3, $4) RETURNING id, student_number, first_name, last_name`, [req.auth.claims.schoolId, studentNumber, firstName, lastName]);
      await req.auth.client.query(`INSERT INTO class_enrollments (school_id, student_id, class_group_id) VALUES ($1, $2, $3)`, [req.auth.claims.schoolId, student.rows[0].id, classGroupId]);
      await audit(req, 'STUDENT_CREATED_AND_ENROLLED', 'STUDENT', student.rows[0].id, { studentNumber, classGroupId });
      return done(req, res, 201, { student: student.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/portal-accounts', needsPermission('users.manage'), csrf, async (req, res) => {
    const type = text(req.body?.type, 20).toUpperCase(); const studentId = text(req.body?.studentId, 50);
    const fullName = text(req.body?.fullName); const email = text(req.body?.email, 254).toLowerCase();
    const relationship = text(req.body?.relationship, 50);
    if (!['STUDENT', 'PARENT'].includes(type) || !studentId || !fullName || !EMAIL_RE.test(email) || (type === 'PARENT' && !relationship)) {
      await close(req, false); return res.status(400).json({ error: 'Choose the learner, account type, name, email, and (for guardians) relationship.' });
    }
    try {
      const schoolId = req.auth.claims.schoolId;
      const student = await req.auth.client.query('SELECT id FROM students WHERE school_id = $1 AND id = $2', [schoolId, studentId]);
      if (!student.rowCount) { await close(req, false); return res.status(400).json({ error: 'Choose a learner from this school.' }); }
      const existingLink = type === 'STUDENT'
        ? await req.auth.client.query('SELECT 1 FROM student_portal_links WHERE school_id = $1 AND student_id = $2', [schoolId, studentId])
        : await req.auth.client.query('SELECT 1 FROM student_guardians sg JOIN guardians g ON g.school_id = sg.school_id AND g.id = sg.guardian_id WHERE sg.school_id = $1 AND sg.student_id = $2 AND g.email = $3', [schoolId, studentId, email]);
      if (existingLink.rowCount) { await close(req, false); return res.status(409).json({ error: 'This learner already has that portal link.' }); }
      const temporaryPassword = randomBytes(18).toString('base64url'); const passwordHash = await hashPassword(temporaryPassword);
      const account = await req.auth.client.query(`INSERT INTO user_accounts (school_id, email, password_hash, full_name, role, status, must_reset_password) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', true) RETURNING id, email, full_name, role`, [schoolId, email, passwordHash, fullName, type]);
      await req.auth.client.query(`INSERT INTO user_role_assignments (school_id, user_id, role_id, assigned_by) SELECT $1, $2, id, $3 FROM school_roles WHERE school_id = $1 AND code = $4`, [schoolId, account.rows[0].id, req.auth.claims.userId, type]);
      if (type === 'STUDENT') {
        await req.auth.client.query('INSERT INTO student_portal_links (school_id, student_id, user_id, linked_by) VALUES ($1, $2, $3, $4)', [schoolId, studentId, account.rows[0].id, req.auth.claims.userId]);
      } else {
        const parts = fullName.trim().split(/\s+/); const firstName = parts[0]; const lastName = parts.slice(1).join(' ') || parts[0];
        const guardian = await req.auth.client.query(`INSERT INTO guardians (school_id, user_id, first_name, last_name, email) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [schoolId, account.rows[0].id, firstName, lastName, email]);
        await req.auth.client.query(`INSERT INTO student_guardians (school_id, student_id, guardian_id, relationship, can_view_results, can_view_finance, communication_consent) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [schoolId, studentId, guardian.rows[0].id, relationship, req.body?.canViewResults !== false, Boolean(req.body?.canViewFinance), Boolean(req.body?.communicationConsent)]);
      }
      await audit(req, 'PORTAL_ACCOUNT_CREATED', `${type}_PORTAL`, account.rows[0].id, { studentId });
      return done(req, res, 201, { account: account.rows[0], temporaryPassword, notice: 'Copy this temporary password and share it securely. It is shown only once.' });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/teachers', needsPermission('staff.write'), csrf, async (req, res) => {
    const fullName = text(req.body?.fullName); const email = text(req.body?.email, 254).toLowerCase();
    const employeeNumber = text(req.body?.employeeNumber, 40).toUpperCase();
    if (!fullName || !EMAIL_RE.test(email) || !employeeNumber) { await close(req, false); return res.status(400).json({ error: 'Enter the teacher name, valid email, and employee number.' }); }
    try {
      const temporaryPassword = randomBytes(18).toString('base64url');
      const passwordHash = await hashPassword(temporaryPassword);
      const schoolId = req.auth.claims.schoolId;
      const account = await req.auth.client.query(`INSERT INTO user_accounts
        (school_id, email, password_hash, full_name, role, status, must_reset_password)
        VALUES ($1, $2, $3, $4, 'TEACHER', 'ACTIVE', true) RETURNING id, email, full_name`,
      [schoolId, email, passwordHash, fullName]);
      const teacherId = account.rows[0].id;
      await req.auth.client.query(`INSERT INTO user_role_assignments (school_id, user_id, role_id, assigned_by)
        SELECT $1, $2, id, $3 FROM school_roles WHERE school_id = $1 AND code = 'TEACHER'`, [schoolId, teacherId, req.auth.claims.userId]);
      const staff = await req.auth.client.query(`INSERT INTO staff_records (school_id, user_id, employee_number, first_name, last_name, email, job_title)
        VALUES ($1, $2, $3, $4, $5, $6, 'Teacher') RETURNING id`,
      [schoolId, teacherId, employeeNumber, fullName.split(/\s+/)[0], fullName.split(/\s+/).slice(1).join(' ') || fullName, email]);
      await req.auth.client.query(`INSERT INTO teacher_profiles (school_id, user_id, employee_number, employment_type, active, staff_record_id)
        VALUES ($1, $2, $3, 'FULL_TIME', true, $4)`, [schoolId, teacherId, employeeNumber, staff.rows[0].id]);
      await audit(req, 'TEACHER_CREATED', 'TEACHER', teacherId, { employeeNumber });
      return done(req, res, 201, { teacher: { ...account.rows[0], employee_number: employeeNumber }, temporaryPassword,
        notice: 'Copy this temporary password and provide it securely to the teacher. It is shown only once.' });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/teacher-assignments', needsPermission('academics.configure'), csrf, async (req, res) => {
    const teacherId = text(req.body?.teacherId, 50); const subjectId = text(req.body?.subjectId, 50);
    const classGroupId = text(req.body?.classGroupId, 50); const academicYearId = text(req.body?.academicYearId, 50);
    const effectiveFrom = req.body?.effectiveFrom;
    if (!requireFields([teacherId, subjectId, classGroupId, academicYearId]) || !validDate(effectiveFrom)) { await close(req, false); return res.status(400).json({ error: 'Select the teacher, subject, class, academic year, and effective date.' }); }
    try {
      const existing = await req.auth.client.query(`SELECT 1 FROM teacher_subject_assignments WHERE school_id = $1 AND teacher_id = $2 AND subject_id = $3 AND class_group_id = $4 AND academic_year_id = $5 AND (effective_to IS NULL OR effective_to >= $6) LIMIT 1`, [req.auth.claims.schoolId, teacherId, subjectId, classGroupId, academicYearId, effectiveFrom]);
      if (existing.rowCount) { await close(req, false); return res.status(409).json({ error: 'This teacher is already assigned to that subject and class for the selected year.' }); }
      const result = await req.auth.client.query(`INSERT INTO teacher_subject_assignments
        (school_id, teacher_id, subject_id, class_group_id, academic_year_id, assigned_by, effective_from)
        SELECT $1, tp.user_id, s.id, c.id, y.id, $6, $7 FROM teacher_profiles tp
        JOIN subjects s ON s.school_id = tp.school_id AND s.id = $3 AND s.is_active
        JOIN class_groups c ON c.school_id = tp.school_id AND c.id = $4 AND c.academic_year_id = $5
        JOIN academic_years y ON y.school_id = tp.school_id AND y.id = $5
        WHERE tp.school_id = $1 AND tp.user_id = $2 AND tp.active
        RETURNING id, teacher_id, subject_id, class_group_id, academic_year_id, effective_from`,
      [req.auth.claims.schoolId, teacherId, subjectId, classGroupId, academicYearId, req.auth.claims.userId, effectiveFrom]);
      if (!result.rowCount) { await close(req, false); return res.status(400).json({ error: 'The teacher, subject, class, or academic year is inactive or mismatched.' }); }
      await audit(req, 'TEACHER_SUBJECT_ASSIGNED', 'TEACHER_ASSIGNMENT', result.rows[0].id, { teacherId, subjectId, classGroupId });
      return done(req, res, 201, { assignment: result.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/curriculum', needsPermission('curriculum.manage'), csrf, async (req, res) => {
    const academicYearId = text(req.body?.academicYearId, 50); const gradeLevelId = text(req.body?.gradeLevelId, 50);
    const subjectId = text(req.body?.subjectId, 50); const termId = text(req.body?.termId, 50) || null;
    const weeklyMinutes = Number(req.body?.weeklyMinutes); const periodsPerWeek = Number(req.body?.periodsPerWeek);
    const objectives = text(req.body?.learningObjectives, 2000);
    if (!academicYearId || !gradeLevelId || !subjectId || !Number.isInteger(weeklyMinutes) || weeklyMinutes < 1 || weeklyMinutes > 3000 || !Number.isInteger(periodsPerWeek) || periodsPerWeek < 1 || periodsPerWeek > 50) {
      await close(req, false); return res.status(400).json({ error: 'Choose the year, grade and subject, then enter valid weekly minutes and periods.' });
    }
    try {
      const result = await req.auth.client.query(`INSERT INTO grade_curriculum_subjects (school_id, academic_year_id, grade_level_id, subject_id, academic_term_id, weekly_minutes, periods_per_week, learning_objectives, created_by)
        SELECT $1, y.id, g.id, s.id, t.id, $5, $6, NULLIF($7, ''), $8 FROM academic_years y JOIN grade_levels g ON g.school_id = y.school_id AND g.id = $3 AND g.active JOIN subjects s ON s.school_id = y.school_id AND s.id = $4 AND s.is_active LEFT JOIN academic_terms t ON t.school_id = y.school_id AND t.id = $9 AND t.academic_year_id = y.id WHERE y.school_id = $1 AND y.id = $2 AND ($9::uuid IS NULL OR t.id IS NOT NULL)
        RETURNING id, academic_year_id, grade_level_id, subject_id, academic_term_id, weekly_minutes, periods_per_week, required`, [req.auth.claims.schoolId, academicYearId, gradeLevelId, subjectId, weeklyMinutes, periodsPerWeek, objectives, req.auth.claims.userId, termId]);
      if (!result.rowCount) { await close(req, false); return res.status(400).json({ error: 'The selected year, grade, subject or term is not valid for this school.' }); }
      await audit(req, 'CURRICULUM_SUBJECT_CONFIGURED', 'CURRICULUM_SUBJECT', result.rows[0].id, { gradeLevelId, subjectId, weeklyMinutes, periodsPerWeek });
      return done(req, res, 201, { curriculum: result.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/resources', needsPermission('curriculum.manage'), csrf, async (req, res) => {
    const curriculumSubjectId = text(req.body?.curriculumSubjectId, 50); const type = text(req.body?.resourceType, 30).toUpperCase();
    const title = text(req.body?.title); const author = text(req.body?.author, 150); const publisher = text(req.body?.publisher, 150);
    const isbn = text(req.body?.isbn, 30); const edition = text(req.body?.edition, 80); const description = text(req.body?.description, 2000);
    const url = text(req.body?.resourceUrl, 1000);
    if (!curriculumSubjectId || !title || !['TEXTBOOK', 'BOOK', 'WORKBOOK', 'TEACHING_MATERIAL', 'LINK', 'OTHER'].includes(type) || (url && (!/^https:\/\//i.test(url) || url.length > 1000)) || (type === 'LINK' && !url)) {
      await close(req, false); return res.status(400).json({ error: 'Enter a title, valid resource type and (if used) a secure HTTPS link.' });
    }
    try {
      const result = await req.auth.client.query(`INSERT INTO curriculum_resources (school_id, curriculum_subject_id, resource_type, title, author, publisher, isbn, edition, description, resource_url, required, visible_to_students, visible_to_guardians, created_by)
        SELECT $1, gc.id, $3, $4, NULLIF($5,''), NULLIF($6,''), NULLIF($7,''), NULLIF($8,''), NULLIF($9,''), NULLIF($10,''), $11, $12, $13, $14 FROM grade_curriculum_subjects gc WHERE gc.school_id = $1 AND gc.id = $2
        RETURNING id, curriculum_subject_id, resource_type, title, author, publisher, isbn, edition, description, resource_url, required, visible_to_students, visible_to_guardians`, [req.auth.claims.schoolId, curriculumSubjectId, type, title, author, publisher, isbn, edition, description, url, Boolean(req.body?.required), req.body?.visibleToStudents !== false, req.body?.visibleToGuardians !== false, req.auth.claims.userId]);
      if (!result.rowCount) { await close(req, false); return res.status(400).json({ error: 'Choose a curriculum subject that belongs to this school.' }); }
      await audit(req, 'CURRICULUM_RESOURCE_CREATED', 'CURRICULUM_RESOURCE', result.rows[0].id, { type, title });
      return done(req, res, 201, { resource: result.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/assessments', needsPermission('grades.enter'), csrf, async (req, res) => {
    const assignmentId = text(req.body?.assignmentId, 50);
    const title = text(req.body?.title, 160);
    const type = text(req.body?.assessmentType, 20).toUpperCase();
    const maxScore = Number(req.body?.maxScore);
    const dueAt = req.body?.dueAt ? new Date(req.body.dueAt) : null;
    if (!assignmentId || !title || !['QUIZ', 'TEST', 'EXAM', 'ASSIGNMENT', 'PROJECT'].includes(type) || !Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 9999.99 || (dueAt && !Number.isFinite(dueAt.valueOf()))) {
      await close(req, false); return res.status(400).json({ error: 'Choose an assigned class and subject, enter a title, assessment type, maximum score, and valid optional due date.' });
    }
    const isTeacher = req.auth.account.roles.includes('TEACHER');
    try {
      const result = await req.auth.client.query(`INSERT INTO assessments
          (school_id, teacher_assignment_id, created_by, title, assessment_type, max_score, due_at, status)
        SELECT $1, ta.id, $3, $4, $5, $6, $7, 'OPEN'
        FROM teacher_subject_assignments ta
        WHERE ta.school_id = $1 AND ta.id = $2
          AND ta.effective_from <= CURRENT_DATE AND (ta.effective_to IS NULL OR ta.effective_to >= CURRENT_DATE)
          AND ($8::boolean = false OR ta.teacher_id = $3)
        RETURNING id, teacher_assignment_id, title, assessment_type, max_score, due_at, status`,
      [req.auth.claims.schoolId, assignmentId, req.auth.claims.userId, title, type, maxScore, dueAt, isTeacher]);
      if (!result.rowCount) { await close(req, false); return res.status(403).json({ error: 'You can create assessments only for an active teaching assignment you are authorized to manage.' }); }
      await audit(req, 'ASSESSMENT_CREATED', 'ASSESSMENT', result.rows[0].id, { assignmentId, type, maxScore });
      return done(req, res, 201, { assessment: result.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.get('/assessments/:assessmentId/roster', needsAnyPermission(['grades.enter', 'grades.moderate', 'grades.publish']), async (req, res) => {
    const assessmentId = text(req.params.assessmentId, 50);
    const isTeacher = req.auth.account.roles.includes('TEACHER') && !req.auth.account.permissions.includes('grades.moderate');
    try {
      const result = await req.auth.client.query(`SELECT a.id AS assessment_id, a.title, a.assessment_type, a.max_score, a.status,
          ta.id AS assignment_id, c.name AS class_name, s.name AS subject_name,
          st.id AS student_id, st.student_number, st.first_name, st.last_name, sc.score, sc.feedback
        FROM assessments a
        JOIN teacher_subject_assignments ta ON ta.school_id = a.school_id AND ta.id = a.teacher_assignment_id
        JOIN class_groups c ON c.school_id = ta.school_id AND c.id = ta.class_group_id
        JOIN subjects s ON s.school_id = ta.school_id AND s.id = ta.subject_id
        JOIN class_enrollments ce ON ce.school_id = ta.school_id AND ce.class_group_id = ta.class_group_id AND ce.status = 'ACTIVE'
        JOIN students st ON st.school_id = ce.school_id AND st.id = ce.student_id AND st.status = 'ACTIVE'
        LEFT JOIN assessment_scores sc ON sc.school_id = a.school_id AND sc.assessment_id = a.id AND sc.student_id = st.id
        WHERE a.school_id = $1 AND a.id = $2 AND ($3::boolean = false OR ta.teacher_id = $4)
        ORDER BY st.last_name, st.first_name`, [req.auth.claims.schoolId, assessmentId, isTeacher, req.auth.claims.userId]);
      if (!result.rowCount) { await close(req, false); return res.status(404).json({ error: 'Assessment not found, or no active students are enrolled in its class.' }); }
      await close(req, true);
      const first = result.rows[0];
      return res.json({ assessment: { id: first.assessment_id, title: first.title, type: first.assessment_type, maxScore: first.max_score, status: first.status, assignmentId: first.assignment_id, className: first.class_name, subjectName: first.subject_name }, students: result.rows.map(row => ({ id: row.student_id, studentNumber: row.student_number, firstName: row.first_name, lastName: row.last_name, score: row.score, feedback: row.feedback })) });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/assessments/:assessmentId/scores', needsPermission('grades.enter'), csrf, async (req, res) => {
    const assessmentId = text(req.params.assessmentId, 50);
    const entries = req.body?.scores;
    if (!assessmentId || !Array.isArray(entries) || entries.length < 1 || entries.length > 500) {
      await close(req, false); return res.status(400).json({ error: 'Provide marks for at least one enrolled student.' });
    }
    const normalized = entries.map(item => ({
      studentId: text(item?.studentId, 50),
      score: Number(item?.score),
      feedback: text(item?.feedback, 1000),
    }));
    if (normalized.some(item => !item.studentId || !Number.isFinite(item.score) || item.score < 0) || new Set(normalized.map(item => item.studentId)).size !== normalized.length) {
      await close(req, false); return res.status(400).json({ error: 'Each student needs one valid mark. Marks cannot be negative.' });
    }
    const isTeacher = req.auth.account.roles.includes('TEACHER');
    try {
      for (const item of normalized) {
        const result = await req.auth.client.query(`INSERT INTO assessment_scores (school_id, assessment_id, student_id, score, feedback, entered_by)
          SELECT $1, a.id, st.id, $5, NULLIF($6, ''), $4
          FROM assessments a
          JOIN teacher_subject_assignments ta ON ta.school_id = a.school_id AND ta.id = a.teacher_assignment_id
          JOIN class_enrollments ce ON ce.school_id = ta.school_id AND ce.class_group_id = ta.class_group_id AND ce.status = 'ACTIVE'
          JOIN students st ON st.school_id = ce.school_id AND st.id = ce.student_id AND st.status = 'ACTIVE'
          WHERE a.school_id = $1 AND a.id = $2 AND a.status = 'OPEN' AND st.id = $3
            AND $5 <= a.max_score AND ($7::boolean = false OR ta.teacher_id = $4)
          ON CONFLICT (school_id, assessment_id, student_id) DO UPDATE SET score = EXCLUDED.score, feedback = EXCLUDED.feedback, entered_by = EXCLUDED.entered_by
          RETURNING id`, [req.auth.claims.schoolId, assessmentId, item.studentId, req.auth.claims.userId, item.score, item.feedback, isTeacher]);
        if (!result.rowCount) { await close(req, false); return res.status(400).json({ error: 'A mark exceeds the assessment maximum, belongs to a non-enrolled student, or the assessment is no longer open.' }); }
      }
      await audit(req, 'ASSESSMENT_SCORES_SAVED', 'ASSESSMENT', assessmentId, { count: normalized.length });
      return done(req, res, 200, { saved: normalized.length });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/assessments/:assessmentId/submit', needsPermission('grades.enter'), csrf, async (req, res) => {
    const assessmentId = text(req.params.assessmentId, 50);
    const isTeacher = req.auth.account.roles.includes('TEACHER');
    try {
      const completeness = await req.auth.client.query(`SELECT a.id, ta.teacher_id,
          COUNT(DISTINCT st.id)::int AS enrolled_count, COUNT(DISTINCT sc.student_id)::int AS scored_count
        FROM assessments a
        JOIN teacher_subject_assignments ta ON ta.school_id = a.school_id AND ta.id = a.teacher_assignment_id
        JOIN class_enrollments ce ON ce.school_id = ta.school_id AND ce.class_group_id = ta.class_group_id AND ce.status = 'ACTIVE'
        JOIN students st ON st.school_id = ce.school_id AND st.id = ce.student_id AND st.status = 'ACTIVE'
        LEFT JOIN assessment_scores sc ON sc.school_id = a.school_id AND sc.assessment_id = a.id AND sc.student_id = st.id
        WHERE a.school_id = $1 AND a.id = $2 AND a.status = 'OPEN' AND ($3::boolean = false OR ta.teacher_id = $4)
        GROUP BY a.id, ta.teacher_id`, [req.auth.claims.schoolId, assessmentId, isTeacher, req.auth.claims.userId]);
      const row = completeness.rows[0];
      if (!row || Number(row.enrolled_count) === 0 || Number(row.enrolled_count) !== Number(row.scored_count)) {
        await close(req, false); return res.status(400).json({ error: 'Enter marks for every active student in the class before submitting for review.' });
      }
      await req.auth.client.query(`UPDATE assessments SET status = 'SUBMITTED_FOR_REVIEW' WHERE school_id = $1 AND id = $2 AND status = 'OPEN'`, [req.auth.claims.schoolId, assessmentId]);
      await audit(req, 'ASSESSMENT_SUBMITTED_FOR_REVIEW', 'ASSESSMENT', assessmentId, { scoredStudents: row.scored_count });
      return done(req, res, 200, { submitted: true });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/assessments/:assessmentId/approve', needsPermission('grades.moderate'), csrf, async (req, res) => {
    const assessmentId = text(req.params.assessmentId, 50);
    try {
      const result = await req.auth.client.query(`UPDATE assessments a SET status = 'APPROVED'
        FROM teacher_subject_assignments ta
        WHERE a.school_id = $1 AND a.id = $2 AND a.status = 'SUBMITTED_FOR_REVIEW'
          AND ta.school_id = a.school_id AND ta.id = a.teacher_assignment_id AND a.created_by <> $3
        RETURNING a.id`, [req.auth.claims.schoolId, assessmentId, req.auth.claims.userId]);
      if (!result.rowCount) { await close(req, false); return res.status(403).json({ error: 'Only an authorized reviewer other than the assessment creator can approve submitted marks.' }); }
      await req.auth.client.query(`UPDATE assessment_scores SET moderated_by = $3, moderated_at = now() WHERE school_id = $1 AND assessment_id = $2`, [req.auth.claims.schoolId, assessmentId, req.auth.claims.userId]);
      await audit(req, 'ASSESSMENT_APPROVED', 'ASSESSMENT', assessmentId);
      return done(req, res, 200, { approved: true });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/assessments/:assessmentId/publish', needsPermission('grades.publish'), csrf, async (req, res) => {
    const assessmentId = text(req.params.assessmentId, 50);
    try {
      const result = await req.auth.client.query(`UPDATE assessments a SET status = 'PUBLISHED'
        WHERE a.school_id = $1 AND a.id = $2 AND a.status = 'APPROVED'
          AND EXISTS (SELECT 1 FROM assessment_scores sc WHERE sc.school_id = a.school_id AND sc.assessment_id = a.id)
        RETURNING a.id`, [req.auth.claims.schoolId, assessmentId]);
      if (!result.rowCount) { await close(req, false); return res.status(400).json({ error: 'Only an approved assessment with recorded marks can be published.' }); }
      await req.auth.client.query(`UPDATE assessment_scores SET published_at = now() WHERE school_id = $1 AND assessment_id = $2`, [req.auth.claims.schoolId, assessmentId]);
      await audit(req, 'ASSESSMENT_PUBLISHED', 'ASSESSMENT', assessmentId);
      return done(req, res, 200, { published: true });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/periods', needsPermission('timetable.manage'), csrf, async (req, res) => {
    const name = text(req.body?.name, 80); const startsAt = text(req.body?.startsAt, 8); const endsAt = text(req.body?.endsAt, 8);
    if (!name || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startsAt) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endsAt) || endsAt <= startsAt) {
      await close(req, false); return res.status(400).json({ error: 'Enter a period name and valid start/end times.' });
    }
    try {
      const result = await req.auth.client.query(`INSERT INTO timetable_periods (school_id, name, starts_at, ends_at) VALUES ($1, $2, $3, $4) RETURNING id, name, starts_at, ends_at`, [req.auth.claims.schoolId, name, startsAt, endsAt]);
      await audit(req, 'TIMETABLE_PERIOD_CREATED', 'TIMETABLE_PERIOD', result.rows[0].id, { name, startsAt, endsAt });
      return done(req, res, 201, { period: result.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/timetable', needsPermission('timetable.manage'), csrf, async (req, res) => {
    const assignmentId = text(req.body?.assignmentId, 50); const periodId = text(req.body?.periodId, 50);
    const day = Number(req.body?.dayOfWeek); const effectiveFrom = req.body?.effectiveFrom; const effectiveTo = req.body?.effectiveTo || null;
    if (!assignmentId || !periodId || !Number.isInteger(day) || day < 1 || day > 7 || !validDate(effectiveFrom) || (effectiveTo && (!validDate(effectiveTo) || effectiveTo < effectiveFrom))) {
      await close(req, false); return res.status(400).json({ error: 'Choose a class/teacher assignment, period, weekday and valid date range.' });
    }
    try {
      const conflict = await req.auth.client.query(`SELECT 1 FROM timetable_slots other JOIN teacher_subject_assignments old_a ON old_a.school_id = other.school_id AND old_a.id = other.teacher_assignment_id JOIN timetable_periods old_p ON old_p.school_id = other.school_id AND old_p.id = other.period_id JOIN teacher_subject_assignments new_a ON new_a.school_id = $1 AND new_a.id = $2 JOIN timetable_periods new_p ON new_p.school_id = $1 AND new_p.id = $3 WHERE other.school_id = $1 AND other.day_of_week = $4 AND COALESCE(other.effective_to, 'infinity'::date) >= $5::date AND COALESCE($6::date, 'infinity'::date) >= other.effective_from AND (old_a.teacher_id = new_a.teacher_id OR old_a.class_group_id = new_a.class_group_id) AND old_p.starts_at < new_p.ends_at AND new_p.starts_at < old_p.ends_at LIMIT 1`, [req.auth.claims.schoolId, assignmentId, periodId, day, effectiveFrom, effectiveTo]);
      if (conflict.rowCount) { await close(req, false); return res.status(409).json({ error: 'That teacher or class already has a lesson during this time.' }); }
      const result = await req.auth.client.query(`INSERT INTO timetable_slots (school_id, teacher_assignment_id, period_id, day_of_week, effective_from, effective_to)
        SELECT $1, a.id, p.id, $4, $5, $6 FROM teacher_subject_assignments a JOIN timetable_periods p ON p.school_id = a.school_id AND p.id = $3 WHERE a.school_id = $1 AND a.id = $2 AND (a.effective_to IS NULL OR a.effective_to >= $5) RETURNING id, teacher_assignment_id, period_id, day_of_week, effective_from, effective_to`, [req.auth.claims.schoolId, assignmentId, periodId, day, effectiveFrom, effectiveTo]);
      if (!result.rowCount) { await close(req, false); return res.status(400).json({ error: 'The selected assignment or period does not belong to this school.' }); }
      await audit(req, 'TIMETABLE_SLOT_CREATED', 'TIMETABLE_SLOT', result.rows[0].id, { assignmentId, periodId, day });
      return done(req, res, 201, { timetableSlot: result.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.get('/portal', async (req, res) => {
    try {
      const schoolId = req.auth.claims.schoolId; const userId = req.auth.claims.userId;
      if (req.auth.account.roles.includes('STUDENT') && req.auth.account.permissions.includes('student.portal.read')) {
        const student = await req.auth.client.query(`SELECT s.id, s.student_number, s.first_name, s.last_name, c.name AS class_name, c.grade_level, y.name AS academic_year FROM student_portal_links l JOIN students s ON s.school_id = l.school_id AND s.id = l.student_id LEFT JOIN class_enrollments ce ON ce.school_id = s.school_id AND ce.student_id = s.id AND ce.status = 'ACTIVE' LEFT JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id LEFT JOIN academic_years y ON y.school_id = c.school_id AND y.id = c.academic_year_id WHERE l.school_id = $1 AND l.user_id = $2 LIMIT 1`, [schoolId, userId]);
        if (!student.rowCount) { await close(req, true); return res.json({ role: 'STUDENT', linked: false, message: 'Your learner portal is not linked to a student record yet.' }); }
        const learner = student.rows[0];
        const [subjects, timetable, attendance, grades, resources] = await Promise.all([
          req.auth.client.query(`SELECT DISTINCT s.name AS subject_name, gc.weekly_minutes, gc.periods_per_week, gc.required, gc.learning_objectives FROM class_enrollments ce JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id JOIN grade_curriculum_subjects gc ON gc.school_id = c.school_id AND gc.grade_level_id = c.grade_level_id AND gc.academic_year_id = c.academic_year_id JOIN subjects s ON s.school_id = gc.school_id AND s.id = gc.subject_id WHERE ce.school_id = $1 AND ce.student_id = $2 AND ce.status = 'ACTIVE' ORDER BY s.name`, [schoolId, learner.id]),
          req.auth.client.query(`SELECT ts.day_of_week, tp.name AS period_name, tp.starts_at, tp.ends_at, s.name AS subject_name, u.full_name AS teacher_name FROM class_enrollments ce JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id JOIN teacher_subject_assignments a ON a.school_id = c.school_id AND a.class_group_id = c.id AND a.academic_year_id = c.academic_year_id JOIN timetable_slots ts ON ts.school_id = a.school_id AND ts.teacher_assignment_id = a.id JOIN timetable_periods tp ON tp.school_id = ts.school_id AND tp.id = ts.period_id JOIN subjects s ON s.school_id = a.school_id AND s.id = a.subject_id JOIN user_accounts u ON u.school_id = a.school_id AND u.id = a.teacher_id WHERE ce.school_id = $1 AND ce.student_id = $2 AND ce.status = 'ACTIVE' ORDER BY ts.day_of_week, tp.starts_at`, [schoolId, learner.id]),
          req.auth.client.query(`SELECT sa.status, sa.recorded_at, cs.scheduled_at, s.name AS subject_name FROM student_attendance sa JOIN class_sessions cs ON cs.school_id = sa.school_id AND cs.id = sa.class_session_id JOIN teacher_subject_assignments a ON a.school_id = cs.school_id AND a.id = cs.teacher_assignment_id JOIN subjects s ON s.school_id = a.school_id AND s.id = a.subject_id WHERE sa.school_id = $1 AND sa.student_id = $2 ORDER BY cs.scheduled_at DESC LIMIT 30`, [schoolId, learner.id]),
          req.auth.client.query(`SELECT a.title, a.assessment_type, a.max_score, sc.score, sc.feedback, sc.published_at, s.name AS subject_name FROM assessment_scores sc JOIN assessments a ON a.school_id = sc.school_id AND a.id = sc.assessment_id JOIN teacher_subject_assignments ta ON ta.school_id = a.school_id AND ta.id = a.teacher_assignment_id JOIN subjects s ON s.school_id = ta.school_id AND s.id = ta.subject_id WHERE sc.school_id = $1 AND sc.student_id = $2 AND a.status = 'PUBLISHED' AND sc.published_at IS NOT NULL ORDER BY sc.published_at DESC`, [schoolId, learner.id]),
          req.auth.client.query(`SELECT r.resource_type, r.title, r.author, r.publisher, r.isbn, r.edition, r.description, r.resource_url, r.required, s.name AS subject_name FROM class_enrollments ce JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id JOIN grade_curriculum_subjects gc ON gc.school_id = c.school_id AND gc.grade_level_id = c.grade_level_id AND gc.academic_year_id = c.academic_year_id JOIN curriculum_resources r ON r.school_id = gc.school_id AND r.curriculum_subject_id = gc.id AND r.visible_to_students JOIN subjects s ON s.school_id = gc.school_id AND s.id = gc.subject_id WHERE ce.school_id = $1 AND ce.student_id = $2 AND ce.status = 'ACTIVE' ORDER BY s.name, r.title`, [schoolId, learner.id]),
        ]);
        await close(req, true); return res.json({ role: 'STUDENT', linked: true, student: learner, subjects: subjects.rows, timetable: timetable.rows, attendance: attendance.rows, grades: grades.rows, resources: resources.rows });
      }
      if (req.auth.account.roles.includes('PARENT') && req.auth.account.permissions.includes('guardian.portal.read')) {
        const children = await req.auth.client.query(`SELECT s.id, s.student_number, s.first_name, s.last_name, sg.relationship, sg.can_view_results, sg.can_view_finance, c.name AS class_name, c.grade_level FROM guardians g JOIN student_guardians sg ON sg.school_id = g.school_id AND sg.guardian_id = g.id JOIN students s ON s.school_id = sg.school_id AND s.id = sg.student_id LEFT JOIN class_enrollments ce ON ce.school_id = s.school_id AND ce.student_id = s.id AND ce.status = 'ACTIVE' LEFT JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id WHERE g.school_id = $1 AND g.user_id = $2 AND g.active ORDER BY s.last_name, s.first_name`, [schoolId, userId]);
        const results = [];
        for (const child of children.rows) {
          const [subjects, timetable, attendance, grades, resources] = await Promise.all([
            req.auth.client.query(`SELECT DISTINCT s.name AS subject_name, gc.weekly_minutes, gc.periods_per_week FROM class_enrollments ce JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id JOIN grade_curriculum_subjects gc ON gc.school_id = c.school_id AND gc.grade_level_id = c.grade_level_id AND gc.academic_year_id = c.academic_year_id JOIN subjects s ON s.school_id = gc.school_id AND s.id = gc.subject_id WHERE ce.school_id = $1 AND ce.student_id = $2 AND ce.status = 'ACTIVE' ORDER BY s.name`, [schoolId, child.id]),
            req.auth.client.query(`SELECT ts.day_of_week, tp.name AS period_name, tp.starts_at, tp.ends_at, s.name AS subject_name, u.full_name AS teacher_name FROM class_enrollments ce JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id JOIN teacher_subject_assignments a ON a.school_id = c.school_id AND a.class_group_id = c.id AND a.academic_year_id = c.academic_year_id JOIN timetable_slots ts ON ts.school_id = a.school_id AND ts.teacher_assignment_id = a.id JOIN timetable_periods tp ON tp.school_id = ts.school_id AND tp.id = ts.period_id JOIN subjects s ON s.school_id = a.school_id AND s.id = a.subject_id JOIN user_accounts u ON u.school_id = a.school_id AND u.id = a.teacher_id WHERE ce.school_id = $1 AND ce.student_id = $2 AND ce.status = 'ACTIVE' ORDER BY ts.day_of_week, tp.starts_at`, [schoolId, child.id]),
            req.auth.client.query(`SELECT sa.status, cs.scheduled_at, s.name AS subject_name FROM student_attendance sa JOIN class_sessions cs ON cs.school_id = sa.school_id AND cs.id = sa.class_session_id JOIN teacher_subject_assignments a ON a.school_id = cs.school_id AND a.id = cs.teacher_assignment_id JOIN subjects s ON s.school_id = a.school_id AND s.id = a.subject_id WHERE sa.school_id = $1 AND sa.student_id = $2 ORDER BY cs.scheduled_at DESC LIMIT 30`, [schoolId, child.id]),
            child.can_view_results ? req.auth.client.query(`SELECT a.title, a.assessment_type, a.max_score, sc.score, sc.feedback, sc.published_at, s.name AS subject_name FROM assessment_scores sc JOIN assessments a ON a.school_id = sc.school_id AND a.id = sc.assessment_id JOIN teacher_subject_assignments ta ON ta.school_id = a.school_id AND ta.id = a.teacher_assignment_id JOIN subjects s ON s.school_id = ta.school_id AND s.id = ta.subject_id WHERE sc.school_id = $1 AND sc.student_id = $2 AND a.status = 'PUBLISHED' AND sc.published_at IS NOT NULL ORDER BY sc.published_at DESC`, [schoolId, child.id]) : Promise.resolve({ rows: [] }),
            req.auth.client.query(`SELECT r.resource_type, r.title, r.author, r.publisher, r.isbn, r.edition, r.description, r.resource_url, r.required, s.name AS subject_name FROM class_enrollments ce JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id JOIN grade_curriculum_subjects gc ON gc.school_id = c.school_id AND gc.grade_level_id = c.grade_level_id AND gc.academic_year_id = c.academic_year_id JOIN curriculum_resources r ON r.school_id = gc.school_id AND r.curriculum_subject_id = gc.id AND r.visible_to_guardians JOIN subjects s ON s.school_id = gc.school_id AND s.id = gc.subject_id WHERE ce.school_id = $1 AND ce.student_id = $2 AND ce.status = 'ACTIVE' ORDER BY s.name, r.title`, [schoolId, child.id]),
          ]);
          results.push({ ...child, subjects: subjects.rows, timetable: timetable.rows, attendance: attendance.rows, grades: grades.rows, resources: resources.rows, financeVisible: Boolean(child.can_view_finance) });
        }
        await close(req, true); return res.json({ role: 'PARENT', children: results });
      }
      await close(req, false); return res.status(403).json({ error: 'This account does not have a learner or guardian portal.' });
    } catch (error) { return fail(req, res, error); }
  });

  router.get('/attendance/roster', needsPermission('attendance.read'), async (req, res) => {
    const assignmentId = text(req.query.assignmentId, 50);
    const date = req.query.date;
    const time = text(req.query.time, 5);
    if (!assignmentId || !validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) { await close(req, false); return res.status(400).json({ error: 'Choose a class assignment and a valid date and time.' }); }
    try {
      const schoolId = req.auth.claims.schoolId;
      const assignment = await req.auth.client.query(`SELECT a.id, a.teacher_id, a.class_group_id, c.name AS class_name, s.name AS subject_name, u.full_name AS teacher_name
        FROM teacher_subject_assignments a JOIN class_groups c ON c.school_id = a.school_id AND c.id = a.class_group_id
        JOIN subjects s ON s.school_id = a.school_id AND s.id = a.subject_id
        JOIN user_accounts u ON u.school_id = a.school_id AND u.id = a.teacher_id
        WHERE a.school_id = $1 AND a.id = $2 AND a.effective_from <= $3 AND (a.effective_to IS NULL OR a.effective_to >= $3)`, [schoolId, assignmentId, date]);
      if (!assignment.rowCount) { await close(req, false); return res.status(404).json({ error: 'That teaching assignment was not found.' }); }
      if (req.auth.account.roles.includes('TEACHER') && assignment.rows[0].teacher_id !== req.auth.claims.userId) { await close(req, false); return res.status(403).json({ error: 'Teachers can only access their own assigned classes.' }); }
      const roster = await req.auth.client.query(`SELECT s.id, s.student_number, s.first_name, s.last_name, a.status AS attendance_status, a.note
        FROM class_enrollments ce JOIN students s ON s.school_id = ce.school_id AND s.id = ce.student_id
        LEFT JOIN LATERAL (SELECT csi.id FROM class_sessions csi JOIN schools sc ON sc.id = csi.school_id
          WHERE csi.school_id = ce.school_id AND csi.teacher_assignment_id = $2
            AND (csi.scheduled_at AT TIME ZONE sc.timezone)::date = $3
            AND to_char(csi.scheduled_at AT TIME ZONE sc.timezone, 'HH24:MI') = $5 AND csi.status <> 'CANCELLED'
          ORDER BY csi.scheduled_at DESC, csi.id DESC LIMIT 1) cs ON true
        LEFT JOIN student_attendance a ON a.school_id = ce.school_id AND a.class_session_id = cs.id AND a.student_id = s.id
        WHERE ce.school_id = $1 AND ce.class_group_id = $4 AND ce.status = 'ACTIVE' AND s.status = 'ACTIVE'
        ORDER BY s.last_name, s.first_name`, [schoolId, assignmentId, date, assignment.rows[0].class_group_id, time]);
      const session = await req.auth.client.query(`SELECT cs.id, cs.topic, cs.status, cs.scheduled_at
        FROM class_sessions cs JOIN schools sc ON sc.id = cs.school_id WHERE cs.school_id = $1 AND cs.teacher_assignment_id = $2
          AND (cs.scheduled_at AT TIME ZONE sc.timezone)::date = $3
          AND to_char(cs.scheduled_at AT TIME ZONE sc.timezone, 'HH24:MI') = $4 AND cs.status <> 'CANCELLED' ORDER BY cs.scheduled_at DESC, cs.id DESC LIMIT 1`, [schoolId, assignmentId, date, time]);
      await close(req, true);
      return res.json({ assignment: assignment.rows[0], session: session.rows[0] || null, students: roster.rows });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/attendance/roll-call', needsPermission('attendance.write'), csrf, async (req, res) => {
    const assignmentId = text(req.body?.assignmentId, 50); const topic = text(req.body?.topic, 250);
    const date = req.body?.date; const time = text(req.body?.time, 5); const rows = req.body?.attendance;
    const correctionReason = text(req.body?.correctionReason, 500);
    if (!assignmentId || !topic || !validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !Array.isArray(rows) || rows.length > 500) {
      await close(req, false); return res.status(400).json({ error: 'Enter the lesson date, time, topic, and attendance for the class roster.' });
    }
    const allowed = new Set(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);
    if (rows.some(item => !item || typeof item.studentId !== 'string' || !allowed.has(item.status)) || new Set(rows.map(item => item.studentId)).size !== rows.length) {
      await close(req, false); return res.status(400).json({ error: 'Attendance must contain one valid status per student.' });
    }
    try {
      const schoolId = req.auth.claims.schoolId;
      const assignment = await req.auth.client.query(`SELECT teacher_id, class_group_id FROM teacher_subject_assignments
        WHERE school_id = $1 AND id = $2 AND effective_from <= $3 AND (effective_to IS NULL OR effective_to >= $3)`, [schoolId, assignmentId, date]);
      if (!assignment.rowCount) { await close(req, false); return res.status(404).json({ error: 'That teaching assignment was not found or is no longer active.' }); }
      if (req.auth.account.roles.includes('TEACHER') && assignment.rows[0].teacher_id !== req.auth.claims.userId) { await close(req, false); return res.status(403).json({ error: 'Teachers can only record attendance for their own assigned classes.' }); }
      const classGroupId = assignment.rows[0].class_group_id;
      await req.auth.client.query('SELECT id FROM class_groups WHERE school_id = $1 AND id = $2 FOR UPDATE', [schoolId, classGroupId]);
      const roster = await req.auth.client.query(`SELECT s.id FROM class_enrollments ce JOIN students s
        ON s.school_id = ce.school_id AND s.id = ce.student_id
        WHERE ce.school_id = $1 AND ce.class_group_id = $2 AND ce.status = 'ACTIVE' AND s.status = 'ACTIVE' ORDER BY s.id`, [schoolId, classGroupId]);
      const expected = roster.rows.map(row => row.id).sort(); const provided = rows.map(row => row.studentId).sort();
      if (!expected.length) { await close(req, false); return res.status(400).json({ error: 'There are no active students enrolled in this class yet.' }); }
      if (expected.length !== provided.length || expected.some((id, index) => id !== provided[index])) {
        await close(req, false); return res.status(400).json({ error: 'The submitted roll call must include every currently enrolled student exactly once.' });
      }
      await req.auth.client.query('SELECT id FROM teacher_subject_assignments WHERE school_id = $1 AND id = $2 FOR UPDATE', [schoolId, assignmentId]);
      await req.auth.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${schoolId}:${assignmentId}:${date}:${time}`]);
      const prior = await req.auth.client.query(`SELECT cs.id FROM class_sessions cs JOIN schools sc ON sc.id = cs.school_id WHERE cs.school_id = $1 AND cs.teacher_assignment_id = $2
        AND (cs.scheduled_at AT TIME ZONE sc.timezone)::date = $3 AND to_char(cs.scheduled_at AT TIME ZONE sc.timezone, 'HH24:MI') = $4
        AND cs.status <> 'CANCELLED' ORDER BY cs.scheduled_at DESC, cs.id DESC LIMIT 1 FOR UPDATE OF cs`, [schoolId, assignmentId, date, time]);
      let previousByStudent = new Map();
      if (prior.rowCount) {
        const existingMarks = await req.auth.client.query(`SELECT id, student_id, status FROM student_attendance WHERE school_id = $1 AND class_session_id = $2 FOR UPDATE`, [schoolId, prior.rows[0].id]);
        previousByStudent = new Map(existingMarks.rows.map(mark => [mark.student_id, mark]));
      }
      const changedMarks = rows.filter(item => previousByStudent.has(item.studentId) && previousByStudent.get(item.studentId).status !== item.status);
      if (changedMarks.length && !correctionReason) { await close(req, false); return res.status(400).json({ error: 'A correction reason is required when changing attendance already recorded for this lesson.' }); }
      let sessionId;
      if (prior.rowCount) {
        sessionId = prior.rows[0].id;
        await req.auth.client.query(`UPDATE class_sessions SET topic = $3,
          scheduled_at = (($4::date + $5::time) AT TIME ZONE (SELECT timezone FROM schools WHERE id = $1)),
          started_at = COALESCE(started_at, now()), ended_at = now(), status = 'COMPLETED'
          WHERE school_id = $1 AND id = $2`, [schoolId, sessionId, topic, date, time]);
      } else {
        const created = await req.auth.client.query(`INSERT INTO class_sessions
          (school_id, teacher_assignment_id, scheduled_at, started_at, ended_at, topic, status)
          VALUES ($1, $2, (($4::date + $5::time) AT TIME ZONE (SELECT timezone FROM schools WHERE id = $1)), now(), now(), $3, 'COMPLETED') RETURNING id`, [schoolId, assignmentId, topic, date, time]);
        sessionId = created.rows[0].id;
      }
      for (const item of changedMarks) {
        const previous = previousByStudent.get(item.studentId);
        await req.auth.client.query(`INSERT INTO attendance_correction_history (school_id, attendance_id, previous_status, new_status, reason, corrected_by)
          VALUES ($1, $2, $3, $4, $5, $6)`, [schoolId, previous.id, previous.status, item.status, correctionReason, req.auth.claims.userId]);
      }
      for (const item of rows) await req.auth.client.query(`INSERT INTO student_attendance
        (school_id, class_session_id, student_id, status, recorded_by, note)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (school_id, class_session_id, student_id) DO UPDATE SET status = EXCLUDED.status, recorded_by = EXCLUDED.recorded_by, note = EXCLUDED.note, recorded_at = now(),
          corrected_by = CASE WHEN student_attendance.status IS DISTINCT FROM EXCLUDED.status THEN EXCLUDED.recorded_by ELSE student_attendance.corrected_by END,
          corrected_at = CASE WHEN student_attendance.status IS DISTINCT FROM EXCLUDED.status THEN now() ELSE student_attendance.corrected_at END,
          correction_reason = CASE WHEN student_attendance.status IS DISTINCT FROM EXCLUDED.status THEN $7 ELSE student_attendance.correction_reason END`,
      [schoolId, sessionId, item.studentId, item.status, req.auth.claims.userId, text(item.note, 500) || null, correctionReason || null]);
      await audit(req, changedMarks.length ? 'CLASS_ROLL_CALL_CORRECTED' : 'CLASS_ROLL_CALL_RECORDED', 'CLASS_SESSION', sessionId, { assignmentId, date, studentCount: rows.length, correctedCount: changedMarks.length, correctionReason: correctionReason || null });
      return done(req, res, 201, { sessionId, recorded: rows.length, status: 'COMPLETED' });
    } catch (error) { return fail(req, res, error); }
  });

  return router;
}
