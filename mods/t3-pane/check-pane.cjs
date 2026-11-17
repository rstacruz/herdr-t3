const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const kit = require("./check-kit.js");
const element = kit.elements(), { find } = kit;

function texts(node, out = []) {
  if (typeof node === "string") out.push(node);
  else if (node && typeof node === "object") for (const child of node.items) texts(child, out);
  return out;
}

const calls = [], images = [];
const program = { name: "Pi", key: "pi", agent: true };
const pane = { pane: "p2", terminal: "t2", tab: "b", title: "pi", cwd: "/home/me/project", program, status: "working" };
const review = { pane: "p4", terminal: null, mod: "review-pane", tab: "b", title: "review-pane", cwd: null };
let sharedValues = {};
const shell = { pane: "p3", terminal: "t3", tab: "b", title: "me@mac: ~/project", cwd: "/home/me/project", program: { name: "zsh", key: "shell", shell: true }, status: null };
let terms = [{ address: "t2", labels: {} }, { address: "t3", labels: {} }];
let tab = { id: "b", name: "Release", named: true };
let agentList = [];
let sidebar = { id: "root", children: [{ id: "sidebar-lists", active: "lists" }] };
let props = { pane: "p2" };
let pointer = { x: 50, y: 10 };
const env = {
  View: class {}, div: element, svg: (src) => { const el = element(); el.svg = src; return el; }, image: (src) => { images.push(src); return element(); }, h_flex: element, v_flex: element, Popup: { new: (id, trigger) => element().id(id).child(trigger) }, keys: () => [],
  theme: () => ({ selected: "#123456" }), props: () => props, panes: () => [pane, shell, review], shared: (k) => sharedValues[k] ?? null, home: () => "/home/me",
  // A new list each call, as Herdr gives (tree.js indexes each list once).
  terminals: () => [...terms], agents: () => agentList, spaces: () => [{ id: "s1", name: "project", tabs: [tab] }], layout: () => sidebar,
  run: (name, args) => calls.push([name, args]), openOverlay: (o) => calls.push(["overlay", o]), closeOverlay: (id) => calls.push(["close", id]), settings: () => ({ zoom: 1 }), setShared: (k, v) => { sharedValues[k] = v; },
  window: Object.assign(() => ({ platform: "macos", active: true }), { mouse_position: () => pointer, viewport_size: () => ({ width: 1000, height: 800 }) }),
};
const ticks = [];
const tick = () => ticks.filter((w) => !w.gone).forEach((w) => w.fn(cx));
const afters = [];
const later = () => afters.splice(0).filter((w) => !w.gone).forEach((w) => w.fn(cx));
const cx = { notify() {}, stop_propagation() {}, focus_handle: () => ({ focus() {}, is_focused: () => false }), timer: {
  every(_ms, fn) { const w = { fn, cancel() { w.gone = true; } }; ticks.push(w); return w; },
  after(_ms, fn) { const w = { fn, cancel() { w.gone = true; } }; afters.push(w); return w; } } };
// The shared modules are inlined as the mod's own copies are.
function load(...files) {
  const src = files.map((f) => fs.readFileSync(f, "utf8")).join("\n")
    .replace(/^import .*;\r?\n/gm, "").replace(/export (function|const) /g, "$1 ").replace("export default class", "globalThis.Mod = class");
  const context = vm.createContext({ ...env });
  // Load the real synced helper, including the alias main.js imports.
  vm.runInContext("(() => {\n" + ["color.js", "button.js", "trigger.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n").replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "") + "\nglobalThis.drawButton = button; globalThis.radiusOf = radiusOf; globalThis.DISABLED = DISABLED; globalThis.GROUP_GAP = GROUP_GAP; globalThis.trigger = trigger; globalThis.hang = hang;\n})();", context);
  vm.runInContext(src, context, { filename: files.at(-1) });
  const mod = new context.Mod(); mod.init({}, cx); return mod;
}
const take = () => JSON.parse(JSON.stringify(calls.splice(0)));
const parts = ["store.js", "name.js", "tree.js", "color.js", "status-mark.js", "tip.js", "focus.js", "list.js", "menu-row.js", "program.js", "menu.js", "sidebar.js", "main.js"].map((f) => path.join(__dirname, f));
const header = load(...parts);
header.hovered = true;
find(header.render(), "pane-head-p2").handlers.on_click({}, cx);
assert.deepEqual(take(), [["pane.focus", { pane: "p2" }]]);
find(header.render(), "ph-r-p2").handlers.on_click({}, cx);
assert.deepEqual(take(), [["pane.split", { direction: "right", pane: "p2" }]]);
find(header.render(), "ph-d-p2").handlers.on_click({}, cx);
assert.deepEqual(take(), [["pane.split", { direction: "down", pane: "p2" }]]);
find(header.render(), "ph-z-p2").handlers.on_click({}, cx);
assert.deepEqual(take(), [["pane.zoom", { pane: "p2" }]]);
header.hot = "ph-x-p2";
find(header.render(), "ph-x-p2").handlers.on_click({}, cx);
assert.equal(header.hot, null, "the dialog covers it and the pointer may not move, so its label goes with the click");
assert.deepEqual(take(), [["t3-tabs.close-pane:p2", null]], "the tab bar asks first");
find(header.render(), "pane-head-p2").handlers["on_mouse_down:right"]({}, cx);
assert.deepEqual(take(), [["overlay", { mod: "t3-menu", kind: "popup", width: 220, height: 260, props: { tab: "pane", target: { pane: "p2", terminal: "t2" } } }]], "right-click opens the terminal's menu");

// Names: Pi session, else (agents only) a named tab, else a telling title, else the program.
// The agent's name, then its folder; no address, which the right-click menu copies.
assert.deepEqual(texts(header.render()), ["Release", "~/project"]);
const named = () => texts(header.render())[0];
terms[0].labels["pi.session"] = "Fix login";
assert.equal(named(), "Fix login");
delete terms[0].labels["pi.session"];
assert.equal(named(), "Release");
// Two agents in the named tab would read alike under its name: each goes by its own.
pane.title = "✳ Review PR";
agentList = [{ address: "t2", tab: "b" }, { address: "t5", tab: "b" }];
assert.equal(named(), "Review PR");
// A sub-agent beside its parent leaves the name to it.
terms[0].state = "live"; terms.push({ address: "t5", parent: "t2", state: "live", labels: {} });
assert.equal(named(), "Release");
terms.at(-1).parent = null; terms[0].parent = "t5";
assert.equal(named(), "Review PR", "a sub-agent doesn't take its tab's name");
delete terms[0].parent; terms.pop(); agentList = []; pane.title = "pi";
// A name that is only the program's goes when its icon says it.
tab.named = false; pane.program = { ...program, icon: "pi.svg", tint: true };
assert.deepEqual(texts(header.render()), ["~/project"]);
pane.program = program;
tab.named = false; pane.title = "π - Review PR - project";
assert.equal(named(), "Review PR");
pane.title = "π - project";
assert.equal(named(), "Pi", "Pi's unnamed title is only its folder, which the space already says");
pane.title = "⠋ project";
assert.equal(named(), "Pi", "nor Codex's: its spinner and project");
pane.title = "OC | Review PR";
assert.equal(named(), "OC | Review PR", "an agent's marks come off only its own titles");
pane.program = { name: "OpenCode", key: "opencode", agent: true };
assert.equal(named(), "Review PR");
pane.program = program;
pane.title = "✳ Review PR";
assert.equal(named(), "Review PR");
pane.title = "pi";
assert.equal(named(), "Pi");
terms[0].labels["pi.session"] = "Fix login"; pane.title = "π - Fix login - project";
pane.program = { name: "Git Changes", key: "lazygit", agent: false };
assert.equal(named(), "Git Changes", "lazygit after Pi in the same shell: Pi's session and title are left behind");
pane.program = program; delete terms[0].labels["pi.session"];
tab.named = true; props = { pane: "p3" };
assert.equal(named(), "zsh");
shell.title = "t3";
assert.equal(named(), "zsh");
// A mod pane: the title its mod gives itself, else its folder name.
props = { pane: "p4" };
assert.equal(texts(header.render())[0], "review-pane");
sharedValues["review-pane.titles"] = { a: "review · other", b: "review · fix" };
assert.equal(texts(header.render())[0], "review · fix");
// Its icon, the one its mod gives.
sharedValues["review-pane.program"] = { icon: "mods/review-pane/logo.svg", tint: false };
images.length = 0; header.render();
assert.deepEqual(images, ["mods/review-pane/logo.svg"]);
// Its status, the word its mod gives for its tab, with an agent's marks; another tab's isn't its own.
const bare = header.render().items.length;
sharedValues["review-pane.status"] = { a: "working" };
assert.equal(header.render().items.length, bare);
for (const word of ["working", "blocked", "done"]) {
  sharedValues["review-pane.status"] = { b: word };
  assert.equal(header.render().items.length, bare + 1, word);
}
delete sharedValues["review-pane.status"];

// A put-away agent's done dot goes in both sidebar modes; with the Inbox chosen, its header says it's put away, as its row does.
props = { pane: "p2" }; pane.status = "done"; header.hovered = false;
const dots = () => header.render().items.length;
const svgs = (node, out = []) => { if (node && typeof node === "object") { if (typeof node.svg === "string") out.push(node.svg); node.items.forEach((c) => svgs(c, out)); } return out; };
const mark = () => { const m = find(header.render(), "ph-mark-p2"); return m && [...svgs(m).map((s) => path.basename(s)), ...texts(m)].join(" "); };
const shown = dots();
terms[0].labels.settled = "1:1";
assert.equal(dots(), shown - 1, "Lists hide a settled done dot too");
assert.equal(mark(), null, "and say nothing of it: Lists have no Settled");
delete terms[0].labels.settled; terms[0].labels.snoozed = String(Date.now() + 60000);
assert.equal(dots(), shown - 1, "Lists hide a snoozed done dot too");
assert.equal(mark(), null);
delete terms[0].labels.snoozed; terms[0].labels.settled = "1:1";
sidebar.children[0].active = "inbox";
assert.equal(mark(), "check.svg", "settled: Settle's check in place of the dot");
pane.status = "idle";
assert.equal(mark(), "check.svg", "idle and settled alike");
pane.status = "done";
delete terms[0].labels.settled; terms[0].labels.snoozed = String(Date.now() + 3 * 3600000 - 1000);
assert.equal(mark(), "alarm-clock.svg 3h", "snoozed: the Inbox row's clock and time left");
assert.equal(header.napping, true, "its time left is kept counting down");
pane.status = "working";
assert.equal(mark(), "spinner.svg", "at work, it says so first");
assert.ok(!svgs(header.render()).some((s) => s.endsWith("alarm-clock.svg")), "and only that");
pane.status = "done";
terms[0].labels.snoozed = String(Date.now() - 1);
assert.equal(mark(), "", "woken, it is news again: the dot");
assert.equal(header.napping, false);
delete terms[0].labels.snoozed;
// A hidden Inbox doesn't clear the label, so the label alone can't say: a turn ended since it was settled is news.
terms[0].labels.settled = "1:1"; terms[0].turn = 2;
assert.equal(dots(), shown, "a new turn's done shows, the label still on");
delete terms[0].labels.settled; delete terms[0].turn;

// The buttons go with the pointer, even when the header's leave never comes (tip.js).
{
  const hover = load(...parts);
  const head = () => find(hover.render(), "pane-head-p2");
  head().handlers.on_hover(true, cx);
  head().handlers.on_mouse_move({ position: pointer, bounds: { x: 0, y: 0, width: 100, height: 30 } });
  tick();
  assert.ok(find(hover.render(), "ph-x-p2"), "the pointer on the header keeps them");
  pointer = { x: 50, y: 200 };
  tick();
  assert.equal(find(hover.render(), "ph-x-p2"), null, "off it with no leave reported, they go");
  // Under a still pointer, no move yet: no box to go by, so the first move away decides.
  head().handlers.on_hover(true, cx);
  tick();
  assert.ok(find(hover.render(), "ph-x-p2"));
  pointer = { x: 60, y: 300 };
  tick();
  assert.equal(find(hover.render(), "ph-x-p2"), null);
}

// The mode's owner closing ends the mode: a pane's × can close the pane it's on, and its timers go with it.
{
  const owner = load(...parts);
  sharedValues["t3.focus"] = owner.fs.me;
  owner.close();
  assert.equal(sharedValues["t3.focus"], null);
}

// The buttons come with the keyboard on the header, the stop that gets there, and only in keyboard mode.
{
  const quiet = load(...parts);
  props = { pane: "p2" };
  assert.equal(find(quiet.render(), "ph-x-p2"), null);
  assert.equal(find(quiet.render(), "pane-head-p2").style?.tab_index, undefined);
  sharedValues["t3.focus"] = "on";
  assert.equal(find(quiet.render(), "ph-x-p2"), null);
  quiet.fs.keyboard = true; quiet.fs.handles.set("pane-head-p2", { focus() {}, is_focused: () => true });
  assert.ok(find(quiet.render(), "ph-x-p2"), "the buttons show");
  delete sharedValues["t3.focus"];
}

// Its sub-agents, all the way down: how many, or how many need the person, that opens their list.
props = { pane: "p2" }; pane.status = "working"; header.hovered = false;
assert.equal(find(header.render(), "ph-kids-p2"), null, "none, no button");
terms.push({ address: "child", parent: "t2", state: "live", status: "working", status_ms: Date.now() - 4 * 60000, name: "child task", labels: {} },
  { address: "grandchild", parent: "child", state: "live", status: "idle", name: "grandchild task", labels: {} },
  { address: "gone", parent: "t2", state: "exited", status: "idle", name: "ended", labels: {} });
{
  const kids = find(header.render(), "ph-kids-p2");
  // What it draws, in order: an svg by its file, words as they are.
  const shown = () => { const out = [], walk = (n) => typeof n === "string" ? out.push(n) : n && typeof n === "object" && (typeof n.svg === "string" ? out.push(path.basename(n.svg)) : n.items.forEach(walk)); walk(find(header.render(), "ph-kids-p2")); return out; };
  assert.equal(kids.style.accessibility_label, "2 sub-agents, 1 working", "the button says how many are at work");
  // At most one working mark in the header: the agent at work keeps its own, and the button says only how many.
  const spinners = () => svgs(header.render()).filter((s) => path.basename(s) === "spinner.svg").length;
  assert.equal(spinners(), 1, "its own agent and a sub-agent both at work: one spinner, the agent's");
  assert.deepEqual(shown(), ["2", "chevron-down.svg"], "the agent at work: the button is the count alone");
  assert.equal(find(header.render(), "ph-kids-p2").style.accessibility_label, "2 sub-agents, 1 working", "its tooltip still says one is at work");
  pane.status = "idle";
  assert.deepEqual(shown(), ["spinner.svg", "2", "chevron-down.svg"], "one at work, anywhere down: the shared spinner before the count");
  terms.find((k) => k.address === "child").status = "idle";
  assert.deepEqual(shown(), ["2", "chevron-down.svg"], "none at work: the count alone");
  assert.equal(find(header.render(), "ph-kids-p2").style.accessibility_label, "2 sub-agents");
  terms.find((k) => k.address === "grandchild").status = "working";
  assert.deepEqual(shown(), ["spinner.svg", "2", "chevron-down.svg"], "a grandchild at work spins it too");
  terms.find((k) => k.address === "grandchild").status = "idle";
  terms.find((k) => k.address === "child").status = "working";
  const own = () => { const m = find(header.render(), "ph-mark-p2"); return m && [...svgs(m).map((s) => path.basename(s)), ...texts(m)].join(" "); };
  pane.status = "working";
  assert.equal(own(), "spinner.svg", "its own agent at work still says so beside the button");
  pane.status = "blocked";
  assert.equal(own(), "!", "and needing the person, with its sub-agents all fine");
  pane.status = "idle";
  terms.find((k) => k.address === "grandchild").status = "blocked";
  assert.equal(own(), null, "a sub-agent's word isn't its own");
  assert.equal(find(header.render(), "ph-kids-p2").style.accessibility_label, "2 sub-agents, 1 needs you, 1 working", "the button says it");
  assert.deepEqual(shown(), ["spinner.svg", "2", "chevron-down.svg"], "needing the person adds no `!` of its own: the count's colour says it, the `!` beside it stays the agent's");
  pane.status = "working";
  // Hung from the button, right edges together, as the agents list's sort menu.
  const k = find(header.render(), "ph-kids-p2");
  k.handlers["on_mouse_down:left"]({ bounds: { x: 300, y: 2, width: 40, height: 24 } }, cx);
  k.handlers.on_click({}, cx);
  assert.deepEqual(take(), [["overlay", { mod: "t3-pane", kind: "popup", width: 280, at: { x: 60, y: 30 }, props: { kids: "t2" } }]], "it opens the list, not the pane's focus; no height, so it grows and shrinks with its rows");
  // The list: every one a step in for each level with its own status; a click or Enter peeks it and closes the list.
  props = { kids: "t2", overlay: "o1" };
  const menu = load(...parts);
  const list = () => menu.render();
  assert.equal(find(list(), "kid-grandchild").style.bg, undefined, "opening lights no row");
  assert.equal(find(list(), "kid-gone"), null, "an ended one isn't listed");
  assert.deepEqual(["kid-child", "kid-grandchild"].map((id) => find(list(), id).items[0]?.style.w ?? 0), [0, 8], "a level in: 8 more and the gap's 8");
  assert.ok(texts(find(list(), "kid-child")).includes("4m"), "working, how long");
  const child = terms.find((k) => k.address === "child");
  child.created_ms = child.status_ms - 60 * 60000; child.status_ms = null;
  assert.ok(texts(find(list(), "kid-child")).includes("1h"), "no status change yet: working since it was made");
  const mark = (address) => find(list(), `kid-status-${address}`);
  assert.equal(mark("child").style.accessibility_label, "Working");
  assert.equal(mark("child").items[0].items[0].svg, "mods/workspace-chrome/spinner.svg");
  assert.equal(mark("grandchild").style.accessibility_label, "Needs you");
  assert.deepEqual(texts(mark("grandchild")), ["!", "Needs you"]);
  find(list(), "kid-grandchild").handlers.on_click({}, cx);
  assert.deepEqual(take(), [["close", "o1"], ["terminal.peek", { terminal: "grandchild" }]]);
  find(list(), "kid-grandchild").handlers["on_mouse_down:right"]({}, cx);
  assert.deepEqual(take(), [["close", "o1"], ["overlay", { mod: "t3-menu", kind: "popup", width: 220, height: 260,
    props: { tab: "agent", target: { address: "grandchild" } } }]], "right-click replaces the list with the shared agent menu, without peeking");
  const keys = find(list(), "pane-kids").handlers.on_key_down;
  keys({ key: "enter" }, cx);
  assert.deepEqual(take(), [], "Enter before a row is lit peeks nothing");
  keys({ key: "down" }, cx); keys({ key: "enter" }, cx);
  assert.deepEqual(take(), [["close", "o1"], ["terminal.peek", { terminal: "child" }]]);
  keys({ key: "escape" }, cx);
  assert.deepEqual(take(), [["close", "o1"]]);
  find(list(), "kid-grandchild").handlers.on_hover(true, cx);
  assert.equal(find(list(), "kid-grandchild").style.bg, env.theme().selected, "the pointer lights its row");
  find(list(), "kid-grandchild").handlers.on_hover(false, cx);
  // A command an agent ran in a shell of its own isn't an agent; an agent that shell started still is, a level in from it.
  terms.push({ address: "job", parent: "t2", state: "live", status: null, name: "e2e-run", program: { key: "shell", shell: true, agent: false }, labels: {} },
    { address: "job-kid", parent: "job", state: "live", status: "idle", name: "docs", program: { key: "pi", agent: true }, labels: {} });
  assert.equal(find(list(), "kid-job"), null, "a shell isn't listed");
  assert.equal(find(list(), "kid-job-kid").items[0]?.style.w, undefined, "what it started stands where the shell would have");
  const jobKid = terms.find((k) => k.address === "job-kid");
  jobKid.status_ms = Date.now() - 12 * 60000;
  assert.deepEqual(texts(mark("job-kid")), ["12m"], "idle shows how long, no mark");
  jobKid.status = "done"; jobKid.turn = 2;
  assert.equal(mark("job-kid").style.accessibility_label, "Done", "an unread done is a dot");
  jobKid.labels["herdr.seen"] = "2";
  assert.deepEqual(texts(mark("job-kid")), ["12m"], "read, it's idle again");
  jobKid.status = "error";
  assert.deepEqual(texts(mark("job-kid")), ["!", "Failed"], "failed: the same `!`, its own word");
  assert.deepEqual(list().items[0].items.map((row) => row.key), ["kid-child", "kid-grandchild", "kid-job-kid"], "a failure keeps its place in the tree");
  jobKid.status = null;
  assert.equal(mark("job-kid"), null, "nothing before its first report");
  jobKid.status = "idle";
  props = { pane: "p2" };
  assert.equal(find(header.render(), "ph-kids-p2").style.accessibility_label, "3 sub-agents, 1 needs you, 1 working");
  // All of them ended with the list open: it closes on the next tick.
  props = { kids: "t2", overlay: "o1" };
  const left = terms.splice(-5);
  tick();
  assert.deepEqual(take(), [["close", "o1"]]);
  terms.push(...left); tick();
  assert.deepEqual(take(), [], "while there are some, it stays");
  terms.splice(-5);
  props = { pane: "p2" };
}

// Split, the panes beside the focused one recede, as T3's split terminals do, with no ring: their icon, name and folder a step
// down, back up while hovered. What needs the person (its status mark) and the buttons don't.
{
  props = { pane: "p2" };
  const step = () => ["ph-icon-p2", "ph-name-p2", "ph-folder-p2", "ph-mark-p2"].map((id) => find(header.render(), id)?.style.opacity);
  header.hovered = false;
  assert.deepEqual(step(), [0.5, 0.5, 0.5, undefined], "beside the focused one: a step down, its status mark as it is");
  pane.focused = true;
  assert.deepEqual(step(), [undefined, undefined, undefined, undefined], "the focused one as it is");
  pane.focused = false;
  header.hovered = true;
  assert.deepEqual(step().slice(0, 3), [undefined, undefined, undefined], "hovered, it's back up");
}

props = { pane: "missing" };
assert.equal(find(header.render(), "pane-head-p2"), null);
console.log("ok: a lone pane keeps zoom and close; focus, both splits and close target their own pane; names follow the shared rule, a mod pane's its own title and icon; quiet done dots hide in both modes; its own status beside its sub-agents' button, whose nested list peeks; a missing pane renders nothing.");
