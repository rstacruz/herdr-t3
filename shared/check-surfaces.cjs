// surfaces.js: what each step does to a space panel's list, as a table: the list before (ids, `*` the active one), the step, the list after.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const c = vm.createContext({});
vm.runInContext(fs.readFileSync(__dirname + '/surfaces.js', 'utf8').replace(/^export /gm, '') + '\nglobalThis.api = { activate: surfaceActivate, add: surfaceAdd, openFile: surfaceOpenFile, navigateFolder: surfaceNavigate, close: surfaceClose };', c);
const S = c.api;
const id = (w) => w === 'files' || w === 'review' ? w : `file:${w.replace(/\/$/, '')}`;
// "a.js *b.js files src/" → tabs, a trailing / a folder tab.
const parse = (text) => {
  const words = text.split(' ').filter(Boolean), tabs = words.map((w, i) => {
    const bare = w.replace(/^\*/, ''), folder = bare.endsWith('/') && bare !== '/';
    return { id: id(bare), born: i, reveal: 0, ...(id(bare).startsWith('file:') ? { path: bare.replace(/\/$/, '') } : {}), ...(folder ? { folder: true } : {}) };
  });
  return { tabs, active: tabs[words.findIndex(w => w.startsWith('*'))]?.id ?? null };
};
const show = (s) => s.tabs.map(t => (t.id === s.active ? '*' : '') + (t.path ? t.path + (t.folder ? '/' : '') : t.id)).join(' ');

const rows = [
  // + Files / + Review: added at the end, or the one there picked.
  ['', s => S.add(s, 'files', 9), '*files'],
  ['a.js *b.js', s => S.add(s, 'files', 9), 'a.js b.js *files'],
  ['*files review', s => S.add(s, 'review', 9), 'files *review'],
  // A file from the tree: the generic Files' place, or its tab if it has one (the generic Files then goes), else the end.
  ['*files', s => S.openFile(s, 'a.js', 9), '*a.js'],
  ['a.js b.js *files', s => S.openFile(s, 'a.js', 9), '*a.js b.js'],
  ['a.js *files review', s => S.openFile(s, 'c.js', 9), 'a.js *c.js review'],
  ['*a.js review', s => S.openFile(s, 'b.js', 9), 'a.js review *b.js'],
  ['*a.js b.js', s => S.openFile(s, 'b.js', 9), 'a.js *b.js'],
  // A breadcrumb's folder: beside its file, kept; from a folder, in its place; the root is the generic Files.
  ['*src/a.ts', s => S.navigateFolder(s, 'src', 'src/a.ts', true, 9), 'src/a.ts *src/'],
  ['src/a.ts *src/', s => S.navigateFolder(s, '', 'src/a.ts', false, 9), 'src/a.ts *files'],
  ['src/a.ts src/ *src/b.ts', s => S.navigateFolder(s, 'src', 'src/b.ts', true, 9), 'src/a.ts *src/ src/b.ts'],
  ['*src/a.ts files', s => S.navigateFolder(s, 'src', 'src/a.ts', true, 9), 'src/a.ts *src/'],
  // Closing: the active one's right neighbour, else its left; any other keeps the active one; bulk in one step.
  ['*a b c', s => S.close(s, 'file:a'), '*b c'],
  ['a b *c', s => S.close(s, 'file:c'), 'a *b'],
  ['a *b c', s => S.close(s, 'file:a'), '*b c'],
  ['*a', s => S.close(s, 'file:a'), ''],
  ['a *b c d', s => S.close(s, 'file:c', 'others'), '*c'],
  ['a b *c d', s => S.close(s, 'file:b', 'right'), 'a *b'],
  ['a *b c', s => S.close(s, 'file:b', 'right'), 'a *b'],
  ['a *b c', s => S.close(s, 'file:a', 'all'), ''],
  ['*a', s => S.close(s, 'file:gone'), '*a'],
];
for (const [before, step, after] of rows) assert.equal(show(step(parse(before))), after, `${before} → ${after}`);

// Picking reveals again, each time, the tab already active too; opening a file from the tree doesn't.
let s = parse('*a.js b.js');
s = S.activate(s, 'file:a.js'); s = S.activate(s, 'file:a.js');
assert.equal(s.tabs[0].reveal, 2);
assert.equal(S.openFile(s, 'a.js', 9).tabs[0].reveal, 2, 'the tree opening a file is not a reveal');
// Born names an instance: a tab kept keeps it, a new one takes the one given, a folder that turns into a file keeps its tab.
assert.equal(S.openFile(parse('*a.js'), 'a.js', 9).tabs[0].born, 0);
assert.equal(S.add(parse('a.js'), 'review', 9).tabs[1].born, 9);
assert.equal(JSON.stringify(S.openFile(parse('*x/'), 'x', 9).tabs[0]), JSON.stringify({ id: 'file:x', path: 'x', born: 0, reveal: 0 }));
// The folder's tab knows the file its crumbs came from.
assert.equal(S.navigateFolder(parse('*src/a.ts'), 'src', 'src/a.ts', true, 9).tabs[1].trail, 'src/a.ts');
assert.equal(S.navigateFolder(parse('*src/a.ts'), '', 'src/a.ts', true, 9).tabs[1].trail, 'src/a.ts', 'the root keeps it too');
console.log('ok: surfaces add, open, replace the generic Files, follow breadcrumbs, reveal and close as T3');
