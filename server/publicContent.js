import express from 'express';

const schoolCodePattern=/^[A-Z0-9][A-Z0-9_-]{1,49}$/;
const validId=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function clean(value,max){return typeof value==='string' && value.trim().length<=max?value.trim():'';}

function webpDimensions(bytes){
 if(bytes.length<30||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP'||bytes.readUInt32LE(4)+8!==bytes.length)return null;
 const kind=bytes.toString('ascii',12,16);
 if(kind==='VP8 '&&bytes.length>=30&&bytes[23]===0x9d&&bytes[24]===1&&bytes[25]===0x2a)return {width:bytes.readUInt16LE(26)&0x3fff,height:bytes.readUInt16LE(28)&0x3fff};
 if(kind==='VP8L'&&bytes.length>=25&&bytes[20]===0x2f)return {width:1+(((bytes[22]&63)<<8)|bytes[21]),height:1+(((bytes[24]&15)<<10)|(bytes[23]<<2)|((bytes[22]&192)>>6))};
 if(kind==='VP8X'&&bytes.length>=30)return {width:1+bytes.readUIntLE(24,3),height:1+bytes.readUIntLE(27,3)};
 return null;
}
function decodeImage(value){
 if(typeof value!=='string'||!/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)||value.length>2200000)return null;
 const bytes=Buffer.from(value.slice('data:image/webp;base64,'.length),'base64');
 if(bytes.length<100||bytes.length>1572864)return null;
 const size=webpDimensions(bytes);
 if(!size||size.width<1200||size.height<675||size.width>4096||size.height>4096)return null;
 return {bytes,...size};
}

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
     const posts=await client.query(`SELECT p.id,p.kind,p.title,p.summary,p.body,p.event_starts_at,p.published_at,\n       (i.post_id IS NOT NULL) AS has_featured_image,i.caption AS image_caption,i.alt_text AS image_alt\n       FROM public_school_posts p LEFT JOIN public_school_post_images i ON i.school_id=p.school_id AND i.post_id=p.id\n       WHERE p.school_id=$1 AND p.status='PUBLISHED' AND p.published_at<=now()
       ORDER BY published_at DESC LIMIT 30`,[schoolId]);
     await client.query('COMMIT');client.release();
     return res.json({posts:posts.rows});
   }catch(error){
     if(client){try{await client.query('ROLLBACK');}catch{}client.release();}
     return res.status(503).json({error:'Public notices are temporarily unavailable.'});
   }
 });
 router.get('/public/:id/image',async(req,res)=>{
   if(!validId.test(req.params.id))return res.status(400).end();
   const code=clean(req.query.schoolCode,50).toUpperCase();
   if(!schoolCodePattern.test(code)||!pool)return res.status(400).end();
   let client;
   try{
     client=await pool.connect();await client.query('BEGIN READ ONLY');
     const school=await client.query('SELECT app.resolve_school_id_by_code($1) AS id',[code]);
     const schoolId=school.rows[0]?.id;
     if(!schoolId){await client.query('ROLLBACK');client.release();return res.status(404).end();}
     await client.query("SELECT set_config('app.current_school_id',$1,true)",[schoolId]);
     const result=await client.query(`SELECT i.image_bytes FROM public_school_post_images i JOIN public_school_posts p
       ON p.school_id=i.school_id AND p.id=i.post_id
       WHERE i.school_id=$1 AND i.post_id=$2 AND p.status='PUBLISHED' AND p.published_at<=now()`,[schoolId,req.params.id]);
     await client.query('COMMIT');client.release();
     if(!result.rowCount)return res.status(404).end();
     return res.set('Content-Type','image/webp').set('X-Content-Type-Options','nosniff').set('Cache-Control','no-store').send(result.rows[0].image_bytes);
   }catch{
     if(client){try{await client.query('ROLLBACK');}catch{}client.release();}
     return res.status(503).end();
   }
 });
 router.use('/manage',authenticate);
 router.use('/manage',async(req,res,next)=>{
   if(!permitted(req.auth))return release(req,res,403,{error:'Only authorized school leadership may manage public notices.'},false);
   next();
 });
 router.get('/manage',async(req,res)=>{
   try{
     const result=await req.auth.client.query(`SELECT p.id,p.kind,p.title,p.summary,p.body,p.status,p.event_starts_at,p.published_at,p.created_at,\n       (i.post_id IS NOT NULL) AS has_featured_image,i.caption AS image_caption,i.alt_text AS image_alt\n       FROM public_school_posts p LEFT JOIN public_school_post_images i ON i.school_id=p.school_id AND i.post_id=p.id\n       WHERE p.school_id=$1 ORDER BY p.created_at DESC LIMIT 100`,[req.auth.claims.schoolId]);
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
 router.post('/manage/:id/image',async(req,res)=>{
   if(req.get('x-csrf-token')!==req.auth.claims.csrfToken)return release(req,res,403,{error:'Invalid request verification.'},false);
   if(!validId.test(req.params.id))return release(req,res,400,{error:'Invalid post ID.'},false);
   const image=decodeImage(req.body?.imageData);
   const alt=clean(req.body?.altText,240);
   const caption=clean(req.body?.caption||'',240);
   if(!image||alt.length<5)return release(req,res,400,{error:'Upload a clear WebP image of at least 1200 by 675 pixels, with descriptive alt text.'},false);
   try{
     const result=await req.auth.client.query(`INSERT INTO public_school_post_images
       (school_id,post_id,image_bytes,mime_type,pixel_width,pixel_height,caption,alt_text)
       SELECT p.school_id,p.id,$3,'image/webp',$4,$5,$6,$7 FROM public_school_posts p
       WHERE p.school_id=$1 AND p.id=$2 AND p.status<>'PUBLISHED'
       ON CONFLICT(school_id,post_id) DO UPDATE SET image_bytes=EXCLUDED.image_bytes,
         pixel_width=EXCLUDED.pixel_width,pixel_height=EXCLUDED.pixel_height,
         caption=EXCLUDED.caption,alt_text=EXCLUDED.alt_text
       RETURNING post_id`,
       [req.auth.claims.schoolId,req.params.id,image.bytes,image.width,image.height,caption,alt]);
     if(!result.rowCount)return release(req,res,409,{error:'Only private drafts or unpublished posts may have their image changed.'},false);
     return release(req,res,200,{notice:'Featured photo saved to this private post.'});
   }catch{return release(req,res,503,{error:'Could not save featured photo.'},false);}
 });
 router.delete('/manage/:id/image',async(req,res)=>{
   if(req.get('x-csrf-token')!==req.auth.claims.csrfToken)return release(req,res,403,{error:'Invalid request verification.'},false);
   if(!validId.test(req.params.id))return release(req,res,400,{error:'Invalid post ID.'},false);
   try{
     const removed=await req.auth.client.query(`DELETE FROM public_school_post_images i USING public_school_posts p
       WHERE i.school_id=$1 AND i.post_id=$2 AND p.school_id=i.school_id AND p.id=i.post_id
       AND p.status<>'PUBLISHED' RETURNING i.post_id`,[req.auth.claims.schoolId,req.params.id]);
     if(!removed.rowCount)return release(req,res,404,{error:'No removable photo found. Unpublish the post first if it is public.'},false);
     return release(req,res,200,{notice:'Featured photo deleted. The news or event is retained.'});
   }catch{return release(req,res,503,{error:'Could not delete featured photo.'},false);}
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
