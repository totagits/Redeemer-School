import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const header=readFileSync(new URL('../src/components/Header.tsx',import.meta.url),'utf8');
const landing=readFileSync(new URL('../src/components/HomeLandingPage.tsx',import.meta.url),'utf8');
test('selected menu and dropdown use Redeemer navy with white labels and hovered white submenu',()=>{
 assert.match(header,/border-\[#071d3e\] bg-\[#071d3e\] text-white/);
 assert.match(header,/border-\[#071d3e\] bg-\[#071d3e\] p-5/);
 assert.match(header,/text-sm font-semibold text-white transition-all duration-150 hover:bg-white hover:text-\[#071d3e\]/);
 assert.match(header,/bg-\[#071d3e\] p-2 sm:grid-cols-2/);
});
test('hero uses a restrained editorial campus composition without fake blurry background',()=>{
 assert.doesNotMatch(landing,/blur-xl|opacity-65/);
 assert.match(landing,/school-photos\/campus-exterior.svg/);
 assert.match(landing,/school-photos\/campus-courtyard.svg/);
 assert.match(landing,/max-w-\[206px\]/);
});
