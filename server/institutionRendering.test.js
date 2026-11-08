import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile} from 'node:fs/promises';

// Each Node test file has its own process; configure before importing screens.
const manifest=JSON.parse(await readFile(new URL('../examples/institutions/fictional-tvet-school.json',import.meta.url),'utf8'));
globalThis.__SCHOOL_PUBLIC_CONFIG__={...manifest.school,logoUrl:manifest.branding.logoPath,...manifest.branding,environment:'STAGING'};
const {HomeLandingPage}=await import('../src/components/HomeLandingPage.tsx');
const {PublicSchoolPages,publicSchoolNavigation}=await import('../src/components/PublicSchoolPages.tsx');
const {SignInPage}=await import('../src/components/SignInPage.tsx');
const {Header}=await import('../src/components/Header.tsx');
const {schoolPublicUrl}=await import('../src/data/institution.ts');

test('configured school renders its identity and logo without Redeemer information or public staff-login links',()=>{
  const screens=[React.createElement(HomeLandingPage,{onApply(){},onPortalSignIn(){}}),React.createElement(Header,{currentView:'home',onSelectView(){},lowStockCount:0})];
  for(const group of publicSchoolNavigation)for(const item of group.items)if(!['apply-online','student-portal','guardian-portal'].includes(item.slug))screens.push(React.createElement(PublicSchoolPages,{slug:item.slug,onApply(){},onPortalSignIn(){}}));
  for(const screen of screens){
    const html=renderToStaticMarkup(screen);
    assert.doesNotMatch(html,/Redeemer|RIA Highway|Thinker|Paynesville|0778786116|redeemer-seal|school-photos\//i);
    assert.doesNotMatch(html,/href="\/staff"|Staff sign in/i);
  }
  const html=renderToStaticMarkup(screens[0]);
  assert.match(html,/TEST Technical High School/);assert.match(html,/institution-assets\/test-school.png/);
  assert.match(html,/#164E63/);
});

test('configured sign-in and public API selectors use the matching school code',()=>{
  for(const audience of ['STAFF','PORTAL']){
    const html=renderToStaticMarkup(React.createElement(SignInPage,{audience,onCancel(){},onSignedIn(){}}));
    assert.match(html,/TEST-TVET/);assert.doesNotMatch(html,/Redeemer|0778786116|Paynesville/);
  }
  assert.equal(schoolPublicUrl('/api/public/admissions/options'),'/api/public/admissions/options?schoolCode=TEST-TVET');
  assert.equal(schoolPublicUrl('/api/test?kind=NEWS'),'/api/test?kind=NEWS&schoolCode=TEST-TVET');
});
