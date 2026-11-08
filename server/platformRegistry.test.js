import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';
import {validateInstitutionManifest,institutionPlan,hostname} from './platform/institutionManifest.js';
import {registerInstitution,readInstitution,RegistryConflict} from './platform/registry.js';
import {migrateRegistry} from './platform/migrateRegistry.js';
import {assertSchoolRuntimeMode} from './hostingMode.js';

const example=JSON.parse(await readFile(new URL('../examples/institutions/fictional-tvet-school.json',import.meta.url),'utf8'));
const clone=()=>structuredClone(example);
const change={operator:'TEST operator reference',reason:'Fictional isolated configuration rehearsal',expectedRevision:0};

test('school runtime defaults to dedicated hosting and refuses premature shared activation',()=>{
  assert.equal(assertSchoolRuntimeMode({}),'DEDICATED_DATABASE');
  assert.equal(assertSchoolRuntimeMode({SCHOOL_HOSTING_MODE:'DEDICATED_DATABASE'}),'DEDICATED_DATABASE');
  for(const mode of ['SHARED_SAAS','shared','unknown'])assert.throws(()=>assertSchoolRuntimeMode({SCHOOL_HOSTING_MODE:mode}),/separate isolation/);
});

test('institution configuration validates TVET catalog and refuses secrets, unsafe assets and unimplemented shared mode',()=>{
  const config=validateInstitutionManifest(clone());
  assert.equal(config.academics.departments.length,4);
  assert.equal(institutionPlan(config).sharedSaas,'NOT_ENABLED');
  for(const mutate of [
    x=>{x.databaseUrl='postgres://secret';},
    x=>{x.school.password='secret';},
    x=>{x.branding.logoPath='https://tracker.example/logo.svg';},
    x=>{x.branding.logoPath='/institution-assets/../private.png';},
    x=>{x.branding.primaryColor='url(x)';},
    x=>{x.deployment.model='SHARED_SAAS';},
    x=>{x.deployment.databaseReference='postgres://user:password@db/school';},
    x=>{x.school.timezone='not/timezone';},
    x=>{x.academics.departments.push(x.academics.departments[0]);},
    x=>{x.academics.departments[1].programs[0].code=x.academics.departments[0].programs[0].code;},
    x=>{x.domains.push({...x.domains[0]});},
  ]){const value=clone();mutate(value);assert.throws(()=>validateInstitutionManifest(value));}
  assert.equal(hostname('Staff.Example.INVALID'),'staff.example.invalid');
  for(const invalid of ['https://school.example','school.example/path','school.example:443','*.school.example','127.0.0.1','school..example','school.example.','school.example\n'])assert.throws(()=>hostname(invalid));
});

test('TOTAG offline plan needs no database, prints no credentials and does not alter source manifest',()=>{
  const path=new URL('../examples/institutions/fictional-tvet-school.json',import.meta.url);
  const result=spawnSync(process.execPath,['server/platform/cli.js','plan','--manifest',path.pathname.replace(/^\/([A-Za-z]:)/,'$1')],{encoding:'utf8',env:{...process.env,TOTAG_REGISTRY_DATABASE_URL:'postgres://do-not-contact:secret@example.invalid/none'}});
  assert.equal(result.status,0,result.stderr);
  const plan=JSON.parse(result.stdout);
  assert.equal(plan.code,'TEST-TVET');assert.equal(plan.programs,4);
  assert.equal(plan.sharedSaas,'NOT_ENABLED');assert.doesNotMatch(result.stdout,/do-not-contact|postgres:|secret/);
});

function adapter(db){return {query:async(sql,args)=>{
  if(!args && sql.includes('CREATE SCHEMA')){await db.exec(sql);return {rows:[]};}
  return db.query(sql,args);
}};}

test('registry persists two independent configurations, blocks resource takeover, preserves revisions and restricts operator access',async t=>{
  const db=new PGlite(),client=adapter(db);
  try {
    const database=(await db.query('SELECT current_database() AS name')).rows[0].name;
    await assert.rejects(()=>migrateRegistry(client,'wrong_database'));
    assert.deepEqual(await migrateRegistry(client,database),['001_registry.sql']);
    assert.deepEqual(await migrateRegistry(client,database),[]);
    await db.exec('SET ROLE totag_registry_operator');
    const schoolA=clone(),schoolB=clone();
    schoolB.school.code='TEST-SECOND';schoolB.school.name='TEST Second School';
    schoolB.branding.primaryColor='#14532D';schoolB.branding.logoPath='/institution-assets/second-school.png';
    schoolB.domains=[{hostname:'second.example.invalid',purpose:'PUBLIC'}];
    schoolB.deployment.reference='test-second-app';schoolB.deployment.databaseReference='test-second-db';
    schoolB.academics.departments=[];
    const a=await registerInstitution(client,schoolA,change),b=await registerInstitution(client,schoolB,change);
    assert.notEqual(a.id,b.id);
    await t.test('one school retains its identity, branding and TVET catalog independently',async()=>{
      const one=await readInstitution(client,'TEST-TVET','STAGING'),two=await readInstitution(client,'TEST-SECOND','STAGING');
      assert.equal(one.configuration.school.name,schoolA.school.name);
      assert.equal(two.configuration.school.name,schoolB.school.name);
      assert.equal(one.configuration.academics.departments.length,4);
      assert.equal(two.configuration.academics.departments.length,0);
      assert.notEqual(one.configuration.branding.logoPath,two.configuration.branding.logoPath);
    });
    await t.test('one school has independently reviewed staging and production configurations without activating either',async()=>{
      const production=clone();production.deployment.environment='PRODUCTION';
      production.deployment.reference='test-tvet-production-app';production.deployment.databaseReference='test-tvet-production-db';
      production.domains=[{hostname:'school.test-tvet.example.invalid',purpose:'PUBLIC'}];
      const saved=await registerInstitution(client,production,change);
      assert.equal(saved.operationalState,'CONFIGURATION_ONLY');
      assert.equal((await readInstitution(client,'TEST-TVET','PRODUCTION')).revision,1);
      assert.equal((await readInstitution(client,'TEST-TVET','STAGING')).revision,1);
      const bad=structuredClone(production);bad.deployment.environment='DEVELOPMENT';
      await assert.rejects(()=>registerInstitution(client,bad,change),RegistryConflict);
      assert.equal(await readInstitution(client,'TEST-TVET','DEVELOPMENT'),null);
    });
    await t.test('duplicate domains, database references and deployment references cannot cross schools',async()=>{
      for(const mutate of [
        x=>{x.domains=[...schoolA.domains];},
        x=>{x.deployment.databaseReference=schoolA.deployment.databaseReference;},
        x=>{x.deployment.reference=schoolA.deployment.reference;},
      ]){const candidate=structuredClone(schoolB);candidate.school.code='TEST-THIRD';candidate.deployment.reference='third-app';candidate.deployment.databaseReference='third-db';mutate(candidate);await assert.rejects(()=>registerInstitution(client,candidate,change),RegistryConflict);}
      assert.equal(await readInstitution(client,'TEST-THIRD','STAGING'),null);
    });
    await t.test('stale updates and domain removal roll back without altering saved history',async()=>{
      const changed=clone();changed.school.motto='Updated fictional motto';
      await assert.rejects(()=>registerInstitution(client,changed,change),RegistryConflict);
      assert.equal((await registerInstitution(client,changed,{...change,expectedRevision:1})).revision,2);
      await assert.rejects(()=>registerInstitution(client,changed,{...change,expectedRevision:1}),RegistryConflict);
      changed.domains=changed.domains.slice(0,1);
      await assert.rejects(()=>registerInstitution(client,changed,{...change,expectedRevision:2}),RegistryConflict);
      assert.equal((await readInstitution(client,'TEST-TVET','STAGING')).revision,2);
      const rows=(await db.query('SELECT revision,configuration FROM totag_platform.configuration_history WHERE institution_id=$1 ORDER BY revision',[a.id])).rows;
      assert.deepEqual(rows.map(r=>r.revision),[1,2]);
      assert.equal(rows[0].configuration.school.motto,example.school.motto);
    });
    await t.test('a failed configuration save rolls the entire transaction back',async()=>{
      const original=await readInstitution(client,'TEST-SECOND','STAGING');
      const failing={query:async(sql,args)=>{if(sql==='COMMIT')throw Error('Simulated save failure');return client.query(sql,args);}};
      schoolB.school.motto='Must not persist';
      await assert.rejects(()=>registerInstitution(failing,schoolB,{...change,expectedRevision:1}));
      assert.deepEqual(await readInstitution(client,'TEST-SECOND','STAGING'),original);
    });
    await t.test('registry operator cannot erase institutions or alter retained history',async()=>{
      await assert.rejects(()=>db.query('DELETE FROM totag_platform.institutions'));
      await assert.rejects(()=>db.query("UPDATE totag_platform.configuration_history SET change_reason='tampered'"));
      await assert.rejects(()=>db.query('DELETE FROM totag_platform.configuration_history'));
      await assert.rejects(()=>db.query("UPDATE totag_platform.institutions SET revision=revision+1"));
    });
    await db.exec('RESET ROLE; CREATE ROLE test_school_runtime NOLOGIN; SET ROLE test_school_runtime');
    await t.test('an unrelated school runtime role has no control-plane access',async()=>{
      await assert.rejects(()=>db.query('SELECT * FROM totag_platform.institutions'));
      await assert.rejects(()=>db.query('SELECT * FROM totag_platform.configuration_history'));
    });
  }finally{await db.close();}
});

test('control-plane migrations refuse a school operational database before creating registry objects',async()=>{
  const db=new PGlite(),client=adapter(db);
  try {
    await db.exec('CREATE TABLE public.schools(id integer)');
    const name=(await db.query('SELECT current_database() AS name')).rows[0].name;
    await assert.rejects(()=>migrateRegistry(client,name),/school database/);
    assert.equal((await db.query("SELECT to_regnamespace('totag_platform') AS schema")).rows[0].schema,null);
    assert.equal((await db.query("SELECT to_regclass('public.totag_registry_migrations') AS ledger")).rows[0].ledger,null);
  }finally{await db.close();}
});

test('registry migration does not adopt an unsafe pre-existing operator privilege role',async()=>{
  const db=new PGlite(),client=adapter(db);
  try {
    await db.exec('CREATE ROLE totag_registry_operator SUPERUSER');
    const name=(await db.query('SELECT current_database() AS name')).rows[0].name;
    await assert.rejects(()=>migrateRegistry(client,name),/unsafe/);
    assert.equal((await db.query("SELECT to_regnamespace('totag_platform') AS schema")).rows[0].schema,null);
  }finally{await db.close();}
});
