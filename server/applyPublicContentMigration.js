// Explicit one-shot staging migration. Never runs on application startup.
// Inspect backup and pending migrations before setting the confirmation variables.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const VERSION = '100_public_school_posts.sql';
const LOCK = 736420261;
export function identity(value) {
  const url = new URL(value);
  return [url.hostname.toLowerCase(), url.port || '5432', decodeURIComponent(url.pathname.slice(1))].join('|');
}
export function validateGates(env) {
  if (env.REDEEMER_TARGET_ENV !== 'staging') throw Error('Refusing migration outside explicit staging target.');
  if (env.APPLY_PUBLIC_CONTENT_100 !== 'true') throw Error('Migration opt-in flag is not enabled.');
  if (env.STAGING_DB_BACKUP_CONFIRMED !== 'true' || !env.STAGING_DB_BACKUP_REFERENCE?.trim()) {
    throw Error('Verified staging backup confirmation and reference are required.');
  }
  if (!env.DATABASE_URL || !env.RUNTIME_DATABASE_URL) throw Error('Both admin and runtime database URLs are required.');
  if (identity(env.DATABASE_URL) !== identity(env.RUNTIME_DATABASE_URL)) throw Error('Admin and runtime URLs target different databases.');
  if (new URL(env.DATABASE_URL).username === new URL(env.RUNTIME_DATABASE_URL).username) throw Error('Migration and runtime accounts must be different.');
}
export async function applyPublicContentMigration({env=process.env, Pool=pg.Pool, output=console}={}) {
  validateGates(env);
  const pool = new Pool({connectionString:env.DATABASE_URL,max:1,connectionTimeoutMillis:5000});
  let client; let locked=false;
  try {
    client=await pool.connect();
    await client.query('SELECT pg_advisory_lock($1)',[LOCK]);locked=true;
    const history=await client.query("SELECT to_regclass('public.schema_migrations') AS history");
    if (!history.rows[0]?.history) throw Error('schema_migrations missing. Refusing isolated migration.');
    const prerequisites=await client.query(
      "SELECT to_regclass('public.schools') AS schools, to_regclass('public.user_accounts') AS users, to_regprocedure('app.current_school_id()') AS tenant_function, to_regrole('redeemer_runtime') AS runtime_role"
    );
    if(Object.values(prerequisites.rows[0]||{}).some(v=>!v))throw Error('Tenant security prerequisites missing.');
    const state=await client.query('SELECT version FROM schema_migrations ORDER BY version');
    const versions=state.rows.map(row=>row.version);
    if(versions.includes(VERSION)){output.info('Publishing migration 100 already applied. No changes.');return;}
    const pending=versions.filter(version=>/^1\d\d_/.test(version));
    if(pending.length)throw Error('Unexpected higher-number migration history: '+pending.join(', '));
    const existing=await client.query("SELECT to_regclass('public.public_school_posts') AS existing");
    if(existing.rows[0]?.existing)throw Error('Table already exists without migration history; manual reconciliation required.');
    const sql=await readFile(fileURLToPath(new URL('./migrations/100_public_school_posts.sql',import.meta.url)),'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)',[VERSION]);
      await client.query('COMMIT');
      output.info('Applied '+VERSION+' to staging only.');
    } catch(error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    if(client) {
      if(locked)await client.query('SELECT pg_advisory_unlock($1)',[LOCK]).catch(()=>{});
      client.release();
    }
    await pool.end();
  }
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
  applyPublicContentMigration().catch(error=>{console.error('[public-content-migration]',error.message);process.exitCode=1;});
}
