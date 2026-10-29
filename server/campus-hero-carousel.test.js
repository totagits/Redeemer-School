import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const carousel=readFileSync(new URL('../src/components/CampusHeroCarousel.tsx',import.meta.url),'utf8');
const landing=readFileSync(new URL('../src/components/HomeLandingPage.tsx',import.meta.url),'utf8');
test('homepage uses a single wide carousel rather than small campus image cards',()=>{
 assert.match(landing,/<CampusHeroCarousel\s*\/>/);
 assert.doesNotMatch(landing,/Our school, our community/);
 assert.match(carousel,/aspect-video w-full/);
 assert.match(carousel,/object-cover object-center/);
});
test('campus carousel has actual photos, navigable slides and motion-safe behavior',()=>{
 assert.ok(carousel.includes('/school-photos/featured/01-students-outdoors.webp'));
 assert.ok(carousel.includes('/school-photos/featured/02-classroom-learning.webp'));
 assert.ok(carousel.includes('/school-photos/featured/03-campus-courtyard.webp'));
 assert.match(carousel,/Previous campus photograph/);
 assert.match(carousel,/Next campus photograph/);
 assert.match(carousel,/aria-current/);
 assert.match(carousel,/prefers-reduced-motion/);
 assert.match(carousel,/ArrowLeft/);
});
