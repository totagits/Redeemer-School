import {createHash} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify,customFetch} from 'jose';
import {newSecret} from './consoleStore.js';

export function oidcConfiguration(env){
  if(!env.TOTAG_OIDC_ISSUER||!env.TOTAG_OIDC_CLIENT_ID||!env.TOTAG_OIDC_CLIENT_SECRET)throw Error('Configure the separate TOTAG workforce identity provider.');
  const issuer=String(env.TOTAG_OIDC_ISSUER),url=new URL(issuer),origin=new URL(env.TOTAG_CONSOLE_PUBLIC_URL);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('Use clean HTTPS issuer and console addresses.');
  return {issuer,clientId:env.TOTAG_OIDC_CLIENT_ID,clientSecret:env.TOTAG_OIDC_CLIENT_SECRET,origin:origin.origin,callback:origin.origin+'/auth/callback',allowedAcrs:String(env.TOTAG_OIDC_MFA_ACRS||'').split(',').map(v=>v.trim()).filter(Boolean)};
}
export async function verifyOperatorIdToken(token,key,config,nonce){
  const {payload}=await jwtVerify(token,key,{issuer:config.issuer,audience:config.clientId,algorithms:['RS256'],clockTolerance:30,requiredClaims:['sub','exp','iat','nonce','auth_time'],maxTokenAge:'10 minutes'});
  const now=Math.floor(Date.now()/1000);
  if(payload.nonce!==nonce||typeof payload.sub!=='string'||!payload.sub||payload.sub.length>512||typeof payload.auth_time!=='number'||payload.auth_time>now+30||payload.auth_time<now-600)throw Error('Invalid or stale operator authentication.');
  if((payload.azp!==undefined&&payload.azp!==config.clientId)||(Array.isArray(payload.aud)&&payload.aud.length>1&&payload.azp!==config.clientId))throw Error('Invalid authorized party.');
  const mfa=(Array.isArray(payload.amr)&&payload.amr.includes('mfa'))||(typeof payload.acr==='string'&&config.allowedAcrs.includes(payload.acr));
  if(!mfa)throw Error('Verified workforce MFA is required.');
  return {issuer:payload.iss,subject:payload.sub};
}
export async function createConsoleOidc(config,store,fetchImpl=fetch){
  const response=await fetchImpl(config.issuer.replace(/\/$/,'')+'/.well-known/openid-configuration',{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Workforce identity discovery failed.');
  const discovery=await response.json();
  if(discovery.issuer!==config.issuer)throw Error('Identity issuer mismatch.');
  for(const field of ['authorization_endpoint','token_endpoint','jwks_uri']){
    const url=new URL(discovery[field]);if(url.protocol!=='https:'||url.origin!==new URL(config.issuer).origin||url.username||url.password||url.hash)throw Error('Identity endpoints must stay on the configured HTTPS issuer origin.');
  }
  const keys=createRemoteJWKSet(new URL(discovery.jwks_uri),{timeoutDuration:10000,[customFetch]:(url,options)=>fetchImpl(url,{...options,redirect:'error'})});
  return {
    async begin(){
      const state=newSecret(),binding=newSecret(),nonce=newSecret(),verifier=newSecret()+newSecret();
      await store.createChallenge(state,binding,nonce,verifier);
      const url=new URL(discovery.authorization_endpoint);
      for(const [key,value] of Object.entries({client_id:config.clientId,redirect_uri:config.callback,response_type:'code',scope:'openid',state,nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),max_age:'300',claims:JSON.stringify({id_token:{auth_time:{essential:true},amr:{essential:true}}})}))url.searchParams.set(key,value);
      return {url:url.toString(),binding};
    },
    async callback(code,state,binding){
      if(typeof code!=='string'||code.length>4096||typeof state!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(state)||typeof binding!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(binding))throw Error('Invalid sign-in response.');
      const challenge=await store.consumeChallenge(state,binding);if(!challenge)throw Error('Sign-in request expired or was already used.');
      const result=await fetchImpl(discovery.token_endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,client_secret:config.clientSecret,code,redirect_uri:config.callback,code_verifier:challenge.verifier})});
      if(!result.ok)throw Error('Workforce sign-in failed.');
      const tokens=await result.json();if(typeof tokens.id_token!=='string')throw Error('Identity token missing.');
      const identity=await verifyOperatorIdToken(tokens.id_token,keys,config,challenge.nonce);
      const operator=await store.operator(identity.issuer,identity.subject);if(!operator)throw Error('An approved TOTAG operator account is required.');
      return store.createSession(operator,true);
    }
  };
}
