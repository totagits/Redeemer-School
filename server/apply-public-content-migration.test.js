import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGates, identity } from './applyPublicContentMigration.js';

const staging={
 REDEEMER_TARGET_ENV:'staging',
 APPLY_PUBLIC_CONTENT_100:'true',
 STAGING_DB_BACKUP_CONFIRMED:'true',
 STAGING_DB_BACKUP_REFERENCE:'staging-backup-verified-2026-10-29',
 DATABASE_URL:'postgres://migration@example.org:5432/redeemer_school_staging',
 RUNTIME_DATABASE_URL:'postgres://redeemer_runtime@example.org:5432/redeemer_school_staging'
};
test('migration refuses absent backup proof or stage target',()=>{
 for(const key of ['REDEEMER_TARGET_ENV','APPLY_PUBLIC_CONTENT_100','STAGING_DB_BACKUP_CONFIRMED','STAGING_DB_BACKUP_REFERENCE']){
  const env={...staging};delete env[key];assert.throws(()=>validateGates(env));
 }
 assert.doesNotThrow(()=>validateGates(staging));
});
test('migration refuses any mismatch in database identities and shared accounts',()=>{
 assert.equal(identity(staging.DATABASE_URL),'example.org|5432|redeemer_school_staging');
 assert.throws(()=>validateGates({...staging,RUNTIME_DATABASE_URL:'postgres://redeemer_runtime@example.org/redeemer_production'}));
 assert.throws(()=>validateGates({...staging,RUNTIME_DATABASE_URL:staging.DATABASE_URL}));
 assert.throws(()=>validateGates({...staging,DATABASE_URL:''}));
});
test('migration never requires publication to be enabled in the running server',async()=>{
 const {readFileSync}=await import('node:fs');
 const code=readFileSync(new URL('./index.js',import.meta.url),'utf8');
 assert.doesNotMatch(code,/applyPublicContentMigration/);
});
