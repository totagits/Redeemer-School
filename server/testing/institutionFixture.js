import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {deflateSync} from 'node:zlib';

// Real, small PNG used only for fictional school previews and validation tests.
// No real school logo or private photograph is copied into the fixture.
function chunk(type,data){
  const name=Buffer.from(type),body=Buffer.concat([name,data]);let crc=0xffffffff;
  for(const byte of body){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([size,body,sum]);
}
export function fictionalSchoolLogo(){
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(64,0);ihdr.writeUInt32BE(64,4);ihdr[8]=8;ihdr[9]=2;
  const rows=Buffer.alloc(64*(64*3+1));
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const i=y*(64*3+1)+1+x*3;
    const gold=(x>27&&x<36&&y>12&&y<52)||(y>12&&y<21&&x>12&&x<52);
    rows.set(gold?[253,230,138]:[22,78,99],i);
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
export async function createInstitutionFixture(directory){
  const root=directory||await mkdtemp(path.join(tmpdir(),'totag-institution-'));
  await mkdir(root,{recursive:true});
  const manifest=JSON.parse(await readFile(new URL('../../examples/institutions/fictional-tvet-school.json',import.meta.url),'utf8'));
  manifest.school.founded='2020';
  const manifestPath=path.join(root,'institution.json');
  await writeFile(manifestPath,JSON.stringify(manifest,null,2));await writeFile(path.join(root,'test-school.png'),fictionalSchoolLogo());
  return {root,manifest,manifestPath,cleanup:()=>{
    const resolved=path.resolve(root),temporaryRoot=path.resolve(tmpdir())+path.sep;
    if(directory || !resolved.startsWith(temporaryRoot) || !path.basename(resolved).startsWith('totag-institution-'))throw Error('Refusing to remove a non-temporary fixture directory.');
    return rm(resolved,{recursive:true,force:true});
  }};
}
