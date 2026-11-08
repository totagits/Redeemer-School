import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {institutionBuildPlugin,loadSchoolBuild,assertSchoolPalette} from './platform/schoolBuild.js';
import {initializeDedicatedInstitution,createDedicatedSchoolGuard,enforceSchoolSelection,schoolSelectionMatches} from './dedicatedInstitution.js';
import {createInstitutionFixture} from './testing/institutionFixture.js';
import {institutionWebsiteDefaults} from '../shared/institutionDefaults.js';

test('school build includes its own logo, palette and public identity without internal domains/resources or Redeemer assets',async()=>{
  const f=await createInstitutionFixture();
  try{
    const build=loadSchoolBuild(f.manifestPath,f.root),emitted=[];
    assert.equal(build.publicConfig.secondaryColor,'#083344');
    assert.doesNotMatch(JSON.stringify(build.publicConfig),/databaseReference|deployment|staff\.test-tvet|approvalReference/);
    const plugin=institutionBuildPlugin(build);
    plugin.generateBundle.call({emitFile:file=>emitted.push(file)});
    assert.deepEqual(emitted.map(file=>file.fileName).sort(),['institution-build.json','institution-portal.webmanifest','institution-assets/test-school.png','sw.js'].sort());
    const sw=emitted.find(f=>f.fileName==='sw.js').source;
    assert.doesNotMatch(sw,/redeemer/i);assert.match(sw,new RegExp(build.hash.slice(0,16)));
    assert.match(sw,/caches\.open\(CACHE_NAME\)/);
    const html=plugin.transformIndexHtml(await readFile(new URL('../index.html',import.meta.url),'utf8'));
    assert.doesNotMatch(html,/Redeemer|Paynesville|redeemer-seal/);
    assert.match(html,/TEST Technical High School/);
    build.publicConfig.name='TEST <script> & $&';
    assert.match(plugin.transformIndexHtml('<title>old</title><meta property="og:title" content="old" />'),/TEST &lt;script&gt; &amp; \$&amp;/);
    const bad=Buffer.from('<svg onload="alert(1)"></svg>');
    await writeFile(path.join(f.root,'test-school.png'),bad);
    assert.throws(()=>loadSchoolBuild(f.manifestPath,f.root),/extension/);
  }finally{await f.cleanup();}
});

test('school palette rejects unreadable text combinations',()=>{
  assert.doesNotThrow(()=>assertSchoolPalette({primaryColor:'#164E63',secondaryColor:'#083344',accentColor:'#FDE68A'}));
  assert.throws(()=>assertSchoolPalette({primaryColor:'#ffffff',accentColor:'#FDE68A'}),/4.5:1/);
  assert.throws(()=>assertSchoolPalette({primaryColor:'#164E63',secondaryColor:'#eeeeee',accentColor:'#FDE68A'}),/4.5:1/);
  assert.throws(()=>assertSchoolPalette({primaryColor:'#164E63',accentColor:'#020617'}),/4.5:1/);
});

test('configured build binds to the expected school and refuses missing, changed or unsafe runtime configuration',async()=>{
  const f=await createInstitutionFixture(),id='91c0d49e-99d6-43b8-a369-260f0fb84274';
  try{
    const build=loadSchoolBuild(f.manifestPath,f.root),dist=path.join(f.root,'dist');await mkdir(dist);
    await writeFile(path.join(dist,'institution-build.json'),JSON.stringify({buildId:build.hash,schoolCode:build.publicConfig.code}));
    const env={SCHOOL_INSTITUTION_MANIFEST:f.manifestPath,SCHOOL_INSTITUTION_ASSETS_DIR:f.root,APP_PUBLIC_URL:'https://test-tvet.example.invalid'};
    const pool={query:async(sql,args)=>({rows:sql.includes('pg_roles')?[{safe:true}]:[{id:args?.[0]===f.manifest.school.code?id:null}]})};
    const binding=await initializeDedicatedInstitution({env,pool,distDir:dist});assert.equal(binding.id,id);
    await assert.rejects(()=>initializeDedicatedInstitution({env:{},pool,distDir:dist}),/matching institution manifest/);
    await assert.rejects(()=>initializeDedicatedInstitution({env,pool:null,distDir:dist}),/runtime database/);
    await assert.rejects(()=>initializeDedicatedInstitution({env:{...env,APP_PUBLIC_URL:'https://another.example.invalid'},pool,distDir:dist}),/domain list/);
    await assert.rejects(()=>initializeDedicatedInstitution({env,pool:{query:async()=>({rows:[{safe:false}]})},distDir:dist}),/restricted/);
    await assert.rejects(()=>initializeDedicatedInstitution({env,pool:{query:async sql=>({rows:sql.includes('pg_roles')?[{safe:true}]:[]})},distDir:dist}),/absent/);
    f.manifest.school.motto='Changed after build';await writeFile(f.manifestPath,JSON.stringify(f.manifest));
    await assert.rejects(()=>initializeDedicatedInstitution({env,pool,distDir:dist}),/do not match/);
  }finally{await f.cleanup();}
});

test('dedicated host and school selection guard rejects spoofed domains and other-school selectors',()=>{
  const binding={id:'school-one',code:'TEST-ONE',hosts:['one.example.invalid']};
  const invoke=(host,query={},body={},forwarded='')=>{
    const req={headers:{host,'x-forwarded-host':forwarded},path:'/api/public/admissions',query,body};
    const result={status:200,next:false},res={status(n){result.status=n;return this;},json(){return this;}};
    createDedicatedSchoolGuard(binding)(req,res,()=>{result.next=true;});return {req,...result};
  };
  assert.equal(invoke('one.example.invalid:443',{schoolCode:'test-one'}).next,true);
  assert.equal(invoke('other.example.invalid',{}, {},'one.example.invalid').status,421);
  assert.equal(invoke('one.example.invalid',{schoolCode:'TEST-TWO'}).status,403);
  assert.equal(invoke('one.example.invalid',{}, {schoolId:'school-two'}).status,403);
  assert.equal(invoke('one.example.invalid',{schoolCode:['TEST-ONE','TEST-TWO']}).status,403);
  const req=invoke('one.example.invalid').req;req.body={schoolCode:'TEST-TWO'};
  assert.equal(schoolSelectionMatches(req),false);
  let status;enforceSchoolSelection(req,{status(n){status=n;return this;},json(){}},()=>assert.fail('Mismatched body must not reach route.'));assert.equal(status,403);
});

test('new institution content has no inherited Redeemer policies, photos or approved publication',async()=>{
  const f=await createInstitutionFixture();
  try{
    const catalog=JSON.parse(await readFile(new URL('../shared/website-content.json',import.meta.url),'utf8'));
    const defaults=institutionWebsiteDefaults(catalog,f.manifest.school);
    assert.doesNotMatch(JSON.stringify(defaults),/Redeemer|Paynesville|Thinker|0778786116/);
    assert.equal(Object.keys(defaults).length,Object.keys(catalog).length);
    assert.equal(defaults.home.profile.name,f.manifest.school.name);
    assert.ok(Object.values(defaults).every(page=>!page.images.length&&!page.documents.length));
  }finally{await f.cleanup();}
});
