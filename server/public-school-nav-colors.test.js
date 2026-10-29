import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const header=readFileSync(new URL('../src/components/Header.tsx',import.meta.url),'utf8');
const landing=readFileSync(new URL('../src/components/HomeLandingPage.tsx',import.meta.url),'utf8');
test('selected navigation and dropdown match admission yellow with white-on-navy submenu hover',()=>{
 assert.match(landing,/bg-amber-400 px-5 py-3/);
 assert.match(header,/border-amber-400 bg-amber-400 text-\[#071d3e\]/);
 assert.match(header,/border-t-4 border-amber-400 bg-amber-400 p-5/);
 assert.match(header,/text-sm font-semibold text-\[#071d3e\] transition-all duration-150 hover:bg-\[#071d3e\] hover:text-white/);
 assert.match(header,/bg-amber-400 p-2 sm:grid-cols-2/);
 assert.match(header,/group-open:bg-amber-400 group-open:text-\[#071d3e\]/);
});
test('hero uses a restrained editorial campus composition without fake blurry background',()=>{
 assert.doesNotMatch(landing,/blur-xl|opacity-65/);
 assert.match(landing,/school-photos\/featured\/03-campus-courtyard.webp/);
 assert.match(landing,/school-photos\/featured\/02-classroom-learning.webp/);
 assert.match(landing,/<CampusHeroCarousel/);
});
