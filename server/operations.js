import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { hashPassword } from './authCrypto.js';
import { createInvitationSecret, InvitationDeliveryError, sendAccountInvitation } from './invitations.js';
import { createMomoClient, MomoProviderError } from './mtnMomo.js';
import { sendWebPush } from './webPush.js';
import { sendSchoolSms, smsProviderName, smsReadiness } from './sms.js';
import { buildYearEndReportCard, DEFAULT_WEIGHTS, REQUIRED_CATEGORIES, WEIGHTED_CATEGORIES, validateYearEndWeights } from './yearEndReportCards.js';

const NAME_LIMIT = 120;
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STAFF_ASSIGNABLE_ROLES = ['CAMPUS_ADMIN', 'PRINCIPAL', 'REGISTRAR', 'TEACHER', 'FINANCE', 'HR_MANAGER', 'INVENTORY_MANAGER', 'AUDITOR'];
const ADMISSION_STATUS_TRANSITIONS = {
  RECEIVED: ['UNDER_REVIEW', 'WITHDRAWN'],
  UNDER_REVIEW: ['INTERVIEW_SCHEDULED', 'OFFERED', 'ACCEPTED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW_SCHEDULED: ['UNDER_REVIEW', 'OFFERED', 'ACCEPTED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN'],
  OFFERED: ['ACCEPTED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN'],
  ACCEPTED: ['WITHDRAWN'],
  WAITLISTED: ['OFFERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  REJECTED: ['UNDER_REVIEW'],
  WITHDRAWN: [],
  ENROLLED: [],
};

function text(value, limit = NAME_LIMIT) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}
function validDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
function yearEndWeightsFromRows(rows) {
  const stored = {};
  for (const row of rows) if (REQUIRED_CATEGORIES.includes(row.assessment_type)) stored[row.assessment_type] = Number(row.weight_percent);
  const configured = WEIGHTED_CATEGORIES.every(category => Number.isFinite(stored[category]));
  const weights = validateYearEndWeights({ ...DEFAULT_WEIGHTS, ...stored });
  return { weights: weights || DEFAULT_WEIGHTS, configured: configured && Boolean(weights) };
}
function sameSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function studentDocumentEncryptionKey() {
  const configured = process.env.STUDENT_DOCUMENT_ENCRYPTION_KEY || '';
  if (!/^[A-Za-z0-9+/]{43}=$/.test(configured)) return null;
  try {
    const key = Buffer.from(configured, 'base64');
    return key.length === 32 && key.toString('base64') === configured ? key : null;
  } catch { return null; }
}
function encryptStudentDocument(data, key, associatedData) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(associatedData));
  const content = Buffer.concat([cipher.update(data), cipher.final()]);
  return { content, nonce, authTag: cipher.getAuthTag() };
}
function decryptStudentDocument(document, key, associatedData) {
  const decipher = createDecipheriv('aes-256-gcm', key, document.content_nonce);
  decipher.setAAD(Buffer.from(associatedData));
  decipher.setAuthTag(document.content_auth_tag);
  return Buffer.concat([decipher.update(document.file_content), decipher.final()]);
}
async function hasStudentDocumentStorageSchema(client) {
  const result = await client.query(`SELECT count(*)::int AS column_count FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='student_documents' AND column_name=ANY($1::text[])`, [['file_content','content_nonce','content_auth_tag']]);
  return Number(result.rows[0]?.column_count || 0) === 3;
}
// Any portrait change invalidates previously printed / saved student QR credentials.
// Called inside the same tenant-scoped transaction as the document change.
async function revokeDigitalIdForPortraitChange(req, schoolId, studentId, reason) {
  const changed = await req.auth.client.query(`UPDATE student_id_credentials
    SET revoked_at=now(), revoked_by=$3
    WHERE school_id=$1 AND student_id=$2 AND revoked_at IS NULL
    RETURNING id`, [schoolId, studentId, req.auth.claims.userId]);
  if (changed.rowCount) {
    await audit(req,'STUDENT_DIGITAL_ID_REVOKED','STUDENT',studentId,{
      reason, revokedCredentialCount:changed.rowCount,
    });
  }
  return changed.rowCount;
}
async function hasAdmissionDocumentStorageSchema(client) {
  const result = await client.query(`SELECT count(*)::int AS column_count,
      (SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conrelid=to_regclass('admission_documents') AND conname='admission_documents_media_type_check') AS media_type_constraint
    FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='admission_documents'
      AND column_name=ANY($1::text[])`, [['file_content','content_nonce','content_auth_tag','application_id']]);
  const constraint=String(result.rows[0]?.media_type_constraint||'').toLowerCase();
  return Number(result.rows[0]?.column_count || 0) === 4 && constraint.includes('image/jpeg') && constraint.includes('image/png');
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
  // Log only non-sensitive diagnostics; never log SQL parameters, request bodies, or personal records.
  console.error('[school-operations-error]', {
    method: req.method,
    route: req.route?.path || req.path,
    code: typeof error?.code === 'string' ? error.code : null,
    // PostgreSQL 42703 names only an undefined SQL column; do not log request data.
    missingColumn: error?.code === '42703' ? String(error.message || '').slice(0, 180) : null,
    sqlPosition: error?.code === '42703' ? String(error.position || '') : null,
    category: error?.name || 'Error',
    table: error?.table || null,
    column: error?.column || null,
    constraint: error?.constraint || null,
  });
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

  async function pushToUser(schoolId, userId, payload) {
    if (!pool || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_school_id', $1, true)", [schoolId]);
      const subscriptions = await client.query('SELECT id, endpoint, p256dh, auth_secret FROM push_subscriptions WHERE school_id=$1 AND user_id=$2', [schoolId, userId]);
      await client.query('COMMIT');
      for (const subscription of subscriptions.rows) {
        try {
          const result = await sendWebPush(subscription, payload);
          if (result.expired) {
            await client.query('BEGIN');
            await client.query("SELECT set_config('app.current_school_id', $1, true)", [schoolId]);
            await client.query('DELETE FROM push_subscriptions WHERE school_id=$1 AND id=$2', [schoolId, subscription.id]);
            await client.query('COMMIT');
          }
          else if (!result.sent) console.warn('Web push delivery skipped:', result.reason);
        } catch (error) { console.warn('Web push delivery failed:', error instanceof Error ? error.message : 'unknown error'); }
      }
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.warn('Web push lookup failed:', error instanceof Error ? error.message : 'unknown error');
    } finally { client.release(); }
  }

  async function queueAnnouncementSms(client, schoolId, announcementId) {
    return client.query(`INSERT INTO notification_deliveries(school_id,guardian_id,announcement_id,channel,recipient_ref,status)
      SELECT $1,g.id,a.id,'SMS',g.phone,'QUEUED'
      FROM announcements a
      JOIN student_guardians sg ON sg.school_id=a.school_id AND sg.communication_consent=true
      JOIN guardians g ON g.school_id=sg.school_id AND g.id=sg.guardian_id AND g.active AND NULLIF(trim(g.phone),'') IS NOT NULL
      LEFT JOIN class_enrollments ce ON ce.school_id=sg.school_id AND ce.student_id=sg.student_id AND ce.status='ACTIVE'
      JOIN students st ON st.school_id=sg.school_id AND st.id=sg.student_id
      WHERE a.school_id=$1 AND a.id=$2 AND a.audience IN ('ALL_GUARDIANS','CAMPUS','CLASS')
        AND (a.audience='ALL_GUARDIANS' OR (a.audience='CLASS' AND ce.class_group_id=a.class_group_id)
          OR (a.audience='CAMPUS' AND (a.campus_id IS NULL OR st.campus_id=a.campus_id)))
        AND NOT EXISTS (SELECT 1 FROM notification_deliveries nd WHERE nd.school_id=$1 AND nd.announcement_id=a.id AND nd.guardian_id=g.id AND nd.channel='SMS')
      GROUP BY g.id,g.phone,a.id RETURNING id`,[schoolId,announcementId]);
  }

  async function queueAnnouncementAlerts(client, schoolId, announcementId) {
    const recipients = await client.query(`WITH a AS (SELECT * FROM announcements WHERE school_id=$1 AND id=$2 AND status='PUBLISHED'),
      linked AS (
        SELECT DISTINCT spl.user_id, a.title, a.body FROM a
        JOIN student_portal_links spl ON spl.school_id=a.school_id
        JOIN students st ON st.school_id=spl.school_id AND st.id=spl.student_id
        LEFT JOIN class_enrollments ce ON ce.school_id=st.school_id AND ce.student_id=st.id AND ce.status='ACTIVE'
        WHERE (a.audience='LEARNERS' OR (a.audience='CLASS' AND ce.class_group_id=a.class_group_id)
          OR (a.audience='CAMPUS' AND (a.campus_id IS NULL OR st.campus_id=a.campus_id)))
        UNION
        SELECT DISTINCT g.user_id,a.title,a.body FROM a JOIN student_guardians sg ON sg.school_id=a.school_id
        JOIN guardians g ON g.school_id=sg.school_id AND g.id=sg.guardian_id AND g.active AND g.user_id IS NOT NULL
        JOIN students st ON st.school_id=sg.school_id AND st.id=sg.student_id
        LEFT JOIN class_enrollments ce ON ce.school_id=st.school_id AND ce.student_id=st.id AND ce.status='ACTIVE'
        WHERE (a.audience='ALL_GUARDIANS' OR (a.audience='CLASS' AND ce.class_group_id=a.class_group_id)
          OR (a.audience='CAMPUS' AND (a.campus_id IS NULL OR st.campus_id=a.campus_id)))
      )
      INSERT INTO portal_notifications(school_id,user_id,kind,title,body,target_url,announcement_id)
      SELECT $1,user_id,'ANNOUNCEMENT',title,body,'/portal',$2 FROM linked
      ON CONFLICT(school_id,user_id,announcement_id) WHERE announcement_id IS NOT NULL DO NOTHING
      RETURNING user_id,title,body`,[schoolId,announcementId]);
    return recipients.rows;
  }

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
      const [result, roles] = await Promise.all([req.auth.client.query(`
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
      `, [schoolId]), req.auth.client.query(`SELECT code, name FROM school_roles
        WHERE school_id=$1 AND active AND code=ANY($2::text[]) ORDER BY name`, [schoolId, STAFF_ASSIGNABLE_ROLES])]);
      return done(req, res, 200, { accounts: result.rows, availableRoles: roles.rows, currentUserId: req.auth.claims.userId });
    } catch (error) { return fail(req, res, error); }
  });

  // People & accounts combines a staff directory with account invitation state.
  // Keep this separate from the HR endpoint so school administrators who manage
  // accounts can see staff identity records without seeing HR time/leave data.
  router.get('/people', needsAnyPermission(['staff.read', 'staff.write', 'users.manage']), async (req, res) => {
    try {
      const schoolId = req.auth.claims.schoolId;
      const result = await req.auth.client.query(`
        SELECT s.id, s.employee_number, s.first_name, s.middle_name, s.last_name,
               s.email, s.phone, s.job_title, s.department, s.hired_on,
               s.employment_status, u.id AS user_id, u.role, u.status AS account_status,
               u.last_login_at,
               EXISTS (
                 SELECT 1 FROM account_invitations i
                 WHERE i.school_id=u.school_id AND i.user_id=u.id
                   AND i.redeemed_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
               ) AS invitation_pending
        FROM staff_records s
        LEFT JOIN user_accounts u ON u.school_id=s.school_id AND u.id=s.user_id
        WHERE s.school_id=$1
        ORDER BY CASE WHEN s.employment_status='ACTIVE' THEN 0 ELSE 1 END,
                 lower(s.last_name), lower(s.first_name), s.employee_number
      `, [schoolId]);
      return done(req, res, 200, { staffDirectory: result.rows, canManage: req.auth.account.permissions.includes('staff.write') });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/people/:staffId/profile', needsPermission('staff.write'), csrf, async (req, res) => {
    const staffId = text(req.params.staffId, 50);
    const phone = text(req.body?.phone, 40);
    const jobTitle = text(req.body?.jobTitle, 100);
    const department = text(req.body?.department, 100);
    const hiredOn = req.body?.hiredOn === '' ? null : req.body?.hiredOn;
    if (!staffId || (hiredOn !== null && !validDate(hiredOn))) {
      await close(req, false);
      return res.status(400).json({ error: 'Enter a valid staff record and hire date.' });
    }
    try {
      const updated = await req.auth.client.query(`
        UPDATE staff_records SET phone=NULLIF($3,''), job_title=NULLIF($4,''),
          department=NULLIF($5,''), hired_on=$6, updated_at=now()
        WHERE school_id=$1 AND id=$2
        RETURNING id, employee_number, first_name, middle_name, last_name, email,
                  phone, job_title, department, hired_on, employment_status
      `, [req.auth.claims.schoolId, staffId, phone, jobTitle, department, hiredOn]);
      if (!updated.rowCount) { await close(req, false); return res.status(404).json({ error: 'That staff record was not found in this school.' }); }
      await audit(req, 'STAFF_PROFILE_UPDATED', 'STAFF_RECORD', staffId, { phone: Boolean(phone), jobTitle, department, hiredOn });
      return done(req, res, 200, { staff: updated.rows[0] });
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
      await req.auth.client.query(`SELECT id FROM schools WHERE id=$1 FOR UPDATE`, [schoolId]);
      const target = await req.auth.client.query(`SELECT id, role, status FROM user_accounts WHERE school_id=$1 AND id=$2 FOR UPDATE`, [schoolId, accountId]);
      if (!target.rowCount) { await close(req, false); return res.status(404).json({ error: 'The account was not found in this school.' }); }
      if (status === 'SUSPENDED' && target.rows[0].status === 'ACTIVE' && target.rows[0].role === 'SCHOOL_ADMIN') {
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

  router.post('/accounts/:accountId/role', needsPermission('users.manage'), csrf, async (req, res) => {
    const accountId = text(req.params.accountId, 50);
    const role = text(req.body?.role, 40).toUpperCase();
    if (!accountId || !STAFF_ASSIGNABLE_ROLES.includes(role)) {
      await close(req, false);
      return res.status(400).json({ error: 'Choose one of the school’s staff roles. Learner and guardian roles are managed through their linked portal accounts.' });
    }
    if (accountId === req.auth.claims.userId) {
      await close(req, false);
      return res.status(400).json({ error: 'You cannot change your own role. Ask another school administrator to make this change.' });
    }
    try {
      const schoolId = req.auth.claims.schoolId;
      await req.auth.client.query(`SELECT id FROM schools WHERE id=$1 FOR UPDATE`, [schoolId]);
      const target = await req.auth.client.query(`SELECT id, role, status, campus_id FROM user_accounts WHERE school_id=$1 AND id=$2 FOR UPDATE`, [schoolId, accountId]);
      if (!target.rowCount) { await close(req, false); return res.status(404).json({ error: 'The account was not found in this school.' }); }
      if (['PARENT', 'STUDENT'].includes(target.rows[0].role)) {
        await close(req, false);
        return res.status(409).json({ error: 'Learner and guardian roles are managed through their linked portal account workflow.' });
      }
      if (target.rows[0].role === role) { await close(req, false); return res.status(409).json({ error: 'This account already has that role.' }); }
      if (target.rows[0].role === 'SCHOOL_ADMIN' && target.rows[0].status === 'ACTIVE') {
        const admins = await req.auth.client.query(`SELECT count(*)::int AS active_count FROM user_accounts WHERE school_id=$1 AND role='SCHOOL_ADMIN' AND status='ACTIVE'`, [schoolId]);
        if (Number(admins.rows[0]?.active_count || 0) <= 1) {
          await close(req, false);
          return res.status(409).json({ error: 'The school must keep at least one active administrator.' });
        }
      }
      const selectedRole = await req.auth.client.query(`SELECT id, code FROM school_roles WHERE school_id=$1 AND code=$2 AND active FOR SHARE`, [schoolId, role]);
      if (!selectedRole.rowCount) { await close(req, false); return res.status(400).json({ error: 'That staff role is not active for this school.' }); }
      if (role === 'TEACHER') {
        const teacherProfile = await req.auth.client.query(`SELECT 1 FROM teacher_profiles WHERE school_id=$1 AND user_id=$2 AND active`, [schoolId, accountId]);
        if (!teacherProfile.rowCount) {
          await close(req, false);
          return res.status(409).json({ error: 'Create or link this person through People & accounts → Teacher records so the required teacher profile is created before assigning teaching access.' });
        }
      }
      await req.auth.client.query(`UPDATE user_role_assignments
        SET ends_at=GREATEST(now(), starts_at + interval '1 microsecond')
        WHERE school_id=$1 AND user_id=$2 AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())`, [schoolId, accountId]);
      const cancelledFutureAssignments = await req.auth.client.query(`DELETE FROM user_role_assignments
        WHERE school_id=$1 AND user_id=$2 AND starts_at > now()`, [schoolId, accountId]);
      await req.auth.client.query(`INSERT INTO user_role_assignments (school_id, user_id, role_id, campus_id, assigned_by)
        VALUES ($1,$2,$3,$4,$5)`, [schoolId, accountId, selectedRole.rows[0].id, target.rows[0].campus_id, req.auth.claims.userId]);
      const updated = await req.auth.client.query(`UPDATE user_accounts SET role=$3, updated_at=now()
        WHERE school_id=$1 AND id=$2 RETURNING id, email, full_name, role, status`, [schoolId, accountId, role]);
      await req.auth.client.query(`DELETE FROM auth_sessions WHERE school_id=$1 AND user_id=$2`, [schoolId, accountId]);
      await audit(req, 'ACCOUNT_ROLE_CHANGED', 'USER_ACCOUNT', accountId, { previousRole: target.rows[0].role, role, cancelledFutureAssignments: cancelledFutureAssignments.rowCount || 0 });
      return done(req, res, 200, { account: updated.rows[0], notice: 'Role updated. The user’s existing sessions ended; they must sign in again to receive the new access.' });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/school-profile/emis-code', needsPermission('school.configure'), csrf, async (req, res) => {
    const rawCode = req.body?.moeSchoolEmisCode;
    const code = typeof rawCode === 'string' ? rawCode.trim() : '';
    if ((rawCode != null && typeof rawCode !== 'string') || code.length > 64 || /[\u0000-\u001f\u007f]/u.test(code)) {
      await close(req, false);
      return res.status(400).json({ error: 'Enter a Ministry school code of up to 64 characters, or leave it blank.' });
    }
    try {
      const schoolId = req.auth.claims.schoolId;
      const result = await req.auth.client.query(`UPDATE schools SET moe_school_emis_code=NULLIF($2,''), updated_at=now()
        WHERE id=$1 RETURNING id, moe_school_emis_code`, [schoolId, code]);
      if (!result.rowCount) { await close(req, false); return res.status(404).json({ error: 'The school record was not found.' }); }
      await audit(req, 'SCHOOL_EMIS_CODE_UPDATED', 'SCHOOL', schoolId, { codePresent: Boolean(code) });
      return done(req, res, 200, { school: result.rows[0], notice: code ? 'School EMIS code saved.' : 'School EMIS code cleared.' });
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
          CASE WHEN $4::boolean THEN (st.date_of_birth IS NOT NULL) ELSE NULL END AS has_birth_date,
          CASE WHEN $4::boolean THEN (st.sex IS NOT NULL AND btrim(st.sex) <> '') ELSE NULL END AS has_recorded_sex,
          CASE WHEN $4::boolean THEN (st.external_learner_id IS NOT NULL AND btrim(st.external_learner_id) <> '') ELSE NULL END AS has_ministry_learner_id,
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
        ORDER BY st.last_name, st.first_name`, [schoolId, isTeacher, req.auth.claims.userId, req.auth.account.permissions.includes('students.sensitive.read')]);
      const classes = req.auth.account.permissions.includes('students.write')
        ? await req.auth.client.query(`SELECT c.id, c.name, c.grade_level, y.name AS academic_year_name
            FROM class_groups c JOIN academic_years y ON y.school_id = c.school_id AND y.id = c.academic_year_id
            WHERE c.school_id = $1 ORDER BY y.starts_on DESC, c.grade_level, c.name`, [schoolId])
        : { rows: [] };
      await close(req, true);
      return res.json({ students: students.rows, classes: classes.rows, canEnroll: req.auth.account.permissions.includes('students.write'), canReadDocuments: req.auth.account.permissions.includes('students.sensitive.read') });
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
          sg.relationship, sg.is_primary, sg.emergency_contact, sg.authorized_pickup, sg.can_view_results, sg.can_view_finance, sg.communication_consent FROM student_guardians sg JOIN guardians g
          ON g.school_id = sg.school_id AND g.id = sg.guardian_id
          WHERE sg.school_id = $1 AND sg.student_id = $2 ORDER BY sg.is_primary DESC, g.last_name, g.first_name`, [schoolId, req.params.studentId]);
      const historyResult = await req.auth.client.query(`SELECT h.id, h.status, h.effective_on, h.ended_on, h.reason,
          c.name AS class_name, y.name AS academic_year_name
        FROM student_enrollment_history h
        LEFT JOIN class_groups c ON c.school_id=h.school_id AND c.id=h.class_group_id
        LEFT JOIN academic_years y ON y.school_id=h.school_id AND y.id=h.academic_year_id
        WHERE h.school_id=$1 AND h.student_id=$2
        ORDER BY h.effective_on DESC,h.created_at DESC,h.id DESC
        LIMIT 100`, [schoolId,req.params.studentId]);
      const student = studentResult.rows[0];
      let gradeDelivery = null;
      if (req.auth.account.permissions.includes('grades.publish') || req.auth.account.permissions.includes('grades.moderate')) {
        const [portalLink, deliveryRows] = await Promise.all([
          req.auth.client.query(`SELECT EXISTS (SELECT 1 FROM student_portal_links WHERE school_id=$1 AND student_id=$2) AS linked`, [schoolId, req.params.studentId]),
          req.auth.client.query(`SELECT a.id,a.title,a.assessment_type,a.status,ta.class_group_id,c.name AS class_name,s.name AS subject_name,
              sc.score::text AS score,sc.published_at,(sc.id IS NOT NULL) AS score_saved,(ce.student_id IS NOT NULL) AS active_enrollment
            FROM assessments a
            JOIN teacher_subject_assignments ta ON ta.school_id=a.school_id AND ta.id=a.teacher_assignment_id
            JOIN class_groups c ON c.school_id=ta.school_id AND c.id=ta.class_group_id
            JOIN subjects s ON s.school_id=ta.school_id AND s.id=ta.subject_id
            LEFT JOIN assessment_scores sc ON sc.school_id=a.school_id AND sc.assessment_id=a.id AND sc.student_id=$2
            LEFT JOIN class_enrollments ce ON ce.school_id=ta.school_id AND ce.class_group_id=ta.class_group_id AND ce.student_id=$2 AND ce.status='ACTIVE'
            WHERE a.school_id=$1 AND (ce.student_id IS NOT NULL OR sc.id IS NOT NULL)
            ORDER BY c.name,s.name,a.created_at DESC LIMIT 100`, [schoolId, req.params.studentId]),
        ]);
        gradeDelivery = { portalLinked: Boolean(portalLink.rows[0]?.linked), assessments: deliveryRows.rows };
      }
      const canReadSensitive = req.auth.account.permissions.includes('students.sensitive.read');
      // The same student_guardians rows power both the family portal and staff records.
      // Associate the most recent school-approved guardian portrait, never a pending photo.
      if(canReadSensitive && guardianResult.rowCount) {
        const photoRecords=await req.auth.client.query(`SELECT DISTINCT ON (guardian_id)
          id,guardian_id,reviewed_at FROM portal_photo_submissions
          WHERE school_id=$1 AND student_id=$2 AND subject_type='GUARDIAN' AND status='APPROVED'
          ORDER BY guardian_id,reviewed_at DESC,id DESC`,[schoolId,req.params.studentId]);
        const photos=new Map(photoRecords.rows.map(photo=>[photo.guardian_id,photo]));
        for(const guardian of guardianResult.rows) {
          const photo=photos.get(guardian.id);
          guardian.approved_photo_id=photo?.id||null;
          guardian.approved_photo_at=photo?.reviewed_at||null;
        }
      }
      let documents = []; let documentCategories = []; let documentStorageReady = false;
      if (canReadSensitive) {
        documentStorageReady = await hasStudentDocumentStorageSchema(req.auth.client) && Boolean(studentDocumentEncryptionKey());
        documentCategories = (await req.auth.client.query(`SELECT id,code,name,required_for_admission FROM document_categories
          WHERE school_id=$1 AND active ORDER BY name`, [schoolId])).rows;
        if (documentStorageReady) documents = (await req.auth.client.query(`SELECT d.id,d.title,d.original_filename,d.media_type,d.size_bytes,d.checksum_sha256,d.visibility,d.uploaded_at,u.full_name AS uploaded_by,c.name AS category_name,c.code AS category_code
          FROM student_documents d JOIN user_accounts u ON u.school_id=d.school_id AND u.id=d.uploaded_by
          LEFT JOIN document_categories c ON c.school_id=d.school_id AND c.id=d.category_id
          WHERE d.school_id=$1 AND d.student_id=$2 AND d.deleted_at IS NULL ORDER BY d.uploaded_at DESC`, [schoolId, req.params.studentId])).rows;
      }
      if (!canReadSensitive) {
        student.date_of_birth = null; student.sex = null; student.external_learner_id = null;
        for (const guardian of guardianResult.rows) { guardian.phone = null; guardian.email = null; }
      }
      await close(req, true);
      return res.json({ student: { ...student, guardians: guardianResult.rows, enrollmentHistory: historyResult.rows, documents, documentCategories, documentStorageReady, sensitiveFieldsVisible: canReadSensitive, gradeDelivery } });
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
    if (!req.auth.account.permissions.includes('students.sensitive.read')) {
      await close(req,false);return res.status(403).json({error:'Restricted student contact access is required.'});
    }
    const firstName=text(req.body?.firstName,80),lastName=text(req.body?.lastName,80);
    const email=text(req.body?.email,254).toLowerCase(),phone=text(req.body?.phone,40);
    const relationship=text(req.body?.relationship,60);
    const primary=req.body?.isPrimary===true;
    const canViewResults=req.body?.canViewResults===true;
    const canViewFinance=req.body?.canViewFinance===true;
    const communicationConsent=req.body?.communicationConsent===true;
    const emergencyContact=req.body?.emergencyContact===true;
    const authorizedPickup=req.body?.authorizedPickup===true;
    if (!firstName||!lastName||!relationship||(!email&&!phone)||(email&&!EMAIL_RE.test(email))) {
      await close(req,false);
      return res.status(400).json({error:'Enter the guardian name, relationship, and at least a valid email or phone.'});
    }
    try{
      const schoolId=req.auth.claims.schoolId,studentId=req.params.studentId;
      // Serializes primary-contact assignments for one learner.
      const student=await req.auth.client.query('SELECT id FROM students WHERE school_id=$1 AND id=$2 FOR UPDATE',[schoolId,studentId]);
      if(!student.rowCount){await close(req,false);return res.status(404).json({error:'Learner not found.'});}
      const matches=await req.auth.client.query(`SELECT id,first_name,last_name,email,phone
        FROM guardians WHERE school_id=$1 AND active
          AND (($2<>'' AND lower(email)=lower($2)) OR ($3<>'' AND phone=$3))
        FOR UPDATE`,[schoolId,email,phone]);
      if(matches.rowCount>1){
        await close(req,false);
        return res.status(409).json({error:'Multiple guardian contacts match. Ask an administrator to reconcile them before linking.'});
      }
      let guardian=matches.rows[0];
      if(guardian && (guardian.first_name.toLowerCase()!==firstName.toLowerCase() ||
          guardian.last_name.toLowerCase()!==lastName.toLowerCase())){
        await close(req,false);
        return res.status(409).json({error:'The supplied email or phone belongs to another guardian name. Review the existing contact before linking.'});
      }
      if(!guardian) {
        guardian=(await req.auth.client.query(`INSERT INTO guardians(school_id,first_name,last_name,email,phone)
          VALUES($1,$2,$3,NULLIF($4,''),NULLIF($5,'')) RETURNING id,first_name,last_name,email,phone`,
          [schoolId,firstName,lastName,email,phone])).rows[0];
      }
      const existing=await req.auth.client.query(`SELECT 1 FROM student_guardians
        WHERE school_id=$1 AND student_id=$2 AND guardian_id=$3`,
        [schoolId,studentId,guardian.id]);
      if(existing.rowCount){
        await close(req,false);
        return res.status(409).json({error:'This guardian is already linked to this learner. No duplicate was added.'});
      }
      const count=await req.auth.client.query('SELECT COUNT(*)::int AS total FROM student_guardians WHERE school_id=$1 AND student_id=$2',[schoolId,studentId]);
      const makePrimary=primary || Number(count.rows[0].total)===0;
      if(makePrimary)await req.auth.client.query('UPDATE student_guardians SET is_primary=false WHERE school_id=$1 AND student_id=$2 AND is_primary=true',[schoolId,studentId]);
      await req.auth.client.query(`INSERT INTO student_guardians
        (school_id,student_id,guardian_id,relationship,is_primary,emergency_contact,authorized_pickup,
         can_view_results,can_view_finance,communication_consent,consent_updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $10 THEN now() ELSE NULL END)`,
        [schoolId,studentId,guardian.id,relationship,makePrimary,emergencyContact,authorizedPickup,
        canViewResults,canViewFinance,communicationConsent]);
      await audit(req,'STUDENT_GUARDIAN_ADDED','STUDENT',studentId,{guardianId:guardian.id,relationship,isPrimary:makePrimary});
      return done(req,res,201,{guardian:{...guardian,relationship,is_primary:makePrimary}});
    }catch(error){return fail(req,res,error);}
  });

  router.get('/finance', needsPermission('finance.read'), async (req, res) => {
    try {
      const schoolId = req.auth.claims.schoolId;
      const [invoices, payments, students, years, momoIntents, expenses, feeItems, feeSchedules, gradeLevels, feeScheduleSchema] = await Promise.all([
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
        req.auth.client.query(`SELECT e.id,e.expense_number,e.category,e.description,e.vendor,e.currency,e.amount::text,e.incurred_on,e.status,e.created_at,e.reviewed_at,e.paid_at,e.payment_channel,e.payment_reference,e.decision_note,
          requester.full_name AS requested_by_name,reviewer.full_name AS reviewed_by_name,payer.full_name AS paid_by_name
          FROM finance_expenses e JOIN user_accounts requester ON requester.school_id=e.school_id AND requester.id=e.requested_by
          LEFT JOIN user_accounts reviewer ON reviewer.school_id=e.school_id AND reviewer.id=e.reviewed_by
          LEFT JOIN user_accounts payer ON payer.school_id=e.school_id AND payer.id=e.paid_by
          WHERE e.school_id=$1 ORDER BY e.created_at DESC LIMIT 200`,[schoolId]),
        req.auth.client.query(`SELECT id,code,name,category,active FROM fee_items WHERE school_id=$1 ORDER BY active DESC,name`,[schoolId]),
        req.auth.client.query(`SELECT fs.id,fs.name,fs.currency,fs.effective_from,fs.effective_to,fs.status,fs.academic_year_id,ay.name AS academic_year_name,
            fs.grade_level_id,gl.name AS grade_level_name,
            COALESCE(json_agg(json_build_object('id',fsl.id,'feeItemId',fsl.fee_item_id,'itemName',fi.name,'description',fsl.description,'amount',fsl.amount::text,'installmentNo',fsl.installment_no,'dueOffsetDays',fsl.due_offset_days) ORDER BY fsl.installment_no,fi.name) FILTER (WHERE fsl.id IS NOT NULL),'[]'::json) AS lines
          FROM fee_schedules fs JOIN academic_years ay ON ay.school_id=fs.school_id AND ay.id=fs.academic_year_id
          LEFT JOIN grade_levels gl ON gl.school_id=fs.school_id AND gl.id=fs.grade_level_id
          LEFT JOIN fee_schedule_lines fsl ON fsl.school_id=fs.school_id AND fsl.fee_schedule_id=fs.id
          LEFT JOIN fee_items fi ON fi.school_id=fsl.school_id AND fi.id=fsl.fee_item_id
          WHERE fs.school_id=$1 GROUP BY fs.id,ay.name,gl.name ORDER BY fs.effective_from DESC,fs.name LIMIT 100`,[schoolId]),
        req.auth.client.query(`SELECT gl.id,gl.name,el.name AS education_level_name FROM grade_levels gl
          JOIN education_levels el ON el.school_id=gl.school_id AND el.id=gl.education_level_id
          WHERE gl.school_id=$1 AND gl.active AND el.active ORDER BY el.name,gl.sort_order,gl.name`,[schoolId]),
        req.auth.client.query(`SELECT count(*)::int AS column_count FROM information_schema.columns
          WHERE table_schema=current_schema() AND table_name='fee_invoices' AND column_name=ANY($1::text[])`,[['fee_schedule_id','fee_schedule_installment_no']])
      ]);
      await close(req, true);
      return res.json({ invoices: invoices.rows, payments: payments.rows, students: students.rows, years: years.rows,
        momoIntents: momoIntents.rows,
        expenses: expenses.rows, feeItems: feeItems.rows, feeSchedules: feeSchedules.rows, gradeLevels: gradeLevels.rows,
        feeScheduleReady:Number(feeScheduleSchema.rows[0]?.column_count||0)===2,
        momo: { enabled: momoClient.config.enabled, environment: momoClient.config.environment, currency: momoClient.config.currency, feeRateBps: momoClient.config.feeRateBps, reason: momoClient.config.reason },
        canWrite: req.auth.account.permissions.includes('finance.write'),canApproveExpenses:req.auth.account.permissions.includes('finance.expenses.approve') });
    } catch (error) { return fail(req, res, error); }
  });

  // Principals can review operating expense requests without gaining access to
  // learner invoices, payment records, or Finance write actions.
  router.get('/finance/expense-approvals', needsPermission('finance.expenses.approve'), async(req,res)=>{
    try {
      const expenses = await req.auth.client.query(`SELECT e.id,e.expense_number,e.category,e.description,e.vendor,e.currency,e.amount::text,e.incurred_on,e.status,e.created_at,e.reviewed_at,e.paid_at,e.payment_channel,e.payment_reference,e.decision_note,
        requester.full_name AS requested_by_name,reviewer.full_name AS reviewed_by_name,payer.full_name AS paid_by_name
        FROM finance_expenses e JOIN user_accounts requester ON requester.school_id=e.school_id AND requester.id=e.requested_by
        LEFT JOIN user_accounts reviewer ON reviewer.school_id=e.school_id AND reviewer.id=e.reviewed_by
        LEFT JOIN user_accounts payer ON payer.school_id=e.school_id AND payer.id=e.paid_by
        WHERE e.school_id=$1 ORDER BY CASE e.status WHEN 'SUBMITTED' THEN 0 ELSE 1 END,e.created_at DESC LIMIT 200`,[req.auth.claims.schoolId]);
      await close(req,true);
      return res.json({expenses:expenses.rows});
    } catch(error) { return fail(req,res,error); }
  });

  router.post('/finance/expenses', needsPermission('finance.write'), csrf, async(req,res)=>{
    const category=text(req.body?.category,80);const description=text(req.body?.description,500);const vendor=text(req.body?.vendor,160);const currency=text(req.body?.currency,3).toUpperCase();const amount=Number(req.body?.amount);const incurredOn=req.body?.incurredOn;
    if(!category||!description||!['LRD','USD'].includes(currency)||!Number.isFinite(amount)||amount<=0||amount>999999999||!validDate(incurredOn)){await close(req,false);return res.status(400).json({error:'Enter an expense category, description, LRD or USD amount, and valid date.'});}
    try{const schoolId=req.auth.claims.schoolId;const dateTag=new Date().toISOString().slice(0,10).replaceAll('-','');const expenseNumber=`EXP-${dateTag}-${randomBytes(3).toString('hex').toUpperCase()}`;
      const result=await req.auth.client.query(`INSERT INTO finance_expenses(school_id,expense_number,category,description,vendor,currency,amount,incurred_on,status,requested_by)
        VALUES($1,$2,$3,$4,NULLIF($5,''),$6,$7,$8,'SUBMITTED',$9) RETURNING id,expense_number,status,currency,amount::text`,[schoolId,expenseNumber,category,description,vendor,currency,amount.toFixed(2),incurredOn,req.auth.claims.userId]);
      await audit(req,'FINANCE_EXPENSE_SUBMITTED','FINANCE_EXPENSE',result.rows[0].id,{expenseNumber,currency,amount:result.rows[0].amount,category});return done(req,res,201,{expense:result.rows[0],notice:'Expense request submitted for Principal or school administrator review.'});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/finance/expenses/:expenseId/decision', needsPermission('finance.expenses.approve'), csrf, async(req,res)=>{
    const decision=text(req.body?.decision,20).toUpperCase();const note=text(req.body?.note,500);
    if(!['APPROVED','REJECTED'].includes(decision)||(decision==='REJECTED'&&!note)){await close(req,false);return res.status(400).json({error:'Choose approve or reject. A reason is required when rejecting an expense.'});}
    try{const result=await req.auth.client.query(`UPDATE finance_expenses SET status=$4,reviewed_by=$3,reviewed_at=now(),decision_note=NULLIF($5,''),updated_at=now()
      WHERE school_id=$1 AND id=$2 AND status='SUBMITTED' AND requested_by<>$3 RETURNING id,expense_number,status,currency,amount::text`,[req.auth.claims.schoolId,req.params.expenseId,req.auth.claims.userId,decision,note]);
      if(!result.rowCount){await close(req,false);return res.status(409).json({error:'This expense is no longer awaiting review, or you cannot approve your own request.'});}
      await audit(req,`FINANCE_EXPENSE_${decision}`,'FINANCE_EXPENSE',result.rows[0].id,{expenseNumber:result.rows[0].expense_number,note});return done(req,res,200,{expense:result.rows[0],notice:`Expense ${decision.toLowerCase()} and recorded.`});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/finance/expenses/:expenseId/pay', needsPermission('finance.write'), csrf, async(req,res)=>{
    const channel=text(req.body?.channel,20).toUpperCase();const reference=text(req.body?.reference,120);
    if(!['CASH','BANK','OTHER'].includes(channel)){await close(req,false);return res.status(400).json({error:'Choose cash, bank transfer, or another manually verified payment method.'});}
    try{const result=await req.auth.client.query(`UPDATE finance_expenses SET status='PAID',paid_by=$3,paid_at=now(),payment_channel=$4,payment_reference=NULLIF($5,''),updated_at=now()
      WHERE school_id=$1 AND id=$2 AND status='APPROVED' RETURNING id,expense_number,status,currency,amount::text`,[req.auth.claims.schoolId,req.params.expenseId,req.auth.claims.userId,channel,reference]);
      if(!result.rowCount){await close(req,false);return res.status(409).json({error:'Only an approved expense can be recorded as paid.'});}
      await audit(req,'FINANCE_EXPENSE_PAID','FINANCE_EXPENSE',result.rows[0].id,{expenseNumber:result.rows[0].expense_number,currency:result.rows[0].currency,amount:result.rows[0].amount,channel,reference});return done(req,res,200,{expense:result.rows[0],notice:'Expense payment recorded in the audit trail.'});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/finance/fee-items', needsPermission('finance.write'), csrf, async(req,res)=>{
    const code=text(req.body?.code,32).toUpperCase();const name=text(req.body?.name,100);const category=text(req.body?.category,80);
    if(!/^[A-Z0-9_-]{2,32}$/.test(code)||!name||!category){await close(req,false);return res.status(400).json({error:'Enter a short code, fee item name, and category.'});}
    try{const result=await req.auth.client.query(`INSERT INTO fee_items(school_id,code,name,category) VALUES($1,$2,$3,$4) RETURNING id,code,name,category,active`,[req.auth.claims.schoolId,code,name,category]);
      await audit(req,'FEE_ITEM_CREATED','FEE_ITEM',result.rows[0].id,{code,name,category});return done(req,res,201,{feeItem:result.rows[0],notice:'Fee item created.'});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/finance/fee-schedules', needsPermission('finance.write'), csrf, async(req,res)=>{
    const academicYearId=text(req.body?.academicYearId,50);const gradeLevelId=text(req.body?.gradeLevelId,50);const name=text(req.body?.name,120);const currency=text(req.body?.currency,3).toUpperCase();const effectiveFrom=req.body?.effectiveFrom;const effectiveTo=req.body?.effectiveTo||null;
    if(!academicYearId||!gradeLevelId||!name||!['LRD','USD'].includes(currency)||!validDate(effectiveFrom)||(effectiveTo&&(!validDate(effectiveTo)||effectiveTo<effectiveFrom))){await close(req,false);return res.status(400).json({error:'Choose an academic year and grade, enter a schedule name, currency, and valid effective date range.'});}
    try{const result=await req.auth.client.query(`INSERT INTO fee_schedules(school_id,academic_year_id,grade_level_id,currency,name,effective_from,effective_to,status,created_by)
        SELECT $1,ay.id,gl.id,$4,$5,$6,$7,'DRAFT',$8 FROM academic_years ay JOIN grade_levels gl ON gl.school_id=ay.school_id
          WHERE ay.school_id=$1 AND ay.id=$2 AND gl.id=$3 AND gl.active
        RETURNING id,name,currency,status,academic_year_id,grade_level_id`,[req.auth.claims.schoolId,academicYearId,gradeLevelId,currency,name,effectiveFrom,effectiveTo,req.auth.claims.userId]);
      if(!result.rowCount){await close(req,false);return res.status(400).json({error:'Choose an active grade level and academic year from this school.'});}
      await audit(req,'FEE_SCHEDULE_CREATED','FEE_SCHEDULE',result.rows[0].id,{name,currency,academicYearId,gradeLevelId});return done(req,res,201,{schedule:result.rows[0],notice:'Draft fee schedule created. Add its fee lines before activation.'});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/finance/fee-schedules/:scheduleId/lines', needsPermission('finance.write'), csrf, async(req,res)=>{
    const feeItemId=text(req.body?.feeItemId,50);const description=text(req.body?.description,180);const amount=Number(req.body?.amount);const installmentNo=Number(req.body?.installmentNo);const dueOffsetDays=Number(req.body?.dueOffsetDays||0);
    if(!feeItemId||!description||!Number.isFinite(amount)||amount<=0||amount>999999999||!Number.isInteger(installmentNo)||installmentNo<1||installmentNo>20||!Number.isInteger(dueOffsetDays)||dueOffsetDays<0||dueOffsetDays>730){await close(req,false);return res.status(400).json({error:'Enter an active fee item, description, positive amount, installment number from 1–20, and due offset from 0–730 days.'});}
    try{const schedule=await req.auth.client.query(`SELECT id,currency FROM fee_schedules WHERE school_id=$1 AND id=$2 AND status='DRAFT' FOR UPDATE`,[req.auth.claims.schoolId,req.params.scheduleId]);
      if(!schedule.rowCount){await close(req,false);return res.status(409).json({error:'Only a draft fee schedule can be changed.'});}
      const result=await req.auth.client.query(`INSERT INTO fee_schedule_lines(school_id,fee_schedule_id,fee_item_id,description,amount,installment_no,due_offset_days)
        SELECT $1,$2,fi.id,$4,$5,$6,$7 FROM fee_items fi WHERE fi.school_id=$1 AND fi.id=$3 AND fi.active
        RETURNING id,fee_item_id,description,amount::text,installment_no,due_offset_days`,[req.auth.claims.schoolId,req.params.scheduleId,feeItemId,description,amount.toFixed(2),installmentNo,dueOffsetDays]);
      if(!result.rowCount){await close(req,false);return res.status(400).json({error:'Choose an active fee item from this school.'});}
      await audit(req,'FEE_SCHEDULE_LINE_CREATED','FEE_SCHEDULE',req.params.scheduleId,{lineId:result.rows[0].id,feeItemId,amount:result.rows[0].amount,currency:schedule.rows[0].currency,installmentNo});return done(req,res,201,{line:result.rows[0],notice:'Fee line added to the draft schedule.'});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/finance/fee-schedules/:scheduleId/activate', needsPermission('finance.write'), csrf, async(req,res)=>{
    try{const draft=await req.auth.client.query(`SELECT academic_year_id,grade_level_id,currency FROM fee_schedules WHERE school_id=$1 AND id=$2 AND status='DRAFT' FOR UPDATE`,[req.auth.claims.schoolId,req.params.scheduleId]);
      if(!draft.rowCount){await close(req,false);return res.status(409).json({error:'Only a draft fee schedule can be activated.'});}
      await req.auth.client.query(`SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`,[req.auth.claims.schoolId,`${draft.rows[0].academic_year_id}:${draft.rows[0].grade_level_id}:${draft.rows[0].currency}`]);
      const result=await req.auth.client.query(`UPDATE fee_schedules fs SET status='ACTIVE'
        WHERE fs.school_id=$1 AND fs.id=$2 AND fs.status='DRAFT'
          AND EXISTS(SELECT 1 FROM fee_schedule_lines l WHERE l.school_id=fs.school_id AND l.fee_schedule_id=fs.id)
          AND NOT EXISTS(SELECT 1 FROM fee_schedules other WHERE other.school_id=fs.school_id AND other.id<>fs.id AND other.status='ACTIVE'
            AND other.academic_year_id=fs.academic_year_id AND other.grade_level_id=fs.grade_level_id AND other.currency=fs.currency
            AND daterange(other.effective_from,COALESCE(other.effective_to+1,'infinity'::date),'[)') && daterange(fs.effective_from,COALESCE(fs.effective_to+1,'infinity'::date),'[)'))
        RETURNING id,name,currency,status,academic_year_id,grade_level_id`,[req.auth.claims.schoolId,req.params.scheduleId]);
      if(!result.rowCount){await close(req,false);return res.status(409).json({error:'This schedule is not a draft with fee lines, or another active schedule covers the same grade, year, currency, and date range.'});}
      await audit(req,'FEE_SCHEDULE_ACTIVATED','FEE_SCHEDULE',result.rows[0].id,{name:result.rows[0].name,currency:result.rows[0].currency});return done(req,res,200,{schedule:result.rows[0],notice:'Fee schedule activated. You can issue each installment to currently enrolled learners.'});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/finance/fee-schedules/:scheduleId/issue-installment', needsPermission('finance.write'), csrf, async(req,res)=>{
    const installmentNo=Number(req.body?.installmentNo);
    if(!Number.isInteger(installmentNo)||installmentNo<1||installmentNo>20){await close(req,false);return res.status(400).json({error:'Choose a valid installment number from 1 to 20.'});}
    try{const schoolId=req.auth.claims.schoolId;
      const schedule=await req.auth.client.query(`SELECT id,name,currency,academic_year_id,grade_level_id FROM fee_schedules WHERE school_id=$1 AND id=$2 AND status='ACTIVE' AND effective_from<=CURRENT_DATE AND (effective_to IS NULL OR effective_to>=CURRENT_DATE) FOR UPDATE`,[schoolId,req.params.scheduleId]);
      if(!schedule.rowCount){await close(req,false);return res.status(409).json({error:'Only an active fee schedule within its effective dates can issue invoices.'});}
      const scheduleRow=schedule.rows[0];
      const lineCheck=await req.auth.client.query(`SELECT count(*)::int AS line_count FROM fee_schedule_lines WHERE school_id=$1 AND fee_schedule_id=$2 AND installment_no=$3`,[schoolId,scheduleRow.id,installmentNo]);
      if(!Number(lineCheck.rows[0]?.line_count)){await close(req,false);return res.status(404).json({error:'This installment has no fee lines.'});}
      // Older or imported classes may have a stale/missing grade_level_id while
      // their grade label or class name still identifies the correct grade.
      // Match an exact label against a grade in the schedule's stage, and reject
      // a class that already points to a different stage.
      const targets=await req.auth.client.query(`SELECT count(DISTINCT ce.student_id)::int AS count
        FROM class_groups cg JOIN class_enrollments ce ON ce.school_id=cg.school_id AND ce.class_group_id=cg.id AND ce.status='ACTIVE'
        JOIN students st ON st.school_id=ce.school_id AND st.id=ce.student_id AND st.status='ACTIVE'
        JOIN grade_levels fee_grade ON fee_grade.school_id=cg.school_id AND fee_grade.id=$3
        WHERE cg.school_id=$1 AND cg.academic_year_id=$2
          AND (cg.grade_level_id=fee_grade.id OR (
            (
            regexp_replace(lower(btrim(cg.grade_level)), '[^[:alnum:]]+', '', 'g')=regexp_replace(lower(btrim(fee_grade.name)), '[^[:alnum:]]+', '', 'g')
            OR regexp_replace(lower(btrim(cg.name)), '[^[:alnum:]]+', '', 'g')=regexp_replace(lower(btrim(fee_grade.name)), '[^[:alnum:]]+', '', 'g')
          )
            AND (cg.education_level_id IS NULL OR fee_grade.education_level_id IS NULL
              OR cg.education_level_id=fee_grade.education_level_id)
          ))`,[schoolId,scheduleRow.academic_year_id,scheduleRow.grade_level_id]);
      const targetCount=Number(targets.rows[0]?.count||0);
      if(!targetCount){
        const diagnostic=await req.auth.client.query(`WITH class_diagnostics AS (
            SELECT cg.id,cg.name AS class_name,cg.grade_level AS grade_label,
              linked_grade.name AS linked_grade_name,stage.name AS education_stage,
              fee_stage.name AS schedule_education_stage,fee_grade.active AS schedule_grade_active,
              regexp_replace(lower(btrim(cg.grade_level)), '[^[:alnum:]]+', '', 'g')=regexp_replace(lower(btrim(fee_grade.name)), '[^[:alnum:]]+', '', 'g') AS grade_label_matches,
              regexp_replace(lower(btrim(cg.name)), '[^[:alnum:]]+', '', 'g')=regexp_replace(lower(btrim(fee_grade.name)), '[^[:alnum:]]+', '', 'g') AS class_name_matches,
              (cg.education_level_id IS NULL OR fee_grade.education_level_id IS NULL
                OR cg.education_level_id=fee_grade.education_level_id) AS stage_compatible,
              count(DISTINCT ce.student_id) FILTER (WHERE ce.status='ACTIVE' AND st.status='ACTIVE')::int AS active_learners
            FROM class_groups cg
            LEFT JOIN class_enrollments ce ON ce.school_id=cg.school_id AND ce.class_group_id=cg.id
            LEFT JOIN students st ON st.school_id=ce.school_id AND st.id=ce.student_id
            LEFT JOIN grade_levels linked_grade ON linked_grade.school_id=cg.school_id AND linked_grade.id=cg.grade_level_id
            LEFT JOIN education_levels stage ON stage.school_id=cg.school_id AND stage.id=cg.education_level_id
            LEFT JOIN grade_levels fee_grade ON fee_grade.school_id=cg.school_id AND fee_grade.id=$3
            LEFT JOIN education_levels fee_stage ON fee_stage.school_id=fee_grade.school_id AND fee_stage.id=fee_grade.education_level_id
            WHERE cg.school_id=$1 AND cg.academic_year_id=$2
            GROUP BY cg.id,cg.name,cg.grade_level,linked_grade.name,stage.name,
              fee_stage.name,fee_grade.active,fee_grade.education_level_id,fee_grade.name,cg.education_level_id
          )
          SELECT ay.name AS academic_year_name,fee_grade.name AS fee_grade_name,
            COALESCE((SELECT count(DISTINCT ce.student_id)::int FROM class_groups cg
              JOIN class_enrollments ce ON ce.school_id=cg.school_id AND ce.class_group_id=cg.id AND ce.status='ACTIVE'
              JOIN students st ON st.school_id=ce.school_id AND st.id=ce.student_id AND st.status='ACTIVE'
              WHERE cg.school_id=$1 AND cg.academic_year_id=$2),0)::int AS active_learners_in_year,
            COALESCE((SELECT count(DISTINCT ce.student_id)::int FROM class_groups other_cg
              JOIN academic_years other_year ON other_year.school_id=other_cg.school_id AND other_year.id=other_cg.academic_year_id
              JOIN class_enrollments ce ON ce.school_id=other_cg.school_id AND ce.class_group_id=other_cg.id AND ce.status='ACTIVE'
              JOIN students st ON st.school_id=ce.school_id AND st.id=ce.student_id AND st.status='ACTIVE'
              WHERE other_cg.school_id=$1 AND other_year.id<>ay.id
                AND lower(btrim(other_year.name))=lower(btrim(ay.name))),0)::int AS active_learners_in_other_same_named_years,
            COALESCE((SELECT count(*)::int FROM class_diagnostics WHERE active_learners>0),0)::int AS active_classes_in_year,
            COALESCE((SELECT json_agg(json_build_object('className',class_name,'gradeLabel',grade_label,
              'linkedGrade',linked_grade_name,'educationStage',education_stage,'activeLearners',active_learners,
              'scheduleEducationStage',schedule_education_stage,'scheduleGradeActive',schedule_grade_active,
              'gradeLabelMatches',grade_label_matches,'classNameMatches',class_name_matches,'stageCompatible',stage_compatible)
              ORDER BY class_name) FROM class_diagnostics WHERE active_learners>0),'[]'::json) AS classes
          FROM academic_years ay JOIN grade_levels fee_grade ON fee_grade.school_id=ay.school_id
          WHERE ay.school_id=$1 AND ay.id=$2 AND fee_grade.id=$3`,[schoolId,scheduleRow.academic_year_id,scheduleRow.grade_level_id]);
        const details=diagnostic.rows[0]||{};
        const classes=Array.isArray(details.classes)?details.classes:[];
        const classSummary=classes.slice(0,5).map(item=>`${item.className} (grade label: ${item.gradeLabel||'blank'}; linked grade: ${item.linkedGrade||'not linked'}; class stage: ${item.educationStage||'not set'}; schedule stage: ${item.scheduleEducationStage||'not set'}; grade label match: ${item.gradeLabelMatches?'yes':'no'}; class name match: ${item.classNameMatches?'yes':'no'}; stage compatible: ${item.stageCompatible?'yes':'no'}; schedule grade active: ${item.scheduleGradeActive?'yes':'no'}; active learners: ${item.activeLearners})`).join('; ');
        const additionalClasses=classes.length>5?`; and ${classes.length-5} more class(es)`:'';
        const yearName=details.academic_year_name||'the selected academic year';
        const activeLearners=Number(details.active_learners_in_year||0);
        const otherSameNameYearLearners=Number(details.active_learners_in_other_same_named_years||0);
        const error=activeLearners
          ? `No active learners matched ${details.fee_grade_name||'this fee schedule'} for ${yearName}. There are ${activeLearners} active learner(s) in ${Number(details.active_classes_in_year||0)} class(es) for that year: ${classSummary}${additionalClasses}. The match details identify which grade or stage condition differs.`
          : otherSameNameYearLearners
            ? `The selected academic-year record for ${yearName} has no active enrollments, but ${otherSameNameYearLearners} active learner(s) are attached to a different academic-year record with the same displayed name. The fee schedule and class must use the same academic-year record.`
            : `No active class enrollments were found for ${yearName}. Check the class enrollment academic year and active enrollment status.`;
        await close(req,false);return res.status(409).json({error});
      }
      const issued=await req.auth.client.query(`WITH enrolled AS MATERIALIZED (
          SELECT DISTINCT ce.student_id FROM class_groups cg JOIN class_enrollments ce ON ce.school_id=cg.school_id AND ce.class_group_id=cg.id AND ce.status='ACTIVE'
            JOIN students st ON st.school_id=ce.school_id AND st.id=ce.student_id AND st.status='ACTIVE'
            JOIN grade_levels fee_grade ON fee_grade.school_id=cg.school_id AND fee_grade.id=$3
          WHERE cg.school_id=$1 AND cg.academic_year_id=$2
            AND (cg.grade_level_id=fee_grade.id OR (
              (
            regexp_replace(lower(btrim(cg.grade_level)), '[^[:alnum:]]+', '', 'g')=regexp_replace(lower(btrim(fee_grade.name)), '[^[:alnum:]]+', '', 'g')
            OR regexp_replace(lower(btrim(cg.name)), '[^[:alnum:]]+', '', 'g')=regexp_replace(lower(btrim(fee_grade.name)), '[^[:alnum:]]+', '', 'g')
          )
              AND (cg.education_level_id IS NULL OR fee_grade.education_level_id IS NULL
              OR cg.education_level_id=fee_grade.education_level_id)
            ))
        ), created AS (
          INSERT INTO fee_invoices(school_id,student_id,academic_year_id,invoice_number,currency,due_on,status,created_by,fee_schedule_id,fee_schedule_installment_no)
          SELECT $1,e.student_id,$2,'RIA-'||to_char(CURRENT_DATE,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),$4,
            CURRENT_DATE+COALESCE((SELECT max(l.due_offset_days) FROM fee_schedule_lines l WHERE l.school_id=$1 AND l.fee_schedule_id=$5 AND l.installment_no=$6),0),
            'ISSUED',$7,$5,$6 FROM enrolled e
          ON CONFLICT (school_id,student_id,academic_year_id,fee_schedule_id,fee_schedule_installment_no) WHERE fee_schedule_id IS NOT NULL DO NOTHING
          RETURNING id
        ), line_rows AS (
          INSERT INTO fee_invoice_lines(school_id,invoice_id,fee_item_id,description,quantity,unit_amount,fee_schedule_line_id)
          SELECT $1,c.id,l.fee_item_id,l.description,1,l.amount,l.id FROM created c JOIN fee_schedule_lines l ON l.school_id=$1 AND l.fee_schedule_id=$5 AND l.installment_no=$6
          RETURNING invoice_id
        ) SELECT count(DISTINCT invoice_id)::int AS invoice_count FROM line_rows`,[schoolId,scheduleRow.academic_year_id,scheduleRow.grade_level_id,scheduleRow.currency,scheduleRow.id,installmentNo,req.auth.claims.userId]);
      const invoiceCount=Number(issued.rows[0]?.invoice_count||0);
      await audit(req,'FEE_SCHEDULE_INSTALLMENT_ISSUED','FEE_SCHEDULE',scheduleRow.id,{scheduleName:scheduleRow.name,installmentNo,currency:scheduleRow.currency,targetLearners:targetCount,invoicesCreated:invoiceCount});
      return done(req,res,200,{scheduleId:scheduleRow.id,installmentNo,targetLearners:targetCount,invoicesCreated:invoiceCount,alreadyIssued:targetCount-invoiceCount,currency:scheduleRow.currency,notice:`Installment ${installmentNo}: ${invoiceCount} invoice(s) issued; ${targetCount-invoiceCount} already existed. Repeat requests do not create duplicate invoices.`});
    }catch(error){return fail(req,res,error);}
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
      if (permissions.includes('emis.export') && permissions.includes('students.read')) {
        const school = await req.auth.client.query('SELECT name,moe_school_emis_code FROM schools WHERE id=$1',[schoolId]);
        const completeness = await req.auth.client.query(`SELECT COUNT(*)::int AS active_learners,
            COUNT(*) FILTER (WHERE NULLIF(TRIM(s.external_learner_id),'') IS NULL)::int AS missing_learner_id,
            COUNT(*) FILTER (WHERE s.date_of_birth IS NULL)::int AS missing_birth_date,
            COUNT(*) FILTER (WHERE s.sex IS NULL OR TRIM(s.sex)='')::int AS missing_sex,
            COUNT(*) FILTER (WHERE current_class.class_group_id IS NULL)::int AS missing_class
          FROM students s LEFT JOIN LATERAL (
            SELECT ce.class_group_id FROM class_enrollments ce
            JOIN class_groups cg ON cg.school_id=ce.school_id AND cg.id=ce.class_group_id
            JOIN academic_years ay ON ay.school_id=cg.school_id AND ay.id=cg.academic_year_id
            WHERE ce.school_id=s.school_id AND ce.student_id=s.id AND ce.status='ACTIVE'
            ORDER BY (ay.status='ACTIVE') DESC,ay.starts_on DESC,ce.enrolled_on DESC LIMIT 1
          ) current_class ON true WHERE s.school_id=$1 AND s.status='ACTIVE'`,[schoolId]);
        const byClass = await req.auth.client.query(`SELECT COALESCE(current_class.class_name,'Not assigned') AS class_name,
            COALESCE(current_class.academic_year,'Not assigned') AS academic_year,
            COUNT(*)::int AS learners,
            COUNT(*) FILTER(WHERE UPPER(TRIM(s.sex)) IN ('MALE','M'))::int AS male,
            COUNT(*) FILTER(WHERE UPPER(TRIM(s.sex)) IN ('FEMALE','F'))::int AS female,
            COUNT(*) FILTER(WHERE s.sex IS NULL OR UPPER(TRIM(s.sex)) NOT IN ('MALE','M','FEMALE','F'))::int AS sex_unrecorded
          FROM students s LEFT JOIN LATERAL (
            SELECT cg.name AS class_name,ay.name AS academic_year FROM class_enrollments ce
            JOIN class_groups cg ON cg.school_id=ce.school_id AND cg.id=ce.class_group_id
            JOIN academic_years ay ON ay.school_id=cg.school_id AND ay.id=cg.academic_year_id
            WHERE ce.school_id=s.school_id AND ce.student_id=s.id AND ce.status='ACTIVE'
            ORDER BY (ay.status='ACTIVE') DESC,ay.starts_on DESC,ce.enrolled_on DESC LIMIT 1
          ) current_class ON true
          WHERE s.school_id=$1 AND s.status='ACTIVE'
          GROUP BY current_class.class_name,current_class.academic_year
          ORDER BY current_class.academic_year,current_class.class_name`,[schoolId]);
        // Historical enrollment is counted from persisted class enrollment records,
        // independently of current student ACTIVE status. Each learner counts once
        // per academic year, with their most recently enrolled class that year.
        const history = await req.auth.client.query(`
          WITH ranked AS (
            SELECT ay.name AS academic_year, cg.name AS class_name,
              ce.student_id, ce.status AS enrollment_status,
              s.sex,
              ROW_NUMBER() OVER (
                PARTITION BY ay.id, ce.student_id
                ORDER BY ce.enrolled_on DESC NULLS LAST,ce.class_group_id DESC
              ) AS position
            FROM class_enrollments ce
            JOIN class_groups cg ON cg.id=ce.class_group_id AND cg.school_id=ce.school_id
            JOIN academic_years ay ON ay.id=cg.academic_year_id AND ay.school_id=cg.school_id
            JOIN students s ON s.id=ce.student_id AND s.school_id=ce.school_id
            WHERE ce.school_id=$1
          )
          SELECT academic_year,class_name,COUNT(*)::int AS learners,
            COUNT(*) FILTER (WHERE enrollment_status='ACTIVE')::int AS current_enrollments,
            COUNT(*) FILTER (WHERE UPPER(TRIM(sex)) IN ('MALE','M'))::int AS male,
            COUNT(*) FILTER (WHERE UPPER(TRIM(sex)) IN ('FEMALE','F'))::int AS female,
            COUNT(*) FILTER (WHERE sex IS NULL OR UPPER(TRIM(sex)) NOT IN ('MALE','M','FEMALE','F'))::int AS sex_unrecorded
          FROM ranked WHERE position=1
          GROUP BY academic_year,class_name
          ORDER BY academic_year DESC,class_name`,[schoolId]);
        reports.emis = {
          schemaVersion:'redeemer-emis-draft-v2',officialTemplateVerified:false,
          schoolName:school.rows[0]?.name||'',schoolCode:school.rows[0]?.moe_school_emis_code||null,
          completeness:completeness.rows[0],byClass:byClass.rows,historicalEnrollment:history.rows,
          generatedAt:new Date().toISOString()
        };
      }
      if (permissions.includes('staff.read')) {
        const staff = await req.auth.client.query(`SELECT employment_status, count(*)::int AS count FROM staff_records WHERE school_id = $1 GROUP BY employment_status ORDER BY employment_status`, [schoolId]);
        reports.staff = staff.rows;
      }
      await close(req, true);
      return res.json({ reports });
    } catch (error) { return fail(req, res, error); }
  });

  router.get('/reports/graduation-honors', needsPermission('grades.publish'), async (req, res) => {
    if (!req.auth.account.roles.includes('PRINCIPAL')) {
      await close(req, false);
      return res.status(403).json({ error: 'Only the Principal can review graduation honor recommendations.' });
    }
    const academicYearId = text(req.query?.academicYearId, 50);
    const gradeLevelId = text(req.query?.gradeLevelId, 50);
    if (!academicYearId) { await close(req, false); return res.status(400).json({ error: 'Choose an academic year.' }); }
    try {
      const schoolId = req.auth.claims.schoolId;
      const year = await req.auth.client.query(`SELECT id,name FROM academic_years WHERE school_id=$1 AND id=$2`, [schoolId, academicYearId]);
      if (!year.rowCount) { await close(req, false); return res.status(404).json({ error: 'Academic year not found for this school.' }); }
      const gradeLevels = await req.auth.client.query(`SELECT DISTINCT
          COALESCE(gl.id::text, 'legacy:' || NULLIF(BTRIM(cg.grade_level), '')) AS id,
          COALESCE(gl.name, NULLIF(BTRIM(cg.grade_level), '')) AS name,
          COALESCE(e.name, 'Existing class grade') AS education_level_name
        FROM class_groups cg
        LEFT JOIN grade_levels gl ON gl.school_id=cg.school_id AND gl.id=cg.grade_level_id AND gl.active
        LEFT JOIN education_levels e ON e.school_id=gl.school_id AND e.id=gl.education_level_id AND e.active
        WHERE cg.school_id=$1 AND cg.academic_year_id=$2
          AND COALESCE(gl.id::text, NULLIF(BTRIM(cg.grade_level), '')) IS NOT NULL
        ORDER BY education_level_name,name`, [schoolId, academicYearId]);
      if (!gradeLevelId) {
        await close(req, true);
        return res.json({ academicYear: year.rows[0], gradeLevels: gradeLevels.rows, gradeLevel: null, results: [] });
      }
      const gradeLevel = gradeLevels.rows.find(row => row.id === gradeLevelId);
      if (!gradeLevel) { await close(req, false); return res.status(404).json({ error: 'Choose a grade level or existing class grade for this academic year.' }); }
      const results = await req.auth.client.query(`
        SELECT DISTINCT ON (rc.student_id)
          rc.student_id::text AS "studentId",COALESCE(rc.academic_summary #>> '{student,student_number}',st.student_number) AS "studentNumber",
          COALESCE(rc.academic_summary #>> '{student,first_name}',st.first_name) AS "firstName",
          COALESCE(rc.academic_summary #>> '{student,last_name}',st.last_name) AS "lastName",
          COALESCE(rc.academic_summary #>> '{classGroup,name}',cg.name) AS "className",
          (rc.academic_summary->>'overallAverage')::numeric AS "overallAverage",
          rc.academic_summary->>'overallOutcome' AS "overallOutcome",rc.approved_at AS "approvedAt"
        FROM report_cards rc
        JOIN students st ON st.school_id=rc.school_id AND st.id=rc.student_id
        JOIN class_groups cg ON cg.school_id=rc.school_id AND cg.academic_year_id=rc.academic_year_id
          AND cg.id::text=rc.academic_summary #>> '{classGroup,id}'
          AND CASE WHEN $3 LIKE 'legacy:%'
            THEN cg.grade_level_id IS NULL AND LOWER(BTRIM(cg.grade_level))=LOWER(BTRIM(SUBSTRING($3 FROM 8)))
            ELSE cg.grade_level_id::text=$3 END
        WHERE rc.school_id=$1 AND rc.academic_year_id=$2 AND rc.academic_term_id IS NULL AND rc.status='PUBLISHED'
          AND NULLIF(rc.academic_summary->>'overallAverage','') IS NOT NULL
        ORDER BY rc.student_id,rc.snapshot_version DESC`, [schoolId, academicYearId, gradeLevelId]);
      await close(req, true);
      return res.json({ academicYear: year.rows[0], gradeLevels: gradeLevels.rows, gradeLevel, results: results.rows });
    } catch (error) { return fail(req, res, error); }
  });

  // Archived historical class totals are separate from live enrollments.
  // Each import is atomic, permission-gated and protected from duplicate batches.
  router.get('/reports/emis-archive', needsPermission('emis.export'), async(req,res)=>{
    try {
      if(!req.auth.account.permissions.includes('students.read')){await close(req,false);return res.status(403).json({error:'Student reporting permission required.'});}
      const schoolId=req.auth.claims.schoolId;
      const rows=await req.auth.client.query(`SELECT r.academic_year,r.class_name,r.learners,r.male,r.female,r.sex_unrecorded,
        b.id AS batch_id,b.source_filename,b.imported_at FROM emis_historical_import_rows r
        JOIN emis_historical_import_batches b ON b.school_id=r.school_id AND b.id=r.batch_id
        WHERE r.school_id=$1 ORDER BY r.academic_year DESC,r.class_name,b.imported_at DESC`,[schoolId]);
      await close(req,true);
      return res.json({rows:rows.rows});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/reports/emis-archive', needsPermission('emis.export'), csrf, async(req,res)=>{
    try{
      if(!req.auth.account.permissions.includes('students.read')){await close(req,false);return res.status(403).json({error:'Student reporting permission required.'});}
      const {filename,rows}=req.body||{};
      if(typeof filename!=='string'||filename.length<1||filename.length>180||!filename.toLowerCase().endsWith('.csv')||!Array.isArray(rows)||!rows.length||rows.length>5000){
        await close(req,false);return res.status(400).json({error:'Choose a valid CSV with 1 to 5,000 historical rows.'});
      }
      const normal=[];
      const unique=new Set();
      for(const [index,entry] of rows.entries()){
        if(!entry || typeof entry!=='object'||Array.isArray(entry))throw Object.assign(new Error(`Row ${index+2}: invalid data.`),{status:400});
        const academicYear=String(entry.academic_year||'').trim();
        const className=String(entry.class_name||'').trim();
        if(!/^\d{4}[-/]\d{4}$/.test(academicYear)||className.length<1||className.length>100){
          await close(req,false);return res.status(400).json({error:`Row ${index+2}: enter academic_year YYYY-YYYY and class_name (up to 100 characters).`});
        }
        const numbers=['learners','male','female','sex_unrecorded'].map(field=>{
          const value=entry[field];
          if(!/^(0|[1-9]\d*)$/.test(String(value??'')))return NaN;
          const count=Number(value);return Number.isSafeInteger(count)&&count<=1000000?count:NaN;
        });
        if(numbers.some(number=>!Number.isFinite(number))||numbers[0]!==numbers[1]+numbers[2]+numbers[3]){
          await close(req,false);return res.status(400).json({error:`Row ${index+2}: nonnegative integers required and learners must equal male + female + sex_unrecorded.`});
        }
        const identity=`${academicYear.toLowerCase()}|${className.toLowerCase()}`;
        if(unique.has(identity)){await close(req,false);return res.status(400).json({error:`Row ${index+2}: duplicate year/class in file.`});}
        unique.add(identity);normal.push({academicYear,className,numbers});
      }
      const digest=createHash('sha256').update(JSON.stringify(normal)).digest('hex');
      const schoolId=req.auth.claims.schoolId;
      const check=await req.auth.client.query('SELECT id FROM emis_historical_import_batches WHERE school_id=$1 AND file_sha256=$2',[schoolId,digest]);
      if(check.rowCount){await close(req,false);return res.status(409).json({error:'This set of historical records has already been imported. Existing archive is unchanged.'});}
      const batch=await req.auth.client.query(`INSERT INTO emis_historical_import_batches
        (school_id,imported_by,source_filename,file_sha256,row_count) VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [schoolId,req.auth.claims.userId,filename,digest,normal.length]);
      for(const row of normal){
        await req.auth.client.query(`INSERT INTO emis_historical_import_rows
          (school_id,batch_id,academic_year,class_name,learners,male,female,sex_unrecorded)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[schoolId,batch.rows[0].id,row.academicYear,row.className,...row.numbers]);
      }
      await audit(req,'EMIS_HISTORICAL_CSV_IMPORTED','EMIS_IMPORT',batch.rows[0].id,{filename,rowCount:normal.length,sha256:digest});
      await close(req,true);
      return res.status(201).json({batchId:batch.rows[0].id,importedRows:normal.length});
    }catch(error){
      if(error?.status===400){await close(req,false);return res.status(400).json({error:error.message});}
      if(error?.code==='23505'){await close(req,false);return res.status(409).json({error:'Historical records from this file have already been imported.'});}
      return fail(req,res,error);
    }
  });

  router.get('/reports/emis-summary.csv', needsPermission('emis.export'), async(req,res)=>{
    try {
      const schoolId=req.auth.claims.schoolId;
      const yearFilter=typeof req.query.academicYear==='string' ? req.query.academicYear.trim() : '';
      if(yearFilter.length>100){await close(req,false);return res.status(400).json({error:'Invalid academic year filter.'});}
      if(!req.auth.account.permissions.includes('students.read')) {
        await close(req,false);
        return res.status(403).json({error:'Learner reporting permission required.'});
      }
      const school=await req.auth.client.query('SELECT name,moe_school_emis_code FROM schools WHERE id=$1',[schoolId]);
      const summary=await req.auth.client.query(`SELECT COALESCE(current_class.academic_year,'Not assigned') AS academic_year,
        COALESCE(current_class.class_name,'Not assigned') AS class_name,
        COUNT(*)::int AS learners,
        COUNT(*) FILTER(WHERE UPPER(TRIM(s.sex)) IN ('MALE','M'))::int AS male,
        COUNT(*) FILTER(WHERE UPPER(TRIM(s.sex)) IN ('FEMALE','F'))::int AS female,
        COUNT(*) FILTER(WHERE s.sex IS NULL OR UPPER(TRIM(s.sex)) NOT IN ('MALE','M','FEMALE','F'))::int AS sex_unrecorded
        FROM students s LEFT JOIN LATERAL (
          SELECT cg.name AS class_name,ay.name AS academic_year FROM class_enrollments ce
          JOIN class_groups cg ON cg.school_id=ce.school_id AND cg.id=ce.class_group_id
          JOIN academic_years ay ON ay.school_id=cg.school_id AND ay.id=cg.academic_year_id
          WHERE ce.school_id=s.school_id AND ce.student_id=s.id AND ce.status='ACTIVE'
          ORDER BY (ay.status='ACTIVE') DESC,ay.starts_on DESC,ce.enrolled_on DESC LIMIT 1
        ) current_class ON true WHERE s.school_id=$1 AND s.status='ACTIVE' AND ($2::text = '' OR COALESCE(current_class.academic_year,'Not assigned')=$2)
        GROUP BY current_class.academic_year,current_class.class_name
        ORDER BY current_class.academic_year,current_class.class_name`,[schoolId,yearFilter]);
      const headers=['school_name','school_emis_code','academic_year','class','active_learners','male','female','sex_not_recorded','template_status'];
      const rows=summary.rows.map(row=>[school.rows[0]?.name,school.rows[0]?.moe_school_emis_code,
        row.academic_year,row.class_name,row.learners,row.male,row.female,row.sex_unrecorded,'DRAFT_NOT_MINISTRY_VERIFIED']);
      await audit(req,'EMIS_DRAFT_AGGREGATE_EXPORTED','SCHOOL',schoolId,{rowCount:rows.length,template:'redeemer-emis-draft-v2',academicYear:yearFilter||'ALL'});
      await close(req,true);
      const csv=[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
      res.setHeader('Content-Type','text/csv; charset=utf-8');
      res.setHeader('Content-Disposition','attachment; filename="redeemer-emis-summary-draft.csv"');
      return res.send(`\uFEFF${csv}\r\n`);
    }catch(error){return fail(req,res,error);}
  });

  router.get('/reports/emis-roster.csv', needsPermission('emis.export'), async (req, res) => {
    try {
      const schoolId = req.auth.claims.schoolId;
      const [school, learners] = await Promise.all([
        req.auth.client.query(`SELECT name, moe_school_emis_code FROM schools WHERE id = $1`, [schoolId]),
        req.auth.client.query(`SELECT s.student_number, s.external_learner_id, s.first_name, s.middle_name, s.last_name,
            s.sex, s.date_of_birth, current_class.class_name, current_class.academic_year, current_class.enrolled_on
          FROM students s
          LEFT JOIN LATERAL (
            SELECT cg.name AS class_name, ay.name AS academic_year, ce.enrolled_on
            FROM class_enrollments ce
            JOIN class_groups cg ON cg.school_id = ce.school_id AND cg.id = ce.class_group_id
            JOIN academic_years ay ON ay.school_id = cg.school_id AND ay.id = cg.academic_year_id
            WHERE ce.school_id = s.school_id AND ce.student_id = s.id AND ce.status = 'ACTIVE'
            ORDER BY (ay.status = 'ACTIVE') DESC, ay.starts_on DESC, ce.enrolled_on DESC
            LIMIT 1
          ) current_class ON true
          WHERE s.school_id = $1 AND s.status = 'ACTIVE'
          ORDER BY s.student_number`, [schoolId]),
      ]);
      if (!school.rowCount) { await close(req, false); return res.status(404).json({ error: 'School record was not found.' }); }
      const headers = ['school_emis_code', 'academic_year', 'learner_id', 'student_number', 'first_name', 'middle_name', 'last_name', 'sex', 'date_of_birth', 'class', 'enrolled_on'];
      const rows = learners.rows.map(row => [school.rows[0].moe_school_emis_code, row.academic_year, row.external_learner_id, row.student_number,
        row.first_name, row.middle_name, row.last_name, row.sex, row.date_of_birth, row.class_name, row.enrolled_on]);
      await audit(req, 'EMIS_DRAFT_LEARNER_ROSTER_EXPORTED', 'SCHOOL', schoolId, { rowCount: rows.length, schoolCodePresent: Boolean(school.rows[0].moe_school_emis_code), mapping: 'redeemer-draft-roster-v1', ministryTemplateVerified: false });
      await close(req, true);
      const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
      const date = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="redeemer-emis-roster-draft-${date}.csv"`);
      return res.send(`\uFEFF${csv}\r\n`);
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/students/:studentId/documents', needsPermission('students.write'), csrf,
    express.raw({ type: ['application/pdf','image/jpeg','image/png'], limit: '10mb' }), async (req, res) => {
      if (!req.auth.account.permissions.includes('students.sensitive.read')) { await close(req, false); return res.status(403).json({ error: 'Restricted learner-document access is required to upload records.' }); }
      const key = studentDocumentEncryptionKey();
      if (!key) { await close(req, false); return res.status(503).json({ error: 'Encrypted document storage is not configured for this environment.' }); }
      const mediaType = String(req.get('content-type') || '').split(';',1)[0].trim().toLowerCase();
      const isPdf = mediaType === 'application/pdf' && Buffer.isBuffer(req.body) && req.body.length >= 8 && req.body.subarray(0, 5).equals(Buffer.from('%PDF-'));
      const isJpeg = mediaType === 'image/jpeg' && Buffer.isBuffer(req.body) && req.body.length >= 4 && req.body[0] === 0xff && req.body[1] === 0xd8 && req.body[2] === 0xff;
      const isPng = mediaType === 'image/png' && Buffer.isBuffer(req.body) && req.body.length >= 8 && req.body.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
      if (!isPdf && !isJpeg && !isPng) { await close(req, false); return res.status(400).json({ error: 'Choose a valid PDF, JPG, or PNG file under 10 MB.' }); }
      const title = text(req.query.title, 120); const categoryId = text(req.query.categoryId, 50) || null;
      const originalFilename = text(req.query.fileName, 255).replace(/[\\/]/g, '_').replace(/[\u0000-\u001f\u007f]/g, '').trim();
      const visibility = text(req.query.visibility, 30).toUpperCase() || 'RESTRICTED';
      if (!title || !originalFilename || visibility !== 'RESTRICTED') { await close(req, false); return res.status(400).json({ error: 'Enter a document title and file name. Learner documents must remain restricted to authorized school staff.' }); }
      try {
        if (!await hasStudentDocumentStorageSchema(req.auth.client)) { await close(req, false); return res.status(503).json({ error: 'The student-document database migration must be applied before uploads can be used.' }); }
        const schoolId = req.auth.claims.schoolId; const studentId = req.params.studentId; const documentId = randomUUID();
        if (isJpeg || isPng) {
          if (req.body.length > 3 * 1024 * 1024) { await close(req, false); return res.status(400).json({ error: 'Student photograph must be 3 MB or smaller.' }); }
          const photoCategory = await req.auth.client.query("SELECT id FROM document_categories WHERE school_id=$1 AND id=$2 AND code='STUDENT_PHOTO'", [schoolId,categoryId]);
          if (!photoCategory.rowCount) { await close(req, false); return res.status(400).json({ error: 'Select the Student identification photograph category for photo uploads.' }); }
        }
        if (isJpeg || isPng) {
          // Serialize photograph replacement with ID issuance for this learner.
          const exists = await req.auth.client.query(
            'SELECT id FROM students WHERE school_id=$1 AND id=$2 FOR UPDATE',
            [schoolId,studentId]);
          if (!exists.rowCount) { await close(req,false); return res.status(404).json({error:'Student record not found.'}); }
        }
        const checksum = createHash('sha256').update(req.body).digest('hex');
        const associatedData = `${schoolId}:${studentId}:${documentId}`;
        const encrypted = encryptStudentDocument(req.body, key, associatedData);
        const result = await req.auth.client.query(`INSERT INTO student_documents
            (id,school_id,student_id,category_id,title,object_storage_key,original_filename,media_type,size_bytes,checksum_sha256,visibility,uploaded_by,file_content,content_nonce,content_auth_tag)
          SELECT $1,st.school_id,st.id,c.id,$5,$6,$7,$15,$8,$9,$10,$11,$12,$13,$14
          FROM students st LEFT JOIN document_categories c ON c.school_id=st.school_id AND c.id=$4
          WHERE st.school_id=$2 AND st.id=$3 AND ($4::uuid IS NULL OR c.id IS NOT NULL)
          RETURNING id,title,original_filename,media_type,size_bytes,checksum_sha256,visibility,uploaded_at`,
        [documentId,schoolId,studentId,categoryId,title,`db-encrypted:${documentId}`,originalFilename,req.body.length,checksum,visibility,req.auth.claims.userId,encrypted.content,encrypted.nonce,encrypted.authTag,mediaType]);
        if (!result.rowCount) { await close(req, false); return res.status(400).json({ error: 'The learner or document category was not found in this school.' }); }
        if (isJpeg || isPng) {
          // The newly uploaded portrait becomes the active photo. Remove older
          // learner portraits from normal access while retaining audit records.
          await req.auth.client.query(`UPDATE student_documents
            SET deleted_at=now()
            WHERE school_id=$1 AND student_id=$2 AND category_id=$3
              AND id<>$4 AND deleted_at IS NULL`,[schoolId,studentId,categoryId,documentId]);
          await revokeDigitalIdForPortraitChange(req,schoolId,studentId,'STUDENT_PHOTO_CHANGED');
        }
        await audit(req,'STUDENT_DOCUMENT_UPLOADED','STUDENT_DOCUMENT',documentId,{studentId,title,categoryId,visibility,sizeBytes:req.body.length,checksum});
        return done(req,res,201,{document:result.rows[0]});
      } catch (error) { return fail(req, res, error); }
    });

  router.get('/students/:studentId/documents/:documentId/content', needsPermission('students.read'), async (req, res) => {
    if (!req.auth.account.permissions.includes('students.sensitive.read')) { await close(req, false); return res.status(403).json({ error: 'Restricted learner-document access is required to open this file.' }); }
    const key = studentDocumentEncryptionKey();
    if (!key) { await close(req, false); return res.status(503).json({ error: 'Encrypted document storage is not configured for this environment.' }); }
    try {
      if (!await hasStudentDocumentStorageSchema(req.auth.client)) { await close(req, false); return res.status(503).json({ error: 'The student-document database migration must be applied before files can be opened.' }); }
      const schoolId = req.auth.claims.schoolId; const studentId = req.params.studentId; const documentId = req.params.documentId;
      const result = await req.auth.client.query(`SELECT id,title,original_filename,media_type,size_bytes,checksum_sha256,file_content,content_nonce,content_auth_tag
        FROM student_documents WHERE school_id=$1 AND student_id=$2 AND id=$3 AND deleted_at IS NULL`,[schoolId,studentId,documentId]);
      if (!result.rowCount) { await close(req,false); return res.status(404).json({error:'The document was not found for this learner.'}); }
      const document = result.rows[0];
      if (!document.file_content || !document.content_nonce || !document.content_auth_tag) { await close(req,false); return res.status(410).json({error:'This older document has no encrypted database copy and cannot be opened here.'}); }
      const plaintext = decryptStudentDocument(document,key,`${schoolId}:${studentId}:${documentId}`);
      if (createHash('sha256').update(plaintext).digest('hex') !== document.checksum_sha256) { await close(req,false); return res.status(500).json({error:'Document integrity verification failed. Ask the school administrator for help.'}); }
      await audit(req,'STUDENT_DOCUMENT_DOWNLOADED','STUDENT_DOCUMENT',documentId,{studentId,sizeBytes:Number(document.size_bytes)});
      await close(req,true);
      const filename = String(document.original_filename).replace(/[\\"\r\n]/g,'_');
      const asciiFilename = filename.replace(/[^\x20-\x7e]/g,'_');
      res.setHeader('Cache-Control','no-store, private'); res.setHeader('Content-Type',document.media_type);
      res.setHeader('Content-Disposition',`${req.query.disposition === 'inline' && ['image/jpeg','image/png'].includes(document.media_type) ? 'inline' : 'attachment'}; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader('Content-Length',String(plaintext.length));
      return res.send(plaintext);
    } catch (error) { return fail(req,res,error); }
  });

  router.post('/students/:studentId/documents/:documentId/delete', needsPermission('students.write'), csrf, async (req,res) => {
    if (!req.auth.account.permissions.includes('students.sensitive.read')) { await close(req,false); return res.status(403).json({error:'Restricted learner-document access is required to remove this file.'}); }
    try {
      const schoolId=req.auth.claims.schoolId; const studentId=req.params.studentId; const documentId=req.params.documentId;
      const studentLock=await req.auth.client.query('SELECT id FROM students WHERE school_id=$1 AND id=$2 FOR UPDATE',[schoolId,studentId]);
      if(!studentLock.rowCount){await close(req,false);return res.status(404).json({error:'Student not found.'});}
      const result=await req.auth.client.query(`UPDATE student_documents d SET deleted_at=now()
        FROM document_categories category
        WHERE d.school_id=$1 AND d.student_id=$2 AND d.id=$3 AND d.deleted_at IS NULL
          AND category.school_id=d.school_id AND category.id=d.category_id
        RETURNING d.id,d.title,category.code AS category_code`,[schoolId,studentId,documentId]);
      if(!result.rowCount){await close(req,false);return res.status(404).json({error:'The document was not found for this learner.'});}
      if(result.rows[0].category_code==='STUDENT_PHOTO') await revokeDigitalIdForPortraitChange(req,schoolId,studentId,'STUDENT_PHOTO_REMOVED');
      await audit(req,'STUDENT_DOCUMENT_SOFT_DELETED','STUDENT_DOCUMENT',documentId,{studentId,title:result.rows[0].title});
      return done(req,res,200,{deleted:true});
    } catch(error){return fail(req,res,error);}
  });

  router.post('/students/:studentId/transfer', needsPermission('students.write'), csrf, async (req, res) => {
    const classGroupId = text(req.body?.classGroupId, 50);
    const reason = text(req.body?.reason, 500);
    const effectiveOn = req.body?.effectiveOn || new Date().toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    if (!classGroupId || !reason || !validDate(effectiveOn) || effectiveOn > today) {
      await close(req, false);
      return res.status(400).json({ error: 'Choose the destination class, provide a reason, and enter a valid effective date no later than today.' });
    }
    try {
      const schoolId = req.auth.claims.schoolId;
      const student = await req.auth.client.query(`SELECT id FROM students WHERE school_id=$1 AND id=$2 FOR UPDATE`, [schoolId, req.params.studentId]);
      if (!student.rowCount) { await close(req, false); return res.status(404).json({ error: 'Student not found in this school.' }); }
      const current = await req.auth.client.query(`SELECT ce.class_group_id, ce.enrolled_on, cg.academic_year_id, cg.campus_id, cg.name AS class_name
        FROM class_enrollments ce JOIN class_groups cg ON cg.school_id=ce.school_id AND cg.id=ce.class_group_id
        WHERE ce.school_id=$1 AND ce.student_id=$2 AND ce.status='ACTIVE' FOR UPDATE OF ce`, [schoolId, req.params.studentId]);
      if (!current.rowCount) { await close(req, false); return res.status(409).json({ error: 'This learner has no active class enrollment to transfer.' }); }
      if (current.rowCount !== 1) { await close(req, false); return res.status(409).json({ error: 'Multiple active class enrollments were found. A school administrator must resolve this inconsistency before transfer.' }); }
      const from = current.rows[0];
      if (String(from.class_group_id) === classGroupId) { await close(req, false); return res.status(400).json({ error: 'Choose a different destination class.' }); }
      if (effectiveOn < String(from.enrolled_on).slice(0, 10)) { await close(req, false); return res.status(400).json({ error: 'The transfer date cannot be before the current class enrollment date.' }); }
      const openHistory = await req.auth.client.query(`SELECT effective_on FROM student_enrollment_history
        WHERE school_id=$1 AND student_id=$2 AND class_group_id=$3 AND ended_on IS NULL ORDER BY effective_on DESC LIMIT 1 FOR UPDATE`, [schoolId, req.params.studentId, from.class_group_id]);
      if (openHistory.rowCount && effectiveOn < String(openHistory.rows[0].effective_on).slice(0, 10)) { await close(req, false); return res.status(400).json({ error: 'The transfer date cannot be before the recorded start of this class enrollment.' }); }
      const target = await req.auth.client.query(`SELECT id, name, academic_year_id, campus_id FROM class_groups
        WHERE school_id=$1 AND id=$2 FOR UPDATE`, [schoolId, classGroupId]);
      if (!target.rowCount) { await close(req, false); return res.status(400).json({ error: 'Choose a destination class belonging to this school.' }); }
      const oldEnrollment = await req.auth.client.query(`UPDATE class_enrollments SET status='COMPLETED'
        WHERE school_id=$1 AND student_id=$2 AND class_group_id=$3 AND status='ACTIVE' RETURNING class_group_id`, [schoolId, req.params.studentId, from.class_group_id]);
      if (!oldEnrollment.rowCount) { await close(req, false); return res.status(409).json({ error: 'The learner’s class changed while this form was open. Refresh and try again.' }); }
      await req.auth.client.query(`INSERT INTO class_enrollments (school_id,student_id,class_group_id,enrolled_on,status)
        VALUES($1,$2,$3,$4,'ACTIVE') ON CONFLICT (school_id,student_id,class_group_id)
        DO UPDATE SET enrolled_on=EXCLUDED.enrolled_on,status='ACTIVE'`, [schoolId, req.params.studentId, classGroupId, effectiveOn]);
      const closedHistory = await req.auth.client.query(`UPDATE student_enrollment_history SET status='TRANSFERRED_OUT',ended_on=$4,reason=$5
        WHERE school_id=$1 AND student_id=$2 AND class_group_id=$3 AND ended_on IS NULL RETURNING id`, [schoolId, req.params.studentId, from.class_group_id, effectiveOn, reason]);
      if (!closedHistory.rowCount) {
        await req.auth.client.query(`INSERT INTO student_enrollment_history
          (school_id,student_id,academic_year_id,campus_id,class_group_id,status,effective_on,ended_on,reason,recorded_by)
          VALUES($1,$2,$3,$4,$5,'TRANSFERRED_OUT',$6,$7,$8,$9)`,
        [schoolId, req.params.studentId, from.academic_year_id, from.campus_id, from.class_group_id, String(from.enrolled_on).slice(0, 10), effectiveOn, reason, req.auth.claims.userId]);
      }
      await req.auth.client.query(`INSERT INTO student_enrollment_history
        (school_id,student_id,academic_year_id,campus_id,class_group_id,status,effective_on,reason,recorded_by)
        VALUES($1,$2,$3,$4,$5,'TRANSFERRED_IN',$6,$7,$8)`,
      [schoolId, req.params.studentId, target.rows[0].academic_year_id, target.rows[0].campus_id, target.rows[0].id, effectiveOn, reason, req.auth.claims.userId]);
      await audit(req, 'STUDENT_CLASS_TRANSFERRED', 'STUDENT', req.params.studentId, { fromClassId: from.class_group_id, toClassId: target.rows[0].id, effectiveOn, reason });
      return done(req, res, 200, { transfer: { fromClass: from.class_name, toClass: target.rows[0].name, effectiveOn } });
    } catch (error) { return fail(req, res, error); }
  });

  // Explicit migration gate: never show a broken admissions workspace when migration 102 is absent.
  async function entranceExamSchemaReady(req) {
    const result = await req.auth.client.query(
      "SELECT to_regclass('public.admission_entrance_exams') IS NOT NULL AND to_regclass('public.admission_exam_assignments') IS NOT NULL AS ready"
    );
    return result.rows[0]?.ready === true;
  }
  async function requireEntranceExamSchema(req,res) {
    if(await entranceExamSchemaReady(req)) return true;
    await close(req,false);
    res.status(503).json({error:'Entrance examination storage is awaiting the reviewed migration 102. Existing admissions remain available.',migrationRequired:'102_admission_entrance_exams.sql'});
    return false;
  }

  // Entrance examination sessions are private admissions records, never public announcements.
  // Migration 102 must be separately approved and applied in staging before use.
  router.get('/admissions/entrance-exams', needsPermission('admissions.read'), async (req,res)=>{
    try {
      if(!await requireEntranceExamSchema(req,res)) return;
      const schoolId=req.auth.claims.schoolId;
      const result=await req.auth.client.query(`SELECT e.id,e.title,e.grade_label,e.mode,e.starts_at,e.ends_at,e.venue,e.status,e.created_at,
        (SELECT count(*)::int FROM admission_exam_assignments a WHERE a.school_id=e.school_id AND a.exam_id=e.id) AS applicant_count
        FROM admission_entrance_exams e WHERE e.school_id=$1 ORDER BY e.starts_at DESC LIMIT 150`,[schoolId]);
      return done(req,res,200,{exams:result.rows});
    } catch(error){return fail(req,res,error);}
  });

  router.post('/admissions/entrance-exams',needsPermission('admissions.write'),csrf,async(req,res)=>{
    const title=text(req.body?.title,160),gradeLabel=text(req.body?.gradeLabel,100);
    const mode=text(req.body?.mode,20).toUpperCase(),venue=text(req.body?.venue,200);
    const start=new Date(req.body?.startsAt),end=new Date(req.body?.endsAt);
    if(title.length<3||!gradeLabel||!['PAPER','ONLINE','INTERVIEW'].includes(mode)||!venue||
       !Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||
       start.getTime()<Date.now()-60000||end.getTime()-start.getTime()>8*60*60*1000){
      await close(req,false);
      return res.status(400).json({error:'Provide an exam title, grade, mode, venue, and a future session lasting at most eight hours.'});
    }
    try {
      if(!await requireEntranceExamSchema(req,res)) return;
      const schoolId=req.auth.claims.schoolId,id=randomUUID();
      const result=await req.auth.client.query(`INSERT INTO admission_entrance_exams
        (id,school_id,title,grade_label,mode,starts_at,ends_at,venue,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id,title,grade_label,mode,starts_at,ends_at,venue,status`,
        [id,schoolId,title,gradeLabel,mode,start.toISOString(),end.toISOString(),venue,req.auth.claims.userId]);
      await audit(req,'ENTRANCE_EXAM_DRAFT_CREATED','ADMISSION_ENTRANCE_EXAM',id,{mode,gradeLabel});
      return done(req,res,201,{exam:result.rows[0]});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/admissions/entrance-exams/:examId/assign',needsPermission('admissions.write'),csrf,async(req,res)=>{
    const examId=req.params.examId,applicationId=text(req.body?.applicationId,60);
    if(!/^[0-9a-f-]{36}$/i.test(examId)||!/^[0-9a-f-]{36}$/i.test(applicationId)){
      await close(req,false);return res.status(400).json({error:'Valid exam and application IDs are required.'});
    }
    try {
      if(!await requireEntranceExamSchema(req,res)) return;
      const schoolId=req.auth.claims.schoolId;
      const assigned=await req.auth.client.query(`INSERT INTO admission_exam_assignments(school_id,exam_id,application_id)
        SELECT $1,e.id,a.id FROM admission_entrance_exams e
        JOIN admission_applications a ON a.school_id=e.school_id AND a.id=$3
        WHERE e.school_id=$1 AND e.id=$2 AND e.status IN ('DRAFT','SCHEDULED')
          AND a.status NOT IN ('REJECTED','WITHDRAWN','ENROLLED')
        ON CONFLICT(school_id,exam_id,application_id) DO NOTHING
        RETURNING id,exam_id,application_id,status`,[schoolId,examId,applicationId]);
      if(!assigned.rowCount){await close(req,false);return res.status(409).json({error:'Assignment already exists, or the examination or applicant is not eligible.'});}
      await audit(req,'ENTRANCE_EXAM_APPLICANT_ASSIGNED','ADMISSION_APPLICATION',applicationId,{examId});
      return done(req,res,201,{assignment:assigned.rows[0]});
    }catch(error){return fail(req,res,error);}
  });

  // Drafts become scheduled only after at least one applicant is assigned.
  // Scheduling does not send email/SMS or publish any identifying information.
  router.post('/admissions/entrance-exams/:examId/schedule',needsPermission('admissions.write'),csrf,async(req,res)=>{
    const examId=req.params.examId;
    if(!/^[0-9a-f-]{36}$/i.test(examId)){await close(req,false);return res.status(400).json({error:'Valid examination ID is required.'});}
    try{
      if(!await requireEntranceExamSchema(req,res)) return;
      const schoolId=req.auth.claims.schoolId;
      const updated=await req.auth.client.query(`UPDATE admission_entrance_exams e
        SET status='SCHEDULED'
        WHERE e.school_id=$1 AND e.id=$2 AND e.status='DRAFT' AND e.starts_at>now()
          AND EXISTS(SELECT 1 FROM admission_exam_assignments a WHERE a.school_id=e.school_id AND a.exam_id=e.id)
        RETURNING e.id,e.title,e.starts_at,e.ends_at,e.status`,[schoolId,examId]);
      if(!updated.rowCount){await close(req,false);return res.status(409).json({error:'Schedule a future draft with at least one assigned applicant. Cancelled or already scheduled sessions cannot be rescheduled here.'});}
      await audit(req,'ENTRANCE_EXAM_SCHEDULED','ADMISSION_ENTRANCE_EXAM',examId,{});
      return done(req,res,200,{exam:updated.rows[0]});
    }catch(error){return fail(req,res,error);}
  });

  // Finance-only entrance examination fees. Migration 103 is intentionally separate
  // from scheduling migration 102 and is never applied during a frontend deploy.
  async function examFeeSchemaReady(req) {
    const found=await req.auth.client.query("SELECT to_regclass('public.admission_exam_fee_schedules') IS NOT NULL AND to_regclass('public.admission_exam_fee_settlements') IS NOT NULL AS ready");
    return found.rows[0]?.ready === true;
  }
  async function requireExamFeeSchema(req,res) {
    if(await examFeeSchemaReady(req)) return true;
    await close(req,false);
    res.status(503).json({error:'Entrance examination fees are awaiting verified migration 103.',migrationRequired:'103_admission_exam_fees.sql'});
    return false;
  }
  // Staff-only eligibility preview. Exam-taking endpoints must independently enforce the same
  // server-side conditions when added; this read endpoint does not grant a sitting credential.
  router.get('/admissions/entrance-exams/:examId/eligibility',needsPermission('admissions.read'),async(req,res)=>{
    const examId=text(req.params.examId,50);
    if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(examId)){
      await close(req,false);return res.status(400).json({error:'Valid examination ID required.'});
    }
    try{
      if(!await requireExamFeeSchema(req,res)) return;
      const schoolId=req.auth.claims.schoolId;
      const exam=await req.auth.client.query(`SELECT id,title,status,starts_at,ends_at
        FROM admission_entrance_exams WHERE school_id=$1 AND id=$2`,[schoolId,examId]);
      if(!exam.rowCount){await close(req,false);return res.status(404).json({error:'Examination not found.'});}
      const candidates=await req.auth.client.query(`SELECT a.application_id,app.application_number,
        app.first_name,app.last_name,app.status AS application_status,a.status AS assignment_status,
        f.amount::text AS fee_amount,f.currency,
        s.kind AS settlement_kind,s.reference AS settlement_reference,
        CASE WHEN e.status <> 'SCHEDULED' THEN 'EXAM_NOT_SCHEDULED'
          WHEN app.status IN ('REJECTED','WITHDRAWN','ENROLLED') THEN 'APPLICATION_INACTIVE'
          WHEN a.status <> 'INVITED' THEN 'ASSIGNMENT_NOT_INVITED'
          WHEN f.exam_id IS NULL THEN 'FEE_NOT_CONFIGURED'
          WHEN f.amount > 0 AND s.id IS NULL THEN 'PAYMENT_REQUIRED'
          WHEN f.amount > 0 AND s.kind = 'PAYMENT' AND
            (s.amount <> f.amount OR s.currency <> f.currency) THEN 'PAYMENT_MISMATCH'
          WHEN f.amount > 0 AND s.kind NOT IN ('PAYMENT','WAIVER') THEN 'PAYMENT_REQUIRED'
          ELSE 'ELIGIBLE' END AS eligibility_status
        FROM admission_exam_assignments a
        JOIN admission_entrance_exams e ON e.school_id=a.school_id AND e.id=a.exam_id
        JOIN admission_applications app ON app.school_id=a.school_id AND app.id=a.application_id
        LEFT JOIN admission_exam_fee_schedules f ON f.school_id=a.school_id AND f.exam_id=a.exam_id
        LEFT JOIN admission_exam_fee_settlements s ON s.school_id=a.school_id AND s.exam_id=a.exam_id AND s.application_id=a.application_id
        WHERE a.school_id=$1 AND a.exam_id=$2
        ORDER BY app.application_number LIMIT 500`,[schoolId,examId]);
      return done(req,res,200,{exam:exam.rows[0],candidates:candidates.rows,
        note:'Staff-only eligibility preview; examination sitting is not yet enabled.'});
    }catch(error){return fail(req,res,error);}
  });

  router.get('/finance/entrance-exam-fees',needsPermission('finance.read'),async(req,res)=>{
    try {
      if(!await requireExamFeeSchema(req,res)) return;
      const schoolId=req.auth.claims.schoolId;
      const [fees,settlements,assignments]=await Promise.all([
        req.auth.client.query(`SELECT e.id AS exam_id,e.title,e.starts_at,e.status,e.grade_label,
          f.amount::text,f.currency,
          (SELECT count(*)::int FROM admission_exam_assignments a WHERE a.school_id=e.school_id AND a.exam_id=e.id) AS applicant_count
          FROM admission_entrance_exams e LEFT JOIN admission_exam_fee_schedules f
          ON f.school_id=e.school_id AND f.exam_id=e.id
          WHERE e.school_id=$1 ORDER BY e.starts_at DESC LIMIT 150`,[schoolId]),
        req.auth.client.query(`SELECT s.id,s.exam_id,s.application_id,s.kind,s.channel,s.amount::text,s.currency,s.reference,s.verified_at,
          a.application_number,a.first_name,a.last_name
          FROM admission_exam_fee_settlements s JOIN admission_applications a ON a.school_id=s.school_id AND a.id=s.application_id
          WHERE s.school_id=$1 ORDER BY s.verified_at DESC LIMIT 250`,[schoolId]),
        req.auth.client.query(`SELECT x.exam_id,x.application_id,a.application_number,a.first_name,a.last_name,
          (settled.id IS NOT NULL) AS settled
          FROM admission_exam_assignments x
          JOIN admission_applications a ON a.school_id=x.school_id AND a.id=x.application_id
          LEFT JOIN admission_exam_fee_settlements settled ON settled.school_id=x.school_id
            AND settled.exam_id=x.exam_id AND settled.application_id=x.application_id
          WHERE x.school_id=$1 ORDER BY a.application_number LIMIT 500`,[schoolId])
      ]);
      return done(req,res,200,{fees:fees.rows,settlements:settlements.rows,assignments:assignments.rows});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/finance/entrance-exams/:examId/fee',needsPermission('finance.write'),csrf,async(req,res)=>{
    const examId=req.params.examId,currency=text(req.body?.currency,3).toUpperCase();
    const rawAmount=String(req.body?.amount??'');
    if(!/^[0-9]{1,7}(?:\.[0-9]{1,2})?$/.test(rawAmount)||Number(rawAmount)>1000000||!['LRD','USD'].includes(currency)||!/^[0-9a-f-]{36}$/i.test(examId)){
      await close(req,false);return res.status(400).json({error:'Provide a valid nonnegative amount (maximum 1,000,000) and LRD or USD currency.'});
    }
    try{
      if(!await requireExamFeeSchema(req,res)) return;
      const schoolId=req.auth.claims.schoolId;
      const inserted=await req.auth.client.query(`INSERT INTO admission_exam_fee_schedules(school_id,exam_id,amount,currency,configured_by)
        SELECT $1,e.id,$3::numeric,$4,$5 FROM admission_entrance_exams e
        WHERE e.school_id=$1 AND e.id=$2 AND e.status IN ('DRAFT','SCHEDULED') AND e.starts_at>now()
          AND NOT EXISTS (SELECT 1 FROM admission_exam_fee_settlements s WHERE s.school_id=e.school_id AND s.exam_id=e.id)
        ON CONFLICT(school_id,exam_id) DO UPDATE SET amount=EXCLUDED.amount,currency=EXCLUDED.currency,
          configured_by=EXCLUDED.configured_by,configured_at=now()
        RETURNING exam_id,amount::text,currency`,[schoolId,examId,rawAmount,currency,req.auth.claims.userId]);
      if(!inserted.rowCount){await close(req,false);return res.status(409).json({error:'Fee can only be configured for a future draft or scheduled examination before any payment or waiver is recorded.'});}
      await audit(req,'ENTRANCE_EXAM_FEE_CONFIGURED','ADMISSION_ENTRANCE_EXAM',examId,{amount:rawAmount,currency});
      return done(req,res,200,{fee:inserted.rows[0]});
    }catch(error){return fail(req,res,error);}
  });

  // Cash/bank evidence must be independently verified by Finance before this action.
  // Mobile Money is NOT permitted here: provider-signed confirmation will require a separate integration.
  router.post('/finance/entrance-exams/:examId/applicants/:applicationId/settlement',needsPermission('finance.write'),csrf,async(req,res)=>{
    const examId=req.params.examId,applicationId=req.params.applicationId;
    const kind=text(req.body?.kind,12).toUpperCase(),channel=text(req.body?.channel,30).toUpperCase();
    const reference=text(req.body?.reference,120),reason=text(req.body?.reason,500);
    const confirmed=req.body?.verifiedEvidence===true;
    if(!/^[0-9a-f-]{36}$/i.test(examId)||!/^[0-9a-f-]{36}$/i.test(applicationId)||
       !['PAYMENT','WAIVER'].includes(kind)||!(kind==='WAIVER'?channel==='WAIVER'&&reason.length>=10:['CASH','BANK_TRANSFER'].includes(channel))||
       reference.length<3||!confirmed){
      await close(req,false);return res.status(400).json({error:'Enter a valid applicant, verified cash/bank payment reference (with Finance confirmation), or a waiver with a detailed reason. MTN Mobile Money cannot be manually marked paid.'});
    }
    try{
      if(!await requireExamFeeSchema(req,res)) return;
      const schoolId=req.auth.claims.schoolId;
      const record=await req.auth.client.query(`INSERT INTO admission_exam_fee_settlements
        (school_id,exam_id,application_id,kind,channel,amount,currency,reference,reason,verified_by)
        SELECT $1,assign.exam_id,assign.application_id,$4,$5,
          CASE WHEN $4='WAIVER' THEN 0 ELSE fees.amount END,fees.currency,$6,NULLIF($7,''),$8
        FROM admission_exam_assignments assign
        JOIN admission_exam_fee_schedules fees ON fees.school_id=assign.school_id AND fees.exam_id=assign.exam_id
        WHERE assign.school_id=$1 AND assign.exam_id=$2 AND assign.application_id=$3
          AND fees.amount>0 AND assign.status IN ('INVITED','ATTENDED')
        ON CONFLICT(school_id,exam_id,application_id) DO NOTHING
        RETURNING id,exam_id,application_id,kind,channel,amount::text,currency,reference,verified_at`,
        [schoolId,examId,applicationId,kind,channel,reference,reason,req.auth.claims.userId]);
      if(!record.rowCount){await close(req,false);return res.status(409).json({error:'Exam fee or eligible assignment missing, or a settlement was already recorded.'});}
      await audit(req,'ENTRANCE_EXAM_FEE_SETTLED','ADMISSION_APPLICATION',applicationId,{examId,kind,channel,reference});
      return done(req,res,201,{settlement:record.rows[0]});
    }catch(error){return fail(req,res,error);}
  });

  // Allow authorized staff to correct mistaken timezone entry before the session begins.
  // Existing applicant assignments and payment references remain unchanged.
  router.post('/admissions/entrance-exams/:examId/reschedule',needsPermission('admissions.write'),csrf,async(req,res)=>{
    const examId=req.params.examId;
    const startText=text(req.body?.startsAt,40),endText=text(req.body?.endsAt,40);
    const validInstant=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const start=new Date(startText),end=new Date(endText);
    if(!/^[0-9a-f-]{36}$/i.test(examId)||!validInstant.test(startText)||!validInstant.test(endText)||
       !Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||
       start.getTime()<Date.now()||end.getTime()-start.getTime()>8*60*60*1000){
      await close(req,false);return res.status(400).json({error:'Choose a future exam date and valid Liberia times, at most eight hours apart.'});
    }
    try{
      if(!await requireEntranceExamSchema(req,res)) return;
      const schoolId=req.auth.claims.schoolId;
      const updated=await req.auth.client.query(`UPDATE admission_entrance_exams e
        SET starts_at=$3,ends_at=$4
        WHERE e.school_id=$1 AND e.id=$2 AND e.status IN ('DRAFT','SCHEDULED')
          AND e.starts_at>now()
          AND NOT EXISTS(SELECT 1 FROM admission_exam_assignments a
            WHERE a.school_id=e.school_id AND a.exam_id=e.id
              AND (a.status IN ('ATTENDED','COMPLETED') OR a.score IS NOT NULL))
        RETURNING id,title,starts_at,ends_at,status`,
        [schoolId,examId,start.toISOString(),end.toISOString()]);
      if(!updated.rowCount){await close(req,false);return res.status(409).json({error:'Only future drafts or scheduled sessions with no attendance or grades can be corrected.'});}
      await audit(req,'ENTRANCE_EXAM_TIME_CORRECTED','ADMISSION_ENTRANCE_EXAM',examId,{startsAt:start.toISOString(),endsAt:end.toISOString()});
      return done(req,res,200,{exam:updated.rows[0]});
    }catch(error){return fail(req,res,error);}
  });

  // Admissions, HR, stock control, and school announcements use the same
  // tenant-scoped transaction and audit trail as the academic workspaces.
  router.get('/admissions', needsPermission('admissions.read'), async (req, res) => {
    try {
      const schoolId = req.auth.claims.schoolId;
      const applications = await req.auth.client.query(`SELECT a.id, a.application_number, a.application_source, a.first_name, a.middle_name, a.last_name,
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
            'actor', COALESCE(actor.full_name,'Public admissions form'), 'details', ae.details) ORDER BY ae.occurred_at DESC) AS items
          FROM admission_events ae LEFT JOIN user_accounts actor ON actor.school_id = ae.school_id AND actor.id = ae.actor_user_id
          WHERE ae.school_id = a.school_id AND ae.application_id = a.id
        ) event_rows ON true
        WHERE a.school_id = $1 ORDER BY a.application_date DESC, a.created_at DESC LIMIT 500`, [schoolId]);
      const options = await req.auth.client.query(`SELECT id, code, name FROM education_levels WHERE school_id = $1 AND active ORDER BY sort_order, name`, [schoolId]);
      const classes = await req.auth.client.query(`SELECT id, name, grade_level FROM class_groups WHERE school_id = $1 ORDER BY grade_level, name`, [schoolId]);
      const canReadDocuments = req.auth.account.permissions.includes('students.sensitive.read');
      const documentStorageReady = canReadDocuments && await hasAdmissionDocumentStorageSchema(req.auth.client) && Boolean(studentDocumentEncryptionKey());
      let documentCategories = [];
      if (documentStorageReady) documentCategories = (await req.auth.client.query(`SELECT id,code,name,required_for_admission FROM document_categories
        WHERE school_id=$1 AND active ORDER BY name`, [schoolId])).rows;
      await close(req, true);
      return res.json({ applications: applications.rows, levels: options.rows, classes: classes.rows,
        canWrite: req.auth.account.permissions.includes('admissions.write'), canReadDocuments, documentStorageReady, documentCategories });
    } catch (error) { return fail(req, res, error); }
  });

  router.get('/admissions/:applicationId/documents', needsPermission('admissions.read'), async (req, res) => {
    if (!req.auth.account.permissions.includes('students.sensitive.read')) { await close(req, false); return res.status(403).json({ error: 'Restricted applicant-document access is required.' }); }
    if (!await hasAdmissionDocumentStorageSchema(req.auth.client)) { await close(req, false); return res.status(503).json({ error: 'Apply the encrypted admission-document migration before opening applicant files.' }); }
    try {
      const schoolId = req.auth.claims.schoolId;
      const result = await req.auth.client.query(`SELECT d.id,d.title,d.original_filename,d.media_type,d.size_bytes,d.checksum_sha256,
          d.uploaded_at,u.full_name AS uploaded_by,c.name AS category_name,
          COALESCE(review.review_status,'PENDING') AS review_status,review.review_note,review.reviewed_at,review.reviewed_by
        FROM admission_documents d
        JOIN admission_applications a ON a.school_id=d.school_id AND a.id=d.application_id
        JOIN user_accounts u ON u.school_id=d.school_id AND u.id=d.uploaded_by
        LEFT JOIN document_categories c ON c.school_id=d.school_id AND c.id=d.category_id
        LEFT JOIN LATERAL (
          SELECT ae.details->>'status' AS review_status,ae.details->>'note' AS review_note,
            ae.occurred_at AS reviewed_at,actor.full_name AS reviewed_by
          FROM admission_events ae JOIN user_accounts actor ON actor.school_id=ae.school_id AND actor.id=ae.actor_user_id
          WHERE ae.school_id=d.school_id AND ae.application_id=d.application_id
            AND ae.event_type='ADMISSION_DOCUMENT_REVIEWED' AND ae.details->>'documentId'=d.id::text
          ORDER BY ae.occurred_at DESC LIMIT 1
        ) review ON true
        WHERE d.school_id=$1 AND a.id=$2 AND d.deleted_at IS NULL ORDER BY d.uploaded_at DESC`, [schoolId, req.params.applicationId]);
      await close(req, true);
      return res.json({ documents: result.rows });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/admissions/:applicationId/documents/:documentId/review', needsPermission('admissions.write'), csrf, async (req,res) => {
    if (!req.auth.account.permissions.includes('students.sensitive.read')) { await close(req,false); return res.status(403).json({error:'Restricted applicant-document access is required to review files.'}); }
    const status=text(req.body?.status,30).toUpperCase();const note=text(req.body?.note,500);
    if(!['VERIFIED','NEEDS_REPLACEMENT'].includes(status)||(status==='NEEDS_REPLACEMENT'&&!note)){await close(req,false);return res.status(400).json({error:'Choose Verified or Needs replacement. A reason is required when requesting a replacement.'});}
    try{
      if(!await hasAdmissionDocumentStorageSchema(req.auth.client)){await close(req,false);return res.status(503).json({error:'Apply migrations 016 and 017 before reviewing applicant files.'});}
      const schoolId=req.auth.claims.schoolId;const applicationId=req.params.applicationId;const documentId=req.params.documentId;
      const document=await req.auth.client.query(`SELECT id,title FROM admission_documents WHERE school_id=$1 AND application_id=$2 AND id=$3 AND deleted_at IS NULL`,[schoolId,applicationId,documentId]);
      if(!document.rowCount){await close(req,false);return res.status(404).json({error:'The document was not found for this application.'});}
      const details={documentId,status,note};
      await req.auth.client.query(`INSERT INTO admission_events (school_id,application_id,event_type,actor_user_id,details) VALUES ($1,$2,'ADMISSION_DOCUMENT_REVIEWED',$3,$4::jsonb)`,[schoolId,applicationId,req.auth.claims.userId,JSON.stringify(details)]);
      await audit(req,'ADMISSION_DOCUMENT_REVIEWED','ADMISSION_DOCUMENT',documentId,{applicationId,title:document.rows[0].title,status,hasNote:Boolean(note)});
      return done(req,res,200,{review:{documentId,status,note}});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/admissions/:applicationId/documents', needsPermission('admissions.write'), csrf,
    express.raw({ type: ['application/pdf','image/jpeg','image/png'], limit: '10mb' }), async (req, res) => {
      if (!req.auth.account.permissions.includes('students.sensitive.read')) { await close(req, false); return res.status(403).json({ error: 'Restricted applicant-document access is required to upload files.' }); }
      const key = studentDocumentEncryptionKey();
      if (!key) { await close(req, false); return res.status(503).json({ error: 'Encrypted document storage is not configured for this environment.' }); }
      const mediaType = String(req.get('content-type') || '').split(';',1)[0].trim().toLowerCase();
      const isPdf = mediaType === 'application/pdf' && Buffer.isBuffer(req.body) && req.body.length >= 8 && req.body.subarray(0, 5).equals(Buffer.from('%PDF-'));
      const isJpeg = mediaType === 'image/jpeg' && Buffer.isBuffer(req.body) && req.body.length >= 4 && req.body[0] === 0xff && req.body[1] === 0xd8 && req.body[2] === 0xff;
      const isPng = mediaType === 'image/png' && Buffer.isBuffer(req.body) && req.body.length >= 8 && req.body.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
      if (!isPdf && !isJpeg && !isPng) { await close(req, false); return res.status(400).json({ error: 'Choose a valid PDF, JPG, or PNG file under 10 MB.' }); }
      const title = text(req.query.title, 120);
      const categoryId = text(req.query.categoryId, 50) || null;
      const originalFilename = text(req.query.fileName, 255).replace(/[\\/]/g, '_').replace(/[\u0000-\u001f\u007f]/g, '').trim();
      if (!title || !originalFilename) { await close(req, false); return res.status(400).json({ error: 'Enter a document title and choose a PDF, JPG, or PNG file.' }); }
      try {
        if (!await hasAdmissionDocumentStorageSchema(req.auth.client)) { await close(req, false); return res.status(503).json({ error: 'Apply migrations 016 and 017 before uploading applicant files.' }); }
        const schoolId = req.auth.claims.schoolId; const applicationId = req.params.applicationId; const documentId = randomUUID();
        const checksum = createHash('sha256').update(req.body).digest('hex');
        const encrypted = encryptStudentDocument(req.body, key, `${schoolId}:admission:${applicationId}:${documentId}`);
        const result = await req.auth.client.query(`INSERT INTO admission_documents
            (id,school_id,application_id,category_id,title,original_filename,media_type,size_bytes,checksum_sha256,file_content,content_nonce,content_auth_tag,uploaded_by)
          SELECT $1,a.school_id,a.id,c.id,$5,$6,$7,$8,$9,$10,$11,$12,$13
          FROM admission_applications a
          LEFT JOIN document_categories c ON c.school_id=a.school_id AND c.id=$4
          WHERE a.school_id=$2 AND a.id=$3 AND ($4::uuid IS NULL OR c.id IS NOT NULL)
          RETURNING id,title,original_filename,media_type,size_bytes,checksum_sha256,uploaded_at`,
        [documentId,schoolId,applicationId,categoryId,title,originalFilename,mediaType,req.body.length,checksum,encrypted.content,encrypted.nonce,encrypted.authTag,req.auth.claims.userId]);
        if (!result.rowCount) { await close(req, false); return res.status(400).json({ error: 'The application or document category was not found in this school.' }); }
        await audit(req,'ADMISSION_DOCUMENT_UPLOADED','ADMISSION_DOCUMENT',documentId,{applicationId,title,categoryId,sizeBytes:req.body.length,checksum});
        return done(req,res,201,{document:result.rows[0]});
      } catch (error) { return fail(req,res,error); }
    });

  router.get('/admissions/:applicationId/documents/:documentId/content', needsPermission('admissions.read'), async (req, res) => {
    if (!req.auth.account.permissions.includes('students.sensitive.read')) { await close(req, false); return res.status(403).json({ error: 'Restricted applicant-document access is required to open this file.' }); }
    const key = studentDocumentEncryptionKey();
    if (!key) { await close(req, false); return res.status(503).json({ error: 'Encrypted document storage is not configured for this environment.' }); }
    try {
      if (!await hasAdmissionDocumentStorageSchema(req.auth.client)) { await close(req, false); return res.status(503).json({ error: 'Apply migrations 016 and 017 before opening applicant files.' }); }
      const schoolId=req.auth.claims.schoolId; const applicationId=req.params.applicationId; const documentId=req.params.documentId;
      const result=await req.auth.client.query(`SELECT id,title,original_filename,media_type,size_bytes,checksum_sha256,file_content,content_nonce,content_auth_tag
        FROM admission_documents WHERE school_id=$1 AND application_id=$2 AND id=$3 AND deleted_at IS NULL`,[schoolId,applicationId,documentId]);
      if (!result.rowCount) { await close(req,false); return res.status(404).json({error:'The document was not found for this application.'}); }
      const document=result.rows[0];
      const plaintext=decryptStudentDocument(document,key,`${schoolId}:admission:${applicationId}:${documentId}`);
      if (createHash('sha256').update(plaintext).digest('hex')!==document.checksum_sha256) { await close(req,false); return res.status(500).json({error:'Document integrity verification failed. Ask the school administrator for help.'}); }
      const inlinePreview = req.query.disposition === 'inline' && ['image/jpeg','image/png'].includes(String(document.media_type));
      await audit(req,inlinePreview?'ADMISSION_DOCUMENT_PREVIEWED':'ADMISSION_DOCUMENT_DOWNLOADED','ADMISSION_DOCUMENT',documentId,{applicationId,sizeBytes:Number(document.size_bytes),mediaType:document.media_type});
      await close(req,true);
      const filename=String(document.original_filename).replace(/[\\"\r\n]/g,'_'); const asciiFilename=filename.replace(/[^\x20-\x7e]/g,'_');
      res.setHeader('Cache-Control','no-store, private');res.setHeader('Content-Type',['application/pdf','image/jpeg','image/png'].includes(String(document.media_type))?String(document.media_type):'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Content-Disposition',`${inlinePreview?'inline':'attachment'}; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader('Content-Length',String(plaintext.length));return res.send(plaintext);
    } catch(error){return fail(req,res,error);}
  });

  router.post('/admissions/:applicationId/documents/:documentId/delete', needsPermission('admissions.write'), csrf, async (req,res) => {
    if (!req.auth.account.permissions.includes('students.sensitive.read')) { await close(req,false); return res.status(403).json({error:'Restricted applicant-document access is required to remove this file.'}); }
    try {
      if (!await hasAdmissionDocumentStorageSchema(req.auth.client)) { await close(req,false); return res.status(503).json({error:'Apply migrations 016 and 017 before managing applicant files.'}); }
      const schoolId=req.auth.claims.schoolId;const applicationId=req.params.applicationId;const documentId=req.params.documentId;
      const result=await req.auth.client.query(`UPDATE admission_documents SET deleted_at=now()
        WHERE school_id=$1 AND application_id=$2 AND id=$3 AND deleted_at IS NULL RETURNING id,title`,[schoolId,applicationId,documentId]);
      if(!result.rowCount){await close(req,false);return res.status(404).json({error:'The document was not found for this application.'});}
      await audit(req,'ADMISSION_DOCUMENT_SOFT_DELETED','ADMISSION_DOCUMENT',documentId,{applicationId,title:result.rows[0].title});
      return done(req,res,200,{deleted:true});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/admissions', needsPermission('admissions.write'), csrf, async (req, res) => {
    const firstName = text(req.body?.firstName); const middleName = text(req.body?.middleName); const lastName = text(req.body?.lastName);
    const applicationNumber = text(req.body?.applicationNumber, 40).toUpperCase();
    const guardianFirst = text(req.body?.guardianFirstName); const guardianLast = text(req.body?.guardianLastName);
    const relationship = text(req.body?.relationship, 50); const phone = text(req.body?.phone, 40); const email = text(req.body?.email, 254).toLowerCase();
    const dateOfBirth = req.body?.dateOfBirth || null; const sex = text(req.body?.sex, 12).toUpperCase(); const notes = text(req.body?.notes, 2000); const levelId = text(req.body?.requestedLevelId, 50) || null;
    const classId = text(req.body?.requestedClassGroupId, 50) || null;
    if (!firstName || !lastName || !applicationNumber || !guardianFirst || !guardianLast || !relationship || (!phone && !email) || (dateOfBirth && !validDate(dateOfBirth)) || (sex && !['F', 'M', 'X', 'UNDISCLOSED'].includes(sex))) {
      await close(req, false); return res.status(400).json({ error: 'Enter the applicant name, unique application number, guardian name and relationship, at least one guardian contact, and valid optional demographic details.' });
    }
    try {
      const schoolId = req.auth.claims.schoolId;
      const application = await req.auth.client.query(`INSERT INTO admission_applications
        (school_id, application_number, first_name, middle_name, last_name, date_of_birth, sex, notes, requested_level_id, requested_class_group_id, created_by)
        SELECT $1, $2, $3, NULLIF($4,''), $5, $6, NULLIF($7,''), NULLIF($8,''), el.id, cg.id, $11 FROM (SELECT 1) seed
        LEFT JOIN education_levels el ON el.school_id = $1 AND el.id = $9 AND el.active
        LEFT JOIN class_groups cg ON cg.school_id = $1 AND cg.id = $10
        WHERE ($9::uuid IS NULL OR el.id IS NOT NULL) AND ($10::uuid IS NULL OR cg.id IS NOT NULL)
        RETURNING id, application_number, first_name, middle_name, last_name, date_of_birth, sex, notes, application_date, status`, [schoolId, applicationNumber, firstName, middleName, lastName, dateOfBirth, sex, notes, levelId, classId, req.auth.claims.userId]);
      if (!application.rowCount) { await close(req, false); return res.status(400).json({ error: 'Choose an education level and class belonging to this school.' }); }
      await req.auth.client.query(`INSERT INTO admission_guardians (school_id, application_id, first_name, last_name, relationship, phone, email, is_primary)
        VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),NULLIF($7,''),true)`, [schoolId, application.rows[0].id, guardianFirst, guardianLast, relationship, phone, email]);
      await req.auth.client.query(`INSERT INTO admission_events (school_id, application_id, event_type, actor_user_id, details) VALUES ($1,$2,'APPLICATION_RECEIVED',$3,$4::jsonb)`, [schoolId, application.rows[0].id, req.auth.claims.userId, JSON.stringify({ status: 'RECEIVED' })]);
      await audit(req, 'ADMISSION_APPLICATION_CREATED', 'ADMISSION_APPLICATION', application.rows[0].id, { applicationNumber, hasDateOfBirth: Boolean(dateOfBirth), hasSex: Boolean(sex), hasNotes: Boolean(notes) });
      return done(req, res, 201, { application: application.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/admissions/:applicationId/status', needsPermission('admissions.write'), csrf, async (req, res) => {
    const status = text(req.body?.status, 30).toUpperCase(); const reason = text(req.body?.reason, 500);
    const interviewer = text(req.body?.interviewer, 120); const interviewNotes = text(req.body?.interviewNotes, 500);
    const interviewTimestamp = typeof req.body?.interviewAt === 'string' ? Date.parse(req.body.interviewAt) : NaN;
    const interviewAt = Number.isFinite(interviewTimestamp) ? new Date(interviewTimestamp).toISOString() : '';
    if (!Object.values(ADMISSION_STATUS_TRANSITIONS).some(transitions => transitions.includes(status)) || (['REJECTED','WAITLISTED'].includes(status) && !reason)) { await close(req, false); return res.status(400).json({ error: 'Choose a valid next status and provide a reason for rejection or waitlisting.' }); }
    if (status === 'INTERVIEW_SCHEDULED' && (!interviewAt || interviewTimestamp <= Date.now() || !interviewer)) { await close(req, false); return res.status(400).json({ error: 'Choose a future interview date and time and enter the interviewer before scheduling.' }); }
    try {
      const id = req.params.applicationId; const schoolId = req.auth.claims.schoolId;
      const current = await req.auth.client.query(`SELECT status, converted_student_id FROM admission_applications WHERE school_id=$1 AND id=$2 FOR UPDATE`, [schoolId, id]);
      if (!current.rowCount) { await close(req, false); return res.status(404).json({ error: 'Application not found in this school.' }); }
      if (current.rows[0].converted_student_id || current.rows[0].status === 'ENROLLED') { await close(req, false); return res.status(409).json({ error: 'An enrolled application cannot be changed. Update the learner record instead.' }); }
      if (!ADMISSION_STATUS_TRANSITIONS[current.rows[0].status]?.includes(status)) { await close(req, false); return res.status(409).json({ error: `That application cannot move from ${current.rows[0].status.replaceAll('_',' ')} to ${status.replaceAll('_',' ')}.` }); }
      const result = await req.auth.client.query(`UPDATE admission_applications SET status = $3, decision = CASE WHEN $3 IN ('OFFERED','ACCEPTED','REJECTED','WAITLISTED') THEN $3 ELSE decision END, decision_reason = NULLIF($4,''), updated_at = now()
        WHERE school_id = $1 AND id = $2 AND status = $5 RETURNING id, application_number, status`, [schoolId, id, status, reason, current.rows[0].status]);
      if (!result.rowCount) { await close(req, false); return res.status(409).json({ error: 'This application changed while you were editing it. Refresh and try again.' }); }
      const eventDetails = status === 'INTERVIEW_SCHEDULED' ? { reason, interviewAt, interviewer, interviewNotes } : { reason };
      await req.auth.client.query(`INSERT INTO admission_events (school_id, application_id, event_type, actor_user_id, details) VALUES ($1,$2,$3,$4,$5::jsonb)`, [schoolId, id, `STATUS_${status}`, req.auth.claims.userId, JSON.stringify(eventDetails)]);
      await audit(req, 'ADMISSION_STATUS_CHANGED', 'ADMISSION_APPLICATION', id, { status, ...(status === 'INTERVIEW_SCHEDULED' ? { interviewAt, interviewer } : {}) });
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
      // Transfer the most recent applicant portrait into the learner's encrypted record.
      // Do not copy unrelated guardian identity images into a student profile.
      const portraitCategory = await req.auth.client.query(
        "SELECT id FROM document_categories WHERE school_id=$1 AND code='STUDENT_PHOTO' LIMIT 1", [schoolId]);
      if (portraitCategory.rowCount) {
        const portrait = await req.auth.client.query(`SELECT id,title,original_filename,media_type,size_bytes,checksum_sha256,
            file_content,content_nonce,content_auth_tag
          FROM admission_documents
          WHERE school_id=$1 AND application_id=$2 AND category_id=$3 AND deleted_at IS NULL
            AND media_type IN ('image/jpeg','image/png')
          ORDER BY uploaded_at DESC LIMIT 1`,
          [schoolId, applicant.id, portraitCategory.rows[0].id]);
        if (portrait.rowCount) {
          const photo = portrait.rows[0];
          const key = studentDocumentEncryptionKey();
          if (!key) throw new Error('Encrypted learner document key is not configured for photo transfer.');
          const plain = decryptStudentDocument(photo,key,`${schoolId}:admission:${applicant.id}:${photo.id}`);
          if (createHash('sha256').update(plain).digest('hex') !== photo.checksum_sha256)
            throw new Error('Applicant portrait failed checksum verification.');
          const newPhotoId = randomUUID();
          const encryptedPhoto = encryptStudentDocument(plain,key,`${schoolId}:${enrolledStudent.id}:${newPhotoId}`);
          await req.auth.client.query(`INSERT INTO student_documents
             (id,school_id,student_id,category_id,title,object_storage_key,original_filename,media_type,size_bytes,
              checksum_sha256,visibility,uploaded_by,file_content,content_nonce,content_auth_tag)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'RESTRICTED',$11,$12,$13,$14)`,
            [newPhotoId,schoolId,enrolledStudent.id,portraitCategory.rows[0].id,'Student photograph',
             `db-encrypted:${newPhotoId}`,photo.original_filename,photo.media_type,plain.length,
             photo.checksum_sha256,req.auth.claims.userId,encryptedPhoto.content,encryptedPhoto.nonce,encryptedPhoto.authTag]);
          await audit(req,'STUDENT_PHOTO_TRANSFERRED','STUDENT_DOCUMENT',newPhotoId,{studentId:enrolledStudent.id,applicationId:applicant.id});
        }
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
      const [items,locations,movements,requests,orders,balances]=await Promise.all([
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
        ,req.auth.client.query(`SELECT m.item_id,m.location_id,COALESCE(sum(CASE WHEN m.movement_type IN ('RECEIPT','TRANSFER_IN') THEN m.quantity WHEN m.movement_type IN ('ISSUE','TRANSFER_OUT') THEN -m.quantity WHEN m.movement_type='ADJUSTMENT' THEN m.quantity ELSE 0 END),0)::numeric AS on_hand
          FROM stock_movements m WHERE m.school_id=$1 GROUP BY m.item_id,m.location_id`,[schoolId])
      ]);
      await close(req,true); return res.json({items:items.rows,locations:locations.rows,movements:movements.rows,requests:requests.rows,orders:orders.rows,balances:balances.rows,canWrite:req.auth.account.permissions.includes('inventory.write'),canApprove:req.auth.account.permissions.includes('inventory.approve')});
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
    try{const schoolId=req.auth.claims.schoolId; if(type==='ISSUE'){await req.auth.client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[`${schoolId}:${itemId}:${locationId}`]);const stock=await req.auth.client.query(`SELECT COALESCE(sum(CASE WHEN movement_type IN ('RECEIPT','TRANSFER_IN') THEN quantity WHEN movement_type IN ('ISSUE','TRANSFER_OUT') THEN -quantity WHEN movement_type='ADJUSTMENT' THEN quantity ELSE 0 END),0) AS on_hand FROM stock_movements WHERE school_id=$1 AND item_id=$2 AND location_id=$3`,[schoolId,itemId,locationId]);if(Number(stock.rows[0].on_hand)<quantity){await close(req,false);return res.status(409).json({error:'Not enough stock is available at this location.'});}}
      const r=await req.auth.client.query(`INSERT INTO stock_movements(school_id,item_id,location_id,movement_type,quantity,reference,reason,recorded_by) SELECT $1,i.id,l.id,$4,$5,NULLIF($6,''),$7,$8 FROM inventory_items i JOIN inventory_locations l ON l.school_id=i.school_id WHERE i.school_id=$1 AND i.id=$2 AND l.id=$3 AND i.active AND l.active RETURNING id,movement_type,quantity,reference,reason,movement_date`,[schoolId,itemId,locationId,type,quantity,reference,reason,req.auth.claims.userId]);if(!r.rowCount){await close(req,false);return res.status(400).json({error:'Choose an active item and location belonging to this school.'});}await audit(req,'INVENTORY_MOVEMENT_RECORDED','STOCK_MOVEMENT',r.rows[0].id,{type,quantity});return done(req,res,201,{movement:r.rows[0]});}catch(error){return fail(req,res,error);}
  });

  router.post('/inventory/transfers', needsPermission('inventory.write'), csrf, async(req,res)=>{
    const itemId=text(req.body?.itemId,50); const fromLocationId=text(req.body?.fromLocationId,50); const toLocationId=text(req.body?.toLocationId,50);
    const quantity=Number(req.body?.quantity); const reason=text(req.body?.reason,500); const requestedReference=text(req.body?.reference,100);
    if(!itemId||!fromLocationId||!toLocationId||fromLocationId===toLocationId||!Number.isFinite(quantity)||quantity<=0||!reason){await close(req,false);return res.status(400).json({error:'Choose one item, different source and destination locations, a positive quantity, and a reason.'});}
    try{
      const schoolId=req.auth.claims.schoolId;
      const valid=await req.auth.client.query(`SELECT i.id AS item_id,source.id AS from_location_id,target.id AS to_location_id
        FROM inventory_items i JOIN inventory_locations source ON source.school_id=i.school_id
        JOIN inventory_locations target ON target.school_id=i.school_id
        WHERE i.school_id=$1 AND i.id=$2 AND i.active AND source.id=$3 AND source.active AND target.id=$4 AND target.active
        FOR UPDATE OF i,source,target`,[schoolId,itemId,fromLocationId,toLocationId]);
      if(!valid.rowCount){await close(req,false);return res.status(400).json({error:'Choose an active item and two active locations belonging to this school.'});}
      await req.auth.client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[`${schoolId}:${itemId}:${fromLocationId}`]);
      const stock=await req.auth.client.query(`SELECT COALESCE(sum(CASE WHEN movement_type IN ('RECEIPT','TRANSFER_IN') THEN quantity WHEN movement_type IN ('ISSUE','TRANSFER_OUT') THEN -quantity WHEN movement_type='ADJUSTMENT' THEN quantity ELSE 0 END),0) AS on_hand
        FROM stock_movements WHERE school_id=$1 AND item_id=$2 AND location_id=$3`,[schoolId,itemId,fromLocationId]);
      if(Number(stock.rows[0]?.on_hand||0)<quantity){await close(req,false);return res.status(409).json({error:'The source location does not have enough stock for this transfer.'});}
      const reference=requestedReference||`TRF-${randomUUID().slice(0,8).toUpperCase()}`;
      const outgoing=await req.auth.client.query(`INSERT INTO stock_movements(school_id,item_id,location_id,movement_type,quantity,reference,reason,recorded_by)
        VALUES($1,$2,$3,'TRANSFER_OUT',$4,$5,$6,$7) RETURNING id,movement_type,quantity,reference,reason,movement_date`,[schoolId,itemId,fromLocationId,quantity,reference,reason,req.auth.claims.userId]);
      const incoming=await req.auth.client.query(`INSERT INTO stock_movements(school_id,item_id,location_id,movement_type,quantity,reference,reason,related_movement_id,recorded_by)
        VALUES($1,$2,$3,'TRANSFER_IN',$4,$5,$6,$7,$8) RETURNING id,movement_type,quantity,reference,reason,movement_date`,[schoolId,itemId,toLocationId,quantity,reference,reason,outgoing.rows[0].id,req.auth.claims.userId]);
      await audit(req,'INVENTORY_STOCK_TRANSFERRED','STOCK_MOVEMENT',outgoing.rows[0].id,{incomingMovementId:incoming.rows[0].id,itemId,fromLocationId,toLocationId,quantity,reference});
      return done(req,res,201,{transfer:{reference,outgoing:outgoing.rows[0],incoming:incoming.rows[0]}});
    }catch(error){return fail(req,res,error);}
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
    try{const schoolId=req.auth.claims.schoolId;const [announcements,deliveries,classes,familyThreads]=await Promise.all([
      req.auth.client.query(`SELECT a.id,a.title,a.body,a.audience,a.status,a.created_at,a.published_at,u.full_name AS author FROM announcements a JOIN user_accounts u ON u.school_id=a.school_id AND u.id=a.created_by WHERE a.school_id=$1 ORDER BY a.created_at DESC LIMIT 200`,[schoolId]),
      req.auth.client.query(`SELECT nd.id,nd.announcement_id,a.title,nd.channel,nd.status,count(*) OVER(PARTITION BY nd.announcement_id,nd.channel) AS audience_count,nd.queued_at,nd.sent_at,nd.error_code FROM notification_deliveries nd LEFT JOIN announcements a ON a.school_id=nd.school_id AND a.id=nd.announcement_id WHERE nd.school_id=$1 ORDER BY nd.queued_at DESC LIMIT 100`,[schoolId]),
      req.auth.client.query(`SELECT id,name,grade_level FROM class_groups WHERE school_id=$1 ORDER BY grade_level,name`,[schoolId]),
      req.auth.client.query(`SELECT t.id,t.student_id,s.first_name,s.last_name,s.student_number,t.subject,t.status,t.updated_at,g.first_name AS guardian_first_name,g.last_name AS guardian_last_name,
        (SELECT fm.body FROM family_messages fm WHERE fm.school_id=t.school_id AND fm.thread_id=t.id ORDER BY fm.created_at DESC LIMIT 1) AS latest_message,
        (SELECT count(*)::int FROM family_messages fm WHERE fm.school_id=t.school_id AND fm.thread_id=t.id AND fm.sender_user_id=t.guardian_user_id AND fm.read_at IS NULL) AS unread_count
        FROM family_message_threads t JOIN students s ON s.school_id=t.school_id AND s.id=t.student_id JOIN guardians g ON g.school_id=t.school_id AND g.user_id=t.guardian_user_id
        WHERE t.school_id=$1 ORDER BY t.updated_at DESC LIMIT 200`,[schoolId])
    ]);await close(req,true);return res.json({announcements:announcements.rows,deliveries:deliveries.rows,classes:classes.rows,familyThreads:familyThreads.rows,canWrite:req.auth.account.permissions.includes('communications.write'),canSendSms:req.auth.account.permissions.includes('communications.sms.send'),smsConfigured:smsReadiness(),smsProvider:smsProviderName()});}catch(error){return fail(req,res,error);}
  });

  router.get('/portal/family-messages', needsPermission('portal.messages.read'), async(req,res)=>{
    if(!req.auth.account.roles.includes('PARENT')){await close(req,false);return res.status(403).json({error:'Family messages are available to linked guardian accounts.'});}
    try{const schoolId=req.auth.claims.schoolId;const userId=req.auth.claims.userId;const [threads,children]=await Promise.all([
      req.auth.client.query(`SELECT t.id,t.student_id,t.subject,t.status,t.updated_at,s.first_name,s.last_name,
        (SELECT fm.body FROM family_messages fm WHERE fm.school_id=t.school_id AND fm.thread_id=t.id ORDER BY fm.created_at DESC LIMIT 1) AS latest_message,
        (SELECT count(*)::int FROM family_messages fm WHERE fm.school_id=t.school_id AND fm.thread_id=t.id AND fm.sender_user_id<>$2 AND fm.read_at IS NULL) AS unread_count
        FROM family_message_threads t JOIN students s ON s.school_id=t.school_id AND s.id=t.student_id WHERE t.school_id=$1 AND t.guardian_user_id=$2 AND EXISTS (SELECT 1 FROM guardians g JOIN student_guardians sg ON sg.school_id=g.school_id AND sg.guardian_id=g.id WHERE g.school_id=t.school_id AND g.user_id=$2 AND g.active AND sg.student_id=t.student_id) ORDER BY t.updated_at DESC LIMIT 100`,[schoolId,userId]),
      req.auth.client.query(`SELECT s.id,s.first_name,s.last_name FROM guardians g JOIN student_guardians sg ON sg.school_id=g.school_id AND sg.guardian_id=g.id JOIN students s ON s.school_id=sg.school_id AND s.id=sg.student_id WHERE g.school_id=$1 AND g.user_id=$2 AND g.active ORDER BY s.last_name,s.first_name`,[schoolId,userId])
    ]);await close(req,true);return res.json({threads:threads.rows,children:children.rows});}catch(error){return fail(req,res,error);}
  });

  router.post('/portal/family-messages', needsPermission('portal.messages.write'), csrf, async(req,res)=>{
    if(!req.auth.account.roles.includes('PARENT')){await close(req,false);return res.status(403).json({error:'Only linked guardian accounts can start a family message.'});}
    const studentId=text(req.body?.studentId,50);const subject=text(req.body?.subject,160);const body=text(req.body?.body,5000);
    if(!studentId||!subject||!body){await close(req,false);return res.status(400).json({error:'Choose a linked learner and enter a subject and message.'});}
    try{const schoolId=req.auth.claims.schoolId;const userId=req.auth.claims.userId;
      const linked=await req.auth.client.query(`SELECT s.id FROM guardians g JOIN student_guardians sg ON sg.school_id=g.school_id AND sg.guardian_id=g.id JOIN students s ON s.school_id=sg.school_id AND s.id=sg.student_id WHERE g.school_id=$1 AND g.user_id=$2 AND g.active AND s.id=$3`,[schoolId,userId,studentId]);
      if(!linked.rowCount){await close(req,false);return res.status(403).json({error:'Choose a learner linked to your guardian account.'});}
      const thread=await req.auth.client.query(`INSERT INTO family_message_threads(school_id,student_id,guardian_user_id,subject) VALUES($1,$2,$3,$4) RETURNING id`,[schoolId,studentId,userId,subject]);
      const message=await req.auth.client.query(`INSERT INTO family_messages(school_id,thread_id,sender_user_id,body) VALUES($1,$2,$3,$4) RETURNING id,body,created_at`,[schoolId,thread.rows[0].id,userId,body]);
      const staff=await req.auth.client.query(`SELECT DISTINCT ua.id FROM user_accounts ua JOIN user_role_assignments ura ON ura.school_id=ua.school_id AND ura.user_id=ua.id JOIN school_roles sr ON sr.school_id=ura.school_id AND sr.id=ura.role_id WHERE ua.school_id=$1 AND ua.status='ACTIVE' AND ua.id<>$2 AND sr.code IN ('SCHOOL_ADMIN','PRINCIPAL','CAMPUS_ADMIN') AND (ura.ends_at IS NULL OR ura.ends_at>now())`,[schoolId,userId]);
      for(const recipient of staff.rows){await req.auth.client.query(`INSERT INTO portal_notifications(school_id,user_id,kind,title,body,target_url) VALUES($1,$2,'MESSAGE','New guardian message',$3,'/portal')`,[schoolId,recipient.id,subject]);}
      await audit(req,'FAMILY_MESSAGE_SENT','FAMILY_MESSAGE',message.rows[0].id,{threadId:thread.rows[0].id,studentId});
      await done(req,res,201,{threadId:thread.rows[0].id,message:message.rows[0],notice:'Message sent to the school office.'});
      for(const recipient of staff.rows)void pushToUser(schoolId,recipient.id,{title:'New guardian message',body:subject,url:'/portal'});return;
    }catch(error){return fail(req,res,error);}
  });

  router.get('/portal/family-messages/:threadId', async(req,res)=>{
    try{const schoolId=req.auth.claims.schoolId;const userId=req.auth.claims.userId;const isParent=req.auth.account.roles.includes('PARENT');if((isParent&&!req.auth.account.permissions.includes('portal.messages.read'))||(!isParent&&!req.auth.account.permissions.includes('communications.read'))){await close(req,false);return res.status(403).json({error:'You do not have access to this family conversation.'});}
      const thread=await req.auth.client.query(`SELECT t.id,t.subject,t.student_id,t.guardian_user_id,s.first_name,s.last_name FROM family_message_threads t JOIN students s ON s.school_id=t.school_id AND s.id=t.student_id WHERE t.school_id=$1 AND t.id=$2 AND ($3::boolean=false OR (t.guardian_user_id=$4 AND EXISTS (SELECT 1 FROM guardians g JOIN student_guardians sg ON sg.school_id=g.school_id AND sg.guardian_id=g.id WHERE g.school_id=t.school_id AND g.user_id=$4 AND g.active AND sg.student_id=t.student_id)))`,[schoolId,req.params.threadId,isParent,userId]);
      if(!thread.rowCount){await close(req,false);return res.status(404).json({error:'Family conversation not found.'});}
      const messages=await req.auth.client.query(`SELECT m.id,m.body,m.sender_user_id,m.created_at,m.read_at,u.full_name AS sender_name FROM family_messages m JOIN user_accounts u ON u.school_id=m.school_id AND u.id=m.sender_user_id WHERE m.school_id=$1 AND m.thread_id=$2 ORDER BY m.created_at`,[schoolId,thread.rows[0].id]);
      await req.auth.client.query(`UPDATE family_messages SET read_at=COALESCE(read_at,now()) WHERE school_id=$1 AND thread_id=$2 AND sender_user_id<>$3`,[schoolId,thread.rows[0].id,userId]);
      await close(req,true);return res.json({thread:thread.rows[0],messages:messages.rows});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/portal/family-messages/:threadId/reply', needsPermission('portal.messages.write'), csrf, async(req,res)=>{
    if(!req.auth.account.roles.includes('PARENT')){await close(req,false);return res.status(403).json({error:'Only the linked guardian can reply from the family portal.'});}
    const body=text(req.body?.body,5000);if(!body){await close(req,false);return res.status(400).json({error:'Write a message before sending.'});}
    try{const schoolId=req.auth.claims.schoolId;const userId=req.auth.claims.userId;const thread=await req.auth.client.query(`SELECT t.id,t.subject FROM family_message_threads t WHERE t.school_id=$1 AND t.id=$2 AND t.guardian_user_id=$3 AND t.status='OPEN' AND EXISTS (SELECT 1 FROM guardians g JOIN student_guardians sg ON sg.school_id=g.school_id AND sg.guardian_id=g.id WHERE g.school_id=t.school_id AND g.user_id=$3 AND g.active AND sg.student_id=t.student_id)`,[schoolId,req.params.threadId,userId]);
      if(!thread.rowCount){await close(req,false);return res.status(404).json({error:'Open family conversation not found.'});}
      const message=await req.auth.client.query(`INSERT INTO family_messages(school_id,thread_id,sender_user_id,body) VALUES($1,$2,$3,$4) RETURNING id,body,created_at`,[schoolId,thread.rows[0].id,userId,body]);
      await req.auth.client.query(`UPDATE family_messages SET read_at=COALESCE(read_at,now()) WHERE school_id=$1 AND thread_id=$2 AND sender_user_id<>$3 AND read_at IS NULL`,[schoolId,thread.rows[0].id,userId]);await req.auth.client.query(`UPDATE family_message_threads SET updated_at=now() WHERE school_id=$1 AND id=$2`,[schoolId,thread.rows[0].id]);
      const staff=await req.auth.client.query(`SELECT ua.id FROM user_accounts ua JOIN user_role_assignments ura ON ura.school_id=ua.school_id AND ura.user_id=ua.id JOIN school_roles sr ON sr.school_id=ura.school_id AND sr.id=ura.role_id WHERE ua.school_id=$1 AND ua.status='ACTIVE' AND sr.code IN ('SCHOOL_ADMIN','PRINCIPAL','CAMPUS_ADMIN') AND (ura.ends_at IS NULL OR ura.ends_at>now())`,[schoolId]);
      for(const recipient of staff.rows)await req.auth.client.query(`INSERT INTO portal_notifications(school_id,user_id,kind,title,body,target_url) VALUES($1,$2,'MESSAGE','Guardian replied to a message',$3,'/portal')`,[schoolId,recipient.id,body.slice(0,220)]);
      await audit(req,'FAMILY_MESSAGE_REPLIED','FAMILY_MESSAGE',message.rows[0].id,{threadId:thread.rows[0].id});await done(req,res,201,{message:message.rows[0],notice:'Reply sent to the school office.'});for(const recipient of staff.rows)void pushToUser(schoolId,recipient.id,{title:'Guardian replied',body:body.slice(0,180),url:'/portal'});return;
    }catch(error){return fail(req,res,error);}
  });

  router.post('/communications/family-threads/:threadId/reply', needsPermission('communications.write'), csrf, async(req,res)=>{
    const body=text(req.body?.body,5000);if(!body){await close(req,false);return res.status(400).json({error:'Write a reply before sending.'});}
    try{const schoolId=req.auth.claims.schoolId;const userId=req.auth.claims.userId;const thread=await req.auth.client.query(`SELECT id,guardian_user_id,subject FROM family_message_threads WHERE school_id=$1 AND id=$2 AND status='OPEN'`,[schoolId,req.params.threadId]);
      if(!thread.rowCount){await close(req,false);return res.status(404).json({error:'Open family conversation not found.'});}
      const message=await req.auth.client.query(`INSERT INTO family_messages(school_id,thread_id,sender_user_id,body) VALUES($1,$2,$3,$4) RETURNING id,body,created_at`,[schoolId,thread.rows[0].id,userId,body]);
      await req.auth.client.query(`UPDATE family_messages SET read_at=now() WHERE school_id=$1 AND thread_id=$2 AND sender_user_id<>$3 AND read_at IS NULL`,[schoolId,thread.rows[0].id,userId]);
      await req.auth.client.query(`UPDATE family_message_threads SET updated_at=now() WHERE school_id=$1 AND id=$2`,[schoolId,thread.rows[0].id]);
      await req.auth.client.query(`INSERT INTO portal_notifications(school_id,user_id,kind,title,body,target_url) VALUES($1,$2,'MESSAGE','School replied to your message',$3,'/portal')`,[schoolId,thread.rows[0].guardian_user_id,body.slice(0,220)]);
      await audit(req,'FAMILY_MESSAGE_REPLIED','FAMILY_MESSAGE',message.rows[0].id,{threadId:thread.rows[0].id});
      await done(req,res,201,{message:message.rows[0],notice:'Reply sent to the guardian.'});void pushToUser(schoolId,thread.rows[0].guardian_user_id,{title:'School replied to your message',body:body.slice(0,180),url:'/portal'});return;
    }catch(error){return fail(req,res,error);}
  });

  router.post('/communications', needsPermission('communications.write'), csrf, async(req,res)=>{
    const title=text(req.body?.title,160);const body=text(req.body?.body,5000);const audience=text(req.body?.audience,30).toUpperCase();const classId=text(req.body?.classGroupId,50)||null;
    if(!title||!body||!['ALL_GUARDIANS','CAMPUS','CLASS','STAFF','LEARNERS'].includes(audience)||(audience==='CLASS'&&!classId)){await close(req,false);return res.status(400).json({error:'Enter a title and message, choose an audience, and select a class for class messages.'});}
    try{const schoolId=req.auth.claims.schoolId;const status='DRAFT';const r=await req.auth.client.query(`INSERT INTO announcements(school_id,class_group_id,title,body,audience,status,created_by,published_at) SELECT $1,c.id,$3,$4,$5,$6,$7,CASE WHEN $6='PUBLISHED' THEN now() ELSE NULL END FROM (SELECT 1) seed LEFT JOIN class_groups c ON c.school_id=$1 AND c.id=$2 WHERE ($5<>'CLASS' OR c.id IS NOT NULL) RETURNING id,title,body,audience,status,created_at,published_at`,[schoolId,classId,title,body,audience,status,req.auth.claims.userId]);if(!r.rowCount){await close(req,false);return res.status(400).json({error:'Choose a class belonging to this school.'});}let alerts=[];if(status==='PUBLISHED'){await queueAnnouncementSms(req.auth.client,schoolId,r.rows[0].id);alerts=await queueAnnouncementAlerts(req.auth.client,schoolId,r.rows[0].id);}await audit(req,'ANNOUNCEMENT_CREATED','ANNOUNCEMENT',r.rows[0].id,{audience,status,alerts:alerts.length});await done(req,res,201,{announcement:r.rows[0],notice:status==='PUBLISHED'?'Announcement published in the portal. Eligible in-app and push alerts were queued; consent-eligible SMS recipients are ready to send.':'Announcement saved as a draft for review.'});for(const target of alerts)void pushToUser(schoolId,target.user_id,{title:target.title,body:target.body.slice(0,180),url:'/portal'});return;}catch(error){return fail(req,res,error);}
  });

  router.post('/communications/:announcementId/publish', needsPermission('communications.write'), csrf, async(req,res)=>{
    try{const r=await req.auth.client.query(`UPDATE announcements SET status='PUBLISHED',approved_by=$3,published_at=now() WHERE school_id=$1 AND id=$2 AND status='DRAFT' RETURNING id,title,status,published_at`,[req.auth.claims.schoolId,req.params.announcementId,req.auth.claims.userId]);if(!r.rowCount){await close(req,false);return res.status(404).json({error:'Draft announcement not found.'});}const queued=await queueAnnouncementSms(req.auth.client,req.auth.claims.schoolId,r.rows[0].id);const alerts=await queueAnnouncementAlerts(req.auth.client,req.auth.claims.schoolId,r.rows[0].id);await audit(req,'ANNOUNCEMENT_PUBLISHED','ANNOUNCEMENT',r.rows[0].id,{smsQueued:queued.rowCount,alerts:alerts.length});await done(req,res,200,{announcement:r.rows[0],notice:`Published to the portal. ${alerts.length} in-app/push alert(s) queued. ${queued.rowCount} consent-eligible SMS recipient(s) queued${smsReadiness()?' and ready to send':' (SMS gateway not configured)'}.`});for(const target of alerts)void pushToUser(req.auth.claims.schoolId,target.user_id,{title:target.title,body:target.body.slice(0,180),url:'/portal'});return;}catch(error){return fail(req,res,error);}
  });

  router.post('/communications/:announcementId/send-sms', needsPermission('communications.sms.send'), csrf, async(req,res)=>{
    if(!smsReadiness()){await close(req,false);return res.status(503).json({error:'SMS delivery is not ready. Check the selected provider’s credentials and live-send setting in the app environment.'});}

    try{const schoolId=req.auth.claims.schoolId;const announcement=await req.auth.client.query(`SELECT id,title,body,status FROM announcements WHERE school_id=$1 AND id=$2`,[schoolId,req.params.announcementId]);if(!announcement.rowCount||announcement.rows[0].status!=='PUBLISHED'){await close(req,false);return res.status(409).json({error:'Publish this school announcement before sending SMS.'});}
      await queueAnnouncementSms(req.auth.client,schoolId,announcement.rows[0].id);
      const queued=await req.auth.client.query(`SELECT id,recipient_ref FROM notification_deliveries WHERE school_id=$1 AND announcement_id=$2 AND channel='SMS' AND status IN ('QUEUED','FAILED') ORDER BY queued_at LIMIT 300`,[schoolId,announcement.rows[0].id]);
      let sent=0,failed=0;
      for(const delivery of queued.rows){try{const {providerMessageId}=await sendSchoolSms({to:delivery.recipient_ref,message:`${announcement.rows[0].title}: ${announcement.rows[0].body}`});await req.auth.client.query(`UPDATE notification_deliveries SET status='SENT',provider_message_id=$3,sent_at=now(),error_code=NULL WHERE school_id=$1 AND id=$2`,[schoolId,delivery.id,providerMessageId]);sent++;}catch(error){await req.auth.client.query(`UPDATE notification_deliveries SET status='FAILED',error_code=$3 WHERE school_id=$1 AND id=$2`,[schoolId,delivery.id,(error instanceof Error?error.message:'Delivery failed').slice(0,120)]);failed++;}}
      await audit(req,'ANNOUNCEMENT_SMS_DISPATCHED','ANNOUNCEMENT',announcement.rows[0].id,{sent,failed});return done(req,res,200,{sent,failed,notice:`SMS delivery finished: ${sent} sent, ${failed} failed.`});
    }catch(error){return fail(req,res,error);}
  });

  router.post('/year-end-report-cards/setup', needsPermission('academics.configure'), csrf, async (req, res) => {
    const academicYearId = text(req.body?.academicYearId, 50);
    if (!academicYearId) { await close(req, false); return res.status(400).json({ error: 'Choose an academic year first.' }); }
    const labels = ['1st', '2nd', '3rd', 'Exam', '4th', '5th', '6th', 'Exam'];
    try {
      const year = await req.auth.client.query('SELECT id FROM academic_years WHERE school_id=$1 AND id=$2', [req.auth.claims.schoolId, academicYearId]);
      if (!year.rowCount) { await close(req, false); return res.status(400).json({ error: 'Choose an academic year belonging to this school.' }); }
      for (let index = 0; index < labels.length; index += 1) {
        await req.auth.client.query(`INSERT INTO grade_reporting_periods (school_id, academic_year_id, label, sort_order, created_by)
          VALUES ($1,$2,$3,$4,$5) ON CONFLICT (school_id,academic_year_id,sort_order) DO NOTHING`,
        [req.auth.claims.schoolId, academicYearId, labels[index], index + 1, req.auth.claims.userId]);
      }
      await audit(req, 'YEAR_END_REPORT_PERIODS_CONFIGURED', 'ACADEMIC_YEAR', academicYearId, { periods: labels.length });
      const result = await req.auth.client.query(`SELECT id,label,sort_order FROM grade_reporting_periods
        WHERE school_id=$1 AND academic_year_id=$2 ORDER BY sort_order`, [req.auth.claims.schoolId, academicYearId]);
      return done(req, res, 201, { periods: result.rows, notice: 'Eight report-card periods are ready. Teachers can now tag assessments to a period.' });
    } catch (error) { return fail(req, res, error); }
  });

  router.get('/year-end-report-cards/config', needsAnyPermission(['grades.publish', 'academics.configure']), async (req, res) => {
    const academicYearId = text(req.query?.academicYearId, 50);
    if (!academicYearId) { await close(req, false); return res.status(400).json({ error: 'Choose an academic year.' }); }
    try {
      const year = await req.auth.client.query('SELECT id,name FROM academic_years WHERE school_id=$1 AND id=$2', [req.auth.claims.schoolId, academicYearId]);
      if (!year.rowCount) { await close(req, false); return res.status(404).json({ error: 'Academic year not found for this school.' }); }
      const [periods, savedWeights] = await Promise.all([
        req.auth.client.query(`SELECT id,label,sort_order FROM grade_reporting_periods WHERE school_id=$1 AND academic_year_id=$2 ORDER BY sort_order`, [req.auth.claims.schoolId, academicYearId]),
        req.auth.client.query(`SELECT assessment_type,weight_percent FROM year_end_assessment_weights WHERE school_id=$1 AND academic_year_id=$2`, [req.auth.claims.schoolId, academicYearId]),
      ]);
      const { weights, configured: weightsConfigured } = yearEndWeightsFromRows(savedWeights.rows);
      await close(req, true);
      return res.json({ academicYear: year.rows[0], periods: periods.rows, weights, configured: periods.rowCount === 8, weightsConfigured });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/year-end-report-cards/weights', needsPermission('academics.configure'), csrf, async (req, res) => {
    const academicYearId = text(req.body?.academicYearId, 50);
    const weights = validateYearEndWeights(req.body?.weights);
    if (!academicYearId || !weights) { await close(req, false); return res.status(400).json({ error: 'Enter positive Assignment, Quiz, and Test weights that total exactly 100%.' }); }
    try {
      const year = await req.auth.client.query('SELECT id FROM academic_years WHERE school_id=$1 AND id=$2', [req.auth.claims.schoolId, academicYearId]);
      if (!year.rowCount) { await close(req, false); return res.status(404).json({ error: 'Academic year not found for this school.' }); }
      for (const category of WEIGHTED_CATEGORIES) {
        await req.auth.client.query(`INSERT INTO year_end_assessment_weights (school_id,academic_year_id,assessment_type,weight_percent,updated_by)
          VALUES ($1,$2,$3,$4,$5) ON CONFLICT (school_id,academic_year_id,assessment_type)
          DO UPDATE SET weight_percent=EXCLUDED.weight_percent,updated_by=EXCLUDED.updated_by,updated_at=now()`,
        [req.auth.claims.schoolId, academicYearId, category, weights[category], req.auth.claims.userId]);
      }
      await audit(req, 'YEAR_END_ASSESSMENT_WEIGHTS_UPDATED', 'ACADEMIC_YEAR', academicYearId, { weights });
      return done(req, res, 200, { weights, notice: 'Year-end assessment weights saved.' });
    } catch (error) { return fail(req, res, error); }
  });

  router.get('/year-end-report-cards/review', needsPermission('grades.publish'), async (req, res) => {
    const academicYearId = text(req.query?.academicYearId, 50);
    const classGroupId = text(req.query?.classGroupId, 50);
    if (!academicYearId || !classGroupId) { await close(req, false); return res.status(400).json({ error: 'Choose an academic year and class.' }); }
    try {
      const schoolId = req.auth.claims.schoolId;
      const selectedClass = await req.auth.client.query(`SELECT c.id,c.name,c.grade_level,c.section,c.academic_year_id,y.name AS academic_year_name,y.starts_on,y.ends_on,
          sc.name AS school_name,sc.code AS school_code
        FROM class_groups c JOIN academic_years y ON y.school_id=c.school_id AND y.id=c.academic_year_id
        JOIN schools sc ON sc.id=c.school_id
        WHERE c.school_id=$1 AND c.id=$2 AND c.academic_year_id=$3`, [schoolId, classGroupId, academicYearId]);
      if (!selectedClass.rowCount) { await close(req, false); return res.status(404).json({ error: 'Choose a class in the selected academic year.' }); }
      const [periodsResult, weightRows, studentsResult, subjectsResult, markRowsResult, existingResult] = await Promise.all([
        req.auth.client.query(`SELECT id,label,sort_order FROM grade_reporting_periods WHERE school_id=$1 AND academic_year_id=$2 ORDER BY sort_order`, [schoolId, academicYearId]),
        req.auth.client.query(`SELECT assessment_type,weight_percent FROM year_end_assessment_weights WHERE school_id=$1 AND academic_year_id=$2`, [schoolId, academicYearId]),
        req.auth.client.query(`SELECT st.id,st.student_number,st.first_name,st.middle_name,st.last_name
          FROM class_enrollments ce JOIN students st ON st.school_id=ce.school_id AND st.id=ce.student_id
          WHERE ce.school_id=$1 AND ce.class_group_id=$2 AND ce.status='ACTIVE' AND st.status='ACTIVE'
          ORDER BY st.last_name,st.first_name,st.student_number`, [schoolId, classGroupId]),
        req.auth.client.query(`SELECT DISTINCT s.id,s.name FROM teacher_subject_assignments ta
          JOIN subjects s ON s.school_id=ta.school_id AND s.id=ta.subject_id
          WHERE ta.school_id=$1 AND ta.class_group_id=$2 AND ta.academic_year_id=$3
            AND ta.effective_from <= $5::date AND (ta.effective_to IS NULL OR ta.effective_to >= $4::date)
          ORDER BY s.name`, [schoolId, classGroupId, academicYearId, selectedClass.rows[0].starts_on, selectedClass.rows[0].ends_on]),
        req.auth.client.query(`SELECT sc.student_id,ta.subject_id,rp.id AS reporting_period_id,rp.label AS period_label,rp.sort_order,
            a.assessment_type,sc.score,a.max_score
          FROM assessments a JOIN teacher_subject_assignments ta ON ta.school_id=a.school_id AND ta.id=a.teacher_assignment_id
          JOIN subjects s ON s.school_id=ta.school_id AND s.id=ta.subject_id
          JOIN grade_reporting_periods rp ON rp.school_id=a.school_id AND rp.id=a.reporting_period_id
          JOIN assessment_scores sc ON sc.school_id=a.school_id AND sc.assessment_id=a.id 
          JOIN class_enrollments ce ON ce.school_id=sc.school_id AND ce.student_id=sc.student_id AND ce.class_group_id=ta.class_group_id AND ce.status='ACTIVE'
          WHERE a.school_id=$1 AND ta.class_group_id=$2 AND ta.academic_year_id=$3 AND rp.academic_year_id=$3 AND (sc.review_status='PUBLISHED' OR a.status='PUBLISHED')
          ORDER BY sc.student_id,s.name,rp.sort_order,a.assessment_type,a.title`, [schoolId, classGroupId, academicYearId]),
        req.auth.client.query(`SELECT rc.student_id,rc.status,rc.academic_summary,rc.approved_at,u.full_name AS approved_by_name
          FROM report_cards rc LEFT JOIN user_accounts u ON u.school_id=rc.school_id AND u.id=rc.approved_by
          WHERE rc.school_id=$1 AND rc.academic_year_id=$2 AND rc.academic_term_id IS NULL
          ORDER BY rc.snapshot_version DESC`, [schoolId, academicYearId]),
      ]);
      const { weights, configured: weightsConfigured } = yearEndWeightsFromRows(weightRows.rows);
      const periods = periodsResult.rows;
      const students = studentsResult.rows.map(student => {
        const report = buildYearEndReportCard({ student, subjects: subjectsResult.rows, periods, weights,
          markRows: markRowsResult.rows.filter(mark => mark.student_id === student.id) });
        const existing = existingResult.rows.find(row => row.student_id === student.id && row.status === 'PUBLISHED');
        return { ...report, readyForPrincipal: report.readyForPrincipal && weightsConfigured, existingReportCard: existing ? { status: existing.status, snapshot: existing.academic_summary, approvedAt: existing.approved_at, approvedBy: existing.approved_by_name } : null };
      });
      await close(req, true);
      return res.json({ school: { name: selectedClass.rows[0].school_name, code: selectedClass.rows[0].school_code }, classGroup: selectedClass.rows[0], periods,
        weights, weightsConfigured, configured: periods.length === 8, students });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/year-end-report-cards/approve', needsPermission('grades.publish'), csrf, async (req, res) => {
    if (!req.auth.account.roles.includes('PRINCIPAL')) { await close(req,false); return res.status(403).json({ error: 'Only a Principal account can sign off and publish year-end report cards.' }); }
    const academicYearId = text(req.body?.academicYearId, 50);
    const classGroupId = text(req.body?.classGroupId, 50);
    const studentId = text(req.body?.studentId, 50);
    if (!academicYearId || !classGroupId || !studentId) { await close(req, false); return res.status(400).json({ error: 'Choose a learner, class, and academic year.' }); }
    try {
      const schoolId = req.auth.claims.schoolId;
      const duplicate = await req.auth.client.query(`SELECT id FROM report_cards WHERE school_id=$1 AND student_id=$2 AND academic_year_id=$3 AND academic_term_id IS NULL AND status='PUBLISHED' FOR UPDATE`, [schoolId, studentId, academicYearId]);
      if (duplicate.rowCount) { await close(req, false); return res.status(409).json({ error: 'This year-end report is already approved and published. A correction workflow is required before changing it.' }); }
      const preview = await req.auth.client.query(`SELECT c.id,c.name,c.grade_level,c.section,c.academic_year_id,y.name AS academic_year_name,y.starts_on,y.ends_on,sc.name AS school_name,sc.code AS school_code,
          st.id AS student_id,st.student_number,st.first_name,st.middle_name,st.last_name
        FROM class_groups c JOIN academic_years y ON y.school_id=c.school_id AND y.id=c.academic_year_id JOIN schools sc ON sc.id=c.school_id
        JOIN class_enrollments ce ON ce.school_id=c.school_id AND ce.class_group_id=c.id AND ce.status='ACTIVE'
        JOIN students st ON st.school_id=ce.school_id AND st.id=ce.student_id AND st.status='ACTIVE'
        WHERE c.school_id=$1 AND c.id=$2 AND c.academic_year_id=$3 AND st.id=$4`, [schoolId,classGroupId,academicYearId,studentId]);
      if (!preview.rowCount) { await close(req,false); return res.status(404).json({ error: 'Learner is not actively enrolled in this class and academic year.' }); }
      const p = preview.rows[0];
      const [periodRows, weightRows, subjectRows, marks] = await Promise.all([
        req.auth.client.query(`SELECT id,label,sort_order FROM grade_reporting_periods WHERE school_id=$1 AND academic_year_id=$2 ORDER BY sort_order`, [schoolId,academicYearId]),
        req.auth.client.query(`SELECT assessment_type,weight_percent FROM year_end_assessment_weights WHERE school_id=$1 AND academic_year_id=$2`, [schoolId,academicYearId]),
        req.auth.client.query(`SELECT DISTINCT s.id,s.name FROM teacher_subject_assignments ta JOIN subjects s ON s.school_id=ta.school_id AND s.id=ta.subject_id
          WHERE ta.school_id=$1 AND ta.class_group_id=$2 AND ta.academic_year_id=$3 AND ta.effective_from <= $5::date AND (ta.effective_to IS NULL OR ta.effective_to >= $4::date) ORDER BY s.name`, [schoolId,classGroupId,academicYearId,p.starts_on,p.ends_on]),
        req.auth.client.query(`SELECT sc.student_id,ta.subject_id,rp.id AS reporting_period_id,rp.label AS period_label,rp.sort_order,a.assessment_type,sc.score,a.max_score
          FROM assessments a JOIN teacher_subject_assignments ta ON ta.school_id=a.school_id AND ta.id=a.teacher_assignment_id
          JOIN grade_reporting_periods rp ON rp.school_id=a.school_id AND rp.id=a.reporting_period_id
          JOIN assessment_scores sc ON sc.school_id=a.school_id AND sc.assessment_id=a.id 
          WHERE a.school_id=$1 AND ta.class_group_id=$2 AND ta.academic_year_id=$3 AND rp.academic_year_id=$3 AND (sc.review_status='PUBLISHED' OR a.status='PUBLISHED') AND sc.student_id=$4`, [schoolId,classGroupId,academicYearId,studentId]),
      ]);
      const { weights, configured: weightsConfigured } = yearEndWeightsFromRows(weightRows.rows);
      if (!weightsConfigured) { await close(req,false); return res.status(409).json({ error: 'The school administrator must save assignment, quiz, and test weights totaling 100% before Principal approval.' }); }
      const report = buildYearEndReportCard({ student: { id:p.student_id, student_number:p.student_number, first_name:p.first_name, middle_name:p.middle_name, last_name:p.last_name }, subjects: subjectRows.rows, periods: periodRows.rows, markRows: marks.rows, weights });
      if (periodRows.rowCount !== 8) { await close(req,false); return res.status(409).json({ error: 'Set up all eight report-card periods before Principal approval.' }); }
      if (!report.readyForPrincipal) { await close(req,false); return res.status(409).json({ error: 'This report has missing published marks or no subjects. Resolve the incomplete period/category marks before approval.' }); }
      const principal = await req.auth.client.query(`SELECT full_name FROM user_accounts WHERE school_id=$1 AND id=$2`, [schoolId, req.auth.claims.userId]);
      const snapshot = { school: { name:p.school_name, code:p.school_code }, classGroup: { id:p.id, name:p.name, gradeLevel:p.grade_level, section:p.section, academicYear:p.academic_year_name }, approval: { principalName: principal.rows[0]?.full_name || 'Principal', title: 'Principal', approvedAt: new Date().toISOString() }, ...report };
      const version = await req.auth.client.query(`SELECT COALESCE(MAX(snapshot_version),0)::int+1 AS next_version FROM report_cards
        WHERE school_id=$1 AND student_id=$2 AND academic_year_id=$3 AND academic_term_id IS NULL`, [schoolId,studentId,academicYearId]);
      const saved = await req.auth.client.query(`INSERT INTO report_cards
          (school_id,student_id,academic_year_id,status,academic_summary,promotion_status,approved_by,approved_at,published_at,snapshot_version,calculated_at)
        VALUES ($1,$2,$3,'PUBLISHED',$4::jsonb,$5,$6,now(),now(),$7,now()) RETURNING id,status,approved_at,published_at,snapshot_version`,
      [schoolId,studentId,academicYearId,JSON.stringify(snapshot),report.overallOutcome,req.auth.claims.userId,version.rows[0].next_version]);
      await audit(req,'YEAR_END_REPORT_CARD_APPROVED_AND_PUBLISHED','REPORT_CARD',saved.rows[0].id,{ studentId, academicYearId, classGroupId, overallAverage:report.overallAverage, overallOutcome:report.overallOutcome, snapshotVersion:saved.rows[0].snapshot_version });
      return done(req,res,201,{ reportCard:saved.rows[0], snapshot, notice:'The Principal-approved report card is now published and available to the linked learner and guardian.' });
    } catch (error) { return fail(req,res,error); }
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
      const [school, years, subjects, classes, teachers, students, assignments, educationLevels, gradeLevels, terms, reportingPeriods, curriculum, resources, periods, slots, assessments, teachingMaterials] = await Promise.all([
        req.auth.client.query(`SELECT id, code, name, timezone,
            CASE WHEN $2::boolean THEN moe_school_emis_code ELSE NULL END AS moe_school_emis_code
          FROM schools WHERE id = $1`, [schoolId, req.auth.account.permissions.includes('school.configure')]),
        req.auth.client.query(`SELECT y.id, y.name, y.starts_on, y.ends_on, y.status FROM academic_years y WHERE y.school_id = $1 ${isTeacher ? 'AND EXISTS (SELECT 1 FROM teacher_subject_assignments a WHERE a.school_id = y.school_id AND a.academic_year_id = y.id AND a.teacher_id = $2)' : ''} ORDER BY y.starts_on DESC`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query(`SELECT s.id, s.code, s.name FROM subjects s WHERE s.school_id = $1 AND s.is_active ${isTeacher ? 'AND EXISTS (SELECT 1 FROM teacher_subject_assignments a WHERE a.school_id = s.school_id AND a.subject_id = s.id AND a.teacher_id = $2)' : ''} ORDER BY s.name`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query(`SELECT c.id, c.name, c.grade_level, c.section, c.academic_year_id,c.grade_level_id,c.education_level_id,
            linked_grade.name AS linked_grade_name,education_level.name AS education_level_name,y.name AS academic_year_name
          FROM class_groups c JOIN academic_years y ON y.school_id = c.school_id AND y.id = c.academic_year_id
          LEFT JOIN grade_levels linked_grade ON linked_grade.school_id=c.school_id AND linked_grade.id=c.grade_level_id
          LEFT JOIN education_levels education_level ON education_level.school_id=c.school_id AND education_level.id=c.education_level_id
          WHERE c.school_id = $1 ${isTeacher ? 'AND EXISTS (SELECT 1 FROM teacher_subject_assignments a WHERE a.school_id = c.school_id AND a.class_group_id = c.id AND a.teacher_id = $2)' : ''} ORDER BY y.starts_on DESC, c.grade_level, c.section`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query(`SELECT u.id, u.full_name, u.email, tp.employee_number
          FROM teacher_profiles tp JOIN user_accounts u ON u.school_id = tp.school_id AND u.id = tp.user_id
          WHERE tp.school_id = $1 AND tp.active AND u.status = 'ACTIVE' ${isTeacher ? 'AND u.id = $2' : ''} ORDER BY u.full_name`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query(`SELECT s.id, s.student_number, s.first_name, s.last_name, c.name AS class_name
          FROM students s LEFT JOIN class_enrollments ce ON ce.school_id = s.school_id AND ce.student_id = s.id AND ce.status = 'ACTIVE'
          LEFT JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id
          WHERE s.school_id = $1 AND s.status = 'ACTIVE' ${isTeacher ? 'AND EXISTS (SELECT 1 FROM class_enrollments scoped_ce JOIN teacher_subject_assignments scoped_a ON scoped_a.school_id = scoped_ce.school_id AND scoped_a.class_group_id = scoped_ce.class_group_id WHERE scoped_ce.school_id = s.school_id AND scoped_ce.student_id = s.id AND scoped_a.teacher_id = $2)' : ''} ORDER BY s.last_name, s.first_name`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query(`SELECT a.id, a.class_group_id, a.academic_year_id, u.full_name AS teacher_name, s.name AS subject_name, c.name AS class_name, y.name AS academic_year_name
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
        req.auth.client.query(`SELECT rp.id,rp.academic_year_id,rp.label,rp.sort_order,y.name AS academic_year_name
          FROM grade_reporting_periods rp JOIN academic_years y ON y.school_id=rp.school_id AND y.id=rp.academic_year_id
          WHERE rp.school_id=$1 ${isTeacher ? 'AND EXISTS (SELECT 1 FROM teacher_subject_assignments a WHERE a.school_id=rp.school_id AND a.academic_year_id=rp.academic_year_id AND a.teacher_id=$2)' : ''}
          ORDER BY y.starts_on DESC,rp.sort_order`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query(`SELECT gc.id, gc.academic_year_id, gc.grade_level_id, gc.subject_id, gc.academic_term_id, gc.weekly_minutes, gc.periods_per_week, gc.required, gc.learning_objectives, g.name AS grade_name, s.name AS subject_name, y.name AS academic_year_name, t.name AS term_name FROM grade_curriculum_subjects gc JOIN grade_levels g ON g.school_id = gc.school_id AND g.id = gc.grade_level_id JOIN subjects s ON s.school_id = gc.school_id AND s.id = gc.subject_id JOIN academic_years y ON y.school_id = gc.school_id AND y.id = gc.academic_year_id LEFT JOIN academic_terms t ON t.school_id = gc.school_id AND t.id = gc.academic_term_id WHERE gc.school_id = $1 ${isTeacher ? 'AND EXISTS (SELECT 1 FROM teacher_subject_assignments a JOIN class_groups c ON c.school_id = a.school_id AND c.id = a.class_group_id WHERE a.school_id = gc.school_id AND a.teacher_id = $2 AND a.subject_id = gc.subject_id AND a.academic_year_id = gc.academic_year_id AND c.grade_level_id = gc.grade_level_id)' : ''} ORDER BY y.starts_on DESC, g.sort_order, s.name`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query(`SELECT r.id, r.curriculum_subject_id, r.resource_type, r.title, r.author, r.publisher, r.isbn, r.edition, r.description, r.resource_url, r.required, gc.grade_level_id, gc.subject_id FROM curriculum_resources r JOIN grade_curriculum_subjects gc ON gc.school_id = r.school_id AND gc.id = r.curriculum_subject_id WHERE r.school_id = $1 ${isTeacher ? 'AND EXISTS (SELECT 1 FROM teacher_subject_assignments a JOIN class_groups c ON c.school_id = a.school_id AND c.id = a.class_group_id WHERE a.school_id = gc.school_id AND a.teacher_id = $2 AND a.subject_id = gc.subject_id AND c.grade_level_id = gc.grade_level_id)' : ''} ORDER BY r.created_at DESC`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query('SELECT id, name, starts_at, ends_at FROM timetable_periods WHERE school_id = $1 ORDER BY starts_at', [schoolId]),
        req.auth.client.query(`SELECT ts.id, ts.teacher_assignment_id, ts.day_of_week, ts.effective_from, ts.effective_to, tp.name AS period_name, tp.starts_at, tp.ends_at, c.name AS class_name, s.name AS subject_name, u.full_name AS teacher_name FROM timetable_slots ts JOIN timetable_periods tp ON tp.school_id = ts.school_id AND tp.id = ts.period_id JOIN teacher_subject_assignments a ON a.school_id = ts.school_id AND a.id = ts.teacher_assignment_id JOIN class_groups c ON c.school_id = a.school_id AND c.id = a.class_group_id JOIN subjects s ON s.school_id = a.school_id AND s.id = a.subject_id JOIN user_accounts u ON u.school_id = a.school_id AND u.id = a.teacher_id WHERE ts.school_id = $1 ${isTeacher ? 'AND a.teacher_id = $2' : ''} ORDER BY ts.day_of_week, tp.starts_at`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
        req.auth.client.query(`SELECT a.id, a.teacher_assignment_id, a.reporting_period_id, rp.label AS reporting_period_label, a.title, a.assessment_type, a.max_score, a.due_at, a.status, a.created_at,
            c.name AS class_name, s.name AS subject_name, u.full_name AS teacher_name,
            COUNT(sc.id)::int AS scored_students
          FROM assessments a
          JOIN teacher_subject_assignments ta ON ta.school_id = a.school_id AND ta.id = a.teacher_assignment_id
          JOIN class_groups c ON c.school_id = ta.school_id AND c.id = ta.class_group_id
          JOIN subjects s ON s.school_id = ta.school_id AND s.id = ta.subject_id
          JOIN user_accounts u ON u.school_id = ta.school_id AND u.id = ta.teacher_id
          LEFT JOIN grade_reporting_periods rp ON rp.school_id=a.school_id AND rp.id=a.reporting_period_id
          LEFT JOIN assessment_scores sc ON sc.school_id = a.school_id AND sc.assessment_id = a.id
          WHERE a.school_id = $1 ${isTeacher ? 'AND ta.teacher_id = $2' : ''}
          GROUP BY a.id, c.name, s.name, u.full_name, rp.label ORDER BY a.created_at DESC LIMIT 100`, isTeacher ? [schoolId, req.auth.claims.userId] : [schoolId]),
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
        teachers: teachers.rows, students: students.rows, assignments: assignments.rows, educationLevels: educationLevels.rows, gradeLevels: gradeLevels.rows, terms: terms.rows, reportingPeriods: reportingPeriods.rows,
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
      // Make subject setup safe to retry: a previously created but inactive subject
      // should be reactivated, and an existing code should remain selectable.
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

  router.post('/classes/:classGroupId/grade-level', needsPermission('academics.configure'), csrf, async (req, res) => {
    const classGroupId = text(req.params.classGroupId, 50);
    const gradeLevelId = text(req.body?.gradeLevelId, 50);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(classGroupId)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gradeLevelId)) {
      await close(req, false); return res.status(400).json({ error: 'Choose an existing class and grade level.' });
    }
    try {
      const result = await req.auth.client.query(`UPDATE class_groups c
        SET grade_level_id=g.id,education_level_id=g.education_level_id,grade_level=g.name
        FROM grade_levels g
        WHERE c.school_id=$1 AND c.id=$2 AND g.school_id=c.school_id AND g.id=$3 AND g.active
        RETURNING c.id,c.name,c.grade_level,c.section,c.academic_year_id,c.grade_level_id,
          g.name AS linked_grade_name,g.education_level_id`, [req.auth.claims.schoolId, classGroupId, gradeLevelId]);
      if (!result.rowCount) {
        await close(req, false); return res.status(404).json({ error: 'The class or active grade level could not be found in this school.' });
      }
      await audit(req, 'CLASS_GRADE_LEVEL_LINKED', 'CLASS_GROUP', result.rows[0].id, {
        gradeLevelId: result.rows[0].grade_level_id, gradeLevelName: result.rows[0].linked_grade_name,
      });
      return done(req, res, 200, { classGroup: result.rows[0], notice: `Class linked to ${result.rows[0].linked_grade_name}. Student enrollments were preserved.` });
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
    const allowedRoles = new Set(['PRINCIPAL', 'REGISTRAR', 'FINANCE', 'HR_MANAGER', 'INVENTORY_MANAGER', 'AUDITOR']);
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
    const reportingPeriodId = text(req.body?.reportingPeriodId, 50);
    const title = text(req.body?.title, 160);
    const type = text(req.body?.assessmentType, 20).toUpperCase();
    const maxScore = Number(req.body?.maxScore);
    const dueAt = req.body?.dueAt ? new Date(req.body.dueAt) : null;
    if (!assignmentId || !reportingPeriodId || !title || !['QUIZ', 'TEST', 'EXAM', 'ASSIGNMENT', 'PROJECT'].includes(type) || !Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 9999.99 || (dueAt && !Number.isFinite(dueAt.valueOf()))) {
      await close(req, false); return res.status(400).json({ error: 'Choose your assigned class, subject, and report-card period, then enter a title, assessment type, maximum score, and valid optional due date.' });
    }
    const isTeacher = req.auth.account.roles.includes('TEACHER');
    try {
      const result = await req.auth.client.query(`INSERT INTO assessments
          (school_id, teacher_assignment_id, reporting_period_id, created_by, title, assessment_type, max_score, due_at, status)
        SELECT $1, ta.id, rp.id, $4, $5, $6, $7, $8, 'OPEN'
        FROM teacher_subject_assignments ta JOIN grade_reporting_periods rp ON rp.school_id=ta.school_id AND rp.id=$3 AND rp.academic_year_id=ta.academic_year_id
        WHERE ta.school_id = $1 AND ta.id = $2
          AND ta.effective_from <= CURRENT_DATE AND (ta.effective_to IS NULL OR ta.effective_to >= CURRENT_DATE)
          AND ($9::boolean = false OR ta.teacher_id = $4)
        RETURNING id, teacher_assignment_id, reporting_period_id, title, assessment_type, max_score, due_at, status`,
      [req.auth.claims.schoolId, assignmentId, reportingPeriodId, req.auth.claims.userId, title, type, maxScore, dueAt, isTeacher]);
      if (!result.rowCount) { await close(req, false); return res.status(403).json({ error: 'Choose a reporting period in the same academic year as your active teaching assignment.' }); }
      await audit(req, 'ASSESSMENT_CREATED', 'ASSESSMENT', result.rows[0].id, { assignmentId, reportingPeriodId, type, maxScore });
      return done(req, res, 201, { assessment: result.rows[0] });
    } catch (error) { return fail(req, res, error); }
  });

  router.get('/assessments/:assessmentId/roster', needsAnyPermission(['grades.enter', 'grades.moderate', 'grades.publish']), async (req, res) => {
    const assessmentId = text(req.params.assessmentId, 50);
    const isTeacher = req.auth.account.roles.includes('TEACHER') && !req.auth.account.permissions.includes('grades.moderate');
    try {
      const result = await req.auth.client.query(`SELECT a.id AS assessment_id, a.title, a.assessment_type, a.max_score, a.status, rp.label AS reporting_period_label,
          ta.id AS assignment_id, c.name AS class_name, s.name AS subject_name,
          st.id AS student_id, st.student_number, st.first_name, st.last_name, sc.score, sc.feedback, sc.review_status, sc.return_reason
        FROM assessments a
        JOIN teacher_subject_assignments ta ON ta.school_id = a.school_id AND ta.id = a.teacher_assignment_id
        JOIN class_groups c ON c.school_id = ta.school_id AND c.id = ta.class_group_id
        JOIN subjects s ON s.school_id = ta.school_id AND s.id = ta.subject_id
        LEFT JOIN grade_reporting_periods rp ON rp.school_id=a.school_id AND rp.id=a.reporting_period_id
        JOIN class_enrollments ce ON ce.school_id = ta.school_id AND ce.class_group_id = ta.class_group_id AND ce.status = 'ACTIVE'
        JOIN students st ON st.school_id = ce.school_id AND st.id = ce.student_id AND st.status = 'ACTIVE'
        LEFT JOIN assessment_scores sc ON sc.school_id = a.school_id AND sc.assessment_id = a.id AND sc.student_id = st.id
        WHERE a.school_id = $1 AND a.id = $2 AND ($3::boolean = false OR ta.teacher_id = $4)
        ORDER BY st.last_name, st.first_name`, [req.auth.claims.schoolId, assessmentId, isTeacher, req.auth.claims.userId]);
      if (!result.rowCount) { await close(req, false); return res.status(404).json({ error: 'Assessment not found, or no active students are enrolled in its class.' }); }
      await close(req, true);
      const first = result.rows[0];
      return res.json({ assessment: { id: first.assessment_id, title: first.title, type: first.assessment_type, maxScore: first.max_score, status: first.status, assignmentId: first.assignment_id, className: first.class_name, subjectName: first.subject_name, reporting_period_label: first.reporting_period_label }, students: result.rows.map(row => ({ id: row.student_id, studentNumber: row.student_number, firstName: row.first_name, lastName: row.last_name, score: row.score, feedback: row.feedback, reviewStatus: row.review_status || 'OPEN', returnReason: row.return_reason || null })) });
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
        const result = await req.auth.client.query(`INSERT INTO assessment_scores (school_id, assessment_id, student_id, score, feedback, entered_by, review_status, return_reason, returned_at)
          SELECT $1, a.id, st.id, $5, NULLIF($6, ''), $4, CASE WHEN a.status='OPEN' THEN 'OPEN' ELSE 'PENDING_REVIEW' END, NULL, NULL
          FROM assessments a
          JOIN teacher_subject_assignments ta ON ta.school_id = a.school_id AND ta.id = a.teacher_assignment_id
          JOIN class_enrollments ce ON ce.school_id = ta.school_id AND ce.class_group_id = ta.class_group_id AND ce.status = 'ACTIVE'
          JOIN students st ON st.school_id = ce.school_id AND st.id = ce.student_id AND st.status = 'ACTIVE'
          WHERE a.school_id = $1 AND a.id = $2 AND st.id = $3
            AND (a.status='OPEN' OR (a.status='SUBMITTED_FOR_REVIEW' AND EXISTS (
              SELECT 1 FROM assessment_scores returned_score
              WHERE returned_score.school_id=a.school_id AND returned_score.assessment_id=a.id
                AND returned_score.student_id=st.id AND returned_score.review_status='RETURNED'
            )))
            AND $5 <= a.max_score AND ($7::boolean = false OR ta.teacher_id = $4)
          ON CONFLICT (school_id, assessment_id, student_id) DO UPDATE SET score = EXCLUDED.score, feedback = EXCLUDED.feedback, entered_by = EXCLUDED.entered_by,
            review_status = EXCLUDED.review_status, return_reason = NULL, returned_at = NULL
          RETURNING id`, [req.auth.claims.schoolId, assessmentId, item.studentId, req.auth.claims.userId, item.score, item.feedback, isTeacher]);
        if (!result.rowCount) { await close(req, false); return res.status(400).json({ error: 'A mark exceeds the assessment maximum, belongs to a non-enrolled student, or the assessment is no longer open.' }); }
      }
      await audit(req, 'ASSESSMENT_SCORES_SAVED', 'ASSESSMENT', assessmentId, { count: normalized.length });
      return done(req, res, 200, { saved: normalized.length, notice: 'Marks saved. Returned marks have been resubmitted to the Principal for review.' });
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
      await req.auth.client.query(`UPDATE assessment_scores SET review_status='PENDING_REVIEW' WHERE school_id=$1 AND assessment_id=$2 AND review_status='OPEN'`, [req.auth.claims.schoolId, assessmentId]);
      await audit(req, 'ASSESSMENT_SUBMITTED_FOR_REVIEW', 'ASSESSMENT', assessmentId, { scoredStudents: row.scored_count });
      return done(req, res, 200, { submitted: true });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/assessments/:assessmentId/approve', needsPermission('grades.moderate'), csrf, async (req, res) => {
    const assessmentId = text(req.params.assessmentId, 50);
    try {
      const result = await req.auth.client.query(`SELECT a.id FROM assessments a
        JOIN teacher_subject_assignments ta ON ta.school_id = a.school_id AND ta.id = a.teacher_assignment_id
        WHERE a.school_id = $1 AND a.id = $2 AND a.status IN ('SUBMITTED_FOR_REVIEW','APPROVED')
          AND ta.school_id = a.school_id AND ta.id = a.teacher_assignment_id AND a.created_by <> $3
        FOR UPDATE OF a`, [req.auth.claims.schoolId, assessmentId, req.auth.claims.userId]);
      if (!result.rowCount) { await close(req, false); return res.status(403).json({ error: 'Only an authorized reviewer other than the assessment creator can approve submitted marks.' }); }
      const approved = await req.auth.client.query(`UPDATE assessment_scores SET review_status='APPROVED', moderated_by=$3, moderated_at=now()
        WHERE school_id=$1 AND assessment_id=$2 AND review_status='PENDING_REVIEW' RETURNING student_id`, [req.auth.claims.schoolId, assessmentId, req.auth.claims.userId]);
      const remaining = await req.auth.client.query(`SELECT COUNT(*)::int AS count FROM assessment_scores WHERE school_id=$1 AND assessment_id=$2 AND review_status IN ('PENDING_REVIEW','RETURNED')`, [req.auth.claims.schoolId, assessmentId]);
      if (Number(remaining.rows[0]?.count || 0) === 0) await req.auth.client.query(`UPDATE assessments SET status='APPROVED' WHERE school_id=$1 AND id=$2 AND status<>'PUBLISHED'`, [req.auth.claims.schoolId, assessmentId]);
      await audit(req, 'ASSESSMENT_APPROVED', 'ASSESSMENT', assessmentId, { approvedStudents: approved.rowCount, remainingStudents: Number(remaining.rows[0]?.count || 0) });
      return done(req, res, 200, { approved: true, approvedCount: approved.rowCount, remainingCount: Number(remaining.rows[0]?.count || 0), notice: Number(remaining.rows[0]?.count || 0) ? 'Eligible marks approved. Returned or pending student marks remain in review.' : 'All marks approved and ready to publish.' });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/assessments/:assessmentId/return', needsPermission('grades.moderate'), csrf, async (req, res) => {
    const assessmentId = text(req.params.assessmentId, 50);
    const studentId = text(req.body?.studentId, 50);
    const reason = text(req.body?.reason, 1000);
    if (!assessmentId || !studentId || !reason) { await close(req, false); return res.status(400).json({ error: 'Select one student and enter a reason explaining what that teacher must correct.' }); }
    try {
      const result = await req.auth.client.query(`UPDATE assessment_scores sc SET review_status='RETURNED', return_reason=$4, returned_at=now(), moderated_by=NULL, moderated_at=NULL, published_at=NULL
        FROM assessments a JOIN teacher_subject_assignments ta ON ta.school_id=a.school_id AND ta.id=a.teacher_assignment_id
        WHERE sc.school_id=$1 AND sc.assessment_id=$2 AND sc.student_id=$3 AND a.school_id=sc.school_id AND a.id=sc.assessment_id
          AND a.status IN ('SUBMITTED_FOR_REVIEW','APPROVED') AND a.created_by<>$5
          AND sc.review_status IN ('PENDING_REVIEW','APPROVED')
        RETURNING sc.id`, [req.auth.claims.schoolId, assessmentId, studentId, reason, req.auth.claims.userId]);
      if (!result.rowCount) { await close(req, false); return res.status(403).json({ error: 'That student mark is not awaiting review or cannot be returned by this reviewer.' }); }
      await req.auth.client.query(`UPDATE assessments SET status='SUBMITTED_FOR_REVIEW' WHERE school_id=$1 AND id=$2 AND status='APPROVED'`, [req.auth.claims.schoolId, assessmentId]);
      await audit(req, 'ASSESSMENT_SCORE_RETURNED_FOR_REVISION', 'ASSESSMENT', assessmentId, { studentId, reason });
      return done(req, res, 200, { returned: true, studentId, reason, notice: 'Only this student’s mark was returned. Other marks remain in their current review or publication state.' });
    } catch (error) { return fail(req, res, error); }
  });

  router.post('/assessments/:assessmentId/publish', needsPermission('grades.publish'), csrf, async (req, res) => {
    const assessmentId = text(req.params.assessmentId, 50);
    try {
      const result = await req.auth.client.query(`UPDATE assessment_scores sc SET review_status='PUBLISHED', published_at=now()
        FROM assessments a
        WHERE sc.school_id=$1 AND sc.assessment_id=$2 AND sc.review_status='APPROVED'
          AND a.school_id=sc.school_id AND a.id=sc.assessment_id AND a.status IN ('APPROVED','SUBMITTED_FOR_REVIEW')
        RETURNING sc.student_id`, [req.auth.claims.schoolId, assessmentId]);
      if (!result.rowCount) { await close(req, false); return res.status(400).json({ error: 'There are no approved marks ready to publish for this assessment.' }); }
      const remaining = await req.auth.client.query(`SELECT COUNT(*)::int AS count FROM assessment_scores WHERE school_id=$1 AND assessment_id=$2 AND review_status<>'PUBLISHED'`, [req.auth.claims.schoolId, assessmentId]);
      await req.auth.client.query(`UPDATE assessments SET status=CASE WHEN $3=0 THEN 'PUBLISHED' ELSE 'SUBMITTED_FOR_REVIEW' END WHERE school_id=$1 AND id=$2`, [req.auth.claims.schoolId, assessmentId, Number(remaining.rows[0]?.count || 0)]);
      await audit(req, 'ASSESSMENT_PUBLISHED', 'ASSESSMENT', assessmentId, { publishedStudents: result.rowCount, remainingStudents: Number(remaining.rows[0]?.count || 0) });
      return done(req, res, 200, { published: true, publishedCount: result.rowCount, remainingCount: Number(remaining.rows[0]?.count || 0), notice: Number(remaining.rows[0]?.count || 0) ? 'Approved marks published. Returned or pending marks remain private until corrected, approved, and published.' : 'All marks published to learner and guardian portals.' });
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

  router.get('/portal/workflows', async (req, res) => {
    if (!req.auth.account.roles.includes('STUDENT') || !req.auth.account.permissions.includes('student.portal.read')) {
      await close(req, false); return res.status(403).json({ error: 'This workflow is for linked learner accounts.' });
    }
    try {
      const schoolId = req.auth.claims.schoolId; const userId = req.auth.claims.userId;
      const linked = await req.auth.client.query(`SELECT st.id, ce.class_group_id, c.name AS class_name
        FROM student_portal_links spl JOIN students st ON st.school_id=spl.school_id AND st.id=spl.student_id
        LEFT JOIN class_enrollments ce ON ce.school_id=st.school_id AND ce.student_id=st.id AND ce.status='ACTIVE'
        LEFT JOIN class_groups c ON c.school_id=ce.school_id AND c.id=ce.class_group_id
        WHERE spl.school_id=$1 AND spl.user_id=$2`, [schoolId,userId]);
      if (!linked.rowCount) { await close(req,false); return res.status(404).json({ error:'No learner record is linked to this account.' }); }
      const student = linked.rows[0];
      const [assignments, teachers, threads, notifications, subscriptions] = await Promise.all([
        req.auth.client.query(`SELECT a.id,a.title,a.assessment_type,a.max_score,a.due_at,a.status,s.name AS subject_name,
            ta.id AS teacher_assignment_id, u.full_name AS teacher_name, sub.id AS submission_id,sub.status AS submission_status,
            sub.submitted_at,sub.response_text,sub.attachment_name,sub.feedback,
            CASE WHEN a.status='PUBLISHED' THEN published_score.score END AS score
          FROM assessments a JOIN teacher_subject_assignments ta ON ta.school_id=a.school_id AND ta.id=a.teacher_assignment_id
          JOIN subjects s ON s.school_id=ta.school_id AND s.id=ta.subject_id JOIN user_accounts u ON u.school_id=ta.school_id AND u.id=ta.teacher_id
          LEFT JOIN assessment_submissions sub ON sub.school_id=a.school_id AND sub.assessment_id=a.id AND sub.student_id=$2
          LEFT JOIN assessment_scores published_score ON published_score.school_id=a.school_id AND published_score.assessment_id=a.id AND published_score.student_id=$2
          WHERE a.school_id=$1 AND ta.class_group_id=$3 AND a.assessment_type='ASSIGNMENT' AND a.status IN ('OPEN','CLOSED','PUBLISHED')
          ORDER BY a.due_at NULLS LAST,a.created_at DESC LIMIT 100`, [schoolId,student.id,student.class_group_id]),
        req.auth.client.query(`SELECT DISTINCT u.id AS teacher_id,u.full_name,s.name AS subject_name FROM teacher_subject_assignments ta
          JOIN user_accounts u ON u.school_id=ta.school_id AND u.id=ta.teacher_id JOIN subjects s ON s.school_id=ta.school_id AND s.id=ta.subject_id
          WHERE ta.school_id=$1 AND ta.class_group_id=$2 AND ta.effective_from<=CURRENT_DATE AND (ta.effective_to IS NULL OR ta.effective_to>=CURRENT_DATE)
          AND u.status='ACTIVE' ORDER BY u.full_name,s.name`, [schoolId,student.class_group_id]),
        req.auth.client.query(`SELECT t.id,t.subject,t.updated_at,u.full_name AS teacher_name,
            (SELECT pm.body FROM portal_messages pm WHERE pm.school_id=t.school_id AND pm.thread_id=t.id ORDER BY pm.created_at DESC LIMIT 1) AS latest_message,
            (SELECT pm.created_at FROM portal_messages pm WHERE pm.school_id=t.school_id AND pm.thread_id=t.id ORDER BY pm.created_at DESC LIMIT 1) AS latest_at,
            (SELECT count(*)::int FROM portal_messages pm WHERE pm.school_id=t.school_id AND pm.thread_id=t.id AND pm.sender_user_id<>$2 AND pm.read_at IS NULL) AS unread_count
          FROM portal_message_threads t JOIN user_accounts u ON u.school_id=t.school_id AND u.id=t.teacher_user_id
          WHERE t.school_id=$1 AND t.student_id=$3 ORDER BY t.updated_at DESC LIMIT 100`, [schoolId,userId,student.id]),
        req.auth.client.query(`SELECT id,kind,title,body,target_url,read_at,created_at FROM portal_notifications
          WHERE school_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100`, [schoolId,userId]),
        req.auth.client.query('SELECT count(*)::int AS count FROM push_subscriptions WHERE school_id=$1 AND user_id=$2', [schoolId,userId]),
      ]);
      await close(req,true);
      return res.json({studentId:student.id,className:student.class_name,assignments:assignments.rows,teachers:teachers.rows,threads:threads.rows,notifications:notifications.rows,pushEnabled:Boolean(process.env.VAPID_PUBLIC_KEY),pushSubscribed:Number(subscriptions.rows[0]?.count||0)>0,pushPublicKey:process.env.VAPID_PUBLIC_KEY||null});
    } catch(error) { return fail(req,res,error); }
  });

  router.post('/portal/submissions', csrf, async (req,res) => {
    if (!req.auth.account.roles.includes('STUDENT') || !req.auth.account.permissions.includes('assignments.submit')) { await close(req,false); return res.status(403).json({error:'Only a student can submit their own class assignment.'}); }
    const assessmentId=text(req.body?.assessmentId,50); const responseText=text(req.body?.responseText,20000); const attachment=req.body?.attachment;
    if(!assessmentId || (!responseText && !attachment) || (attachment && (typeof attachment.data!=='string' || attachment.data.length>7_000_000 || !/^[\w.-]{1,180}$/.test(attachment.name||'') || !['application/pdf','image/jpeg','image/png','text/plain'].includes(attachment.mime)))) { await close(req,false); return res.status(400).json({error:'Add written work or one PDF, JPG, PNG or text file up to 5 MB.'}); }
    let bytes=null;
    if(attachment){try{bytes=Buffer.from(attachment.data,'base64');if(bytes.length>5*1024*1024||bytes.toString('base64').replace(/=+$/,'')!==attachment.data.replace(/=+$/,''))throw new Error('Invalid attachment.');}catch{await close(req,false);return res.status(400).json({error:'The attachment is invalid or larger than 5 MB.'});}}
    try{
      const schoolId=req.auth.claims.schoolId;const userId=req.auth.claims.userId;
      const target=await req.auth.client.query(`SELECT st.id,a.id AS assessment_id,a.title,a.due_at,a.status,ta.teacher_id
        FROM student_portal_links spl JOIN students st ON st.school_id=spl.school_id AND st.id=spl.student_id
        JOIN class_enrollments ce ON ce.school_id=st.school_id AND ce.student_id=st.id AND ce.status='ACTIVE'
        JOIN assessments a ON a.school_id=ce.school_id JOIN teacher_subject_assignments ta ON ta.school_id=a.school_id AND ta.id=a.teacher_assignment_id AND ta.class_group_id=ce.class_group_id
        WHERE spl.school_id=$1 AND spl.user_id=$2 AND a.id=$3 AND a.assessment_type='ASSIGNMENT' AND a.status='OPEN' AND (a.due_at IS NULL OR a.due_at>=now())`,[schoolId,userId,assessmentId]);
      if(!target.rowCount){await close(req,false);return res.status(404).json({error:'This assignment is not open for your linked class or the deadline has passed.'});}
      const studentId=target.rows[0].id;
      const result=await req.auth.client.query(`INSERT INTO assessment_submissions(school_id,assessment_id,student_id,response_text,attachment_name,attachment_mime,attachment_bytes,status,submitted_at)
        VALUES($1,$2,$3,NULLIF($4,''),$5,$6,$7,'SUBMITTED',now())
        ON CONFLICT(school_id,assessment_id,student_id) DO UPDATE SET response_text=EXCLUDED.response_text,attachment_name=EXCLUDED.attachment_name,attachment_mime=EXCLUDED.attachment_mime,attachment_bytes=EXCLUDED.attachment_bytes,status='SUBMITTED',submitted_at=now(),updated_at=now(),reviewed_by=NULL,reviewed_at=NULL,feedback=NULL,score=NULL
        WHERE assessment_submissions.status='RETURNED' RETURNING id,submitted_at,status`,[schoolId,assessmentId,studentId,responseText,attachment?.name||null,attachment?.mime||null,bytes]);
      if(!result.rowCount){await close(req,false);return res.status(409).json({error:'Your work has already been submitted. Contact your teacher if a correction is needed.'});}
      const notice=await req.auth.client.query(`INSERT INTO portal_notifications(school_id,user_id,kind,title,body,target_url)
        VALUES($1,$2,'ASSIGNMENT','Assignment submitted',$3,'/portal') RETURNING id`,[schoolId,target.rows[0].teacher_id,`A learner submitted: ${target.rows[0].title}`]);
      await audit(req,'STUDENT_ASSIGNMENT_SUBMITTED','ASSESSMENT_SUBMISSION',result.rows[0].id,{assessmentId});
      const response=await done(req,res,201,{submission:result.rows[0]});
      void pushToUser(schoolId,target.rows[0].teacher_id,{title:'Assignment submitted',body:`A learner submitted: ${target.rows[0].title}`,url:'/portal'});
      return response;
    }catch(error){return fail(req,res,error);}
  });

  router.post('/portal/push-subscriptions', needsPermission('push.register'), csrf, async(req,res)=>{
    if(!req.auth.account.roles.some(role=>['STUDENT','PARENT','TEACHER'].includes(role))){await close(req,false);return res.status(403).json({error:'Push alerts are available only for portal and teacher accounts.'});}
    if(!process.env.VAPID_PUBLIC_KEY){await close(req,false);return res.status(503).json({error:'Push alerts are not configured for this school site yet.'});}
    const subscription=req.body?.subscription;
    if(!subscription||typeof subscription.endpoint!=='string'||!subscription.endpoint.startsWith('https://')||typeof subscription.keys?.p256dh!=='string'||typeof subscription.keys?.auth!=='string'){await close(req,false);return res.status(400).json({error:'The browser did not provide a valid push subscription.'});}
    try{await req.auth.client.query(`INSERT INTO push_subscriptions(school_id,user_id,endpoint,p256dh,auth_secret,user_agent)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(school_id,user_id,endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh,auth_secret=EXCLUDED.auth_secret,user_agent=EXCLUDED.user_agent,updated_at=now()`,[req.auth.claims.schoolId,req.auth.claims.userId,subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth,text(req.get('user-agent'),500)]);
      return done(req,res,201,{saved:true});}catch(error){return fail(req,res,error);}
  });

  // Notification counts are account-scoped; never infer unread state from the
  // total number of published announcements.
  router.get('/portal/notifications/unread', async(req,res)=>{
    if(!req.auth.account.roles.some(role=>['PARENT','STUDENT'].includes(role))){
      await close(req,false);return res.status(403).json({error:'Only student and guardian accounts can view these alerts.'});
    }
    try{
      const schoolId=req.auth.claims.schoolId,userId=req.auth.claims.userId;
      const result=await req.auth.client.query(`SELECT id,kind,title,body,read_at,created_at
        FROM portal_notifications WHERE school_id=$1 AND user_id=$2
        ORDER BY created_at DESC LIMIT 100`,[schoolId,userId]);
      const unread=result.rows.filter(item=>!item.read_at);
      await close(req,true);
      return res.json({unreadCount:unread.length,notifications:result.rows});
    }catch(error){return fail(req,res,error);}
  });

  // Information endpoint only. Portal payment initiation must be explicitly
  // authorized and tested before credentials or financial operations are exposed.
  router.get('/portal/mobile-money/readiness', async(req,res)=>{
    if(!req.auth.account.roles.some(role=>['PARENT','STUDENT'].includes(role))){
      await close(req,false);return res.status(403).json({error:'Student and guardian portal access is required.'});
    }
    await close(req,true);
    return res.json({enabled:false,provider:'MTN MoMo Collections',message:'Mobile Money checkout is being prepared. Please use the school’s verified payment channels until online collection is activated.'});
  });

  router.post('/portal/notifications/:notificationId/read', needsPermission('portal.notifications.read'), csrf, async(req,res)=>{
    try{const r=await req.auth.client.query(`UPDATE portal_notifications SET read_at=COALESCE(read_at,now()) WHERE school_id=$1 AND user_id=$2 AND id=$3 RETURNING id`,[req.auth.claims.schoolId,req.auth.claims.userId,req.params.notificationId]);if(!r.rowCount){await close(req,false);return res.status(404).json({error:'Notification not found.'});}return done(req,res,200,{read:true});}catch(error){return fail(req,res,error);}
  });

  router.post('/portal/messages', needsPermission('portal.messages.write'), csrf, async(req,res)=>{
    if(!req.auth.account.roles.includes('STUDENT')){await close(req,false);return res.status(403).json({error:'Start a conversation from the student portal.'});}
    const teacherId=text(req.body?.teacherId,50);const subject=text(req.body?.subject,160);const body=text(req.body?.body,5000);
    if(!teacherId||!subject||!body){await close(req,false);return res.status(400).json({error:'Choose a teacher and enter a subject and message.'});}
    try{const schoolId=req.auth.claims.schoolId;const userId=req.auth.claims.userId;
      const learner=await req.auth.client.query(`SELECT st.id,ce.class_group_id FROM student_portal_links spl JOIN students st ON st.school_id=spl.school_id AND st.id=spl.student_id JOIN class_enrollments ce ON ce.school_id=st.school_id AND ce.student_id=st.id AND ce.status='ACTIVE' WHERE spl.school_id=$1 AND spl.user_id=$2`,[schoolId,userId]);
      if(!learner.rowCount){await close(req,false);return res.status(403).json({error:'No active class is linked to this learner account.'});}
      const allowed=await req.auth.client.query(`SELECT 1 FROM teacher_subject_assignments WHERE school_id=$1 AND class_group_id=$2 AND teacher_id=$3 AND effective_from<=CURRENT_DATE AND (effective_to IS NULL OR effective_to>=CURRENT_DATE)`,[schoolId,learner.rows[0].class_group_id,teacherId]);
      if(!allowed.rowCount){await close(req,false);return res.status(403).json({error:'Choose a teacher assigned to your current class.'});}
      const thread=await req.auth.client.query(`INSERT INTO portal_message_threads(school_id,student_id,teacher_user_id,subject,created_by)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(school_id,student_id,teacher_user_id,subject) DO UPDATE SET updated_at=now() RETURNING id`,[schoolId,learner.rows[0].id,teacherId,subject,userId]);
      const message=await req.auth.client.query(`INSERT INTO portal_messages(school_id,thread_id,sender_user_id,body) VALUES($1,$2,$3,$4) RETURNING id,body,created_at`,[schoolId,thread.rows[0].id,userId,body]);
      await req.auth.client.query(`INSERT INTO portal_notifications(school_id,user_id,kind,title,body,target_url) VALUES($1,$2,'MESSAGE','New student message',$3,'/portal')`,[schoolId,teacherId,subject]);
      await req.auth.client.query('UPDATE portal_message_threads SET updated_at=now() WHERE school_id=$1 AND id=$2',[schoolId,thread.rows[0].id]);
      await audit(req,'PORTAL_MESSAGE_SENT','PORTAL_MESSAGE',message.rows[0].id,{threadId:thread.rows[0].id});
      await done(req,res,201,{threadId:thread.rows[0].id,message:message.rows[0]});
      void pushToUser(schoolId,teacherId,{title:'New student message',body:subject,url:'/portal'});
      return;
    }catch(error){return fail(req,res,error);}
  });

  router.post('/portal/messages/:threadId', needsPermission('portal.messages.write'), csrf, async(req,res)=>{
    const body=text(req.body?.body,5000);if(!body){await close(req,false);return res.status(400).json({error:'Write a message before sending.'});}
    try{const schoolId=req.auth.claims.schoolId;const userId=req.auth.claims.userId;const isStudent=req.auth.account.roles.includes('STUDENT');
      const thread=await req.auth.client.query(`SELECT t.id,t.student_id,t.teacher_user_id,st.user_id AS student_user_id FROM portal_message_threads t JOIN student_portal_links st ON st.school_id=t.school_id AND st.student_id=t.student_id WHERE t.school_id=$1 AND t.id=$2`,[schoolId,req.params.threadId]);
      if(!thread.rowCount){await close(req,false);return res.status(404).json({error:'Conversation not found.'});}
      const item=thread.rows[0];const authorized=isStudent?item.student_user_id===userId:item.teacher_user_id===userId&&req.auth.account.roles.includes('TEACHER');
      if(!authorized){await close(req,false);return res.status(403).json({error:'You are not a participant in this conversation.'});}
      const recipient=isStudent?item.teacher_user_id:item.student_user_id;
      const message=await req.auth.client.query(`INSERT INTO portal_messages(school_id,thread_id,sender_user_id,body) VALUES($1,$2,$3,$4) RETURNING id,body,created_at`,[schoolId,item.id,userId,body]);
      await req.auth.client.query(`UPDATE portal_messages SET read_at=now() WHERE school_id=$1 AND thread_id=$2 AND sender_user_id<>$3 AND read_at IS NULL`,[schoolId,item.id,userId]);
      await req.auth.client.query('UPDATE portal_message_threads SET updated_at=now() WHERE school_id=$1 AND id=$2',[schoolId,item.id]);
      await req.auth.client.query(`INSERT INTO portal_notifications(school_id,user_id,kind,title,body,target_url) VALUES($1,$2,'MESSAGE','New school message',$3,'/portal')`,[schoolId,recipient,body.slice(0,220)]);
      await audit(req,'PORTAL_MESSAGE_SENT','PORTAL_MESSAGE',message.rows[0].id,{threadId:item.id});
      await done(req,res,201,{message:message.rows[0]});void pushToUser(schoolId,recipient,{title:'New school message',body:body.slice(0,180),url:'/portal'});return;
    }catch(error){return fail(req,res,error);}
  });

  router.get('/portal/messages/:threadId', needsPermission('portal.messages.read'), async(req,res)=>{
    try{const schoolId=req.auth.claims.schoolId;const userId=req.auth.claims.userId;const isStudent=req.auth.account.roles.includes('STUDENT');
      const thread=await req.auth.client.query(`SELECT t.id,t.subject,t.student_id,t.teacher_user_id,sp.user_id AS student_user_id,u.full_name AS teacher_name FROM portal_message_threads t JOIN student_portal_links sp ON sp.school_id=t.school_id AND sp.student_id=t.student_id JOIN user_accounts u ON u.school_id=t.school_id AND u.id=t.teacher_user_id WHERE t.school_id=$1 AND t.id=$2`,[schoolId,req.params.threadId]);
      if(!thread.rowCount){await close(req,false);return res.status(404).json({error:'Conversation not found.'});}const item=thread.rows[0];
      const authorized=isStudent?item.student_user_id===userId:item.teacher_user_id===userId&&req.auth.account.roles.includes('TEACHER');if(!authorized){await close(req,false);return res.status(403).json({error:'You are not a participant in this conversation.'});}
      const messages=await req.auth.client.query(`SELECT m.id,m.body,m.sender_user_id,m.created_at,m.read_at,u.full_name AS sender_name FROM portal_messages m JOIN user_accounts u ON u.school_id=m.school_id AND u.id=m.sender_user_id WHERE m.school_id=$1 AND m.thread_id=$2 ORDER BY m.created_at`,[schoolId,item.id]);
      await req.auth.client.query(`UPDATE portal_messages SET read_at=COALESCE(read_at,now()) WHERE school_id=$1 AND thread_id=$2 AND sender_user_id<>$3`,[schoolId,item.id,userId]);
      await close(req,true);return res.json({thread:{id:item.id,subject:item.subject,teacherName:item.teacher_name},messages:messages.rows});
    }catch(error){return fail(req,res,error);}
  });

  router.get('/teaching/messages', needsPermission('portal.messages.read'), async(req,res)=>{
    if(!req.auth.account.roles.includes('TEACHER')){await close(req,false);return res.status(403).json({error:'Teacher inbox is available only to teacher accounts.'});}
    try{const userId=req.auth.claims.userId;const schoolId=req.auth.claims.schoolId;const [threads,subscriptions]=await Promise.all([
      req.auth.client.query(`SELECT t.id,t.subject,t.updated_at,st.id AS student_id,st.first_name,st.last_name,st.student_number,
        (SELECT pm.body FROM portal_messages pm WHERE pm.school_id=t.school_id AND pm.thread_id=t.id ORDER BY pm.created_at DESC LIMIT 1) AS latest_message,
        (SELECT pm.created_at FROM portal_messages pm WHERE pm.school_id=t.school_id AND pm.thread_id=t.id ORDER BY pm.created_at DESC LIMIT 1) AS latest_at,
        (SELECT count(*)::int FROM portal_messages pm WHERE pm.school_id=t.school_id AND pm.thread_id=t.id AND pm.sender_user_id<>$2 AND pm.read_at IS NULL) AS unread_count
        FROM portal_message_threads t JOIN students st ON st.school_id=t.school_id AND st.id=t.student_id
        JOIN teacher_subject_assignments ta ON ta.school_id=t.school_id AND ta.teacher_id=t.teacher_user_id
        WHERE t.school_id=$1 AND t.teacher_user_id=$2 AND EXISTS(SELECT 1 FROM class_enrollments ce WHERE ce.school_id=t.school_id AND ce.student_id=t.student_id AND ce.class_group_id=ta.class_group_id AND ce.status='ACTIVE')
        ORDER BY t.updated_at DESC LIMIT 200`,[schoolId,userId]),
      req.auth.client.query('SELECT count(*)::int AS count FROM push_subscriptions WHERE school_id=$1 AND user_id=$2',[schoolId,userId])
    ]);await close(req,true);return res.json({threads:threads.rows,pushEnabled:Boolean(process.env.VAPID_PUBLIC_KEY),pushPublicKey:process.env.VAPID_PUBLIC_KEY||null,pushSubscribed:Number(subscriptions.rows[0]?.count||0)>0});}catch(error){return fail(req,res,error);}
  });

  router.get('/teaching/submissions', needsPermission('assignments.review'), async(req,res)=>{
    try{const isTeacher=req.auth.account.roles.includes('TEACHER');const results=await req.auth.client.query(`SELECT sub.id,sub.response_text,sub.attachment_name,sub.attachment_mime,sub.status,sub.submitted_at,sub.feedback,sub.score,st.first_name,st.last_name,st.student_number,a.id AS assessment_id,a.title,a.max_score,a.due_at,s.name AS subject_name FROM assessment_submissions sub JOIN assessments a ON a.school_id=sub.school_id AND a.id=sub.assessment_id JOIN teacher_subject_assignments ta ON ta.school_id=a.school_id AND ta.id=a.teacher_assignment_id JOIN subjects s ON s.school_id=ta.school_id AND s.id=ta.subject_id JOIN students st ON st.school_id=sub.school_id AND st.id=sub.student_id WHERE sub.school_id=$1 AND ($2::boolean=false OR ta.teacher_id=$3) ORDER BY sub.submitted_at DESC LIMIT 300`,[req.auth.claims.schoolId,isTeacher,req.auth.claims.userId]);await close(req,true);return res.json({submissions:results.rows});}catch(error){return fail(req,res,error);}
  });

  router.post('/teaching/submissions/:submissionId/review', needsPermission('assignments.review'), csrf, async(req,res)=>{
    const feedback=text(req.body?.feedback,2000);const score=req.body?.score===''||req.body?.score==null?null:Number(req.body.score);const status=text(req.body?.status,20).toUpperCase();
    if(!['RETURNED','REVIEWED'].includes(status)||(score!==null&&(!Number.isFinite(score)||score<0))){await close(req,false);return res.status(400).json({error:'Choose Return for revision or Mark reviewed, and enter a valid optional score.'});}
    try{const isTeacher=req.auth.account.roles.includes('TEACHER');const updated=await req.auth.client.query(`UPDATE assessment_submissions sub SET status=$4,feedback=NULLIF($5,''),score=$6,reviewed_by=$3,reviewed_at=now(),updated_at=now() FROM assessments a JOIN teacher_subject_assignments ta ON ta.school_id=a.school_id AND ta.id=a.teacher_assignment_id WHERE sub.school_id=$1 AND sub.id=$2 AND a.school_id=sub.school_id AND a.id=sub.assessment_id AND ($7::boolean=false OR ta.teacher_id=$3) AND (a.status='OPEN' OR $6 IS NULL) RETURNING sub.id,sub.assessment_id,sub.student_id,sub.status,sub.score`,[req.auth.claims.schoolId,req.params.submissionId,req.auth.claims.userId,status,feedback,score,isTeacher]);
      if(!updated.rowCount){await close(req,false);return res.status(404).json({error:'Submission not found, or you are not assigned to its class.'});}
      const item=updated.rows[0];if(score!==null){const saved=await req.auth.client.query(`INSERT INTO assessment_scores(school_id,assessment_id,student_id,score,feedback,entered_by) SELECT $1,$2,$3,$4,NULLIF($5,''),$6 WHERE $4<=(SELECT max_score FROM assessments WHERE school_id=$1 AND id=$2) ON CONFLICT(school_id,assessment_id,student_id) DO UPDATE SET score=EXCLUDED.score,feedback=EXCLUDED.feedback,entered_by=EXCLUDED.entered_by,moderated_by=NULL,moderated_at=NULL,published_at=NULL RETURNING id`,[req.auth.claims.schoolId,item.assessment_id,item.student_id,score,feedback,req.auth.claims.userId]);if(!saved.rowCount){await close(req,false);return res.status(400).json({error:'The score exceeds the assignment maximum.'});}}
      await req.auth.client.query(`INSERT INTO portal_notifications(school_id,user_id,kind,title,body,target_url) SELECT $1,spl.user_id,'ASSIGNMENT','Assignment feedback is ready',$3,'/portal' FROM student_portal_links spl WHERE spl.school_id=$1 AND spl.student_id=$2`,[req.auth.claims.schoolId,item.student_id,status==='RETURNED'?'Your teacher returned work for revision.':'Your teacher reviewed your submitted work.']);
      await audit(req,'ASSIGNMENT_SUBMISSION_REVIEWED','ASSESSMENT_SUBMISSION',item.id,{status,scored:score!==null});
      const linked=await req.auth.client.query('SELECT user_id FROM student_portal_links WHERE school_id=$1 AND student_id=$2',[req.auth.claims.schoolId,item.student_id]);
      const response=await done(req,res,200,{submission:item});if(linked.rows[0]?.user_id)void pushToUser(req.auth.claims.schoolId,linked.rows[0].user_id,{title:'Assignment feedback is ready',body:status==='RETURNED'?'Your teacher returned work for revision.':'Your teacher reviewed your submitted work.',url:'/portal'});return response;
    }catch(error){return fail(req,res,error);}
  });

  router.get('/portal/submissions/:submissionId/file', async(req,res)=>{
    try{const isStudent=req.auth.account.roles.includes('STUDENT')&&req.auth.account.permissions.includes('assignments.submit');const isTeacher=req.auth.account.roles.includes('TEACHER')&&req.auth.account.permissions.includes('assignments.review');const r=await req.auth.client.query(`SELECT sub.attachment_name,sub.attachment_mime,sub.attachment_bytes FROM assessment_submissions sub JOIN assessments a ON a.school_id=sub.school_id AND a.id=sub.assessment_id JOIN teacher_subject_assignments ta ON ta.school_id=a.school_id AND ta.id=a.teacher_assignment_id WHERE sub.school_id=$1 AND sub.id=$2 AND sub.attachment_bytes IS NOT NULL AND (($3::boolean AND EXISTS(SELECT 1 FROM student_portal_links sp WHERE sp.school_id=sub.school_id AND sp.student_id=sub.student_id AND sp.user_id=$4)) OR ($5::boolean AND ta.teacher_id=$4))`,[req.auth.claims.schoolId,req.params.submissionId,isStudent,req.auth.claims.userId,isTeacher]);if(!r.rowCount){await close(req,false);return res.status(404).json({error:'Attachment not found or unavailable to this account.'});}await close(req,true);res.setHeader('Content-Type',r.rows[0].attachment_mime);res.setHeader('Content-Disposition',`attachment; filename="${String(r.rows[0].attachment_name).replace(/[\r\n"\\]/g,'_')}"`);res.setHeader('X-Content-Type-Options','nosniff');return res.send(r.rows[0].attachment_bytes);
    }catch(error){return fail(req,res,error);}
  });

  router.get('/portal', async (req, res) => {
    try {
      const schoolId = req.auth.claims.schoolId; const userId = req.auth.claims.userId;
      if (req.auth.account.roles.includes('STUDENT') && req.auth.account.permissions.includes('student.portal.read')) {
        const student = await req.auth.client.query(`SELECT s.id, s.student_number, s.first_name, s.last_name, c.name AS class_name, c.grade_level, y.name AS academic_year FROM student_portal_links l JOIN students s ON s.school_id = l.school_id AND s.id = l.student_id LEFT JOIN class_enrollments ce ON ce.school_id = s.school_id AND ce.student_id = s.id AND ce.status = 'ACTIVE' LEFT JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id LEFT JOIN academic_years y ON y.school_id = c.school_id AND y.id = c.academic_year_id WHERE l.school_id = $1 AND l.user_id = $2 LIMIT 1`, [schoolId, userId]);
        if (!student.rowCount) { await close(req, true); return res.json({ role: 'STUDENT', linked: false, message: 'Your learner portal is not linked to a student record yet.' }); }
        const learner = student.rows[0];
        const [subjects, timetable, attendance, grades, resources, announcements, invoices, receipts, reportCards] = await Promise.all([
          req.auth.client.query(`SELECT subject_name,weekly_minutes,periods_per_week,required,learning_objectives FROM (
            SELECT DISTINCT s.name AS subject_name,gc.weekly_minutes,gc.periods_per_week,gc.required,gc.learning_objectives
            FROM class_enrollments ce JOIN class_groups c ON c.school_id=ce.school_id AND c.id=ce.class_group_id
            JOIN grade_curriculum_subjects gc ON gc.school_id=c.school_id AND gc.grade_level_id=c.grade_level_id AND gc.academic_year_id=c.academic_year_id
            JOIN subjects s ON s.school_id=gc.school_id AND s.id=gc.subject_id
            WHERE ce.school_id=$1 AND ce.student_id=$2 AND ce.status='ACTIVE'
            UNION
            SELECT DISTINCT s.name AS subject_name,gc.weekly_minutes,gc.periods_per_week,COALESCE(gc.required,false) AS required,gc.learning_objectives
            FROM class_enrollments ce JOIN class_groups c ON c.school_id=ce.school_id AND c.id=ce.class_group_id
            JOIN teacher_subject_assignments ta ON ta.school_id=c.school_id AND ta.class_group_id=c.id AND ta.academic_year_id=c.academic_year_id
            JOIN subjects s ON s.school_id=ta.school_id AND s.id=ta.subject_id
            LEFT JOIN grade_curriculum_subjects gc ON gc.school_id=ta.school_id AND gc.grade_level_id=c.grade_level_id AND gc.academic_year_id=c.academic_year_id AND gc.subject_id=ta.subject_id
            WHERE ce.school_id=$1 AND ce.student_id=$2 AND ce.status='ACTIVE'
          ) learner_subjects ORDER BY subject_name`, [schoolId, learner.id]),
          req.auth.client.query(`SELECT ts.day_of_week, tp.name AS period_name, tp.starts_at, tp.ends_at, s.name AS subject_name, u.full_name AS teacher_name FROM class_enrollments ce JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id JOIN teacher_subject_assignments a ON a.school_id = c.school_id AND a.class_group_id = c.id AND a.academic_year_id = c.academic_year_id JOIN timetable_slots ts ON ts.school_id = a.school_id AND ts.teacher_assignment_id = a.id JOIN timetable_periods tp ON tp.school_id = ts.school_id AND tp.id = ts.period_id JOIN subjects s ON s.school_id = a.school_id AND s.id = a.subject_id JOIN user_accounts u ON u.school_id = a.school_id AND u.id = a.teacher_id WHERE ce.school_id = $1 AND ce.student_id = $2 AND ce.status = 'ACTIVE' ORDER BY ts.day_of_week, tp.starts_at`, [schoolId, learner.id]),
          req.auth.client.query(`SELECT sa.status, sa.recorded_at, cs.scheduled_at, s.name AS subject_name FROM student_attendance sa JOIN class_sessions cs ON cs.school_id = sa.school_id AND cs.id = sa.class_session_id JOIN teacher_subject_assignments a ON a.school_id = cs.school_id AND a.id = cs.teacher_assignment_id JOIN subjects s ON s.school_id = a.school_id AND s.id = a.subject_id WHERE sa.school_id = $1 AND sa.student_id = $2 ORDER BY cs.scheduled_at DESC LIMIT 30`, [schoolId, learner.id]),
          req.auth.client.query(`SELECT a.title, a.assessment_type, a.max_score, sc.score, sc.feedback, sc.published_at, s.name AS subject_name FROM assessment_scores sc JOIN assessments a ON a.school_id = sc.school_id AND a.id = sc.assessment_id JOIN teacher_subject_assignments ta ON ta.school_id = a.school_id AND ta.id = a.teacher_assignment_id JOIN subjects s ON s.school_id = ta.school_id AND s.id = ta.subject_id WHERE sc.school_id = $1 AND sc.student_id = $2 AND (sc.review_status='PUBLISHED' OR a.status = 'PUBLISHED') ORDER BY COALESCE(sc.published_at,a.created_at) DESC`, [schoolId, learner.id]),
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
          req.auth.client.query(`SELECT fi.id,fi.invoice_number,fi.currency,fi.status,fi.due_on,fi.created_at,
              y.name AS academic_year_name,
              COALESCE(lines.total,0)::text AS total,COALESCE(payments.paid,0)::text AS paid,
              GREATEST(COALESCE(lines.total,0)-COALESCE(payments.paid,0),0)::text AS balance,
              COALESCE(items.rows,'[]'::jsonb) AS items
            FROM fee_invoices fi
            JOIN academic_years y ON y.school_id=fi.school_id AND y.id=fi.academic_year_id
            LEFT JOIN LATERAL (SELECT SUM(line_amount) AS total FROM fee_invoice_lines l WHERE l.school_id=fi.school_id AND l.invoice_id=fi.id) lines ON true
            LEFT JOIN LATERAL (SELECT SUM(pa.amount) AS paid FROM payment_allocations pa JOIN payments p ON p.school_id=pa.school_id AND p.id=pa.payment_id AND p.status IN ('SUCCEEDED','PARTIALLY_REVERSED') WHERE pa.school_id=fi.school_id AND pa.invoice_id=fi.id) payments ON true
            LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('description',l.description,'quantity',l.quantity::text,'unit_amount',l.unit_amount::text,'line_amount',l.line_amount::text) ORDER BY l.id) AS rows FROM fee_invoice_lines l WHERE l.school_id=fi.school_id AND l.invoice_id=fi.id) items ON true
            WHERE fi.school_id=$1 AND fi.student_id=$2 AND fi.status<>'VOID' ORDER BY fi.due_on NULLS LAST,fi.created_at DESC LIMIT 100`, [schoolId, learner.id]),
          req.auth.client.query(`SELECT DISTINCT p.receipt_number,p.amount::text,p.currency,p.channel,p.received_at,p.status
            FROM payments p JOIN payment_allocations pa ON pa.school_id=p.school_id AND pa.payment_id=p.id
            WHERE p.school_id=$1 AND p.student_id=$2 AND p.status IN ('SUCCEEDED','PARTIALLY_REVERSED')
            ORDER BY p.received_at DESC LIMIT 50`, [schoolId, learner.id]),
          req.auth.client.query(`SELECT rc.id,rc.academic_summary,rc.approved_at,u.full_name AS approved_by,y.name AS academic_year_name
            FROM report_cards rc JOIN user_accounts u ON u.school_id=rc.school_id AND u.id=rc.approved_by
            JOIN academic_years y ON y.school_id=rc.school_id AND y.id=rc.academic_year_id
            WHERE rc.school_id=$1 AND rc.student_id=$2 AND rc.academic_term_id IS NULL AND rc.status='PUBLISHED'
            ORDER BY y.starts_on DESC,rc.snapshot_version DESC`, [schoolId,learner.id]),
        ]);
        await close(req, true); return res.json({ role: 'STUDENT', linked: true, student: learner, subjects: subjects.rows, timetable: timetable.rows, attendance: attendance.rows, grades: grades.rows, reportCards: reportCards.rows, resources: resources.rows, announcements: announcements.rows, invoices: invoices.rows, receipts: receipts.rows, financeVisible: true });
      }
      if (req.auth.account.roles.includes('PARENT') && req.auth.account.permissions.includes('guardian.portal.read')) {
        const children = await req.auth.client.query(`SELECT s.id, s.student_number, s.first_name, s.last_name, s.campus_id, ce.class_group_id, sg.relationship, sg.can_view_results, sg.can_view_finance, c.name AS class_name, c.grade_level FROM guardians g JOIN student_guardians sg ON sg.school_id = g.school_id AND sg.guardian_id = g.id JOIN students s ON s.school_id = sg.school_id AND s.id = sg.student_id LEFT JOIN class_enrollments ce ON ce.school_id = s.school_id AND ce.student_id = s.id AND ce.status = 'ACTIVE' LEFT JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id WHERE g.school_id = $1 AND g.user_id = $2 AND g.active ORDER BY s.last_name, s.first_name`, [schoolId, userId]);
        const results = [];
        for (const child of children.rows) {
          const [subjects, timetable, attendance, grades, resources, invoices, receipts, announcements, reportCards] = await Promise.all([
            req.auth.client.query(`SELECT subject_name,weekly_minutes,periods_per_week,required,learning_objectives FROM (
            SELECT DISTINCT s.name AS subject_name,gc.weekly_minutes,gc.periods_per_week,gc.required,gc.learning_objectives
            FROM class_enrollments ce JOIN class_groups c ON c.school_id=ce.school_id AND c.id=ce.class_group_id
            JOIN grade_curriculum_subjects gc ON gc.school_id=c.school_id AND gc.grade_level_id=c.grade_level_id AND gc.academic_year_id=c.academic_year_id
            JOIN subjects s ON s.school_id=gc.school_id AND s.id=gc.subject_id
            WHERE ce.school_id=$1 AND ce.student_id=$2 AND ce.status='ACTIVE'
            UNION
            SELECT DISTINCT s.name AS subject_name,gc.weekly_minutes,gc.periods_per_week,COALESCE(gc.required,false) AS required,gc.learning_objectives
            FROM class_enrollments ce JOIN class_groups c ON c.school_id=ce.school_id AND c.id=ce.class_group_id
            JOIN teacher_subject_assignments ta ON ta.school_id=c.school_id AND ta.class_group_id=c.id AND ta.academic_year_id=c.academic_year_id
            JOIN subjects s ON s.school_id=ta.school_id AND s.id=ta.subject_id
            LEFT JOIN grade_curriculum_subjects gc ON gc.school_id=ta.school_id AND gc.grade_level_id=c.grade_level_id AND gc.academic_year_id=c.academic_year_id AND gc.subject_id=ta.subject_id
            WHERE ce.school_id=$1 AND ce.student_id=$2 AND ce.status='ACTIVE'
          ) learner_subjects ORDER BY subject_name`, [schoolId, child.id]),
            req.auth.client.query(`SELECT ts.day_of_week, tp.name AS period_name, tp.starts_at, tp.ends_at, s.name AS subject_name, u.full_name AS teacher_name FROM class_enrollments ce JOIN class_groups c ON c.school_id = ce.school_id AND c.id = ce.class_group_id JOIN teacher_subject_assignments a ON a.school_id = c.school_id AND a.class_group_id = c.id AND a.academic_year_id = c.academic_year_id JOIN timetable_slots ts ON ts.school_id = a.school_id AND ts.teacher_assignment_id = a.id JOIN timetable_periods tp ON tp.school_id = ts.school_id AND tp.id = ts.period_id JOIN subjects s ON s.school_id = a.school_id AND s.id = a.subject_id JOIN user_accounts u ON u.school_id = a.school_id AND u.id = a.teacher_id WHERE ce.school_id = $1 AND ce.student_id = $2 AND ce.status = 'ACTIVE' ORDER BY ts.day_of_week, tp.starts_at`, [schoolId, child.id]),
            req.auth.client.query(`SELECT sa.status, cs.scheduled_at, s.name AS subject_name FROM student_attendance sa JOIN class_sessions cs ON cs.school_id = sa.school_id AND cs.id = sa.class_session_id JOIN teacher_subject_assignments a ON a.school_id = cs.school_id AND a.id = cs.teacher_assignment_id JOIN subjects s ON s.school_id = a.school_id AND s.id = a.subject_id WHERE sa.school_id = $1 AND sa.student_id = $2 ORDER BY cs.scheduled_at DESC LIMIT 30`, [schoolId, child.id]),
            child.can_view_results ? req.auth.client.query(`SELECT a.title, a.assessment_type, a.max_score, sc.score, sc.feedback, sc.published_at, s.name AS subject_name FROM assessment_scores sc JOIN assessments a ON a.school_id = sc.school_id AND a.id = sc.assessment_id JOIN teacher_subject_assignments ta ON ta.school_id = a.school_id AND ta.id = a.teacher_assignment_id JOIN subjects s ON s.school_id = ta.school_id AND s.id = ta.subject_id WHERE sc.school_id = $1 AND sc.student_id = $2 AND (sc.review_status='PUBLISHED' OR a.status = 'PUBLISHED') ORDER BY COALESCE(sc.published_at,a.created_at) DESC`, [schoolId, child.id]) : Promise.resolve({ rows: [] }),
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
            child.can_view_finance ? req.auth.client.query(`SELECT fi.id,fi.invoice_number,fi.currency,fi.status,fi.due_on,fi.created_at,
                y.name AS academic_year_name,
                COALESCE(lines.total,0)::text AS total,COALESCE(payments.paid,0)::text AS paid,
                GREATEST(COALESCE(lines.total,0)-COALESCE(payments.paid,0),0)::text AS balance,
                COALESCE(items.rows,'[]'::jsonb) AS items
              FROM fee_invoices fi
              JOIN academic_years y ON y.school_id=fi.school_id AND y.id=fi.academic_year_id
              LEFT JOIN LATERAL (SELECT SUM(line_amount) AS total FROM fee_invoice_lines l WHERE l.school_id=fi.school_id AND l.invoice_id=fi.id) lines ON true
              LEFT JOIN LATERAL (SELECT SUM(pa.amount) AS paid FROM payment_allocations pa JOIN payments p ON p.school_id=pa.school_id AND p.id=pa.payment_id AND p.status IN ('SUCCEEDED','PARTIALLY_REVERSED') WHERE pa.school_id=fi.school_id AND pa.invoice_id=fi.id) payments ON true
              LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('description',l.description,'quantity',l.quantity::text,'unit_amount',l.unit_amount::text,'line_amount',l.line_amount::text) ORDER BY l.id) AS rows FROM fee_invoice_lines l WHERE l.school_id=fi.school_id AND l.invoice_id=fi.id) items ON true
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
            child.can_view_results ? req.auth.client.query(`SELECT rc.id,rc.academic_summary,rc.approved_at,u.full_name AS approved_by,y.name AS academic_year_name
              FROM report_cards rc JOIN user_accounts u ON u.school_id=rc.school_id AND u.id=rc.approved_by
              JOIN academic_years y ON y.school_id=rc.school_id AND y.id=rc.academic_year_id
              WHERE rc.school_id=$1 AND rc.student_id=$2 AND rc.academic_term_id IS NULL AND rc.status='PUBLISHED'
              ORDER BY y.starts_on DESC,rc.snapshot_version DESC`, [schoolId,child.id]) : Promise.resolve({ rows: [] }),
          ]);
          results.push({ ...child, subjects: subjects.rows, timetable: timetable.rows, attendance: attendance.rows, grades: grades.rows, resources: resources.rows,
            reportCards: reportCards.rows, invoices: invoices.rows, receipts: receipts.rows, announcements: announcements.rows, financeVisible: Boolean(child.can_view_finance) });
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

  router.use((error, req, res, next) => {
    if (error?.type === 'entity.too.large') {
      void close(req, false).catch(() => {});
      return res.status(413).json({ error: 'PDF files must be 10 MB or smaller.' });
    }
    return fail(req,res,error);
  });
  return router;
}
