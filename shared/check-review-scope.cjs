// node shared/check-review-scope.cjs: the scope menu's reads, rows, picks and keys, as the Review page and Details share them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const kit = require('./check-kit.js');
function load(env) {
  const context = vm.createContext(env);
  vm.runInContext(kit.bundle(name => fs.readFileSync(path.join(__dirname, name), 'utf8'), 'review-scope.js', name => name === 'button.js' ? '' : null) + '\nglobalThis.api = {openScope,releaseScope,scopeRows,scopeList,pickScopeRow,pickListed,menuKey,commitsKey};', context);
  return context.api;
}
const state = new Map(), reads = [], pending = [];
const cx = { notify() {}, stop_propagation() {}, spawn(fn) { return fn(cx); }, timer: { after() { return { cancel() {} }; } } };
let blocked = false, slow = false, ab = '+2 -0';
const held = [];
const exec = async (_cmd, args, opts) => {
  reads.push([opts.cwd, args]);
  if (blocked && args.includes('--show-toplevel')) return new Promise(resolve => pending.push(resolve));
  if (args.includes('--show-toplevel')) return {code:0,stdout:opts.cwd+'\n'};
  if (args.includes('status')) { const out = {code:0,stdout:`# branch.head fix\n# branch.upstream origin/fix\n# branch.ab ${ab}\n`}; return slow ? new Promise(r => held.push(() => r(out))) : out; }
  if (args.includes('symbolic-ref')) return {code:0,stdout:'origin/main\n'};
  if (args.includes('--left-right')) return {code:0,stdout:'0\t3\n'};
  if (args.includes('log')) return {code:0,stdout:'abc123\x1ffix: scope\x1f1\x1fA\n'};
  if (args.includes('refs/remotes')) return {code:0,stdout:'refs/heads/main\nrefs/remotes/origin/main\n'};
  return {code:0,stdout:''};
};
const input = () => ({text:'',value(){return this.text;},set_value(v){this.text=v;},focus(){}});
const picked = [];
const view = (root='/repo', page='/branch/fix') => ({root,space:'s',page,width:736,height:500,scopeSearch:input(),
  closePopup(){this.closed=true; api.releaseScope(this);},
  pick(page,opts){picked.push({page,...opts});},
  openCommits(cx,lit){this.commits=lit;}});
const element = kit.elements();
const api = load({exec,shared:k=>state.get(k),setShared:(k,v)=>state.set(k,v),settings:()=>({zoom:1}),
  div:element,h_flex:element,v_flex:element,svg:element,Input:{new:element},drawButton:element,ghostButton:element,DISABLED:0.64});
const flush = async () => { for(let i=0;i<50;i++) await Promise.resolve(); };

(async () => {
  // Each opening reads afresh: a commit made since the last opening shows in the counts.
  const v = view();
  api.openScope(v,cx); await flush();
  const first = reads.length;
  api.openScope(v,cx); await flush();
  assert.ok(reads.length > first, 'reopening reads again');
  assert.equal(v.scopeAt, -1, 'nothing lit on opening');

  // A read for a menu since closed, or for another base, never lands.
  blocked = true;
  const closed = view('/closed'); api.openScope(closed,cx); await flush();
  closed.closePopup();
  const moved = view('/moved'); api.openScope(moved,cx); await flush();
  state.set('review.bases',{s:'origin/dev'});
  blocked = false;
  pending.splice(0).forEach((resolve,i)=>resolve({code:0,stdout:['/closed','/moved'][i]+'\n'})); await flush();
  assert.equal(closed.scopeGit, undefined, 'closed: dropped');
  assert.equal(moved.scopeGit, undefined, 'base changed meanwhile: dropped');
  state.delete('review.bases');

  // Rows: each count a number and its unit; only the range shown checked; an empty range greyed unless it's the one shown.
  const rows = api.scopeRows(v);
  assert.deepEqual([...rows.map(r => r.detail)], ['3 commits','0 files','2 commits','0 commits',undefined]);
  assert.deepEqual([...rows.map(r => Boolean(r.on))], [true,false,false,false,false]);
  const shownEmpty = view('/repo','/worktree'); api.openScope(shownEmpty,cx); await flush();
  const uncommitted = api.scopeRows(shownEmpty).find(r => r.id === 'scope-uncommitted');
  assert.ok(uncommitted.on && !uncommitted.count, 'the range shown at nothing');
  api.pickScopeRow(shownEmpty, uncommitted, cx);
  assert.equal(picked.pop().page, '/worktree', 'the range shown stays pickable at nothing');
  api.pickScopeRow(v, api.scopeRows(v).find(r => r.id === 'scope-uncommitted'), cx);
  assert.equal(picked.length, 0, 'another empty range picks nothing');
  const none = view('/repo', null); api.openScope(none,cx); await flush();
  assert.ok(api.scopeRows(none).every(r => !r.on), 'no review shown yet: nothing checked');

  // A radio asks for its range, analyzed; Commits opens where the view puts it; a commit keeps its branch's Changes as base.
  api.pickScopeRow(v, rows[0], cx);
  assert.deepEqual(JSON.parse(JSON.stringify(picked.pop())), {page:'/branch/fix',analyze:true});
  api.pickScopeRow(v, rows.at(-1), cx, 0);
  assert.equal(v.commits, 0, 'Commits opens where the view puts it, its first row lit');
  api.pickListed(v, api.scopeList(v)[0], cx);
  assert.deepEqual(JSON.parse(JSON.stringify(picked.pop())), {page:'/commit/abc123',base:'/branch/fix'});

  // The menu's keys: ↓ from nothing lights the first row; → on Commits opens it; Escape closes the menu.
  const k = view(); api.openScope(k,cx); await flush();
  api.menuKey(k,{key:'down'},cx); assert.equal(k.scopeAt,0);
  k.scopeAt = api.scopeRows(k).length - 1;
  api.menuKey(k,{key:'right'},cx); assert.equal(k.commits,0);
  api.menuKey(k,{keystroke:'escape'},cx); assert.ok(k.closed);
  // Commits' keys: ↓ moves in its list; ← with the search empty, or Escape, goes back; ← in a search is the caret's.
  let back = 0; const goBack = () => back++;
  k.scopeListAt = -1; api.commitsKey(k,{key:'down'},cx,goBack); assert.equal(k.scopeListAt,0);
  api.commitsKey(k,{key:'left'},cx,goBack); assert.equal(back,1);
  k.scopeSearch.set_value('fix'); api.commitsKey(k,{key:'left'},cx,goBack); assert.equal(back,1);
  api.commitsKey(k,{keystroke:'escape'},cx,goBack); assert.equal(back,2);
  // A new menu on a repository and base read before (Details opens a new popup each time) draws that read at once and reads
  // afresh behind it; the fresh read replaces it. The keys work on it meanwhile.
  slow = true;
  const again = view(); api.openScope(again,cx); await flush();
  assert.deepEqual([...api.scopeRows(again).map(r => r.detail)], ['3 commits','0 files','2 commits','0 commits',undefined], 'the last read, at once');
  api.menuKey(again,{key:'down'},cx); assert.equal(again.scopeAt,0, 'its keys work on it');
  // A pick on a row drawn from the last read waits for the fresh one and goes if that row can still be picked there.
  api.pickScopeRow(again, api.scopeRows(again).find(r => r.id === 'scope-push'), cx);
  assert.equal(picked.length, 0, 'it waits for the fresh read');
  held.splice(0).forEach(go => go()); await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(picked.pop())), {page:'/compare/origin/fix...fix',analyze:true}, 'still pickable: it goes');
  // Nothing left to push by then: it doesn't.
  ab = '+0 -0';
  const later = view(); api.openScope(later,cx); await flush();
  assert.equal(api.scopeRows(later).find(r => r.id === 'scope-push').detail, '2 commits', 'drawn from the last read');
  api.pickScopeRow(later, api.scopeRows(later).find(r => r.id === 'scope-push'), cx);
  held.splice(0).forEach(go => go()); await flush();
  assert.equal(picked.length, 0, 'empty in the fresh read: nothing asked');
  assert.equal(api.scopeRows(later).find(r => r.id === 'scope-push').detail, '0 commits', 'and the fresh count shows');
  ab = '+2 -0';
  // Another base has no read yet: the rows' names, their counts blank and not greyed as empty; past 150ms, `…` in their place.
  state.set('review.bases',{s:'origin/dev'});
  const timers = [], timed = {...cx, timer: { after(ms, fn) { timers.push({ms, fn}); return { cancel() {} }; } }};
  const fresh = view(); api.openScope(fresh,timed); await flush();
  assert.deepEqual([...api.scopeRows(fresh).map(r => r.detail)], ['','',undefined], 'no read for this base: the rows needing none, blank');
  assert.ok(api.scopeRows(fresh).every(r => r.count === undefined), 'unknown, not empty');
  assert.equal(timers[0].ms, 150);
  timers[0].fn(timed);
  assert.deepEqual([...api.scopeRows(fresh).map(r => r.detail)].slice(0, 2), ['…','…'], 'still reading past 150ms');
  held.splice(0).forEach(go => go()); await flush();
  assert.ok(api.scopeRows(fresh)[1].detail.endsWith('files'), 'the read lands');
  state.delete('review.bases'); slow = false;
  console.log('ok: scope reads afresh and drops late reads; rows count in units, check only the range shown; picks go through the view');
})().catch(error => { console.error(error); process.exit(1); });
