import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/components/CampusHeroCarousel.tsx',import.meta.url),'utf8');
test('carousel shows caption and controls in a single responsive footer outside the photograph',()=>{
 assert.match(source,/flex flex-col gap-3 border-t border-white\/15 bg-\[#071d3e\]/);
 assert.match(source,/sm:flex-row sm:items-center sm:justify-between/);
 assert.match(source,/text-sm font-bold leading-snug/);
 assert.doesNotMatch(source,/absolute inset-x-0 bottom-0 z-20/);
 assert.ok(source.indexOf('aria-live="polite"')<source.indexOf('aria-label="Choose a campus photograph"'));
});
