import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {migrateRegistry} from './migrateRegistry.js';
import {registerInstitution} from './registry.js';
import {createConsoleStore} from './consoleStore.js';
import {receiveSchoolRequest} from './schoolRequests.js';
import {createConsoleApp} from './consoleApp.js';

// No pg pool, .env loader, school connection, provider or network identity
// service is used here. Everything is fictional and disappears on shutdown.
const db=new PGlite();
const client={query:async(sql,args)=>{if(!args&&sql.includes('CREATE ')){await db.exec(sql);return {rows:[]};}const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};},release(){}};
const database=(await client.query('SELECT current_database() AS name')).rows[0].name;
await migrateRegistry(client,database);
const one=JSON.parse(await readFile(new URL('../../examples/institutions/fictional-tvet-school.json',import.meta.url),'utf8'));
const two=structuredClone(one);two.school.code='TEST-ACADEMY';two.school.name='TEST Horizon Academy';two.school.motto='Fictional academy example';two.branding.primaryColor='#14532D';two.branding.secondaryColor='#052E16';two.branding.accentColor='#FEF08A';two.domains=[{hostname:'horizon.example.invalid',purpose:'PUBLIC'}];two.academics.departments=[];two.deployment.reference='test-horizon-app';two.deployment.databaseReference='test-horizon-db';
const operator=(await client.query("INSERT INTO totag_platform.operators(issuer,subject,display_name,access_level) VALUES('https://demo.example.invalid','fictional-configurator','Demo Configuration Manager','GLOBAL_CONFIGURATOR') RETURNING id,display_name,access_level")).rows[0];
for(const school of [one,two])await registerInstitution(client,school,{expectedRevision:0,operator:operator.id,reason:'Fictional console demonstration only'});
await db.exec('SET ROLE totag_registry_operator');
await receiveSchoolRequest(client,{schemaVersion:1,requestId:'12345678-1234-4123-8123-123456789012',schoolName:'TEST Community Technical School',contactName:'Fictional School Coordinator',email:'coordinator@example.invalid',phone:'',schoolLocation:'Fictional demonstration location',estimatedLearners:250,requestedAreas:['Website','Admissions','TVET'],programNotes:'Electricity, agriculture and carpentry',message:'FICTIONAL DEMO ONLY: please prepare a school website and management workspace with a technical program catalog.',brandingPreference:{primaryColor:'#164E63'},consent:true});
// PGlite is a single connection: serialize complete request leases so BEGIN /
// COMMIT from simultaneous demo requests can never interleave.
let pending=Promise.resolve();
const pool={connect:async()=>{const prior=pending;let release;pending=new Promise(resolve=>{release=resolve;});await prior;return {...client,release};}};
const port=Number(process.env.TOTAG_DEMO_PORT||4105),origin='http://127.0.0.1:'+port;
const app=createConsoleApp({store:createConsoleStore(pool),origin,demoOperator:operator,intakeSecret:'fictional-local-intake-secret-not-for-live-use-123456789',distDir:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../console-dist')});
const server=app.listen(port,'127.0.0.1',()=>console.log('TOTAG fictional console demo: '+origin+' — no school records or live registry connection.'));
const stop=()=>server.close(async()=>{await db.close();process.exit(0);});process.on('SIGTERM',stop);process.on('SIGINT',stop);
