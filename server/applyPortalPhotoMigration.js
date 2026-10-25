// One-time, opt-in staging repair for the missing public-admissions column.
// Requires an administrative DATABASE_URL and an explicitly confirmed backup.
// Never uses the restricted runtime database credentials for schema changes.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const version = '021_portal_photo_submissions.sql';

function dbIdentity(value) {
  const url = new URL(value);
  return [url.hostname.toLowerCase(), url.port || '5432', url.pathname.slice(1)].join('|');
}

export async function applyPortalPhotoMigrationIfRequested() {
  if (process.env.APPLY_PORTAL_PHOTO_MIGRATION_021 !== 'true') return;
  if (process.env.STAGING_DB_BACKUP_CONFIRMED !== 'true') {
    throw new Error('[admissions-migration] Backup confirmation missing; migration not started.');
  }
  const adminUrl = process.env.DATABASE_URL;
  const runtimeUrl = process.env.RUNTIME_DATABASE_URL;
  if (!adminUrl || !runtimeUrl) {
    throw new Error('[admissions-migration] Both DATABASE_URL and RUNTIME_DATABASE_URL must be configured.');
  }
  if (dbIdentity(adminUrl) !== dbIdentity(runtimeUrl)) {
    throw new Error('[admissions-migration] Admin and runtime URLs point to different databases; migration refused.');
  }
  const pool = new pg.Pool({ connectionString: adminUrl, max: 1, connectionTimeoutMillis: 5000 });
  let client;
  let locked = false;
  try {
    client = await pool.connect();
    await client.query('SELECT pg_advisory_lock($1)', [736420261]);
    locked = true;
    const table = await client.query("SELECT to_regclass('schema_migrations') AS migration_table");
    if (!table.rows[0]?.migration_table) {
      throw new Error('[admissions-migration] Migration history missing; refusing to run isolated migration 021.');
    }
    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version=$1', [version]);
    if (applied.rowCount) {
      console.info('[admissions-migration] 021 already applied; no schema changes made.');
      return;
    }
    const sql = await readFile(fileURLToPath(new URL('./migrations/021_portal_photo_submissions.sql', import.meta.url)), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]);
      await client.query('COMMIT');
      console.info('[admissions-migration] Applied 021_portal_photo_submissions.sql');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    if (client) {
      if (locked) await client.query('SELECT pg_advisory_unlock($1)', [736420261]).catch(() => {});
      client.release();
    }
    await pool.end();
  }
}
