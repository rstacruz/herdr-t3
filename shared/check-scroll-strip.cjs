// scroll-strip.js: where a clipped row of tabs sits, and whether its arrows can move it.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const c = vm.createContext({ settings: () => ({ zoom: 2 }), Math, Number });
vm.runInContext(fs.readFileSync(__dirname + '/scroll-strip.js', 'utf8').replace(/^import [^;]*;\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.api = { stripAt, stripEnds, stripWheel, stripPage };', c);
const { stripAt, stripEnds, stripWheel, stripPage } = c.api, widths = [100, 100, 100, 100, 24], o = { widths, gap: 4, room: 200 };
const ends = (s) => JSON.stringify(stripEnds(s));
// All of it fits: nowhere to go, no arrow enabled.
let s = {}; stripAt(s, { ...o, room: 500 }); assert.equal(ends(s), '{"back":false,"next":false}');
// The active tab comes into view with the least move, once; at the start only `next` works, at the end only `back`.
s = {}; assert.equal(stripAt(s, { ...o, focus: 0, focusKey: 'a' }), 0); assert.equal(ends(s), '{"back":false,"next":true}');
assert.equal(stripAt(s, { ...o, focus: 2, focusKey: 'c' }), 108, 'its right edge at the room\'s');
stripPage(s, 1, 200); stripPage(s, 1, 200); assert.equal(s.at, s.over); assert.equal(ends(s), '{"back":true,"next":false}');
stripPage(s, -1, 200); stripPage(s, -1, 200); stripPage(s, -1, 200); assert.equal(s.at, 0, 'arrows stop at the ends');
// A swipe away isn't pulled back while the active tab and the room stay; an unmeasured row isn't moved yet.
stripWheel(s, { delta: { x: -100, y: 0 } }); assert.equal(stripAt(s, { ...o, focus: 2, focusKey: 'c' }), 50, 'wheel in logical px');
s = {}; assert.equal(stripAt(s, { ...o, focus: 3, focusKey: 'd', ready: false }), 0);
// Held from its end: short of room its end shows, and stays shown as the room changes.
s = {}; assert.equal(stripAt(s, { ...o, fromEnd: true }), s.over); assert.equal(stripAt(s, { ...o, room: 150, fromEnd: true }), s.over);
console.log('ok: a clipped row reveals its active tab, pages and wheels within its ends, and holds from its end');
