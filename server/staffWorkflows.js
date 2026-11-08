const leaders=['PRINCIPAL','SCHOOL_ADMIN'];
const hrRoles=['HR_MANAGER','SCHOOL_ADMIN'];
const financeRoles=['FINANCE','SCHOOL_ADMIN'];
class WorkflowError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const field=(v,label,max=2000)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw new WorkflowError(`Enter ${label} within ${max} characters.`);return v.trim();};
const day=(v)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw new WorkflowError('Enter a valid date.');return v;};
const id=(v)=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v||''))throw new WorkflowError('Select a valid record.');return v;};
const dateString=v=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
export function moneyCents(v){if(typeof v!=='string'||!/^\d{1,10}(\.\d{1,2})?$/.test(v))throw new WorkflowError('Enter a non-negative amount with at most two decimal places.');const [whole,fraction='']=v.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));}
const amount=c=>(c/100).toFixed(2);
export function registerStaffWorkflowRoutes(router,{csrf,close,done,fail,audit}){
 const has=(req,roles)=>req.auth.account.roles.some(r=>roles.includes(r));
 const leader=req=>has(req,leaders),hr=req=>has(req,hrRoles)&&req.auth.account.permissions.includes('staff.write');
 const finance=req=>has(req,financeRoles)&&req.auth.account.permissions.includes('finance.write');
 const staff=req=>!has(req,['STUDENT','PARENT'])&&req.auth.account.roles.length>0;
 const handle=(guard,fn)=>async(req,res)=>{try{
  if(!guard(req))throw new WorkflowError('Your assigned role cannot access this staff workflow.',403);
  const ready=await req.auth.client.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='staff_leave_requests' AND column_name='revision' AND table_schema='public') AS ready");
  if(!ready.rows[0]?.ready)throw new WorkflowError('Leave and payroll are awaiting the reviewed database update. Existing workspaces remain available.',503);
  return await fn(req,res);
 }catch(e){if(e instanceof WorkflowError){await close(req,false);return res.status(e.status).json({error:e.message});}return fail(req,res,e);}};
 const q=(req,sql,args=[])=>req.auth.client.query(sql,args);
 const self=async req=>(await q(req,"SELECT id FROM staff_records WHERE school_id=$1 AND user_id=$2 AND employment_status IN ('ACTIVE','ON_LEAVE')",[req.auth.claims.schoolId,req.auth.claims.userId])).rows[0];
 const rev=(req,row)=>{if(!Number.isInteger(req.body?.revision)||req.body.revision!==row.revision)throw new WorkflowError('This record changed. Refresh before saving another action.',409);};
 const event=async(req,leave,pay,action,note)=>{await q(req,'INSERT INTO staff_workflow_events(school_id,leave_request_id,payroll_run_id,actor_user_id,action,note) VALUES($1,$2,$3,$4,$5,$6)',[req.auth.claims.schoolId,leave,pay,req.auth.claims.userId,action,note]);await audit(req,action,leave?'STAFF_LEAVE':'PAYROLL_RUN',leave||pay);};
 const history=(req,column,value)=>q(req,`SELECT e.action,e.note,e.created_at,u.full_name AS actor_name FROM staff_workflow_events e JOIN user_accounts u ON u.school_id=e.school_id AND u.id=e.actor_user_id WHERE e.school_id=$1 AND e.${column}=$2 ORDER BY e.created_at,e.id`,[req.auth.claims.schoolId,value]);
 router.get('/staff/leave',handle(staff,async(req,res)=>{
  const own=await self(req),all=hr(req)||leader(req);
  const rows=await q(req,`SELECT l.*,s.employee_number,s.first_name,s.last_name,s.user_id AS employee_user_id FROM staff_leave_requests l JOIN staff_records s ON s.school_id=l.school_id AND s.id=l.staff_record_id WHERE l.school_id=$1 AND ($2::boolean OR s.user_id=$3) ORDER BY l.requested_at DESC,l.id LIMIT 200`,[req.auth.claims.schoolId,all,req.auth.claims.userId]);
  return done(req,res,200,{requests:rows.rows,staffId:own?.id||null,canReview:hr(req),canApprove:leader(req),userId:req.auth.claims.userId});
 }));
 router.post('/staff/leave',csrf,handle(staff,async(req,res)=>{
  const own=await self(req);if(!own)throw new WorkflowError('Your account must be linked to an active employee record.',403);
  // Serializes overlapping requests for this employee, including concurrent submissions.
  await q(req,'SELECT id FROM staff_records WHERE school_id=$1 AND id=$2 FOR UPDATE',[req.auth.claims.schoolId,own.id]);
  const b=req.body,start=day(b.startsOn),end=day(b.endsOn);if(end<start)throw new WorkflowError('The end date must follow the start date.');
  const overlap=await q(req,"SELECT 1 FROM staff_leave_requests WHERE school_id=$1 AND staff_record_id=$2 AND status IN ('REQUESTED','REVIEWED','APPROVED') AND starts_on<=$4 AND ends_on>=$3",[req.auth.claims.schoolId,own.id,start,end]);
  if(overlap.rowCount)throw new WorkflowError('An active leave request already overlaps these dates.',409);
  const reason=typeof b.reason==='string'?b.reason.trim():'';if(reason.length>2000)throw new WorkflowError('Keep the reason within 2000 characters.');
  const row=(await q(req,'INSERT INTO staff_leave_requests(school_id,staff_record_id,leave_type,starts_on,ends_on,reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.auth.claims.schoolId,own.id,field(b.leaveType,'the leave type',80),start,end,reason])).rows[0];
  await event(req,row.id,null,'LEAVE_REQUESTED','Employee requested leave.');return done(req,res,201,{request:row});
 }));
 router.get('/staff/leave/:id/history',handle(staff,async(req,res)=>{
  const row=(await q(req,'SELECT l.id,s.user_id FROM staff_leave_requests l JOIN staff_records s ON s.school_id=l.school_id AND s.id=l.staff_record_id WHERE l.school_id=$1 AND l.id=$2',[req.auth.claims.schoolId,id(req.params.id)])).rows[0];
  if(!row||(!hr(req)&&!leader(req)&&row.user_id!==req.auth.claims.userId))throw new WorkflowError('Leave request not found.',404);
  return done(req,res,200,{events:(await history(req,'leave_request_id',row.id)).rows});
 }));
 router.post('/staff/leave/:id/action',csrf,handle(staff,async(req,res)=>{
  const row=(await q(req,'SELECT l.*,s.user_id AS employee_user_id FROM staff_leave_requests l JOIN staff_records s ON s.school_id=l.school_id AND s.id=l.staff_record_id WHERE l.school_id=$1 AND l.id=$2 FOR UPDATE OF l',[req.auth.claims.schoolId,id(req.params.id)])).rows[0];
  if(!row||(!hr(req)&&!leader(req)&&row.employee_user_id!==req.auth.claims.userId))throw new WorkflowError('Leave request not found.',404);
  rev(req,row);const user=req.auth.claims.userId,action=req.body.action,note=field(req.body.note,'a review or cancellation note');let next;
  if(action==='CANCEL'){
   if(row.employee_user_id===user&&['REQUESTED','REVIEWED'].includes(row.status))next='CANCELLED';
   else if(leader(req)&&row.employee_user_id!==user&&row.status==='APPROVED')next='CANCELLED';
   else throw new WorkflowError('Only a pending request can be cancelled by its employee. Approved leave needs an independent leader to cancel it.',409);
  }else if(action==='REVIEW'){
   if(!hr(req)||row.employee_user_id===user)throw new WorkflowError('Another HR reviewer must review this request.',403);
   if(row.status!=='REQUESTED')throw new WorkflowError('Only requested leave can be reviewed.',409);next='REVIEWED';
  }else if(['APPROVE','REJECT'].includes(action)){
   if(!leader(req)||row.employee_user_id===user||row.hr_reviewed_by===user)throw new WorkflowError('An independent Principal or School Administrator must decide this request.',403);
   if(row.status!=='REVIEWED')throw new WorkflowError('HR must review this request before the decision.',409);next=action==='APPROVE'?'APPROVED':'REJECTED';
  }else throw new WorkflowError('Choose a valid leave action.');
  await q(req,`UPDATE staff_leave_requests SET status=$3,revision=revision+1,hr_reviewed_by=CASE WHEN $4='REVIEW' THEN $5::uuid ELSE hr_reviewed_by END,hr_reviewed_at=CASE WHEN $4='REVIEW' THEN now() ELSE hr_reviewed_at END,hr_review_note=CASE WHEN $4='REVIEW' THEN $6 ELSE hr_review_note END,reviewed_by=CASE WHEN $4 IN ('APPROVE','REJECT','CANCEL') THEN $5::uuid ELSE reviewed_by END,reviewed_at=CASE WHEN $4 IN ('APPROVE','REJECT','CANCEL') THEN now() ELSE reviewed_at END,review_reason=CASE WHEN $4 IN ('APPROVE','REJECT','CANCEL') THEN $6 ELSE review_reason END WHERE school_id=$1 AND id=$2`,[req.auth.claims.schoolId,row.id,next,action,user,note]);
  await event(req,row.id,null,'LEAVE_'+action,note);return done(req,res,200,{status:next});
 }));
 const payAccess=req=>finance(req)||leader(req);
 const payRun=async(req,value)=>{const row=(await q(req,'SELECT * FROM payroll_runs WHERE school_id=$1 AND id=$2 FOR UPDATE',[req.auth.claims.schoolId,id(value)])).rows[0];if(!row)throw new WorkflowError('Payroll run not found.',404);return row;};
 router.get('/staff/payroll',handle(payAccess,async(req,res)=>{
  const runs=await q(req,'SELECT * FROM payroll_runs WHERE school_id=$1 ORDER BY created_at DESC,id LIMIT 100',[req.auth.claims.schoolId]);
  const employees=await q(req,"SELECT id,employee_number,first_name,last_name FROM staff_records WHERE school_id=$1 AND employment_status IN ('ACTIVE','ON_LEAVE') ORDER BY last_name,first_name",[req.auth.claims.schoolId]);
  return done(req,res,200,{runs:runs.rows,employees:employees.rows,canPrepare:finance(req),canApprove:leader(req),userId:req.auth.claims.userId});
 }));
 router.get('/staff/payroll/:id',handle(payAccess,async(req,res)=>{
  const run=await payRun(req,req.params.id),lines=await q(req,'SELECT l.*,s.employee_number,s.first_name,s.last_name FROM payroll_run_lines l JOIN staff_records s ON s.school_id=l.school_id AND s.id=l.staff_record_id WHERE l.school_id=$1 AND l.payroll_run_id=$2 ORDER BY s.employee_number',[req.auth.claims.schoolId,run.id]);
  return done(req,res,200,{run,lines:lines.rows,events:(await history(req,'payroll_run_id',run.id)).rows});
 }));
 router.post('/staff/payroll',csrf,handle(finance,async(req,res)=>{
  const b=req.body,start=day(b.periodStart),end=day(b.periodEnd);if(end<start)throw new WorkflowError('The payroll period end must follow its start.');if(!['USD','LRD'].includes(b.currency))throw new WorkflowError('Choose USD or LRD.');
  const run=(await q(req,'INSERT INTO payroll_runs(school_id,period_start,period_end,ruleset_ref,created_by,currency) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.auth.claims.schoolId,start,end,field(b.rulesetRef,'the approved manual payroll schedule reference',200),req.auth.claims.userId,b.currency])).rows[0];
  await event(req,null,run.id,'PAYROLL_CREATED','Manual payroll draft created.');return done(req,res,201,{run});
 }));
 router.post('/staff/payroll/:id/lines',csrf,handle(finance,async(req,res)=>{
  const run=await payRun(req,req.params.id);rev(req,run);if(run.status!=='DRAFT'||run.created_by!==req.auth.claims.userId)throw new WorkflowError('Only the preparer can edit a draft payroll.',403);
  const b=req.body,gross=moneyCents(b.gross),addition=moneyCents(b.addition),deduction=moneyCents(b.deduction),net=gross+addition-deduction;
  if(net<0||net>999999999999)throw new WorkflowError('The net amount must be non-negative and within the supported limit.');
  const employee=await q(req,"SELECT id FROM staff_records WHERE school_id=$1 AND id=$2 AND employment_status IN ('ACTIVE','ON_LEAVE')",[req.auth.claims.schoolId,id(b.staffId)]);if(!employee.rowCount)throw new WorkflowError('Select an active employee in this school.',404);
  const notes=field(b.notes,'the reviewed amount and deduction explanation');
  await q(req,`INSERT INTO payroll_run_lines(school_id,payroll_run_id,staff_record_id,currency,gross_amount,additions,deductions,net_amount,calculation_notes) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9) ON CONFLICT(school_id,payroll_run_id,staff_record_id) DO UPDATE SET currency=EXCLUDED.currency,gross_amount=EXCLUDED.gross_amount,additions=EXCLUDED.additions,deductions=EXCLUDED.deductions,net_amount=EXCLUDED.net_amount,calculation_notes=EXCLUDED.calculation_notes`,[req.auth.claims.schoolId,run.id,b.staffId,run.currency,amount(gross),JSON.stringify([{label:'Manual additions',amount:amount(addition)}]),JSON.stringify([{label:'Manual deductions',amount:amount(deduction)}]),amount(net),notes]);
  await q(req,'UPDATE payroll_runs SET revision=revision+1 WHERE school_id=$1 AND id=$2',[req.auth.claims.schoolId,run.id]);await event(req,null,run.id,'PAYROLL_LINE_SAVED','Employee amounts updated in draft.');return done(req,res,200,{net:amount(net)});
 }));
 router.post('/staff/payroll/:id/action',csrf,handle(payAccess,async(req,res)=>{
  // School-wide lock serializes overlapping payroll approvals across different runs.
  await q(req,'SELECT pg_advisory_xact_lock(7178,hashtext($1))',[req.auth.claims.schoolId]);
  const run=await payRun(req,req.params.id);rev(req,run);const b=req.body,user=req.auth.claims.userId,note=field(b.note,'the action evidence reference');let next;
  const lines=(await q(req,'SELECT staff_record_id,currency FROM payroll_run_lines WHERE school_id=$1 AND payroll_run_id=$2',[req.auth.claims.schoolId,run.id])).rows;
  if(b.action==='SUBMIT'){
   if(!finance(req)||run.created_by!==user||run.status!=='DRAFT')throw new WorkflowError('Only the preparer can submit a draft payroll.',403);next='REVIEW';
  }else if(['APPROVE','RETURN'].includes(b.action)){
   if(!leader(req)||run.created_by===user)throw new WorkflowError('Another authorized leader must review this payroll.',403);
   if(run.status!=='REVIEW')throw new WorkflowError('Only payroll awaiting review can be approved or returned.',409);next=b.action==='APPROVE'?'APPROVED':'DRAFT';
  }else if(b.action==='CANCEL'){
   if(!((finance(req)&&run.created_by===user&&['DRAFT','REVIEW'].includes(run.status))||(leader(req)&&run.created_by!==user&&run.status==='APPROVED')))throw new WorkflowError('This payroll cannot be cancelled by your account at its current stage.',403);next='CANCELLED';
  }else if(b.action==='RECORD_PAYMENT'){
   if(!finance(req)||run.status!=='APPROVED')throw new WorkflowError('Finance can record payment only for approved payroll.',403);
   day(b.paidOn);if(b.paidOn>new Date().toISOString().slice(0,10)||b.paidOn<dateString(run.period_start))throw new WorkflowError('Enter an actual payment date on or after the period start.');
   field(b.paymentReference,'the payment evidence reference',200);next='PAID';
  }else throw new WorkflowError('Choose a valid payroll action.');
  if(['REVIEW','APPROVED'].includes(next)){
   if(!lines.length||lines.some(l=>l.currency!==run.currency))throw new WorkflowError('Save employee lines in the run currency before submitting.',409);
   const duplicate=await q(req,`SELECT 1 FROM payroll_runs r JOIN payroll_run_lines l ON l.school_id=r.school_id AND l.payroll_run_id=r.id WHERE r.school_id=$1 AND r.id<>$2 AND r.status IN ('APPROVED','PAID') AND r.period_start<=$4 AND r.period_end>=$3 AND l.staff_record_id=ANY($5::uuid[]) LIMIT 1`,[req.auth.claims.schoolId,run.id,dateString(run.period_start),dateString(run.period_end),lines.map(l=>l.staff_record_id)]);
   if(duplicate.rowCount)throw new WorkflowError('An approved or paid payroll already overlaps this period for an included employee.',409);
  }
  await q(req,`UPDATE payroll_runs SET status=$3,revision=revision+1,approved_by=CASE WHEN $3='APPROVED' THEN $4::uuid ELSE approved_by END,approved_at=CASE WHEN $3='APPROVED' THEN now() ELSE approved_at END,payment_reference=CASE WHEN $3='PAID' THEN $5 ELSE payment_reference END,paid_on=CASE WHEN $3='PAID' THEN $6::date ELSE paid_on END,paid_by=CASE WHEN $3='PAID' THEN $4::uuid ELSE paid_by END WHERE school_id=$1 AND id=$2`,[req.auth.claims.schoolId,run.id,next,user,b.paymentReference||null,b.paidOn||null]);
  await event(req,null,run.id,'PAYROLL_'+b.action,note);return done(req,res,200,{status:next});
 }));
 router.get('/staff/payslips',handle(staff,async(req,res)=>{
  const rows=await q(req,`SELECT l.id,l.currency,l.gross_amount,l.additions,l.deductions,l.net_amount,l.calculation_notes,r.period_start,r.period_end,r.paid_on,s.employee_number FROM payroll_run_lines l JOIN payroll_runs r ON r.school_id=l.school_id AND r.id=l.payroll_run_id JOIN staff_records s ON s.school_id=l.school_id AND s.id=l.staff_record_id WHERE l.school_id=$1 AND s.user_id=$2 AND r.status='PAID' ORDER BY r.period_end DESC,l.id LIMIT 100`,[req.auth.claims.schoolId,req.auth.claims.userId]);
  return done(req,res,200,{payslips:rows.rows});
 }));
}
