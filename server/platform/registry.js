import {validateInstitutionManifest,ManifestError} from './institutionManifest.js';

export class RegistryConflict extends Error {}

function reference(value,label) {
  if(typeof value!=='string'||!value.trim()||value.length>500||/[\u0000-\u001f\u007f]/.test(value))throw new ManifestError(`Supply ${label}.`);
  return value.trim();
}
// Caller supplies a transaction-capable client in the separate control-plane
// database. This function never connects to a school database or any provider.
export async function registerInstitution(client,input,{expectedRevision,operator,reason,beforeCommit}) {
  const config=validateInstitutionManifest(input);
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new ManifestError('Supply the expected revision (0 for a new school).');
  operator=reference(operator,'operator reference'); reason=reference(reason,'change reason');
  await client.query('BEGIN');
  try {
    // One registry-write lock serializes code/domain reservations, including
    // different schools trying to register the same host concurrently.
    await client.query('SELECT pg_advisory_xact_lock($1)',[736420262]);
    await client.query("SELECT set_config('totag.operator_reference',$1,true),set_config('totag.change_reason',$2,true)",[operator,reason]);
    const old=(await client.query('SELECT id,revision,configuration FROM totag_platform.institutions WHERE code=$1 AND environment=$2 FOR UPDATE',[config.school.code,config.deployment.environment])).rows[0];
    if((old?.revision||0)!==expectedRevision)throw new RegistryConflict('Configuration changed. Read the current revision before saving.');
    if(old){
      const prior=old.configuration;
      if(prior.deployment.databaseReference!==config.deployment.databaseReference || prior.deployment.reference!==config.deployment.reference || prior.deployment.environment!==config.deployment.environment)
        throw new RegistryConflict('Deployment/database identity is immutable. Register a separately reviewed environment instead of redirecting a school.');
      const wanted=new Set(config.domains.map(d=>d.hostname));
      if(prior.domains.some(d=>!wanted.has(d.hostname)))throw new RegistryConflict('Domain removal or transfer needs a separate ownership and offboarding review.');
    }
    // Two school registrations must never reference the same dedicated database
    // or deployment. These are opaque resource references, not credentials.
    const resources=await client.query(`SELECT code FROM totag_platform.institutions WHERE (code<>$1 OR environment<>$4) AND
      (configuration->'deployment'->>'databaseReference'=$2 OR configuration->'deployment'->>'reference'=$3)`,[config.school.code,config.deployment.databaseReference,config.deployment.reference,config.deployment.environment]);
    if(resources.rows.length)throw new RegistryConflict('Dedicated deployment and database references must belong to one school only.');
    for(const domain of config.domains){
      const owner=(await client.query('SELECT institution_id FROM totag_platform.requested_domains WHERE hostname=$1',[domain.hostname])).rows[0];
      if(owner && owner.institution_id!==old?.id)throw new RegistryConflict('A requested domain is already reserved by another institution.');
    }
    const revision=expectedRevision+1;
    const saved=(await client.query(`INSERT INTO totag_platform.institutions(code,name,revision,configuration,environment) VALUES($1,$2,$3,$4::jsonb,$5)
      ON CONFLICT(code,environment) DO UPDATE SET name=EXCLUDED.name,revision=EXCLUDED.revision,configuration=EXCLUDED.configuration,updated_at=now()
      RETURNING id,code,name,environment,revision`,[config.school.code,config.school.name,revision,JSON.stringify(config),config.deployment.environment])).rows[0];
    for(const domain of config.domains)await client.query('INSERT INTO totag_platform.requested_domains(hostname,institution_id) VALUES($1,$2) ON CONFLICT(hostname) DO NOTHING',[domain.hostname,saved.id]);
    // The database trigger appends history in this same transaction. The
    // operator role cannot insert, alter or delete history directly.
    if(beforeCommit)await beforeCommit(client,saved);
    await client.query('COMMIT');
    return {...saved,operationalState:'CONFIGURATION_ONLY',sharedSaas:'NOT_ENABLED'};
  }catch(error){await client.query('ROLLBACK');throw error;}
}

export async function readInstitution(client,schoolCode,environment){
  if(!/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(schoolCode))throw new ManifestError('Use a valid school code.');
  if(!['DEVELOPMENT','STAGING','PRODUCTION'].includes(environment))throw new ManifestError('Specify the school environment.');
  const result=await client.query('SELECT code,name,environment,revision,configuration,updated_at FROM totag_platform.institutions WHERE code=$1 AND environment=$2',[schoolCode,environment]);
  return result.rows[0]||null;
}
