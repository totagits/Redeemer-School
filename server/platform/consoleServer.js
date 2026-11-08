import 'dotenv/config';
import pg from 'pg';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createConsoleStore} from './consoleStore.js';
import {createConsoleOidc,oidcConfiguration} from './consoleOidc.js';
import {createConsoleApp} from './consoleApp.js';

const dir=path.dirname(fileURLToPath(import.meta.url));
let pool;
try{
  if(!process.env.TOTAG_REGISTRY_DATABASE_URL||!process.env.TOTAG_REGISTRY_DATABASE_NAME)throw Error('Configure the separate restricted registry connection and exact database name.');
  const config=oidcConfiguration(process.env);
  pool=new pg.Pool({connectionString:process.env.TOTAG_REGISTRY_DATABASE_URL,max:10,connectionTimeoutMillis:5000});
  const target=(await pool.query("SELECT current_database() AS name,to_regclass('public.schools') AS school_table")).rows[0];
  if(target.name!==process.env.TOTAG_REGISTRY_DATABASE_NAME||target.school_table)throw Error('Refusing a school database or unexpected registry target.');
  const role=(await pool.query('SELECT NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AS safe FROM pg_roles WHERE rolname=current_user')).rows[0];
  if(!role?.safe)throw Error('Use a restricted console database login.');
  await pool.query('SELECT id FROM totag_platform.operators LIMIT 0');
  await pool.query('SELECT id FROM totag_platform.school_requests LIMIT 0');
  const store=createConsoleStore(pool),oidc=await createConsoleOidc(config,store);
  const app=createConsoleApp({store,origin:config.origin,oidc,intakeSecret:process.env.TOTAG_SCHOOL_INTAKE_SECRET||null,distDir:path.resolve(dir,'../../console-dist')});
  const server=app.listen(Number(process.env.TOTAG_CONSOLE_PORT||4100),'0.0.0.0',()=>console.log('TOTAG operator console started. School records are not connected.'));
  const stop=()=>server.close(async()=>{await pool.end();process.exit(0);});process.on('SIGTERM',stop);process.on('SIGINT',stop);
}catch{
  await pool?.end();console.error('TOTAG console did not start. Check the separate registry target, restricted role, migrations and workforce identity configuration. No school connection fallback is permitted.');process.exitCode=1;
}
