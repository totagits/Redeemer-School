import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {validateSchoolRequest} from '../shared/schoolRequest.js';
import {intakeSignature,verifyIntake,receiveSchoolRequest,reviewSchoolRequest,linkSchoolRequest,requireRequestManager} from './platform/schoolRequests.js';
import {migrateRegistry} from './platform/migrateRegistry.js';
import {registerInstitution} from './platform/registry.js';
const input={schemaVersion:1,requestId:'12345678-1234-4123-8123-123456789012',schoolName:'TEST Request School',contactName:'Fictional Coordinator',email:'contact@example.invalid',schoolLocation:'Fictional location',requestedAreas:['Website','TVET'],message:'Fictional school management request for isolated tests.',consent:true};
test('school intake rejects malformed fields, unsigned/tampered requests and expired signatures',()=>{
 const secret='fictional-local-intake-secret-not-for-live-use-123456789',time=String(Date.now()),raw=Buffer.from(JSON.stringify(input)),signature=intakeSignature(secret,time,raw);
 assert.equal(verifyIntake(secret,time,signature,raw),true);
 for(const args of [[secret,time,signature,Buffer.from('{}')],[secret,time,'a'.repeat(64),raw],[secret,String(Number(time)-300001),signature,raw],['short',time,signature,raw]])assert.equal(verifyIntake(...args),false);
 for(const body of [{...input,password:'secret'},{...input,consent:false},{...input,requestedAreas:['Unknown']},{...input,brandingPreference:{primaryColor:'url(x)'}},{...input,estimatedLearners:-1},{...input,requestId:'bad'}])assert.throws(()=>validateSchoolRequest(body));
 assert.throws(()=>requireRequestManager({access_level:'SCOPED'}));
});
test('school request retries are idempotent, review is versioned and preparation links atomically',async()=>{
 const db=new PGlite(),client={query:async(sql,args)=>{if(!args&&sql.includes('CREATE ')){await db.exec(sql);return {rows:[]};}return db.query(sql,args);}};
 try{
  await migrateRegistry(client,(await client.query('SELECT current_database() AS name')).rows[0].name);
  const operator=(await client.query("INSERT INTO totag_platform.operators(issuer,subject,display_name,access_level) VALUES('https://example.invalid','test','Fictional manager','GLOBAL_CONFIGURATOR') RETURNING *")).rows[0];
  await db.exec('SET ROLE totag_registry_operator');
  const reference=await receiveSchoolRequest(client,input);assert.match(reference,/^SCH-\d{4}-[A-F0-9]{12}$/);
  assert.equal(await receiveSchoolRequest(client,input),reference);
  await assert.rejects(()=>receiveSchoolRequest(client,{...input,message:'A different request using the same identifier.'}));
  let row=(await client.query('SELECT * FROM totag_platform.school_requests')).rows[0];assert.equal(row.revision,1);
  await assert.rejects(()=>reviewSchoolRequest(client,row.id,{...operator,access_level:'SCOPED'},{expectedRevision:1,status:'UNDER_REVIEW',reason:'Fictional review started'}));
  row=await reviewSchoolRequest(client,row.id,operator,{expectedRevision:1,status:'UNDER_REVIEW',reason:'Fictional review started'});assert.equal(row.revision,2);
  await assert.rejects(()=>reviewSchoolRequest(client,row.id,operator,{expectedRevision:1,status:'DECLINED',reason:'Stale fictional review denied'}));
  const manifest=JSON.parse(await readFile(new URL('../examples/institutions/fictional-tvet-school.json',import.meta.url),'utf8'));
  const change={expectedRevision:0,operator:operator.id,reason:'Approved fictional request configuration',beforeCommit:(c,s)=>linkSchoolRequest(c,row.id,1,s,operator,'Fictional stale request linkage')};
  await assert.rejects(()=>registerInstitution(client,manifest,change));
  assert.equal((await client.query('SELECT * FROM totag_platform.institutions')).rows.length,0);
  assert.equal((await client.query('SELECT * FROM totag_platform.requested_domains')).rows.length,0);
  assert.equal((await client.query('SELECT * FROM totag_platform.configuration_history')).rows.length,0);
  const school=await registerInstitution(client,manifest,{...change,beforeCommit:(c,s)=>linkSchoolRequest(c,row.id,2,s,operator,'Fictional approved preparation')});
  row=(await client.query('SELECT * FROM totag_platform.school_requests')).rows[0];assert.equal(row.institution_id,school.id);assert.equal(row.status,'CONFIGURATION_PREPARED');
  assert.equal((await client.query('SELECT * FROM totag_platform.school_request_events')).rows.length,3);
  await assert.rejects(()=>reviewSchoolRequest(client,row.id,operator,{expectedRevision:3,status:'UNDER_REVIEW',reason:'Cannot reopen prepared configuration'}));
  await assert.rejects(()=>client.query('DELETE FROM totag_platform.school_request_events'));
 }finally{await db.close();}
});
