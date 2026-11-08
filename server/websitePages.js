import express from 'express';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {decodeImage} from './publicContent.js';
import {institutionWebsiteDefaults} from '../shared/institutionDefaults.js';
export const websitePageCatalog=JSON.parse(readFileSync(new URL('../shared/website-content.json',import.meta.url),'utf8'));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class ContentError extends Error{constructor(message,status=400){super(message);this.status=status;}}
function text(value,max,required=true){if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))throw new ContentError('Check the required text and length limits.');return value.trim();}
export function validateWebsitePage(input,slug){
 if(!Object.hasOwn(websitePageCatalog,slug))throw new ContentError('Choose a school website page.');
 const page={eyebrow:websitePageCatalog[slug].eyebrow,heading:text(input?.heading,180),intro:text(input?.intro,1200),sections:[],images:[],documents:[]};
 if(!Array.isArray(input.sections)||input.sections.length>16)throw new ContentError('Use up to 16 page sections.');
 page.sections=input.sections.map(s=>({title:text(s?.title,180),body:text(s?.body,10000)}));
 for(const key of ['images','documents']){
  if(!Array.isArray(input[key])||input[key].length>12)throw new ContentError('Use up to 12 photos or documents per page.');
  page[key]=input[key].map(asset=>{if(!uuid.test(asset?.id))throw new ContentError('Choose an uploaded school asset.');return key==='images'?{id:asset.id,alt:text(asset.alt,300),caption:text(asset.caption,500,false)}:{id:asset.id,label:text(asset.label,180)};});
  if(new Set(page[key].map(a=>a.id)).size!==page[key].length)throw new ContentError('An asset should appear only once on a page.');
 }
 if(slug==='home'){
  page.blocks=Object.fromEntries(['about','academics','admissions','families'].map(key=>[key,{title:text(input.blocks?.[key]?.title,180),body:text(input.blocks?.[key]?.body,10000)}]));
  const p=input.profile;if(!Array.isArray(p?.phones)||p.phones.length<1||p.phones.length>4||p.phones.some(phone=>typeof phone!=='string'||!/^\+?[0-9 ()-]{7,30}$/.test(phone)))throw new ContentError('Enter one to four school office telephone numbers.');
  page.profile={name:text(p.name,160),motto:text(p.motto,160),founded:text(p.founded,4),address:text(p.address,500),phones:p.phones.map(phone=>phone.trim())};
  if(!/^(18|19|20)\d{2}$/.test(page.profile.founded))throw new ContentError('Enter a valid establishment year.');
 }
 if(JSON.stringify(page).length>120000)throw new ContentError('This page is too long.');return page;
}
async function finish(req,res,status,data,commit=true){const client=req.auth.client;req.auth.client=null;try{await client.query(commit?'COMMIT':'ROLLBACK');}finally{client.release();}return res.status(status).json(data);}
async function event(req,slug,action,revision,snapshot,note){
 await req.auth.client.query('INSERT INTO website_page_history(school_id,slug,action,revision,snapshot,actor_user_id,note) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)',[req.auth.claims.schoolId,slug,action,revision,JSON.stringify(snapshot),req.auth.claims.userId,note]);
 await req.auth.client.query("INSERT INTO audit_events(school_id,actor_user_id,action,entity_type,details) VALUES($1,$2,$3,'WEBSITE_PAGE',$4::jsonb)",[req.auth.claims.schoolId,req.auth.claims.userId,'WEBSITE_PAGE_'+action,JSON.stringify({slug,revision,note})]);
}
export function createWebsitePagesRouter({pool,authenticate}){
 const router=express.Router();
 async function publicRead(req,res,action){let client;res.set('Cache-Control','no-store');try{
  if(!pool||!/^([A-Z0-9][A-Z0-9_-]{1,49})$/.test(String(req.query.schoolCode||'')))throw new ContentError('Valid school code required.');
  client=await pool.connect();await client.query('BEGIN READ ONLY');
  const safe=await client.query('SELECT NOT rolsuper AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname=current_user');if(!safe.rows[0]?.safe)throw Error('Unsafe runtime role');
  const school=(await client.query('SELECT app.resolve_school_id_by_code($1) AS id',[req.query.schoolCode])).rows[0]?.id;if(!school)throw new ContentError('School not found.',404);
  await client.query("SELECT set_config('app.current_school_id',$1,true)",[school]);const result=await action(client,school);await client.query('COMMIT');client.release();client=null;return result();
 }catch(e){if(client){await client.query('ROLLBACK').catch(()=>{});client.release();}return res.status(e instanceof ContentError?e.status:503).json({error:e instanceof ContentError?e.message:'School pages are temporarily unavailable.'});}}
 router.get('/public',(req,res)=>publicRead(req,res,async(client,school)=>{
  const rows=await client.query('SELECT slug,published_content,published_at FROM website_pages WHERE school_id=$1 ORDER BY slug',[school]);
  return ()=>res.json({pages:Object.fromEntries(rows.rows.map(row=>[row.slug,row.published_content])),updatedAt:rows.rows.map(row=>row.published_at).filter(Boolean).sort().at(-1)||null});
 }));
 router.get('/public/assets/:id',(req,res)=>publicRead(req,res,async(client,school)=>{
  if(!uuid.test(req.params.id))throw new ContentError('Asset not found.',404);
  const found=await client.query(`SELECT a.media_type,a.file_bytes,a.filename FROM website_assets a WHERE a.school_id=$1 AND a.id=$2 AND EXISTS(SELECT 1 FROM website_pages p WHERE p.school_id=a.school_id AND (p.published_content->'images' @> jsonb_build_array(jsonb_build_object('id',a.id::text)) OR p.published_content->'documents' @> jsonb_build_array(jsonb_build_object('id',a.id::text))))`,[school,req.params.id]);
  if(!found.rowCount)throw new ContentError('Asset not found.',404);const asset=found.rows[0];return ()=>res.set('Content-Type',asset.media_type).set('X-Content-Type-Options','nosniff').set('Content-Security-Policy',"default-src 'none'; sandbox").set('Content-Disposition',`${asset.media_type==='application/pdf'?'attachment':'inline'}; filename="${asset.filename}"`).send(Buffer.from(asset.file_bytes));
 }));
 router.use('/manage',authenticate,(req,res,next)=>{
  res.set('Cache-Control','no-store');if(!req.auth.account.roles.some(role=>['SCHOOL_ADMIN','PRINCIPAL'].includes(role))||!req.auth.account.permissions.includes('communications.write'))return finish(req,res,403,{error:'School leadership access is required.'},false);
  if(req.method!=='GET'&&req.get('x-csrf-token')!==req.auth.claims.csrfToken)return finish(req,res,403,{error:'Refresh your session before saving.'},false);next();
 });
 async function failure(req,res,e){return finish(req,res,e instanceof ContentError?e.status:503,{error:e instanceof ContentError?e.message:'The website change could not be saved.'},false);}
 router.get('/manage',async(req,res)=>{try{const school=req.auth.claims.schoolId;const [pages,assets]=await Promise.all([req.auth.client.query('SELECT slug,revision,published_revision,published_at,updated_at FROM website_pages WHERE school_id=$1 ORDER BY slug',[school]),req.auth.client.query('SELECT id,filename,media_type,alt_text,caption,created_at FROM website_assets WHERE school_id=$1 ORDER BY created_at DESC LIMIT 100',[school])]);return finish(req,res,200,{pages:pages.rows,assets:assets.rows,catalog:Object.entries(req.schoolBinding?institutionWebsiteDefaults(websitePageCatalog,req.schoolBinding.school):websitePageCatalog).map(([slug,page])=>({slug,title:page.heading}))});}catch(e){return failure(req,res,e);}});
 router.get('/manage/:slug',async(req,res)=>{try{
  if(!Object.hasOwn(websitePageCatalog,req.params.slug))throw new ContentError('Page not found.',404);
  const school=req.auth.claims.schoolId;const row=(await req.auth.client.query('SELECT * FROM website_pages WHERE school_id=$1 AND slug=$2',[school,req.params.slug])).rows[0];
  const history=await req.auth.client.query('SELECT h.id,h.action,h.revision,h.snapshot,h.note,h.created_at,u.full_name AS actor_name FROM website_page_history h LEFT JOIN user_accounts u ON u.school_id=h.school_id AND u.id=h.actor_user_id WHERE h.school_id=$1 AND h.slug=$2 ORDER BY h.created_at DESC,h.id DESC LIMIT 50',[school,req.params.slug]);
  const defaults=req.schoolBinding?institutionWebsiteDefaults(websitePageCatalog,req.schoolBinding.school):websitePageCatalog;
  return finish(req,res,200,{page:row||{slug:req.params.slug,revision:0,draft_content:defaults[req.params.slug],published_content:null,published_revision:null},history:history.rows});
 }catch(e){return failure(req,res,e);}});
 router.post('/manage/assets',express.json({limit:'8mb'}),async(req,res)=>{try{
  if(req.body?.publicationConsent!==true)throw new ContentError('Confirm school authorization to publish this asset.');
  const kind=req.body?.mediaType,filename=text(req.body?.filename,120).replace(/[^A-Za-z0-9_.-]/g,'_');let bytes,alt='',caption='';
  if(kind==='image/webp'){const image=decodeImage(req.body?.data);if(!image)throw new ContentError('Choose a valid WebP photo at least 1200 × 675 pixels and no larger than 1.5 MB.');bytes=image.bytes;alt=text(req.body.altText,300);caption=text(req.body.caption,500,false);}
  else if(kind==='application/pdf'){
   const data=req.body?.data;if(typeof data!=='string'||data.length>7000000||!/^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/.test(data))throw new ContentError('Choose a PDF up to 5 MB.');const encoded=data.slice('data:application/pdf;base64,'.length);bytes=Buffer.from(encoded,'base64');if(bytes.length>5242880||bytes.length<20||bytes.toString('ascii',0,5)!=='%PDF-'||!bytes.subarray(-1024).toString('ascii').includes('%%EOF')||bytes.toString('base64')!==encoded)throw new ContentError('Choose a valid PDF up to 5 MB.');
  }else throw new ContentError('Upload a photograph or PDF document.');
  const result=await req.auth.client.query('INSERT INTO website_assets(school_id,filename,media_type,file_bytes,alt_text,caption,checksum_sha256,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,filename,media_type,alt_text,caption',[req.auth.claims.schoolId,filename,kind,bytes,alt,caption,createHash('sha256').update(bytes).digest('hex'),req.auth.claims.userId]);
  return finish(req,res,201,{asset:result.rows[0]});
 }catch(e){return failure(req,res,e);}});
 router.get('/manage/assets/:id/file',async(req,res)=>{try{if(!uuid.test(req.params.id))throw new ContentError('Asset not found.',404);const result=await req.auth.client.query('SELECT media_type,file_bytes,filename FROM website_assets WHERE school_id=$1 AND id=$2',[req.auth.claims.schoolId,req.params.id]);if(!result.rowCount)throw new ContentError('Asset not found.',404);const a=result.rows[0];const client=req.auth.client;req.auth.client=null;try{await client.query('COMMIT');}finally{client.release();}return res.set('Content-Type',a.media_type).set('X-Content-Type-Options','nosniff').set('Content-Security-Policy',"default-src 'none'; sandbox").set('Content-Disposition',`inline; filename="${a.filename}"`).send(Buffer.from(a.file_bytes));}catch(e){return failure(req,res,e);}});
 router.post('/manage/:slug',async(req,res)=>{try{
  const slug=req.params.slug;if(!Object.hasOwn(websitePageCatalog,slug))throw new ContentError('Page not found.',404);
  const action=req.body?.action;if(!['SAVE_DRAFT','PUBLISH','WITHDRAW'].includes(action)||!Number.isInteger(req.body?.revision))throw new ContentError('Choose an action and reload the current page version.');
  const note=text(req.body.note,1000),school=req.auth.claims.schoolId;
  await req.auth.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[school+':website:'+slug]);
  let row=(await req.auth.client.query('SELECT * FROM website_pages WHERE school_id=$1 AND slug=$2 FOR UPDATE',[school,slug])).rows[0];
  if((row?.revision||0)!==req.body.revision)throw new ContentError('Another administrator changed this page. Reload it before saving.',409);
  if(action==='SAVE_DRAFT'){
   const content=validateWebsitePage(req.body.content,slug),assets=[...content.images.map(a=>[a.id,'image/webp']),...content.documents.map(a=>[a.id,'application/pdf'])];
   for(const [id,type]of assets)if(!(await req.auth.client.query('SELECT 1 FROM website_assets WHERE school_id=$1 AND id=$2 AND media_type=$3',[school,id,type])).rowCount)throw new ContentError('An asset is unavailable in this school.');
   const result=await req.auth.client.query('INSERT INTO website_pages(school_id,slug,draft_content,revision,updated_by) VALUES($1,$2,$3::jsonb,1,$4) ON CONFLICT(school_id,slug) DO UPDATE SET draft_content=EXCLUDED.draft_content,revision=website_pages.revision+1,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp() RETURNING *',[school,slug,JSON.stringify(content),req.auth.claims.userId]);row=result.rows[0];
  }else{
   if(!row)throw new ContentError('Save a draft before publishing.');if(slug==='home'&&action==='WITHDRAW')throw new ContentError('Keep the homepage available. Publish an updated version instead.');
   if(action==='PUBLISH'&&req.body.confirmPublic!==true)throw new ContentError('Review the public preview and confirm publication.');
   const result=await req.auth.client.query(`UPDATE website_pages SET published_content=CASE WHEN $3='PUBLISH' THEN draft_content ELSE NULL END,published_revision=CASE WHEN $3='PUBLISH' THEN revision+1 ELSE NULL END,published_at=CASE WHEN $3='PUBLISH' THEN clock_timestamp() ELSE NULL END,revision=revision+1,updated_by=$4,updated_at=clock_timestamp() WHERE school_id=$1 AND slug=$2 RETURNING *`,[school,slug,action,req.auth.claims.userId]);row=result.rows[0];
  }
  await event(req,slug,action,row.revision,action==='WITHDRAW'?null:row.draft_content,note);return finish(req,res,200,{revision:row.revision,notice:action==='SAVE_DRAFT'?'Private draft saved. The public page has not changed.':action==='PUBLISH'?'Published on the school website.':'Removed from public view. History is retained.'});
 }catch(e){return failure(req,res,e);}});
 return router;
}
