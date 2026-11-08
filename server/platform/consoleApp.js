import express from 'express';
import path from 'node:path';
import {createHash,timingSafeEqual} from 'node:crypto';
import {ManifestError,validateInstitutionManifest,institutionPlan} from './institutionManifest.js';
import {assertSchoolPalette,validateInstitutionLogo} from './schoolBuild.js';
import {registerInstitution,RegistryConflict} from './registry.js';
import {ConsoleAccessError} from './consoleStore.js';
import {verifyIntake,receiveSchoolRequest,requireRequestManager,reviewSchoolRequest,linkSchoolRequest} from './schoolRequests.js';
import {validateSchoolRequest} from '../../shared/schoolRequest.js';

function cookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(';').map(part=>{const index=part.indexOf('=');return index<0?[]:[part.slice(0,index).trim(),part.slice(index+1).trim()];}).filter(a=>a.length===2));}
function same(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function createConsoleApp({store,origin,oidc=null,demoOperator=null,distDir,intakeSecret=null}){
  const app=express(),demo=Boolean(demoOperator),url=new URL(origin);
  if(demo&&!['127.0.0.1','localhost'].includes(url.hostname))throw Error('Demonstration must remain on loopback.');
  if(!demo&&url.protocol!=='https:')throw Error('The operator console requires HTTPS.');
  const sessionName=demo?'totag_demo_session':'__Host-totag_console',loginName='__Host-totag_login';
  const setCookie=(res,name,value,maxAge)=>res.append('Set-Cookie',`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${demo?'':'; Secure'}`);
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});
    if(req.headers.host?.toLowerCase()!==url.host.toLowerCase())return res.status(421).json({error:'Use the configured TOTAG console address.'});
    next();
  });
  app.post('/api/intake/school-requests',express.raw({type:'application/json',limit:'20kb'}),async(req,res)=>{
    if(!intakeSecret)return res.status(503).json({error:'School request intake is not configured.'});
    if(!verifyIntake(intakeSecret,req.get('X-TOTAG-Timestamp'),req.get('X-TOTAG-Signature'),req.body))return res.status(403).json({error:'Intake verification failed.'});
    let input;try{input=validateSchoolRequest(JSON.parse(req.body.toString('utf8')));}catch{return res.status(400).json({error:'Check the school request fields.'});}
    try{const reference=await store.withClient(c=>receiveSchoolRequest(c,input));res.status(201).json({reference});}
    catch(e){res.status(e instanceof RegistryConflict?409:503).json({error:e instanceof RegistryConflict?e.message:'The request could not be saved. Please retry.'});}
  });
  app.use(express.json({limit:'3mb'}));
  const attempts=new Map();
  app.get('/auth/start',async(req,res)=>{
    if(!oidc)return res.status(503).json({error:'Workforce sign-in is not configured.'});
    const now=Date.now(),key=req.ip;for(const [k,v]of attempts)if(v.until<now)attempts.delete(k);
    const item=attempts.get(key)||{count:0,until:now+900000};if(item.count>=10||attempts.size>10000)return res.status(429).json({error:'Please wait before starting another sign-in.'});item.count++;attempts.set(key,item);
    try{const result=await oidc.begin();setCookie(res,loginName,result.binding,300);return res.redirect(303,result.url);}catch{return res.status(503).json({error:'Workforce sign-in is temporarily unavailable.'});}
  });
  app.get('/auth/callback',async(req,res)=>{
    if(!oidc)return res.status(404).end();
    try{const session=await oidc.callback(req.query.code,req.query.state,cookies(req)[loginName]);setCookie(res,loginName,'',0);setCookie(res,sessionName,session.raw,3600);return res.redirect(303,'/');}
    catch{setCookie(res,loginName,'',0);return res.redirect(303,'/?signIn=failed');}
  });
  app.post('/api/demo-session',async(req,res)=>{
    if(!demo)return res.status(404).end();
    if(req.get('Origin')!==origin)return res.status(403).end();
    const session=await store.createSession(demoOperator,false);setCookie(res,sessionName,session.raw,3600);return res.json({ok:true});
  });
  app.get('/api/status',(_req,res)=>res.json({demo,signInConfigured:Boolean(oidc),schoolRecordAccess:false,sharedHostingEnabled:false}));
  app.use('/api',async(req,res,next)=>{
    try{
      const raw=cookies(req)[sessionName],operator=await store.session(raw);
      if(!operator||(!demo&&!operator.mfa_verified))return res.status(401).json({error:'Sign in with your approved TOTAG operator account.'});
      if(!['GET','HEAD'].includes(req.method)&&(req.get('Origin')!==origin||!same(req.get('X-CSRF-Token'),operator.csrf_token)))return res.status(403).json({error:'Refresh your console session before saving.'});
      req.operator=operator;req.consoleToken=raw;next();
    }catch{res.status(503).json({error:'Operator access is temporarily unavailable.'});}
  });
  const route=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){
    const expected=e instanceof ConsoleAccessError||e instanceof ManifestError||e instanceof RegistryConflict;
    res.status(e instanceof ConsoleAccessError?e.status:e instanceof RegistryConflict?409:expected?400:503).json({error:expected?e.message:'The console action could not be completed. Reload and check the configuration.'});
  }};
  app.get('/api/session',route(async(req,res)=>res.json({operator:{id:req.operator.id,name:req.operator.display_name,accessLevel:req.operator.access_level,mfaVerified:req.operator.mfa_verified},csrfToken:req.operator.csrf_token,expiresAt:req.operator.expires_at,demo})));
  app.post('/api/logout',route(async(req,res)=>{await store.logout(req.consoleToken,req.operator);setCookie(res,sessionName,'',0);res.json({ok:true});}));
  app.get('/api/school-requests',route(async(req,res)=>{
    requireRequestManager(req.operator);res.json({requests:await store.withClient(async c=>(await c.query('SELECT id,reference,request_data,status,revision,institution_id,created_at,updated_at FROM totag_platform.school_requests ORDER BY created_at DESC LIMIT 200')).rows)});
  }));
  app.get('/api/school-requests/:id/history',route(async(req,res)=>{
    requireRequestManager(req.operator);res.json({history:await store.withClient(async c=>(await c.query('SELECT e.status,e.reason,e.revision,e.recorded_at,o.display_name AS operator_name FROM totag_platform.school_request_events e LEFT JOIN totag_platform.operators o ON o.id=e.operator_id WHERE request_id=$1 ORDER BY revision DESC',[req.params.id])).rows)});
  }));
  app.post('/api/school-requests/:id/review',route(async(req,res)=>res.json({request:await store.withClient(c=>reviewSchoolRequest(c,req.params.id,req.operator,req.body))})));
  app.get('/api/institutions',route(async(req,res)=>res.json({institutions:await store.list(req.operator)})));
  app.post('/api/validate',route(async(req,res)=>{
    const manifest=validateInstitutionManifest(req.body.manifest);assertSchoolPalette(manifest.branding);
    res.json({manifest,plan:institutionPlan(manifest)});
  }));
  app.get('/api/institutions/:code/:environment',route(async(req,res)=>{
    await store.withClient(async client=>{const row=await store.scope(client,req.operator,req.params.code,req.params.environment);res.json({institution:row});});
  }));
  app.post('/api/institutions',route(async(req,res)=>{
    const manifest=validateInstitutionManifest(req.body.manifest);assertSchoolPalette(manifest.branding);
    if(req.body.reviewed!==true||typeof req.body.reason!=='string'||req.body.reason.trim().length<10)throw new ManifestError('Review the configuration and provide a change reason of at least 10 characters.');
    const saved=await store.withClient(async client=>{
      if(req.body.expectedRevision===0){if(req.operator.access_level!=='GLOBAL_CONFIGURATOR')throw new ConsoleAccessError('Your account cannot register a new institution.');}
      else await store.scope(client,req.operator,manifest.school.code,manifest.deployment.environment,true);
      if(req.body.sourceRequestId&&req.body.expectedRevision!==0)throw new ManifestError('Prepare a new configuration from this request.');
      return registerInstitution(client,manifest,{expectedRevision:req.body.expectedRevision,operator:req.operator.id,reason:req.body.reason,
        ...(req.body.sourceRequestId?{beforeCommit:(c,saved)=>linkSchoolRequest(c,req.body.sourceRequestId,req.body.sourceRequestRevision,saved,req.operator,req.body.reason)}:{})});
    });res.json({institution:saved,notice:'School configuration saved. No school deployment or access permission was changed.'});
  }));
  app.get('/api/institutions/:code/:environment/history',route(async(req,res)=>{
    await store.withClient(async client=>{const school=await store.scope(client,req.operator,req.params.code,req.params.environment);
      const rows=await client.query(`SELECT h.revision,h.configuration,h.change_reason,h.recorded_at,COALESCE(o.display_name,'Registry operator') AS operator_name FROM totag_platform.configuration_history h
        LEFT JOIN totag_platform.operators o ON o.id::text=h.operator_reference WHERE h.institution_id=$1 ORDER BY h.revision DESC LIMIT 100`,[school.id]);res.json({history:rows.rows});});
  }));
  app.get('/api/institutions/:code/:environment/export',route(async(req,res)=>{
    await store.withClient(async client=>{const school=await store.scope(client,req.operator,req.params.code,req.params.environment);await store.event(client,req.operator,'CONFIGURATION_EXPORTED',school.id,{revision:school.revision});
      res.set('Content-Disposition',`attachment; filename="${school.code}-${school.environment}-institution.json"`).json(school.configuration);});
  }));
  app.post('/api/institutions/:code/:environment/logo',route(async(req,res)=>{
    if(req.body.publicationAuthorized!==true)throw new ManifestError('Confirm school authorization to use this logo.');
    if(typeof req.body.data!=='string'||req.body.data.length>2800000||!/^[A-Za-z0-9+/]+={0,2}$/.test(req.body.data))throw new ManifestError('Choose a school logo up to 2 MB.');
    const bytes=Buffer.from(req.body.data,'base64');if(bytes.toString('base64')!==req.body.data)throw new ManifestError('Choose a valid image.');
    let media;try{media=validateInstitutionLogo(req.body.filename,bytes);}catch{throw new ManifestError('Choose a PNG, WebP or JPG image up to 2 MB.');}
    const checksum=createHash('sha256').update(bytes).digest('hex'),extension=media==='image/jpeg'?'jpg':media.split('/')[1],assetPath='/institution-assets/logo-'+checksum+'.'+extension;
    await store.withClient(async client=>{
      await client.query('BEGIN');try{
        const school=await store.scope(client,req.operator,req.params.code,req.params.environment,true);
        await client.query('INSERT INTO totag_platform.institution_logos(institution_id,asset_path,media_type,file_bytes,checksum,uploaded_by,publication_authorized) VALUES($1,$2,$3,$4,$5,$6,true) ON CONFLICT(institution_id,asset_path) DO NOTHING',[school.id,assetPath,media,bytes,checksum,req.operator.id]);
        await store.event(client,req.operator,'LOGO_UPLOADED',school.id,{checksum,assetPath});await client.query('COMMIT');res.json({assetPath,notice:'Logo stored. Review and save the configuration to select it.'});
      }catch(e){await client.query('ROLLBACK');throw e;}
    });
  }));
  app.get('/api/institutions/:code/:environment/logo',route(async(req,res)=>{
    await store.withClient(async client=>{const school=await store.scope(client,req.operator,req.params.code,req.params.environment);
      const asset=(await client.query('SELECT media_type,file_bytes FROM totag_platform.institution_logos WHERE institution_id=$1 AND asset_path=$2',[school.id,req.query.path||school.configuration.branding.logoPath])).rows[0];
      if(!asset)return res.status(404).json({error:'Upload the school-authorized logo first.'});
      if(req.query.download==='true')res.set('Content-Disposition',`attachment; filename="${path.basename(String(req.query.path||school.configuration.branding.logoPath))}"`);
      res.set('Content-Type',asset.media_type).set('Content-Security-Policy',"default-src 'none'; sandbox").send(Buffer.from(asset.file_bytes));});
  }));
  app.use('/api',(_req,res)=>res.status(404).json({error:'Console route not found.'}));
  if(distDir){app.use(express.static(distDir,{index:false,maxAge:0}));app.get('*',(_req,res)=>res.sendFile(path.join(distDir,'index.html')));}
  app.use((e,_req,res,_next)=>res.status(e?.status===413?413:400).json({error:'Use a valid request within the allowed size.'}));
  return app;
}
