import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const landing=readFileSync(new URL('../src/components/HomeLandingPage.tsx',import.meta.url),'utf8');
const header=readFileSync(new URL('../src/components/Header.tsx',import.meta.url),'utf8');
const pages=readFileSync(new URL('../src/components/PublicSchoolPages.tsx',import.meta.url),'utf8');
test('campus photos are checked into deployed public directory and referenced by homepage',()=>{
 for(const file of ['campus-courtyard.svg','campus-exterior.svg']){
  const uri=new URL('../public/school-photos/'+file,import.meta.url);
  assert.ok(existsSync(uri),file);
  const image=readFileSync(uri,'utf8');
  assert.match(image,/data:image\/webp;base64,/);
  assert.ok(landing.includes('/school-photos/'+file));
  assert.ok(pages.includes(file));
 }
});
test('desktop school menus open on hover and click with expanded state and keyboard Escape',()=>{
 assert.match(header,/onMouseEnter=/);
 assert.match(header,/onClick=\{\(\)=>setOpenMenu/);
 assert.match(header,/aria-expanded=/);
 assert.match(header,/event.key==='Escape'/);
 assert.match(header,/transition-transform/);
});
