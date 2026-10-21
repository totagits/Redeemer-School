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
      const [school, years, subjects, classes, teachers, students, assignments] = await Promise.all([
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
      ]);
      await close(req, true);
      return res.json({ school: school.rows[0], years: years.rows, subjects: subjects.rows, classes: classes.rows,
        teachers: teachers.rows, students: students.rows, assignments: assignments.rows });
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

  router.post('/classes', needsPermission('academics.configure'), csrf, async (req, res) => {
    const academicYearId = text(req.body?.academicYearId, 50); const name = text(req.body?.name);
    const gradeLevel = text(req.body?.gradeLevel, 40); const section = text(req.body?.section, 40);
    if (!academicYearId || !name || !gradeLevel || !section) { await close(req, false); return res.status(400).json({ error: 'Enter the academic year, class name, grade, and section.' }); }
    try {
      const result = await req.auth.client.query(`INSERT INTO class_groups (school_id, academic_year_id, name, grade_level, section)
        VALUES ($1, $2, $3, $4, $5) RETURNING id, name, grade_level, section, academic_year_id`, [req.auth.claims.schoolId, academicYearId, name, gradeLevel, section]);
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
