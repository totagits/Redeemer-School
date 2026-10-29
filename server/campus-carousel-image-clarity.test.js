import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const carousel=readFileSync(new URL('../src/components/CampusHeroCarousel.tsx',import.meta.url),'utf8');
const updates=readFileSync(new URL('../src/components/PublicSchoolUpdates.tsx',import.meta.url),'utf8');
test('campus carousel has no full-image navy screen or filter',()=>{
 assert.doesNotMatch(carousel,/bg-gradient-to-t/);
 assert.doesNotMatch(carousel,/from-\[#071d3e\]\/95/);
 assert.doesNotMatch(carousel,/filter:contrast/);
 assert.match(carousel,/object-cover object-center/);
 assert.match(carousel,/border-t border-white\/15 bg-\[#071d3e\]/);
});
test('news and event featured photos remain unfiltered',()=>{
 assert.match(updates,/post.has_featured_image/);
 assert.match(updates,/aspect-video w-full object-cover/);
 assert.doesNotMatch(updates,/backdrop-blur|brightness\(|filter:brightness/);
});
