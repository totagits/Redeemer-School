import {domainToASCII} from 'node:url';

export class ManifestError extends Error {}

function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ManifestError(`${label} must be an object.`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new ManifestError(`${label}: unsupported field ${key}. Do not include credentials or private records.`);
  return value;
}
function text(value, max, label, optional=false) {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new ManifestError(`Check ${label}.`);
  return value.trim();
}
function code(value, label) {
  const result = text(value,50,label).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(result)) throw new ManifestError(`Check ${label}.`);
  return result;
}
function array(value,max,label) {
  if (!Array.isArray(value) || value.length > max) throw new ManifestError(`Check ${label} (maximum ${max}).`);
  return value;
}
function distinct(values,label) {
  if (new Set(values).size !== values.length) throw new ManifestError(`${label} must be unique.`);
}
export function hostname(value) {
  const raw=text(value,253,'hostname').toLowerCase();
  if(/[\s/:@\\?#%]/.test(raw))throw new ManifestError('Use a domain name without scheme, port, path or wildcard.');
  const host=domainToASCII(raw);
  if (!host || host.length>253 || !host.includes('.') || !host.split('.').every(part=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)) || /^\d+(?:\.\d+){3}$/.test(host)) throw new ManifestError('Use a domain name without scheme, port, path or wildcard.');
  return host;
}
function assetPath(value) {
  const path=text(value,240,'logo path');
  // Assets must be supplied by TOTAG in that school's deployment. No remote
  // tracking URLs, inline SVG/HTML, query strings or directory traversal.
  if (!/^\/institution-assets\/[A-Za-z0-9_-]+\.(png|webp|jpg)$/.test(path)) throw new ManifestError('Logo must be a school-owned PNG, WebP or JPG under /institution-assets/.');
  return path;
}
export function validateInstitutionManifest(input) {
  object(input,['schemaVersion','school','branding','domains','academics','deployment','approvalReference'],'manifest');
  if (input.schemaVersion !== 1) throw new ManifestError('Use manifest schemaVersion 1.');
  const s=object(input.school,['code','name','motto','founded','timezone','currency','address','phones','email'],'school');
  const timezone=text(s.timezone,80,'school timezone');
  try { new Intl.DateTimeFormat('en',{timeZone:timezone}); } catch { throw new ManifestError('Use a valid school timezone.'); }
  if (!['LRD','USD'].includes(s.currency)) throw new ManifestError('Currently supported school currencies are LRD and USD.');
  const phones=array(s.phones,4,'office phones').map(p=>text(p,30,'office phone'));
  if (!phones.length || phones.some(p=>!/^\+?[0-9 ()-]{7,30}$/.test(p))) throw new ManifestError('Enter one to four office phone numbers.');
  const email=text(s.email,254,'public office email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ManifestError('Use a public office email.');
  const school={code:code(s.code,'school code'),name:text(s.name,160,'school name'),motto:text(s.motto,160,'school motto'),timezone,currency:s.currency,address:text(s.address,500,'school address'),phones,email};
  if(s.founded!==undefined){if(typeof s.founded!=='string'||!/^(18|19|20)\d{2}$/.test(s.founded))throw new ManifestError('Use a four-digit establishment year.');school.founded=s.founded;}
  const b=object(input.branding,['logoPath','primaryColor','secondaryColor','accentColor'],'branding');
  const branding={logoPath:assetPath(b.logoPath),primaryColor:text(b.primaryColor,7,'primary colour'),accentColor:text(b.accentColor,7,'accent colour')};
  if (![branding.primaryColor,branding.accentColor].every(c=>/^#[0-9a-f]{6}$/i.test(c))) throw new ManifestError('Use six-digit hex colours.');
  if(b.secondaryColor!==undefined){branding.secondaryColor=text(b.secondaryColor,7,'secondary colour');if(!/^#[0-9a-f]{6}$/i.test(branding.secondaryColor))throw new ManifestError('Use a six-digit secondary colour.');}
  const domains=array(input.domains,10,'domains').map(d=>{
    object(d,['hostname','purpose'],'domain');
    if (!['PUBLIC','STAFF','PORTAL'].includes(d.purpose)) throw new ManifestError('Choose PUBLIC, STAFF or PORTAL domain purpose.');
    return {hostname:hostname(d.hostname),purpose:d.purpose};
  });
  distinct(domains.map(d=>d.hostname),'Domain hostnames');
  if (!domains.some(d=>d.purpose==='PUBLIC')) throw new ManifestError('Specify a requested public domain.');
  const a=object(input.academics,['departments'],'academics');
  const departments=array(a.departments,100,'departments').map(d=>{
    object(d,['code','name','programs'],'department');
    const programs=array(d.programs,100,'programs').map(p=>{
      object(p,['code','name','type','levels','qualification'],'program');
      if (!['GENERAL','TVET'].includes(p.type)) throw new ManifestError('Program type must be GENERAL or TVET.');
      const levels=array(p.levels,30,'program levels').map(l=>text(l,80,'program level'));
      if (!levels.length) throw new ManifestError('A program needs at least one level.');
      distinct(levels,'Program levels');
      return {code:code(p.code,'program code'),name:text(p.name,160,'program name'),type:p.type,levels,qualification:text(p.qualification,160,'qualification')};
    });
    return {code:code(d.code,'department code'),name:text(d.name,160,'department name'),programs};
  });
  distinct(departments.map(d=>d.code),'Department codes');
  distinct(departments.flatMap(d=>d.programs.map(p=>p.code)),'School program codes');
  const d=object(input.deployment,['model','environment','reference','databaseReference'],'deployment');
  if (d.model !== 'DEDICATED_DATABASE') throw new ManifestError('Only dedicated deployments are enabled. Shared SaaS remains gated pending isolation and provider work.');
  if (!['DEVELOPMENT','STAGING','PRODUCTION'].includes(d.environment)) throw new ManifestError('Choose a deployment environment.');
  const reference=value=>{const v=text(value,100,'deployment reference');if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{1,99}$/.test(v))throw new ManifestError('Use an opaque resource name, never a connection URL or credential.');return v;};
  const result={schemaVersion:1,school,branding,domains,academics:{departments},deployment:{model:d.model,environment:d.environment,reference:reference(d.reference),databaseReference:reference(d.databaseReference)},approvalReference:text(input.approvalReference,200,'school configuration approval reference')};
  if (JSON.stringify(result).length>250000) throw new ManifestError('Institution configuration is too large.');
  return result;
}

export function institutionPlan(manifest) {
  const config=validateInstitutionManifest(manifest);
  return {school:config.school.name,code:config.school.code,model:config.deployment.model,environment:config.deployment.environment,
    departments:config.academics.departments.length,programs:config.academics.departments.flatMap(d=>d.programs).length,
    requestedDomains:config.domains.map(d=>d.hostname),
    effects:['Records configuration and reserves requested domain names in the separate TOTAG registry.','Does not create a school database, account, deployment, DNS record, provider connection or public route.','Does not publish content, verify domain ownership or authorize production release.'],
    sharedSaas:'NOT_ENABLED'};
}
