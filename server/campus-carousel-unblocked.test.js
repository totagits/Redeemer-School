import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const carousel=readFileSync(new URL('../src/components/CampusHeroCarousel.tsx',import.meta.url),'utf8');
test('homepage carousel captions are outside the image and no overlay blocks subjects',()=>{
 assert.match(carousel,/border-t border-white\/15 bg-\[#071d3e\]/);
 assert.match(carousel,/slides\[index\]\.title/);
 assert.doesNotMatch(carousel,/absolute inset-x-0 bottom-0 px-4 pb-14/);
 assert.doesNotMatch(carousel,/backdrop-blur-\[2px\]/);
});
test('images remain unclipped by effects and controls are keyboard accessible',()=>{
 assert.match(carousel,/object-cover object-center/);
 assert.match(carousel,/aria-label="Previous campus photograph"/);
 assert.match(carousel,/aria-label="Next campus photograph"/);
});
