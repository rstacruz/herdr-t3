// The space panel's shared Files view (docs/adr/0017): the active space's folder, read-only, as
// one block: the file picked on the left, the tree on the right by the window's edge, the split between them dragged.
// One copy serves every space, here or on another machine: what each one shows is kept by its id.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Editor, EditorState, TextView } from "gpui-base";
import { checking, spaces, nextCommand, exec, readTextFile, theme, settings, shared, setShared, appHome, window, props } from "herdr";
import * as fs from "fs/promises";
import { panelState, surfacesFor, closeSurface, openFile, navigateFolder } from "./panel.js";
import { terminalFor } from "./terminal-context.js";
import { treeRows, treeIndex, pathEntries, sortEntries, treeKey, treeList, treeRow, revealRow } from "./file-tree.js";
import { withNav, treeHead, navOpen, setNavOpen, holdWidth } from "./nav-column.js";
import { MENU_W, FOLDER_H, MENU_CLOSED, openMenu, closeMenus, rowItems, launch, initMenu, closeMenu, menuView } from "./menus.js";
import { KEY, wrapLines, setWrapLines } from "./store.js";
import { installedTargets, knownTargets, targetIcon, openInHeight } from "./open-in.js";
import { split, ghostButton, tint, GROUP_GAP } from "./button.js";
import { loadingState, noticeBar } from "./panel-states.js";
import { stopsInit, stopsEnd, enter, focusRoot, stop, within } from "./focus.js";
import { opener, popupOpen, hang } from "./trigger.js";
import { tip, hoverKept, glow } from "./tip.js";
import { MENU_ROW } from "./menu-row.js";
import { LIST, join, parseListing } from "./file-listing.js";
import { IGNORED, PROBE, REMOTE_SEARCH, REMOTE_MAX, parentOf, nameOf, ancestors, parseIgnored, markIgnored, folderEntries, terms, narrows,
  filterPaths, rankPaths, kindOf, languageOf, readProblem, failedRead, ticket } from "./model.js";
import { alpha } from "./color.js";

const MOD = "mods/t3-files";
const RESULTS = 200, REMOTE_IMAGE = 512 * 1024, TEXT_MAX = 1024 * 1024;
// Expand all lists at most this many folders, Git-ignored ones left closed, as T3's: ignored by the repository each folder is in,
// a clone inside a space's folder that isn't one too; folders in no repository open.
// shortcut: a folder past it stays closed; list more in batches if a big repo wants it all.
const EXPAND_MAX = 200;
// Asked again while it shows: here every 5 s, another machine every 10; a refresh that took long, 10 times as long, a minute at
// most. Event-driven refresh is a separate change; a hidden page runs nothing.
const LOCAL_EVERY = 5000, REMOTE_EVERY = 10000, SLOWEST = 60000;
// Herdr runs each exec as a process with two pipes and doesn't raise a GUI app's 256 open files (launchd's soft limit): a refresh
// listing every folder Expand all opened, all at once, had dozens fail to start ("Too many open files"). Listing reads go
// READ_AT_ONCE at a time, across every space this copy reads.
const READ_AT_ONCE = 8;
let reading = 0;
const waiting = [];
const limited = async (read) => {
  while (reading >= READ_AT_ONCE) await new Promise((go) => waiting.push(go));
  reading++;
  try { return await read(); } finally { reading--; waiting.shift()?.(); }
};
// Herdr colors code on the UI thread, the whole file each time, ~1.5 ms a KB (research large-file-highlight.md), and a new
// editor starts at the top. Opened, a file up to AUTO_MAX is colored at once: a stall, not a jump. Where it's back at the top
// anyway, a file over SYNC_MAX (~25 ms) shows plain first and is colored once left alone: rewritten text once it has held
// SETTLED, Wrap switched after IDLE; never once scrolled while plain. Past AUTO_MAX only when asked. Counted in characters.
// shortcut: it only moves the stall; drop it once the host colors off the UI thread.
const SYNC_MAX = 16 * 1024, AUTO_MAX = 256 * 1024, IDLE = 300, SETTLED = 10000;
// The active surface of a space, and what names one pick of it: its instance and how many times it was picked.
const activeTab = (space) => { const s = surfacesFor(space); return s.tabs.find(t => t.id === s.active) ?? null; };
const tabKey = (tab) => tab ? `${tab.id}:${tab.born}:${tab.reveal ?? 0}` : "";
const FULL = 3; // the spaces last shown that keep all they read; older ones keep their file, open folders and search
const CACHE = "cache/t3-files"; // under the app's home, where image() can read
const MARKDOWN = "t3-files.markdown"; // "code" once someone picked it; Preview otherwise

const GIT = ["--no-optional-locks", "-c", "core.fsmonitor=false"]; // keep reads from updating the index or filesystem-monitor state

const zoom = () => Number(settings()?.zoom) || 1;

// What one space's page knows and shows.
function blank(sp) {
  return { id: sp.id, root: sp.folder, on: sp.machine ?? null, git: undefined, entries: new Map(), expanded: new Set(), ignored: new Set(),
    version: 0, file: null, folder: null, trail: null, view: null, previews: new Map(), selected: null, focus: null, query: "", found: null, paths: null, loading: new Set(), errors: new Map() };
}

export default class Files extends View {
  init(_props, cx) {
    // A copy opened as one of its menus is only that (menus.js).
    if (props()?.files) return initMenu(this, cx);
    this.states = new Map();
    this.treeHandle = cx.focus_handle();
    this.navHandle = cx.focus_handle();
    this.search = InputState.new({ placeholder: "Search files" });
    this.search.on("change", (_e, cx) => { const st = this.current(); if (st && this.search.value() !== st.query) this.find(st, this.search.value(), cx); });
    this.handle = cx.focus_handle();
    this.fs = /** @type {any} */ (null);
    this.treeHot = null;
    this.listHeight = {};
    stopsInit(this, cx);
    this.fs.hold = () => this.searchFocused || this.treeHandle.is_focused() || this.navHandle.is_focused();
    this.search.on("focus", (_e, cx) => { this.searchFocused = true; cx.notify(); });
    this.search.on("blur", (_e, cx) => { this.searchFocused = false; cx.notify(); });
    this.targets = ["Finder"];
    if (window()?.platform === "macos") cx.spawn(async cx => { this.targets = await installedTargets(); cx.notify(); });
    this.navOpen = navOpen();
    // The width the code is laid out at, behind its room while that moves (codeView, nav-column.js holdWidth).
    /** @type {{ at?: number, want?: number, run?: number }} */
    this.codeHold = {};
    this.cached = new Set();
    // The state being worked for, and a count that moves each time that changes (going).
    this.awake = null; this.gen = 0;
    if (!checking()) cx.spawn(async () => { await exec("rm", ["-rf", `${appHome()}/${CACHE}`]).catch(() => null); });
    // A hidden copy isn't drawn, so this is what sees it go out of view.
    cx.timer.every(1000, (cx) => { this.sync(cx); this.poll(cx); });
    // `t3-files.open:<path from the space's folder>` and `t3-files.search:<words>`, for keys and scripts (the demo's);
    // `t3-files.close`, cmd-w while it has the keyboard, closes the active surface, never the terminal behind it. `pick:<path>`
    // is a breadcrumb menu's file (menus.js): the person's own pick, so the tree takes the keyboard.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand(), st = this.current(), at = c.indexOf(":"), [what, arg] = [c.slice(0, at), c.slice(at + 1)];
        // Over its menus, cmd-w closes them, not the surface under them.
        if (c === "close") { if (!closeMenus()) closeSurface(); cx.notify(); }
        if (c === "focus") { enter(this, cx, "t3-files-refresh"); this.search.focus(); }
        if (!st || at < 0) continue;
        if (what === "open") this.pick(st, arg, cx);
        else if (what === "pick") this.pick(st, arg, cx, false, true);
        else if (what === "search") { this.search.set_value(arg); this.find(st, arg, cx); }
      }
    });
  }

  // Its images go with it; one a crash left is cleared at the next start.
  async close() {
    if (props()?.files) return closeMenu(this);
    stopsEnd(this);
    await Promise.all([...this.cached].map((f) => fs.unlink(`${appHome()}/${f}`).catch(() => null)));
  }

  current() {
    const sp = spaces().find((s) => s.active);
    return sp ? this.states.get(sp.id) : null;
  }

  // A space's state, made the first time and made again when its folder moves; the latest one last. The FULL last keep all
  // they read; older ones only how they were being read, and read again when back.
  stateFor(sp) {
    let st = this.states.get(sp.id);
    if (!st || st.root !== sp.folder || st.on !== (sp.machine ?? null)) { if (st) this.drop(st); st = blank(sp); }
    else if ([...this.states.keys()].at(-1) === sp.id) return st;
    this.states.delete(sp.id);
    this.states.set(sp.id, st);
    for (const old of [...this.states.values()].slice(0, -FULL)) this.states.set(old.id, this.slim(old));
    return st;
  }

  // What `st` read let go, for whatever still holds it too (a read under way): its editor, image and lists.
  drop(st) {
    for (const v of new Set([st.view, ...[...st.previews.values()].map(p => p.view)])) this.releasePreview(v);
    st.previews.clear();
    Object.assign(st, { view: null, entries: new Map(), ignored: new Set(), rows: null, index: null, paths: null, lower: null, last: null, found: null });
  }

  // A space let go of, keeping its file, open folders and search's words.
  slim(st) {
    this.drop(st);
    return Object.assign(blank({ id: st.id, folder: st.root, machine: st.on }), { file: st.file, folder: st.folder, trail: st.trail, fileBorn: st.fileBorn, seen: st.seen, expanded: new Set(st.expanded), selected: st.selected, focus: st.focus, query: st.query });
  }

  // It works only while it shows: the page in the open panel, the window in front, for the active space. Shown, it reads at
  // once; hidden, answers still under way are dropped and nothing more is asked. A closed space's state goes.
  sync(cx) {
    if (checking()) return;
    const all = spaces(), sp = all.find((s) => s.active);
    for (const [id, st] of this.states) {
      if (!all.some((s) => s.id === id)) { this.drop(st); this.states.delete(id); continue; }
      const tabs = surfacesFor(id).tabs;
      for (const [path, kept] of st.previews) if (!tabs.some(t => t.path === path && t.born === kept.born)) { this.releasePreview(kept.view); st.previews.delete(path); if (st.view === kept.view) st.view = null; }
      if (st.file && !tabs.some(t => t.path === st.file && t.born === st.fileBorn)) { st.file = null; st.view = null; }
    }
    const st = sp && this.shown() ? this.stateFor(sp) : null;
    if (st) {
      // A tab picked (its reveal moved), or another tab: shown, its search cleared, the tree on it (T3's revealRequestId). The
      // tree takes the keyboard only when the person went there from it or the breadcrumbs (`userNav`), never for a tab
      // picked elsewhere: the terminal they type in keeps it.
      const tab = activeTab(sp.id), key = tabKey(tab);
      if (st.seen !== key || st.file !== (tab?.folder ? null : tab?.path ?? null) || st.folder !== (tab?.folder ? tab.path ?? "" : null)) {
        st.seen = key;
        cx.timer.after(0, (cx) => {
          // Moved on meanwhile (another pick, or Files opened one itself): that one's what shows.
          if (!this.shown() || spaces().find(p => p.active)?.id !== st.id || st.seen !== key || tabKey(activeTab(st.id)) !== key) return;
          const focus = this.userNav; this.userNav = false;
          if (tab?.folder) {
            st.file = null; st.view = null; st.folder = tab.path ?? ""; st.trail = tab.trail ?? st.folder;
            this.find(st, "", cx); this.search.set_value(""); this.reveal(st, st.folder, cx, focus);
          } else if (tab?.path) this.pick(st, tab.path, cx, true, focus);
          else { st.file = null; st.view = null; st.folder = null; st.trail = null; this.select(st, null); this.changed(st); cx.notify(); }
        });
      }
    }
    if (st === this.awake) return;
    if (this.awake) { this.awake.loading.clear(); this.awake.expanding = false; }
    this.awake = st; this.gen++;
    if (!st?.root) return;
    if (st.git === undefined) this.load(st, cx); else this.recheck(st, cx);
  }

  // The page in the open panel, the window in front.
  shown() { const p = panelState(); return p.open && p.page === "files" && Boolean(window()?.active); }
  // Whether what started now may go on: `st` still the one worked for and in view, without having gone out of it since. It
  // asks the layout itself, as sync sees a hide only at its next tick; one it finds puts the page to sleep, so showing again
  // reads again.
  going(st) {
    const gen = this.gen;
    return () => {
      if (this.gen !== gen || this.awake !== st || !this.live(st)) return false;
      if (this.shown() && spaces().find((s) => s.active)?.id === st.id) return true;
      this.awake = null; this.gen++;
      return false;
    };
  }
  // A ticket (model.js) that also lapses once `st` stops showing.
  fresh(st, kind) { const t = ticket(st, kind), go = this.going(st); return () => t() && go(); }
  live(st) { return this.states.get(st.id) === st; }
  changed(st) { st.version++; st.rows = null; }

  // Git asked where the folder is, then the rest as a recheck: a space read again gets its file and search back too.
  load(st, cx) {
    const going = this.going(st);
    cx.spawn(async (cx) => {
      const top = await exec("git", ["rev-parse", "--show-toplevel", "--show-prefix"], { cwd: st.root, on: st.on }).catch(() => null);
      if (!going()) return;
      const [dir, prefix] = top?.code === 0 ? top.stdout.split("\n") : [];
      st.git = dir ? { top: dir, prefix: prefix ?? "" } : null;
      this.recheck(st, cx);
    });
  }

  // Git's marks, and every folder shown listed again. The search's list of files is made again at its next word.
  async refresh(st, cx) {
    const go = this.going(st);
    if (!go() || st.git === undefined) return;
    const began = st.refreshed = Date.now();
    const shown = ["", ...st.expanded].filter((p) => p === "" || ancestors(p).every((a) => st.expanded.has(a)));
    await Promise.all(shown.map((p) => this.list(st, p)));
    if (!go()) return;
    st.refreshed = Date.now(); st.took = st.refreshed - began; st.paths = null;
    cx.notify();
  }

  async list(st, rel) {
    const fresh = this.fresh(st, `list:${rel}`), dir = join(st.root, rel);
    if (!fresh()) return;
    st.loading.add(rel);
    const inIgnored = [rel, ...ancestors(rel)].some((p) => p && st.ignored.has(p));
    const [r, ig] = await Promise.all([
      limited(() => exec("sh", ["-c", LIST, "files", dir], { on: st.on })).catch((e) => ({ code: 1, stdout: "", stderr: String(e?.message ?? e) })),
      // Asked in the folder itself, so Git answers for the repository it's in, a clone inside the space's folder too, as T3's;
      // in none, it says nothing is ignored.
      !inIgnored ? limited(() => exec("sh", ["-c", IGNORED, "files", dir, ""], { cwd: dir, on: st.on })).catch(() => null) : null,
    ]);
    if (!fresh()) return;
    if (r.code !== 0) {
      // Why, for the folder's row to say on hover: what the shell or the host said.
      st.errors.set(rel, r.stderr?.trim() || `Listing it ended with code ${r.code}.`);
    } else {
      const entries = parseListing(r.stdout);
      st.entries.set(rel, entries);
      st.errors.delete(rel);
      if (ig) {
        markIgnored(st.ignored, rel, entries, new Set([...parseIgnored(ig.stdout)].map((name) => join(rel, name))));
      }
    }
    st.loading.delete(rel);
    this.changed(st);
  }

  // While it shows (sync), asked again: every LOCAL_EVERY here or REMOTE_EVERY on another machine from the last refresh's end,
  // 10 times as long as that refresh took if longer, SLOWEST at most.
  poll(cx) {
    const st = this.awake;
    if (!st || st.git === undefined || st.expanding) return;
    const every = Math.min(SLOWEST, Math.max(st.on ? REMOTE_EVERY : LOCAL_EVERY, 10 * (st.took ?? 0)));
    if (Date.now() - (st.refreshed ?? 0) >= every) this.recheck(st, cx);
  }

  // Git, the folders shown and the file asked again. An image shown is copied whole each time, so it's left be: one changed
  // shows when it's picked again.
  recheck(st, cx) {
    st.refreshed = Date.now();
    cx.spawn(async (cx) => {
      await this.refresh(st, cx);
      // A search showing, found again; each asks only while it shows.
      if (st.query) this.find(st, st.query, cx);
      if (st.file && !st.view?.image) this.open(st, st.file, cx, true);
    });
  }

  toggle(st, path, cx) {
    ticket(st, "expand"); st.expanding = false; st.expandAll = false;
    const row = this.rows(st).find(r => r.path === path), top = row?.top ?? path;
    const chain = [...new Set([top, ...ancestors(path).filter(p => p.startsWith(`${top}/`)), path])];
    if (st.query.trim()) {
      st.searchClosed ??= new Set();
      if (row?.open) st.searchClosed.add(top); else for (const p of chain) st.searchClosed.delete(p);
      this.changed(st); cx.notify(); return;
    }
    if (st.expanded.has(path)) for (const p of chain) st.expanded.delete(p);
    else {
      for (const p of chain) st.expanded.add(p);
      // A folder holding just a folder opens with it, as the tree shows them as one row.
      const go = this.fresh(st, "expand");
      cx.spawn(async (cx) => {
        for (let p = path, kids; p && go(); p = kids?.length === 1 && kids[0].dir ? join(p, kids[0].name) : null) {
          await this.list(st, p);
          if (!go()) return;
          kids = st.entries.get(p);
          if (kids?.length === 1 && kids[0].dir) st.expanded.add(join(p, kids[0].name));
        }
        if (!go()) return;
        this.changed(st);
        cx.notify();
      });
    }
    this.changed(st);
    cx.notify();
  }

  // Opens the folders down to `path` (a file's, or a folder lit until the next click) and brings its row into view; `focus`,
  // the person went there from the tree or the breadcrumbs, so the tree takes the keyboard.
  reveal(st, path, cx, focus = false) {
    for (const p of ancestors(path)) st.expanded.add(p);
    this.select(st, path || null);
    st.focus = path || null;
    this.changed(st);
    const go = this.going(st);
    cx.spawn(async (cx) => {
      for (const p of ancestors(path)) if (go() && !st.entries.has(p)) await this.list(st, p);
      if (!go()) return;
      // The space's folder is the tree's top.
      const id = `t3-files-tree-${st.id}`;
      if (path) revealRow(this, id, path); else this.scrollTop = { ...this.scrollTop, [id]: 0 };
      if (focus) this.treeHandle.focus();
      cx.notify();
    });
    cx.notify();
  }

  // A file shown from elsewhere (its tab, a command, a breadcrumb menu): the search cleared, the file open, the tree on it.
  pick(st, path, cx, selected = false, focus = false) {
    st.folder = null; st.trail = null;
    st.query = ""; st.found = null;
    this.search.set_value("");
    this.open(st, path, cx, false, selected);
    this.reveal(st, path, cx, focus);
  }

  // Shows a file; `again` reads it again where it may have changed, and leaves it as it was if it hasn't.
  open(st, rel, cx, again = false, selected = false) {
    if (!again) {
      if (!selected) openFile(rel);
      // Opened here: what the panel shows now is this, not a pick to answer.
      const tab = surfacesFor(st.id).tabs.find(t => t.path === rel && !t.folder), kept = st.previews.get(rel);
      st.seen = tabKey(activeTab(st.id));
      st.file = rel; st.fileBorn = tab?.born;
      st.view = kept?.born === tab?.born ? kept.view : { loading: true };
      this.changed(st);
      cx.notify();
    }
    const fresh = this.fresh(st, "file"), abs = join(st.root, rel), kind = kindOf(rel);
    if (!fresh()) return;
    if (!again && !st.view.loading) {
      if (st.view.text !== undefined && !st.view.code && (kind === "text" || shared(MARKDOWN) === "code")) this.editor(st.view, rel, this.fits(st.view));
      // Plain, picked again: colored now, as it's opened.
      else if (st.view.code && st.view.lang && !st.view.colored && this.fits(st.view)) { st.view.scrolled = false; this.editor(st.view, rel, true); }
      this.keepPreview(st, rel, st.view); return;
    }
    cx.spawn(async (cx) => {
      const view = await this.read(st, abs, rel, kind, fresh).catch(() => ({ problem: "This file can't be read." }));
      if (view?.problem) view.failed = failedRead(view.problem);
      if (!view) return;
      if (!fresh() || st.file !== rel) { this.releasePreview(view); return; }
      const old = st.view;
      if (again && old && view.text !== undefined && view.text === old.text) return;
      if (old?.image && old.image !== view.image) this.uncache(old.image);
      // Asked to color, or scrolled while plain: still so for its new text, until it's opened again.
      view.force = again && old?.force; view.scrolled = again && old?.scrolled;
      if (view.text !== undefined && (kind === "text" || shared(MARKDOWN) === "code")) this.editor(view, rel, (!old?.code || this.small(view)) && this.fits(view));
      if (old?.code) old.code.release();
      st.view = view; this.keepPreview(st, rel, view);
      // Rewritten: colored again only once it holds, so an agent writing it stalls the window once, not every read.
      if (again && this.wantsColor(view)) this.colorLater(st, view, SETTLED, cx);
      cx.notify();
    });
  }

  releasePreview(view) { view?.code?.release(); if (view?.image) this.uncache(view.image); }

  keepPreview(st, rel, view) {
    st.previews.delete(rel); st.previews.set(rel, { born: st.fileBorn, view });
    for (const [path, kept] of [...st.previews].slice(0, -3)) { this.releasePreview(kept.view); st.previews.delete(path); }
  }

  /** @returns {Promise<any>} */
  async read(st, abs, rel, kind, fresh) {
    let size = null;
    if (st.on) {
      const p = await exec("sh", ["-c", PROBE, "probe", abs], { on: st.on });
      if (!fresh()) return null;
      if (p.code !== 0) return { problem: "This file can't be read." };
      const [bytes, nuls] = p.stdout.trim().split(" ").map(Number);
      size = bytes;
      if (kind !== "image" && bytes > TEXT_MAX) return { problem: "This file is larger than 1 MB, too large to preview." };
      if (kind !== "image" && nuls > 0) return { problem: "This is a binary file, so there's no text to show." };
    }
    if (kind === "image") {
      if (st.on && size > REMOTE_IMAGE) return { problem: `This image is larger than 512 KB, too large to bring over from ${st.on}.` };
      const name = `${CACHE}/${Date.now()}-${nameOf(rel).replace(/[^\w.-]/g, "_")}`, dest = `${appHome()}/${name}`;
      await fs.mkdir(`${appHome()}/${CACHE}`, { recursive: true }).catch(() => null);
      if (!fresh()) return null;
      if (st.on) {
        const r = await exec("base64", [abs], { on: st.on, timeout: 60000 });
        if (!fresh()) return null;
        if (r.code !== 0) return { problem: "This image can't be read." };
        const bin = /** @type {any} */ (globalThis).atob(r.stdout.replace(/\s+/g, "")), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        await fs.writeFile(dest, bytes);
      } else {
        const r = await exec("cp", [abs, dest]);
        if (r.code !== 0) return { problem: "This image can't be read." };
      }
      if (!fresh()) { await fs.unlink(dest).catch(() => null); return null; }
      this.cached.add(name);
      return { image: name };
    }
    let text;
    try { text = await readTextFile(abs, { on: st.on }); }
    catch (e) { return { problem: readProblem(e) }; }
    if (text === null) return { problem: "This file isn't there anymore." };
    if (st.on && text.includes("\uFFFD")) return { problem: "This file isn't UTF-8 text, so there's nothing to show." };
    return { text };
  }

  uncache(name) {
    this.cached.delete(name);
    fs.unlink(`${appHome()}/${name}`).catch(() => null);
  }

  // The view's code, wrapped as the layout's Lines choice says (store.js), which it notes: the editor takes it only when made.
  // Colored if `color` and it has a language; else plain, for colorLater. Its old editor goes.
  editor(view, rel, color) {
    const t = theme(), old = view.code;
    view.wrap = wrapLines(); view.lang = languageOf(nameOf(rel));
    view.colored = Boolean(view.lang) && color;
    view.code = EditorState.new({ language: view.colored ? view.lang : undefined, value: view.text, readonly: true, soft_wrap: view.wrap, font_family: /** @type {string} */ (settings().font_family), font_size: 12,
      syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
    old?.release();
  }

  // Colored without asking: up to AUTO_MAX, or once asked (force).
  fits(v) { return Boolean(v.force || v.text.length <= AUTO_MAX); }
  // Colored at once even where plain would do: a few ms.
  small(v) { return v.text.length <= SYNC_MAX; }
  // Plain code to color once left alone: not once scrolled, as the colored editor would start at the top.
  wantsColor(v) { return Boolean(v?.code && v.lang && !v.colored && !v.scrolled && this.fits(v)); }

  // Colored `ms` after the last call, if it's still what shows; else render asks again once it does.
  colorLater(st, view, ms, cx) {
    const stamp = view.stamp = (view.stamp ?? 0) + 1;
    view.waiting = true;
    cx.timer.after(ms, (cx) => {
      if (view.stamp !== stamp) return;
      view.waiting = false;
      if (st.view !== view || this.current() !== st || !this.shown() || !this.wantsColor(view) || view.wrap !== wrapLines()) return cx.notify();
      this.editor(view, st.file, true);
      cx.notify();
    });
  }

  // Every term in the path, case aside, ranked (model.js rankPaths): here over the folder's whole list, kept until the next
  // refresh; on another machine, there. The words go in with what they found, or why not (st.found), so the tree never shows
  // one search's results under another's words: words not searched yet (hidden, the window behind) show as being searched,
  // and are once the page shows again (recheck).
  find(st, query, cx) {
    query = query.slice(0, 256);
    if (st.query !== query) { st.searchClosed = new Set(); ticket(st, "expand"); st.expanding = false; st.expandAll = false; }
    st.query = query;
    const words = terms(query), fresh = this.fresh(st, "search");
    this.changed(st); cx.notify();
    if (!words.length || !fresh()) return;
    cx.spawn(async (cx) => {
      await cx.sleep(200);
      if (!fresh()) return;
      const done = (found) => { st.found = { query, ...found }; this.changed(st); cx.notify(); };
      let found, more = false;
      if (st.on) {
        const r = await exec("sh", ["-c", REMOTE_SEARCH, "search", query], { cwd: st.root, on: st.on }).catch(() => null);
        if (!fresh()) return;
        if (!r || r.code !== 0) return done({ error: "Files can't be searched. Click to retry." });
        found = r.stdout.split("\n").filter(Boolean);
        more = found.length >= REMOTE_MAX;
      } else {
        if (!st.paths) {
          const r = st.git
            ? await exec("git", [...GIT, "ls-files", "-co", "--exclude-standard", "-z"], { cwd: st.root }).catch(() => null)
            : await exec("sh", ["-c", "find . -name .git -prune -o -type f -print | sed 's|^\\./||' | head -n 200000"], { cwd: st.root }).catch(() => null);
          if (!fresh()) return;
          if (!r || r.code !== 0) return done({ error: "Files can't be searched. Click to retry." });
          st.paths = r.stdout.split(st.git ? "\0" : "\n").filter(Boolean);
          st.lower = st.paths.map((p) => p.toLowerCase());
          st.last = null;
        }
        const from = narrows(query, st.last?.query) ? st.last.idx : null;
        const idx = await filterPaths(st.lower, words, from, () => cx.sleep(0), fresh);
        if (!idx) return;
        st.last = { query, idx };
        found = idx.map((i) => st.paths[i]);
      }
      const ranked = await rankPaths(found, words, RESULTS, () => cx.sleep(0));
      if (!fresh()) return;
      done({ results: ranked.map(path => ({ path })), total: found.length, more });
    });
  }

  // What the search field's words found, once they're searched.
  found(st) { return st.query.trim() && st.found?.query === st.query ? st.found : null; }

  // The menus' place: the space and tab they act on (menus.js closes one once they don't show).
  source(st) { return { space: st.id, tab: spaces().find(s => s.id === st.id)?.tabs.find(t => t.active)?.id, root: st.root, on: st.on }; }

  // A tree row's menu, at the pointer (or, from the keys, where the app puts one, its first row lit).
  rowMenu(st, path, keys = false) {
    const agent = terminalFor(st.id), editors = (knownTargets() ?? this.targets).filter(name => name !== "Finder");
    const n = rowItems({ remote: Boolean(st.on), platform: window()?.platform, agent, editors }).length;
    openMenu("row", { height: 8 + n * MENU_ROW }, { source: this.source(st), path, agent: agent ? { terminal: agent.terminal } : null, editors }, keys);
    this.opened = { id: `row:${path}`, at: Date.now() };
  }

  // A breadcrumb: the person's own move, so the tree takes the keyboard once it's there.
  navigate(st, path, cx) {
    if (path && path === st.trail && path !== st.folder) { this.pick(st, path, cx, false, true); return; }
    this.userNav = true;
    navigateFolder(path, st.trail ?? st.file ?? path, Boolean(st.file));
    this.sync(cx);
  }

  rows(st) {
    if (st.rows) return st.rows;
    let rows;
    const results = this.found(st)?.results;
    if (results) {
      const kids = pathEntries(results);
      rows = treeRows(p => sortEntries(kids.get(p) ?? []), p => !st.searchClosed?.has(p), true);
    }
    else rows = treeRows(folderEntries(st), p => st.expanded.has(p), true);
    st.index = treeIndex(rows);
    return st.rows = rows;
  }

  select(st, path) { st.selected = path; }

  /** @param {any} state */
  control(t, id, icon, label, press, state = {}) {
    const el = ghostButton(this, t, id, { icon: `${MOD}/icons/${icon}.svg`, label, act: press, surface: "chrome", ...state });
    const trigger = state.disabled ? div().flex_none().child(el).on_hover(glow(this, id)) : stop(this, t, id, el, 8);
    return tip(this, t, id, label, trigger);
  }

  // A row clicked or picked by the keys: lit, a file opened, a folder opened or closed.
  chooseRow(st, row, cx) {
    this.select(st, row.path); st.focus = row.path;
    if (row.dir) this.toggle(st, row.path, cx); else this.open(st, row.path, cx);
    cx.notify();
  }

  render(cx) {
    if (props()?.files) return menuView(this);
    const t = theme(), sp = spaces().find((s) => s.active);
    if (!sp) return div().id("t3-files").size_full();
    this.sync(cx);
    const st = this.stateFor(sp);
    // Lines changed: the editor made again, just after this draw, as an editor can't be made in one.
    const v = st.view;
    if (v?.code && v.wrap !== wrapLines()) cx.timer.after(0, (cx) => {
      if (st.view !== v || !v.code || v.wrap === wrapLines()) return;
      this.editor(v, st.file, this.small(v) && this.fits(v));
      cx.notify();
    });
    // Plain code shown: colored once left alone. Behind, not asked: a refresh draws it again once it's in front.
    else if (!v?.waiting && this.wantsColor(v) && this.shown()) this.colorLater(st, v, IDLE, cx);
    // The search field shows this space's words.
    if (this.searchFor !== st.id) { this.searchFor = st.id; if (this.search.value() !== st.query) this.search.set_value(st.query); }
    const width = this.size?.width ?? 800;
    return focusRoot(this, v_flex().id("t3-files").relative().size_full().min_h(0).text_color(t.foreground).text_size(13)
      .track_focus(this.handle).on_mouse_down("left", () => this.handle.focus())
      .on_size_change((size, cx) => { this.size = { width: size.width / zoom(), height: size.height / zoom() }; cx.notify(); })
      .when(Boolean(st.file) || st.folder !== null, el => el.child(this.toolbar(st, t)))
      .child(div().flex_1().min_h(0).child(st.file ? withNav(t, "t3-files", width, { content: this.content(st, t), head: this.searchHead(st, t), list: this.tree(st, t), open: this.navOpen, handle: this.navHandle })
        : v_flex().size_full().min_h(0).child(treeHead("t3-files-head", this.searchHead(st, t))).child(div().flex_1().min_h(0).child(this.tree(st, t))))));
  }

  // Only a file has a subheader; Markdown uses one icon toggle, not a segmented text control. 12 in, as the panel head above
  // (t3-tokens「规则」R1); 32 high, not T3's 40: its row's centre is the work column's pane header's (specs/files.md). Its controls
  // centred, as Review's bar, so Tree stays put between the pages. Open in, then
  // the three switches a group's gap apart, 8 between the two (P3); its buttons on chrome, as the head's (P7), their icons 14, as T3's file toolbar.
  toolbar(st, t) {
    const md = kindOf(st.file ?? "") === "markdown", code = shared(MARKDOWN) === "code";
    const parts = (st.trail ?? st.file)?.split("/").filter(Boolean) ?? [], current = st.folder ?? st.file;
    const crumb = (label, path, last) => {
      // The first, the root's, has its box at 12 and its words a sm button's 10 in, where Review's scope button has them, so
      // switching pages doesn't move the first letter (t3-tokens「规则」R1); its right stays a crumb's 2, before its ›.
      const id = `crumb-${path}`, el = div().id(id).flex_none().max_w(160).truncate().px(2).when(path === "", el => el.pl(10)).rounded(4).text_color(last ? t.foreground : t.dim).when(last, el => el.font_medium())
        .when(!last, el => el.cursor_pointer().role("button").accessibility_label(`Go to ${label}`).hover(s => s.text_color(t.foreground)).on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => this.navigate(st, path, cx)))
        .child(label);
      return last ? el : stop(this, t, id, el, 4);
    };
    // A folder's menu (menus.js), under its ›, its left edge with it; on while it's open, a second press closes it (trigger.js).
    const separator = path => { const id = `browse-${path}`, on = popupOpen(this, id, MENU_CLOSED);
      return stop(this, t, id, opener(this, { id, closed: MENU_CLOSED, onOpen: (b) => {
        openMenu("folder", { height: FOLDER_H, ...hang(b, MENU_W, { align: "start" }) }, { source: this.source(st), dir: path, file: st.file }, !b);
      } })(div().id(id).w(16).h(20).mx(2).rounded(4).flex_none().flex().items_center().justify_center().cursor_pointer()
        .when(on, s => s.bg(tint(t, "chrome", true))).when(!on, el => el.hover(s => s.bg(tint(t, "chrome", false)))))
      .child(svg(`${MOD}/icons/chevron-right.svg`).size(14).text_color(on ? t.foreground : t.dim)).role("button").accessibility_label(`Browse ${path || nameOf(st.root)}`), 4); };
    return h_flex().id("t3-files-toolbar").h(32).flex_none().px(12).gap(8).items_center()
        .child(h_flex().id("t3-files-breadcrumbs").flex_1().min_w(0).overflow_x_scroll().bg("#00000000").items_center().text_size(12)
          .when(Boolean(st.root), (el) => el.child(crumb(nameOf(st.root.replace(/\/$/, "")) || st.root, "", current === "")))
          .children(parts.flatMap((part, i) => [separator(parts.slice(0, i).join("/")), crumb(part, parts.slice(0, i + 1).join("/"), parts.slice(0, i + 1).join("/") === current)])))
        .child(this.openControl(st, t))
        .child(h_flex().id("t3-files-switches").flex_none().gap(GROUP_GAP).items_center()
          .child(this.control(t, "t3-files-render-mode", md && !code ? "code-xml" : "eye", md ? code ? "Show preview" : "Show code" : "Preview is not available for this file", cx => {
            if (!code && st.view?.text !== undefined && !st.view.code) this.editor(st.view, st.file, this.fits(st.view));
            setShared(MARKDOWN, code ? "preview" : "code"); cx.notify();
          }, { on: md && !code, disabled: !md, size: "sm", iconSize: 14 }))
          // Wrap or scroll long lines, this page's own choice.
          .child(this.control(t, "t3-files-wrap", "text-wrap", st.view?.code && (!md || code) ? wrapLines() ? "Disable word wrap" : "Enable word wrap" : "Word wrap is only available in code", (cx) => { setWrapLines(!wrapLines()); cx.notify(); }, { on: wrapLines(), disabled: !st.view?.code || md && !code, size: "sm", iconSize: 14 }))
          .child(this.control(t, "t3-files-nav-toggle", "folder-tree", !st.file ? "File explorer is always visible for folders" : this.navOpen ? "Hide file explorer" : "Show file explorer", cx => { this.navOpen = !this.navOpen; setNavOpen(this.navOpen); cx.notify(); }, { on: !st.file || this.navOpen, disabled: !st.file, size: "sm", iconSize: 14 })));
  }

  // T3's OpenInPicker in its header, outlined: the app's icon opens the file or folder there; ⌄ picks the app (menus.js,
  // open-in.js's list, Details' too), its menu's right edge with the pair's.
  openControl(st, t) {
    const names = knownTargets() ?? this.targets, target = names.includes(shared(KEY.openTarget)) ? shared(KEY.openTarget) : "Finder", available = !st.on && window()?.platform === "macos";
    const id = "t3-files-open-in", moreId = "t3-files-open-more";
    const hover = key => (over, cx) => { if (over) this.hot = key; else if (this.hot === key) this.hot = null; cx.notify(); };
    const hot = this.hot === id || within(this, [id]) ? "main" : this.hot === moreId || within(this, [moreId]) ? "more" : null;
    // The keyboard walks only an enabled half.
    const kept = (key, el) => available ? stop(this, t, key, el, 8) : el;
    return split(t, { id: "t3-files-open-group", mainId: id, moreId, chevron: `${MOD}/icons/chevron-down.svg`, size: "xs", surface: "chrome", hot, on: popupOpen(this, moreId, MENU_CLOSED), disabled: !available, label: `Open in ${target}`, moreLabel: "Choose editor" },
      main => tip(this, t, id, available ? `Open in ${target}` : "Local applications cannot open a remote file", kept(id, main.child(this.targetIcon(target, t, 14)).on_hover(hover(id))
        .when(available, el => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => { cx.stop_propagation(); launch(this.source(st), st.file ?? st.folder, target); })))),
      more => kept(moreId, more.on_hover(hover(moreId)).when(available, opener(this, { id: moreId, closed: MENU_CLOSED, onOpen: (b, cx) => {
        openMenu("open-in", { height: openInHeight(names), ...hang(b, MENU_W) }, { source: this.source(st), targets: names }, !b);
        cx.spawn(async cx => { this.targets = await installedTargets(); cx.notify(); });
      } }))));
  }

  targetIcon(name, t, size = 16) { return targetIcon(MOD, name, t, size); }

  // The file: Preview or Code for Markdown, the code, an image or why there's none. Only drawn with a file open.
  content(st, t) {
    const v = st.view, md = kindOf(st.file ?? "") === "markdown", code = shared(MARKDOWN) === "code";
    return div().id("t3-files-content").size_full().min_h(0).min_w(0).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .child(!v || v.loading ? loadingState(t, "t3-files-loading", "Loading the file…")
          // A file there's nothing to show of says why, as an empty page, with T3's Try again and a way to it in the tree.
          : v.problem ? v_flex().id("t3-files-problem").size_full().p(24).gap(12).items_center().justify_center().text_center().text_size(12).role("alert")
            .child(div().text_color(t.ansi1).child(v.problem))
            .child(div().max_w_full().whitespace_normal().child(st.file)).child(div().max_w_full().whitespace_normal().text_color(t.dim).child(st.root))
            .child(h_flex().gap(4)
              .child(this.control(t, "t3-files-retry-file", "refresh-cw", "Try reading the file again", cx => { st.view = { loading: true }; cx.notify(); this.open(st, st.file, cx, true); }))
              .child(this.control(t, "t3-files-locate", "folder-tree", "Locate the file in Files", cx => { this.navOpen = true; this.reveal(st, st.file, cx, true); })))
          : v.image ? div().size_full().p(16).flex().items_center().justify_center().child(image(v.image).max_w_full().max_h_full())
          // 12 in, the page's edge (t3-tokens「规则」R1), not T3's px-6.
          : md && !code ? div().id("t3-files-md").size_full().overflow_y_scrollbar().px(12).py(16).child(TextView.markdown(`t3-files-md-${st.id}-${st.file}`, v.text).selectable(true).scrollable(false).text_size(14))
          // Laid out at the width its room last held (nav-column.js holdWidth), cut off or short of it while the room moves.
          : v.code && v.lang && !v.colored && !this.fits(v) ? v_flex().size_full().min_h(0)
            .child(noticeBar(t, "t3-files-highlight", `Syntax highlighting is off for files over ${AUTO_MAX / 1024} KB.`, t.ansi3, "anyway", "Highlight anyway", (cx) => { v.force = true; this.editor(v, st.file, true); cx.notify(); }, this))
            .child(div().flex_1().min_h(0).child(this.codeView(v.code, v)))
          : v.code ? this.codeView(v.code, v)
          : div());
  }

  codeView(code, v) {
    const hold = this.codeHold;
    return div().id("t3-files-code").size_full().min_w(0).overflow_hidden()
      // Scrolled while plain: left so until opened again.
      .on_scroll_wheel(() => { if (!v.colored) v.scrolled = true; })
      .on_size_change((size, cx) => {
        const width = size.width / zoom();
        if (Math.abs(width - (hold.want ?? hold.at ?? -1)) < 1) return;
        holdWidth(hold, width, (ms, f) => cx.timer.after(ms, f));
        cx.notify();
      })
      // Always at the held width once known: switching between it and w_full laid the file out again, as long as the drag's step.
      .child(Editor.new(code).h_full().when(hold.at != null, (el) => el.w(hold.at)).when(hold.at == null, (el) => el.w_full()));
  }

  // The column's head: the search, as T3's ghost InputGroup, and Collapse all / Expand all. Its keys are the results'.
  searchHead(st, t) {
    this.rows(st);
    const folders = st.index.folders;
    // Buttons and the field 8 apart (t3-tokens「规则」P3).
    return h_flex().id("t3-files-search").flex_1().min_w(0).h_full().gap(8).items_center()
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        this.find(st, "", cx); this.search.set_value(""); this.treeHandle.focus();
        cx.stop_propagation();
        cx.notify();
      })
      .child(this.control(t, "t3-files-refresh", "refresh-cw", "Refresh files", cx => this.recheck(st, cx)))
      // A tab stop as every control is; Enter or Space on it goes into the field.
      .child(stop(this, t, "t3-files-search-field", div().id("t3-files-search-field").relative().flex_1().min_w(0).h(28).px(9).rounded(6).border_1().border_color(this.searchFocused ? t.accent : "#00000000")
        .when(Boolean(this.searchFocused), el => el.bg(t.background))
        .on_mouse_down("left", (_e, cx) => { this.search.focus(); cx.stop_propagation(); })
        .child(Input.new(this.search).w_full().h_full().text_size(12).text_color(t.foreground).accessibility_label("Search files"))
        .when(Boolean(this.searchFocused), el => el.child(div().id("t3-files-search-ring").absolute().inset_0().rounded(6).border(3).border_color(alpha(t.accent, "3d")))), 6, { enter: () => this.search.focus() }))
      .when(folders > 0, el => el.child(this.control(t, "t3-files-fold-all", this.allExpanded(st) ? "chevrons-down-up" : "chevrons-up-down", this.allExpanded(st) ? "Collapse all folders" : "Expand all folders", cx => this.foldAll(st, cx))));
  }

  // Collapse all while any folder is open; else open every folder, Git-ignored ones aside, EXPAND_MAX at most.
  allExpanded(st) { this.rows(st); return Boolean(st.expandAll || st.index.allExpanded); }

  foldAll(st, cx) {
    const collapse = this.allExpanded(st);
    st.expandAll = !collapse;
    const go = this.fresh(st, "expand"); // Collapse invalidates the in-flight expansion before any awaited read can reopen a folder.
    st.expanding = !collapse;
    const results = this.found(st)?.results;
    if (results) { st.expanding = false; st.searchClosed = collapse ? new Set([...pathEntries(results).keys()].filter(Boolean)) : new Set(); this.changed(st); cx.notify(); return; }
    if (collapse) { st.expanded.clear(); this.changed(st); cx.notify(); return; }
    cx.notify();
    cx.spawn(async (cx) => {
      const queue = [""];
      for (let n = 0; queue.length && n < EXPAND_MAX && go();) {
        const batch = queue.splice(0, Math.min(4, EXPAND_MAX - n));
        n += batch.length;
        await Promise.all(batch.map(async rel => {
          if (!go()) return;
          if (!st.entries.has(rel)) await this.list(st, rel);
          if (!go()) return;
          if (rel) st.expanded.add(rel);
          for (const e of st.entries.get(rel) ?? []) if (e.dir && !st.ignored.has(join(rel, e.name))) queue.push(join(rel, e.name));
        }));
      }
      if (!go()) return;
      st.expanding = false;
      this.changed(st);
      cx.notify();
    });
  }

  // A folder that couldn't be listed, at its row's end: `ansi1` words (t3-tokens: the destructive color is text only), the reason
  // on hover; a click reads it again, and doesn't open or close it.
  retryMark(st, t, path, retry) {
    const id = `t3-files-retry-${path}`;
    return tip(this, t, id, st.errors.get(path), div().id(id).flex_none().text_size(12).text_color(t.ansi1).cursor_pointer().role("button")
      .accessibility_label("Can't list this folder. Retry").child("Can't list · Retry").on_hover(glow(this, id))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => { cx.stop_propagation(); retry(path, cx); }), { below: true });
  }

  // The folder's tree, as T3's: a click opens a file or a folder; the keys move a ring, ↵ opens what it's on. The ring shows
  // only once the keys move in it (focus-visible), not for a click.
  tree(st, t) {
    if (!st.root) return div().p(8).text_size(12).text_color(t.dim).child("This space has no folder.");
    const retry = (path, cx) => cx.spawn(async (cx) => { await this.list(st, path); cx.notify(); });
    // The top folder unread: nothing else to draw, so its error is the page's. Any other says so on its own row (draw).
    if (st.errors.has("") && !st.entries.has("")) return div().id("t3-files-retry-").p(16).text_size(12).text_color(t.ansi1).cursor_pointer()
      .child("This folder can't be listed. Click to retry.").on_click((_e, cx) => retry("", cx));
    const found = this.found(st);
    if (found?.error) return div().p(16).text_size(12).text_color(t.ansi1).cursor_pointer().on_click((_e, cx) => this.find(st, st.query, cx)).child(found.error);
    if (!st.entries.has("") || st.query.trim() && !found) return div().id("t3-files-tree-loading").px(12).py(4).text_size(12).text_color(t.dim).child("Loading files…");
    const rows = this.rows(st);
    if (!rows.length) return st.query.trim() ? div().id("t3-files-no-matches").px(12).py(16).text_size(12).text_color(t.dim).child("No matching files.") : div();
    const ringed = this.treeHandle.is_focused() && this.treeKeys ? st.index.at.get(st.focus ?? st.file) ?? -1 : -1, selected = st.index.at.get(st.selected) ?? -1;
    const draw = (r, i) => {
      let label;
      if (r.dir && r.top !== r.path) {
        let path = parentOf(r.top);
        label = h_flex().min_w(0).overflow_hidden().gap(2).items_center().children(r.name.split(" / ").flatMap((name, j) => {
          path = join(path, name); const segment = path;
          const el = div().min_w(0).truncate().hover(s => s.underline()).child(name).on_click((_e, cx) => { cx.stop_propagation(); this.select(st, segment); st.focus = segment; this.toggle(st, r.path, cx); });
          return j ? [div().flex_none().text_color(t.dim).child("/"), el] : [el];
        }));
      }
      return treeRow(t, MOD, { ...r, label }, `row-${r.path}`, { selected: i === selected, focused: i === ringed, context: popupOpen(this, `row:${r.path}`, MENU_CLOSED), dim: r.ignored,
        drag: { path: join(st.root, r.top), on: st.on },
        guides: this.treeHot === "tree",
        trailing: r.dir && st.errors.has(r.path) ? this.retryMark(st, t, r.path, retry)
          : r.dir && r.open && st.loading.has(r.path) ? svg("mods/workspace-chrome/spinner.svg").size(14).text_color(t.dim).spin(900) : null })
        .on_click((_e, cx) => this.chooseRow(st, r, cx))
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.rowMenu(st, r.path); cx.notify(); });
    };
    return hoverKept(this, "treeHot", "tree", div().id("t3-files-tree").size_full().track_focus(this.treeHandle).tab_index(0)
      .on_mouse_down("left", (_e, cx) => { this.treeKeys = false; this.treeHandle.focus(); cx.stop_propagation(); })
      .on_key_down((e, cx) => {
        const at = rows.findIndex((r) => r.path === (st.focus ?? st.file));
        // Shift+F10 opens the row's menu, as a right-click on it.
        if (e.keystroke === "shift-f10") { const row = rows[at]; if (row) this.rowMenu(st, row.path, true); cx.stop_propagation(); cx.notify(); return; }
        const k = treeKey(e.key, rows, at);
        if (!k) return;
        this.treeKeys = true;
        if (k.at !== undefined) { st.focus = rows[k.at].path; revealRow(this, `t3-files-tree-${st.id}`, st.focus); }
        else if (k.pick) this.chooseRow(st, k.pick, cx);
        else { st.focus = k.toggle.path; this.toggle(st, k.toggle.path, cx); }
        cx.stop_propagation();
        cx.notify();
      })
      .child(v_flex().size_full().min_h(0)
        .when(Boolean(found && (found.more || found.total > found.results.length)), el => el.child(div().px(12).py(4).text_size(12).text_color(t.dim).child("More matches available. Refine your search.")))
        .child(div().flex_1().min_h(0).child(treeList(this, `t3-files-tree-${st.id}`, rows, draw)))));
  }

}
