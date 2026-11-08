import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

test('shared-school foundation enforces forced RLS and clears school access between database transactions',async t=>{
  const db=new PGlite({extensions:{pgcrypto}}),one=randomUUID(),two=randomUUID();
  const q=(sql,args)=>db.query(sql,args);
  try {
    const dir=new URL('./migrations/',import.meta.url);
    for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
    const fixtures=[];
    for(const [school,code] of [[one,'TEST-SHARED-ONE'],[two,'TEST-SHARED-TWO']]){
      const user=randomUUID(),student=randomUUID(),guardian=randomUUID();
      await q('INSERT INTO schools(id,code,name) VALUES($1,$2,$2)',[school,code]);
      await q('SELECT app.seed_standard_school_roles($1)',[school]);
      await q("INSERT INTO user_accounts(id,school_id,email,password_hash,full_name,role,must_reset_password) VALUES($1,$2,'same@example.invalid','not-a-password','TEST Administrator','SCHOOL_ADMIN',false)",[user,school]);
      await q("INSERT INTO students(id,school_id,student_number,first_name,last_name) VALUES($1,$2,'SAME-LOCAL-NUMBER','TEST',$3)",[student,school,code]);
      await q("INSERT INTO guardians(id,school_id,first_name,last_name,email) VALUES($1,$2,'TEST','Guardian','same-guardian@example.invalid')",[guardian,school]);
      await q("INSERT INTO student_guardians(school_id,student_id,guardian_id,relationship) VALUES($1,$2,$3,'TEST')",[school,student,guardian]);
      fixtures.push({school,user,student,guardian});
    }
    await t.test('all school-owned tables enable and force RLS',async()=>{
      const tables=(await q(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'
        AND (c.relname='schools' OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='school_id' AND NOT a.attisdropped)) ORDER BY c.relname`)).rows;
      assert.ok(tables.length>50,'Schema-wide check must cover the real school schema.');
      assert.deepEqual(tables.filter(r=>!r.relrowsecurity||!r.relforcerowsecurity).map(r=>r.relname),[]);
    });
    await db.exec('SET ROLE redeemer_runtime');
    await t.test('runtime has no superuser, bypass, database creation, role creation or school table ownership',async()=>{
      const role=(await q('SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
      assert.deepEqual(Object.values(role),[false,false,false,false]);
      const owned=(await q("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND c.relkind='r'")).rows;
      assert.deepEqual(owned,[]);
    });
    await t.test('no school context yields no private rows',async()=>{
      for(const table of ['schools','user_accounts','students','guardians','student_guardians'])assert.equal((await q(`SELECT * FROM ${table}`)).rows.length,0,table);
    });
    for(const [index,fixture] of fixtures.entries()){
      const foreign=fixtures[1-index];
      await t.test(`school ${index+1} cannot read, alter or link the other school's learner`,async()=>{
        await q('BEGIN');
        try{
          await q("SELECT set_config('app.current_school_id',$1,true)",[fixture.school]);
          assert.equal((await q('SELECT id FROM schools')).rows[0].id,fixture.school);
          assert.deepEqual((await q('SELECT id FROM students')).rows.map(r=>r.id),[fixture.student]);
          assert.equal((await q('SELECT id FROM students WHERE id=$1',[foreign.student])).rows.length,0);
          assert.equal((await q("UPDATE students SET first_name='Must not change' WHERE id=$1 RETURNING id",[foreign.student])).rows.length,0);
          assert.equal((await q('SELECT id FROM guardians WHERE id=$1',[foreign.guardian])).rows.length,0);
          await q('SAVEPOINT invalid_link');
          await assert.rejects(()=>q("INSERT INTO student_guardians(school_id,student_id,guardian_id,relationship) VALUES($1,$2,$3,'TEST')",[fixture.school,foreign.student,fixture.guardian]));
          await q('ROLLBACK TO SAVEPOINT invalid_link');
          await q('SAVEPOINT invalid_school');
          await assert.rejects(()=>q("INSERT INTO students(school_id,student_number,first_name,last_name) VALUES($1,'CROSS-SCHOOL-WRITE','TEST','Must not exist')",[foreign.school]));
          await q('ROLLBACK TO SAVEPOINT invalid_school');
          await q('COMMIT');
        }catch(error){await q('ROLLBACK');throw error;}
        assert.equal((await q('SELECT id FROM students')).rows.length,0,'Committed transaction must not leak tenant context to the next request.');
      });
    }
    await t.test('rolled-back tenant context also leaves a reused connection without access',async()=>{
      await q('BEGIN');await q("SELECT set_config('app.current_school_id',$1,true)",[one]);await q('ROLLBACK');
      assert.equal((await q('SELECT id FROM user_accounts')).rows.length,0);
    });
  }finally{await db.close();}
});
