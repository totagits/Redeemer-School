import {readFileSync} from 'node:fs';
import path from 'node:path';
import {loadSchoolBuild} from './platform/schoolBuild.js';

export async function initializeDedicatedInstitution({env=process.env,pool,distDir}) {
  const build=loadSchoolBuild(env.SCHOOL_INSTITUTION_MANIFEST,env.SCHOOL_INSTITUTION_ASSETS_DIR);
  let marker;
  try{marker=JSON.parse(readFileSync(path.join(distDir,'institution-build.json'),'utf8'));}
  catch(error){if(build)throw Error('A matching school frontend build is required.');}
  if(!build){if(marker?.buildId)throw Error('Configured frontend requires its matching institution manifest.');return null;}
  if(marker?.buildId!==build.hash || marker.schoolCode!==build.manifest.school.code)throw Error('School configuration and frontend build do not match. Rebuild the reviewed institution package.');
  if(!pool)throw Error('A configured school requires its dedicated runtime database.');
  const role=(await pool.query('SELECT NOT rolsuper AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname=current_user')).rows[0];
  if(!role?.safe)throw Error('School binding requires a restricted runtime database role.');
  const id=(await pool.query('SELECT app.resolve_school_id_by_code($1) AS id',[build.manifest.school.code])).rows[0]?.id;
  if(!id)throw Error('Configured institution is absent from the selected database.');
  let origin;
  try{const url=new URL(env.APP_PUBLIC_URL);if(url.username||url.password||url.protocol!=='https:')throw Error();origin=url;}catch{throw Error('Configured school requires an HTTPS APP_PUBLIC_URL.');}
  const hosts=build.manifest.domains.map(d=>d.hostname);
  if(!hosts.includes(origin.hostname))throw Error('School public URL is outside its reviewed domain list.');
  return Object.freeze({id,code:build.manifest.school.code,school:Object.freeze(build.manifest.school),hosts:Object.freeze(hosts),buildId:build.hash});
}

export function schoolSelectionMatches(req) {
  if(!req.schoolBinding)return true;
  for(const source of [req.query,req.body])for(const [key,expected] of [['schoolCode',req.schoolBinding.code],['schoolId',req.schoolBinding.id]]){
    const value=source?.[key];
    if(value!==undefined && (typeof value!=='string'||(key==='schoolCode'?value.trim().toUpperCase():value)!==expected))return false;
  }
  return true;
}
export function enforceSchoolSelection(req,res,next) {
  if(!schoolSelectionMatches(req))return res.status(403).json({error:'Use the correct school website for this request.'});
  next();
}
export function createDedicatedSchoolGuard(binding) {
  return (req,res,next)=>{
    if(!binding)return next();
    // Health probes contain no institution data and may use a local Host.
    if(req.path==='/api/health/live'||req.path==='/api/health/ready')return next();
    const host=typeof req.headers.host==='string'?req.headers.host.toLowerCase().replace(/:\d+$/,''):'';
    if(!binding.hosts.includes(host))return res.status(421).json({error:'This address is not configured for the school.'});
    req.schoolBinding=binding;
    return enforceSchoolSelection(req,res,next);
  };
}

let current=null;
export function setServerInstitution(binding){current=binding;}
export function serverInstitutionName(){return current?.school.name||"Redeemer's International Academy";}
export function serverPortalName(){return current?current.school.name+' ERP':'Redeemer ERP';}
