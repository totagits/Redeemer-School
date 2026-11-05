import {readMomoConfig} from './mtnMomo.js';
import {smsReadiness,smsProviderName} from './sms.js';
export function integrationReadiness(env=process.env){
 const momo=readMomoConfig(env);
 const emailMode=String(env.EMAIL_MODE||'').trim().toLowerCase();
 let cleanUrl=false;try{const u=new URL(env.APP_PUBLIC_URL);cleanUrl=u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash;}catch{}
 return {services:[
  {name:'MTN MoMo collections',mode:momo.environment,configured:momo.enabled,nextStep:momo.enabled?'Provider-approved collection, status, timeout and duplicate handling still require witnessed acceptance.':momo.reason},
  {name:smsProviderName(env),mode:String(env.SMS_PROVIDER||'').toUpperCase()==='MTN'?'Live SMS gate':'School SMS provider',configured:smsReadiness(env),nextStep:'Confirm approved sender, recipient consent, charges and delivery evidence before any live test.'},
  {name:'Account and examination email',mode:['staging','production'].includes(emailMode)?emailMode:'Not configured',configured:Boolean(env.RESEND_API_KEY?.trim()&&env.RESEND_FROM_EMAIL?.trim()&&cleanUrl&&['staging','production'].includes(emailMode)),nextStep:'Confirm verified sender domain and delivery to an authorized recipient. Existing delivery evidence stays separate from this configuration check.'}
 ]};
}
export function registerIntegrationReadiness(router,{close,done}){
 router.get('/integrations',async(req,res)=>{
  if(!req.auth.account.roles.some(r=>['SCHOOL_ADMIN','PRINCIPAL','FINANCE'].includes(r))){await close(req,false);return res.status(403).json({error:'This service readiness view requires school leadership or Finance responsibility.'});}
  return done(req,res,200,integrationReadiness());
 });
}
