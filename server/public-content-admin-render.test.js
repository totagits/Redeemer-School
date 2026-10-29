import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/components/OperationsWorkspace.tsx', import.meta.url), 'utf8');
test('school admin non-overview render path includes public publishing editor',()=>{
 assert.match(source,/\{activeWorkspace === 'public-content' && <PublicContentWorkspace csrfToken=\{csrfToken\} \/>\}/);
});
test('school website editor is excluded from generic unfinished workflow placeholder',()=>{
 assert.match(source,/'communications', 'public-content', 'accounts'\]\.includes\(activeWorkspace\)/);
});
test('publishing editor retains authorization checks in workspace menu',()=>{
 assert.match(source,/workspace === 'public-content'/);
 assert.match(source,/communications\.write/);
 assert.match(source,/SCHOOL_ADMIN/);
});
