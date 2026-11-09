import {createHash} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify,customFetch} from 'jose';
import {newSecret} from './consoleStore.js';

export function oidcConfiguration(env){
  if(!env.TOTAG_OIDC_ISSUER||!env.TOTAG_OIDC_CLIENT_ID||!env.TOTAG_OIDC_CLIENT_SECRET)throw Error('Configure the separate TOTAG workforce identity provider.');
  const issuer=String(env.TOTAG_OIDC_ISSUER),url=new URL(issuer),origin=new URL(env.TOTAG_CONSOLE_PUBLIC_URL);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('Use clean HTTPS issuer and console addresses.');
  const discoveryUrl=new URL(env.TOTAG_OIDC_DISCOVERY_URL||issuer.replace(/\/$/,'')+'/.well-known/openid-configuration');
  if(discoveryUrl.protocol!=='https:'||discoveryUrl.username||discoveryUrl.password||discoveryUrl.search||discoveryUrl.hash||!discoveryUrl.pathname.endsWith('/.well-known/openid-configuration'))throw Error('Use the approved HTTPS discovery address.');
  return {issuer,discoveryUrl:discoveryUrl.href,clientId:env.TOTAG_OIDC_CLIENT_ID,clientSecret:env.TOTAG_OIDC_CLIENT_SECRET,origin:origin.origin,callback:origin.origin+'/auth/callback',allowedAcrs:String(env.TOTAG_OIDC_MFA_ACRS||'').split(',').map(v=>v.trim()).filter(Boolean)};
}
async function verifiedClaims(token,key,config){
  const {payload}=await jwtVerify(token,key,{issuer:config.issuer,audience:config.clientId,algorithms:['RS256'],clockTolerance:30,requiredClaims:['sub','exp','iat'],maxTokenAge:'10 minutes'});
  if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>512)throw Error('Invalid operator identity.');
  if((payload.azp!==undefined&&payload.azp!==config.clientId)||(Array.isArray(payload.aud)&&payload.aud.length>1&&payload.azp!==config.clientId))throw Error('Invalid authorized party.');
  return payload;
}
function assurance(payload,config,nonce){
  const now=Math.floor(Date.now()/1000);
  return {signedIdentityVerified:true,signInBoundToBrowser:typeof nonce==='string'&&payload.nonce===nonce,recentAuthentication:typeof payload.auth_time==='number'&&payload.auth_time<=now+30&&payload.auth_time>=now-600,
    secondFactorVerified:(Array.isArray(payload.amr)&&payload.amr.includes('mfa'))||(typeof payload.acr==='string'&&config.allowedAcrs.includes(payload.acr))};
}
export async function verifyOperatorIdToken(token,key,config,nonce){
  const payload=await verifiedClaims(token,key,config),report=assurance(payload,config,nonce);
  if(!report.signInBoundToBrowser||!report.recentAuthentication)throw Error('Invalid or stale operator authentication.');
  if(!report.secondFactorVerified)throw Error('Verified workforce MFA is required.');
  return {issuer:payload.iss,subject:payload.sub};
}
export async function createConsoleOidc(config,store,fetchImpl=fetch,{testOnly=false}={}){
  const metadataUrl=new URL(config.discoveryUrl||config.issuer.replace(/\/$/,'')+'/.well-known/openid-configuration');
  const response=await fetchImpl(metadataUrl.href,{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Workforce identity discovery failed.');
  const discovery=await response.json();
  if(discovery.issuer!==config.issuer)throw Error('Identity issuer mismatch.');
  for(const field of ['authorization_endpoint','token_endpoint','jwks_uri']){
    const url=new URL(discovery[field]);if(url.protocol!=='https:'||url.origin!==metadataUrl.origin||url.username||url.password||url.hash)throw Error('Identity endpoints must stay on the configured HTTPS discovery origin.');
  }
  if(discovery.code_challenge_methods_supported&&!discovery.code_challenge_methods_supported.includes('S256'))throw Error('Workforce sign-in requires S256 PKCE.');
  if(discovery.token_endpoint_auth_methods_supported&&!discovery.token_endpoint_auth_methods_supported.includes('client_secret_post'))throw Error('The workforce provider must support the configured confidential-client exchange.');
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
      if(testOnly){const payload=await verifiedClaims(tokens.id_token,keys,config);return {evidence:assurance(payload,config,challenge.nonce)};}
      const identity=await verifyOperatorIdToken(tokens.id_token,keys,config,challenge.nonce);
      const operator=await store.operator(identity.issuer,identity.subject);if(!operator)throw Error('An approved TOTAG operator account is required.');
      return store.createSession(operator,true);
    }
  };
}

// Hosted sign-in rehearsal uses ephemeral challenges only. It has no operator
// lookup or session issuance methods and never connects a registry.
export function createIdentityTestChallenges(){
  const challenges=new Map();
  return {async createChallenge(state,binding,nonce,verifier){
    const now=Date.now();for(const [key,value] of challenges)if(value.until<=now)challenges.delete(key);
    if(challenges.size>=100)throw Error('Too many sign-in checks.');
    challenges.set(state,{binding,nonce,verifier,until:now+300000});
  },async consumeChallenge(state,binding){
    const found=challenges.get(state);if(!found||found.until<=Date.now()||found.binding!==binding)return null;
    challenges.delete(state);return {nonce:found.nonce,verifier:found.verifier};
  }};
}
