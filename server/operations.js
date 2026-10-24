import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { hashPassword } from './authCrypto.js';
import { createInvitationSecret, InvitationDeliveryError, sendAccountInvitation } from './invitations.js';
import { createMomoClient, MomoProviderError } from './mtnMomo.js';

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
      return res.status(403).json({ error: 'You do not have permission to view this information.' });
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
  if (error instanceof InvitationDeliveryError) return res.status(error.status).json({ error: error.message });
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

async function withTenantTransaction(pool, schoolId, action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_school_id', $1, true)", [schoolId]);
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally { client.release(); }
}

async function createAndSendInvitation(client, { schoolId, userId, email, fullName, role, createdBy }, sendInvitation) {
  const { token, tokenHash } = createInvitationSecret();
  await client.query(`UPDATE account_invitations SET revoked_at = now()
    WHERE school_id = $1 AND user_id = $2 AND redeemed_at IS NULL AND revoked_at IS NULL`, [schoolId, userId]);
  await client.query(`INSERT INTO account_invitations (school_id, user_id, token_hash, expires_at, created_by)
    VALUES ($1, $2, $3, now() + interval '48 hours', $4)`, [schoolId, userId, tokenHash, createdBy]);
  await sendInvitation({ email, fullName, role, token });
}

export function createOperationsRouter({ authenticate, sendInvitation = sendAccountInvitation, pool = null, momoClient = createMomoClient() }) {
  const router = express.Router();
  router.use(authenticate);
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  router.get('/dashboard', async (req, res) => {
    const permissions = new Set(req.auth.account.permissions);
    const schoolId = req.auth.claims.schoolId;
    const cards = [];
    const countCard = async (permission, label, sql, params = [schoolId]) => {
      if (!permissions.has(permission)) return;
      const result = await req.auth.client.query(sql, params);
      cards.push({ label, value: Number(result.rows[0]?.count || 0) });
    };
    try {
      const school = await req.auth.client.query('SELECT id, code, name FROM schools WHERE id = $1', [schoolId]);
      await Promise.all([
        countCard('students.read', 'Active students', "SELECT count(*)::int AS count FROM students WHERE school_id = $1 AND status = 'ACTIVE'"),
        countCard('admissions.read', 'Applications in review', "SELECT count(*)::int AS count FROM admission_applications WHERE school_id = $1 AND status IN ('RECEIVED', 'UNDER_REVIEW', 'INTERVIEW_SCHEDULED', 'OFFERED', 'ACCEPTED', 'WAITLISTED')"),
        countCard('attendance.read', "Today's attendance records", 'SELECT count(*)::int AS count FROM student_attendance sa JOIN class_sessions cs ON cs.school_id = sa.school_id AND cs.id = sa.class_session_id WHERE sa.school_id = $1 AND cs.scheduled_at::date = CURRENT_DATE'),
        countCard('grades.moderate', 'Assessments awaiting review', "SELECT count(*)::int AS count FROM assessments WHERE school_id = $1 AND status = 'SUBMITTED_FOR_REVIEW'"),
        countCard('finance.read', 'Open fee invoices', "SELECT count(*)::int AS count FROM fee_invoices WHERE school_id = $1 AND status IN ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE')"),
        countCard('staff.read', 'Active staff records', "SELECT count(*)::int AS count FROM staff_records WHERE school_id = $1 AND employment_status = 'ACTIVE'"),
      ]);
      await close(req, true);
      return res.json({ school: school.rows[0] || null, cards, permissions: [...permissions] });
    } catch (error) { return fail(req, res, error); }
  });

  router.get('/accounts', needsPermission('users.manage'), async (req, res) => {
    try {
      const schoolId = req.auth.claims.schoolId;
      const result = await req.auth.client.query(`
        SELECT u.id, u.email, u.full_name, u.role, u.status, u.must_reset_password,
               u.created_at, u.last_login_at,
               EXISTS (
                 SELECT 1 FROM account_invitations i
                 WHERE i.school_id=u.school_id AND i.user_id=u.id
                   AND i.redeemed_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
               ) AS invitation_pending
        FROM user_accounts u
        WHERE u.school_id=$1
        ORDER BY CASE WHEN u.status='ACTIVE' THEN 0 ELSE 1 END, lower(u.full_name), lower(u.email)
      `, [schoolId]);
      return done(req, res, 200, { accounts: result.rows, currentUserId: req.auth.claims.userId });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/accounts/:accountId/status', needsPermission('users.manage'), csrf, async (req, res) => {
    const accountId = text(req.params.accountId, 50);
    const status = text(req.body?.status, 20).toUpperCase();
    const reason = text(req.body?.reason, 500);
    if (!accountId || !['ACTIVE', 'SUSPENDED'].includes(status) || (status === 'SUSPENDED' && !reason)) {
      await close(req, false);
      return res.status(400).json({ error: 'Choose Active or Suspended. A reason is required when suspending an account.' });
    }
    if (accountId === req.auth.claims.userId && status === 'SUSPENDED') {
      await close(req, false);
      return res.status(400).json({ error: 'You cannot suspend your own account.' });
    }
    try {
      const schoolId = req.auth.claims.schoolId;
      const target = await req.auth.client.query(`SELECT id, role, status FROM user_accounts WHERE school_id=$1 AND id=$2 FOR UPDATE`, [schoolId, accountId]);
      if (!target.rowCount) { await close(req, false); return res.status(404).json({ error: 'The account was not found in this school.' }); }
      if (status === 'SUSPENDED' && target.rows[0].role === 'SCHOOL_ADMIN') {
        const admins = await req.auth.client.query(`SELECT count(*)::int AS active_count FROM user_accounts WHERE school_id=$1 AND role='SCHOOL_ADMIN' AND status='ACTIVE'`, [schoolId]);
        if (Number(admins.rows[0]?.active_count || 0) <= 1) {
          await close(req, false);
          return res.status(409).json({ error: 'The school must keep at least one active administrator.' });
        }
      }
      const updated = await req.auth.client.query(`UPDATE user_accounts SET status=$3, updated_at=now() WHERE school_id=$1 AND id=$2 RETURNING id, email, full_name, role, status`, [schoolId, accountId, status]);
      if (status === 'SUSPENDED') await req.auth.client.query(`DELETE FROM auth_sessions WHERE school_id=$1 AND user_id=$2`, [schoolId, accountId]);
      await audit(req, status === 'SUSPENDED' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_REACTIVATED', 'USER_ACCOUNT', accountId, { reason: status === 'SUSPENDED' ? reason : undefined });
      return done(req, res, 200, { account: updated.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.get('/students', needsPermission('students.read'), async (req, res) => {
    try {
      if (req.auth.account.roles.some(role => ['STUDENT', 'PARENT'].includes(role))) {
        await close(req, false);
        return res.status(403).json({ error: 'Portal accounts can only view learners linked to their own account.' });
      }
      const schoolId = req.auth.claims.schoolId;
      const isTeacher = req.auth.account.roles.includes('TEACHER');
      const students = await req.auth.client.query(`SELECT st.id, st.student_number, st.first_name, st.middle_name, st.last_name, st.status,
          c.id AS class_group_id, c.name AS class_name, y.name AS academic_year_name,
          (SELECT count(*)::int FROM student_attendance sa WHERE sa.school_id = st.school_id AND sa.student_id = st.id) AS attendance_records,
          (SELECT count(*)::int FROM fee_invoices fi WHERE fi.school_id = st.school_id AND fi.student_id = st.id AND fi.status NOT IN ('PAID','VOID')) AS open_invoices
        FROM students st
        LEFT JOIN class_enrollments ce ON ce.school_id = st.school_id AND ce.student_id = st.id AND ce.status = 'ACTIVE'
        LEFT JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id
        LEFT JOIN academic_years y ON y.school_id = c.school_id AND y.id = c.academic_year_id
        WHERE st.school_id = $1 AND ($2::boolean = false OR EXISTS (
          SELECT 1 FROM class_enrollments scoped_ce JOIN teacher_subject_assignments scoped_a
            ON scoped_a.school_id = scoped_ce.school_id AND scoped_a.class_group_id = scoped_ce.class_group_id
          WHERE scoped_ce.school_id = st.school_id AND scoped_ce.student_id = st.id AND scoped_a.teacher_id = $3
        ))
        ORDER BY st.last_name, st.first_name`, [schoolId, isTeacher, req.auth.claims.userId]);
      const classes = req.auth.account.permissions.includes('students.write')
        ? await req.auth.client.query(`SELECT c.id, c.name, c.grade_level, y.name AS academic_year_name
            FROM class_groups c JOIN academic_years y ON y.school_id = c.school_id AND y.id = c.academic_year_id
            WHERE c.school_id = $1 ORDER BY y.starts_on DESC, c.grade_level, c.name`, [schoolId])
        : { rows: [] };
      await close(req, true);
      return res.json({ students: students.rows, classes: classes.rows, canEnroll: req.auth.account.permissions.includes('students.write') });
    } catch (error) { return fail(req, res, error); }
  });

  router.get('/students/:studentId', needsPermission('students.read'), async (req, res) => {
    try {
      if (req.auth.account.roles.some(role => ['STUDENT', 'PARENT'].includes(role))) {
        await close(req, false);
        return res.status(403).json({ error: 'Portal accounts can only view learners linked to their own account.' });
      }
      const schoolId = req.auth.claims.schoolId;
      const studentResult = await req.auth.client.query(`SELECT st.id, st.student_number, st.first_name, st.middle_name,
          st.last_name, st.preferred_name, st.status, st.date_of_birth, st.sex, st.external_learner_id,
          c.name AS class_name, c.id AS class_group_id, y.name AS academic_year_name, ce.enrolled_on,
          ce.status AS enrollment_status,
          (SELECT count(*)::int FROM student_attendance sa WHERE sa.school_id = st.school_id AND sa.student_id = st.id) AS attendance_records,
          (SELECT count(*)::int FROM fee_invoices fi WHERE fi.school_id = st.school_id AND fi.student_id = st.id AND fi.status NOT IN ('PAID','VOID')) AS open_invoices
        FROM students st
        LEFT JOIN class_enrollments ce ON ce.school_id = st.school_id AND ce.student_id = st.id AND ce.status = 'ACTIVE'
        LEFT JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id
        LEFT JOIN academic_years y ON y.school_id = c.school_id AND y.id = c.academic_year_id
        WHERE st.school_id = $1 AND st.id = $2`, [schoolId, req.params.studentId]);
      if (!studentResult.rowCount) { await close(req, false); return res.status(404).json({ error: 'Student not found.' }); }
      const guardianResult = await req.auth.client.query(`SELECT g.id, g.first_name, g.last_name, g.email, g.phone,
          sg.relationship, sg.is_primary FROM student_guardians sg JOIN guardians g
          ON g.school_id = sg.school_id AND g.id = sg.guardian_id
          WHERE sg.school_id = $1 AND sg.student_id = $2 ORDER BY sg.is_primary DESC, g.last_name, g.first_name`, [schoolId, req.params.studentId]);
      const student = studentResult.rows[0];
      const canReadSensitive = req.auth.account.permissions.includes('students.sensitive.read');
      if (!canReadSensitive) {
        student.date_of_birth = null; student.sex = null; student.external_learner_id = null;
        for (const guardian of guardianResult.rows) { guardian.phone = null; guardian.email = null; }
      }
      await close(req, true);
      return res.json({ student: { ...student, guardians: guardianResult.rows } });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/students/:studentId/profile', needsPermission('students.write'), csrf, async (req, res) => {
    const firstName = text(req.body?.firstName, 80);
    const middleName = text(req.body?.middleName, 80) || null;
    const lastName = text(req.body?.lastName, 80);
    const preferredName = text(req.body?.preferredName, 80) || null;
    const dateOfBirth = req.body?.dateOfBirth || null;
    const sex = text(req.body?.sex, 20).toUpperCase() || null;
    const externalLearnerId = text(req.body?.externalLearnerId, 80) || null;
    const canWriteSensitive = req.auth.account.permissions.includes('students.sensitive.read');
    if (!firstName || !lastName || (canWriteSensitive && dateOfBirth && !validDate(dateOfBirth)) || (sex && !['FEMALE','MALE','OTHER','UNDISCLOSED'].includes(sex))) {
      await close(req, false);
      return res.status(400).json({ error: 'Enter a first and last name, and valid optional learner details.' });
    }
    try {
      const result = await req.auth.client.query(`UPDATE students SET first_name = $3, middle_name = $4, last_name = $5,
          preferred_name = $6, date_of_birth = CASE WHEN $10 THEN $7::date ELSE date_of_birth END,
          sex = CASE WHEN $10 THEN $8 ELSE sex END,
          external_learner_id = CASE WHEN $10 THEN $9 ELSE external_learner_id END
        WHERE school_id = $1 AND id = $2
        RETURNING id, student_number, first_name, middle_name, last_name, preferred_name, date_of_birth, sex, external_learner_id, status`,
      [req.auth.claims.schoolId, req.params.studentId, firstName, middleName, lastName, preferredName, dateOfBirth, sex, externalLearnerId, canWriteSensitive]);
      if (!result.rowCount) { await close(req, false); return res.status(404).json({ error: 'Student not found.' }); }
      await audit(req, 'STUDENT_PROFILE_UPDATED', 'STUDENT', req.params.studentId, { changedFields: ['firstName','middleName','lastName','preferredName'] });
      const student = result.rows[0];
      if (!canWriteSensitive) { student.date_of_birth = null; student.sex = null; student.external_learner_id = null; }
      return done(req, res, 200, { student });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/students/:studentId/guardians', needsPermission('students.write'), csrf, async (req, res) => {
    const firstName = text(req.body?.firstName, 80);
    const lastName = text(req.body?.lastName, 80);
    const email = text(req.body?.email, 254).toLowerCase();
    const phone = text(req.body?.phone, 40);
    const relationship = text(req.body?.relationship, 60);
    if (!firstName || !lastName || !relationship || (!email && !phone) || (email && !EMAIL_RE.test(email))) {
      await close(req, false);
      return res.status(400).json({ error: 'Enter the guardian name, relationship, and at least an email address or phone number.' });
    }
    try {
      const schoolId = req.auth.claims.schoolId;
      const student = await req.auth.client.query('SELECT id FROM students WHERE school_id = $1 AND id = $2', [schoolId, req.params.studentId]);
      if (!student.rowCount) { await close(req, false); return res.status(404).json({ error: 'Student not found.' }); }
      const inserted = await req.auth.client.query(`INSERT INTO guardians (school_id, first_name, last_name, email, phone)
        VALUES ($1, $2, $3, NULLIF($4,''), NULLIF($5,'')) RETURNING id, first_name, last_name, email, phone`,
      [schoolId, firstName, lastName, email, phone]);
      const guardian = inserted.rows[0];
      await req.auth.client.query(`INSERT INTO student_guardians
        (school_id, student_id, guardian_id, relationship, can_view_results, can_view_finance, communication_consent, consent_updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 THEN now() ELSE NULL END)`,
      [schoolId, req.params.studentId, guardian.id, relationship, req.body?.canViewResults !== false, Boolean(req.body?.canViewFinance), Boolean(req.body?.communicationConsent)]);
      await audit(req, 'STUDENT_GUARDIAN_ADDED', 'STUDENT', req.params.studentId, { guardianId: guardian.id, relationship });
      return done(req, res, 201, { guardian });
    } catch (error) { return fail(req, res, error); }
  });

  router.get('/finance', needsPermission('finance.read'), async (req, res) => {
    try {
      const schoolId = req.auth.claims.schoolId;
      const [invoices, payments, students, years, momoIntents] = await Promise.all([
        req.auth.client.query(`SELECT fi.id, fi.invoice_number, fi.currency, fi.issued_on, fi.due_on, fi.status,
            st.id AS student_id, st.student_number, st.first_name, st.last_name, y.name AS academic_year_name,
            COALESCE(lines.total, 0)::text AS total,
            COALESCE(alloc.paid, 0)::text AS paid,
            GREATEST(COALESCE(lines.total, 0) - COALESCE(alloc.paid, 0), 0)::text AS balance
          FROM fee_invoices fi
          JOIN students st ON st.school_id = fi.school_id AND st.id = fi.student_id
          JOIN academic_years y ON y.school_id = fi.school_id AND y.id = fi.academic_year_id
          LEFT JOIN LATERAL (SELECT SUM(line_amount) AS total FROM fee_invoice_lines l WHERE l.school_id = fi.school_id AND l.invoice_id = fi.id) lines ON true
          LEFT JOIN LATERAL (SELECT SUM(pa.amount) AS paid FROM payment_allocations pa JOIN payments p ON p.school_id = pa.school_id AND p.id = pa.payment_id AND p.status IN ('SUCCEEDED','PARTIALLY_REVERSED') WHERE pa.school_id = fi.school_id AND pa.invoice_id = fi.id) alloc ON true
          WHERE fi.school_id = $1 AND fi.status <> 'VOID'
          ORDER BY fi.issued_on DESC, fi.created_at DESC LIMIT 250`, [schoolId]),
        req.auth.client.query(`SELECT p.id, p.receipt_number, p.currency, p.amount::text,
            COALESCE(to_jsonb(p)->>'provider_fee_amount','0') AS provider_fee_amount,
            COALESCE((to_jsonb(p)->>'provider_fee_rate_bps')::integer,0) AS provider_fee_rate_bps, p.channel, p.status, p.received_at,
            p.payer_reference, st.student_number, st.first_name, st.last_name, fi.invoice_number
          FROM payments p JOIN students st ON st.school_id = p.school_id AND st.id = p.student_id
          LEFT JOIN payment_allocations pa ON pa.school_id = p.school_id AND pa.payment_id = p.id
          LEFT JOIN fee_invoices fi ON fi.school_id = pa.school_id AND fi.id = pa.invoice_id
          WHERE p.school_id = $1 ORDER BY p.created_at DESC LIMIT 100`, [schoolId]),
        req.auth.client.query(`SELECT id, student_number, first_name, last_name FROM students WHERE school_id = $1 AND status = 'ACTIVE' ORDER BY last_name, first_name`, [schoolId]),
        req.auth.client.query(`SELECT id, name FROM academic_years WHERE school_id = $1 ORDER BY starts_on DESC`, [schoolId]),
        req.auth.client.query(`SELECT pi.id, pi.invoice_id, pi.amount::text, pi.currency, pi.status, pi.provider_status, pi.initiated_at, pi.completed_at,
            fi.invoice_number, st.first_name, st.last_name, pi.payer_msisdn_last4
          FROM payment_intents pi JOIN fee_invoices fi ON fi.school_id = pi.school_id AND fi.id = pi.invoice_id
          JOIN students st ON st.school_id = fi.school_id AND st.id = fi.student_id
          WHERE pi.school_id = $1 ORDER BY pi.initiated_at DESC LIMIT 50`, [schoolId]),
      ]);
      await close(req, true);
      return res.json({ invoices: invoices.rows, payments: payments.rows, students: students.rows, years: years.rows,
        momoIntents: momoIntents.rows,
        momo: { enabled: momoClient.config.enabled, environment: momoClient.config.environment, currency: momoClient.config.currency, feeRateBps: momoClient.config.feeRateBps, reason: momoClient.config.reason },
        canWrite: req.auth.account.permissions.includes('finance.write') });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/finance/invoices', needsPermission('finance.write'), csrf, async (req, res) => {
    const studentId = text(req.body?.studentId, 50); const academicYearId = text(req.body?.academicYearId, 50);
    const invoiceNumber = text(req.body?.invoiceNumber, 40).toUpperCase(); const currency = text(req.body?.currency, 3).toUpperCase();
    const dueOn = req.body?.dueOn || null; const description = text(req.body?.description, 180);
    const amount = Number(req.body?.amount);
    if (!studentId || !academicYearId || !/^[A-Z0-9_-]{3,40}$/.test(invoiceNumber) || !['LRD','USD'].includes(currency) ||
        !description || !Number.isFinite(amount) || amount <= 0 || amount > 999999999 || (dueOn && !validDate(dueOn))) {
      await close(req, false); return res.status(400).json({ error: 'Enter a student, academic year, invoice number, LRD or USD currency, description, positive amount, and valid optional due date.' });
    }
    try {
      const schoolId = req.auth.claims.schoolId;
      const inserted = await req.auth.client.query(`INSERT INTO fee_invoices
        (school_id, student_id, academic_year_id, invoice_number, currency, due_on, status, created_by)
        SELECT $1, st.id, y.id, $4, $5, $6, 'ISSUED', $7 FROM students st CROSS JOIN academic_years y
        WHERE st.school_id = $1 AND st.id = $2 AND st.status = 'ACTIVE' AND y.school_id = $1 AND y.id = $3
        RETURNING id, invoice_number, currency, status, due_on`,
      [schoolId, studentId, academicYearId, invoiceNumber, currency, dueOn, req.auth.claims.userId]);
      if (!inserted.rowCount) { await close(req, false); return res.status(400).json({ error: 'Choose an active student and academic year from this school.' }); }
      await req.auth.client.query(`INSERT INTO fee_invoice_lines (school_id, invoice_id, description, quantity, unit_amount)
        VALUES ($1, $2, $3, 1, $4)`, [schoolId, inserted.rows[0].id, description, amount.toFixed(2)]);
      await audit(req, 'FEE_INVOICE_ISSUED', 'FEE_INVOICE', inserted.rows[0].id, { invoiceNumber, studentId, currency, amount: amount.toFixed(2) });
      return done(req, res, 201, { invoice: inserted.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/finance/payments', needsPermission('finance.write'), csrf, async (req, res) => {
    const invoiceId = text(req.body?.invoiceId, 50); const channel = text(req.body?.channel, 20).toUpperCase();
    const amount = Number(req.body?.amount); const payerReference = text(req.body?.payerReference, 100);
    const note = text(req.body?.note, 500);
    if (!invoiceId || !['CASH','BANK','OTHER'].includes(channel) || !Number.isFinite(amount) || amount <= 0 || amount > 999999999) {
      await close(req, false); return res.status(400).json({ error: 'Choose an outstanding invoice, a verified cash/bank/other payment channel, and a positive amount. MTN MoMo is not enabled in this workflow yet.' });
    }
    try {
      const schoolId = req.auth.claims.schoolId;
      const invoice = await req.auth.client.query(`SELECT fi.id, fi.student_id, fi.currency, fi.invoice_number, fi.status,
          COALESCE(lines.total, 0) AS total, COALESCE(alloc.paid, 0) AS paid
        FROM fee_invoices fi
        LEFT JOIN LATERAL (SELECT SUM(line_amount) AS total FROM fee_invoice_lines l WHERE l.school_id = fi.school_id AND l.invoice_id = fi.id) lines ON true
        LEFT JOIN LATERAL (SELECT SUM(pa.amount) AS paid FROM payment_allocations pa JOIN payments p ON p.school_id = pa.school_id AND p.id = pa.payment_id AND p.status IN ('SUCCEEDED','PARTIALLY_REVERSED') WHERE pa.school_id = fi.school_id AND pa.invoice_id = fi.id) alloc ON true
        WHERE fi.school_id = $1 AND fi.id = $2 AND fi.status IN ('ISSUED','PARTIALLY_PAID','OVERDUE') FOR UPDATE OF fi`, [schoolId, invoiceId]);
      if (!invoice.rowCount) { await close(req, false); return res.status(404).json({ error: 'That invoice is not open in this school.' }); }
      const row = invoice.rows[0];
      const paymentCents = Math.round(amount * 100);
      const balanceCents = Math.round((Number(row.total) - Number(row.paid)) * 100);
      if (paymentCents > balanceCents) { await close(req, false); return res.status(400).json({ error: 'The payment cannot be greater than the remaining invoice balance.' }); }
      const receipt = `RIA-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomBytes(3).toString('hex').toUpperCase()}`;
      const payment = await req.auth.client.query(`INSERT INTO payments
        (school_id, student_id, currency, amount, channel, status, payer_reference, receipt_number, cashier_user_id, received_at, note)
        VALUES ($1, $2, $3, $4, $5, 'SUCCEEDED', NULLIF($6,''), $7, $8, now(), NULLIF($9,''))
        RETURNING id, receipt_number, amount::text, currency, channel, status, received_at`,
      [schoolId, row.student_id, row.currency, (paymentCents / 100).toFixed(2), channel, payerReference, receipt, req.auth.claims.userId, note]);
      await req.auth.client.query(`INSERT INTO payment_allocations (school_id, payment_id, invoice_id, amount) VALUES ($1,$2,$3,$4)`,
        [schoolId, payment.rows[0].id, invoiceId, (paymentCents / 100).toFixed(2)]);
      const nextStatus = paymentCents === balanceCents ? 'PAID' : 'PARTIALLY_PAID';
      await req.auth.client.query('UPDATE fee_invoices SET status = $3 WHERE school_id = $1 AND id = $2', [schoolId, invoiceId, nextStatus]);
      await audit(req, 'FEE_PAYMENT_RECORDED', 'PAYMENT', payment.rows[0].id, { invoiceId, invoiceNumber: row.invoice_number, currency: row.currency, amount: payment.rows[0].amount, channel, receipt });
      return done(req, res, 201, { payment: payment.rows[0], invoiceStatus: nextStatus });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/finance/invoices/:invoiceId/void', needsPermission('finance.write'), csrf, async (req, res) => {
    const reason = text(req.body?.reason, 500);
    if (!reason) {
      await close(req, false);
      return res.status(400).json({ error: 'Enter a reason for voiding this invoice.' });
    }
    try {
      const schoolId = req.auth.claims.schoolId;
      const invoice = await req.auth.client.query(`SELECT fi.id, fi.invoice_number, fi.status,
          (SELECT COALESCE(SUM(pa.amount), 0)::text FROM payment_allocations pa
            WHERE pa.school_id = fi.school_id AND pa.invoice_id = fi.id) AS allocated
        FROM fee_invoices fi WHERE fi.school_id = $1 AND fi.id = $2 FOR UPDATE`, [schoolId, req.params.invoiceId]);
      if (!invoice.rowCount) { await close(req, false); return res.status(404).json({ error: 'Invoice not found.' }); }
      const row = invoice.rows[0];
      if (Number(row.allocated) > 0) {
        await close(req, false);
        return res.status(409).json({ error: 'An invoice with payment allocations cannot be voided. Reverse or refund the payment through the approved finance workflow.' });
      }
      if (!['ISSUED', 'OVERDUE'].includes(row.status)) {
        await close(req, false);
        return res.status(409).json({ error: 'Only an unpaid issued invoice can be voided.' });
      }
      await req.auth.client.query(`UPDATE fee_invoices SET status='VOID', void_reason=$3
        WHERE school_id=$1 AND id=$2`, [schoolId, req.params.invoiceId, reason]);
      await audit(req, 'FEE_INVOICE_VOIDED', 'FEE_INVOICE', req.params.invoiceId, { invoiceNumber: row.invoice_number, reason });
      return done(req, res, 200, { id: req.params.invoiceId, status: 'VOID' });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/finance/momo/test-connection', needsPermission('finance.write'), csrf, async (req, res) => {
    if (!momoClient.config.enabled || momoClient.config.environment !== 'SANDBOX') {
      await close(req, false);
      return res.status(503).json({ error: momoClient.config.reason || 'The credential check is available only with valid sandbox MTN credentials.' });
    }
    try {
      await close(req, false);
      const result = await momoClient.testConnection();
      return res.json({ connected: result.connected, environment: result.environment, currency: result.currency, message: 'MTN sandbox credentials were accepted. This check did not create a payment.' });
    } catch (error) {
      await close(req, false).catch(() => {});
      return res.status(502).json({ error: error instanceof MomoProviderError ? error.message : 'MTN sandbox credentials could not be verified.' });
    }
  });

  // Isolated MTN sandbox exercise: this never creates school payment or invoice records.
  router.post('/finance/momo/sandbox-test', needsPermission('finance.write'), csrf, async (req, res) => {
    if (!momoClient.config.enabled || momoClient.config.environment !== 'SANDBOX' || momoClient.config.currency !== 'EUR') {
      await close(req, false);
      return res.status(503).json({ error: 'The isolated payment test is available only with valid EUR sandbox credentials.' });
    }
    const amount = Number(req.body?.amount);
    const msisdn = text(req.body?.msisdn, 20).replace(/\D/g, '');
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 100 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6 || !/^\d{10,15}$/.test(msisdn) || /^231\d{9}$/.test(msisdn)) {
      await close(req, false);
      return res.status(400).json({ error: 'Enter an amount from EUR 0.01 to EUR 100.00 and a 10–15 digit sandbox test number.' });
    }
    const referenceId = randomUUID();
    try {
      await close(req, false);
      const result = await momoClient.requestToPay({
        referenceId, externalId: `RIA-SANDBOX-${randomUUID()}`, amount, currency: 'EUR', msisdn,
        payerMessage: 'Redeemer sandbox integration test', payeeNote: 'Test only; no school invoice',
      });
      return res.status(202).json({ referenceId: result.referenceId, status: result.status, message: 'MTN accepted the sandbox request. Check its status below; no student account or invoice was changed.' });
    } catch (error) {
      await close(req, false).catch(() => {});
      if (error instanceof MomoProviderError && error.outcomeUnknown) {
        return res.status(202).json({ referenceId, status: 'UNKNOWN', message: 'MTN did not confirm whether it received the request. Check this reference before trying again.' });
      }
      return res.status(502).json({ error: error instanceof MomoProviderError ? error.message : 'The MTN sandbox request could not be sent.' });
    }
  });

  router.post('/finance/momo/sandbox-test/:referenceId/check', needsPermission('finance.write'), csrf, async (req, res) => {
    if (!momoClient.config.enabled || momoClient.config.environment !== 'SANDBOX' || momoClient.config.currency !== 'EUR') {
      await close(req, false);
      return res.status(503).json({ error: 'The isolated payment test is available only with valid EUR sandbox credentials.' });
    }
    try {
      await close(req, false);
      const status = await momoClient.getRequestStatus(req.params.referenceId);
      return res.json({ ...status, message: `MTN sandbox status: ${status.status}. No student account or invoice was changed.` });
    } catch (error) {
      await close(req, false).catch(() => {});
      return res.status(502).json({ error: error instanceof MomoProviderError ? error.message : 'MTN sandbox status could not be checked.' });
    }
  });

  router.post('/finance/momo/intents', needsPermission('finance.write'), csrf, async (req, res) => {
    if (!pool || !momoClient.config.enabled) {
      await close(req, false);
      return res.status(503).json({ error: momoClient.config.reason || 'MTN MoMo is not configured in this environment yet.' });
    }
    if (momoClient.config.environment !== 'PRODUCTION') {
      await close(req, false);
      return res.status(403).json({ error: 'MTN sandbox uses EUR test transactions. Do not post sandbox test payments against school fee invoices; use the sandbox credential check instead.' });
    }
    const invoiceId = text(req.body?.invoiceId, 50);
    const payerPhone = text(req.body?.payerPhone, 20).replace(/[\s()+-]/g, '');
    const amount = Number(req.body?.amount);
    if (!invoiceId || !/^231\d{9}$/.test(payerPhone) || !Number.isFinite(amount) || amount <= 0 || amount > 999999999 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
      await close(req, false);
      return res.status(400).json({ error: 'Choose an LRD invoice, enter a valid amount, and provide the payer number in Liberia international format (231 followed by 9 digits).' });
    }
    const amountCents = Math.round(amount * 100);
    const schoolId = req.auth.claims.schoolId;
    const userId = req.auth.claims.userId;
    const intentId = randomUUID();
    const referenceId = randomUUID();
    let invoiceNumber;
    try {
      const schema = await req.auth.client.query(`SELECT count(*)::int AS ready FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'payments' AND column_name IN ('provider_fee_amount','provider_fee_rate_bps')`);
      if (Number(schema.rows[0]?.ready || 0) < 2) {
        await close(req, false);
        return res.status(503).json({ error: 'MTN Collections is not ready yet. Apply staging database migration 009 before enabling payment requests.' });
      }
      const invoice = await req.auth.client.query(`SELECT fi.id, fi.student_id, fi.currency, fi.invoice_number, fi.status,
          COALESCE(lines.total, 0) AS total, COALESCE(alloc.paid, 0) AS paid
        FROM fee_invoices fi
        LEFT JOIN LATERAL (SELECT SUM(line_amount) AS total FROM fee_invoice_lines l WHERE l.school_id = fi.school_id AND l.invoice_id = fi.id) lines ON true
        LEFT JOIN LATERAL (SELECT SUM(pa.amount) AS paid FROM payment_allocations pa JOIN payments p ON p.school_id = pa.school_id AND p.id = pa.payment_id AND p.status IN ('SUCCEEDED','PARTIALLY_REVERSED') WHERE pa.school_id = fi.school_id AND pa.invoice_id = fi.id) alloc ON true
        WHERE fi.school_id = $1 AND fi.id = $2 AND fi.status IN ('ISSUED','PARTIALLY_PAID','OVERDUE') FOR UPDATE OF fi`, [schoolId, invoiceId]);
      if (!invoice.rowCount) { await close(req, false); return res.status(404).json({ error: 'That invoice is not open in this school.' }); }
      const row = invoice.rows[0];
      if (row.currency !== momoClient.config.currency) { await close(req, false); return res.status(400).json({ error: `MTN MoMo is currently enabled for ${momoClient.config.currency} invoices only.` }); }
      const balanceCents = Math.max(0, Math.round((Number(row.total) - Number(row.paid)) * 100));
      if (amountCents > balanceCents) { await close(req, false); return res.status(400).json({ error: 'The requested amount cannot be greater than the remaining invoice balance.' }); }
      const pending = await req.auth.client.query(`SELECT 1 FROM payment_intents WHERE school_id = $1 AND invoice_id = $2 AND status IN ('CREATED','PENDING') LIMIT 1`, [schoolId, invoiceId]);
      if (pending.rowCount) { await close(req, false); return res.status(409).json({ error: 'This invoice already has an MTN MoMo payment request awaiting confirmation. Check its status before starting another.' }); }
      const profile = await req.auth.client.query(`INSERT INTO payment_provider_profiles
          (school_id, provider, product, country_code, environment, credential_secret_ref, enabled, config)
        VALUES ($1, 'MTN_MOMO', 'COLLECTIONS', 'LR', $2, 'coolify:MTN_MOMO_API_USER,MTN_MOMO_API_KEY,MTN_MOMO_SUBSCRIPTION_KEY', true, $3::jsonb)
        ON CONFLICT (school_id, provider, environment) DO UPDATE SET enabled = true, updated_at = now(), config = EXCLUDED.config
        RETURNING id`, [schoolId, momoClient.config.environment, JSON.stringify({ currency: momoClient.config.currency, feeRateBps: momoClient.config.feeRateBps })]);
      const inserted = await req.auth.client.query(`INSERT INTO payment_intents
          (id, school_id, invoice_id, provider_profile_id, payment_id, idempotency_key, provider_reference, amount, currency, payer_msisdn_last4, status, expires_at)
        VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,'CREATED',now() + interval '15 minutes')
        RETURNING id`, [intentId, schoolId, invoiceId, profile.rows[0].id, randomUUID(), referenceId, (amountCents / 100).toFixed(2), row.currency, payerPhone.slice(-4)]);
      invoiceNumber = row.invoice_number;
      await audit(req, 'MTN_MOMO_PAYMENT_REQUEST_CREATED', 'PAYMENT_INTENT', inserted.rows[0].id,
        { invoiceId, invoiceNumber, amount: (amountCents / 100).toFixed(2), currency: row.currency, msisdnLast4: payerPhone.slice(-4) });
      await close(req, true);
    } catch (error) { return fail(req, res, error); }

    let providerAccepted = false;
    try {
      await momoClient.requestToPay({ referenceId, externalId: intentId, amount: (amountCents / 100).toFixed(2), currency: momoClient.config.currency, msisdn: payerPhone,
        payerMessage: `Redeemer fees ${invoiceNumber}`, payeeNote: `Invoice ${invoiceNumber}` });
      providerAccepted = true;
      await withTenantTransaction(pool, schoolId, async client => {
        await client.query(`UPDATE payment_intents SET status = 'PENDING', provider_status = 'ACCEPTED' WHERE school_id = $1 AND id = $2 AND status = 'CREATED'`, [schoolId, intentId]);
        await client.query(`INSERT INTO audit_events (school_id, actor_user_id, action, entity_type, entity_id, details)
          VALUES ($1,$2,'MTN_MOMO_PAYMENT_REQUEST_ACCEPTED','PAYMENT_INTENT',$3,$4::jsonb)`, [schoolId, userId, intentId, JSON.stringify({ providerReference: referenceId })]);
      });
      return res.status(202).json({ intent: { id: intentId, invoiceId, amount: (amountCents / 100).toFixed(2), currency: momoClient.config.currency, status: 'PENDING' },
        message: 'The payment request was accepted by MTN. The payer must approve it on their phone; check status before recording it as paid.' });
    } catch (error) {
      const unknown = providerAccepted || (error instanceof MomoProviderError && error.outcomeUnknown);
      const intentStatus = unknown ? 'PENDING' : 'FAILED';
      const providerStatus = providerAccepted ? 'ACCEPTED_NEEDS_RECONCILIATION' : unknown ? 'SUBMISSION_UNKNOWN' : (error instanceof MomoProviderError ? `REJECTED_${error.status || 'ERROR'}` : 'REJECTED_ERROR');
      try {
        await withTenantTransaction(pool, schoolId, async client => {
          await client.query(`UPDATE payment_intents SET status = $3, provider_status = $4 WHERE school_id = $1 AND id = $2 AND status = 'CREATED'`, [schoolId, intentId, intentStatus, providerStatus]);
          await client.query(`INSERT INTO audit_events (school_id, actor_user_id, action, entity_type, entity_id, details)
            VALUES ($1,$2,$3,'PAYMENT_INTENT',$4,$5::jsonb)`, [schoolId, userId, unknown ? 'MTN_MOMO_PAYMENT_REQUEST_OUTCOME_UNKNOWN' : 'MTN_MOMO_PAYMENT_REQUEST_REJECTED', intentId, JSON.stringify({ providerReference: referenceId, providerStatus })]);
        });
      } catch {
        if (unknown) return res.status(202).json({ intent: { id: intentId, invoiceId, amount: (amountCents / 100).toFixed(2), currency: momoClient.config.currency, status: 'PENDING' }, message: 'The request may have reached MTN, but its status could not be saved. Refresh the finance page and check the existing request before trying again.' });
        return res.status(500).json({ error: 'The MTN request was rejected, but its result could not be saved. Refresh finance before trying again.' });
      }
      if (unknown) return res.status(202).json({ intent: { id: intentId, invoiceId, amount: (amountCents / 100).toFixed(2), currency: momoClient.config.currency, status: 'PENDING' }, message: 'MTN could not confirm whether the request was accepted. Check status before trying again.' });
      return res.status(502).json({ error: error instanceof MomoProviderError ? error.message : 'MTN MoMo could not start the payment request.' });
    }
  });

  router.post('/finance/momo/intents/:intentId/check', needsPermission('finance.write'), csrf, async (req, res) => {
    if (!pool || !momoClient.config.enabled) {
      await close(req, false);
      return res.status(503).json({ error: momoClient.config.reason || 'MTN MoMo is not configured in this environment yet.' });
    }
    const schoolId = req.auth.claims.schoolId;
    const userId = req.auth.claims.userId;
    const intentId = text(req.params.intentId, 50);
    try {
      const intentResult = await req.auth.client.query(`SELECT pi.id, pi.invoice_id, pi.payment_id, pi.provider_reference, pi.amount::text, pi.currency, pi.status,
          fi.invoice_number, st.id AS student_id
        FROM payment_intents pi JOIN fee_invoices fi ON fi.school_id = pi.school_id AND fi.id = pi.invoice_id
        JOIN students st ON st.school_id = fi.school_id AND st.id = fi.student_id
        WHERE pi.school_id = $1 AND pi.id = $2`, [schoolId, intentId]);
      await close(req, true);
      if (!intentResult.rowCount) return res.status(404).json({ error: 'Payment request not found for this school.' });
      const intent = intentResult.rows[0];
      if (intent.status === 'SUCCEEDED' || intent.status === 'REVIEW') return res.json({ status: intent.status, message: intent.status === 'SUCCEEDED' ? 'MTN confirmed the payment and it is recorded on the invoice.' : 'MTN confirmed the transfer, but it needs finance review before it can be allocated to this invoice.' });
      if (['FAILED','EXPIRED','CANCELLED'].includes(intent.status)) return res.json({ status: intent.status, message: `This MTN payment request is ${intent.status.toLowerCase()}.` });
      const provider = await momoClient.getRequestStatus(intent.provider_reference);
      const terminalFailure = ['FAILED','REJECTED','EXPIRED','CANCELLED'].includes(provider.status);
      if (terminalFailure) {
        await withTenantTransaction(pool, schoolId, async client => {
          await client.query(`UPDATE payment_intents SET status = $3, provider_status = $4, completed_at = now() WHERE school_id = $1 AND id = $2 AND status IN ('CREATED','PENDING')`, [schoolId, intentId, provider.status === 'EXPIRED' ? 'EXPIRED' : provider.status === 'CANCELLED' ? 'CANCELLED' : 'FAILED', provider.status]);
          await client.query(`INSERT INTO audit_events (school_id, actor_user_id, action, entity_type, entity_id, details) VALUES ($1,$2,'MTN_MOMO_PAYMENT_STATUS_CONFIRMED','PAYMENT_INTENT',$3,$4::jsonb)`, [schoolId, userId, intentId, JSON.stringify({ providerReference: intent.provider_reference, providerStatus: provider.status })]);
        });
        return res.json({ status: provider.status, message: `MTN reported this payment request as ${provider.status.toLowerCase()}.` });
      }
      if (provider.status !== 'SUCCESSFUL') {
        await withTenantTransaction(pool, schoolId, async client => {
          await client.query(`UPDATE payment_intents SET status = 'PENDING', provider_status = $3 WHERE school_id = $1 AND id = $2 AND status IN ('CREATED','PENDING')`, [schoolId, intentId, provider.status]);
        });
        return res.json({ status: 'PENDING', message: 'MTN has not confirmed payment yet. Ask the payer to approve the prompt, then check again.' });
      }

      const amountMatches = provider.amount !== null && Math.round(Number(provider.amount) * 100) === Math.round(Number(intent.amount) * 100);
      const detailsMatch = amountMatches && provider.currency === intent.currency && provider.externalId === intent.id;
      const saved = await withTenantTransaction(pool, schoolId, async client => {
        const locked = await client.query(`SELECT pi.id, pi.invoice_id, pi.payment_id, pi.provider_reference, pi.amount::text, pi.currency, pi.status,
            fi.invoice_number, fi.status AS invoice_status, fi.student_id,
            COALESCE(lines.total,0) AS total, COALESCE(alloc.paid,0) AS paid
          FROM payment_intents pi JOIN fee_invoices fi ON fi.school_id = pi.school_id AND fi.id = pi.invoice_id
          LEFT JOIN LATERAL (SELECT SUM(line_amount) AS total FROM fee_invoice_lines l WHERE l.school_id = fi.school_id AND l.invoice_id = fi.id) lines ON true
          LEFT JOIN LATERAL (SELECT SUM(pa.amount) AS paid FROM payment_allocations pa JOIN payments p ON p.school_id = pa.school_id AND p.id = pa.payment_id AND p.status IN ('SUCCEEDED','PARTIALLY_REVERSED') WHERE pa.school_id = fi.school_id AND pa.invoice_id = fi.id) alloc ON true
          WHERE pi.school_id = $1 AND pi.id = $2 FOR UPDATE OF pi, fi`, [schoolId, intentId]);
        if (!locked.rowCount) throw new Error('Payment request no longer exists.');
        const row = locked.rows[0];
        if (row.payment_id) return { status: row.status, receipt: null };
        if (row.status === 'SUCCEEDED' || row.status === 'REVIEW') return { status: row.status, receipt: null };
        if (!detailsMatch) {
          await client.query(`UPDATE payment_intents SET status = 'REVIEW', provider_status = 'SUCCESSFUL_PROVIDER_DETAILS_MISMATCH', completed_at = now() WHERE school_id = $1 AND id = $2`, [schoolId, intentId]);
          await client.query(`INSERT INTO audit_events (school_id, actor_user_id, action, entity_type, entity_id, details)
            VALUES ($1,$2,'MTN_MOMO_SUCCESS_REQUIRES_REVIEW','PAYMENT_INTENT',$3,$4::jsonb)`, [schoolId, userId, intentId,
            JSON.stringify({ providerReference: row.provider_reference, requestedAmount: row.amount, providerAmount: provider.amount, requestedCurrency: row.currency, providerCurrency: provider.currency, externalIdMatches: provider.externalId === intentId })]);
          return { status: 'REVIEW', receipt: null, fee: null };
        }
        const receivedCents = Math.round(Number(row.amount) * 100);
        const balanceCents = Math.max(0, Math.round((Number(row.total) - Number(row.paid)) * 100));
        const canAllocate = receivedCents <= balanceCents;
        const receipt = `RIA-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomBytes(3).toString('hex').toUpperCase()}`;
        const feeCents = Math.round(receivedCents * momoClient.config.feeRateBps / 10_000);
        const payment = await client.query(`INSERT INTO payments
            (school_id, student_id, currency, amount, channel, status, provider_transaction_id, receipt_number, cashier_user_id, received_at, note, provider_fee_amount, provider_fee_rate_bps)
          VALUES ($1,$2,$3,$4,'MTN_MOMO','SUCCEEDED',$5,$6,$7,now(),$8,$9,$10)
          RETURNING id, receipt_number, amount::text, currency, channel, status, provider_fee_amount::text`,
        [schoolId, row.student_id, row.currency, (receivedCents / 100).toFixed(2), provider.financialTransactionId || row.provider_reference, receipt, userId,
          `MTN Collections payment · ${row.invoice_number}`, (feeCents / 100).toFixed(2), momoClient.config.feeRateBps]);
        if (canAllocate) {
          await client.query(`INSERT INTO payment_allocations (school_id, payment_id, invoice_id, amount) VALUES ($1,$2,$3,$4)`, [schoolId, payment.rows[0].id, row.invoice_id, (receivedCents / 100).toFixed(2)]);
          const nextStatus = receivedCents === balanceCents ? 'PAID' : 'PARTIALLY_PAID';
          await client.query(`UPDATE fee_invoices SET status = $3 WHERE school_id = $1 AND id = $2`, [schoolId, row.invoice_id, nextStatus]);
        }
        const nextIntentStatus = canAllocate ? 'SUCCEEDED' : 'REVIEW';
        const reviewCode = 'INVOICE_BALANCE_CHANGED';
        await client.query(`UPDATE payment_intents SET status = $3, provider_status = $4, payment_id = $5, completed_at = now() WHERE school_id = $1 AND id = $2`,
          [schoolId, intentId, nextIntentStatus, canAllocate ? 'SUCCESSFUL' : `SUCCESSFUL_${reviewCode}`, payment.rows[0].id]);
        await client.query(`INSERT INTO audit_events (school_id, actor_user_id, action, entity_type, entity_id, details)
          VALUES ($1,$2,$3,'PAYMENT',$4,$5::jsonb)`, [schoolId, userId, canAllocate ? 'MTN_MOMO_PAYMENT_ALLOCATED' : 'MTN_MOMO_PAYMENT_REQUIRES_REVIEW', payment.rows[0].id,
          JSON.stringify({ intentId, invoiceId: row.invoice_id, providerReference: row.provider_reference, receipt, grossAmount: (receivedCents / 100).toFixed(2), feeAmount: (feeCents / 100).toFixed(2), feeRateBps: momoClient.config.feeRateBps })]);
        return { status: nextIntentStatus, receipt: payment.rows[0].receipt_number, fee: payment.rows[0].provider_fee_amount };
      });
      const message = saved.status === 'SUCCEEDED' ? `Payment confirmed and allocated. Receipt ${saved.receipt}; MTN fee LRD ${saved.fee}.`
        : 'MTN confirmed the transfer, but its details or the invoice balance changed. The payment was recorded as unallocated for finance review.';
      return res.json({ status: saved.status, receipt: saved.receipt, providerFee: saved.fee, message });
    } catch (error) {
      if (error instanceof MomoProviderError) return res.status(502).json({ error: error.message });
      return res.status(500).json({ error: 'The MTN payment status could not be reconciled. Try again or review the request with finance support.' });
    }
  });

  router.get('/reports', needsAnyPermission(['reports.read', 'emis.export']), async (req, res) => {
    try {
      const schoolId = req.auth.claims.schoolId; const permissions = req.auth.account.permissions;
      const reports = {};
      if (permissions.includes('students.read')) {
        const [counts, classes] = await Promise.all([
          req.auth.client.query(`SELECT count(*) FILTER (WHERE status = 'ACTIVE')::int AS active_students,
              count(*) FILTER (WHERE status <> 'ACTIVE')::int AS inactive_students FROM students WHERE school_id = $1`, [schoolId]),
          req.auth.client.query(`SELECT c.name AS class_name, count(ce.student_id)::int AS students FROM class_groups c LEFT JOIN class_enrollments ce
            ON ce.school_id = c.school_id AND ce.class_group_id = c.id AND ce.status = 'ACTIVE' WHERE c.school_id = $1 GROUP BY c.id, c.name ORDER BY c.name`, [schoolId]),
        ]);
        reports.students = { ...counts.rows[0], classes: classes.rows };
      }
      if (permissions.includes('attendance.read')) {
        const attendance = await req.auth.client.query(`SELECT sa.status, count(*)::int AS count FROM student_attendance sa
          JOIN class_sessions cs ON cs.school_id = sa.school_id AND cs.id = sa.class_session_id
          WHERE sa.school_id = $1 AND cs.scheduled_at >= date_trunc('month', CURRENT_DATE) GROUP BY sa.status ORDER BY sa.status`, [schoolId]);
        reports.attendance = attendance.rows;
      }
      if (permissions.includes('finance.read')) {
        const finance = await req.auth.client.query(`SELECT fi.currency, count(*) FILTER (WHERE fi.status NOT IN ('PAID','VOID'))::int AS open_invoices,
            COALESCE(SUM(lines.total) FILTER (WHERE fi.status NOT IN ('PAID','VOID')),0)::text AS billed,
            COALESCE(SUM(alloc.paid),0)::text AS collected
          FROM fee_invoices fi
          LEFT JOIN LATERAL (SELECT SUM(line_amount) AS total FROM fee_invoice_lines l WHERE l.school_id = fi.school_id AND l.invoice_id = fi.id) lines ON true
          LEFT JOIN LATERAL (SELECT SUM(pa.amount) AS paid FROM payment_allocations pa JOIN payments p ON p.school_id = pa.school_id AND p.id = pa.payment_id AND p.status IN ('SUCCEEDED','PARTIALLY_REVERSED') WHERE pa.school_id = fi.school_id AND pa.invoice_id = fi.id) alloc ON true
          WHERE fi.school_id = $1 AND fi.status <> 'VOID' GROUP BY fi.currency ORDER BY fi.currency`, [schoolId]);
        reports.finance = finance.rows;
      }
      if (permissions.includes('staff.read')) {
        const staff = await req.auth.client.query(`SELECT employment_status, count(*)::int AS count FROM staff_records WHERE school_id = $1 GROUP BY employment_status ORDER BY employment_status`, [schoolId]);
        reports.staff = staff.rows;
      }
      await close(req, true);
      return res.json({ reports });
    } catch (error) { return fail(req, res, error); }
  });

  // Admissions, HR, stock control, and school announcements use the same
  // tenant-scoped transaction and audit trail as the academic workspaces.
  router.get('/admissions', needsPermission('admissions.read'), async (req, res) => {
    try {
      const schoolId = req.auth.claims.schoolId;
      const applications = await req.auth.client.query(`SELECT a.id, a.application_number, a.first_name, a.middle_name, a.last_name,
          a.date_of_birth, a.sex, a.application_date, a.status, a.decision, a.decision_reason, a.notes,
          a.requested_class_group_id, a.converted_student_id,
          el.name AS requested_level, cg.name AS requested_class,
          COALESCE(guardian_rows.items, '[]'::json) AS guardians,
          COALESCE(event_rows.items, '[]'::json) AS events
        FROM admission_applications a
        LEFT JOIN education_levels el ON el.school_id = a.school_id AND el.id = a.requested_level_id
        LEFT JOIN class_groups cg ON cg.school_id = a.school_id AND cg.id = a.requested_class_group_id
        LEFT JOIN LATERAL (
          SELECT json_agg(json_build_object('firstName', ag.first_name, 'lastName', ag.last_name, 'relationship', ag.relationship,
            'phone', ag.phone, 'email', ag.email, 'primary', ag.is_primary) ORDER BY ag.is_primary DESC, ag.last_name, ag.first_name) AS items
          FROM admission_guardians ag WHERE ag.school_id = a.school_id AND ag.application_id = a.id
        ) guardian_rows ON true
        LEFT JOIN LATERAL (
          SELECT json_agg(json_build_object('eventType', ae.event_type, 'occurredAt', ae.occurred_at,
            'actor', actor.full_name, 'details', ae.details) ORDER BY ae.occurred_at DESC) AS items
          FROM admission_events ae JOIN user_accounts actor ON actor.school_id = ae.school_id AND actor.id = ae.actor_user_id
          WHERE ae.school_id = a.school_id AND ae.application_id = a.id
        ) event_rows ON true
        WHERE a.school_id = $1 ORDER BY a.application_date DESC, a.created_at DESC LIMIT 500`, [schoolId]);
      const options = await req.auth.client.query(`SELECT id, code, name FROM education_levels WHERE school_id = $1 AND active ORDER BY sort_order, name`, [schoolId]);
      const classes = await req.auth.client.query(`SELECT id, name, grade_level FROM class_groups WHERE school_id = $1 ORDER BY grade_level, name`, [schoolId]);
      await close(req, true);
      return res.json({ applications: applications.rows, levels: options.rows, classes: classes.rows, canWrite: req.auth.account.permissions.includes('admissions.write') });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/admissions', needsPermission('admissions.write'), csrf, async (req, res) => {
    const firstName = text(req.body?.firstName); const lastName = text(req.body?.lastName);
    const applicationNumber = text(req.body?.applicationNumber, 40).toUpperCase();
    const guardianFirst = text(req.body?.guardianFirstName); const guardianLast = text(req.body?.guardianLastName);
    const relationship = text(req.body?.relationship, 50); const phone = text(req.body?.phone, 40); const email = text(req.body?.email, 254).toLowerCase();
    const dateOfBirth = req.body?.dateOfBirth || null; const levelId = text(req.body?.requestedLevelId, 50) || null;
    const classId = text(req.body?.requestedClassGroupId, 50) || null;
    if (!firstName || !lastName || !applicationNumber || !guardianFirst || !guardianLast || !relationship || (!phone && !email) || (dateOfBirth && !validDate(dateOfBirth))) {
      await close(req, false); return res.status(400).json({ error: 'Enter the applicant name, unique application number, guardian name and relationship, and at least one guardian contact.' });
    }
    try {
      const schoolId = req.auth.claims.schoolId;
      const application = await req.auth.client.query(`INSERT INTO admission_applications
        (school_id, application_number, first_name, last_name, date_of_birth, requested_level_id, requested_class_group_id, created_by)
        SELECT $1, $2, $3, $4, $5, el.id, cg.id, $8 FROM (SELECT 1) seed
        LEFT JOIN education_levels el ON el.school_id = $1 AND el.id = $6 AND el.active
        LEFT JOIN class_groups cg ON cg.school_id = $1 AND cg.id = $7
        WHERE ($6::uuid IS NULL OR el.id IS NOT NULL) AND ($7::uuid IS NULL OR cg.id IS NOT NULL)
        RETURNING id, application_number, first_name, last_name, application_date, status`, [schoolId, applicationNumber, firstName, lastName, dateOfBirth, levelId, classId, req.auth.claims.userId]);
      if (!application.rowCount) { await close(req, false); return res.status(400).json({ error: 'Choose an education level and class belonging to this school.' }); }
      await req.auth.client.query(`INSERT INTO admission_guardians (school_id, application_id, first_name, last_name, relationship, phone, email, is_primary)
        VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),NULLIF($7,''),true)`, [schoolId, application.rows[0].id, guardianFirst, guardianLast, relationship, phone, email]);
      await req.auth.client.query(`INSERT INTO admission_events (school_id, application_id, event_type, actor_user_id, details) VALUES ($1,$2,'APPLICATION_RECEIVED',$3,$4::jsonb)`, [schoolId, application.rows[0].id, req.auth.claims.userId, JSON.stringify({ status: 'RECEIVED' })]);
      await audit(req, 'ADMISSION_APPLICATION_CREATED', 'ADMISSION_APPLICATION', application.rows[0].id, { applicationNumber });
      return done(req, res, 201, { application: application.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/admissions/:applicationId/status', needsPermission('admissions.write'), csrf, async (req, res) => {
    const status = text(req.body?.status, 30).toUpperCase(); const reason = text(req.body?.reason, 500);
    const allowed = new Set(['UNDER_REVIEW','INTERVIEW_SCHEDULED','OFFERED','ACCEPTED','WAITLISTED','REJECTED','WITHDRAWN']);
    if (!allowed.has(status) || (['REJECTED','WAITLISTED'].includes(status) && !reason)) { await close(req, false); return res.status(400).json({ error: 'Choose a valid next status and provide a reason for rejection or waitlisting.' }); }
    try {
      const id = req.params.applicationId; const schoolId = req.auth.claims.schoolId;
      const result = await req.auth.client.query(`UPDATE admission_applications SET status = $3, decision = CASE WHEN $3 IN ('OFFERED','ACCEPTED','REJECTED','WAITLISTED') THEN $3 ELSE decision END, decision_reason = NULLIF($4,''), updated_at = now()
        WHERE school_id = $1 AND id = $2 AND status NOT IN ('ENROLLED','WITHDRAWN') RETURNING id, application_number, status`, [schoolId, id, status, reason]);
      if (!result.rowCount) { await close(req, false); return res.status(404).json({ error: 'Application not found or already closed.' }); }
      await req.auth.client.query(`INSERT INTO admission_events (school_id, application_id, event_type, actor_user_id, details) VALUES ($1,$2,$3,$4,$5::jsonb)`, [schoolId, id, `STATUS_${status}`, req.auth.claims.userId, JSON.stringify({ reason })]);
      await audit(req, 'ADMISSION_STATUS_CHANGED', 'ADMISSION_APPLICATION', id, { status });
      return done(req, res, 200, { application: result.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/admissions/:applicationId/enroll', needsPermission('admissions.write'), csrf, async (req, res) => {
    const studentNumber = text(req.body?.studentNumber, 40).toUpperCase();
    const classGroupId = text(req.body?.classGroupId, 50);
    if (!/^[A-Z0-9_-]{2,40}$/.test(studentNumber) || !classGroupId) {
      await close(req, false);
      return res.status(400).json({ error: 'Enter a valid student number and select a class before enrolling this applicant.' });
    }
    try {
      const schoolId = req.auth.claims.schoolId;
      const application = await req.auth.client.query(`SELECT id, application_number, first_name, middle_name, last_name,
          date_of_birth, sex, campus_id, status, converted_student_id
        FROM admission_applications WHERE school_id = $1 AND id = $2 FOR UPDATE`, [schoolId, req.params.applicationId]);
      if (!application.rowCount) { await close(req, false); return res.status(404).json({ error: 'Application not found in this school.' }); }
      const applicant = application.rows[0];
      if (applicant.status !== 'ACCEPTED' || applicant.converted_student_id) {
        await close(req, false);
        return res.status(409).json({ error: 'Only an accepted applicant who has not already been enrolled can be converted.' });
      }
      const selectedClass = await req.auth.client.query(`SELECT id, academic_year_id, campus_id, name
        FROM class_groups WHERE school_id = $1 AND id = $2 FOR UPDATE`, [schoolId, classGroupId]);
      if (!selectedClass.rowCount) { await close(req, false); return res.status(400).json({ error: 'Choose a class belonging to this school.' }); }
      const schoolClass = selectedClass.rows[0];
      const student = await req.auth.client.query(`INSERT INTO students
          (school_id, campus_id, student_number, first_name, middle_name, last_name, date_of_birth, sex)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id, student_number, first_name, middle_name, last_name, date_of_birth, sex`,
      [schoolId, applicant.campus_id || schoolClass.campus_id || null, studentNumber, applicant.first_name, applicant.middle_name || null, applicant.last_name, applicant.date_of_birth || null, applicant.sex || null]);
      const enrolledStudent = student.rows[0];
      await req.auth.client.query(`INSERT INTO class_enrollments (school_id, student_id, class_group_id)
        VALUES ($1,$2,$3)`, [schoolId, enrolledStudent.id, schoolClass.id]);
      await req.auth.client.query(`INSERT INTO student_enrollment_history
          (school_id, student_id, academic_year_id, campus_id, class_group_id, status, effective_on, recorded_by)
        VALUES ($1,$2,$3,$4,$5,'ENROLLED',CURRENT_DATE,$6)`,
      [schoolId, enrolledStudent.id, schoolClass.academic_year_id, applicant.campus_id || schoolClass.campus_id || null, schoolClass.id, req.auth.claims.userId]);

      const guardians = await req.auth.client.query(`SELECT first_name, last_name, relationship, phone, email, is_primary
        FROM admission_guardians WHERE school_id = $1 AND application_id = $2 ORDER BY is_primary DESC, last_name, first_name`, [schoolId, applicant.id]);
      let primaryLinked = false;
      for (const guardian of guardians.rows) {
        const existing = await req.auth.client.query(`SELECT id FROM guardians
          WHERE school_id = $1 AND (($2 <> '' AND lower(email) = lower($2)) OR ($3 <> '' AND phone = $3))
          ORDER BY CASE WHEN $2 <> '' AND lower(email) = lower($2) THEN 0 ELSE 1 END LIMIT 1 FOR UPDATE`,
        [schoolId, guardian.email || '', guardian.phone || '']);
        const linked = existing.rowCount ? existing.rows[0] : (await req.auth.client.query(`INSERT INTO guardians
          (school_id, first_name, last_name, email, phone)
          VALUES ($1,$2,$3,NULLIF($4,''),NULLIF($5,'')) RETURNING id`,
        [schoolId, guardian.first_name, guardian.last_name, guardian.email || '', guardian.phone || ''])).rows[0];
        await req.auth.client.query(`INSERT INTO student_guardians
            (school_id, student_id, guardian_id, relationship, is_primary, can_view_results, can_view_finance, communication_consent)
          VALUES ($1,$2,$3,$4,$5,true,false,false)
          ON CONFLICT (school_id, student_id, guardian_id) DO NOTHING`,
        [schoolId, enrolledStudent.id, linked.id, guardian.relationship, Boolean(guardian.is_primary && !primaryLinked)]);
        if (guardian.is_primary) primaryLinked = true;
      }
      await req.auth.client.query(`UPDATE admission_applications SET status='ENROLLED', converted_student_id=$3,
          converted_at=now(), updated_at=now() WHERE school_id=$1 AND id=$2`, [schoolId, applicant.id, enrolledStudent.id]);
      await req.auth.client.query(`INSERT INTO admission_events (school_id, application_id, event_type, actor_user_id, details)
        VALUES ($1,$2,'APPLICANT_ENROLLED',$3,$4::jsonb)`,
      [schoolId, applicant.id, req.auth.claims.userId, JSON.stringify({ studentId: enrolledStudent.id, studentNumber, classGroupId: schoolClass.id })]);
      await audit(req, 'ADMISSION_APPLICANT_ENROLLED', 'STUDENT', enrolledStudent.id, { applicationId: applicant.id, applicationNumber: applicant.application_number, studentNumber, classGroupId: schoolClass.id });
      return done(req, res, 201, { student: enrolledStudent, className: schoolClass.name, guardianCount: guardians.rowCount });
    } catch (error) { return fail(req, res, error); }
  });

  router.get('/staff', needsPermission('staff.read'), async (req, res) => {
    try {
      const schoolId = req.auth.claims.schoolId; const isHr = req.auth.account.permissions.includes('staff.time.review');
      const staff = await req.auth.client.query(`SELECT s.id, s.employee_number, s.first_name, s.last_name, s.email, s.phone, s.job_title, s.department, s.hired_on, s.employment_status, u.id AS user_id, u.role,
          (SELECT json_build_object('id', t.id, 'clockedInAt', t.clocked_in_at, 'clockedOutAt', t.clocked_out_at, 'status', t.status) FROM staff_attendance_sessions t WHERE t.school_id=s.school_id AND t.staff_record_id=s.id ORDER BY t.clocked_in_at DESC LIMIT 1) AS last_time_entry
        FROM staff_records s LEFT JOIN user_accounts u ON u.school_id=s.school_id AND u.id=s.user_id WHERE s.school_id=$1 ORDER BY s.employment_status, s.last_name, s.first_name`, [schoolId]);
      const leaves = isHr ? await req.auth.client.query(`SELECT l.id, l.leave_type, l.starts_on, l.ends_on, l.reason, l.status, s.employee_number, s.first_name, s.last_name FROM staff_leave_requests l JOIN staff_records s ON s.school_id=l.school_id AND s.id=l.staff_record_id WHERE l.school_id=$1 ORDER BY l.requested_at DESC LIMIT 200`, [schoolId]) : { rows: [] };
      const timeEntries = isHr ? await req.auth.client.query(`SELECT t.id, t.clocked_in_at, t.clocked_out_at, t.status, s.employee_number, s.first_name, s.last_name FROM staff_attendance_sessions t JOIN staff_records s ON s.school_id=t.school_id AND s.id=t.staff_record_id WHERE t.school_id=$1 ORDER BY t.clocked_in_at DESC LIMIT 200`, [schoolId]) : { rows: [] };
      const self = await req.auth.client.query(`SELECT id FROM staff_records WHERE school_id=$1 AND user_id=$2 AND employment_status IN ('ACTIVE','ON_LEAVE')`, [schoolId, req.auth.claims.userId]);
      const open = self.rowCount ? await req.auth.client.query(`SELECT id, clocked_in_at FROM staff_attendance_sessions WHERE school_id=$1 AND staff_record_id=$2 AND status='OPEN' ORDER BY clocked_in_at DESC LIMIT 1`, [schoolId, self.rows[0].id]) : { rows: [] };
      await close(req, true); return res.json({ staff: staff.rows, leaveRequests: leaves.rows, timeEntries: timeEntries.rows, canManage: req.auth.account.permissions.includes('staff.write'), canReviewTime: isHr, canClock: self.rowCount > 0, staffId: self.rows[0]?.id || null, openTimeEntry: open.rows[0] || null });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/staff/clock', needsAnyPermission(['staff.read','staff.write']), csrf, async (req, res) => {
    const action = text(req.body?.action, 12).toUpperCase();
    if (!['IN','OUT'].includes(action)) { await close(req, false); return res.status(400).json({ error: 'Choose clock in or clock out.' }); }
    try {
      const schoolId = req.auth.claims.schoolId; const staff = await req.auth.client.query(`SELECT id FROM staff_records WHERE school_id=$1 AND user_id=$2 AND employment_status='ACTIVE'`, [schoolId, req.auth.claims.userId]);
      if (!staff.rowCount) { await close(req, false); return res.status(403).json({ error: 'Your login is not linked to an active staff record. Ask HR to link it before clocking time.' }); }
      let result;
      if (action === 'IN') result = await req.auth.client.query(`INSERT INTO staff_attendance_sessions (school_id, staff_record_id, clocked_in_at) SELECT $1,$2,now() WHERE NOT EXISTS (SELECT 1 FROM staff_attendance_sessions WHERE school_id=$1 AND staff_record_id=$2 AND status='OPEN') RETURNING id, clocked_in_at, clocked_out_at`, [schoolId, staff.rows[0].id]);
      else result = await req.auth.client.query(`UPDATE staff_attendance_sessions SET clocked_out_at=now(), status='CLOSED' WHERE school_id=$1 AND staff_record_id=$2 AND status='OPEN' RETURNING id, clocked_in_at, clocked_out_at`, [schoolId, staff.rows[0].id]);
      if (!result.rowCount) { await close(req, false); return res.status(409).json({ error: action === 'IN' ? 'You already have an open shift.' : 'There is no open shift to clock out.' }); }
      await audit(req, `STAFF_CLOCK_${action}`, 'STAFF_TIME_ENTRY', result.rows[0].id);
      return done(req,res,200,{entry:result.rows[0]});
    } catch (error) { return fail(req,res,error); }
  });

  router.get('/inventory', needsPermission('inventory.read'), async (req, res) => {
    try {
      const schoolId=req.auth.claims.schoolId;
      const [items,locations,movements,requests,orders]=await Promise.all([
        req.auth.client.query(`SELECT i.id,i.sku,i.name,i.category,i.unit,i.reorder_level,i.active,COALESCE(sum(CASE WHEN m.movement_type IN ('RECEIPT','TRANSFER_IN') THEN m.quantity WHEN m.movement_type IN ('ISSUE','TRANSFER_OUT') THEN -m.quantity WHEN m.movement_type='ADJUSTMENT' THEN m.quantity ELSE 0 END),0)::numeric AS on_hand FROM inventory_items i LEFT JOIN stock_movements m ON m.school_id=i.school_id AND m.item_id=i.id WHERE i.school_id=$1 GROUP BY i.id ORDER BY i.name`,[schoolId]),
        req.auth.client.query(`SELECT id,code,name FROM inventory_locations WHERE school_id=$1 AND active ORDER BY name`,[schoolId]),
        req.auth.client.query(`SELECT m.id,m.movement_type,m.quantity,m.movement_date,m.reference,m.reason,i.name AS item_name,l.name AS location_name,u.full_name AS recorded_by FROM stock_movements m JOIN inventory_items i ON i.school_id=m.school_id AND i.id=m.item_id JOIN inventory_locations l ON l.school_id=m.school_id AND l.id=m.location_id JOIN user_accounts u ON u.school_id=m.school_id AND u.id=m.recorded_by WHERE m.school_id=$1 ORDER BY m.movement_date DESC LIMIT 200`,[schoolId]),
        req.auth.client.query(`SELECT r.id,r.request_number,r.status,r.justification,r.decision_reason,r.created_at,r.estimated_currency,u.full_name AS requested_by,p.id AS purchase_order_id,
          COALESCE(json_agg(json_build_object('itemId',l.item_id,'sku',i.sku,'itemName',i.name,'unit',i.unit,'quantity',l.quantity,'estimatedUnitCost',l.estimated_unit_cost,'note',l.note)) FILTER (WHERE l.id IS NOT NULL),'[]') AS lines
          FROM procurement_requests r JOIN user_accounts u ON u.school_id=r.school_id AND u.id=r.requested_by
          LEFT JOIN procurement_request_lines l ON l.school_id=r.school_id AND l.procurement_request_id=r.id
          LEFT JOIN inventory_items i ON i.school_id=l.school_id AND i.id=l.item_id
          LEFT JOIN purchase_orders p ON p.school_id=r.school_id AND p.procurement_request_id=r.id
          WHERE r.school_id=$1 GROUP BY r.id,u.full_name,p.id ORDER BY r.created_at DESC LIMIT 100`,[schoolId]),
        req.auth.client.query(`SELECT p.id,p.purchase_order_number,p.vendor_name,p.currency,p.status,p.ordered_at,p.submitted_at,p.approved_at,
          COALESCE(json_agg(json_build_object('itemId',l.item_id,'sku',i.sku,'itemName',i.name,'unit',i.unit,'quantity',l.quantity,'receivedQuantity',l.received_quantity,'unitPrice',l.unit_price)) FILTER (WHERE l.id IS NOT NULL),'[]') AS lines
          FROM purchase_orders p LEFT JOIN purchase_order_lines l ON l.school_id=p.school_id AND l.purchase_order_id=p.id
          LEFT JOIN inventory_items i ON i.school_id=l.school_id AND i.id=l.item_id
          WHERE p.school_id=$1 GROUP BY p.id ORDER BY p.submitted_at DESC NULLS LAST,p.ordered_at DESC NULLS LAST LIMIT 100`,[schoolId])
      ]);
      await close(req,true); return res.json({items:items.rows,locations:locations.rows,movements:movements.rows,requests:requests.rows,orders:orders.rows,canWrite:req.auth.account.permissions.includes('inventory.write'),canApprove:req.auth.account.permissions.includes('inventory.approve')});
    } catch(error){return fail(req,res,error);}
  });

  router.post('/inventory/items', needsPermission('inventory.write'), csrf, async(req,res)=>{
    const sku=text(req.body?.sku,40).toUpperCase(); const name=text(req.body?.name); const category=text(req.body?.category,80); const unit=text(req.body?.unit,30); const reorder=Number(req.body?.reorderLevel||0);
    if(!sku||!name||!category||!unit||!Number.isFinite(reorder)||reorder<0){await close(req,false);return res.status(400).json({error:'Enter SKU, item name, category, unit, and a non-negative reorder level.'});}
    try{const schoolId=req.auth.claims.schoolId; const r=await req.auth.client.query(`INSERT INTO inventory_items(school_id,sku,name,category,unit,reorder_level) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,sku,name,category,unit,reorder_level`,[schoolId,sku,name,category,unit,reorder]); await audit(req,'INVENTORY_ITEM_CREATED','INVENTORY_ITEM',r.rows[0].id,{sku});return done(req,res,201,{item:r.rows[0]});}catch(error){return fail(req,res,error);}
  });

  router.post('/inventory/locations', needsPermission('inventory.write'), csrf, async(req,res)=>{
    const code=text(req.body?.code,30).toUpperCase();const name=text(req.body?.name);
    if(!code||!name){await close(req,false);return res.status(400).json({error:'Enter a location code and name.'});}
    try{const r=await req.auth.client.query(`INSERT INTO inventory_locations(school_id,code,name) VALUES($1,$2,$3) RETURNING id,code,name`,[req.auth.claims.schoolId,code,name]);await audit(req,'INVENTORY_LOCATION_CREATED','INVENTORY_LOCATION',r.rows[0].id,{code});return done(req,res,201,{location:r.rows[0]});}catch(error){return fail(req,res,error);}
  });

  router.post('/inventory/movements', needsPermission('inventory.write'), csrf, async(req,res)=>{
    const itemId=text(req.body?.itemId,50); const locationId=text(req.body?.locationId,50); const quantity=Number(req.body?.quantity); const type=text(req.body?.type,20).toUpperCase(); const reason=text(req.body?.reason,500); const reference=text(req.body?.reference,100);
    if(!itemId||!locationId||!Number.isFinite(quantity)||quantity<=0||!['RECEIPT','ISSUE','ADJUSTMENT'].includes(type)||!reason){await close(req,false);return res.status(400).json({error:'Enter a valid item, location, positive quantity, movement type, and reason.'});}
    try{const schoolId=req.auth.claims.schoolId; if(type==='ISSUE'){const stock=await req.auth.client.query(`SELECT COALESCE(sum(CASE WHEN movement_type IN ('RECEIPT','TRANSFER_IN') THEN quantity WHEN movement_type IN ('ISSUE','TRANSFER_OUT') THEN -quantity WHEN movement_type='ADJUSTMENT' THEN quantity ELSE 0 END),0) AS on_hand FROM stock_movements WHERE school_id=$1 AND item_id=$2 AND location_id=$3`,[schoolId,itemId,locationId]);if(Number(stock.rows[0].on_hand)<quantity){await close(req,false);return res.status(409).json({error:'Not enough stock is available at this location.'});}}
      const r=await req.auth.client.query(`INSERT INTO stock_movements(school_id,item_id,location_id,movement_type,quantity,reference,reason,recorded_by) SELECT $1,i.id,l.id,$4,$5,NULLIF($6,''),$7,$8 FROM inventory_items i JOIN inventory_locations l ON l.school_id=i.school_id WHERE i.school_id=$1 AND i.id=$2 AND l.id=$3 AND i.active AND l.active RETURNING id,movement_type,quantity,reference,reason,movement_date`,[schoolId,itemId,locationId,type,quantity,reference,reason,req.auth.claims.userId]);if(!r.rowCount){await close(req,false);return res.status(400).json({error:'Choose an active item and location belonging to this school.'});}await audit(req,'INVENTORY_MOVEMENT_RECORDED','STOCK_MOVEMENT',r.rows[0].id,{type,quantity});return done(req,res,201,{movement:r.rows[0]});}catch(error){return fail(req,res,error);}
  });

  router.post('/inventory/requests', needsPermission('inventory.write'), csrf, async (req, res) => {
    const justification=text(req.body?.justification,1000); const currency=text(req.body?.currency,3).toUpperCase(); const rawLines=Array.isArray(req.body?.lines)?req.body.lines:[];
    const lines=rawLines.slice(0,50).map(line=>({itemId:text(line?.itemId,50),quantity:Number(line?.quantity),estimatedUnitCost:Number(line?.estimatedUnitCost||0),note:text(line?.note,300)}));
    if(!justification||!['LRD','USD'].includes(currency)||lines.length===0||lines.some(line=>!line.itemId||!Number.isFinite(line.quantity)||line.quantity<=0||!Number.isFinite(line.estimatedUnitCost)||line.estimatedUnitCost<0)||new Set(lines.map(line=>line.itemId)).size!==lines.length){
      await close(req,false); return res.status(400).json({error:'Enter a reason, choose LRD or USD, and add unique items with valid quantities and estimated unit costs.'});
    }
    try{
      const schoolId=req.auth.claims.schoolId; const requestNumber=`PR-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomUUID().slice(0,8).toUpperCase()}`;
      const request=await req.auth.client.query(`INSERT INTO procurement_requests(school_id,request_number,requested_by,status,justification,submitted_at,estimated_currency)
        VALUES($1,$2,$3,'SUBMITTED',$4,now(),$5) RETURNING id,request_number,status`,[schoolId,requestNumber,req.auth.claims.userId,justification,currency]);
      for(const line of lines){
        const saved=await req.auth.client.query(`INSERT INTO procurement_request_lines(school_id,procurement_request_id,item_id,quantity,estimated_unit_cost,note)
          SELECT $1,$2,i.id,$4,$5,$6 FROM inventory_items i WHERE i.school_id=$1 AND i.id=$3 AND i.active RETURNING id`,[schoolId,request.rows[0].id,line.itemId,line.quantity,line.estimatedUnitCost,line.note]);
        if(!saved.rowCount){await close(req,false);return res.status(400).json({error:'One selected item is not active or does not belong to this school. Refresh inventory and try again.'});}
      }
      await audit(req,'PROCUREMENT_REQUEST_SUBMITTED','PROCUREMENT_REQUEST',request.rows[0].id,{requestNumber,lineCount:lines.length});
      return done(req,res,201,{request:request.rows[0]});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/inventory/requests/:requestId/decision', needsPermission('inventory.approve'), csrf, async(req,res)=>{
    const decision=text(req.body?.decision,20).toUpperCase(); const reason=text(req.body?.reason,1000);
    if(!['APPROVE','REJECT'].includes(decision)||(decision==='REJECT'&&!reason)){await close(req,false);return res.status(400).json({error:'Choose approve or reject; a reason is required when rejecting.'});}
    try{
      const status=decision==='APPROVE'?'APPROVED':'REJECTED';
      const result=await req.auth.client.query(`UPDATE procurement_requests SET status=$3,approved_by=CASE WHEN $3='APPROVED' THEN $4 ELSE NULL END,approved_at=CASE WHEN $3='APPROVED' THEN now() ELSE NULL END,decided_at=now(),decision_reason=NULLIF($5,'')
        WHERE school_id=$1 AND id=$2 AND status='SUBMITTED' RETURNING id,request_number,status,decision_reason`,[req.auth.claims.schoolId,req.params.requestId,status,req.auth.claims.userId,reason]);
      if(!result.rowCount){await close(req,false);return res.status(409).json({error:'This request is no longer waiting for approval.'});}
      await audit(req,`PROCUREMENT_REQUEST_${status}`,'PROCUREMENT_REQUEST',result.rows[0].id,{requestNumber:result.rows[0].request_number,reason});
      return done(req,res,200,{request:result.rows[0]});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/inventory/orders', needsPermission('inventory.write'), csrf, async(req,res)=>{
    const requestId=text(req.body?.requestId,50); const vendorName=text(req.body?.vendorName,160); const currency=text(req.body?.currency,3).toUpperCase(); const rawLines=Array.isArray(req.body?.lines)?req.body.lines:[];
    const lines=rawLines.slice(0,50).map(line=>({itemId:text(line?.itemId,50),quantity:Number(line?.quantity),unitPrice:Number(line?.unitPrice)}));
    if(!requestId||!vendorName||!['LRD','USD'].includes(currency)||!lines.length||lines.some(line=>!line.itemId||!Number.isFinite(line.quantity)||line.quantity<=0||!Number.isFinite(line.unitPrice)||line.unitPrice<0)||new Set(lines.map(line=>line.itemId)).size!==lines.length){await close(req,false);return res.status(400).json({error:'Choose an approved request, enter the vendor and currency, and provide valid prices for its items.'});}
    try{
      const schoolId=req.auth.claims.schoolId;
      const request=await req.auth.client.query(`SELECT id,request_number,status FROM procurement_requests WHERE school_id=$1 AND id=$2 FOR UPDATE`,[schoolId,requestId]);
      if(!request.rowCount||request.rows[0].status!=='APPROVED'){await close(req,false);return res.status(409).json({error:'Only an approved procurement request can become a purchase order.'});}
      const requested=await req.auth.client.query(`SELECT item_id,quantity FROM procurement_request_lines WHERE school_id=$1 AND procurement_request_id=$2 ORDER BY item_id`,[schoolId,requestId]);
      const requestedByItem=new Map(requested.rows.map(row=>[row.item_id,Number(row.quantity)]));
      if(lines.length!==requestedByItem.size||lines.some(line=>!requestedByItem.has(line.itemId)||line.quantity!==requestedByItem.get(line.itemId))){await close(req,false);return res.status(400).json({error:'Purchase order quantities must match every approved request line exactly.'});}
      const poNumber=`PO-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomUUID().slice(0,8).toUpperCase()}`;
      const order=await req.auth.client.query(`INSERT INTO purchase_orders(school_id,purchase_order_number,vendor_name,currency,status,procurement_request_id,requested_by,submitted_at)
        VALUES($1,$2,$3,$4,'SUBMITTED',$5,$6,now()) RETURNING id,purchase_order_number,status`,[schoolId,poNumber,vendorName,currency,requestId,req.auth.claims.userId]);
      for(const line of lines) await req.auth.client.query(`INSERT INTO purchase_order_lines(school_id,purchase_order_id,item_id,quantity,unit_price) VALUES($1,$2,$3,$4,$5)`,[schoolId,order.rows[0].id,line.itemId,line.quantity,line.unitPrice]);
      await audit(req,'PURCHASE_ORDER_SUBMITTED','PURCHASE_ORDER',order.rows[0].id,{purchaseOrderNumber:poNumber,requestNumber:request.rows[0].request_number,currency});
      return done(req,res,201,{order:order.rows[0]});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/inventory/orders/:orderId/approve', needsPermission('inventory.approve'), csrf, async(req,res)=>{
    try{
      const result=await req.auth.client.query(`UPDATE purchase_orders SET status='APPROVED',approved_by=$3,approved_at=now(),ordered_at=now()
        WHERE school_id=$1 AND id=$2 AND status='SUBMITTED' RETURNING id,purchase_order_number,status,ordered_at`,[req.auth.claims.schoolId,req.params.orderId,req.auth.claims.userId]);
      if(!result.rowCount){await close(req,false);return res.status(409).json({error:'This purchase order is no longer waiting for approval.'});}
      await req.auth.client.query(`UPDATE procurement_requests SET status='ORDERED' WHERE school_id=$1 AND id=(SELECT procurement_request_id FROM purchase_orders WHERE school_id=$1 AND id=$2) AND status='APPROVED'`,[req.auth.claims.schoolId,req.params.orderId]);
      await audit(req,'PURCHASE_ORDER_APPROVED','PURCHASE_ORDER',result.rows[0].id,{purchaseOrderNumber:result.rows[0].purchase_order_number});
      return done(req,res,200,{order:result.rows[0]});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/inventory/orders/:orderId/receive', needsPermission('inventory.write'), csrf, async(req,res)=>{
    const rawLines=Array.isArray(req.body?.lines)?req.body.lines:[];
    const lines=rawLines.map(line=>({itemId:text(line?.itemId,50),locationId:text(line?.locationId,50),quantity:Number(line?.quantity)}));
    if(!lines.length||lines.some(line=>!line.itemId||!line.locationId||!Number.isFinite(line.quantity)||line.quantity<=0)||new Set(lines.map(line=>line.itemId)).size!==lines.length){await close(req,false);return res.status(400).json({error:'Choose a valid stock location and positive received quantity for each unique order item.'});}
    try{
      const schoolId=req.auth.claims.schoolId;const orderResult=await req.auth.client.query(`SELECT id,purchase_order_number,status FROM purchase_orders WHERE school_id=$1 AND id=$2 FOR UPDATE`,[schoolId,req.params.orderId]);
      if(!orderResult.rowCount||!['APPROVED','PARTIALLY_RECEIVED'].includes(orderResult.rows[0].status)){await close(req,false);return res.status(409).json({error:'Only an approved order with goods outstanding can be received.'});}
      const order=orderResult.rows[0];const orderLines=await req.auth.client.query(`SELECT l.item_id,l.quantity,l.received_quantity,i.name FROM purchase_order_lines l JOIN inventory_items i ON i.school_id=l.school_id AND i.id=l.item_id WHERE l.school_id=$1 AND l.purchase_order_id=$2 ORDER BY l.item_id FOR UPDATE OF l`,[schoolId,order.id]);
      const lineMap=new Map(orderLines.rows.map(row=>[row.item_id,row]));
      for(const line of lines){
        const existing=lineMap.get(line.itemId);if(!existing||line.quantity>Number(existing.quantity)-Number(existing.received_quantity)){await close(req,false);return res.status(400).json({error:'A received quantity exceeds the outstanding quantity on this purchase order.'});}
        const location=await req.auth.client.query(`SELECT id FROM inventory_locations WHERE school_id=$1 AND id=$2 AND active`,[schoolId,line.locationId]);if(!location.rowCount){await close(req,false);return res.status(400).json({error:'Choose an active stock location belonging to this school.'});}
        await req.auth.client.query(`INSERT INTO stock_movements(school_id,item_id,location_id,movement_type,quantity,reference,reason,recorded_by) VALUES($1,$2,$3,'RECEIPT',$4,$5,$6,$7)`,[schoolId,line.itemId,line.locationId,line.quantity,order.purchase_order_number,`Goods received against ${order.purchase_order_number}`,req.auth.claims.userId]);
        await req.auth.client.query(`UPDATE purchase_order_lines SET received_quantity=received_quantity+$4 WHERE school_id=$1 AND purchase_order_id=$2 AND item_id=$3`,[schoolId,order.id,line.itemId,line.quantity]);
      }
      const totals=await req.auth.client.query(`SELECT count(*) AS line_count,count(*) FILTER (WHERE received_quantity=quantity) AS complete_count,count(*) FILTER (WHERE received_quantity>0) AS started_count FROM purchase_order_lines WHERE school_id=$1 AND purchase_order_id=$2`,[schoolId,order.id]);
      const allReceived=Number(totals.rows[0].line_count)===Number(totals.rows[0].complete_count);const anyReceived=Number(totals.rows[0].started_count)>0;const newStatus=allReceived?'RECEIVED':'PARTIALLY_RECEIVED';
      await req.auth.client.query(`UPDATE purchase_orders SET status=$3,received_at=CASE WHEN $3='RECEIVED' THEN now() ELSE received_at END WHERE school_id=$1 AND id=$2`,[schoolId,order.id,newStatus]);
      await audit(req,'PURCHASE_ORDER_GOODS_RECEIVED','PURCHASE_ORDER',order.id,{purchaseOrderNumber:order.purchase_order_number,lines:lines.length,complete:allReceived});
      return done(req,res,200,{status:newStatus,partial:anyReceived&&!allReceived});
    }catch(error){return fail(req,res,error);}
  });

  router.get('/communications', needsPermission('communications.read'), async(req,res)=>{
    try{const schoolId=req.auth.claims.schoolId;const [announcements,deliveries,classes]=await Promise.all([
      req.auth.client.query(`SELECT a.id,a.title,a.body,a.audience,a.status,a.created_at,a.published_at,u.full_name AS author FROM announcements a JOIN user_accounts u ON u.school_id=a.school_id AND u.id=a.created_by WHERE a.school_id=$1 ORDER BY a.created_at DESC LIMIT 200`,[schoolId]),
      req.auth.client.query(`SELECT id,channel,status,count(*) OVER(PARTITION BY announcement_id) AS audience_count,queued_at,sent_at FROM notification_deliveries WHERE school_id=$1 ORDER BY queued_at DESC LIMIT 100`,[schoolId]),
      req.auth.client.query(`SELECT id,name,grade_level FROM class_groups WHERE school_id=$1 ORDER BY grade_level,name`,[schoolId])
    ]);await close(req,true);return res.json({announcements:announcements.rows,deliveries:deliveries.rows,classes:classes.rows,canWrite:req.auth.account.permissions.includes('communications.write')});}catch(error){return fail(req,res,error);}
  });

  router.post('/communications', needsPermission('communications.write'), csrf, async(req,res)=>{
    const title=text(req.body?.title,160);const body=text(req.body?.body,5000);const audience=text(req.body?.audience,30).toUpperCase();const classId=text(req.body?.classGroupId,50)||null;
    if(!title||!body||!['ALL_GUARDIANS','CAMPUS','CLASS','STAFF','LEARNERS'].includes(audience)||(audience==='CLASS'&&!classId)){await close(req,false);return res.status(400).json({error:'Enter a title and message, choose an audience, and select a class for class messages.'});}
    try{const schoolId=req.auth.claims.schoolId;const status=req.auth.account.roles.some(role=>['SCHOOL_ADMIN','PRINCIPAL'].includes(role))?'PUBLISHED':'DRAFT';const r=await req.auth.client.query(`INSERT INTO announcements(school_id,class_group_id,title,body,audience,status,created_by,published_at) SELECT $1,c.id,$3,$4,$5,$6,$7,CASE WHEN $6='PUBLISHED' THEN now() ELSE NULL END FROM (SELECT 1) seed LEFT JOIN class_groups c ON c.school_id=$1 AND c.id=$2 WHERE ($5<>'CLASS' OR c.id IS NOT NULL) RETURNING id,title,body,audience,status,created_at,published_at`,[schoolId,classId,title,body,audience,status,req.auth.claims.userId]);if(!r.rowCount){await close(req,false);return res.status(400).json({error:'Choose a class belonging to this school.'});}await audit(req,'ANNOUNCEMENT_CREATED','ANNOUNCEMENT',r.rows[0].id,{audience,status});return done(req,res,201,{announcement:r.rows[0],notice:status==='PUBLISHED'?'Announcement published in the school system. External email/SMS delivery is not configured.':'Announcement saved as a draft for review.'});}catch(error){return fail(req,res,error);}
  });

  router.post('/communications/:announcementId/publish', needsPermission('communications.write'), csrf, async(req,res)=>{
    try{const r=await req.auth.client.query(`UPDATE announcements SET status='PUBLISHED',approved_by=$3,published_at=now() WHERE school_id=$1 AND id=$2 AND status='DRAFT' RETURNING id,title,status,published_at`,[req.auth.claims.schoolId,req.params.announcementId,req.auth.claims.userId]);if(!r.rowCount){await close(req,false);return res.status(404).json({error:'Draft announcement not found.'});}await audit(req,'ANNOUNCEMENT_PUBLISHED','ANNOUNCEMENT',r.rows[0].id);return done(req,res,200,{announcement:r.rows[0],notice:'Published in the school system. Email/SMS delivery is not configured.'});}catch(error){return fail(req,res,error);}
  });

  router.get('/setup', async (req, res, next) => {
    const canConfigure = req.auth.account.permissions.includes('academics.configure');
    const canViewTeaching = ['attendance.read', 'grades.enter', 'grades.moderate', 'grades.publish'].some(permission => req.auth.account.permissions.includes(permission));
    if (canConfigure || canViewTeaching) return next();
    await close(req, false);
    return res.status(403).json({ error: 'You do not have permission to view school setup.' });
  }, async (req, res) => {
    try {
      const schoolId = req.auth.claims.schoolId;
      const isTeacher = req.auth.account.roles.includes('TEACHER') && !req.auth.account.permissions.includes('academics.configure');
      const [school, years, subjects, classes, teachers, students, assignments, educationLevels, gradeLevels, terms, curriculum, resources, periods, slots, assessments, teachingMaterials] = await Promise.all([
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
        req.auth.client.query(`SELECT m.id,m.teacher_assignment_id,m.title,m.description,m.material_type,m.resource_url,m.status,m.created_at,m.published_at,
            c.name AS class_name,s.name AS subject_name,u.full_name AS teacher_name
          FROM teaching_materials m
          JOIN teacher_subject_assignments ta ON ta.school_id=m.school_id AND ta.id=m.teacher_assignment_id
          JOIN class_groups c ON c.school_id=ta.school_id AND c.id=ta.class_group_id
          JOIN subjects s ON s.school_id=ta.school_id AND s.id=ta.subject_id
          JOIN user_accounts u ON u.school_id=ta.school_id AND u.id=ta.teacher_id
          WHERE m.school_id=$1 ${isTeacher ? 'AND ta.teacher_id=$2' : ''}
          ORDER BY m.created_at DESC LIMIT 100`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
      ]);
      await close(req, true);
      return res.json({ school: school.rows[0], years: years.rows, subjects: subjects.rows, classes: classes.rows,
        teachers: teachers.rows, students: students.rows, assignments: assignments.rows, educationLevels: educationLevels.rows, gradeLevels: gradeLevels.rows, terms: terms.rows,
        curriculum: curriculum.rows, resources: resources.rows, periods: periods.rows, timetable: slots.rows, assessments: assessments.rows, teachingMaterials: teachingMaterials.rows });
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
      // Make subject setup safe to retry: an existing inactive subject is reactivated.
      const result = await req.auth.client.query(`INSERT INTO subjects (school_id, code, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (school_id, code) DO UPDATE SET name = EXCLUDED.name, is_active = TRUE
        RETURNING id, code, name`, [req.auth.claims.schoolId, code, name]);
      await audit(req, 'SUBJECT_SAVED', 'SUBJECT', result.rows[0].id, { code, name });
      return done(req, res, 200, { subject: result.rows[0] });
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
        ? await req.auth.client.query(`SELECT u.id, u.email, u.full_name, u.role, u.status, u.must_reset_password FROM student_portal_links l JOIN user_accounts u ON u.school_id = l.school_id AND u.id = l.user_id WHERE l.school_id = $1 AND l.student_id = $2`, [schoolId, studentId])
        : await req.auth.client.query(`SELECT u.id, u.email, u.full_name, u.role, u.status, u.must_reset_password FROM student_guardians sg JOIN guardians g ON g.school_id = sg.school_id AND g.id = sg.guardian_id JOIN user_accounts u ON u.school_id = g.school_id AND u.id = g.user_id WHERE sg.school_id = $1 AND sg.student_id = $2 AND lower(g.email) = $3`, [schoolId, studentId, email]);
      if (existingLink.rowCount) {
        const pending = existingLink.rows[0];
        if (pending && pending.email?.toLowerCase() === email && pending.role === type && pending.status === 'ACTIVE' && pending.must_reset_password) {
          await createAndSendInvitation(req.auth.client, { schoolId, userId: pending.id, email: pending.email, fullName: pending.full_name, role: type, createdBy: req.auth.claims.userId }, sendInvitation);
          await audit(req, 'PORTAL_INVITATION_RESENT', `${type}_PORTAL`, pending.id, { studentId });
          return done(req, res, 200, { account: pending, notice: `A new password setup email was sent to ${email}. Any previous setup link is no longer valid.` });
        }
        await close(req, false); return res.status(409).json({ error: 'This learner already has a portal account. Pending accounts can receive a new setup email by entering the same account details.' });
      }
      const passwordHash = await hashPassword(randomBytes(32).toString('base64url'));
      const account = await req.auth.client.query(`INSERT INTO user_accounts (school_id, email, password_hash, full_name, role, status, must_reset_password) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', true) RETURNING id, email, full_name, role`, [schoolId, email, passwordHash, fullName, type]);
      await req.auth.client.query(`INSERT INTO user_role_assignments (school_id, user_id, role_id, assigned_by) SELECT $1, $2, id, $3 FROM school_roles WHERE school_id = $1 AND code = $4`, [schoolId, account.rows[0].id, req.auth.claims.userId, type]);
      if (type === 'STUDENT') {
        await req.auth.client.query('INSERT INTO student_portal_links (school_id, student_id, user_id, linked_by) VALUES ($1, $2, $3, $4)', [schoolId, studentId, account.rows[0].id, req.auth.claims.userId]);
      } else {
        const parts = fullName.trim().split(/\s+/); const firstName = parts[0]; const lastName = parts.slice(1).join(' ') || parts[0];
        const guardian = await req.auth.client.query(`INSERT INTO guardians (school_id, user_id, first_name, last_name, email) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [schoolId, account.rows[0].id, firstName, lastName, email]);
        await req.auth.client.query(`INSERT INTO student_guardians (school_id, student_id, guardian_id, relationship, can_view_results, can_view_finance, communication_consent) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [schoolId, studentId, guardian.rows[0].id, relationship, req.body?.canViewResults !== false, Boolean(req.body?.canViewFinance), Boolean(req.body?.communicationConsent)]);
      }
      await createAndSendInvitation(req.auth.client, { schoolId, userId: account.rows[0].id, email, fullName, role: type, createdBy: req.auth.claims.userId }, sendInvitation);
      await audit(req, 'PORTAL_ACCOUNT_CREATED', `${type}_PORTAL`, account.rows[0].id, { studentId });
      return done(req, res, 201, { account: account.rows[0], notice: `Portal account created and password setup email sent to ${email}. The setup link expires in 48 hours.` });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/staff-accounts', needsPermission('users.manage'), csrf, async (req, res) => {
    const allowedRoles = new Set(['PRINCIPAL', 'REGISTRAR', 'FINANCE', 'HR_MANAGER', 'INVENTORY_MANAGER', 'AUDITOR', 'DEPARTMENT_HEAD']);
    const role = text(req.body?.role, 40).toUpperCase();
    const fullName = text(req.body?.fullName);
    const email = text(req.body?.email, 254).toLowerCase();
    const employeeNumber = text(req.body?.employeeNumber, 40).toUpperCase();
    const jobTitle = text(req.body?.jobTitle, 100);
    if (!allowedRoles.has(role) || !fullName || !EMAIL_RE.test(email) || !employeeNumber || !jobTitle) {
      await close(req, false);
      return res.status(400).json({ error: 'Choose an allowed school role and enter the staff member name, email, employee number, and job title.' });
    }
    try {
      const schoolId = req.auth.claims.schoolId;
      const existing = await req.auth.client.query(`SELECT id, email, full_name, role, status, must_reset_password
        FROM user_accounts WHERE school_id = $1 AND lower(email) = $2 LIMIT 1`, [schoolId, email]);
      if (existing.rowCount) {
        const pending = existing.rows[0];
        if (pending.role === role && pending.status === 'ACTIVE' && pending.must_reset_password) {
          await createAndSendInvitation(req.auth.client, { schoolId, userId: pending.id, email: pending.email, fullName: pending.full_name, role, createdBy: req.auth.claims.userId }, sendInvitation);
          await audit(req, 'STAFF_INVITATION_RESENT', 'STAFF_ACCOUNT', pending.id, { role });
          return done(req, res, 200, { account: pending, notice: `A new password setup email was sent to ${email}. Any previous setup link is no longer valid.` });
        }
        await close(req, false);
        return res.status(409).json({ error: 'That email is already linked to a configured school account. Check the email address or contact the system administrator.' });
      }
      const passwordHash = await hashPassword(randomBytes(32).toString('base64url'));
      const account = await req.auth.client.query(`INSERT INTO user_accounts
        (school_id, email, password_hash, full_name, role, status, must_reset_password)
        SELECT $1, $2, $3, $4, r.code, 'ACTIVE', true
        FROM school_roles r WHERE r.school_id = $1 AND r.code = $5 AND r.active
        RETURNING id, email, full_name, role`, [schoolId, email, passwordHash, fullName, role]);
      if (!account.rowCount) { await close(req, false); return res.status(400).json({ error: 'That role is not configured for this school. Run the latest school database migration.' }); }
      const userId = account.rows[0].id;
      const assigned = await req.auth.client.query(`INSERT INTO user_role_assignments (school_id, user_id, role_id, assigned_by)
        SELECT $1, $2, id, $3 FROM school_roles WHERE school_id = $1 AND code = $4 AND active RETURNING id`, [schoolId, userId, req.auth.claims.userId, role]);
      if (!assigned.rowCount) throw new Error('Configured school role could not be assigned.');
      const nameParts = fullName.split(/\s+/);
      await req.auth.client.query(`INSERT INTO staff_records (school_id, user_id, employee_number, first_name, last_name, email, job_title)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`, [schoolId, userId, employeeNumber, nameParts[0], nameParts.slice(1).join(' ') || nameParts[0], email, jobTitle]);
      await createAndSendInvitation(req.auth.client, { schoolId, userId, email, fullName, role, createdBy: req.auth.claims.userId }, sendInvitation);
      await audit(req, 'STAFF_ACCOUNT_CREATED', 'STAFF_ACCOUNT', userId, { role, employeeNumber, jobTitle });
      return done(req, res, 201, { account: account.rows[0], notice: `Staff account created and password setup email sent to ${email}. The setup link expires in 48 hours.` });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/teachers', needsPermission('staff.write'), csrf, async (req, res) => {
    const fullName = text(req.body?.fullName); const email = text(req.body?.email, 254).toLowerCase();
    const employeeNumber = text(req.body?.employeeNumber, 40).toUpperCase();
    if (!fullName || !EMAIL_RE.test(email) || !employeeNumber) { await close(req, false); return res.status(400).json({ error: 'Enter the teacher name, valid email, and employee number.' }); }
    try {
      const schoolId = req.auth.claims.schoolId;
      const existing = await req.auth.client.query(`SELECT id, email, full_name, role, status, must_reset_password FROM user_accounts WHERE school_id = $1 AND lower(email) = $2 LIMIT 1`, [schoolId, email]);
      if (existing.rowCount) {
        const pending = existing.rows[0];
        const profile = pending.role === 'TEACHER' ? await req.auth.client.query('SELECT 1 FROM teacher_profiles WHERE school_id = $1 AND user_id = $2', [schoolId, pending.id]) : { rowCount: 0 };
        if (pending.role === 'TEACHER' && pending.status === 'ACTIVE' && pending.must_reset_password && profile.rowCount) {
          await createAndSendInvitation(req.auth.client, { schoolId, userId: pending.id, email: pending.email, fullName: pending.full_name, role: 'TEACHER', createdBy: req.auth.claims.userId }, sendInvitation);
          await audit(req, 'TEACHER_INVITATION_RESENT', 'TEACHER', pending.id, { employeeNumber });
          return done(req, res, 200, { teacher: { ...pending, employee_number: employeeNumber }, notice: `A new password setup email was sent to ${email}. Any previous setup link is no longer valid.` });
        }
        await close(req, false);
        return res.status(409).json({ error: 'That email is already linked to a school account. Pending teacher accounts can receive a new setup email by entering the same email and employee number.' });
      }
      const passwordHash = await hashPassword(randomBytes(32).toString('base64url'));
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
      await createAndSendInvitation(req.auth.client, { schoolId, userId: teacherId, email, fullName, role: 'TEACHER', createdBy: req.auth.claims.userId }, sendInvitation);
      await audit(req, 'TEACHER_CREATED', 'TEACHER', teacherId, { employeeNumber });
      return done(req, res, 201, { teacher: { ...account.rows[0], employee_number: employeeNumber }, notice: `Teacher account created and password setup email sent to ${email}. The setup link expires in 48 hours.` });
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

  router.post('/teaching-materials', needsAnyPermission(['grades.enter', 'academics.configure']), csrf, async (req, res) => {
    const assignmentId = text(req.body?.assignmentId, 50);
    const title = text(req.body?.title, 160);
    const description = text(req.body?.description, 2000);
    const type = text(req.body?.materialType, 30).toUpperCase();
    const url = text(req.body?.resourceUrl, 1000);
    if (!assignmentId || !title || !['LESSON_PLAN','HANDOUT','PRESENTATION','HOMEWORK','LINK','OTHER'].includes(type) || (url && (!/^https:\/\//i.test(url) || url.length > 1000)) || (type === 'LINK' && !url)) {
      await close(req, false); return res.status(400).json({ error: 'Choose an assigned class, enter a title and material type, and use a secure HTTPS link when linking to a file.' });
    }
    const isTeacher = req.auth.account.roles.includes('TEACHER') && !req.auth.account.permissions.includes('academics.configure');
    try {
      const result = await req.auth.client.query(`INSERT INTO teaching_materials (school_id,teacher_assignment_id,created_by,title,description,material_type,resource_url,status)
        SELECT $1,ta.id,$3,$4,NULLIF($5,''),$6,NULLIF($7,''),'DRAFT'
        FROM teacher_subject_assignments ta
        WHERE ta.school_id=$1 AND ta.id=$2 AND ta.effective_from<=CURRENT_DATE AND (ta.effective_to IS NULL OR ta.effective_to>=CURRENT_DATE)
          AND ($8::boolean=false OR ta.teacher_id=$3)
        RETURNING id,teacher_assignment_id,title,description,material_type,resource_url,status,created_at`,
      [req.auth.claims.schoolId,assignmentId,req.auth.claims.userId,title,description,type,url,isTeacher]);
      if (!result.rowCount) { await close(req, false); return res.status(403).json({ error: 'You can add materials only to a current teaching assignment assigned to your account.' }); }
      await audit(req,'TEACHING_MATERIAL_CREATED','TEACHING_MATERIAL',result.rows[0].id,{assignmentId,type,title});
      return done(req,res,201,{material:result.rows[0]});
    } catch (error) { return fail(req,res,error); }
  });

  router.post('/teaching-materials/:materialId/publish', needsAnyPermission(['grades.enter', 'academics.configure']), csrf, async (req, res) => {
    const isTeacher = req.auth.account.roles.includes('TEACHER') && !req.auth.account.permissions.includes('academics.configure');
    try {
      const result = await req.auth.client.query(`UPDATE teaching_materials m SET status='PUBLISHED',published_at=now()
        FROM teacher_subject_assignments ta
        WHERE m.school_id=$1 AND m.id=$2 AND m.status='DRAFT' AND ta.school_id=m.school_id AND ta.id=m.teacher_assignment_id
          AND ($3::boolean=false OR ta.teacher_id=$4)
        RETURNING m.id,m.title,m.status,m.published_at`,[req.auth.claims.schoolId,req.params.materialId,isTeacher,req.auth.claims.userId]);
      if (!result.rowCount) { await close(req,false); return res.status(409).json({error:'This draft is unavailable or has already been published.'}); }
      await audit(req,'TEACHING_MATERIAL_PUBLISHED','TEACHING_MATERIAL',result.rows[0].id,{title:result.rows[0].title});
      return done(req,res,200,{material:result.rows[0]});
    } catch (error) { return fail(req,res,error); }
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
        const [subjects, timetable, attendance, grades, resources, announcements, invoices, receipts] = await Promise.all([
          req.auth.client.query(`SELECT DISTINCT s.name AS subject_name, gc.weekly_minutes, gc.periods_per_week, gc.required, gc.learning_objectives FROM class_enrollments ce JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id JOIN grade_curriculum_subjects gc ON gc.school_id = c.school_id AND gc.grade_level_id = c.grade_level_id AND gc.academic_year_id = c.academic_year_id JOIN subjects s ON s.school_id = gc.school_id AND s.id = gc.subject_id WHERE ce.school_id = $1 AND ce.student_id = $2 AND ce.status = 'ACTIVE' ORDER BY s.name`, [schoolId, learner.id]),
          req.auth.client.query(`SELECT ts.day_of_week, tp.name AS period_name, tp.starts_at, tp.ends_at, s.name AS subject_name, u.full_name AS teacher_name FROM class_enrollments ce JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id JOIN teacher_subject_assignments a ON a.school_id = c.school_id AND a.class_group_id = c.id AND a.academic_year_id = c.academic_year_id JOIN timetable_slots ts ON ts.school_id = a.school_id AND ts.teacher_assignment_id = a.id JOIN timetable_periods tp ON tp.school_id = ts.school_id AND tp.id = ts.period_id JOIN subjects s ON s.school_id = a.school_id AND s.id = a.subject_id JOIN user_accounts u ON u.school_id = a.school_id AND u.id = a.teacher_id WHERE ce.school_id = $1 AND ce.student_id = $2 AND ce.status = 'ACTIVE' ORDER BY ts.day_of_week, tp.starts_at`, [schoolId, learner.id]),
          req.auth.client.query(`SELECT sa.status, sa.recorded_at, cs.scheduled_at, s.name AS subject_name FROM student_attendance sa JOIN class_sessions cs ON cs.school_id = sa.school_id AND cs.id = sa.class_session_id JOIN teacher_subject_assignments a ON a.school_id = cs.school_id AND a.id = cs.teacher_assignment_id JOIN subjects s ON s.school_id = a.school_id AND s.id = a.subject_id WHERE sa.school_id = $1 AND sa.student_id = $2 ORDER BY cs.scheduled_at DESC LIMIT 30`, [schoolId, learner.id]),
          req.auth.client.query(`SELECT a.title, a.assessment_type, a.max_score, sc.score, sc.feedback, sc.published_at, s.name AS subject_name FROM assessment_scores sc JOIN assessments a ON a.school_id = sc.school_id AND a.id = sc.assessment_id JOIN teacher_subject_assignments ta ON ta.school_id = a.school_id AND ta.id = a.teacher_assignment_id JOIN subjects s ON s.school_id = ta.school_id AND s.id = ta.subject_id WHERE sc.school_id = $1 AND sc.student_id = $2 AND a.status = 'PUBLISHED' AND sc.published_at IS NOT NULL ORDER BY sc.published_at DESC`, [schoolId, learner.id]),
          req.auth.client.query(`SELECT * FROM (
            SELECT r.resource_type,r.title,r.author,r.publisher,r.isbn,r.edition,r.description,r.resource_url,r.required,s.name AS subject_name
            FROM class_enrollments ce JOIN class_groups c ON c.school_id=ce.school_id AND c.id=ce.class_group_id
            JOIN grade_curriculum_subjects gc ON gc.school_id=c.school_id AND gc.grade_level_id=c.grade_level_id AND gc.academic_year_id=c.academic_year_id
            JOIN curriculum_resources r ON r.school_id=gc.school_id AND r.curriculum_subject_id=gc.id AND r.visible_to_students
            JOIN subjects s ON s.school_id=gc.school_id AND s.id=gc.subject_id
            WHERE ce.school_id=$1 AND ce.student_id=$2 AND ce.status='ACTIVE'
            UNION ALL
            SELECT m.material_type AS resource_type,m.title,NULL::text,NULL::text,NULL::text,NULL::text,m.description,m.resource_url,false,s.name
            FROM class_enrollments ce JOIN class_groups c ON c.school_id=ce.school_id AND c.id=ce.class_group_id
            JOIN teacher_subject_assignments ta ON ta.school_id=c.school_id AND ta.class_group_id=c.id AND ta.academic_year_id=c.academic_year_id
            JOIN teaching_materials m ON m.school_id=ta.school_id AND m.teacher_assignment_id=ta.id AND m.status='PUBLISHED'
            JOIN subjects s ON s.school_id=ta.school_id AND s.id=ta.subject_id
            WHERE ce.school_id=$1 AND ce.student_id=$2 AND ce.status='ACTIVE'
          ) published_resources ORDER BY subject_name,title`, [schoolId, learner.id]),
          req.auth.client.query(`SELECT a.id,a.title,a.body,a.published_at,a.audience,c.name AS class_name
            FROM announcements a
            LEFT JOIN student_portal_links l ON l.school_id=a.school_id AND l.user_id=$2
            LEFT JOIN class_enrollments ce ON ce.school_id=l.school_id AND ce.student_id=l.student_id AND ce.status='ACTIVE'
            LEFT JOIN class_groups c ON c.school_id=ce.school_id AND c.id=ce.class_group_id
            WHERE a.school_id=$1 AND a.status='PUBLISHED' AND (
              a.audience='LEARNERS' OR (a.audience='CLASS' AND a.class_group_id=ce.class_group_id)
              OR (a.audience='CAMPUS' AND (a.campus_id IS NULL OR a.campus_id=(SELECT campus_id FROM students WHERE school_id=$1 AND id=$3)))
            ) ORDER BY a.published_at DESC LIMIT 50`, [schoolId, userId, learner.id]),
          req.auth.client.query(`SELECT fi.id,fi.invoice_number,fi.currency,fi.status,fi.due_on,
              COALESCE(lines.total,0)::text AS total,COALESCE(payments.paid,0)::text AS paid,
              GREATEST(COALESCE(lines.total,0)-COALESCE(payments.paid,0),0)::text AS balance
            FROM fee_invoices fi
            LEFT JOIN LATERAL (SELECT SUM(line_amount) AS total FROM fee_invoice_lines l WHERE l.school_id=fi.school_id AND l.invoice_id=fi.id) lines ON true
            LEFT JOIN LATERAL (SELECT SUM(pa.amount) AS paid FROM payment_allocations pa JOIN payments p ON p.school_id=pa.school_id AND p.id=pa.payment_id AND p.status IN ('SUCCEEDED','PARTIALLY_REVERSED') WHERE pa.school_id=fi.school_id AND pa.invoice_id=fi.id) payments ON true
            WHERE fi.school_id=$1 AND fi.student_id=$2 AND fi.status<>'VOID' ORDER BY fi.due_on NULLS LAST,fi.created_at DESC LIMIT 100`, [schoolId, learner.id]),
          req.auth.client.query(`SELECT DISTINCT p.receipt_number,p.amount::text,p.currency,p.channel,p.received_at,p.status
            FROM payments p JOIN payment_allocations pa ON pa.school_id=p.school_id AND pa.payment_id=p.id
            WHERE p.school_id=$1 AND p.student_id=$2 AND p.status IN ('SUCCEEDED','PARTIALLY_REVERSED')
            ORDER BY p.received_at DESC LIMIT 50`, [schoolId, learner.id]),
        ]);
        await close(req, true); return res.json({ role: 'STUDENT', linked: true, student: learner, subjects: subjects.rows, timetable: timetable.rows, attendance: attendance.rows, grades: grades.rows, resources: resources.rows, announcements: announcements.rows, invoices: invoices.rows, receipts: receipts.rows, financeVisible: true });
      }
      if (req.auth.account.roles.includes('PARENT') && req.auth.account.permissions.includes('guardian.portal.read')) {
        const children = await req.auth.client.query(`SELECT s.id, s.student_number, s.first_name, s.last_name, s.campus_id, ce.class_group_id, sg.relationship, sg.can_view_results, sg.can_view_finance, c.name AS class_name, c.grade_level FROM guardians g JOIN student_guardians sg ON sg.school_id = g.school_id AND sg.guardian_id = g.id JOIN students s ON s.school_id = sg.school_id AND s.id = sg.student_id LEFT JOIN class_enrollments ce ON ce.school_id = s.school_id AND ce.student_id = s.id AND ce.status = 'ACTIVE' LEFT JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id WHERE g.school_id = $1 AND g.user_id = $2 AND g.active ORDER BY s.last_name, s.first_name`, [schoolId, userId]);
        const results = [];
        for (const child of children.rows) {
          const [subjects, timetable, attendance, grades, resources, invoices, receipts, announcements] = await Promise.all([
            req.auth.client.query(`SELECT DISTINCT s.name AS subject_name, gc.weekly_minutes, gc.periods_per_week FROM class_enrollments ce JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id JOIN grade_curriculum_subjects gc ON gc.school_id = c.school_id AND gc.grade_level_id = c.grade_level_id AND gc.academic_year_id = c.academic_year_id JOIN subjects s ON s.school_id = gc.school_id AND s.id = gc.subject_id WHERE ce.school_id = $1 AND ce.student_id = $2 AND ce.status = 'ACTIVE' ORDER BY s.name`, [schoolId, child.id]),
            req.auth.client.query(`SELECT ts.day_of_week, tp.name AS period_name, tp.starts_at, tp.ends_at, s.name AS subject_name, u.full_name AS teacher_name FROM class_enrollments ce JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id JOIN teacher_subject_assignments a ON a.school_id = c.school_id AND a.class_group_id = c.id AND a.academic_year_id = c.academic_year_id JOIN timetable_slots ts ON ts.school_id = a.school_id AND ts.teacher_assignment_id = a.id JOIN timetable_periods tp ON tp.school_id = ts.school_id AND tp.id = ts.period_id JOIN subjects s ON s.school_id = a.school_id AND s.id = a.subject_id JOIN user_accounts u ON u.school_id = a.school_id AND u.id = a.teacher_id WHERE ce.school_id = $1 AND ce.student_id = $2 AND ce.status = 'ACTIVE' ORDER BY ts.day_of_week, tp.starts_at`, [schoolId, child.id]),
            req.auth.client.query(`SELECT sa.status, cs.scheduled_at, s.name AS subject_name FROM student_attendance sa JOIN class_sessions cs ON cs.school_id = sa.school_id AND cs.id = sa.class_session_id JOIN teacher_subject_assignments a ON a.school_id = cs.school_id AND a.id = cs.teacher_assignment_id JOIN subjects s ON s.school_id = a.school_id AND s.id = a.subject_id WHERE sa.school_id = $1 AND sa.student_id = $2 ORDER BY cs.scheduled_at DESC LIMIT 30`, [schoolId, child.id]),
            child.can_view_results ? req.auth.client.query(`SELECT a.title, a.assessment_type, a.max_score, sc.score, sc.feedback, sc.published_at, s.name AS subject_name FROM assessment_scores sc JOIN assessments a ON a.school_id = sc.school_id AND a.id = sc.assessment_id JOIN teacher_subject_assignments ta ON ta.school_id = a.school_id AND ta.id = a.teacher_assignment_id JOIN subjects s ON s.school_id = ta.school_id AND s.id = ta.subject_id WHERE sc.school_id = $1 AND sc.student_id = $2 AND a.status = 'PUBLISHED' AND sc.published_at IS NOT NULL ORDER BY sc.published_at DESC`, [schoolId, child.id]) : Promise.resolve({ rows: [] }),
            req.auth.client.query(`SELECT * FROM (
              SELECT r.resource_type,r.title,r.author,r.publisher,r.isbn,r.edition,r.description,r.resource_url,r.required,s.name AS subject_name
              FROM class_enrollments ce JOIN class_groups c ON c.school_id=ce.school_id AND c.id=ce.class_group_id
              JOIN grade_curriculum_subjects gc ON gc.school_id=c.school_id AND gc.grade_level_id=c.grade_level_id AND gc.academic_year_id=c.academic_year_id
              JOIN curriculum_resources r ON r.school_id=gc.school_id AND r.curriculum_subject_id=gc.id AND r.visible_to_guardians
              JOIN subjects s ON s.school_id=gc.school_id AND s.id=gc.subject_id
              WHERE ce.school_id=$1 AND ce.student_id=$2 AND ce.status='ACTIVE'
              UNION ALL
              SELECT m.material_type AS resource_type,m.title,NULL::text,NULL::text,NULL::text,NULL::text,m.description,m.resource_url,false,s.name
              FROM class_enrollments ce JOIN class_groups c ON c.school_id=ce.school_id AND c.id=ce.class_group_id
              JOIN teacher_subject_assignments ta ON ta.school_id=c.school_id AND ta.class_group_id=c.id AND ta.academic_year_id=c.academic_year_id
              JOIN teaching_materials m ON m.school_id=ta.school_id AND m.teacher_assignment_id=ta.id AND m.status='PUBLISHED'
              JOIN subjects s ON s.school_id=ta.school_id AND s.id=ta.subject_id
              WHERE ce.school_id=$1 AND ce.student_id=$2 AND ce.status='ACTIVE'
            ) published_resources ORDER BY subject_name,title`, [schoolId, child.id]),
            child.can_view_finance ? req.auth.client.query(`SELECT fi.id,fi.invoice_number,fi.currency,fi.status,fi.due_on,
                COALESCE(lines.total,0)::text AS total,COALESCE(payments.paid,0)::text AS paid,
                GREATEST(COALESCE(lines.total,0)-COALESCE(payments.paid,0),0)::text AS balance
              FROM fee_invoices fi
              LEFT JOIN LATERAL (SELECT SUM(line_amount) AS total FROM fee_invoice_lines l WHERE l.school_id=fi.school_id AND l.invoice_id=fi.id) lines ON true
              LEFT JOIN LATERAL (SELECT SUM(pa.amount) AS paid FROM payment_allocations pa JOIN payments p ON p.school_id=pa.school_id AND p.id=pa.payment_id AND p.status IN ('SUCCEEDED','PARTIALLY_REVERSED') WHERE pa.school_id=fi.school_id AND pa.invoice_id=fi.id) payments ON true
              WHERE fi.school_id=$1 AND fi.student_id=$2 AND fi.status<>'VOID' ORDER BY fi.due_on NULLS LAST,fi.created_at DESC LIMIT 100`, [schoolId, child.id]) : Promise.resolve({ rows: [] }),
            child.can_view_finance ? req.auth.client.query(`SELECT DISTINCT p.receipt_number,p.amount::text,p.currency,p.channel,p.received_at,p.status
              FROM payments p JOIN payment_allocations pa ON pa.school_id=p.school_id AND pa.payment_id=p.id
              WHERE p.school_id=$1 AND p.student_id=$2 AND p.status IN ('SUCCEEDED','PARTIALLY_REVERSED')
              ORDER BY p.received_at DESC LIMIT 50`, [schoolId, child.id]) : Promise.resolve({ rows: [] }),
            req.auth.client.query(`SELECT a.id,a.title,a.body,a.published_at,a.audience,c.name AS class_name
              FROM announcements a
              LEFT JOIN class_groups c ON c.school_id=a.school_id AND c.id=a.class_group_id
              WHERE a.school_id=$1 AND a.status='PUBLISHED' AND (
                a.audience='ALL_GUARDIANS'
                OR (a.audience='CLASS' AND a.class_group_id=$2)
                OR (a.audience='CAMPUS' AND (a.campus_id IS NULL OR a.campus_id=$3))
              ) ORDER BY a.published_at DESC LIMIT 50`, [schoolId, child.class_group_id, child.campus_id]),
          ]);
          results.push({ ...child, subjects: subjects.rows, timetable: timetable.rows, attendance: attendance.rows, grades: grades.rows, resources: resources.rows,
            invoices: invoices.rows, receipts: receipts.rows, announcements: announcements.rows, financeVisible: Boolean(child.can_view_finance) });
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
