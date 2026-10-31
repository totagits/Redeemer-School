import { finalizeExpiredAttempts } from './candidateExamSitting.js';

export async function sweepExamTimeouts(pool,schoolCodes){
 for(const code of schoolCodes){
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query("SET LOCAL statement_timeout='5s'");
   const safe=await client.query('SELECT NOT rolsuper AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname=current_user');
   if(safe.rows[0]?.safe!==true)throw Error('Unsafe examination worker role');
   const school=(await client.query('SELECT app.resolve_school_id_by_code($1) AS id',[code])).rows[0]?.id;
   if(school){await client.query("SELECT set_config('app.current_school_id',$1,true)",[school]);await finalizeExpiredAttempts(client,{schoolId:school});}
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
}
export function startExamTimeoutWorker({pool,enabled,schoolCodes=['RIA'],onError=()=>console.error('Examination timeout sweep failed; it will retry.')}){
 if(!enabled||!pool)return ()=>{};
 let running=false,stopped=false;
 const tick=async()=>{if(running||stopped)return;running=true;try{await sweepExamTimeouts(pool,schoolCodes);}catch{onError();}finally{running=false;}};
 const timer=setInterval(()=>void tick(),15_000);timer.unref();void tick();
 return ()=>{stopped=true;clearInterval(timer);};
}
