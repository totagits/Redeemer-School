import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const header=readFileSync(new URL('../src/components/Header.tsx',import.meta.url),'utf8');
const landing=readFileSync(new URL('../src/components/HomeLandingPage.tsx',import.meta.url),'utf8');
test('selected main menu and submenu background use Redeemer blue with white labels',()=>{
 assert.match(header,/border-blue-900 bg-blue-800 text-white/);
 assert.match(header,/border-blue-950 bg-blue-800 p-5/);
 assert.match(header,/text-sm font-semibold text-white transition-all duration-150 hover:bg-white hover:text-blue-900/);
 assert.match(header,/bg-blue-800 p-2 sm:grid-cols-2/);
});
test('campus photographs have no artificial background blur or fade',()=>{
 assert.doesNotMatch(landing,/blur-xl|opacity-65/);
 assert.match(landing,/school-photos\/campus-exterior.svg/);
 assert.match(landing,/w-52 max-w-full/);
});
