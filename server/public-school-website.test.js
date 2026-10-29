import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const landing=readFileSync(new URL('../src/components/HomeLandingPage.tsx',import.meta.url),'utf8');
const header=readFileSync(new URL('../src/components/Header.tsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');

test('public school landing provides academics, admissions, family resources and contact',()=>{
  for(const section of ['id="about"','id="academics"','id="admissions"','id="community"','id="families"','id="contact"']) {
    assert.ok(landing.includes(section),`missing public section ${section}`);
  }
  assert.match(landing,/onPortalSignIn/);
  assert.match(landing,/onApply/);
});
test('public-facing landing and navigation do not expose administrative product marketing or staff links',()=>{
  assert.doesNotMatch(landing,/ERP|Staff sign in|Finance workspace|School operations workspace/i);
  assert.doesNotMatch(header,/School Operations ERP|ERP workspace setup in progress|ERP setup in progress|Staff sign in/i);
  assert.match(header,/Student & guardian portal/);
});
test('internal staff routing still requires sign-in and is not a public navigation control',()=>{
  assert.match(app,/pathname === '\/staff'/);
  assert.match(app,/<SignInPage audience="STAFF"/);
  assert.match(app,/pathname === '\/apply'/);
  assert.match(app,/pathname === '\/portal'/);
});
