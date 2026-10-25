import { randomBytes, randomUUID } from 'node:crypto';
import express from 'express';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_SUBMISSIONS_PER_WINDOW = 6;
const attemptsByIp = new Map();
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(value, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validDate(value) {
  if (!value) return true;
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function allowSubmission(ip, now = Date.now()) {
  const current = (attemptsByIp.get(ip) || []).filter(time => now - time < WINDOW_MS);
  if (current.length >= MAX_SUBMISSIONS_PER_WINDOW) {
    attemptsByIp.set(ip, current);
    return false;
  }
  current.push(now);
  attemptsByIp.set(ip, current);
  return true;
}

async function schoolTransaction(pool, schoolCode) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resolved = await client.query('SELECT app.resolve_school_id_by_code($1) AS id', [schoolCode]);
    const schoolId = resolved.rows[0]?.id;
    if (!schoolId) {
      await client.query('ROLLBACK');
      client.release();
      return { error: 'The school application form could not be found.' };
    }
    await client.query("SELECT set_config('app.current_school_id', $1, true)", [schoolId]);
    return { client, schoolId };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    throw error;
  }
}

export function createPublicAdmissionsRouter({ pool }) {
  const router = express.Router();

  router.get('/options', async (req, res) => {
    const schoolCode = clean(req.query.schoolCode, 50).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(schoolCode)) return res.status(400).json({ error: 'A valid school code is required.' });
    let tx;
    try {
      tx = await schoolTransaction(pool, schoolCode);
      if (tx.error) return res.status(404).json({ error: tx.error });
      const [school, levels, classes] = await Promise.all([
        tx.client.query('SELECT name FROM schools WHERE id=$1', [tx.schoolId]),
        tx.client.query('SELECT id,code,name FROM education_levels WHERE school_id=$1 AND active ORDER BY sort_order,name', [tx.schoolId]),
        tx.client.query(`SELECT cg.id,cg.name,cg.grade_level,cg.education_level_id
          FROM class_groups cg JOIN academic_years ay ON ay.school_id=cg.school_id AND ay.id=cg.academic_year_id AND ay.status='ACTIVE'
          WHERE cg.school_id=$1 ORDER BY cg.grade_level,cg.name`, [tx.schoolId]),
      ]);
      await tx.client.query('COMMIT'); tx.client.release();
      return res.set('Cache-Control', 'no-store').json({ schoolName: school.rows[0]?.name || 'School', levels: levels.rows, classes: classes.rows });
    } catch {
      if (tx?.client) { try { await tx.client.query('ROLLBACK'); } catch {} tx.client.release(); }
      return res.status(503).json({ error: 'The application form is temporarily unavailable. Please try again later.' });
    }
  });

  router.post('/apply', async (req, res) => {
    const schoolCode = clean(req.body?.schoolCode, 50).toUpperCase();
    const firstName = clean(req.body?.firstName);
    const middleName = clean(req.body?.middleName);
    const lastName = clean(req.body?.lastName);
    const guardianFirstName = clean(req.body?.guardianFirstName);
    const guardianLastName = clean(req.body?.guardianLastName);
    const relationship = clean(req.body?.relationship, 50);
    const email = clean(req.body?.email, 254).toLowerCase();
    const phone = clean(req.body?.phone, 40);
    const dateOfBirth = clean(req.body?.dateOfBirth, 10);
    const sex = clean(req.body?.sex, 12).toUpperCase();
    const requestedLevelId = clean(req.body?.requestedLevelId, 50) || null;
    const requestedClassGroupId = clean(req.body?.requestedClassGroupId, 50) || null;
    const notes = clean(req.body?.notes, 1000);

    // Quietly absorb basic bot submissions without creating school records.
    if (clean(req.body?.website, 200)) return res.status(202).json({ accepted: true });
    if (!allowSubmission(req.ip || 'unknown')) return res.status(429).json({ error: 'Too many applications came from this connection. Please wait 15 minutes or contact the school.' });
    if (!/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(schoolCode) || !firstName || !lastName || !guardianFirstName || !guardianLastName || !relationship || (!email && !phone) || (email && !EMAIL_RE.test(email)) || (phone && !/^[+0-9() .-]{7,40}$/.test(phone)) || !validDate(dateOfBirth) || (sex && !['F','M','X','UNDISCLOSED'].includes(sex)) || req.body?.consent !== true) {
      return res.status(400).json({ error: 'Complete the applicant and guardian names, relationship, one valid contact method, and consent. Check optional date and sex values.' });
    }

    let tx;
    try {
      tx = await schoolTransaction(pool, schoolCode);
      if (tx.error) return res.status(404).json({ error: tx.error });
      const applicationNumber = `${schoolCode}-${new Date().getUTCFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
      const applicationId = randomUUID();
      const inserted = await tx.client.query(`INSERT INTO admission_applications
          (id,school_id,application_number,first_name,middle_name,last_name,date_of_birth,sex,notes,requested_level_id,requested_class_group_id,created_by,application_source)
        SELECT $1,$2,$3,$4,NULLIF($5,''),$6,NULLIF($7,'')::date,NULLIF($8,''),NULLIF($9,''),el.id,cg.id,NULL,'PUBLIC'
        FROM (SELECT 1) seed
        LEFT JOIN education_levels el ON el.school_id=$2 AND el.id=$10 AND el.active
        LEFT JOIN class_groups cg ON cg.school_id=$2 AND cg.id=$11
        WHERE ($10::uuid IS NULL OR el.id IS NOT NULL) AND ($11::uuid IS NULL OR cg.id IS NOT NULL)
          AND ($10::uuid IS NULL OR cg.education_level_id IS NULL OR cg.education_level_id=$10)
        RETURNING id,application_number`,
      [applicationId,tx.schoolId,applicationNumber,firstName,middleName,lastName,dateOfBirth,sex,notes,requestedLevelId,requestedClassGroupId]);
      if (!inserted.rowCount) {
        await tx.client.query('ROLLBACK'); tx.client.release();
        return res.status(400).json({ error: 'Choose an education level and class that belong to this school. If the class is in another level, choose the matching level or leave class placement for later.' });
      }
      await tx.client.query(`INSERT INTO admission_guardians (school_id,application_id,first_name,last_name,relationship,phone,email,is_primary)
        VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),NULLIF($7,''),true)`, [tx.schoolId,applicationId,guardianFirstName,guardianLastName,relationship,phone,email]);
      await tx.client.query(`INSERT INTO admission_events (school_id,application_id,event_type,actor_user_id,details)
        VALUES ($1,$2,'APPLICATION_RECEIVED',NULL,$3::jsonb)`, [tx.schoolId,applicationId,JSON.stringify({ status:'RECEIVED', source:'PUBLIC_WEB', consent:true })]);
      await tx.client.query(`INSERT INTO audit_events (school_id,actor_user_id,action,entity_type,entity_id,details)
        VALUES ($1,NULL,'PUBLIC_ADMISSION_SUBMITTED','ADMISSION_APPLICATION',$2,$3::jsonb)`, [tx.schoolId,applicationId,JSON.stringify({ applicationNumber, source:'PUBLIC_WEB' })]);
      await tx.client.query('COMMIT'); tx.client.release();
      return res.status(201).set('Cache-Control','no-store').json({ accepted:true, applicationNumber });
    } catch (error) {
      if (tx?.client) { try { await tx.client.query('ROLLBACK'); } catch {} tx.client.release(); }
      return res.status(503).json({ error: 'The application could not be saved. Please try again or contact the school.' });
    }
  });

  return router;
}

export function resetPublicAdmissionsRateLimitForTests() { attemptsByIp.clear(); }
