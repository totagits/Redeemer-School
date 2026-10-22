import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import pg from 'pg';
import { hashPassword } from './authCrypto.js';

const { Pool } = pg;

async function askLine(prompt) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}

function askHidden(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Run this command in an interactive terminal so the password can be entered without echo.');
  }

  return new Promise((resolve, reject) => {
    let value = '';
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const finish = (error) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') return finish(new Error('Cancelled.'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ') value += character;
      }
    };

    stdin.on('data', onData);
  });
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required. Use the staging migration/admin connection, not the runtime role.');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
let client;

try {
  client = await pool.connect();
  const privilege = await client.query(
    `SELECT r.rolsuper OR r.rolbypassrls AS can_bootstrap
     FROM pg_roles r WHERE r.rolname = current_user`
  );
  if (privilege.rows[0]?.can_bootstrap !== true) {
    throw new Error('The DATABASE_URL account must be a migration/admin role able to create the first school account.');
  }

  const schoolCode = (await askLine('School code (2–50 letters/numbers, e.g. RIA): ')).toUpperCase();
  const schoolName = await askLine("School name (e.g. Redeemer's International Academy): ");
  const email = (await askLine('Administrator email: ')).toLowerCase();
  const fullName = await askLine('Administrator full name: ');
  const password = await askHidden('Administrator password (at least 12 characters; input hidden): ');
  const confirmation = await askHidden('Re-enter the password: ');

  if (!/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(schoolCode)) throw new Error('School code format is invalid.');
  if (!schoolName || schoolName.length > 200) throw new Error('School name is required and must be 200 characters or fewer.');
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new Error('Administrator email is invalid.');
  if (!fullName || fullName.length > 200) throw new Error('Administrator name is required and must be 200 characters or fewer.');
  if (password !== confirmation) throw new Error('The two passwords do not match.');
  const passwordHash = await hashPassword(password);

  await client.query('BEGIN');
  await client.query(
    `INSERT INTO schools (code, name)
     VALUES ($1, $2)
     ON CONFLICT (code) DO NOTHING`,
    [schoolCode, schoolName]
  );
  const school = await client.query('SELECT id FROM schools WHERE code = $1 FOR UPDATE', [schoolCode]);
  if (!school.rowCount) throw new Error('Could not find or create the school record.');
  const schoolId = school.rows[0].id;
  const existing = await client.query('SELECT 1 FROM user_accounts WHERE school_id = $1 LIMIT 1', [schoolId]);
  if (existing.rowCount) throw new Error('This school already has an account. Use normal account management instead.');

  await client.query(
    `INSERT INTO school_roles (school_id, code, name, is_system_role)
     VALUES ($1, 'SCHOOL_ADMIN', 'School administrator', true)
     ON CONFLICT (school_id, code) DO NOTHING`,
    [schoolId]
  );
  await client.query(
    `INSERT INTO role_permissions (school_id, role_id, permission_code)
     SELECT $1, r.id, p.code
     FROM school_roles r CROSS JOIN permissions p
     WHERE r.school_id = $1 AND r.code = 'SCHOOL_ADMIN'
     ON CONFLICT DO NOTHING`,
    [schoolId]
  );
  const account = await client.query(
    `INSERT INTO user_accounts
       (school_id, email, password_hash, full_name, role, status, must_reset_password)
     VALUES ($1, $2, $3, $4, 'SCHOOL_ADMIN', 'ACTIVE', false)
     RETURNING id`,
    [schoolId, email, passwordHash, fullName]
  );
  const userId = account.rows[0].id;
  await client.query(
    `INSERT INTO user_role_assignments (school_id, user_id, role_id)
     SELECT $1, $2, id FROM school_roles
     WHERE school_id = $1 AND code = 'SCHOOL_ADMIN'
     ON CONFLICT DO NOTHING`,
    [schoolId, userId]
  );
  await client.query(
    `INSERT INTO audit_events (school_id, actor_user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, 'SCHOOL_BOOTSTRAPPED', 'USER_ACCOUNT', $2, '{"method":"interactive_cli"}'::jsonb)`,
    [schoolId, userId]
  );
  await client.query('COMMIT');
  console.log(`Created the initial administrator for ${schoolName} (${schoolCode}).`);
  console.log('The password was not printed or saved by this command.');
} catch (error) {
  if (client) {
    try { await client.query('ROLLBACK'); } catch {}
  }
  console.error(`Administrator bootstrap failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
