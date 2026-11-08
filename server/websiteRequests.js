import express from 'express';
import {createHash,randomBytes} from 'node:crypto';
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const categories=['ENQUIRY','VISIT','RECORDS'];
const statuses=['NEW','IN_PROGRESS','WAITING_FOR_VISITOR','RESOLVED','CLOSED'];
const transitions={NEW:['IN_PROGRESS','CLOSED'],IN_PROGRESS:['WAITING_FOR_VISITOR','RESOLVED','CLOSED'],WAITING_FOR_VISITOR:['IN_PROGRESS','RESOLVED','CLOSED'],RESOLVED:['IN_PROGRESS','CLOSED'],CLOSED:['IN_PROGRESS']};
export class WebsiteRequestError extends Error {constructor(message,status=400){super(message);this.status=status;}}
function text(value,max,required=false){if(value==null&&!required)return '';if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))throw new WebsiteRequestError('Check the required fields and their length limits.');return value.trim();}
export function parseWebsiteRequest(body){
 const result={category:text(body?.category,20,true),contactName:text(body?.contactName,120,true),email:text(body?.email,254).toLowerCase(),phone:text(body?.phone,40),subject:text(body?.subject,160,true),message:text(body?.message,2000,true),preferredDate:text(body?.preferredDate,10)};
 if(!categories.includes(result.category)||result.contactName.length<2||result.subject.length<3||result.message.length<10||(!result.email&&!result.phone)||
 (result.email&&!/^\S+@\S+\.\S+$/.test(result.email))||(result.phone&&!/^[+0-9() .-]{7,40}$/.test(result.phone))||body?.consent!==true||!uuid.test(body?.requestId))throw new WebsiteRequestError('Enter your name, request, a valid contact method and consent.');
 if(result.preferredDate){const date=new Date(result.preferredDate+'T00:00:00Z');if(result.category!=='VISIT'||!/^\d{4}-\d{2}-\d{2}$/.test(result.preferredDate)||!Number.isFinite(date.valueOf())||date.toISOString().slice(0,10)!==result.preferredDate||result.preferredDate<new Date().toISOString().slice(0,10))throw new WebsiteRequestError('Choose a valid future visit date, or leave it for the school to arrange.');}
 return result;
}
export async function savePublicWebsiteRequest(client,schoolId,body){
 const data=parseWebsiteRequest(body),hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 const reference='WEB-'+new Date().getUTCFullYear()+'-'+randomBytes(6).toString('hex').toUpperCase();
 const inserted=await client.query(`INSERT INTO website_requests(school_id,reference,client_request_id,payload_hash,category,contact_name,email,phone,subject,message,preferred_date)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULLIF($11,'')::date) ON CONFLICT(school_id,client_request_id) DO NOTHING RETURNING id,reference`,[schoolId,reference,body.requestId,hash,data.category,data.contactName,data.email,data.phone,data.subject,data.message,data.preferredDate]);
 if(!inserted.rowCount){const previous=(await client.query('SELECT reference,payload_hash FROM website_requests WHERE school_id=$1 AND client_request_id=$2',[schoolId,body.requestId])).rows[0];if(!previous||previous.payload_hash!==hash)throw new WebsiteRequestError('This submission reference was already used for different details. Start a new request.',409);return {reference:previous.reference,created:false};}
 const row=inserted.rows[0];
 await client.query("INSERT INTO website_request_events(school_id,request_id,event_type,to_status) VALUES($1,$2,'RECEIVED','NEW')",[schoolId,row.id]);
 await client.query("INSERT INTO audit_events(school_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,NULL,'WEBSITE_REQUEST_RECEIVED','WEBSITE_REQUEST',$2,$3::jsonb)",[schoolId,row.id,JSON.stringify({reference:row.reference,category:data.category})]);
 return {reference:row.reference,created:true};
}
export function createPublicWebsiteRequestsRouter({pool,publicUrl}){
 const router=express.Router(),attempts=new Map();let origin;try{const url=new URL(publicUrl);if(url.protocol==='https:'&&!url.username&&!url.password)origin=url.origin;}catch{}
 router.use(express.json({limit:'8kb'}));
 router.post('/',async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(!pool||!origin)return res.status(503).json({error:'Online requests are temporarily unavailable. Contact the school office.'});
  if(req.get('Origin')!==origin||!req.is('application/json'))return res.status(403).json({error:'Use the school website request form.'});
  const now=Date.now();for(const [key,item]of attempts)if(item.until<=now)attempts.delete(key);
  const key=req.ip||'unknown',item=attempts.get(key)||{count:0,until:now+900_000};
  if(item.count>=6||(!attempts.has(key)&&attempts.size>=10000))return res.status(429).json({error:'Too many requests. Please try again in 15 minutes.'});item.count++;attempts.set(key,item);
  if(req.body?.website)return res.status(202).json({accepted:true});
  let client;try{
   const schoolCode=text(req.body?.schoolCode,50,true).toUpperCase();if(!/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(schoolCode))throw new WebsiteRequestError('Select a valid school.');parseWebsiteRequest(req.body);
   client=await pool.connect();await client.query('BEGIN');
   const safe=await client.query('SELECT NOT rolsuper AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname=current_user');if(safe.rows[0]?.safe!==true)throw Error('Unsafe runtime role');
   const school=(await client.query('SELECT app.resolve_school_id_by_code($1) AS id',[schoolCode])).rows[0]?.id;if(!school)throw new WebsiteRequestError('School not found.',404);
   await client.query("SELECT set_config('app.current_school_id',$1,true)",[school]);
   const result=await savePublicWebsiteRequest(client,school,req.body);await client.query('COMMIT');return res.status(result.created?201:200).json({accepted:true,reference:result.reference});
  }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});return res.status(e instanceof WebsiteRequestError?e.status:503).json({error:e instanceof WebsiteRequestError?e.message:'The request could not be recorded. Please try again or contact the school office.'});}finally{client?.release();}
 });
 router.use((e,_req,res,_next)=>res.status(e?.status===413?413:400).json({error:'Use a valid request within the allowed size.'}));
 return router;
}
export async function updateWebsiteRequest(client,{schoolId,userId,id,revision,status,note,claim=false}){
 if(!uuid.test(id)||!Number.isInteger(revision)||typeof claim!=='boolean')throw new WebsiteRequestError('Reload the request before updating.');
 note=text(note,2000,true);if(note.length<10)throw new WebsiteRequestError('Record a follow-up note of at least 10 characters.');
 const row=(await client.query('SELECT * FROM website_requests WHERE school_id=$1 AND id=$2 FOR UPDATE',[schoolId,id])).rows[0];
 if(!row)throw new WebsiteRequestError('Request not found.',404);if(row.revision!==revision)throw new WebsiteRequestError('This request changed. Reload before updating.',409);
 if(!statuses.includes(status)||(status!==row.status&&!transitions[row.status].includes(status))||(!claim&&status===row.status))throw new WebsiteRequestError('Choose a permitted next step.');
 if(claim&&row.status==='CLOSED')throw new WebsiteRequestError('Reopen a closed request before taking follow-up.');
 await client.query('UPDATE website_requests SET status=$3,assigned_to=CASE WHEN $4 THEN $5 ELSE assigned_to END,revision=revision+1,updated_at=clock_timestamp() WHERE school_id=$1 AND id=$2',[schoolId,id,status,claim,userId]);
 await client.query('INSERT INTO website_request_events(school_id,request_id,actor_user_id,event_type,from_status,to_status,note) VALUES($1,$2,$3,$4,$5,$6,$7)',[schoolId,id,userId,claim?'ASSIGNED':'STATUS_CHANGED',row.status,status,note]);
 return {updated:true};
}
export function registerWebsiteRequestStaffRoutes(router,{csrf,close,done,fail,audit}){
 const guard=async(req,res,next)=>{res.set('Cache-Control','no-store');if(!req.auth.account.roles.some(role=>['SCHOOL_ADMIN','PRINCIPAL','REGISTRAR'].includes(role))||!req.auth.account.permissions.includes('admissions.read')){await close(req,false);return res.status(403).json({error:'Administrative follow-up access is required.'});}next();};
 const error=async(req,res,e)=>{if(e instanceof WebsiteRequestError){await close(req,false);return res.status(e.status).json({error:e.message});}return fail(req,res,e);};
 router.get('/website-requests',guard,async(req,res)=>{try{
  const status=req.query.status||'NEW',before=req.query.before||null;if(![...statuses,'ALL'].includes(status)||(before&&!uuid.test(before)))throw new WebsiteRequestError('Choose valid queue filters.');
  const result=await req.auth.client.query(`SELECT r.id,r.reference,r.category,r.subject,r.contact_name,r.status,r.created_at,r.revision,u.full_name AS assigned_name FROM website_requests r
   LEFT JOIN user_accounts u ON u.school_id=r.school_id AND u.id=r.assigned_to
   WHERE r.school_id=$1 AND ($2='ALL' OR r.status=$2) AND ($3::uuid IS NULL OR (r.created_at,r.id)<(SELECT created_at,id FROM website_requests WHERE school_id=$1 AND id=$3)) ORDER BY r.created_at DESC,r.id DESC LIMIT 51`,[req.auth.claims.schoolId,status,before]);
  return done(req,res,200,{requests:result.rows.slice(0,50),nextCursor:result.rows.length>50?result.rows[49].id:null});
 }catch(e){return error(req,res,e);}});
 router.get('/website-requests/:id',guard,async(req,res)=>{try{
  if(!uuid.test(req.params.id))throw new WebsiteRequestError('Select a valid request.');const school=req.auth.claims.schoolId;
  const row=(await req.auth.client.query('SELECT * FROM website_requests WHERE school_id=$1 AND id=$2',[school,req.params.id])).rows[0];if(!row)throw new WebsiteRequestError('Request not found.',404);
  const events=await req.auth.client.query(`SELECT e.event_type,e.from_status,e.to_status,e.note,e.created_at,u.full_name AS actor_name FROM website_request_events e LEFT JOIN user_accounts u ON u.school_id=e.school_id AND u.id=e.actor_user_id WHERE e.school_id=$1 AND e.request_id=$2 ORDER BY e.created_at,e.id`,[school,row.id]);
  const {payload_hash,client_request_id,...request}=row;return done(req,res,200,{request,events:events.rows});
 }catch(e){return error(req,res,e);}});
 router.post('/website-requests/:id/follow-up',guard,csrf,async(req,res)=>{try{
  const result=await updateWebsiteRequest(req.auth.client,{schoolId:req.auth.claims.schoolId,userId:req.auth.claims.userId,id:req.params.id,...{revision:req.body?.revision,status:req.body?.status,note:req.body?.note,claim:req.body?.claim??false}});
  await audit(req,'WEBSITE_REQUEST_FOLLOW_UP','WEBSITE_REQUEST',req.params.id,{status:req.body.status,claim:req.body.claim===true});return done(req,res,200,result);
 }catch(e){return error(req,res,e);}});
}
