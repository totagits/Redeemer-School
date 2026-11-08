import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createServer,request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {migrateRegistry} from './platform/migrateRegistry.js';
import {registerInstitution} from './platform/registry.js';
import {createConsoleStore} from './platform/consoleStore.js';
import {createConsoleApp} from './platform/consoleApp.js';
import {fictionalSchoolLogo} from './testing/institutionFixture.js';
import {intakeSignature} from './platform/schoolRequests.js';

test('operator console enforces identity, MFA, school scope, CSRF, audit history and protected logo export',async t=>{
  const db=new PGlite();
  const base={query:async(sql,args)=>{if(!args&&sql.includes('CREATE ')){await db.exec(sql);return {rows:[]};}const r=await db.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0};},release(){}};
  try{
    const database=(await base.query('SELECT current_database() AS name')).rows[0].name;await migrateRegistry(base,database);
    const manifest=JSON.parse(await readFile(new URL('../examples/institutions/fictional-tvet-school.json',import.meta.url),'utf8'));
    const other=structuredClone(manifest);other.school.code='TEST-OTHER';other.school.name='TEST Other School';other.deployment.reference='test-other-app';other.deployment.databaseReference='test-other-db';other.domains=[{hostname:'other.example.invalid',purpose:'PUBLIC'}];
    const operators={};
    for(const [key,level] of [['manager','GLOBAL_CONFIGURATOR'],['editor','SCOPED'],['reader','SCOPED']])operators[key]=(await base.query("INSERT INTO totag_platform.operators(issuer,subject,display_name,access_level) VALUES('https://identity.example.invalid',$1,$1,$2) RETURNING id,display_name,access_level",[key,level])).rows[0];
    const one=await registerInstitution(base,manifest,{expectedRevision:0,operator:operators.manager.id,reason:'Fictional school configuration'});
    await registerInstitution(base,other,{expectedRevision:0,operator:operators.manager.id,reason:'Second fictional configuration'});
    for(const [key,access] of [['editor','CONFIGURE'],['reader','READ']])await base.query('INSERT INTO totag_platform.operator_scopes(operator_id,institution_id,access_level) VALUES($1,$2,$3)',[operators[key].id,one.id,access]);
    await db.exec('SET ROLE totag_registry_operator');
    let queue=Promise.resolve();const pool={connect:async()=>{const prior=queue;let release;queue=new Promise(resolve=>release=resolve);await prior;return {...base,release};}};
    const store=createConsoleStore(pool),sessions={};for(const key of Object.keys(operators))sessions[key]=await store.createSession(operators[key],true);
    const noMfa=await store.createSession(operators.manager,false);
    const origin='https://console.example.invalid',intakeSecret='fictional-local-intake-secret-not-for-live-use-123456789',app=createConsoleApp({store,origin,intakeSecret});
    const server=createServer(app).listen(0,'127.0.0.1');await once(server,'listening');
    const url='http://127.0.0.1:'+server.address().port;
    const request=(pathname,{actor='manager',method='GET',body,csrf=true,host='console.example.invalid',extra={}}={})=>new Promise((resolve,reject)=>{
      const req=httpRequest(url+pathname,{method,headers:{Host:host,Origin:origin,'Content-Type':'application/json',...(actor?{Cookie:'__Host-totag_console='+sessions[actor].raw}:{}),...(actor&&csrf?{'X-CSRF-Token':sessions[actor].csrf}:{}),...extra}},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:response.headers})));});
      req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
    });
    try{
      await t.test('intake requires a signed bridge request and its private queue is restricted to portfolio managers',async()=>{
        const body={schemaVersion:1,requestId:'12345678-1234-4123-8123-123456789012',schoolName:'TEST Intake School',contactName:'Fictional contact',email:'contact@example.invalid',schoolLocation:'Fictional location',requestedAreas:['Website'],message:'A fictional school request for isolated API tests.',consent:true};
        const timestamp=String(Date.now()),signature=intakeSignature(intakeSecret,timestamp,Buffer.from(JSON.stringify(body)));
        assert.equal((await request('/api/intake/school-requests',{actor:null,method:'POST',body})).status,403);
        const response=await request('/api/intake/school-requests',{actor:null,method:'POST',body,extra:{'X-TOTAG-Timestamp':timestamp,'X-TOTAG-Signature':signature}});assert.equal(response.status,201);assert.match((await response.json()).reference,/^SCH-/);
        assert.equal((await request('/api/school-requests',{actor:null})).status,401);
        assert.equal((await request('/api/school-requests',{actor:'editor'})).status,403);
        const row=(await(await request('/api/school-requests')).json()).requests[0];assert.equal(row.request_data.schoolName,body.schoolName);
        assert.equal((await request(`/api/school-requests/${row.id}/history`,{actor:'reader'})).status,403);
        const review={expectedRevision:1,status:'UNDER_REVIEW',reason:'Fictional manager review started'};
        assert.equal((await request(`/api/school-requests/${row.id}/review`,{method:'POST',body:review,csrf:false})).status,403);
        assert.equal((await request(`/api/school-requests/${row.id}/review`,{method:'POST',body:review})).status,200);
      });
      await t.test('anonymous, forged identity and non-MFA sessions cannot enter the console',async()=>{
        assert.equal((await request('/api/institutions',{actor:null,extra:{'X-Operator-Role':'GLOBAL_CONFIGURATOR'}})).status,401);
        assert.equal((await request('/api/institutions',{extra:{Cookie:'__Host-totag_console='+noMfa.raw}})).status,401);
        assert.equal((await request('/api/institutions',{host:'other.example.invalid',extra:{'X-Forwarded-Host':'console.example.invalid'}})).status,421);
        assert.equal((await request('/api/demo-session',{method:'POST',body:{}})).status,404);
      });
      await t.test('scoped operators see only their assigned school and cannot retrieve another configuration/history/logo/export',async()=>{
        const rows=(await(await request('/api/institutions',{actor:'reader'})).json()).institutions;assert.deepEqual(rows.map(r=>r.code),[manifest.school.code]);
        for(const tail of ['','/history','/logo','/export'])assert.equal((await request('/api/institutions/TEST-OTHER/STAGING'+tail,{actor:'reader'})).status,403);
      });
      await t.test('read-only scope, missing CSRF and self-grant attempts fail without writes',async()=>{
        const body={manifest,expectedRevision:1,reason:'Fictional update for verification',reviewed:true};
        assert.equal((await request('/api/institutions',{actor:'reader',method:'POST',body})).status,403);
        assert.equal((await request('/api/institutions',{method:'POST',body,csrf:false})).status,403);
        assert.equal((await request('/api/operators',{method:'POST',body:{access_level:'GLOBAL_CONFIGURATOR'}})).status,404);
        const newSchool=structuredClone(other);newSchool.school.code='TEST-NEW';assert.equal((await request('/api/institutions',{actor:'editor',method:'POST',body:{...body,manifest:newSchool,expectedRevision:0}})).status,403);
      });
      await t.test('a scoped editor saves one reviewed version, stale updates fail and retained history identifies its operator',async()=>{
        const updated=structuredClone(manifest);updated.school.motto='Reviewed fictional motto';
        const body={manifest:updated,expectedRevision:1,reason:'School-approved fictional motto correction',reviewed:true};
        assert.equal((await request('/api/institutions',{actor:'editor',method:'POST',body})).status,200);
        assert.equal((await request('/api/institutions',{actor:'editor',method:'POST',body})).status,409);
        const history=(await(await request('/api/institutions/TEST-TVET/STAGING/history',{actor:'reader'})).json()).history;
        assert.deepEqual(history.map(h=>h.revision),[2,1]);assert.equal(history[0].operator_name,'editor');assert.equal(history[1].configuration.school.motto,manifest.school.motto);
      });
      await t.test('logos require authorization, remain school scoped and can be selected only through a reviewed save',async()=>{
        const logo={filename:'test-school.png',data:fictionalSchoolLogo().toString('base64'),publicationAuthorized:true};
        const route='/api/institutions/TEST-TVET/STAGING/logo';
        assert.equal((await request(route,{actor:'reader',method:'POST',body:logo})).status,403);
        assert.equal((await request(route,{method:'POST',body:{...logo,publicationAuthorized:false}})).status,400);
        const saved=await request(route,{actor:'editor',method:'POST',body:logo});assert.equal(saved.status,200);
        const asset=(await saved.json()).assetPath;
        assert.equal((await request(route+'?path='+encodeURIComponent(asset),{actor:'reader'})).status,200);
        const other=await request('/api/institutions/TEST-OTHER/STAGING/logo?path='+encodeURIComponent(asset));assert.equal(other.status,404);
        const config=(await(await request('/api/institutions/TEST-TVET/STAGING')).json()).institution.configuration;assert.notEqual(config.branding.logoPath,asset);
        assert.equal((await request(route,{method:'POST',body:{...logo,filename:'unsafe.svg',data:Buffer.from('<svg>not an approved logo</svg>').toString('base64')}})).status,400);
      });
      await t.test('sign-out invalidates the session, while the runtime cannot expand operator scope or rewrite audit history',async()=>{
        assert.equal((await request('/api/logout',{actor:'reader',method:'POST',body:{}})).status,200);
        assert.equal((await request('/api/institutions',{actor:'reader'})).status,401);
        await assert.rejects(()=>base.query("UPDATE totag_platform.operators SET access_level='GLOBAL_CONFIGURATOR'"));
        await assert.rejects(()=>base.query('DELETE FROM totag_platform.configuration_history'));
        await assert.rejects(()=>base.query('DELETE FROM totag_platform.console_events'));
      });
    }finally{await new Promise(resolve=>server.close(resolve));}
  }finally{await db.close();}
});
