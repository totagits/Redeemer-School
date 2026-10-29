import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const pages=readFileSync(new URL('../src/components/PublicSchoolPages.tsx',import.meta.url),'utf8');
const header=readFileSync(new URL('../src/components/Header.tsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
test('public site exposes all seven requested reference-site navigation families',()=>{
 for(const category of ['School Info','Enroll','Academics','Student Life','Parents','Contact','Quick Links']){
  assert.ok(pages.includes(`label:'${category}'`),category);
 }
});
test('public navigation preserves both student and guardian portals and school admissions',()=>{
 for(const slug of ['student-portal','guardian-portal','apply-online','school-calendar','photo-albums','principal-message','school-uniform','parent-handbook']){
  assert.ok(pages.includes(`slug:'${slug}'`),slug);
 }
 assert.match(header,/\/apply/);assert.match(header,/\/portal/);
});
test('public menu pages remain distinct from protected staff operations',()=>{
 assert.match(app,/pathname\.startsWith\('\/school\/'\)/);
 assert.match(app,/pathname === '\/staff'/);
 assert.doesNotMatch(pages,/Staff sign in|School Operations ERP|Finance workspace/);
 assert.doesNotMatch(header,/Staff sign in|School Operations ERP|ERP workspace setup in progress/);
});
