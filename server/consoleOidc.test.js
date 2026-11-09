import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT,exportJWK,createLocalJWKSet} from 'jose';
import {createHash} from 'node:crypto';
import {createConsoleOidc,verifyOperatorIdToken,oidcConfiguration,createIdentityTestChallenges} from './platform/consoleOidc.js';

const config={issuer:'https://identity.example.invalid',clientId:'test-console',clientSecret:'fictional-secret',origin:'https://console.example.invalid',callback:'https://console.example.invalid/auth/callback',allowedAcrs:['urn:test:verified-mfa']};
const {privateKey,publicKey}=await generateKeyPair('RS256');
const jwk={...await exportJWK(publicKey),kid:'test-key',alg:'RS256'},keys=createLocalJWKSet({keys:[jwk]});
async function token(overrides={}){const now=Math.floor(Date.now()/1000);return new SignJWT({iss:config.issuer,aud:config.clientId,sub:'approved-subject',nonce:'test-nonce',auth_time:now,amr:['pwd','mfa'],iat:now,exp:now+300,...overrides}).setProtectedHeader({alg:'RS256',kid:'test-key'}).sign(privateKey);}
test('operator identity requires a valid signed issuer/audience/nonce, fresh authentication and verified MFA',async()=>{
  assert.deepEqual(await verifyOperatorIdToken(await token(),keys,config,'test-nonce'),{issuer:config.issuer,subject:'approved-subject'});
  for(const change of [{iss:'https://wrong.example.invalid'},{aud:'other-client'},{nonce:'wrong'},{amr:['pwd']},{amr:['pwd'],acr:'unknown'},{azp:'other-client'},{aud:[config.clientId,'other']},{auth_time:Math.floor(Date.now()/1000)-700},{auth_time:Math.floor(Date.now()/1000)+90},{exp:1}])await assert.rejects(()=>token(change).then(t=>verifyOperatorIdToken(t,keys,config,'test-nonce')));
  assert.ok(await verifyOperatorIdToken(await token({amr:[],acr:'urn:test:verified-mfa'}),keys,config,'test-nonce'));
  const unsigned='eyJhbGciOiJub25lIn0.'+Buffer.from(JSON.stringify({sub:'admin'})).toString('base64url')+'.';
  await assert.rejects(()=>verifyOperatorIdToken(unsigned,keys,config,'test-nonce'));
});
test('workforce callback binds browser state, PKCE and nonce and does not derive access from an email claim',async()=>{
  const challenges=new Map(),sessions=[];let current,tokenCalls=0,approved=true;
  const store={createChallenge:async(state,binding,nonce,verifier)=>{current={state,binding,nonce,verifier};challenges.set(state,current);},consumeChallenge:async(state,binding)=>{const c=challenges.get(state);if(!c||c.binding!==binding)return null;challenges.delete(state);return c;},operator:async(issuer,subject)=>approved&&issuer===config.issuer&&subject==='approved-subject'?{id:'operator-1'}:null,createSession:async(operator,mfa)=>{sessions.push({operator,mfa});return {raw:'local-session-only'};}};
  const fetchMock=async(url,options)=>{
    if(String(url).includes('openid-configuration'))return Response.json({issuer:config.issuer,authorization_endpoint:config.issuer+'/authorize',token_endpoint:config.issuer+'/token',jwks_uri:config.issuer+'/keys'});
    if(String(url).endsWith('/keys'))return Response.json({keys:[jwk]});
    if(String(url).endsWith('/token')){tokenCalls++;assert.equal(options.redirect,'error');assert.equal(options.body.get('code_verifier'),current.verifier);return Response.json({id_token:await token({nonce:current.nonce,email:'admin@example.invalid',email_verified:true})});}
    throw Error('Unexpected provider request');
  };
  const oidc=await createConsoleOidc(config,store,fetchMock),first=await oidc.begin(),auth=new URL(first.url);
  assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
  assert.equal(auth.searchParams.get('code_challenge'),createHash('sha256').update(current.verifier).digest('base64url'));
  await assert.rejects(()=>oidc.callback('code',current.state,'x'.repeat(43)));
  const result=await oidc.callback('code',current.state,first.binding);assert.deepEqual(result,{raw:'local-session-only'});assert.equal(sessions[0].mfa,true);
  await assert.rejects(()=>oidc.callback('code',current.state,first.binding));assert.equal(tokenCalls,1);
  approved=false;const second=await oidc.begin();await assert.rejects(()=>oidc.callback('code',current.state,second.binding),/approved TOTAG/);
  assert.equal(sessions.length,1);
});
test('OIDC configuration/discovery rejects unsafe origins and mismatched endpoint hosts',async()=>{
  assert.throws(()=>oidcConfiguration({TOTAG_OIDC_ISSUER:config.issuer,TOTAG_OIDC_CLIENT_ID:'test',TOTAG_OIDC_CLIENT_SECRET:'secret',TOTAG_CONSOLE_PUBLIC_URL:'http://console.example.invalid'}));
  await assert.rejects(()=>createConsoleOidc(config,{},async()=>Response.json({issuer:config.issuer,authorization_endpoint:config.issuer+'/authorize',token_endpoint:'https://other.example.invalid/token',jwks_uri:config.issuer+'/keys'})),/discovery origin/);
});
test('explicit discovery can use a distinct directory host without weakening signed MFA requirements',async()=>{
  const directory='https://directory.example.invalid/app',discoveryUrl=directory+'/.well-known/openid-configuration';
  const configured=oidcConfiguration({TOTAG_OIDC_ISSUER:config.issuer,TOTAG_OIDC_DISCOVERY_URL:discoveryUrl,TOTAG_OIDC_CLIENT_ID:config.clientId,TOTAG_OIDC_CLIENT_SECRET:config.clientSecret,TOTAG_CONSOLE_PUBLIC_URL:config.origin});
  const fetchMetadata=async(url)=>{assert.equal(url,discoveryUrl);return Response.json({issuer:config.issuer,authorization_endpoint:directory+'/authorize',token_endpoint:directory+'/token',jwks_uri:directory+'/keys',code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['client_secret_post']});};
  assert.ok(await createConsoleOidc(configured,{},fetchMetadata));
  await assert.rejects(()=>token({amr:undefined,auth_time:undefined,nonce:undefined}).then(t=>verifyOperatorIdToken(t,keys,configured,'test-nonce')));
});
test('workforce test reports missing assurance without issuing a session or revealing identity',async()=>{
  const store=createIdentityTestChallenges();let signedToken;
  const mock=async(url)=>{
    if(String(url).endsWith('openid-configuration'))return Response.json({issuer:config.issuer,authorization_endpoint:config.issuer+'/authorize',token_endpoint:config.issuer+'/token',jwks_uri:config.issuer+'/keys'});
    if(String(url).endsWith('/keys'))return Response.json({keys:[jwk]});
    return Response.json({id_token:signedToken});
  };
  const oidc=await createConsoleOidc(config,store,mock,{testOnly:true});
  const challenge=await oidc.begin(),params=new URL(challenge.url).searchParams;
  signedToken=await token({auth_time:undefined,amr:undefined,nonce:undefined});
  const result=await oidc.callback('code',params.get('state'),challenge.binding);
  assert.deepEqual(result,{evidence:{signedIdentityVerified:true,signInBoundToBrowser:false,recentAuthentication:false,secondFactorVerified:false}});
  await assert.rejects(()=>oidc.callback('code',params.get('state'),challenge.binding));
});
