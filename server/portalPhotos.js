import express from 'express';
import { randomUUID, randomBytes, createHash, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';

const roles=(req,...values)=>req.auth.account.roles.some(value=>values.includes(value));
const permitted=(req,...codes)=>codes.every(code=>req.auth.account.permissions.includes(code));
function photoKey() {const source=process.env.STUDENT_DOCUMENT_ENCRYPTION_KEY||'';const key=Buffer.from(source,'base64');return key.length===32&&key.toString('base64')===source?key:null;}
function seal(bytes,key,associated){const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from(associated));return {nonce,content:Buffer.concat([cipher.update(bytes),cipher.final()]),tag:cipher.getAuthTag()};}
function openPhoto(record,key,associated){const decipher=createDecipheriv('aes-256-gcm',key,record.content_nonce);decipher.setAAD(Buffer.from(associated));decipher.setAuthTag(record.content_auth_tag);const bytes=Buffer.concat([decipher.update(record.file_content),decipher.final()]);if(createHash('sha256').update(bytes).digest('hex')!==record.checksum_sha256)throw new Error('Photo checksum verification failed');return bytes;}
async function finish(req,res,status,data,commit=true){const client=req.auth.client;req.auth.client=null;try{await client.query(commit?'COMMIT':'ROLLBACK')}finally{client.release()}return res.status(status).json(data);}
async function fail(req,res,error){console.error('[portal-photo]',{code:error?.code||null,name:error?.name||'Error'});const client=req.auth?.client;req.auth.client=null;if(client){try{await client.query('ROLLBACK')}catch{}client.release()}return res.status(500).json({error:'Photo operation could not be completed.'});}
function csrfOk(req){const a=Buffer.from(String(req.auth.claims.csrfToken||'')),b=Buffer.from(String(req.get('x-csrf-token')||''));return a.length>0&&a.length===b.length&&timingSafeEqual(a,b);}
async function audit(req,action,id,details={}){await req.auth.client.query(`INSERT INTO audit_events(school_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,'PHOTO_SUBMISSION',$4,$5::jsonb)`,[req.auth.claims.schoolId,req.auth.claims.userId,action,id,JSON.stringify(details)]);}
async function familyLink(req,studentId){return req.auth.client.query(`SELECT g.id FROM guardians g
 JOIN student_guardians sg ON sg.school_id=g.school_id AND sg.guardian_id=g.id
 WHERE g.school_id=$1 AND g.user_id=$2 AND g.active AND sg.student_id=$3`,
 [req.auth.claims.schoolId,req.auth.claims.userId,studentId]);}
async function readImage(req,res,record){
 const key=photoKey();if(!key)return finish(req,res,503,{error:'Encrypted photo storage unavailable.'},false);
 const bytes=openPhoto(record,key,`${req.auth.claims.schoolId}:family-photo:${record.id}`);
 const client=req.auth.client;req.auth.client=null;try{await client.query('COMMIT')}finally{client.release()}
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type',record.media_type);res.setHeader('Content-Disposition','inline');res.setHeader('X-Content-Type-Options','nosniff');return res.send(bytes);
}
export function createPortalPhotoRouter({authenticate}){
 const router=express.Router();router.use(authenticate);router.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');next()});
 router.get('/mine/:studentId',async(req,res)=>{try{
  if(!roles(req,'PARENT')||!permitted(req,'guardian.portal.read'))return finish(req,res,403,{error:'Guardian portal login required.'},false);
  const link=await familyLink(req,req.params.studentId);
  if(!link.rowCount)return finish(req,res,403,{error:'This student is not linked to your guardian account.'},false);
  const items=await req.auth.client.query(`SELECT id,subject_type,status,original_filename,submitted_at,reviewed_at,review_note FROM portal_photo_submissions
   WHERE school_id=$1 AND student_id=$2 AND guardian_id=$3 ORDER BY submitted_at DESC LIMIT 30`,
   [req.auth.claims.schoolId,req.params.studentId,link.rows[0].id]);
  return finish(req,res,200,{submissions:items.rows});
 }catch(error){return fail(req,res,error)}});
 router.post('/mine/:studentId',express.raw({type:['image/jpeg','image/png'],limit:'3mb'}),async(req,res)=>{try{
  if(!roles(req,'PARENT')||!permitted(req,'guardian.portal.read')||!csrfOk(req))return finish(req,res,403,{error:'Authorized guardian session required.'},false);
  const link=await familyLink(req,req.params.studentId);
  if(!link.rowCount)return finish(req,res,403,{error:'Student is not linked to this parent account.'},false);
  const bytes=req.body,mediaType=String(req.get('content-type')||'').split(';')[0].trim().toLowerCase();
  const validJpeg=mediaType==='image/jpeg'&&Buffer.isBuffer(bytes)&&bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const validPng=mediaType==='image/png'&&Buffer.isBuffer(bytes)&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const subject=String(req.query.subject||'').toUpperCase(),filename=String(req.query.filename||'portrait').replace(/[\\/\x00-\x1f]/g,'_').slice(0,150);
  if(!['STUDENT','GUARDIAN'].includes(subject)||(!validJpeg&&!validPng)||bytes.length>3145728)
   return finish(req,res,400,{error:'Choose a valid JPG or PNG photograph up to 3 MB and a photo subject.'},false);
  const key=photoKey();if(!key)return finish(req,res,503,{error:'Encrypted photograph storage is unavailable.'},false);
  const school=req.auth.claims.schoolId,id=randomUUID(),encrypted=seal(bytes,key,`${school}:family-photo:${id}`);
  const existing=await req.auth.client.query(`SELECT COUNT(*)::int AS count FROM portal_photo_submissions
   WHERE school_id=$1 AND student_id=$2 AND guardian_id=$3 AND subject_type=$4 AND status='PENDING'`,
   [school,req.params.studentId,link.rows[0].id,subject]);
  if(existing.rows[0].count>=3)return finish(req,res,429,{error:'Three photos are already awaiting review for this subject.'},false);
  await req.auth.client.query(`INSERT INTO portal_photo_submissions
   (id,school_id,student_id,guardian_id,submitted_by,subject_type,media_type,original_filename,size_bytes,checksum_sha256,file_content,content_nonce,content_auth_tag)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
   [id,school,req.params.studentId,link.rows[0].id,req.auth.claims.userId,subject,mediaType,filename,bytes.length,
    createHash('sha256').update(bytes).digest('hex'),encrypted.content,encrypted.nonce,encrypted.tag]);
  await audit(req,'GUARDIAN_PHOTO_SUBMITTED',id,{studentId:req.params.studentId,subject});
  return finish(req,res,201,{submission:{id,status:'PENDING',subject_type:subject}});
 }catch(error){return fail(req,res,error)}});
 router.get('/queue',async(req,res)=>{try{
  if(!permitted(req,'students.read','students.sensitive.read')||roles(req,'PARENT','STUDENT'))
   return finish(req,res,403,{error:'Authorized school staff required.'},false);
  const items=await req.auth.client.query(`SELECT p.id,p.student_id,p.guardian_id,p.subject_type,p.original_filename,p.status,p.submitted_at,
   s.student_number,s.first_name AS student_first_name,s.last_name AS student_last_name,
   g.first_name AS guardian_first_name,g.last_name AS guardian_last_name
   FROM portal_photo_submissions p JOIN students s ON s.school_id=p.school_id AND s.id=p.student_id
   JOIN guardians g ON g.school_id=p.school_id AND g.id=p.guardian_id
   WHERE p.school_id=$1 AND p.status='PENDING' ORDER BY p.submitted_at ASC LIMIT 100`,[req.auth.claims.schoolId]);
  return finish(req,res,200,{submissions:items.rows});
 }catch(error){return fail(req,res,error)}});
 router.get('/:id/image',async(req,res)=>{try{
  const staff=!roles(req,'PARENT','STUDENT')&&permitted(req,'students.read','students.sensitive.read');
  const parent=roles(req,'PARENT')&&permitted(req,'guardian.portal.read');
  if(!staff&&!parent)return finish(req,res,403,{error:'Photo access denied.'},false);
  const found=await req.auth.client.query('SELECT * FROM portal_photo_submissions WHERE school_id=$1 AND id=$2',
    [req.auth.claims.schoolId,req.params.id]);const row=found.rows[0];
  if(!row)return finish(req,res,404,{error:'Photograph not found.'},false);
  if(parent){
    const links=await familyLink(req,row.student_id);
    if(!links.rows.some(x=>x.id===row.guardian_id))return finish(req,res,403,{error:'Not authorized for this photograph.'},false);
  }
  return readImage(req,res,row);
 }catch(error){return fail(req,res,error)}});
 router.post('/:id/review',async(req,res)=>{try{
  if(roles(req,'PARENT','STUDENT')||!permitted(req,'students.write','students.sensitive.read')||!csrfOk(req))
   return finish(req,res,403,{error:'Authorized school registrar required.'},false);
  const choice=String(req.body?.decision||'').toUpperCase(),note=String(req.body?.note||'').trim().slice(0,400);
  if(!['APPROVED','REJECTED'].includes(choice)||choice==='REJECTED'&&!note)
   return finish(req,res,400,{error:'Choose approve or reject, and give a reason for rejection.'},false);
  const school=req.auth.claims.schoolId;
  const found=await req.auth.client.query('SELECT * FROM portal_photo_submissions WHERE school_id=$1 AND id=$2 FOR UPDATE',[school,req.params.id]);
  const p=found.rows[0];if(!p)return finish(req,res,404,{error:'Submission not found.'},false);
  if(p.status!=='PENDING')return finish(req,res,409,{error:'This submission was already reviewed.'},false);
  let documentId=null;
  if(choice==='APPROVED'&&p.subject_type==='STUDENT'){
    // Serialize with other learner photo changes and ID issuance.
    const student=await req.auth.client.query('SELECT id FROM students WHERE school_id=$1 AND id=$2 FOR UPDATE',[school,p.student_id]);
    if(!student.rowCount)return finish(req,res,404,{error:'Student not found.'},false);
    const category=await req.auth.client.query("SELECT id FROM document_categories WHERE school_id=$1 AND code='STUDENT_PHOTO' LIMIT 1",[school]);
    if(!category.rowCount)return finish(req,res,503,{error:'Student photo category not configured.'},false);
    const key=photoKey();if(!key)return finish(req,res,503,{error:'Encrypted photograph storage unavailable.'},false);
    const raw=openPhoto(p,key,`${school}:family-photo:${p.id}`);
    documentId=randomUUID();
    const encrypted=seal(raw,key,`${school}:${p.student_id}:${documentId}`);
    await req.auth.client.query(`INSERT INTO student_documents
      (id,school_id,student_id,category_id,title,object_storage_key,original_filename,media_type,size_bytes,checksum_sha256,visibility,uploaded_by,file_content,content_nonce,content_auth_tag)
      VALUES($1,$2,$3,$4,'Approved student photograph',$5,$6,$7,$8,$9,'RESTRICTED',$10,$11,$12,$13)`,
      [documentId,school,p.student_id,category.rows[0].id,`db-encrypted:${documentId}`,p.original_filename,p.media_type,raw.length,p.checksum_sha256,
       req.auth.claims.userId,encrypted.content,encrypted.nonce,encrypted.tag]);
    await req.auth.client.query(`UPDATE student_documents SET deleted_at=now()
       WHERE school_id=$1 AND student_id=$2 AND category_id=$3 AND id<>$4 AND deleted_at IS NULL`,
       [school,p.student_id,category.rows[0].id,documentId]);
    const revoked=await req.auth.client.query(`UPDATE student_id_credentials SET revoked_at=now(),revoked_by=$3
       WHERE school_id=$1 AND student_id=$2 AND revoked_at IS NULL RETURNING id`,
       [school,p.student_id,req.auth.claims.userId]);
    if(revoked.rowCount)await audit(req,'STUDENT_ID_REVOKED_AFTER_PHOTO_APPROVAL',p.id,{studentId:p.student_id});
  }
  await req.auth.client.query(`UPDATE portal_photo_submissions SET status=$3,reviewed_at=now(),reviewed_by=$4,review_note=$5,approved_document_id=$6
     WHERE school_id=$1 AND id=$2`,[school,p.id,choice,req.auth.claims.userId,note||null,documentId]);
  await audit(req,'GUARDIAN_PHOTO_REVIEWED',p.id,{decision:choice,subject:p.subject_type,studentId:p.student_id});
  return finish(req,res,200,{status:choice,studentId:p.student_id,digitalIdRequiresReissue:Boolean(documentId)});
 }catch(error){return fail(req,res,error)}});
 return router;
}
