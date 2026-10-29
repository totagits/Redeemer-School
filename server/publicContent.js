import express from 'express';

const schoolCodePattern=/^[A-Z0-9][A-Z0-9_-]{1,49}$/;
const validId=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function clean(value,max){return typeof value==='string' && value.trim().length<=max?value.trim():'';}
function permitted(auth){
 return auth.account.roles.some(r=>['SCHOOL_ADMIN','PRINCIPAL'].includes(r)) &&
 auth.account.permissions.includes('communications.write');
}
async function release(req,res,status,data,commit=true){
 const client=req.auth.client;req.auth.client=null;
 try{await client.query(commit?'COMMIT':'ROLLBACK');}finally{client.release();}
 return res.status(status).json(data);
}
export function createPublicContentRouter({pool,authenticate}){
 const router=express.Router();
 router.get('/public',async(req,res)=>{
   const schoolCode=clean(req.query.schoolCode,50).toUpperCase();
   if(!schoolCodePattern.test(schoolCode))return res.status(400).json({error:'Valid school code required.'});
   if(!pool)return res.status(503).json({error:'Public notices are temporarily unavailable.'});
   res.set('Cache-Control','no-store');
   let client;
   try{
     client=await pool.connect();await client.query('BEGIN READ ONLY');
     const resolved=await client.query('SELECT app.resolve_school_id_by_code($1) AS id',[schoolCode]);
     const schoolId=resolved.rows[0]?.id;
     if(!schoolId){await client.query('ROLLBACK');client.release();return res.status(404).json({error:'School not found.'});}
     await client.query("SELECT set_config('app.current_school_id',$1,true)",[schoolId]);
     const posts=await client.query(`SELECT id,kind,title,summary,body,event_starts_at,published_at
       FROM public_school_posts WHERE school_id=$1 AND status='PUBLISHED' AND published_at<=now()
       ORDER BY published_at DESC LIMIT 30`,[schoolId]);
     await client.query('COMMIT');client.release();
     return res.json({posts:posts.rows});
   }catch(error){
     if(client){try{await client.query('ROLLBACK');}catch{}client.release();}
     return res.status(503).json({error:'Public notices are temporarily unavailable.'});
   }
 });
 router.use('/manage',authenticate);
 router.use('/manage',async(req,res,next)=>{
   if(!permitted(req.auth))return release(req,res,403,{error:'Only authorized school leadership may manage public notices.'},false);
   next();
 });
 router.get('/manage',async(req,res)=>{
   try{
     const result=await req.auth.client.query(`SELECT id,kind,title,summary,body,status,event_starts_at,published_at,created_at
       FROM public_school_posts WHERE school_id=$1 ORDER BY created_at DESC LIMIT 100`,[req.auth.claims.schoolId]);
     return release(req,res,200,{posts:result.rows});
   }catch {return release(req,res,503,{error:'Could not load public content.'},false);}
 });
 router.post('/manage',async(req,res)=>{
   if(req.get('x-csrf-token')!==req.auth.claims.csrfToken)return release(req,res,403,{error:'Invalid request verification.'},false);
   const kind=clean(req.body?.kind,12).toUpperCase();
   const title=clean(req.body?.title,180);
   const summary=clean(req.body?.summary,500);
   const body=clean(req.body?.body,8000);
   const date=clean(req.body?.eventStartsAt,40);
   const dateValid=!date || (!Number.isNaN(Date.parse(date)) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date));
   if(!['NEWS','EVENT'].includes(kind)||!title||!summary||!body||!dateValid||(kind==='NEWS'&&date))
     return release(req,res,400,{error:'Enter a title, summary, body and valid event details.'},false);
   try{
     const result=await req.auth.client.query(`INSERT INTO public_school_posts
       (school_id,kind,title,summary,body,event_starts_at,created_by,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,'DRAFT')
       RETURNING id,kind,title,status`,
       [req.auth.claims.schoolId,kind,title,summary,body,date||null,req.auth.claims.userId]);
     return release(req,res,201,{post:result.rows[0],notice:'Saved as a private draft.'});
   }catch{return release(req,res,503,{error:'Could not save public content.'},false);}
 });
 router.post('/manage/:id/status',async(req,res)=>{
   if(req.get('x-csrf-token')!==req.auth.claims.csrfToken)return release(req,res,403,{error:'Invalid request verification.'},false);
   if(!validId.test(req.params.id))return release(req,res,400,{error:'Invalid content ID.'},false);
   const action=clean(req.body?.action,20).toUpperCase();
   if(!['PUBLISH','UNPUBLISH'].includes(action))return release(req,res,400,{error:'Invalid action.'},false);
   try{
     const result=await req.auth.client.query(`UPDATE public_school_posts
        SET status=$3,
          published_at=CASE WHEN $3='PUBLISHED' THEN now() ELSE published_at END,
          published_by=CASE WHEN $3='PUBLISHED' THEN $4 ELSE published_by END,
          updated_at=now()
        WHERE school_id=$1 AND id=$2 AND status<>$3
        RETURNING id,title,status`,
        [req.auth.claims.schoolId,req.params.id,action==='PUBLISH'?'PUBLISHED':'UNPUBLISHED',req.auth.claims.userId]);
     if(!result.rowCount)return release(req,res,404,{error:'Post not found or already in this state.'},false);
     return release(req,res,200,{post:result.rows[0]});
   }catch{return release(req,res,503,{error:'Could not update publication status.'},false);}
 });
 return router;
}
