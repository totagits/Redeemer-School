import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {claimAnnouncementSms,dispatchClaimedSms} from './smsDispatch.js';

test('durable SMS claims prevent re-sending uncertain, accepted and interrupted deliveries',async t=>{
 const db=new PGlite({extensions:{pgcrypto}}),school=randomUUID(),user=randomUUID(),student=randomUUID(),guardian=randomUUID();
 const q=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0};};
 const transaction=async action=>{await q('BEGIN');try{const result=await action({query:q});await q('COMMIT');return result;}catch(e){await q('ROLLBACK');throw e;}};
 try{
  const dir=new URL('./migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort()){
   await db.exec(await readFile(new URL(name,dir),'utf8'));
   if(name==='001_school_operations_foundation.sql')await q('INSERT INTO schools(id,code,name) VALUES($1,$2,$2)',[school,'SMS-TEST']);
  }
  await q("INSERT INTO user_accounts(id,school_id,email,password_hash,full_name,role,must_reset_password) VALUES($1,$2,'sms@example.invalid','not-a-login','TEST Operator','SCHOOL_ADMIN',false)",[user,school]);
  await q("INSERT INTO students(id,school_id,student_number,first_name,last_name) VALUES($1,$2,'TEST-SMS','TEST','Learner')",[student,school]);
  await q("INSERT INTO guardians(id,school_id,first_name,last_name,phone) VALUES($1,$2,'TEST','Guardian','0770000000')",[guardian,school]);
  await q("INSERT INTO student_guardians(school_id,student_id,guardian_id,relationship,communication_consent) VALUES($1,$2,$3,'TEST',true)",[school,student,guardian]);
  const seed=async()=>{const announcement=randomUUID(),delivery=randomUUID();await q("INSERT INTO announcements(id,school_id,title,body,audience,status,created_by) VALUES($1,$2,'TEST only','No real messages','ALL_GUARDIANS','PUBLISHED',$3)",[announcement,school,user]);await q("INSERT INTO notification_deliveries(id,school_id,guardian_id,announcement_id,channel,recipient_ref) VALUES($1,$2,$3,$4,'SMS','0770000000')",[delivery,school,guardian,announcement]);return {announcement,delivery};};
  // Seed all fixtures as owner, then exercise the claimed rows as the runtime role.
  const accepted=await seed(),uncertain=await seed(),interrupted=await seed(),revoked=await seed(),rolledBack=await seed();
  await db.exec('SET ROLE redeemer_runtime');await q("SELECT set_config('app.current_school_id',$1,false)",[school]);
  const claim=fixture=>transaction(client=>claimAnnouncementSms(client,{schoolId:school,announcementId:fixture.announcement,userId:user}));
  const state=async fixture=>(await q('SELECT status,dispatch_reference,provider_message_id FROM notification_deliveries WHERE school_id=$1 AND id=$2',[school,fixture.delivery])).rows[0];
  await t.test('provider calls happen after a committed claim and a second claim excludes the row',async()=>{
   const rows=(await claim(accepted)).rows;assert.equal((await state(accepted)).status,'SENDING');assert.ok(rows[0].dispatch_reference);assert.equal((await claim(accepted)).rows.length,0);
   let sends=0;const result=await dispatchClaimedSms({deliveries:rows,schoolId:school,announcementId:accepted.announcement,userId:user,message:'TEST',transaction,sendSms:async payload=>{sends++;assert.equal(payload.dispatchReference,rows[0].dispatch_reference);assert.equal((await state(accepted)).status,'SENDING');return {providerMessageId:'TEST-PROVIDER-ID'};}});
   assert.equal(sends,1);assert.equal(result.sent,1);assert.equal((await state(accepted)).status,'SENT');assert.equal((await claim(accepted)).rows.length,0);
  });
  await t.test('a timeout is UNKNOWN and cannot become another send on the next request',async()=>{
   const rows=(await claim(uncertain)).rows;let sends=0;
   const result=await dispatchClaimedSms({deliveries:rows,schoolId:school,announcementId:uncertain.announcement,userId:user,message:'TEST',transaction,sendSms:async()=>{sends++;throw new Error('Simulated timeout after acceptance');}});
   assert.equal(sends,1);assert.equal(result.unknown,1);assert.equal((await state(uncertain)).status,'UNKNOWN');assert.equal((await claim(uncertain)).rows.length,0);
  });
  await t.test('a result-save failure leaves the committed claim held and cannot repeat a charge',async()=>{
   const rows=(await claim(interrupted)).rows;let sends=0;
   const result=await dispatchClaimedSms({deliveries:rows,schoolId:school,announcementId:interrupted.announcement,userId:user,message:'TEST',sendSms:async()=>{sends++;return {providerMessageId:'TEST-ACCEPTED'};},transaction:async action=>transaction(async client=>{await action(client);throw new Error('Simulated save failure');})});
   assert.equal(sends,1);assert.equal(result.unrecorded,1);assert.equal((await state(interrupted)).status,'SENDING');assert.equal((await claim(interrupted)).rows.length,0);
  });
  await t.test('rolled back claims send nothing and revoked consent cancels queued delivery',async()=>{
   await assert.rejects(()=>transaction(async client=>{await claimAnnouncementSms(client,{schoolId:school,announcementId:rolledBack.announcement,userId:user});throw new Error('Before send');}));
   assert.equal((await state(rolledBack)).status,'QUEUED');
   await q('UPDATE student_guardians SET communication_consent=false WHERE school_id=$1 AND guardian_id=$2',[school,guardian]);
   assert.equal((await claim(revoked)).rows.length,0);assert.equal((await state(revoked)).status,'CANCELLED');
  });
 }finally{await db.close();}
});
