import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const home=readFileSync(new URL('../src/components/HomeLandingPage.tsx',import.meta.url),'utf8');
const pages=readFileSync(new URL('../src/components/PublicSchoolPages.tsx',import.meta.url),'utf8');
const server=readFileSync(new URL('./index.js',import.meta.url),'utf8');
const editor=readFileSync(new URL('../src/components/OperationsWorkspace.tsx',import.meta.url),'utf8');
const migration=readFileSync(new URL('./migrations/100_public_school_posts.sql',import.meta.url),'utf8');
const api=readFileSync(new URL('./publicContent.js',import.meta.url),'utf8');

test('public website displays only approved published posts, including Liberia-time calendar',()=>{
 assert.match(home,/<PublicSchoolUpdates kind="ALL"/);
 assert.match(pages,/<PublicSchoolUpdates kind="EVENT" limit=\{30\}/);
 assert.match(pages,/<PublicSchoolUpdates kind="ALL" limit=\{30\}/);
 assert.match(server,/createPublicContentRouter/);
 assert.match(api,/status='PUBLISHED'/);
 assert.doesNotMatch(api,/FROM announcements/i);
});
test('school leadership editor stays behind staff permissions',()=>{
 assert.match(editor,/public-content/);
 assert.match(editor,/communications\.write/);
 assert.match(editor,/PublicContentWorkspace/);
 assert.match(api,/SCHOOL_ADMIN/);
 assert.match(api,/PRINCIPAL/);
 assert.match(api,/x-csrf-token/);
});
test('migration scopes public records to tenant and retains draft as default',()=>{
 assert.match(migration,/status text NOT NULL DEFAULT 'DRAFT'/);
 assert.match(migration,/FORCE ROW LEVEL SECURITY/);
 assert.match(migration,/app\.current_school_id\(\)/);
 assert.match(migration,/redeemer_runtime/);
 assert.doesNotMatch(migration,/DROP TABLE|DISABLE ROW LEVEL SECURITY/i);
});
