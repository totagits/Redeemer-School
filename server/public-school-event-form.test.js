import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../src/components/PublicContentWorkspace.tsx',import.meta.url),'utf8');
test('events use clear separate date hour and minute controls rather than native clock picker',()=>{
 assert.match(ui,/type="date" name="eventDate"/);
 assert.match(ui,/name="eventHour"/);
 assert.match(ui,/name="eventMinute"/);
 assert.doesNotMatch(ui,/type="datetime-local"/);
 assert.match(ui,/kind==='EVENT'&&<fieldset/);
});
test('event date timestamp is assembled for existing API, and news has null event date',()=>{
 assert.match(ui,/kind==='EVENT'\?String\(data\.get\('eventDate'\)/);
 assert.match(ui,/eventStartsAt\}/);
 assert.match(ui,/setKind\('NEWS'\)/);
});
test('expired authentication is clearly explained without discarding unsaved fields',()=>{
 assert.match(ui,/response\.status===401/);
 assert.match(ui,/Copy your unsaved text/);
 assert.match(ui,/Return to staff sign-in/);
});
