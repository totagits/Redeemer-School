import express from 'express';
import {readFile} from 'node:fs/promises';

export function stagingReviewEnabled(env=process.env){
  if(String(env.EMAIL_MODE||'').trim().toLowerCase()!=='staging')return false;
  try{const u=new URL(env.APP_PUBLIC_URL);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash;}catch{return false;}
}
export function createStagingReviewRouter({env=process.env}={}){
  const router=express.Router();
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/status',(_req,res)=>res.json({enabled:stagingReviewEnabled(env)}));
  router.get('/payroll-rules',async(_req,res)=>{
    if(!stagingReviewEnabled(env))return res.status(404).json({error:'School review is not available here.'});
    try{
      const content=await readFile(new URL('../docs/payroll-rules-for-school-approval.md',import.meta.url),'utf8');
      return res.set('Content-Type','text/markdown; charset=utf-8').set('Content-Disposition','attachment; filename="Redeemer-Payroll-Rules-for-Approval.md"').send(content);
    }catch{return res.status(503).json({error:'The rules template is temporarily unavailable. Contact the review coordinator.'});}
  });
  router.get('/account-roster',(_req,res)=>{
    if(!stagingReviewEnabled(env))return res.status(404).json({error:'School review is not available here.'});
    const csv='Reviewer name,Email,Requested role,Fictional class or learner reference,School authorization reference\r\n';
    return res.set('Content-Type','text/csv; charset=utf-8').set('Content-Disposition','attachment; filename="Redeemer-Review-Account-Roster.csv"').send(csv);
  });
  return router;
}
