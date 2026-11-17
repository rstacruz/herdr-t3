// For the checks: the mod's modules linked in one vm context, each in a scope of its own, with real files and processes
// in a temporary app home and a stand-in for the window. Not a check itself (scripts/check.sh runs check*.cjs).
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);

// Imports from the mod's own files become lookups, the host's are the context's globals; exports are returned.
function link(context, file, source) {
  const exported = [];
  const body = source
    .replace(/^import\s*\{([^}]*)\}\s*from\s*"([^"]+)";?[ \t]*$/gm, (_, names, from) => from.startsWith("./")
      ? `const {${names.replace(/\b([\w$]+)\s+as\s+([\w$]+)/g, "$1: $2")}} = __m[${JSON.stringify(from.slice(2))}];` : "")
    .replace(/^export\s+default\s+class\s+([\w$]+)/m, (_, name) => { exported.push(["default", name]); return `class ${name}`; })
    .replace(/^export\s+((?:async\s+)?function\*?|const|let|class)\s+([\w$]+)/gm, (_, kind, name) => { exported.push([name, name]); return `${kind} ${name}`; });
  vm.runInContext(`__m[${JSON.stringify(file)}] = (() => {\n${body}\nreturn { ${exported.map(([k, n]) => `${k}: ${n}`).join(", ")} };\n})();`, context, { filename: file });
}

const MODULES = ["ascii-art.js", "scenes.js", "library.js", "source.js", "framing.js", "tip.js", "focus.js", "color.js", "button.js", "list.js", "menu-row.js", "trigger.js", "store.js", "main.js"];

// A render tree: what a test can find by id, read the geometry of and press.
function element(kind) {
  const n = { kind, items: [], handlers: {}, props: {} };
  const p = new Proxy(n, { get: (o, k) => k in o || typeof k === "symbol" ? o[k] : (...a) => {
    if (k === "child") n.items.push(a[0]);
    else if (k === "children") n.items.push(...a[0]);
    else if (k === "when") { if (a[0]) a[1](p); }
    else if (k === "id") n.key = a[0];
    else if (k.startsWith("on_")) n.handlers[k] = a.at(-1);
    else n.props[k] = a[0];
    return p;
  } });
  return p;
}
const find = (n, id) => !n || typeof n !== "object" ? undefined : n.key === id ? n : n.items?.map(x => find(x, id)).find(Boolean);
// Every piece of text a tree shows.
const texts = (n) => typeof n === "string" ? [n] : !n || typeof n !== "object" ? [] : n.items.flatMap(texts);

/**
 * A Home in a temporary app home under `base` (another runtime on the same `base` is a later app run). `hooks` can hold up a
 * step: `afterRead(file)`, `beforeWrite(file, body)`, `beforeExec(cmd, args)`, `afterExec(cmd, args, result)`; `picked`, what
 * the file dialog returns. `runs`: the commands run(). `view.props`: what props() returns. `stubs` replace modules.
 */
async function runtime(base, { stubs = {}, platform = "macos" } = {}) {
  const app = path.join(base, "app 'quoted"), dir = path.join(app, "asciicn-wallpaper");
  await fs.mkdir(path.join(app, "mods/asciicn-wallpaper"), { recursive: true });
  await fs.symlink(path.join(__dirname, "scenes"), path.join(app, "mods/asciicn-wallpaper/scenes")).catch((e) => { if (e.code !== "EEXIST") throw e; });
  // `look.themes`: the layout's { light, dark } themes' colours, as settings() and themes() name them; without, one palette.
  // `win.active`: whether the window has focus (window().active).
  // `win.screens`: what macOS says of each screen, [x, y, width, height, backing scale]; `win.bounds`: the window's frame.
  const win = { active: true, screens: [[0, 0, 1440, 900, 1], [1440, 0, 1440, 900, 2]], bounds: { x: 0, y: 0, width: 1000, height: 800 } }, every = [];
  const state = {}, messages = [], overlays = [], runs = [], hooks = {}, view = { props: null },
    look = { dark: true, colours: { foreground: "#dddddd", ansi1: "#cd3131" }, themes: null, now() { return { ...(this.themes?.[this.dark ? "dark" : "light"] ?? this.colours) }; } };
  const env = {
    checking: () => false,
    View: class {}, div: () => element("div"), svg: (p) => Object.assign(element("svg"), { path: p }), image: (p) => { const e = element("image"); e.props.path = p; return e; },
    h_flex: () => element("div"), v_flex: () => element("div"),
    SliderState: { new: () => ({ current: 1, handlers: {}, value() { return this.current; }, on(k, f) { this.handlers[k] = f; }, set_value(n) { this.current = n; }, release() {} }) },
    Slider: { new: () => element("slider") }, SliderTrack: { new: () => element("div") }, SliderIndicator: { new: () => element("div") }, SliderThumb: { new: () => element("div") },
    appHome: () => app, window: Object.assign(() => ({ platform, active: win.active }), { bounds: () => ({ ...win.bounds }) }), theme: () => look.now(),
    settings: () => ({ dark: look.dark, ...(look.themes ? { theme_light: "Paper", theme_dark: "Ink", colors: {} } : {}) }),
    themes: () => look.themes ? [{ name: "Paper", light: true, colors: { ...look.themes.light } }, { name: "Ink", light: false, colors: { ...look.themes.dark } }] : [],
    shared: k => state[k], setShared: (k, v) => { state[k] = v; },
    notify: v => messages.push(v), openOverlay: v => overlays.push(v), closeOverlay: () => null, run: (name, args) => { runs.push([name, args]); return null; },
    props: () => view.props,
    nextCommand: () => new Promise(() => {}), watchFolder: () => new Promise(() => {}),
    readTextFile: async file => {
      try {
        const body = await fs.readFile(file, "utf8");
        if (Buffer.byteLength(body) > 1024 * 1024) throw new Error("Text file exceeds 1 MiB");
        await hooks.afterRead?.(file);
        return body;
      } catch (e) { if (e.code === "ENOENT") return null; throw e; }
    },
    writeTextFile: async (file, body, expected) => {
      if (Buffer.byteLength(body) > 1024 * 1024) throw new Error("Text file exceeds 1 MiB");
      await hooks.beforeWrite?.(file, body);
      assert.equal(expected, null, "the mod only creates files");
      await fs.writeFile(file, body, { flag: "wx" });
    },
    exec: async (cmd, args = [], options = {}) => {
      if (cmd === "osascript" && args[0] === "-l" && args[3]?.includes("NSScreen")) return { code: 0, stdout: `${JSON.stringify(win.screens)}\n`, stderr: "" };
      if (cmd === "osascript" && args[0] === "-e") return hooks.picked == null ? { code: 1, stdout: "", stderr: "User canceled. (-128)" } : { code: 0, stdout: `${hooks.picked}\n`, stderr: "" };
      await hooks.beforeExec?.(cmd, args);
      let result;
      try {
        const r = await run(cmd, args, { cwd: options.cwd, timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
        result = { code: 0, stdout: r.stdout, stderr: r.stderr };
      } catch (e) {
        if (typeof e.code !== "number") throw e;
        result = { code: e.code, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
      }
      await hooks.afterExec?.(cmd, args, result);
      return result;
    },
  };
  const context = vm.createContext(env);
  context.__m = {};
  // Keyboard stops and tooltips have their own checks in shared/.
  stubs = { "focus.js": () => ({ stop: (_v, _t, _id, el) => el, focusRoot: (_v, el) => el, stopsInit: v => { v.fs = {}; }, stopsEnd() {}, enter() {},
    pressed: v => { v.pressAt = Date.now(); }, justClosed: () => false }),
    "tip.js": () => ({ tip: (_v, _t, _id, _label, el) => el, glow: () => () => {}, FADE: { duration: 150, easing: "ease-out" },
      POINTER_WATCH: 100, pointerMoved() {}, dragGone: () => !win.active }), ...stubs };
  for (const file of MODULES) {
    if (stubs[file]) context.__m[file] = stubs[file](context.__m);
    else link(context, file, readFileSync(path.join(__dirname, file), "utf8"));
  }
  const Mod = context.__m["main.js"].default;
  let focused = null;
  const cx = { notify() {}, stop_propagation() {}, spawn: fn => fn(cx), timer: { after: (_ms, fn) => setImmediate(() => fn(cx)),
    every: (_ms, fn) => { const t = { fn, cancel() { every.splice(every.indexOf(t) >>> 0, 1); } }; every.push(t); return t; } },
    focus_handle: () => { const h = { focus: () => { focused = h; }, is_focused: () => focused === h }; return h; } };
  // A Home as Herdr lays it out: sized, its files scanned.
  const home = async ({ width = 1000, height = 800 } = {}) => {
    const h = new Mod();
    h.init({}, { ...cx, spawn() {} });
    Object.assign(h, { width, height });
    await h.lib.ready;
    await h.lib.refresh(cx);
    return h;
  };
  // Lets queued steps run, real files and processes included: until `done()` holds, or a quiet `ms` without one.
  const settle = async (done = null, ms = done ? 10000 : 150) => {
    for (const end = Date.now() + ms; Date.now() < end && !done?.();) await new Promise(r => setTimeout(r, 5));
    if (done) assert.ok(done(), "settled");
  };
  // `ticks()`: each repeating timer (cx.timer.every) fires once.
  const ticks = () => { for (const t of [...every]) t.fn(cx); };
  return { app, dir, state, messages, overlays, runs, hooks, view, look, win, ticks, cx, home, settle, modules: context.__m };
}

module.exports = { runtime, find, texts };
