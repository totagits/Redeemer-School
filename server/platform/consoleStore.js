import {createHash,randomBytes} from 'node:crypto';

export const hashSecret=value=>createHash('sha256').update(value).digest('hex');
export const newSecret=()=>randomBytes(32).toString('base64url');
export class ConsoleAccessError extends Error {constructor(message='This school configuration is not available to your account.',status=403){super(message);this.status=status;}}

export function createConsoleStore(pool){
  const withClient=async fn=>{const client=await pool.connect();try{return await fn(client);}finally{client.release();}};
  const event=(client,operator,action,institution=null,details={})=>client.query('INSERT INTO totag_platform.console_events(operator_id,action,institution_id,details) VALUES($1,$2,$3,$4::jsonb)',[operator?.id||null,action,institution,JSON.stringify(details)]);
  async function scope(client,operator,code,environment,write=false){
    const found=(await client.query(`SELECT i.*,CASE WHEN $3='GLOBAL_CONFIGURATOR' THEN 'CONFIGURE' ELSE s.access_level END AS access_level
      FROM totag_platform.institutions i LEFT JOIN totag_platform.operator_scopes s ON s.institution_id=i.id AND s.operator_id=$4
      WHERE i.code=$1 AND i.environment=$2 AND ($3='GLOBAL_CONFIGURATOR' OR s.access_level IS NOT NULL)`,[code,environment,operator.access_level,operator.id])).rows[0];
    if(!found || (write&&found.access_level!=='CONFIGURE'))throw new ConsoleAccessError();
    return found;
  }
  return {pool,withClient,event,scope,
    async operator(issuer,subject){return withClient(async c=>(await c.query('SELECT id,display_name,access_level FROM totag_platform.operators WHERE issuer=$1 AND subject=$2 AND active',[issuer,subject])).rows[0]||null);},
    async session(raw){if(typeof raw!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(raw))return null;return withClient(async c=>(await c.query(`SELECT o.id,o.display_name,o.access_level,s.csrf_token,s.expires_at,s.mfa_verified FROM totag_platform.console_sessions s
      JOIN totag_platform.operators o ON o.id=s.operator_id WHERE s.token_hash=$1 AND s.expires_at>now() AND o.active`,[hashSecret(raw)])).rows[0]||null);},
    async createSession(operator,mfa){const raw=newSecret(),csrf=newSecret(),expires=new Date(Date.now()+60*60*1000);await withClient(async c=>{
      await c.query('BEGIN');try{await c.query('INSERT INTO totag_platform.console_sessions(token_hash,operator_id,csrf_token,mfa_verified,expires_at) VALUES($1,$2,$3,$4,$5)',[hashSecret(raw),operator.id,csrf,mfa,expires]);await event(c,operator,'CONSOLE_SIGNED_IN',null,{mfaVerified:mfa});await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}
    });return {raw,csrf,expires};},
    async logout(raw,operator){await withClient(async c=>{await c.query('DELETE FROM totag_platform.console_sessions WHERE token_hash=$1',[hashSecret(raw)]);await event(c,operator,'CONSOLE_SIGNED_OUT');});},
    async createChallenge(state,binding,nonce,verifier){await withClient(async c=>{await c.query('DELETE FROM totag_platform.login_challenges WHERE expires_at<=now()');await c.query("INSERT INTO totag_platform.login_challenges(state_hash,cookie_hash,nonce,verifier,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')",[hashSecret(state),hashSecret(binding),nonce,verifier]);});},
    async consumeChallenge(state,binding){return withClient(async c=>(await c.query('DELETE FROM totag_platform.login_challenges WHERE state_hash=$1 AND cookie_hash=$2 AND expires_at>now() RETURNING nonce,verifier',[hashSecret(state),hashSecret(binding)])).rows[0]||null);},
    async list(operator){return withClient(async c=>(await c.query(`SELECT i.code,i.name,i.environment,i.revision,i.updated_at,
      CASE WHEN $1='GLOBAL_CONFIGURATOR' THEN 'CONFIGURE' ELSE s.access_level END AS access_level
      FROM totag_platform.institutions i LEFT JOIN totag_platform.operator_scopes s ON s.institution_id=i.id AND s.operator_id=$2
      WHERE $1='GLOBAL_CONFIGURATOR' OR s.access_level IS NOT NULL ORDER BY i.name,i.environment`,[operator.access_level,operator.id])).rows);}
  };
}
