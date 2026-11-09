import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {validateSchoolRequest} from '../../shared/schoolRequest.js';
import {ConsoleAccessError} from './consoleStore.js';
import {RegistryConflict} from './registry.js';
export function intakeSignature(secret,timestamp,raw){return createHmac('sha256',secret).update(timestamp+'.').update(raw).digest('hex');}
export function verifyIntake(secret,timestamp,signature,raw,now=Date.now()){
 if(typeof secret!=='string'||secret.length<43||!/^\d{13}$/.test(timestamp||'')||Math.abs(now-Number(timestamp))>300000||!/^[a-f0-9]{64}$/.test(signature||'')||!Buffer.isBuffer(raw)||raw.length>20000)return false;
 return timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(intakeSignature(secret,timestamp,raw),'hex'));
}
export function requireRequestManager(operator){if(operator.access_level!=='GLOBAL_CONFIGURATOR')throw new ConsoleAccessError('Only approved TOTAG portfolio managers can review new school requests.');}
export async function receiveSchoolRequest(client,input){
 const request=validateSchoolRequest(input),hash=createHash('sha256').update(JSON.stringify(request)).digest('hex');
 await client.query('BEGIN');try{
  await client.query('SELECT pg_advisory_xact_lock($1)',[736420263]);
  const old=(await client.query('SELECT reference,payload_hash FROM totag_platform.school_requests WHERE source_request_id=$1',[request.requestId])).rows[0];
  if(old){if(old.payload_hash!==hash)throw new RegistryConflict('This request reference was already used with different details.');await client.query('COMMIT');return old.reference;}
  const reference='SCH-'+new Date().getUTCFullYear()+'-'+randomBytes(6).toString('hex').toUpperCase();
  const saved=(await client.query('INSERT INTO totag_platform.school_requests(source_request_id,reference,payload_hash,request_data) VALUES($1,$2,$3,$4::jsonb) RETURNING id',[request.requestId,reference,hash,JSON.stringify(request)])).rows[0];
  await client.query("INSERT INTO totag_platform.school_request_events(request_id,status,reason,revision) VALUES($1,'NEW','Received from the TOTAG school product request form.',1)",[saved.id]);
  await client.query('COMMIT');return reference;
 }catch(e){await client.query('ROLLBACK');throw e;}
}
export async function reviewSchoolRequest(client,id,operator,{expectedRevision,status,reason}){
 requireRequestManager(operator);
 if(typeof reason!=='string'||reason.trim().length<10||reason.length>1000)throw new ConsoleAccessError('Add a review note of 10–1000 characters.',400);
 await client.query('BEGIN');try{
  const row=(await client.query('SELECT * FROM totag_platform.school_requests WHERE id=$1 FOR UPDATE',[id])).rows[0];
  const allowed={NEW:['UNDER_REVIEW','DECLINED'],UNDER_REVIEW:['WAITING_FOR_INFORMATION','DECLINED'],WAITING_FOR_INFORMATION:['UNDER_REVIEW','DECLINED']};
  if(!row||row.revision!==expectedRevision||!allowed[row.status]?.includes(status))throw new RegistryConflict('Reload the request before changing its review status.');
  const saved=(await client.query('UPDATE totag_platform.school_requests SET status=$2,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',[id,status])).rows[0];
  await requestEvent(client,saved,operator,reason.trim());await client.query('COMMIT');return saved;
 }catch(e){await client.query('ROLLBACK');throw e;}
}
async function requestEvent(client,row,operator,reason){await client.query('INSERT INTO totag_platform.school_request_events(request_id,operator_id,status,reason,revision) VALUES($1,$2,$3,$4,$5)',[row.id,operator.id,row.status,reason,row.revision]);}
// Runs inside registerInstitution's transaction: failed/stale linkage rolls back
// the configuration, domain reservations and both histories together.
export async function linkSchoolRequest(client,id,expectedRevision,institution,operator,reason){
 requireRequestManager(operator);
 const row=(await client.query('SELECT * FROM totag_platform.school_requests WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!row||row.status!=='UNDER_REVIEW'||row.revision!==expectedRevision)throw new RegistryConflict('The source request changed. Reload it before preparing configuration.');
 const saved=(await client.query("UPDATE totag_platform.school_requests SET status='CONFIGURATION_PREPARED',institution_id=$2,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",[id,institution.id])).rows[0];
 await requestEvent(client,saved,operator,reason);
}
