import express from 'express';
import { createDecipheriv, createHash, createHmac, timingSafeEqual } from 'node:crypto';

const allowedPurposes = new Set(['LIBRARY','MEAL','EVENT','GENERAL']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function finish(req, res, status, payload, commit = true) {
  const client = req.auth?.client;
  req.auth.client = null;
  if (client) {
    try { await client.query(commit ? 'COMMIT' : 'ROLLBACK'); } finally { client.release(); }
  }
  return res.status(status).json(payload);
}
async function failed(req, res, error) {
  console.error('[digital-student-id]', { code: error?.code || null, kind: error?.name || 'Error' });
  const client = req.auth?.client;
  req.auth.client = null;
  if (client) { try { await client.query('ROLLBACK'); } catch {} client.release(); }
  return res.status(500).json({error:'Digital student ID request could not be completed.'});
}
function allowed(req, ...permissions) { return permissions.every(code=>req.auth.account.permissions.includes(code)); }
function csrfOk(req) {
  const expected = Buffer.from(String(req.auth.claims.csrfToken || ''));
  const supplied = Buffer.from(String(req.get('x-csrf-token') || ''));
  return expected.length === supplied.length && expected.length > 0 && timingSafeEqual(expected,supplied);
}
function signature(schoolId, studentId, credentialId) {
  return createHmac('sha256',process.env.APP_SESSION_SECRET||'').update(`redeemer-student-id:v1:${schoolId}:${studentId}:${credentialId}`).digest('base64url');
}
function signedToken(schoolId,studentId,credentialId){
  return `RIA1.${credentialId}.${signature(schoolId,studentId,credentialId)}`;
}
async function profile(client,schoolId,studentId) {
  const result=await client.query(`SELECT s.id,s.student_number,s.first_name,s.middle_name,s.last_name,s.status,
      school.name AS school_name, cg.name AS class_name, y.name AS academic_year,
      idc.id AS credential_id,idc.issued_at,idc.expires_at,idc.revoked_at,
      (SELECT d.id FROM student_documents d JOIN document_categories dc
        ON dc.school_id=d.school_id AND dc.id=d.category_id
       WHERE d.school_id=s.school_id AND d.student_id=s.id
         AND dc.code='STUDENT_PHOTO' AND d.deleted_at IS NULL
         AND d.media_type IN ('image/jpeg','image/png')
       ORDER BY d.uploaded_at DESC LIMIT 1) AS photo_id
    FROM students s JOIN schools school ON school.id=s.school_id
    LEFT JOIN class_enrollments ce ON ce.school_id=s.school_id AND ce.student_id=s.id AND ce.status='ACTIVE'
    LEFT JOIN class_groups cg ON cg.school_id=ce.school_id AND cg.id=ce.class_group_id
    LEFT JOIN academic_years y ON y.school_id=cg.school_id AND y.id=cg.academic_year_id
    LEFT JOIN LATERAL (SELECT id,issued_at,expires_at,revoked_at FROM student_id_credentials
      WHERE school_id=s.school_id AND student_id=s.id
      ORDER BY issued_at DESC LIMIT 1) idc ON true
    WHERE s.school_id=$1 AND s.id=$2 LIMIT 1`,[schoolId,studentId]);
  const card=result.rows[0];
  if(!card)return null;
  const active=Boolean(card.credential_id && !card.revoked_at &&
    new Date(card.expires_at).getTime()>Date.now() && card.status==='ACTIVE');
  return {
    studentId:card.id,studentNumber:card.student_number,
    fullName:[card.first_name,card.middle_name,card.last_name].filter(Boolean).join(' '),
    schoolName:card.school_name,className:card.class_name||null,
    academicYear:card.academic_year||null,photoAvailable:Boolean(card.photo_id),
    status:active?'ACTIVE':card.credential_id?(card.revoked_at?'REVOKED':'EXPIRED'):'NOT_ISSUED',
    issuedAt:card.issued_at||null,expiresAt:card.expires_at||null,
    qrPayload:active?signedToken(schoolId,card.id,card.credential_id):null
  };
}
async function linkedStudent(req){
  const result=await req.auth.client.query(`SELECT s.id FROM student_portal_links spl
      JOIN students s ON s.school_id=spl.school_id AND s.id=spl.student_id
      WHERE spl.school_id=$1 AND spl.user_id=$2 LIMIT 1`,
      [req.auth.claims.schoolId,req.auth.claims.userId]);
  return result.rows[0]?.id||null;
}
async function sendPhoto(req,res,studentId){
  const client=req.auth.client,schoolId=req.auth.claims.schoolId;
  const found=await client.query(`SELECT d.id,d.file_content,d.content_nonce,d.content_auth_tag,
       d.checksum_sha256,d.media_type FROM student_documents d
       JOIN document_categories category ON category.school_id=d.school_id AND category.id=d.category_id
       WHERE d.school_id=$1 AND d.student_id=$2 AND d.deleted_at IS NULL
       AND category.code='STUDENT_PHOTO' AND d.media_type IN ('image/jpeg','image/png')
       ORDER BY d.uploaded_at DESC LIMIT 1`,[schoolId,studentId]);
  if(!found.rowCount)return finish(req,res,404,{error:'No student photograph available.'},false);
  const photo=found.rows[0],raw=process.env.STUDENT_DOCUMENT_ENCRYPTION_KEY||'';
  const key=Buffer.from(raw,'base64');
  if(key.length!==32 || key.toString('base64')!==raw)return finish(req,res,503,{error:'Photograph storage is unavailable.'},false);
  const decipher=createDecipheriv('aes-256-gcm',key,photo.content_nonce);
  decipher.setAAD(Buffer.from(`${schoolId}:${studentId}:${photo.id}`));
  decipher.setAuthTag(photo.content_auth_tag);
  const decrypted=Buffer.concat([decipher.update(photo.file_content),decipher.final()]);
  if(createHash('sha256').update(decrypted).digest('hex')!==photo.checksum_sha256)
    return finish(req,res,500,{error:'Photograph integrity check failed.'},false);
  req.auth.client=null;
  try{await client.query('COMMIT');}finally{client.release();}
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type',photo.media_type);
  res.setHeader('Content-Disposition','inline');res.setHeader('X-Content-Type-Options','nosniff');
  return res.send(decrypted);
}

export function createDigitalStudentIdRouter({authenticate}) {
  const router=express.Router();
  router.use(authenticate);
  router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});

  router.get('/me',async(req,res)=>{
    try{
      if(!req.auth.account.roles.includes('STUDENT') || !allowed(req,'student.portal.read'))
        return finish(req,res,403,{error:'This ID is only available to the linked student account.'},false);
      const id=await linkedStudent(req);
      if(!id)return finish(req,res,404,{error:'No learner linked to your account.'},false);
      const card=await profile(req.auth.client,req.auth.claims.schoolId,id);
      return finish(req,res,200,{card});
    }catch(e){return failed(req,res,e);}
  });
  router.get('/me/photo',async(req,res)=>{
    try{
      if(!req.auth.account.roles.includes('STUDENT') || !allowed(req,'student.portal.read'))
        return finish(req,res,403,{error:'Not authorized.'},false);
      const id=await linkedStudent(req);
      if(!id)return finish(req,res,404,{error:'No learner linked to your account.'},false);
      const card=await profile(req.auth.client,req.auth.claims.schoolId,id);
      if(card?.status!=='ACTIVE')return finish(req,res,403,{error:'Digital ID is not active.'},false);
      return await sendPhoto(req,res,id);
    }catch(e){return failed(req,res,e);}
  });
  router.get('/students/:studentId',async(req,res)=>{
    try{
      if(!allowed(req,'students.read','students.sensitive.read'))
        return finish(req,res,403,{error:'Restricted student record access required.'},false);
      const id=req.params.studentId;
      if(!uuidPattern.test(id))return finish(req,res,400,{error:'Invalid student reference.'},false);
      const card=await profile(req.auth.client,req.auth.claims.schoolId,id);
      return finish(req,res,card?200:404,card?{card}:{error:'Student not found.'});
    }catch(e){return failed(req,res,e);}
  });
  router.get('/students/:studentId/photo',async(req,res)=>{
    try{
      if(!allowed(req,'students.read','students.sensitive.read'))
        return finish(req,res,403,{error:'Restricted student record access required.'},false);
      if(!uuidPattern.test(req.params.studentId))return finish(req,res,400,{error:'Invalid student reference.'},false);
      return await sendPhoto(req,res,req.params.studentId);
    }catch(e){return failed(req,res,e);}
  });

  router.post('/students/:studentId/issue',async(req,res)=>{
    try{
      if(!allowed(req,'students.write','students.sensitive.read')||!csrfOk(req))
        return finish(req,res,403,{error:'Authorized registrar and valid session required.'},false);
      if(req.body?.photoReviewed!==true)return finish(req,res,400,{error:'Review and approve the student photograph before issuing the ID.'},false);
      const id=req.params.studentId;
      if(!uuidPattern.test(id))return finish(req,res,400,{error:'Invalid student reference.'},false);
      const card=await profile(req.auth.client,req.auth.claims.schoolId,id);
      if(!card || card.status==='REVOKED' && !card.photoAvailable)return finish(req,res,404,{error:'Student record or photograph not found.'},false);
      const student=await req.auth.client.query(`SELECT s.id,s.status FROM students s
        JOIN class_enrollments ce ON ce.school_id=s.school_id AND ce.student_id=s.id AND ce.status='ACTIVE'
        WHERE s.school_id=$1 AND s.id=$2 FOR UPDATE OF s`,[req.auth.claims.schoolId,id]);
      if(!student.rowCount||student.rows[0].status!=='ACTIVE'||!card.photoAvailable)
        return finish(req,res,409,{error:'An active enrolled student with an approved photograph is required.'},false);
      await req.auth.client.query(`UPDATE student_id_credentials SET revoked_at=now(),revoked_by=$3
        WHERE school_id=$1 AND student_id=$2 AND revoked_at IS NULL`,[req.auth.claims.schoolId,id,req.auth.claims.userId]);
      await req.auth.client.query(`INSERT INTO student_id_credentials (school_id,student_id,issued_by,expires_at)
        VALUES ($1,$2,$3,now()+interval '1 year')`,[req.auth.claims.schoolId,id,req.auth.claims.userId]);
      await req.auth.client.query(`INSERT INTO audit_events (school_id,actor_user_id,action,entity_type,entity_id,details)
        VALUES ($1,$2,'STUDENT_DIGITAL_ID_ISSUED','STUDENT',$3,'{}'::jsonb)`,[req.auth.claims.schoolId,req.auth.claims.userId,id]);
      const updated=await profile(req.auth.client,req.auth.claims.schoolId,id);
      return finish(req,res,201,{card:updated});
    }catch(e){return failed(req,res,e);}
  });
  router.post('/students/:studentId/revoke',async(req,res)=>{
    try{
      if(!allowed(req,'students.write','students.sensitive.read')||!csrfOk(req))
        return finish(req,res,403,{error:'Authorized registrar and valid session required.'},false);
      const id=req.params.studentId;
      if(!uuidPattern.test(id))return finish(req,res,400,{error:'Invalid student reference.'},false);
      const changed=await req.auth.client.query(`UPDATE student_id_credentials SET revoked_at=now(),revoked_by=$3
        WHERE school_id=$1 AND student_id=$2 AND revoked_at IS NULL RETURNING id`,
        [req.auth.claims.schoolId,id,req.auth.claims.userId]);
      if(changed.rowCount)await req.auth.client.query(`INSERT INTO audit_events
        (school_id,actor_user_id,action,entity_type,entity_id,details)
        VALUES ($1,$2,'STUDENT_DIGITAL_ID_REVOKED','STUDENT',$3,'{}'::jsonb)`,
        [req.auth.claims.schoolId,req.auth.claims.userId,id]);
      return finish(req,res,200,{revoked:changed.rowCount>0});
    }catch(e){return failed(req,res,e);}
  });
  // Scanner may confirm school identity only; library loans, meals and event passes require
  // separate entitlement rules and must never be granted solely by scanning a card.
  router.post('/verify',async(req,res)=>{
    try{
      if(!allowed(req,'students.read')||!csrfOk(req))
        return finish(req,res,403,{error:'Authorized school staff required.'},false);
      const token=String(req.body?.token||'').trim(),purpose=String(req.body?.purpose||'GENERAL').toUpperCase();
      if(token.length>160 || !allowedPurposes.has(purpose))
        return finish(req,res,400,{error:'Invalid scan data.'},false);
      const match=/^RIA1\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/i.exec(token);
      if(!match || !uuidPattern.test(match[1]))return finish(req,res,200,{valid:false});
      const found=await req.auth.client.query(`SELECT id,student_id FROM student_id_credentials
        WHERE school_id=$1 AND id=$2 AND revoked_at IS NULL AND expires_at>now()`,
        [req.auth.claims.schoolId,match[1]]);
      if(!found.rowCount)return finish(req,res,200,{valid:false});
      const cred=found.rows[0],expected=signature(req.auth.claims.schoolId,cred.student_id,cred.id);
      const lhs=Buffer.from(expected),rhs=Buffer.from(match[2]);
      if(lhs.length!==rhs.length||!timingSafeEqual(lhs,rhs))
        return finish(req,res,200,{valid:false});
      const card=await profile(req.auth.client,req.auth.claims.schoolId,cred.student_id);
      const valid=card?.status==='ACTIVE';
      if(valid)await req.auth.client.query(`INSERT INTO audit_events
        (school_id,actor_user_id,action,entity_type,entity_id,details)
        VALUES ($1,$2,'STUDENT_ID_SCANNED','STUDENT',$3,$4::jsonb)`,
        [req.auth.claims.schoolId,req.auth.claims.userId,cred.student_id,JSON.stringify({purpose})]);
      return finish(req,res,200,valid?{valid:true,purpose,student:{name:card.fullName,studentNumber:card.studentNumber,className:card.className}}:{valid:false});
    }catch(e){return failed(req,res,e);}
  });
  return router;
}
