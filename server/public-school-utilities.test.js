import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const utilities=readFileSync(new URL('../src/components/SchoolPublicUtilities.tsx',import.meta.url),'utf8');
const pages=readFileSync(new URL('../src/components/PublicSchoolPages.tsx',import.meta.url),'utf8');
const home=readFileSync(new URL('../src/components/HomeLandingPage.tsx',import.meta.url),'utf8');
test('public admissions guide reads only the existing approved admissions options API',()=>{
 assert.match(utilities,/\/api\/public\/admissions\/options\?schoolCode=RIA/);
 assert.match(utilities,/no-store/);
 assert.match(utilities,/classes\.map/);
 assert.match(utilities,/Listing a class does not guarantee available seats/);
 assert.doesNotMatch(utilities,/SELECT \* FROM student|\/api\/operations\//);
});
test('family FAQ offers search, topic filtering and secure portal deep links',()=>{
 assert.match(utilities,/SchoolFAQ/);
 assert.match(utilities,/type="search"/);
 assert.match(utilities,/All topics/);
 assert.match(utilities,/url:'\/portal'/);
 assert.match(utilities,/Do not send a payment to an unverified number/);
});
test('public school pages and homepage expose the new services',()=>{
 assert.match(pages,/<LiveAdmissionsGuide onApply=\{onApply\}/);
 assert.match(pages,/<SchoolFAQ\s*\/>/);
 assert.match(pages,/<PublicSchoolSupport\s*\/>/);
 assert.match(home,/<SchoolFAQ compact\s*\/>/);
});
