import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {once} from 'node:events';
import express from 'express';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {createAuthRouter} from './auth.js';
import {hashPassword} from './authCrypto.js';
import {createWebsitePagesRouter,websitePageCatalog} from './websitePages.js';

test('administrable school pages publish reviewed snapshots and protect private drafts and assets',async t=>{
 const db=new PGlite({extensions:{pgcrypto}}),school=randomUUID(),other=randomUUID(),users={},sessions={};let server;
 const q=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0};};
 const password=randomBytes(24).toString('base64url'),hash=await hashPassword(password);
 try{
  const dir=new URL('./migrations/',import.meta.url);for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort()){await db.exec(await readFile(new URL(name,dir),'utf8'));if(name==='001_school_operations_foundation.sql')for(const [id,code]of [[school,'RIA'],[other,'OTHER']])await q('INSERT INTO schools(id,code,name) VALUES($1,$2,$2)',[id,code]);}
  for(const [key,role,tenant]of [['admin','SCHOOL_ADMIN',school],['principal','PRINCIPAL',school],['teacher','TEACHER',school],['foreign','SCHOOL_ADMIN',other]]){const id=randomUUID();users[key]=id;await q('INSERT INTO user_accounts(id,school_id,email,password_hash,full_name,role,must_reset_password) VALUES($1,$2,$3,$4,$5,$6,false)',[id,tenant,key+'@example.invalid',hash,'Fictional '+key,role==='PRINCIPAL'?'SCHOOL_ADMIN':role]);await q('INSERT INTO user_role_assignments(school_id,user_id,role_id) SELECT $1,$2,id FROM school_roles WHERE school_id=$1 AND code=$3',[tenant,id,role]);}
  await db.exec('SET ROLE redeemer_runtime');const pool={query:q,connect:async()=>({query:q,release(){}})};
  const auth=createAuthRouter({pool,secret:randomBytes(48).toString('base64url'),secureCookie:false}),app=express();app.use(express.json({limit:'9mb'}));app.use('/auth',auth);app.use('/pages',createWebsitePagesRouter({pool,authenticate:auth.requireAuth}));server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  async function raw(actor,path,body,headers={}){const session=sessions[actor];return fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});}
  async function call(actor,path,body,status=200,headers={}){const response=await raw(actor,path,body,headers),data=await response.json();assert.equal(response.status,status,path+': '+JSON.stringify(data));return data;}
  async function owner(action){await db.exec('RESET ROLE');try{return await action();}finally{await db.exec('SET ROLE redeemer_runtime');}}
  for(const key of Object.keys(users)){const response=await raw(null,'/auth/login',{schoolCode:key==='foreign'?'OTHER':'RIA',email:key+'@example.invalid',password,audience:'STAFF'}),data=await response.json();assert.equal(response.status,200);sessions[key]={cookie:response.headers.get('set-cookie').split(';')[0],csrfToken:data.csrfToken};}
  await t.test('approved initial pages are public; drafts, history and management are role restricted',async()=>{
   const published=await call(null,'/pages/public?schoolCode=RIA');assert.equal(Object.keys(published.pages).length,Object.keys(websitePageCatalog).length);assert.match(published.pages['principal-message'].sections[0].body,/Choosing a school/);assert.equal(published.pages.home.profile.phones[0],'0778786116');
   await call(null,'/pages/manage',undefined,401);await call('teacher','/pages/manage',undefined,403);await call('principal','/pages/manage');
   assert.equal((await call(null,'/pages/public?schoolCode=OTHER')).pages.home,undefined);
   const detail=await call('admin','/pages/manage/principal-message');assert.equal(detail.history[0].action,'OWNER_APPROVED_INITIAL');assert.ok(!JSON.stringify(published).includes('OWNER_APPROVED_INITIAL'));
  });
  let changed,photoId,documentId;
  await t.test('saving a draft preserves the public snapshot and rejects stale or unverified writes',async()=>{
   const page=(await call('admin','/pages/manage/principal-message')).page;changed={...page.draft_content,intro:'Fictional private draft intro for editor validation.'};
   const body={action:'SAVE_DRAFT',revision:page.revision,content:changed,note:'Fictional editor workflow test.'};await call('admin','/pages/manage/principal-message',body,403,{'X-CSRF-Token':'wrong'});
   await call('admin','/pages/manage/principal-message',body);await call('principal','/pages/manage/principal-message',body,409);
   const published=await call(null,'/pages/public?schoolCode=RIA');assert.notEqual(published.pages['principal-message'].intro,changed.intro);
   await call('admin','/pages/manage/principal-message',{action:'PUBLISH',revision:2,note:'Missing review check'},400);
  });
  await t.test('school-authorized photo and PDF uploads stay private until referenced by a published page',async()=>{
   const bytes=await readFile(new URL('../public/school-photos/featured/03-campus-courtyard.webp',import.meta.url));
   const input={filename:'fictional-preview.webp',mediaType:'image/webp',data:'data:image/webp;base64,'+bytes.toString('base64'),altText:'Fictional test photograph',caption:'Fictional editor test',publicationConsent:true};
   await call('admin','/pages/manage/assets',{...input,publicationConsent:false},400);photoId=(await call('admin','/pages/manage/assets',input,201)).asset.id;
   const pdf=Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
   documentId=(await call('admin','/pages/manage/assets',{filename:'fictional-policy.pdf',mediaType:'application/pdf',data:'data:application/pdf;base64,'+pdf.toString('base64'),publicationConsent:true},201)).asset.id;
   assert.equal((await raw(null,'/pages/public/assets/'+photoId+'?schoolCode=RIA')).status,404);
   assert.equal((await raw(null,'/pages/manage/assets/'+photoId+'/file')).status,401);
   assert.equal((await raw('foreign','/pages/manage/assets/'+photoId+'/file')).status,404);
   const current=(await call('admin','/pages/manage/principal-message')).page;changed={...changed,images:[{id:photoId,alt:'School-authorized test photo',caption:'Fictional caption'}],documents:[{id:documentId,label:'Fictional policy'}]};
   await call('foreign','/pages/manage/about-us',{action:'SAVE_DRAFT',revision:0,content:changed,note:'Cannot attach another school asset.'},400);
   await call('admin','/pages/manage/principal-message',{action:'SAVE_DRAFT',revision:current.revision,content:changed,note:'Attach fictional assets.'});
   const draft=(await call('admin','/pages/manage/principal-message')).page;await call('principal','/pages/manage/principal-message',{action:'PUBLISH',revision:draft.revision,note:'Fictional publication test.',confirmPublic:true});
   const publicPhoto=await raw(null,'/pages/public/assets/'+photoId+'?schoolCode=RIA');assert.equal(publicPhoto.status,200);assert.equal(publicPhoto.headers.get('content-type'),'image/webp');assert.equal(publicPhoto.headers.get('cache-control'),'no-store');assert.equal(Buffer.from(await publicPhoto.arrayBuffer()).toString('ascii',0,4),'RIFF');
   const publicPdf=await raw(null,'/pages/public/assets/'+documentId+'?schoolCode=RIA');assert.equal(publicPdf.status,200);assert.match(publicPdf.headers.get('content-disposition'),/^attachment/);assert.equal(publicPdf.headers.get('x-content-type-options'),'nosniff');assert.match(publicPdf.headers.get('content-security-policy'),/sandbox/);
  });
  await t.test('withdrawal removes content and asset access while history can restore a new reviewed draft',async()=>{
   let detail=await call('admin','/pages/manage/principal-message');const prior=detail.page;
   await call('admin','/pages/manage/principal-message',{action:'WITHDRAW',revision:prior.revision,note:'Fictional withdrawal test.'});
   assert.equal((await call(null,'/pages/public?schoolCode=RIA')).pages['principal-message'],null);assert.equal((await raw(null,'/pages/public/assets/'+photoId+'?schoolCode=RIA')).status,404);
   detail=await call('admin','/pages/manage/principal-message');assert.equal(detail.history.length,5);const snapshot=detail.history.find(h=>h.action==='PUBLISH').snapshot;
   await call('principal','/pages/manage/principal-message',{action:'SAVE_DRAFT',revision:detail.page.revision,content:snapshot,note:'Restore prior publication as new private draft.'});assert.equal((await call(null,'/pages/public?schoolCode=RIA')).pages['principal-message'],null);
   const restored=(await call('principal','/pages/manage/principal-message')).page;await call('principal','/pages/manage/principal-message',{action:'PUBLISH',revision:restored.revision,note:'Republish reviewed restored version.',confirmPublic:true});
   assert.equal((await call(null,'/pages/public?schoolCode=RIA')).pages['principal-message'].images[0].id,photoId);
  });
  await t.test('homepage facts update only on publication and runtime cannot erase history or assets',async()=>{
   const current=(await call('admin','/pages/manage/home')).page,content={...current.draft_content,profile:{...current.draft_content.profile,address:'Fictional office address for isolated test only'}};
   await call('admin','/pages/manage/home',{action:'SAVE_DRAFT',revision:current.revision,content,note:'Fictional office details update.'});assert.notEqual((await call(null,'/pages/public?schoolCode=RIA')).pages.home.profile.address,content.profile.address);
   await call('admin','/pages/manage/home',{action:'PUBLISH',revision:2,note:'Publish office details test.',confirmPublic:true});assert.equal((await call(null,'/pages/public?schoolCode=RIA')).pages.home.profile.address,content.profile.address);
   await call('admin','/pages/manage/home',{action:'WITHDRAW',revision:3,note:'Homepage must remain available.'},400);
   for(const sql of ['DELETE FROM website_page_history','UPDATE website_page_history SET note=\'changed\'','DELETE FROM website_assets']){await db.exec('BEGIN');await q("SELECT set_config('app.current_school_id',$1,true)",[school]);try{await assert.rejects(q(sql),e=>e.code==='42501');}finally{await db.exec('ROLLBACK');}}
   await owner(async()=>{assert.equal((await q('SELECT count(*)::int AS n FROM website_page_history WHERE slug=$1',['principal-message'])).rows[0].n,7);});
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.close();}
});
