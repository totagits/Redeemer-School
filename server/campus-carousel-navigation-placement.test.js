import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/components/CampusHeroCarousel.tsx',import.meta.url),'utf8');
test('carousel uses separate image, caption and navigation regions without overlay',()=>{
 const image=source.indexOf('relative aspect-video w-full');
 const caption=source.indexOf('aria-live="polite"');
 const navigation=source.indexOf('aria-label="Choose a campus photograph"');
 assert.ok(image>=0&&caption>image&&navigation>caption);
 assert.doesNotMatch(source,/absolute inset-x-0 bottom-0 z-20/);
 assert.doesNotMatch(source,/bg-gradient-to-t/);
});
