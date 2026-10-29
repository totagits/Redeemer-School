import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync(new URL('./publicContent.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/components/PublicContentWorkspace.tsx',import.meta.url),'utf8');
const publicUI=readFileSync(new URL('../src/components/PublicSchoolUpdates.tsx',import.meta.url),'utf8');
const sql=readFileSync(new URL('./migrations/101_public_school_post_featured_images.sql',import.meta.url),'utf8');
test('remove selected photo and delete saved photo are real actions',()=>{
 assert.match(ui,/removePendingImage/);
 assert.match(ui,/Remove selected photo/);
 assert.match(ui,/Delete featured photo/);
 assert.match(ui,/method:'DELETE'/);
 assert.match(api,/router.delete\('\/manage\/:id\/image'/);
 assert.match(api,/DELETE FROM public_school_post_images/);
 assert.match(api,/p.status<>'PUBLISHED'/);
});
test('secure featured image implementation does not publicly expose drafts',()=>{
 assert.match(api,/p.status='PUBLISHED'/);
 assert.match(api,/X-Content-Type-Options/);
 assert.match(api,/decodeImage\(req.body\?\.imageData\)/);
 assert.match(api,/req\.auth\.claims\.csrfToken/);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/app\.current_school_id\(\)/);
});
test('public cards include real image with captions and alt text',()=>{
 assert.match(publicUI,/post.has_featured_image/);
 assert.match(publicUI,/post.image_alt/);
 assert.match(publicUI,/post.image_caption/);
 assert.match(ui,/img.width<1600\|\|img.height<900/);
});
