import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export async function migrateRegistry(client,expectedDatabase) {
  if(!expectedDatabase || !/^[A-Za-z0-9_-]{2,100}$/.test(expectedDatabase))throw new Error('Supply the exact registry database name.');
  const check=(await client.query("SELECT current_database() AS name, to_regclass('public.schools') AS school_table")).rows[0];
  if(check.name!==expectedDatabase || check.school_table)throw new Error('Registry migration target mismatch or school database detected. No migration applied.');
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock($1)',[736420262]);
    await client.query(`CREATE TABLE IF NOT EXISTS public.totag_registry_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`);
    const directory=new URL('./migrations/',import.meta.url),applied=[];
    for(const file of (await readdir(directory)).filter(f=>/^\d+_[a-z_]+\.sql$/.test(f)).sort()) {
      const sql=await readFile(new URL(file,directory),'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
      const existing=(await client.query('SELECT checksum FROM public.totag_registry_migrations WHERE version=$1',[file])).rows[0];
      if(existing){if(existing.checksum!==checksum)throw new Error('An applied registry migration changed. Restore the reviewed file.');continue;}
      await client.query(sql);
      await client.query('INSERT INTO public.totag_registry_migrations(version,checksum) VALUES($1,$2)',[file,checksum]);
      applied.push(file);
    }
    await client.query('COMMIT');return applied;
  }catch(error){await client.query('ROLLBACK');throw error;}
}
