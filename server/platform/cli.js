import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {institutionPlan,ManifestError} from './institutionManifest.js';
import {registerInstitution,readInstitution,RegistryConflict} from './registry.js';
import {migrateRegistry} from './migrateRegistry.js';

const help=`TOTAG school registry (operator-only; separate control-plane database)

  npm run platform -- plan --manifest <file>
  npm run platform -- migrate --expect-database <exact-name>
  npm run platform -- register --manifest <file> --expect-database <exact-name> --expect-revision <number> --operator <reference> --reason <reason>
  npm run platform -- show --code <school-code> --environment <STAGING|PRODUCTION|DEVELOPMENT> --expect-database <exact-name>
  npm run platform -- list --expect-database <exact-name>
  npm run platform -- history --code <school-code> --environment <STAGING|PRODUCTION|DEVELOPMENT> --expect-database <exact-name>

plan is offline and read-only. Other commands require TOTAG_REGISTRY_DATABASE_URL.
Never set that value to a school database. No command deploys, changes DNS,
enables providers or releases production. Shared SaaS routing is not enabled.`;

function options(args) {
  const result={};
  for(let i=0;i<args.length;i+=2){
    const key=args[i]?.replace(/^--/,'');
    if(!args[i]?.startsWith('--') || !args[i+1] || args[i+1].startsWith('--') || Object.hasOwn(result,key))throw new ManifestError('Use option/value pairs; see --help.');
    result[key]=args[i+1];
  }
  return result;
}
const [command,...args]=process.argv.slice(2);
let pool,client;
try {
  if(!command||command==='--help'){console.log(help);}
  else {
    const allowed={plan:['manifest'],migrate:['expect-database'],register:['manifest','expect-database','expect-revision','operator','reason'],show:['code','environment','expect-database'],list:['expect-database'],history:['code','environment','expect-database']};
    if(!Object.hasOwn(allowed,command))throw new ManifestError('Unknown command; use --help.');
    const opt=options(args);
    if(Object.keys(opt).some(key=>!allowed[command].includes(key)) || allowed[command].some(key=>!opt[key]))throw new ManifestError('Supply exactly the documented options for this command.');
    let manifest;
    if(opt.manifest){
      let raw;try{raw=await readFile(opt.manifest,'utf8');}catch{throw new ManifestError('Cannot read manifest file.');}
      if(Buffer.byteLength(raw)>300000)throw new ManifestError('Manifest file exceeds 300 KB.');
      try{manifest=JSON.parse(raw);}catch{throw new ManifestError('Manifest must be valid JSON.');}
      institutionPlan(manifest);
    }
    if(command==='plan')console.log(JSON.stringify(institutionPlan(manifest),null,2));
    else {
      if(!process.env.TOTAG_REGISTRY_DATABASE_URL)throw new ManifestError('Set the separate TOTAG_REGISTRY_DATABASE_URL secret. No school connection fallback is permitted.');
      pool=new pg.Pool({connectionString:process.env.TOTAG_REGISTRY_DATABASE_URL,max:1,connectionTimeoutMillis:5000});
      client=await pool.connect();
      const target=(await client.query("SELECT current_database() AS name,to_regclass('public.schools') AS school_table")).rows[0];
      if(target.name!==opt['expect-database']||target.school_table)throw new ManifestError('Target mismatch or school database detected. No registry action performed.');
      let result;
      if(command==='migrate')result={applied:await migrateRegistry(client,opt['expect-database'])};
      else {
        const role=(await client.query('SELECT NOT rolsuper AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname=current_user')).rows[0];
        if(!role?.safe)throw new ManifestError('Use a restricted registry operator login, not a database owner or bypass role.');
        if(command==='register'){
          if(!/^(0|[1-9][0-9]*)$/.test(opt['expect-revision']))throw new ManifestError('Expected revision must be a nonnegative integer.');
          result=await registerInstitution(client,manifest,{expectedRevision:Number(opt['expect-revision']),operator:opt.operator,reason:opt.reason});
        }else if(command==='show')result=await readInstitution(client,opt.code.toUpperCase(),opt.environment);
        else if(command==='list')result=(await client.query('SELECT code,name,environment,revision,updated_at FROM totag_platform.institutions ORDER BY code,environment')).rows;
        else {
          const school=await readInstitution(client,opt.code.toUpperCase(),opt.environment);
          result=school?(await client.query(`SELECT h.revision,h.operator_reference,h.change_reason,h.recorded_at FROM totag_platform.configuration_history h
            JOIN totag_platform.institutions i ON i.id=h.institution_id WHERE i.code=$1 AND i.environment=$2 ORDER BY h.revision DESC`,[school.code,school.environment])).rows:[];
        }
      }
      console.log(JSON.stringify(result,null,2));
    }
  }
}catch(error){
  // Database errors can contain connection credentials, submitted values or
  // SQL details. Only our bounded validation/conflict messages are printable.
  console.error(error instanceof ManifestError || error instanceof RegistryConflict ? error.message : 'Registry action failed. Check the target, permissions and private operator logs; no credentials are printed.');
  process.exitCode=1;
}finally{client?.release();await pool?.end();}
