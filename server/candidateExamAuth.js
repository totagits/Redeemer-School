import express from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isStrongSessionSecret } from './authCrypto.js';
import { hashCandidateSecret } from './admissionExamCredential.js';
import { redeemExamCredential } from './admissionExamRedemption.js';
import { validateCandidateExamSession } from './admissionExamSession.js';
import { verifyGuardianEmail } from './admissionGuardianEmail.js';

const COOKIE='redeemer_exam_candidate';
const PATH='/api/candidate-exams';
const proofJoins=`JOIN admission_guardian_email_verifications v ON v.school_id=c.school_id
 AND v.application_id=c.application_id AND v.id=c.guardian_verification_id
 JOIN admission_guardians g ON g.school_id=v.school_id AND g.application_id=v.application_id
 AND g.first_name=v.guardian_first_name AND g.last_name=v.guardian_last_name AND g.relationship=v.guardian_relationship
 AND lower(btrim(g.email))=v.email`;
const proofValid=`v.verified_at IS NOT NULL AND v.revoked_at IS NULL AND v.verified_at>=now()-interval '30 days'`;

// Disabled by default. Mailbox proof establishes access to the registered address,
// not legal guardianship, exam results, or an admission decision.
export function createCandidateExamRouter({pool,secret,publicUrl,enabled=false}) {
  const router=express.Router(),attempts=new Map();
  let origin;
  try {const u=new URL(publicUrl);if(u.protocol==='https:'&&!u.username&&!u.password)origin=u.origin;}catch{}
  const mac=value=>createHmac('sha256',secret).update('candidate-exam:v1:'+value).digest('base64url');
  function sign(claims){const payload=Buffer.from(JSON.stringify(claims)).toString('base64url');return payload+'.'+mac(payload);}
  function claimsFrom(req){
    const value=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    if(!value||value.length>2048)return null;
    const [payload,sig,...extra]=value.split('.');if(extra.length||!payload||!sig)return null;
    const expected=Buffer.from(mac(payload)),actual=Buffer.from(sig);
    if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return null;
    try {const c=JSON.parse(Buffer.from(payload,'base64url').toString());
      const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
      return uuid.test(c.schoolId)&&uuid.test(c.examId)&&hashCandidateSecret(c.token)&&typeof c.csrf==='string'&&c.csrf.length===43&&Number.isSafeInteger(c.expiresAt)&&c.expiresAt>Date.now()?c:null;
    }catch{return null;}
  }
  function cookie(res,value,maxAge){res.setHeader('Set-Cookie',`${COOKIE}=${value}; Path=${PATH}; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(0,Math.floor(maxAge))}`);}
  async function transaction(action){
    const client=await pool.connect();
    try {await client.query('BEGIN');
      const role=await client.query('SELECT NOT rolsuper AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname=current_user');
      if(role.rows[0]?.safe!==true)throw new Error('Unsafe runtime role');
      const result=await action(client);await client.query('COMMIT');return result;
    }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
  }
  const tenant=(client,id)=>client.query("SELECT set_config('app.current_school_id',$1,true)",[id]);
  router.get('/status',(_req,res)=>{res.setHeader('Cache-Control','no-store');return res.json({enabled:Boolean(enabled&&pool&&origin&&isStrongSessionSecret(secret)),sittingAvailable:false});});
  router.use((req,res,next)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    if(!enabled||!pool||!origin||!isStrongSessionSecret(secret))return res.status(503).json({error:'Candidate sign-in is not enabled.'});
    if(req.method!=='GET'&&(req.get('Origin')!==origin||!req.is('application/json')))return res.status(403).json({error:'Use the school examination page to continue.'});
    if(req.method==='POST'){
      const now=Date.now();for(const [key,item] of attempts)if(item.until<=now)attempts.delete(key);
      const key=req.ip||'unknown';const item=attempts.get(key)||{count:0,until:now+900_000};
      if(item.count>=10||(!attempts.has(key)&&attempts.size>=10_000))return res.status(429).json({error:'Too many attempts. Try again in 15 minutes.'});
      item.count++;attempts.set(key,item);
    }
    next();
  });
  router.post('/verify-email',async(req,res)=>{
    try {const ok=await transaction(async client=>{
      const code=typeof req.body?.schoolCode==='string'?req.body.schoolCode.trim().toUpperCase():'';
      if(!/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(code))return false;
      const school=(await client.query('SELECT app.resolve_school_id_by_code($1) AS id',[code])).rows[0]?.id;
      if(!school)return false;await tenant(client,school);
      return (await verifyGuardianEmail(client,{schoolId:school,token:req.body?.code})).ok;
    });return res.status(ok?200:401).json(ok?{verified:true}:{error:'The code is invalid, expired, or already used.'});
    }catch{return res.status(503).json({error:'Email verification is temporarily unavailable.'});}
  });
  router.post('/login',async(req,res)=>{
    try {const result=await transaction(async client=>{
      const schoolCode=typeof req.body?.schoolCode==='string'?req.body.schoolCode.trim().toUpperCase():'';
      const hash=hashCandidateSecret(req.body?.code);
      if(!/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(schoolCode)||!hash)return null;
      const school=(await client.query('SELECT app.resolve_school_id_by_code($1) AS id',[schoolCode])).rows[0]?.id;
      if(!school)return null;await tenant(client,school);
      const credential=(await client.query(`SELECT c.exam_id,c.application_id FROM admission_exam_candidate_credentials c ${proofJoins}
        WHERE c.school_id=$1 AND c.token_hash=$2 AND ${proofValid} LIMIT 1`,[school,hash])).rows[0];
      if(!credential)return null;
      const redeemed=await redeemExamCredential(client,{schoolId:school,examId:credential.exam_id,applicationId:credential.application_id,token:req.body.code});
      if(!redeemed.ok)return null;
      return {schoolId:school,examId:credential.exam_id,token:redeemed.sessionToken,expiresAt:new Date(redeemed.expiresAt).valueOf(),csrf:randomBytes(32).toString('base64url')};
    });
      if(!result)return res.status(401).json({error:'Cannot sign in. Check the code and scheduled examination time.'});
      cookie(res,sign(result),(result.expiresAt-Date.now())/1000);
      return res.json({signedIn:true,csrfToken:result.csrf});
    }catch{return res.status(503).json({error:'Candidate sign-in is temporarily unavailable.'});}
  });
  router.get('/session',async(req,res)=>{
    const claims=claimsFrom(req);if(!claims)return res.status(401).json({error:'Sign in with your examination code.'});
    try {const result=await transaction(async client=>{
      await tenant(client,claims.schoolId);
      const session=await validateCandidateExamSession(client,{schoolId:claims.schoolId,examId:claims.examId,sessionToken:claims.token});
      if(!session.ok)return null;
      const proof=await client.query(`SELECT e.title,e.ends_at FROM admission_exam_candidate_sessions s
        JOIN admission_exam_candidate_credentials c ON c.school_id=s.school_id AND c.id=s.credential_id
        ${proofJoins} JOIN admission_entrance_exams e ON e.school_id=s.school_id AND e.id=s.exam_id
        WHERE s.school_id=$1 AND s.id=$2 AND ${proofValid}`,[claims.schoolId,session.sessionId]);
      return proof.rows[0]||null;
    });
      if(!result){cookie(res,'',0);return res.status(401).json({error:'Your examination session is no longer available.'});}
      return res.json({exam:result,csrfToken:claims.csrf,sittingAvailable:false});
    }catch{return res.status(503).json({error:'The examination session could not be checked.'});}
  });
  router.post('/logout',async(req,res)=>{
    const c=claimsFrom(req);if(!c||req.get('X-CSRF-Token')!==c.csrf)return res.status(403).json({error:'Refresh your examination page and try again.'});
    try {await transaction(async client=>{await tenant(client,c.schoolId);await client.query('UPDATE admission_exam_candidate_sessions SET revoked_at=now() WHERE school_id=$1 AND exam_id=$2 AND session_hash=$3',[c.schoolId,c.examId,hashCandidateSecret(c.token)]);});cookie(res,'',0);return res.json({signedOut:true});}
    catch{return res.status(503).json({error:'Sign-out could not be completed. Try again.'});}
  });
  return router;
}
