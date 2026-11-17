// panel.js on a fake layout: what each space's panel shows as its tabs come and go, and which repository Review reads.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const saved = {}, ui = { open: false, page: 'panel-empty', wide: false, space: 'a', slots: ['files', 'review', 'panel-empty'], end: 28, buttons: false };
const machines = { a: null, b: null, home: null, far: 'devbox' };
let cwd = {}, repos = {};
const layout = () => ({ id: 'root', children: [{ id: 'work', hidden: ui.wide, children: [{ id: 'window-end', size: { px: ui.end } }] }, { id: 'panel', hidden: !ui.open, children: [{ id: 'panel-body', active: ui.page, children: ui.slots.map(id => ({ id })) }] }] });
const context = vm.createContext({ KEY: { panels: 't3.panels' }, GROUP_GAP: 4, layout, Map, Date, Math, window: () => ({ buttons: ui.buttons }),
  spaces: () => Object.keys(machines).map(id => ({ id, active: id === ui.space, folder: '/space', machine: machines[id], tabs: [{ id: `${id}-tab`, active: true }] })),
  focused: () => cwd[ui.space] ? { space: ui.space, tab: `${ui.space}-tab`, terminal: `${ui.space}-t` } : null,
  panes: () => Object.entries(cwd).map(([s, dir]) => ({ tab: `${s}-tab`, terminal: `${s}-t`, cwd: dir })),
  exec: async (_cmd, args, { cwd: dir }) => { const root = Object.keys(repos).find(r => dir === r || dir.startsWith(r + '/')); return root ? { code: 0, stdout: root + '\n' } : { code: 128, stdout: '' }; },
  shared: k => saved[k], setShared: (k, v) => { saved[k] = v; },
  run: (cmd, a = {}) => { if (cmd === 'layout.select') ui.page = a.child; else if (cmd === 'layout.resize' && a.id === 'window-end') ui.end = a.px; else if (a.id === 'panel') ui.open = cmd === 'layout.show'; else if (a.id === 'work') ui.wide = cmd === 'layout.hide'; },
});
// Each step that shows or hides the panel sizes the tab bar's window part for that state in the same go (t3-tabs draws the
// closed panel's 28 toggle 4 after Details (P3), then the window's buttons 8 on, three of 28; nothing while the panel is open): the frame that
// shows the change has Details and the toggle where they end up. Checked at every step below.
const endFits = () => assert.equal(ui.end, ui.open ? 0 : 4 + 28 + (ui.buttons ? 8 + 3 * 28 : 0), `window-end for a panel ${ui.open ? 'open' : 'closed'}`);
for (const f of ['terminal-context.js', 'surfaces.js', 'panel.js']) vm.runInContext(fs.readFileSync(`${__dirname}/${f}`, 'utf8').replace(/^import [^;]*;\n/gm, '').replace(/^export /gm, ''), context);
const p = vm.runInContext('({ panelState, showPage, openFile, closeSurface, togglePanel, toggleWide, restorePanel, syncPanel, activateSurface, reviewRepo, reviewRequest, reviewShown })', context);
for (const k of ['showPage', 'openFile', 'closeSurface', 'togglePanel', 'toggleWide', 'restorePanel', 'syncPanel', 'activateSurface']) { const f = p[k]; p[k] = (...a) => { const r = f(...a); endFits(); return r; }; }
const tabs = () => p.panelState().tabs.map(t => (t.id === p.panelState().active ? '*' : '') + t.id).join(' ');

(async () => {
  // First open: the empty page, no tabs. Files, two files, the first again: two tabs. Review: its own slot.
  p.togglePanel(); assert.deepEqual([ui.open, ui.page, tabs()], [true, 'panel-empty', '']);
  p.showPage('files'); p.openFile('a.js'); p.openFile('b.js'); p.openFile('a.js');
  assert.deepEqual([ui.page, tabs()], ['files', '*file:a.js file:b.js']);
  p.showPage('review'); assert.deepEqual([ui.page, tabs()], ['review', 'file:a.js file:b.js *review']);
  // Its tab picked again: shown, and revealed again.
  p.activateSurface('file:b.js'); p.activateSurface('file:b.js');
  assert.equal(p.panelState().tabs[1].reveal, 2);
  // Hidden: the tabs stay, wide goes. Closing the last tab puts the panel away; opened again it's empty.
  p.toggleWide(); p.togglePanel(); assert.deepEqual([ui.open, ui.wide], [false, false]);
  p.togglePanel(); assert.deepEqual([ui.open, ui.wide, ui.page, tabs()], [true, false, 'files', 'file:a.js *file:b.js review']);
  p.closeSurface('file:a.js', 'all'); assert.deepEqual([ui.open, tabs()], [false, '']);
  p.togglePanel(); assert.deepEqual([ui.open, ui.page], [true, 'panel-empty']);
  // Each space keeps its own, wide too; a new one starts closed and empty.
  p.showPage('files'); p.openFile('a.js'); p.toggleWide();
  const view = {}; p.syncPanel(view);
  ui.space = 'b'; p.syncPanel(view); p.syncPanel(view); assert.deepEqual([ui.open, ui.wide, tabs()], [false, false, '']);
  ui.space = 'a'; p.syncPanel(view); p.syncPanel(view); assert.deepEqual([ui.open, ui.wide, ui.page, tabs()], [true, true, 'files', '*file:a.js']);
  // Fast there and back, before the layout's clicks land: what shows isn't recorded as a choice.
  ui.space = 'b'; p.syncPanel(view); ui.space = 'a'; p.syncPanel(view); p.syncPanel(view);
  assert.deepEqual([ui.open, ui.wide], [true, true]); assert.equal(saved['t3.panels'].a.wide, true);
  // Home: laid out with the select that shows it, kept while spaces() still lists the old space.
  p.restorePanel(view, 'home'); p.syncPanel(view); assert.equal(ui.open, false); assert.equal(saved['t3.panels'].a.open, true);
  ui.space = 'home'; p.syncPanel(view); ui.space = 'a'; p.syncPanel(view); p.syncPanel(view); assert.deepEqual([ui.open, tabs()], [true, '*file:a.js']);
  // An older build's record: its page isn't a tab; its fields go at the first write.
  saved['t3.panels'].b = { open: true, page: 'review', wide: false, selected: 'x' }; ui.space = 'b';
  assert.equal(tabs(), ''); p.showPage('files'); assert.deepEqual(Object.keys(saved['t3.panels'].b).sort(), ['active', 'open', 'tabs', 'wide']);
  // Review reads where the tab works: the last terminal's repository, though the space's folder is none.
  ui.space = 'a'; repos = { '/work/repo': true }; cwd = { a: '/work/repo/sub' };
  assert.deepEqual({ ...await p.reviewRepo() }, { root: '/work/repo', problem: '' });
  cwd = {}; assert.match((await p.reviewRepo()).problem, /not in a Git repository/);
  repos = { '/space': true }; assert.equal((await p.reviewRepo()).root, '/space', 'no terminal: the space folder');
  assert.match((await p.reviewRepo('far')).problem, /remote/);
  // A request names the Review tab it's for, its number past the last one's.
  ui.space = 'a'; p.showPage('review');
  const born = p.panelState().tabs.find(t => t.id === 'review').born;
  saved.review = { n: Date.now() + 5000 };
  p.reviewRequest('a', '/work/repo', '/worktree', { analyze: true });
  assert.deepEqual({ ...saved.review }, { space: 'a', root: '/work/repo', page: '/worktree', n: saved.review.n, analyze: true, born });
  assert.ok(saved.review.n > Date.now() + 4000);
  // What Review showed counts only while the tab that showed it is there: closed and added again, it's gone.
  saved['review.shown'] = { a: { root: '/work/repo', page: '/worktree', born } };
  assert.equal(p.reviewShown('a')?.page, '/worktree');
  p.closeSurface('review'); p.showPage('review');
  assert.notEqual(p.panelState().tabs.find(t => t.id === 'review').born, born);
  assert.equal(p.reviewShown('a'), null);
  // With the window's own buttons (Windows, Linux) the closed part is wider; open, the panel head has them.
  ui.buttons = true; p.togglePanel(); p.togglePanel(); ui.buttons = false; p.togglePanel(); p.togglePanel();
  // Herdr's own layout docks Review in its stack: a page shown, the panel put away; no tabs kept.
  ui.slots = ['review']; ui.open = false; ui.space = 'b'; const before = JSON.stringify(saved['t3.panels'].b);
  p.showPage('review'); assert.deepEqual([ui.open, ui.page], [true, 'review']);
  p.togglePanel('review'); assert.equal(ui.open, false);
  p.showPage('review'); p.closeSurface(); assert.equal(ui.open, false);
  assert.equal(JSON.stringify(saved['t3.panels'].b), before);
  console.log('ok: each space keeps its panel and tabs, hides, widens and restores; Review reads the tab\'s repository; Herdr\'s own stack');
})().catch(e => { console.error(e); process.exit(1); });
