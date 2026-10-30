const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export class ExamSittingError extends Error { constructor(message,status=409){super(message);this.status=status;} }

async function examWindow(client,{schoolId,examId}) {
 const result=await client.query(`SELECT id FROM admission_entrance_exams WHERE school_id=$1 AND id=$2
   AND status='SCHEDULED' AND mode='ONLINE' AND starts_at<=clock_timestamp() AND ends_at>clock_timestamp() FOR SHARE`,[schoolId,examId]);
 if(!result.rowCount)throw new ExamSittingError('The examination is outside its scheduled window.');
}
async function attempt(client,scope,{lock=false}={}){
 const result=await client.query(`SELECT id,status,submitted_at,client_submission_id,question_set_id FROM admission_exam_attempts
   WHERE school_id=$1 AND exam_id=$2 AND application_id=$3 ${lock?'FOR UPDATE':''}`,[scope.schoolId,scope.examId,scope.applicationId]);
 return result.rows[0]||null;
}
export async function readCandidateAttempt(client,scope){
 await examWindow(client,scope);
 const row=await attempt(client,scope);if(!row)return {attempt:null};
 if(row.status==='VOID')throw new ExamSittingError('This examination attempt is unavailable.');
 if(row.status==='SUBMITTED')return {attempt:{id:row.id,status:row.status,submitted_at:row.submitted_at},questions:[],answers:[]};
 // Never select the snapshot answer_keys column or the source question answer_key.
 const set=await client.query('SELECT questions FROM admission_exam_question_sets WHERE school_id=$1 AND exam_id=$2 AND id=$3',[scope.schoolId,scope.examId,row.question_set_id]);
 if(!set.rowCount)throw new ExamSittingError('Approved examination questions are unavailable.');
 const answers=await client.query('SELECT question_id,answer,saved_at FROM admission_exam_answers WHERE school_id=$1 AND exam_id=$2 AND attempt_id=$3',[scope.schoolId,scope.examId,row.id]);
 return {attempt:{id:row.id,status:row.status},questions:set.rows[0].questions.map(({id,prompt,question_type,options,points,sort_order})=>({id,prompt,question_type,options,points,sort_order})),answers:answers.rows};
}
export async function startCandidateAttempt(client,scope){
 await examWindow(client,scope);
 const set=await client.query('SELECT id FROM admission_exam_question_sets WHERE school_id=$1 AND exam_id=$2',[scope.schoolId,scope.examId]);
 if(!set.rowCount)throw new ExamSittingError('The school has not approved questions for this examination.');
 await client.query(`INSERT INTO admission_exam_attempts(school_id,exam_id,application_id,question_set_id)
   VALUES($1,$2,$3,$4) ON CONFLICT(school_id,exam_id,application_id) DO NOTHING`,[scope.schoolId,scope.examId,scope.applicationId,set.rows[0].id]);
 return readCandidateAttempt(client,scope);
}
export async function saveCandidateAnswer(client,scope,{questionId,answer}){
 if(!uuid.test(questionId))throw new ExamSittingError('Choose a valid question.',400);
 const row=await attempt(client,scope,{lock:true});
 if(!row||row.status!=='IN_PROGRESS')throw new ExamSittingError('Start an active examination before saving answers.');
 // Recheck the database clock after waiting for a concurrent submission/answer lock.
 await examWindow(client,scope);
 const result=await client.query('SELECT questions FROM admission_exam_question_sets WHERE school_id=$1 AND exam_id=$2 AND id=$3',[scope.schoolId,scope.examId,row.question_set_id]);
 const question=result.rows[0]?.questions.find(q=>q.id===questionId);
 if(!question)throw new ExamSittingError('This question does not belong to your examination.',400);
 const valid=question.question_type==='SINGLE_CHOICE'?Number.isInteger(answer)&&answer>=0&&answer<question.options.length:typeof answer==='string'&&answer.length<=4000;
 if(!valid)throw new ExamSittingError('Enter a valid answer for this question.',400);
 const saved=await client.query(`INSERT INTO admission_exam_answers(school_id,exam_id,attempt_id,question_id,answer)
   SELECT $1,$2,$3,$4,$5::jsonb FROM admission_entrance_exams e WHERE e.school_id=$1 AND e.id=$2 AND e.ends_at>clock_timestamp()
   ON CONFLICT(school_id,attempt_id,question_id) DO UPDATE SET answer=EXCLUDED.answer,saved_at=clock_timestamp()
   RETURNING question_id,saved_at`,[scope.schoolId,scope.examId,row.id,questionId,JSON.stringify(answer)]);
 if(!saved.rowCount)throw new ExamSittingError('The examination has ended.');
 return {saved:saved.rows[0]};
}
export async function submitCandidateAttempt(client,scope,{submissionId}){
 if(!uuid.test(submissionId))throw new ExamSittingError('A valid submission reference is required.',400);
 const row=await attempt(client,scope,{lock:true});
 if(row?.status==='SUBMITTED'&&row.client_submission_id===submissionId)return {submitted:true,submittedAt:row.submitted_at};
 if(!row||row.status!=='IN_PROGRESS')throw new ExamSittingError('This examination attempt is not open for submission.');
 await examWindow(client,scope);
 const result=await client.query(`UPDATE admission_exam_attempts a SET status='SUBMITTED',submitted_at=clock_timestamp(),client_submission_id=$4
   FROM admission_entrance_exams e WHERE a.school_id=$1 AND a.exam_id=$2 AND a.application_id=$3
     AND e.school_id=a.school_id AND e.id=a.exam_id AND e.ends_at>clock_timestamp() RETURNING a.submitted_at`,[scope.schoolId,scope.examId,scope.applicationId,submissionId]);
 if(!result.rowCount)throw new ExamSittingError('The examination has ended.');
 return {submitted:true,submittedAt:result.rows[0].submitted_at};
}
