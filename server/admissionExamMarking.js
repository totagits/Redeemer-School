import { issueCandidateSecret,hashCandidateSecret } from './admissionExamCredential.js';
import { findVerifiedGuardianEmail } from './admissionGuardianEmail.js';
import { sendExamEmail } from './admissionExamEmail.js';

export class ExamMarkingError extends Error {constructor(message,status=409){super(message);this.status=status;}}
const cents=value=>{const n=Number(value);if(!Number.isFinite(n)||n<0||Math.abs(n*100-Math.round(n*100))>1e-7)throw new ExamMarkingError('Use valid marks with at most two decimal places.',400);return Math.round(n*100);};
export async function markingDetail(client,{schoolId,examId,attemptId}){
 const attempt=await client.query(`SELECT a.id,a.application_id,a.status,app.application_number,app.first_name,app.last_name,
   p.questions,p.answer_keys FROM admission_exam_attempts a
   JOIN admission_exam_question_sets p ON p.school_id=a.school_id AND p.exam_id=a.exam_id AND p.id=a.question_set_id
   JOIN admission_applications app ON app.school_id=a.school_id AND app.id=a.application_id
   WHERE a.school_id=$1 AND a.exam_id=$2 AND a.id=$3 AND a.status='SUBMITTED'`,[schoolId,examId,attemptId]);
 if(!attempt.rowCount)throw new ExamMarkingError('Submitted examination attempt not found.',404);
 const answers=await client.query('SELECT question_id,answer FROM admission_exam_answers WHERE school_id=$1 AND exam_id=$2 AND attempt_id=$3',[schoolId,examId,attemptId]);
 const marking=await client.query('SELECT * FROM admission_exam_marking WHERE school_id=$1 AND attempt_id=$2',[schoolId,attemptId]);
 return {attempt:attempt.rows[0],answers:answers.rows,marking:marking.rows[0]||null};
}
export async function saveExamMarking(client,scope,{marks,feedback='',revision},userId){
 // Serialize initial marking and edits on the immutable submitted attempt.
 await client.query('SELECT id FROM admission_exam_attempts WHERE school_id=$1 AND exam_id=$2 AND id=$3 FOR UPDATE',[scope.schoolId,scope.examId,scope.attemptId]);
 // Approval locks the marking row independently. Re-read it only after acquiring
 // the same lock, so a competing save reports a conflict instead of a SQL error.
 await client.query('SELECT id FROM admission_exam_marking WHERE school_id=$1 AND exam_id=$2 AND attempt_id=$3 FOR UPDATE',[scope.schoolId,scope.examId,scope.attemptId]);
 const data=await markingDetail(client,scope),previous=data.marking;
 if(previous?.approved_at||previous?.released_at)throw new ExamMarkingError('Approved marks are locked.');
 if(!Number.isInteger(revision)||revision!==(previous?.revision||0))throw new ExamMarkingError('Marks have changed. Reload before saving.');
 if(!Array.isArray(marks)||marks.length!==data.attempt.questions.length||marks.length>100||typeof feedback!=='string'||feedback.length>2000)throw new ExamMarkingError('Mark every question and keep feedback within 2,000 characters.',400);
 const input=new Map();for(const mark of marks){if(!mark||typeof mark.questionId!=='string'||typeof mark.points!=='number'||input.has(mark.questionId))throw new ExamMarkingError('Each question needs one valid mark.',400);input.set(mark.questionId,mark.points);}
 let total=0,maximum=0;
 const checked=data.attempt.questions.map(q=>{if(!input.has(q.id))throw new ExamMarkingError('Marks must match this examination question set.',400);const max=cents(q.points),earned=cents(input.get(q.id));if(earned>max)throw new ExamMarkingError('A mark exceeds its question maximum.',400);total+=earned;maximum+=max;return {questionId:q.id,points:earned/100};});
 if(maximum<=0)throw new ExamMarkingError('The examination has no valid maximum mark.');
 const result=await client.query(`INSERT INTO admission_exam_marking(school_id,exam_id,application_id,attempt_id,marks,total_points,maximum_points,feedback,marked_by)
   VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9) ON CONFLICT(school_id,attempt_id) DO UPDATE SET
   marks=EXCLUDED.marks,total_points=EXCLUDED.total_points,maximum_points=EXCLUDED.maximum_points,
   feedback=EXCLUDED.feedback,marked_by=EXCLUDED.marked_by,marked_at=clock_timestamp(),revision=admission_exam_marking.revision+1
   RETURNING id,revision,total_points,maximum_points,percentage`,[scope.schoolId,scope.examId,data.attempt.application_id,scope.attemptId,JSON.stringify(checked),total/100,maximum/100,feedback,userId]);
 return result.rows[0];
}
export async function approveExamMarking(client,scope,revision,userId){
 const row=(await client.query('SELECT * FROM admission_exam_marking WHERE school_id=$1 AND exam_id=$2 AND attempt_id=$3 FOR UPDATE',[scope.schoolId,scope.examId,scope.attemptId])).rows[0];
 if(!row||row.approved_at||row.released_at||row.revision!==revision)throw new ExamMarkingError('Reload the current unapproved marks before approval.');
 if(row.marked_by===userId)throw new ExamMarkingError('A different school leader must approve these marks.',403);
 await client.query('UPDATE admission_exam_marking SET approved_by=$3,approved_at=clock_timestamp() WHERE school_id=$1 AND id=$2',[scope.schoolId,row.id,userId]);
 return {approved:true};
}
export async function createResultRelease(client,scope,email,userId){
 const row=(await client.query('SELECT * FROM admission_exam_marking WHERE school_id=$1 AND exam_id=$2 AND attempt_id=$3 FOR UPDATE',[scope.schoolId,scope.examId,scope.attemptId])).rows[0];
 if(!row?.approved_at)throw new ExamMarkingError('Approve the marks before releasing a result.');
 const guardian=await findVerifiedGuardianEmail(client,{schoolId:scope.schoolId,applicationId:row.application_id,email});
 if(!guardian)throw new ExamMarkingError('Use the applicant’s current verified guardian email.');
 const secret=issueCandidateSecret();
 await client.query('UPDATE admission_exam_result_access SET revoked_at=clock_timestamp() WHERE school_id=$1 AND marking_id=$2 AND revoked_at IS NULL',[scope.schoolId,row.id]);
 const access=await client.query(`INSERT INTO admission_exam_result_access(school_id,exam_id,application_id,marking_id,guardian_verification_id,token_hash,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '7 days') RETURNING id`,[scope.schoolId,scope.examId,row.application_id,row.id,guardian.id,secret.tokenHash]);
 await client.query('UPDATE admission_exam_marking SET released_by=COALESCE(released_by,$3),released_at=COALESCE(released_at,clock_timestamp()) WHERE school_id=$1 AND id=$2',[scope.schoolId,row.id,userId]);
 return {accessId:access.rows[0].id,email:guardian.email,token:secret.token};
}
export async function readReleasedResult(client,{schoolId,token}){
 const hash=hashCandidateSecret(token);if(!hash)return null;
 const result=await client.query(`SELECT e.title,app.application_number,m.total_points,m.maximum_points,m.percentage,m.feedback,m.released_at
   FROM admission_exam_result_access r JOIN admission_exam_marking m ON m.school_id=r.school_id AND m.id=r.marking_id
   JOIN admission_entrance_exams e ON e.school_id=r.school_id AND e.id=r.exam_id
   JOIN admission_applications app ON app.school_id=r.school_id AND app.id=r.application_id
   JOIN admission_guardian_email_verifications v ON v.school_id=r.school_id AND v.application_id=r.application_id AND v.id=r.guardian_verification_id
   JOIN admission_guardians g ON g.school_id=v.school_id AND g.application_id=v.application_id AND g.first_name=v.guardian_first_name
     AND g.last_name=v.guardian_last_name AND g.relationship=v.guardian_relationship AND lower(btrim(g.email))=v.email
   WHERE r.school_id=$1 AND r.token_hash=$2 AND r.expires_at>clock_timestamp() AND r.revoked_at IS NULL
     AND m.approved_at IS NOT NULL AND m.released_at IS NOT NULL AND v.verified_at>=now()-interval '30 days' AND v.revoked_at IS NULL`,[schoolId,hash]);
 return result.rows[0]||null;
}

export function registerExamMarkingRoutes(router,{needsPermission,csrf,close,done,fail,audit,sendExamMessage=sendExamEmail}){
 const gate=async(req,res,next)=>{if(process.env.ENABLE_CANDIDATE_EXAM_PREVIEW!=='true'){await close(req,false);return res.status(503).json({error:'Examination preview is not enabled.'});}next();};
 const scope=req=>({schoolId:req.auth.claims.schoolId,examId:req.params.examId,attemptId:req.params.attemptId});
 const leader=async(req,res,next)=>{if(!req.auth.account.roles.some(r=>['PRINCIPAL','SCHOOL_ADMIN'].includes(r))){await close(req,false);return res.status(403).json({error:'Only a school leader may approve or release results.'});}next();};
 const failure=async(req,res,error)=>{if(error instanceof ExamMarkingError){await close(req,false);return res.status(error.status).json({error:error.message});}return fail(req,res,error);};
 const base='/admissions/entrance-exams/:examId';
 router.get(base+'/marking',needsPermission('admissions.read'),gate,async(req,res)=>{try{
  const rows=await req.auth.client.query(`SELECT a.id,a.application_id,app.application_number,app.first_name,app.last_name,
    m.revision,m.total_points,m.maximum_points,m.percentage,m.marked_by,m.approved_at,m.released_at
    FROM admission_exam_attempts a JOIN admission_applications app ON app.school_id=a.school_id AND app.id=a.application_id
    LEFT JOIN admission_exam_marking m ON m.school_id=a.school_id AND m.attempt_id=a.id
    WHERE a.school_id=$1 AND a.exam_id=$2 AND a.status='SUBMITTED' ORDER BY app.application_number LIMIT 500`,[req.auth.claims.schoolId,req.params.examId]);
  return done(req,res,200,{attempts:rows.rows});
 }catch(e){return failure(req,res,e);}});
 router.get(base+'/attempts/:attemptId/marking',needsPermission('admissions.read'),gate,async(req,res)=>{try{return done(req,res,200,await markingDetail(req.auth.client,scope(req)));}catch(e){return failure(req,res,e);}});
 router.post(base+'/attempts/:attemptId/marking',needsPermission('admissions.write'),csrf,gate,async(req,res)=>{try{
  const marking=await saveExamMarking(req.auth.client,scope(req),req.body||{},req.auth.claims.userId);
  await audit(req,'ENTRANCE_EXAM_MARKED','ADMISSION_EXAM_ATTEMPT',req.params.attemptId,{revision:marking.revision});return done(req,res,200,{marking});
 }catch(e){return failure(req,res,e);}});
 router.post(base+'/attempts/:attemptId/approve-marks',needsPermission('admissions.write'),csrf,gate,leader,async(req,res)=>{try{
  const result=await approveExamMarking(req.auth.client,scope(req),req.body?.revision,req.auth.claims.userId);
  await audit(req,'ENTRANCE_EXAM_MARKS_APPROVED','ADMISSION_EXAM_ATTEMPT',req.params.attemptId,{});return done(req,res,200,result);
 }catch(e){return failure(req,res,e);}});
 router.post(base+'/attempts/:attemptId/release-result',needsPermission('admissions.write'),csrf,gate,leader,async(req,res)=>{try{
  const released=await createResultRelease(req.auth.client,scope(req),req.body?.guardianEmail,req.auth.claims.userId);
  await sendExamMessage({email:released.email,token:released.token,kind:'result',reference:req.params.examId,publicUrl:process.env.APP_PUBLIC_URL,
    apiKey:process.env.RESEND_API_KEY,from:process.env.RESEND_FROM_EMAIL,staging:process.env.EMAIL_MODE!=='production',idempotencyKey:'exam-result-'+released.accessId});
  await audit(req,'ENTRANCE_EXAM_RESULT_RELEASED','ADMISSION_EXAM_ATTEMPT',req.params.attemptId,{accessId:released.accessId});return done(req,res,200,{released:true});
 }catch(e){return failure(req,res,e);}});
}
