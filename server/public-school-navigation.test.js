import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PublicSchoolPages,publicSchoolNavigation} from '../src/components/PublicSchoolPages.tsx';
import {Header} from '../src/components/Header.tsx';
import {isOperationsPath} from '../src/logic/publicSchoolRoutes.ts';
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
 const html=renderToStaticMarkup(React.createElement(PublicSchoolPages,{slug:'news-events',onApply(){},onPortalSignIn(){}}));
 assert.match(html,/href="\/apply"[^>]*>Apply Online/);
 assert.match(html,/href="\/portal"[^>]*>Student Portal/);
 assert.match(html,/href="\/portal"[^>]*>Guardian Portal/);
 assert.doesNotMatch(html,/href="\/school\/(apply-online|student-portal|guardian-portal)"/);
 assert.match(header,/schoolNavigationHref\(item.slug\)/);
});

test('only staff and family workspace routes select authenticated operations',()=>{
 for(const route of ['/staff','/portal'])assert.equal(isOperationsPath(route),true);
 for(const route of ['/','/apply','/school/news-events','/school/about-us','/examination','/examination/results','/set-password','/reset-password'])assert.equal(isOperationsPath(route),false,route);
 assert.match(app,/authAccount && isOperationsPath\(pathname\)/);
});

test('desktop and mobile menus render canonical destinations for every submenu',()=>{
 const html=renderToStaticMarkup(React.createElement(Header,{currentView:'home',lowStockCount:0,onSelectView(){},onSignIn(){},onPortalSignIn(){}}));
 const links=Array.from(html.matchAll(/<a\b[^>]*href="([^"]+)"/g),match=>match[1]);
 assert.equal(publicSchoolNavigation.flatMap(group=>group.items).length,37);
 for(const item of publicSchoolNavigation.flatMap(group=>group.items)){
  const expected=item.slug==='apply-online'?'/apply':['student-portal','guardian-portal'].includes(item.slug)?'/portal':'/school/'+item.slug;
  assert.ok(links.filter(link=>link===expected).length>=2,item.label+' must be reachable in desktop and mobile menus');
 }
 assert.ok(!links.some(link=>/^\/school\/(apply-online|student-portal|guardian-portal)$/.test(link)));
});
test('public menu pages remain distinct from protected staff operations',()=>{
 assert.match(app,/pathname\.startsWith\('\/school\/'\)/);
 assert.match(app,/pathname === '\/staff'/);
 assert.doesNotMatch(pages,/Staff sign in|School Operations ERP|Finance workspace/);
 assert.doesNotMatch(header,/Staff sign in|School Operations ERP|ERP workspace setup in progress/);
});
