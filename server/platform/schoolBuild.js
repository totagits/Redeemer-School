import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateInstitutionManifest} from './institutionManifest.js';

export function loadSchoolBuild(manifestPath,assetsDirectory) {
  if(!manifestPath)return null;
  if(!assetsDirectory)throw Error('SCHOOL_INSTITUTION_ASSETS_DIR is required with a school manifest.');
  const bytes=readFileSync(manifestPath);
  if(bytes.length>300000)throw Error('School manifest exceeds its size limit.');
  const manifest=validateInstitutionManifest(JSON.parse(bytes.toString('utf8')));
  assertSchoolPalette(manifest.branding);
  const filename=path.basename(manifest.branding.logoPath),logo=readFileSync(path.join(assetsDirectory,filename));
  if(logo.length<24||logo.length>2*1024*1024)throw Error('School logo must be a PNG, WebP or JPEG up to 2 MB.');
  const extension=path.extname(filename).toLowerCase();
  const valid=extension==='.png'?logo.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    :extension==='.webp'?logo.toString('ascii',0,4)==='RIFF'&&logo.toString('ascii',8,12)==='WEBP'
    :['.jpg'].includes(extension)&&logo[0]===255&&logo[1]===216&&logo[logo.length-2]===255&&logo[logo.length-1]===217;
  if(!valid)throw Error('Logo file content does not match its image extension.');
  const hash=createHash('sha256').update(JSON.stringify(manifest)).update(logo).digest('hex');
  // Deliberate allowlist: no staff domains, resource references, approvals,
  // credentials or internal academic configuration goes into the browser.
  const publicConfig={...manifest.school,logoUrl:manifest.branding.logoPath,primaryColor:manifest.branding.primaryColor,
    secondaryColor:manifest.branding.secondaryColor||manifest.branding.primaryColor,
    accentColor:manifest.branding.accentColor,environment:manifest.deployment.environment,buildId:hash};
  return {manifest,logo,publicConfig,hash};
}

function luminance(hex){const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
export function assertSchoolPalette(branding){
  if(contrast(branding.primaryColor,'#ffffff')<4.5||contrast(branding.secondaryColor||branding.primaryColor,'#ffffff')<4.5)throw Error('Primary and secondary colours need at least 4.5:1 contrast with white text.');
  if(contrast(branding.accentColor,'#020617')<4.5)throw Error('Accent colour needs at least 4.5:1 contrast with dark text.');
  if(contrast(branding.accentColor,branding.primaryColor)<4.5)throw Error('Accent and primary colours need at least 4.5:1 contrast for selected navigation.');
}

function html(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function institutionBuildPlugin(build) {
  return {
    name:'totag-institution-build',
    transformIndexHtml(source){
      if(!build)return source;
      const p=build.publicConfig,name=html(p.name),description=html(`School information, admissions and family resources for ${p.name}.`);
      return source.replace(/<title>.*?<\/title>/,()=>`<title>${name}</title>`)
        .replace(/(<meta (?:name="description"|property="og:description") content=")[^"]*("\s*\/?>)/g,(_match,start,end)=>start+description+end)
        .replace(/(<meta property="og:title" content=")[^"]*("\s*\/?>)/,(_match,start,end)=>start+name+end)
        .replaceAll('/redeemer-seal.svg?v=2',p.logoUrl).replace('type="image/svg+xml"','type="image/'+(p.logoUrl.endsWith('.jpg')?'jpeg':p.logoUrl.split('.').at(-1))+'"')
        .replace('/redeemer-portal.webmanifest','/institution-portal.webmanifest')
        .replace('content="#071b33"',`content="${p.primaryColor}"`);
    },
    generateBundle(){
      this.emitFile({type:'asset',fileName:'institution-build.json',source:JSON.stringify({buildId:build?.hash||null,schoolCode:build?.publicConfig.code||'RIA'})});
      if(!build)return;
      const p=build.publicConfig;
      this.emitFile({type:'asset',fileName:p.logoUrl.slice(1),source:build.logo});
      this.emitFile({type:'asset',fileName:'institution-portal.webmanifest',source:JSON.stringify({id:'/portal',name:`${p.name} — Student & Family Portal`,short_name:p.code+' Portal',start_url:'/portal',scope:'/',display:'standalone',background_color:'#f8fafc',theme_color:p.primaryColor,icons:[{src:p.logoUrl,sizes:'any',type:'image/'+(p.logoUrl.endsWith('.jpg')?'jpeg':p.logoUrl.split('.').at(-1)),purpose:'any'}]})});
      const sw=readFileSync(new URL('../../public/sw.js',import.meta.url),'utf8')
        .replaceAll('redeemer-family-portal-',`institution-${p.code.toLowerCase()}-`)
        .replace("const CACHE_NAME = 'institution-"+p.code.toLowerCase()+"-v3';",`const CACHE_NAME = 'institution-${p.code.toLowerCase()}-${build.hash.slice(0,16)}';`)
        .replace('/redeemer-portal.webmanifest','/institution-portal.webmanifest').replaceAll('/redeemer-seal.svg?v=2',p.logoUrl)
        .replaceAll("'/redeemer-seal.svg'",JSON.stringify(p.logoUrl)).replaceAll("'Redeemer School'",JSON.stringify(p.name))
        .replaceAll('redeemer-school-update','institution-'+p.code.toLowerCase()+'-update');
      this.emitFile({type:'asset',fileName:'sw.js',source:sw});
    }
  };
}
