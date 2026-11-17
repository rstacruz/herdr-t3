// Checking must keep view state but never send a process or file write to the host.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { strip, elements } = require("./check-kit.js");
const root = path.join(__dirname, "..");
const element = elements();

async function check(checking) {
  const effects = [];
  const env = {
    checking: () => checking, View: class {}, div: element, closedKey: () => "closed", MOD: "asciicn-wallpaper",
    props: () => ({}), appHome: () => "/app", home: () => "/home",
    theme: () => ({ background: "#000" }), settings: () => ({ theme: "test", zoom: 2 }),
    shared: key => key === "layout" ? "herdr-t3" : undefined, layout: () => ({ titlebar: "none", traffic_lights: [16, 12] }),
    window: () => ({ platform: "macos", active: true }),
    exec: async (...args) => { effects.push(["exec", ...args]); return { code: 0, stdout: "", stderr: "" }; },
    hc: async (...args) => { effects.push(["hc", ...args]); return { code: 0, stdout: '{"machines":[]}' }; },
    readTextFile: async () => '{"titlebar":"none","traffic_lights":[16,12]}',
    writeTextFile: async (...args) => effects.push(["write", ...args]), notify() {},
    reviewRepo: async () => { effects.push(["review"]); return {}; },
    setShared() {},
    workFolder: () => "/repo", spaces: () => [{ id: "s", active: true }],
    stopsInit(v) { v.fs = {}; }, navOpen: () => true, nextCommand: () => new Promise(() => {}),
    loadLabels: async () => {},
    InputState: { new: () => ({ on() {} }) },
    KEY: {}, MENU_ROW: 28, propsLit: () => -1, knownTargets: () => null, installedTargets: async () => ["Finder"],
    prefetchRange: () => effects.push(["prefetch"]),
    LIST: "list", join: (root, rel) => `${root}/${rel}`, parseListing: () => [],
    focused: () => ({}), panes: () => [], readReview: async () => { effects.push(["review counts"]); return null; },
  };
  const cx = { notify() {}, focus_handle: () => ({ focus() {}, is_focused: () => false }),
    timer: { every() {}, after(_ms, fn) { fn(cx); } }, spawn(fn) { return fn(cx); } };
  const load = (file) => {
    const c = vm.createContext({ ...env });
    vm.runInContext(strip(fs.readFileSync(path.join(root, file), "utf8")).replace("export default class", "globalThis.Mod = class"), c);
    return c;
  };
  const files = load("mods/t3-files/main.js"), view = new files.Mod();
  // LaunchServices is exercised separately below, with its real implementation.
  files.installedTargets = async () => ["Finder"];
  view.init({}, cx);
  assert.ok(view.states instanceof vm.runInContext("Map", files), "Files state still initializes");
  const library = load("extras/mods/asciicn-wallpaper/library.js");
  await vm.runInContext('new Library("/app/asciicn-wallpaper").ready', library);
  const wallpaper = load("extras/mods/asciicn-wallpaper/main.js");
  new wallpaper.Mod().screenScale(cx);
  const exporter = load("extras/mods/t3-theme-export/main.js"), exportView = new exporter.Mod();
  exportView.init(); assert.ok(exportView.render(), "theme exporter still renders");
  const chrome = load("mods/t3-chrome/main.js"), chromeView = new chrome.Mod();
  chromeView.alignLights(cx); chromeView.probeReview(cx);
  const spaces = load("mods/t3-spaces/main.js"), spacesView = new spaces.Mod();
  spacesView.reconnecting = {}; spacesView.refreshMachines(cx);
  const targets = load("shared/open-in.js");
  await vm.runInContext("installedTargets()", targets);
  if (checking) {
    const labels = load("shared/labels.js");
    await vm.runInContext('writeLabel("t", "settled", "")', labels);
    const project = load("shared/project.js");
    vm.runInContext('projectIcon({ id: "s", folder: "/repo" }, [], false)', project);
    const review = load("extras/mods/review/main.js");
    new review.Mod().start({ id: "s" }, cx);
    const details = load("mods/t3-actions/workspace-details.js");
    details.props = () => ({ source: { root: "/repo" } });
    vm.runInContext("initDetails({}, cx)", Object.assign(details, { cx }));
    const menus = load("mods/t3-files/menus.js");
    menus.props = () => ({ source: { root: "/repo" } });
    vm.runInContext('readFolder({ dir: "" }, cx)', Object.assign(menus, { cx }));
    const spaceMenu = load("mods/t3-menu/main.js");
    spaceMenu.props = () => ({ tab: "space", target: { id: "s" } });
    spaceMenu.spaces = () => [{ id: "s", folder: "/repo" }];
    new spaceMenu.Mod().init({}, cx);
    const ranges = load("mods/t3-actions/review-details.js");
    ranges.props = () => ({ source: { space: "s" } });
    vm.runInContext("initRangeMenu({}, cx)", Object.assign(ranges, { cx }));
    const bar = load("extras/mods/pulls-review/bar.js");
    bar.spaces = () => [{ active: true, folder: "/repo" }];
    bar.cx = { ...cx, timer: { every(_ms, fn) { fn(cx); } } };
    vm.runInContext("watchReview({}, cx)", bar);
  }
  await new Promise(r => setTimeout(r, 10));
  if (checking) assert.deepEqual(effects, [], "checking must not execute commands or write files");
  else {
    assert.ok(effects.some(([kind, cmd, args]) => kind === "exec" && cmd === "rm" && args.includes("/app/cache/t3-files")));
    assert.ok(effects.some(([kind, cmd, args]) => kind === "exec" && cmd === "rm" && args.includes("/app/asciicn-wallpaper/.preview")));
    assert.ok(effects.some(([kind, file]) => kind === "write" && file === "/home/.cache/herdr-app-theme.json"));
    assert.ok(effects.some(([kind]) => kind === "hc"));
  }
}
check(true).then(() => check(false)).then(() => console.log("ok: checking isolates side effects; live initialization retained"))
  .catch(e => { console.error(e); process.exitCode = 1; });
