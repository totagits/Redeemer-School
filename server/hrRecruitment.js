const HR_ROLES = ['HR_MANAGER','SCHOOL_ADMIN'];
const LEADERS = ['PRINCIPAL','SCHOOL_ADMIN'];
export const ONBOARDING_CHECKS = ['identityVerified','referencesChecked','contractSigned','safeguardingComplete','orientationComplete'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class HiringError extends Error {
  constructor(message,status=400){super(message);this.status=status;}
}
function field(value,label,max=2000) {
  if(typeof value!=='string'||!value.trim()||value.trim().length>max) throw new HiringError(`Enter ${label} within ${max} characters.`);
  return value.trim();
}
function date(value,label) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value) throw new HiringError('Enter a valid '+label+'.');
  return value;
}
function uuid(value) {
  if(!UUID.test(value||''))throw new HiringError('Select a valid recruitment record.');
  return value;
}
export function registerHrRecruitmentRoutes(router,{csrf,close,done,fail,audit}) {
  const allowed = roles => req => req.auth.account.roles.some(role=>roles.includes(role));
  const isHr=allowed(HR_ROLES),isLeader=allowed(LEADERS);
  const guard = mode => async(req,res,next)=>{
    const account=req.auth.account;
    const permitted=mode==='leader'?isLeader(req):mode==='write'?isHr(req)&&account.permissions.includes('staff.write'):
      isLeader(req)||(isHr(req)&&account.permissions.includes('staff.read'));
    if(!permitted){await close(req,false);return res.status(403).json({error:'This recruitment action requires the assigned HR or school leadership responsibility.'});}
    next();
  };
  const handle = action => async(req,res)=>{
    try {
      const ready=await req.auth.client.query("SELECT to_regclass('public.hr_vacancies') IS NOT NULL AS ready");
      if(!ready.rows[0]?.ready){await close(req,false);return res.status(503).json({error:'Recruitment is awaiting the reviewed staging database update. The existing staff directory remains available.',migrationRequired:'114_hr_recruitment.sql'});}
      return await action(req,res);
    } catch(error) {
      if(error instanceof HiringError){await close(req,false);return res.status(error.status).json({error:error.message});}
      return fail(req,res,error);
    }
  };
  const event = async(req,vacancy,application,action,note='')=>{
    await req.auth.client.query('INSERT INTO hr_recruitment_events(school_id,vacancy_id,application_id,actor_user_id,action,note) VALUES($1,$2,$3,$4,$5,$6)',
      [req.auth.claims.schoolId,vacancy,application,req.auth.claims.userId,action,note]);
    await audit(req,action,application?'HR_APPLICATION':'HR_VACANCY',application||vacancy);
  };
  async function vacancy(req,id) {
    const row=(await req.auth.client.query('SELECT * FROM hr_vacancies WHERE school_id=$1 AND id=$2 FOR UPDATE',[req.auth.claims.schoolId,uuid(id)])).rows[0];
    if(!row)throw new HiringError('Vacancy not found in this school.',404);
    return row;
  }
  async function application(req,id) {
    const found=(await req.auth.client.query('SELECT vacancy_id FROM hr_applications WHERE school_id=$1 AND id=$2',[req.auth.claims.schoolId,uuid(id)])).rows[0];
    if(!found)throw new HiringError('Application not found in this school.',404);
    const job=await vacancy(req,found.vacancy_id);
    const row=(await req.auth.client.query('SELECT * FROM hr_applications WHERE school_id=$1 AND id=$2 FOR UPDATE',[req.auth.claims.schoolId,id])).rows[0];
    return {row,job};
  }
  function revision(req,row) {
    if(!Number.isInteger(req.body?.revision)||req.body.revision!==row.revision)throw new HiringError('This record changed. Refresh it before saving another action.',409);
  }
  router.get('/hr/recruitment',guard('read'),handle(async(req,res)=>{
    const school=req.auth.claims.schoolId;
    const jobs=await req.auth.client.query('SELECT * FROM hr_vacancies WHERE school_id=$1 ORDER BY created_at DESC,id LIMIT 200',[school]);
    return done(req,res,200,{vacancies:jobs.rows,canManage:isHr(req)&&req.auth.account.permissions.includes('staff.write'),canApprove:isLeader(req)});
  }));
  router.get('/hr/recruitment/:id',guard('read'),handle(async(req,res)=>{
    const job=await vacancy(req,req.params.id),school=req.auth.claims.schoolId;
    const applicants=await req.auth.client.query('SELECT * FROM hr_applications WHERE school_id=$1 AND vacancy_id=$2 ORDER BY created_at,id',[school,job.id]);
    const interviews=await req.auth.client.query('SELECT i.* FROM hr_interviews i JOIN hr_applications a ON a.school_id=i.school_id AND a.id=i.application_id WHERE a.school_id=$1 AND a.vacancy_id=$2 ORDER BY i.scheduled_at,i.id',[school,job.id]);
    const events=await req.auth.client.query('SELECT e.*,u.full_name AS actor_name FROM hr_recruitment_events e JOIN user_accounts u ON u.school_id=e.school_id AND u.id=e.actor_user_id WHERE e.school_id=$1 AND e.vacancy_id=$2 ORDER BY e.created_at DESC,e.id DESC LIMIT 500',[school,job.id]);
    return done(req,res,200,{vacancy:job,applications:applicants.rows,interviews:interviews.rows,events:events.rows});
  }));
  router.post('/hr/recruitment',guard('write'),csrf,handle(async(req,res)=>{
    const b=req.body||{},code=field(b.code,'a vacancy code',40).toUpperCase();
    if(!/^[A-Z0-9_-]{2,40}$/.test(code)||!Number.isInteger(b.positions)||b.positions<1||b.positions>100)throw new HiringError('Use a vacancy code of letters, numbers, hyphens or underscores and 1–100 positions.');
    const closing=date(b.closingOn,'closing date');
    if(closing<new Date().toISOString().slice(0,10))throw new HiringError('The closing date cannot be in the past.');
    const job=(await req.auth.client.query(`INSERT INTO hr_vacancies(school_id,code,title,department,description,requirements,positions,closing_on,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.auth.claims.schoolId,code,field(b.title,'the job title',120),field(b.department,'the department',120),field(b.description,'the job description',5000),field(b.requirements,'the requirements',5000),b.positions,closing,req.auth.claims.userId])).rows[0];
    await event(req,job.id,null,'HR_VACANCY_CREATED');
    return done(req,res,201,{vacancy:job});
  }));
  router.post('/hr/recruitment/:id/status',guard('read'),csrf,handle(async(req,res)=>{
    const job=await vacancy(req,req.params.id);revision(req,job);
    const next=req.body.status;
    if(next==='APPROVED'){
      if(!isLeader(req))throw new HiringError('A Principal or School Administrator must approve the vacancy.',403);
      if(job.created_by===req.auth.claims.userId)throw new HiringError('Another authorized school leader must approve this vacancy.',403);
      if(job.status!=='DRAFT')throw new HiringError('Only a draft vacancy can be approved.',409);
    }else{
      if(!isHr(req)||!req.auth.account.permissions.includes('staff.write'))throw new HiringError('HR responsibility is required.',403);
      if(!((next==='OPEN'&&job.status==='APPROVED')||(next==='CLOSED'&&['DRAFT','APPROVED','OPEN'].includes(job.status))))throw new HiringError('Choose a valid vacancy transition.',409);
      const closeDay=job.closing_on instanceof Date?job.closing_on.toISOString().slice(0,10):String(job.closing_on).slice(0,10);
      if(next==='OPEN'&&closeDay<new Date().toISOString().slice(0,10))throw new HiringError('Create a new vacancy with a current closing date before opening.');
    }
    const updated=(await req.auth.client.query(`UPDATE hr_vacancies SET status=$3,revision=revision+1,
      approved_by=CASE WHEN $3='APPROVED' THEN $4::uuid ELSE approved_by END,
      approved_at=CASE WHEN $3='APPROVED' THEN now() ELSE approved_at END WHERE school_id=$1 AND id=$2 RETURNING *`,
      [req.auth.claims.schoolId,job.id,next,req.auth.claims.userId])).rows[0];
    await event(req,job.id,null,'HR_VACANCY_'+next);
    return done(req,res,200,{vacancy:updated});
  }));
  router.post('/hr/recruitment/:id/applications',guard('write'),csrf,handle(async(req,res)=>{
    const job=await vacancy(req,req.params.id),b=req.body;
    const closeDay=job.closing_on instanceof Date?job.closing_on.toISOString().slice(0,10):String(job.closing_on).slice(0,10);
    if(job.status!=='OPEN'||closeDay<new Date().toISOString().slice(0,10))throw new HiringError('This vacancy is not accepting applications.',409);
    const email=field(b.email,'a valid email',254).toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(email))throw new HiringError('Enter a valid applicant email.');
    const applicant=(await req.auth.client.query(`INSERT INTO hr_applications(school_id,vacancy_id,first_name,last_name,email,phone,qualifications,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[req.auth.claims.schoolId,job.id,field(b.firstName,'the first name',120),field(b.lastName,'the last name',120),email,
      typeof b.phone==='string'?b.phone.trim().slice(0,40):'',field(b.qualifications,'a qualifications summary',3000),req.auth.claims.userId])).rows[0];
    await event(req,job.id,applicant.id,'HR_APPLICATION_RECEIVED');
    return done(req,res,201,{application:applicant});
  }));
  router.post('/hr/applications/:id/action',guard('read'),csrf,handle(async(req,res)=>{
    const {row,job}=await application(req,req.params.id);revision(req,row);
    const action=req.body.action,user=req.auth.claims.userId;
    const note=field(req.body.note,'an action note',2000);
    const transitions={SHORTLIST:{from:['APPLIED'],to:'SHORTLISTED'},RECOMMEND:{from:['INTERVIEWED'],to:'RECOMMENDED'},
      APPROVE:{from:['RECOMMENDED'],to:'APPROVED'},DECLINE:{from:['APPLIED','SHORTLISTED','INTERVIEWED','RECOMMENDED'],to:'DECLINED'},
      OFFER:{from:['APPROVED'],to:'OFFERED'},ACCEPT:{from:['OFFERED'],to:'ACCEPTED'},WITHDRAW:{from:['APPLIED','SHORTLISTED','INTERVIEW_SCHEDULED','INTERVIEWED','RECOMMENDED','APPROVED','OFFERED','ACCEPTED'],to:'WITHDRAWN'}};
    const change=transitions[action];
    if(!change||!change.from.includes(row.status))throw new HiringError('That action is not available at the current hiring stage.',409);
    const decision=['APPROVE','DECLINE'].includes(action);
    if(decision&&!isLeader(req))throw new HiringError('A Principal or School Administrator must authorize the decision.',403);
    if(!decision&&(!isHr(req)||!req.auth.account.permissions.includes('staff.write')))throw new HiringError('HR responsibility is required.',403);
    if(action==='APPROVE'&&row.recommended_by===user)throw new HiringError('The hiring recommendation needs another authorized approver.',403);
    if(action==='RECOMMEND'){
      const interview=await req.auth.client.query("SELECT 1 FROM hr_interviews WHERE school_id=$1 AND application_id=$2 AND status='COMPLETED'",[req.auth.claims.schoolId,row.id]);
      if(!interview.rowCount)throw new HiringError('Complete and record an interview before recommending a hire.',409);
    }
    const offer=action==='OFFER'?field(req.body.offerReference,'the approved offer reference',200):null;
    await req.auth.client.query(`UPDATE hr_applications SET status=$3,revision=revision+1,
      recommended_by=CASE WHEN $4='RECOMMEND' THEN $5::uuid ELSE recommended_by END,
      approved_by=CASE WHEN $4='APPROVE' THEN $5::uuid ELSE approved_by END,
      approved_at=CASE WHEN $4='APPROVE' THEN now() ELSE approved_at END,
      offer_reference=COALESCE($6,offer_reference) WHERE school_id=$1 AND id=$2`,
      [req.auth.claims.schoolId,row.id,change.to,action,user,offer]);
    await event(req,job.id,row.id,'HR_'+action,note);
    return done(req,res,200,{status:change.to});
  }));
  router.post('/hr/applications/:id/interviews',guard('write'),csrf,handle(async(req,res)=>{
    const {row,job}=await application(req,req.params.id);revision(req,row);
    if(!['SHORTLISTED','INTERVIEWED'].includes(row.status))throw new HiringError('Shortlist the applicant before scheduling an interview.',409);
    const at=Date.parse(req.body.scheduledAt);
    if(!Number.isFinite(at)||at<=Date.now())throw new HiringError('Select a future interview date and time.');
    const interview=(await req.auth.client.query(`INSERT INTO hr_interviews(school_id,application_id,scheduled_at,interviewer,venue,recorded_by)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[req.auth.claims.schoolId,row.id,new Date(at).toISOString(),field(req.body.interviewer,'the interviewer',120),field(req.body.venue,'the venue or meeting reference',200),req.auth.claims.userId])).rows[0];
    await req.auth.client.query("UPDATE hr_applications SET status='INTERVIEW_SCHEDULED',revision=revision+1 WHERE school_id=$1 AND id=$2",[req.auth.claims.schoolId,row.id]);
    await event(req,job.id,row.id,'HR_INTERVIEW_SCHEDULED');
    return done(req,res,201,{interview});
  }));
  router.post('/hr/applications/:id/interviews/:interviewId/complete',guard('write'),csrf,handle(async(req,res)=>{
    const {row,job}=await application(req,req.params.id);revision(req,row);
    if(row.status!=='INTERVIEW_SCHEDULED')throw new HiringError('This application has no interview awaiting feedback.',409);
    const feedback=field(req.body.feedback,'interview feedback',3000);
    if(feedback.length<10)throw new HiringError('Record at least ten characters of interview feedback.');
    const result=await req.auth.client.query(`UPDATE hr_interviews SET status='COMPLETED',feedback=$4,completed_at=now()
      WHERE school_id=$1 AND application_id=$2 AND id=$3 AND status='SCHEDULED' AND scheduled_at<=now() RETURNING id`,
      [req.auth.claims.schoolId,row.id,uuid(req.params.interviewId),feedback]);
    if(!result.rowCount)throw new HiringError('The interview must have taken place before feedback can be completed.',409);
    await req.auth.client.query("UPDATE hr_applications SET status='INTERVIEWED',revision=revision+1 WHERE school_id=$1 AND id=$2",[req.auth.claims.schoolId,row.id]);
    await event(req,job.id,row.id,'HR_INTERVIEW_COMPLETED');
    return done(req,res,200,{status:'INTERVIEWED'});
  }));
  router.post('/hr/applications/:id/onboard',guard('write'),csrf,handle(async(req,res)=>{
    const {row,job}=await application(req,req.params.id),b=req.body,school=req.auth.claims.schoolId;
    const employee=field(b.employeeNumber,'the employee number',40).toUpperCase(),starts=date(b.startsOn,'employment start date');
    if(row.status==='ONBOARDED'){
      const stored=row.starts_on instanceof Date?row.starts_on.toISOString().slice(0,10):String(row.starts_on).slice(0,10);
      if(row.employee_number!==employee||stored!==starts)throw new HiringError('This applicant was already onboarded with different details.',409);
      return done(req,res,200,{staffRecordId:row.staff_record_id,alreadyOnboarded:true});
    }
    revision(req,row);
    if(row.status!=='ACCEPTED'||!row.approved_by||!row.offer_reference)throw new HiringError('Hiring approval, a recorded offer and acceptance are required before onboarding.',409);
    if(!ONBOARDING_CHECKS.every(key=>b.checks?.[key]===true))throw new HiringError('Complete identity, references, signed contract, safeguarding and orientation checks before onboarding.');
    const filled=await req.auth.client.query('SELECT count(*)::int AS count FROM hr_applications WHERE school_id=$1 AND vacancy_id=$2 AND staff_record_id IS NOT NULL',[school,job.id]);
    if(filled.rows[0].count>=job.positions)throw new HiringError('All approved positions for this vacancy have been filled.',409);
    await req.auth.client.query('SELECT pg_advisory_xact_lock(7177,hashtext($1))',[school+':'+row.email]);
    const duplicate=await req.auth.client.query('SELECT id FROM staff_records WHERE school_id=$1 AND (employee_number=$2 OR lower(email)=$3)',[school,employee,row.email]);
    if(duplicate.rowCount)throw new HiringError('A matching employee number or email already exists. Review the existing staff record before onboarding.',409);
    const staff=(await req.auth.client.query(`INSERT INTO staff_records(school_id,employee_number,first_name,last_name,email,phone,job_title,department,hired_on)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[school,employee,row.first_name,row.last_name,row.email,row.phone,job.title,job.department,starts])).rows[0];
    await req.auth.client.query(`UPDATE hr_applications SET status='ONBOARDED',revision=revision+1,employee_number=$3,starts_on=$4,
      onboarding_checks=$5::jsonb,staff_record_id=$6 WHERE school_id=$1 AND id=$2`,
      [school,row.id,employee,starts,JSON.stringify(Object.fromEntries(ONBOARDING_CHECKS.map(key=>[key,true]))),staff.id]);
    await event(req,job.id,row.id,'HR_EMPLOYEE_ONBOARDED',field(b.note,'the onboarding completion note',2000));
    return done(req,res,201,{staffRecordId:staff.id});
  }));
}
