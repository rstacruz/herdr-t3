// Home as a still picture in asciicn's style (https://asciicn.dev, MIT, see LICENSE-asciicn): one of its own, or one of the
// person's images drawn in Dots/Braille/Blocks/Quadrants, in the theme's colours.
// Every picture, saved or previewed, is drawn one way: its tiles put together in the theme's colours as one image
// (library.js), which GPUI rasterises once off the UI thread and scales on the GPU. A new theme makes another, and until it
// is ready the old one stays up; the layout's other appearance's is made ahead (warm()), so light/dark switches at once.
// The pointer near the bottom-right corner shows the switcher: ‹ › step, the crop button frames the picture shown, `+` opens
// a menu of where a new one comes from; an image dropped on Home is one too. A new or reframed picture is edited across Home
// with the framing card in the switcher's place; only Apply publishes an import's .ans, and any picture's framing.
// The picture picked is the person's, shared under KEY.wallpaper, so a new Home shows it too.
// With props.menu this mod is + 's menu, opened as a popup: its picks go back to the Home that opened it as commands.
//
// Without saved framing a picture covers Home: it scales with the pane's height, its subject (`focus`) pinned by a
// percentage, so a width change (the sidebar folding) only shows more or less of its edges; one narrower than the pane fills
// the width and is cut evenly at the top and bottom. Saved framing (cover/contain, zoom, alignment) is relative too.
// Reaching Home other than by t3-tabs (which lays it out first), the pane shows for a frame or two 60px short (still under
// `main`'s header and the unfolded tab row, see t3-tabs' fitRow) before it takes its height: the picture hangs from the
// bottom, which stays put, and a smaller height counts only once it has lasted 250ms, so that dip neither moves nor rescales it.
// shortcut: imports go through sh, cp, rm, cksum and base64, the dialog through osascript (macOS) or zenity (Linux), an image
// through sips (macOS) or ImageMagick (Linux); on Windows the menu offers no file dialog, until Herdr gives mods a file picker.
import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex, SliderState, Slider, SliderTrack, SliderIndicator, SliderThumb } from "gpui-base";
import { checking, appHome, closeOverlay, exec, nextCommand, notify, openOverlay, props, run, settings, setShared, shared, theme, themes, watchFolder, window } from "herdr";
import { SCENES } from "./scenes.js";
import { imageAns, sampleImage } from "./ascii-art.js";
import { KEY, Library, MOD, finish, isLight, madePicture, makePicture, pictureKey, pictureSide, placement, tick } from "./library.js";
import { readImage } from "./source.js";
import { fromSlider, nextPreset, pan, scroll, toSlider, zoomAt } from "./framing.js";
import { enter, focusRoot, stop, stopsEnd, stopsInit } from "./focus.js";
import { DISABLED, button as drawButton, ghostButton, radiusOf } from "./button.js";
import { FADE, POINTER_WATCH, dragGone, pointerMoved, tip } from "./tip.js";
import { popupOpen, trigger } from "./trigger.js";
import { MENU_ROW, menuRow } from "./menu-row.js";
import { menuKeys, litProp, propsLit } from "./list.js";
import { closedKey } from "./store.js";

const STYLES = [['dots', 'Dots'], ['braille', 'Braille'], ['blocks', 'Blocks'], ['quadrants', 'Quadrants']];
const styleName = (style) => STYLES.find(([id]) => id === style)?.[1] ?? style;
const zoom = () => Number(settings()?.zoom) || 1;
// Where the pointer shows the switcher: it at its widest, 12 from the corner, and about 60 more each way.
const CORNER = { w: 368, h: 104 };
const opener = () => ({ macos: "open", windows: "explorer" })[window()?.platform] ?? "xdg-open";
const ARROWS = ['left', 'right', 'up', 'down'];
const plainKey = (e) => !e.modifiers.control && !e.modifiers.platform && !e.modifiers.alt;
const icon = (name) => `mods/${MOD}/icons/${name}.svg`;
const token = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// + 's menu. Windows has no file dialog for mods: there an image comes by dropping it on Home, and the menu has the folder.
const MENU_CLOSED = closedKey(MOD, "menu"), MENU_W = 260;
const menuItems = (windows) => [
  ...(windows ? [] : [{ id: "image", label: "Choose image…", icon: "image" }]),
  { id: "folder", label: "Open wallpaper folder", icon: "folder" },
];
const menuHeight = (items) => 8 + items.length * MENU_ROW;
// Waits (docs/internals/specs/wallpaper.md): an indicator only once a wait passes SHOW ms, then kept at least KEEP ms, so
// nothing flashes. FILL: the progress bar's last stretch, while Home loads the first picture.
const SHOW = 150, KEEP = 300, FILL = 400;
// What macOS says of each screen: [x, y (from the top of the first), width, height, backing scale]. Shared by every Home:
// the list, the window middle it was last asked for, and whether it is being asked.
const SCREENS = 'ObjC.import("AppKit"); const s = $.NSScreen.screens, top = s.objectAtIndex(0).frame.size.height, out = [];'
  + ' for (let i = 0; i < s.count; i++) { const n = s.objectAtIndex(i), f = n.frame;'
  + ' out.push([f.origin.x, top - f.origin.y - f.size.height, f.size.width, f.size.height, n.backingScaleFactor]); } JSON.stringify(out)';
let screens = null, screensAt = null, askingScreens = false;

export default class Wallpaper extends View {
  init(_props, cx) {
    if (props()?.menu === "add") {
      this.menuAt = propsLit();
      this.menuKeys = cx.focus_handle();
      this.menuKeys.focus();
      return;
    }
    stopsInit(this, cx);
    this.dir = `${appHome()}/${MOD}`;
    this.lib = new Library(this.dir);
    // A file imported now is made at what Home would show it at, as it would be without framing.
    this.lib.fit = (w, h) => this.need(w, h, placement(null, 0.5), this.scaleNow ?? 2);
    this.builtIn = SCENES.map((s) => ({ ...s, dir: `${this.dir}/.builtin/${s.id}` }));
    this.height = null;
    this.over = false;
    this.hot = null;
    this.draft = null;
    // Waits by key ({ since, end? }, track()), the picture paths loaded, and the last one shown, held up while the next loads:
    // { scene, path, p } (layers()).
    this.waits = {};
    this.loaded = new Set();
    this.held = null;
    // Momentum after a lift (framing.js scroll).
    this.gesture = {};
    this.composeFocus = cx.focus_handle();
    this.zoomFocus = cx.focus_handle();
    // Logarithmic: framing.js toSlider.
    this.scale = SliderState.new({ min: 0, max: 1, step: 0.001, value: 0 });
    this.scale.on("change", (value, cx) => {
      const d = this.draft, z = Math.max(1, Math.min(4, fromSlider(value)));
      if (!d || Math.abs(d.placement.zoom - z) < 1e-6) return;
      this.zoomFocus.focus();
      this.zoomBy(d, z / d.placement.zoom, null, cx);
    });
    if (!checking()) cx.spawn(async (cx) => {
      await this.lib.ready;
      await this.lib.refresh(cx);
      // Our own cache writes land here too: only an .ans file, or a batch that means everything, is news.
      for (;;) if ((await watchFolder(this.dir)).some((p) => p === this.dir || p.endsWith(".ans"))) await this.lib.refresh(cx);
    });
    cx.spawn(async (cx) => { for (;;) this.command(await nextCommand(), cx); });
  }

  // A command for this mod: Herdr's "focus", a confirmed deletion, or a pick from the menu this Home opened.
  async command(command, cx) {
    if (command === "focus") enter(this, cx, this.draft ? "wallpaper-compose" : "wallpaper-add");
    else if (this.deleting && command === `delete:${this.deleting.token}`) {
      const { scene } = this.deleting;
      this.deleting = null;
      await this.cancelPreview(cx);
      if (await this.lib.remove(scene, this.all(), cx)) this.hot = null;
    } else if (this.menuToken && command.startsWith(`add:${this.menuToken}:`)) {
      this.menuToken = null;
      await this.choose(cx);
    }
    if (!this.closed) cx.notify();
  }

  close() {
    if (props()?.menu === "add") { setShared(MENU_CLOSED, Date.now()); return; }
    stopsEnd(this);
    this.closed = this.lib.closed = true;
    this.previewRequest = null;
    this.drag = null;
    this.scale.release();
    const draft = this.draft;
    this.draft = null;
    if (draft?.job) draft.job.cancelled = true;
    if (draft) exec("rm", ["-rf", draft.dir]).catch(() => null);
  }

  all() { return [...this.builtIn, ...this.lib.imported]; }

  // Above +, its right edge on +'s. A popup's `at` is its top left, in zoomed px.
  openMenu(b) {
    const z = zoom(), height = menuHeight(menuItems(window()?.platform === "windows"));
    this.menuToken = token();
    const at = b && { x: Math.max(0, b.x + b.width - MENU_W * z), y: Math.max(0, b.y - (height + 6) * z) };
    openOverlay({ mod: MOD, kind: "popup", width: MENU_W, height, ...(at ? { at } : {}), props: { menu: "add", token: this.menuToken, ...litProp(!b) } });
  }

  // menu-row.js's rows.
  renderMenu(t) {
    const p = props(), items = menuItems(window()?.platform === "windows");
    const pick = (i) => {
      const it = items[i];
      if (!it) return;
      closeOverlay(p.overlay);
      if (it.id === "folder") exec(opener(), [`${appHome()}/${MOD}`]);
      else run(`${MOD}.add:${p.token}:${it.id}`);
    };
    return v_flex().id("wallpaper-menu").size_full().p(4).bg(t.popover).track_focus(this.menuKeys)
      .on_key_down(menuKeys(this, items.map((it) => it.label), pick, { at: "menuAt" }))
      .children(items.map((it, i) => menuRow(this, t, `wallpaper-menu-${it.id}`, {
        at: [this, "menuAt", i], icon: icon(it.icon), label: it.label, pick: () => pick(i) })));
  }

  // No activate (a macOS focus timeout) or default location (an extra Downloads permission prompt).
  async choose(cx) {
    if (this.opening) return;
    this.opening = true;
    cx.notify();
    const mac = window()?.platform === "macos";
    const title = "Choose an image for your wallpaper";
    const picked = await (mac
      ? exec("osascript", ["-e", `POSIX path of (choose file with prompt "${title}" of type {"public.image"})`], { timeout: 600000 })
      : exec("zenity", ["--file-selection", `--title=${title}`,
        "--file-filter=Images | *.png *.jpg *.jpeg *.webp *.gif *.bmp *.tif *.tiff *.heic"], { timeout: 600000 })).catch(() => null);
    this.opening = false;
    cx.notify();
    if (this.closed) return;
    if (!picked) {
      notify({ title: "No file dialog here", body: "Drop the image on Home instead.", level: "info" });
      return;
    }
    const from = picked.stdout.replace(/\r?\n$/, "");
    // Cancelled: osascript's -128, zenity's 1, nothing said.
    if (picked.code !== 0 || !from) return;
    return this.open(from, cx);
  }

  // An image chosen or dropped, drawn in a mode.
  open(from, cx) {
    let base = from.split("/").pop().replace(/\.[^.]*$/, "").replace(/[\x00-\x1f\x7f/\\]/g, "-");
    if (!base || base === "." || base === "..") base = "wallpaper";
    return this.startPreview(from, base, cx);
  }

  /**
   * A draft across Home: of an image file (drawn in any mode), or `saved`, a picture already there (built in or added) to
   * frame again, as it is drawn. `phase`: loading, converting, ready, applying, or broken
   * (nothing drawn to apply); `message`, what went wrong; `frames`, each mode drawn so far, `{ scene, text }`.
   */
  async startPreview(from, name, cx, saved = null) {
    const cancelled = this.cancelPreview(cx), request = this.previewRequest = {};
    await cancelled;
    await this.lib.ready;
    if (this.closed || this.previewRequest !== request) return;
    const id = token(), image = !saved;
    const d = this.draft = { id, name, image, dir: `${this.dir}/.preview/${id}`, style: 'dots', drawn: null, frames: {}, pixels: null, plan: null,
      text: null, scene: saved, saved, phase: saved ? 'ready' : 'loading', message: null, progress: image ? 0 : null, placement: placement(saved ? shared(KEY.placements)?.[saved.id] : null, saved?.focus) };
    this.scale.set_value(toSlider(d.placement.zoom));
    // This full-Home editor has no terminal underneath; pointer imports need focusable controls too.
    /** @type {any} */ (this).fs.modal = true;
    this.composeFocus.focus();
    cx.notify();
    if (saved) return;
    const current = () => this.draft === d;
    try {
      const made = await exec("mkdir", ["-p", d.dir]);
      if (made.code !== 0) throw new Error(made.stderr.trim());
      const read = await readImage(from, d.dir, cx, current, (f) => { if (current()) { d.progress = f / 2; cx.notify(); } });
      if (!read || !current()) return;
      Object.assign(d, read);
      return await this.renderDraft(d, cx);
    } catch (e) {
      if (current()) { d.phase = 'broken'; d.message = `${e?.message ?? e}`; }
    } finally {
      if (!current()) await exec("rm", ["-rf", d.dir]);
      if (!this.closed) cx.notify();
    }
  }

  // Makes the draft's picture for the theme now; the draft shows it once made.
  async showDraft(d, scene, cx, current) {
    const made = await makePicture(scene, theme(), isLight(), (w, h) => this.need(w, h, d.placement, this.scaleNow ?? 2), cx, current);
    if (!made || !current()) return false;
    d.scene = { ...scene, width: made.width, height: made.height, ...(made.paper ? { paper: true } : {}) };
    return true;
  }

  async setStyle(style, cx) {
    const d = this.draft;
    if (!d?.pixels || d.phase === 'applying' || !STYLES.some(([id]) => id === style) || d.style === style) return;
    d.style = style;
    return this.renderDraft(d, cx);
  }

  // Draws the draft's pixels in its mode, in a folder of this generation's own: a newer one cancels it. A mode drawn before
  // comes back as it was; one that fails goes back to the mode shown, saying why.
  async renderDraft(d, cx) {
    if (d.job) d.job.cancelled = true;
    const style = d.style, kept = d.frames[style];
    if (kept) {
      d.job = null;
      Object.assign(d, { scene: kept.scene, text: kept.text, drawn: style, phase: 'ready', message: null });
      cx.notify();
      if (d.waiting) await this.applyPreview(cx);
      return;
    }
    const n = d.generation = (d.generation ?? 0) + 1, job = d.job = { cancelled: false }, dir = `${d.dir}/frame-${n}`;
    const current = () => this.draft === d && d.job === job && !job.cancelled;
    d.phase = 'converting';
    d.message = null;
    this.drag = null;
    cx.notify();
    let done = false;
    try {
      // The first drawing carries on the reading's progress; Home shows it once loaded.
      const step = (f) => { if (!d.drawn && d.progress != null) { d.progress = f; cx.notify(); } };
      await tick(cx);
      const sampled = await finish(sampleImage(d.pixels, style, d.plan), cx, current);
      if (!current()) return;
      step(0.6);
      const text = await finish(imageAns(sampled, style), cx, current);
      if (!current()) return;
      step(0.7);
      if (!(await this.showDraft(d, { id: `preview:${d.id}:${n}`, name: d.name, dir, text, focus: 0.5 }, cx, current))) return;
      step(0.9);
      d.text = text;
      d.frames[style] = { scene: d.scene, text };
      d.drawn = style;
      d.phase = 'ready';
      done = true;
    } catch (e) {
      if (current()) {
        d.message = `${e?.message ?? e}`;
        d.waiting = false;
        if (d.drawn) { d.style = d.drawn; d.phase = 'ready'; } else d.phase = 'broken';
      }
    } finally {
      if (this.draft !== d) await exec('rm', ['-rf', d.dir]);
      else if (!done && d.frames[style]?.scene.dir !== dir) await exec('rm', ['-rf', dir]);
      if (!this.closed) cx.notify();
    }
    if (done && d.waiting && this.draft === d) await this.applyPreview(cx);
  }

  async cancelPreview(cx) {
    const d = this.draft;
    this.draft = null;
    if (d) for (const key of Object.keys(this.waits)) if (key.endsWith(`:${d.id}`)) delete this.waits[key];
    if (d?.job) d.job.cancelled = true;
    this.previewRequest = null;
    this.drag = null;
    /** @type {any} */ (this).fs.modal = false;
    if (d) await exec("rm", ["-rf", d.dir]);
    if (!this.closed && !this.draft && /** @type {any} */ (this).fs.keyboard) enter(this, cx, "wallpaper-add");
    if (!this.closed) cx.notify();
  }

  // A picture already there saves only its framing; a new one its drawing too, its preview picture kept (library.js
  // publish). While a mode is drawing, Apply waits for it. Done, the switcher shows the name for a moment.
  async applyPreview(cx) {
    const d = this.draft;
    if (d?.phase === 'converting' && d.scene) { d.waiting = true; cx.notify(); return; }
    if (d?.phase !== 'ready') return;
    this.drag = null;
    d.phase = 'applying';
    d.waiting = false;
    d.message = null;
    cx.notify();
    try {
      if (d.saved) this.lib.frame(d.saved.id, d.placement);
      else if (!(await this.lib.publish(d, cx, () => this.draft === d && !this.closed))) return;
      await this.cancelPreview(cx);
      this.shownUntil = Date.now() + 1500;
      cx.timer.after(1500, (cx) => cx.notify());
    } catch (e) {
      if (this.draft !== d || this.closed) return;
      d.phase = 'ready';
      d.message = `${e?.message ?? e}`;
      notify({ title: "Couldn't import the wallpaper", body: `${d.name}: ${d.message}`, level: "warning" });
      cx.notify();
    }
  }

  askRemove(scene) {
    const t = token();
    this.deleting = { scene, token: t };
    openOverlay({ mod: "t3-actions", kind: "dialog", frame: "none", width: 512, props: {
      actions: "confirm", title: `Delete ${scene.name}?`,
      detail: "This permanently deletes the imported wallpaper and its cached drawing. Your original image is kept.",
      yes: "Delete", command: { name: `${MOD}.delete:${t}` },
    } });
  }

  /**
   * The picture for the theme now: made, being made (the last one of this scene stays up meanwhile), or failed. `small`:
   * the one made is smaller than `fit` (makePicture) wants, so a larger one is being made, the smaller one up meanwhile.
   */
  pictureOf(scene, t, fit, cx) {
    const light = isLight(), key = pictureKey(scene, t, light), made = madePicture(key);
    const small = !!made?.path && !made.error && made.px < fit(made.width, made.height);
    if (made?.path && !small) return { path: made.path, small };
    if (!made?.error && !made?.promise && this.asked !== key) {
      this.asked = key;
      const d = this.draft;
      cx.timer.after(0, (cx) => cx.spawn(async (cx) => {
        try { await makePicture(scene, t, light, fit, cx); }
        catch (e) {
          if (d && d === this.draft && d.scene === scene) d.message = `${e?.message ?? e}`;
          else if (!d) notify({ title: "Couldn't draw the wallpaper", body: `${scene.name}: ${e?.message ?? e}`, level: "warning" });
        }
        // Asked again if it is let go later (library.js draw: a newer palette took its file).
        if (this.asked === key) this.asked = null;
        if (!this.closed) cx.notify();
      }));
    }
    return { path: made?.path ?? null, small };
  }

  /**
   * The backing scale of the screen the window is on (2 on Retina), null while macOS is asked; off macOS, 2.
   * shortcut: matched by the window's middle x alone (GPUI gives its y on its own screen), taking the largest of screens
   * stacked there, and asked again only for a place no screen known covers; upgrade once mods can read Window::scale_factor.
   */
  screenScale(cx) {
    if (checking()) return 2;
    if (window()?.platform !== "macos") return 2;
    const b = /** @type {any} */ (globalThis).window?.bounds?.(), x = b ? b.x + b.width / 2 : 0;
    const on = (screens ?? []).filter(([left, , width]) => x >= left && x < left + width);
    if (on.length && !askingScreens) return Math.max(...on.map((s) => s[4]));
    if (!askingScreens && screensAt !== x) {
      screensAt = x;
      askingScreens = true;
      cx.timer.after(0, (cx) => cx.spawn(async (cx) => {
        const said = await exec("osascript", ["-l", "JavaScript", "-e", SCREENS]).catch(() => null);
        let list = null;
        try { list = JSON.parse(said?.stdout ?? ""); } catch { list = null; }
        screens = Array.isArray(list) ? list.filter((s) => Array.isArray(s) && s.length === 5 && s.every(Number.isFinite)) : screens ?? [];
        askingScreens = false;
        if (!this.closed) cx.notify();
      }));
    }
    return askingScreens ? null : 2;
  }

  // The px the picture needs on its long edge as Home shows it at framing `p`: its size × the app's zoom × the screen's
  // scale, up to pictureSide's step.
  need(width, height, p, scale) {
    return pictureSide(Math.max(...this.size({ width, height }, p)) * zoom() * scale);
  }

  /**
   * Whether wait `key`, going on now or not (`on`), shows its indicator: only once it has lasted SHOW, and then until at least
   * KEEP after that. Called as each render sees the wait; its own timers bring the render that shows or ends it.
   */
  track(key, on, cx) {
    const now = Date.now(), w = this.waits[key];
    if (on) {
      if (!w) { this.waits[key] = { since: now }; cx.timer.after(SHOW, (cx) => cx.notify()); return false; }
      w.end = null;
      return now - w.since >= SHOW;
    }
    if (!w) return false;
    w.end ??= Math.max(now, w.since + SHOW + KEEP);
    if (now - w.since < SHOW || now >= w.end) { delete this.waits[key]; return false; }
    cx.timer.after(w.end - now, (cx) => cx.notify());
    return true;
  }

  // Home's picture layer: the picture wanted, once loaded; until then the last one shown, so Home is never bare between them.
  // image() says nothing when it has loaded, nor reports its own size, so a copy at its own size (GPUI sizes an unsized image
  // only once it has it), clipped to nothing, makes the box around it grow then, which that box reports. The layer is keyed by
  // its picture: a new one starts whole, with nothing to fade in from. `dim` fades it while a mode is drawing.
  layers(scene, p, path, dim) {
    const fade = dim ? 0.7 : 1, ready = !!path && this.loaded.has(path);
    // The same picture, or an earlier mode of this draft (one framing for all its modes), moves with the framing; another,
    // such as the last picture under a new draft, stays where it was.
    const mine = (s) => s.id === scene.id || (!!this.draft && (s.id === `preview:${this.draft.id}` || s.id.startsWith(`preview:${this.draft.id}:`)));
    const at = (shown) => ({ ...shown, p: mine(shown.scene) ? p : shown.p });
    const layer = ({ scene: s, path: src, p: pp }) => {
      const [w, h] = this.size(s, pp);
      return div().id(`wallpaper-at:${src}`).absolute().bottom((this.height - h) * (1 - pp.y)).left(`${pp.x * 100}%`).ml(-pp.x * w).w(w).h(h)
        .opacity(fade).transition("opacity", FADE).child(image(src).id("wallpaper-picture").size_full());
    };
    if (ready) this.held = { scene, path, p };
    // Only what is drawn stays loaded: the host may let any other go, so coming back, it is loaded again first. The other
    // appearance's is drawn out of sight (warm).
    for (const had of this.loaded) if (had !== this.held?.path && had !== this.warmed) this.loaded.delete(had);
    return [this.held && layer(at(this.held)), path && !ready && this.probe(path, "wallpaper-probe")].filter(Boolean);
  }

  // A copy of picture `path` at its own size, clipped to nothing: its box reports a size once the image has loaded (layers()).
  probe(path, id) {
    return div().id(`${id}:${path}`).absolute().size(0).overflow_hidden().child(div().id(`${id}-size`).absolute()
      .on_size_change((size, cx) => {
        if (!size.width || this.loaded.has(path)) return;
        this.loaded.add(path);
        if (!this.closed) cx.notify();
      }).child(image(path).id(`${id}-image`)));
  }

  // The picture for the layout's other appearance (settings' theme_light or theme_dark), made once this one shows and drawn
  // out of sight from then on: switching between light and dark shows it in the same frame, never this one on the other's
  // background. Its path once made, else null.
  // `fit` as this one's; a larger one only once this one's larger one is up (`grow`), so it doesn't slow that one down.
  warm(scene, fit, grow, cx) {
    const s = settings();
    if (typeof s?.dark !== "boolean") return null;
    const light = s.dark, colours = themes().find((x) => x.name === (light ? s.theme_light : s.theme_dark))?.colors;
    if (!colours) return null;
    const t = { ...colours, .../** @type {Record<string, string>} */ (s.colors) }, made = madePicture(pictureKey(scene, t, light));
    if (grow && !made?.promise && !made?.error && !(made?.path && made.px >= fit(made.width, made.height))) {
      cx.timer.after(0, (cx) => cx.spawn(async (cx) => { await makePicture(scene, t, light, fit, cx).catch(() => null); if (!this.closed) cx.notify(); }));
    }
    return made?.path ?? null;
  }

  render(cx) {
    const t = theme();
    if (props()?.menu === "add") return this.renderMenu(t);
    const all = this.all(), d = this.draft;
    const i = Math.max(0, all.findIndex((s) => s.id === shared(KEY.wallpaper))), scene = d?.scene ?? all[i];
    const root = div().id("wallpaper").size_full().relative().overflow_hidden()
      .on_size_change((size, cx) => {
        const height = this.seen = Math.round(size.height / zoom()), width = Math.round(size.width / zoom());
        if (width !== this.width) { this.drag = null; this.width = width; cx.notify(); }
        if (!this.height || height > this.height) { this.drag = null; this.height = height; cx.notify(); }
        else if (height < this.height) cx.timer.after(250, (cx) => { if (this.seen < this.height) { this.drag = null; this.height = this.seen; cx.notify(); } });
      })
      // No drag-over event: Home can't light up as a file comes over it. The first file counts.
      .on_drop(({ paths }, cx) => { if (paths?.[0] && this.draft?.phase !== 'applying') cx.spawn((cx) => this.open(paths[0], cx)); });
    if (!this.height) return root;
    const p = placement(d?.scene ? d.placement : shared(KEY.placements)?.[scene.id], scene.focus);
    // A picture being drawn again (library.js refresh) has no files to show meanwhile, nor one before the screen's scale is
    // known: the last one stays up.
    const scale = this.scaleNow = this.screenScale(cx) ?? this.scaleNow, fit = (w, h) => this.need(w, h, p, scale);
    const { path, small } = this.picture = scene.redrawing || !scale ? { path: null, small: false } : this.pictureOf(scene, t, fit, cx);
    const loaded = !!path && this.loaded.has(path);
    this.warmed = !d && loaded ? this.warm(scene, fit, !small, cx) : null;
    if (d) {
      if (loaded && d.scene) d.shown = true;
      // The waits the card shows: the first picture (read, drawn, loaded), a mode or theme redrawing, a larger one for a zoom
      // (the picture not dimmed meanwhile), Apply.
      const waits = { load: this.track(`load:${d.id}`, !d.shown && ['loading', 'converting', 'ready'].includes(d.phase), cx),
        draw: this.track(`draw:${d.id}`, !!d.shown && (d.phase === 'converting' || !loaded), cx),
        larger: this.track(`larger:${d.id}`, !!d.shown && small, cx),
        apply: this.track(`apply:${d.id}`, d.phase === 'applying', cx) };
      return focusRoot(this, root.children(this.layers(scene, p, path, waits.draw))
        .when(Boolean(d.scene), (el) => el.child(this.compositionCanvas(t))).child(this.card(t, waits)));
    }
    const picture = this.layers(scene, p, path, false), waiting = this.track("picture", !loaded || small, cx);
    if (this.warmed) picture.push(this.probe(this.warmed, "wallpaper-warm"));
    const button = (id, name, label, act, disabled = false) => tip(this, t, id, label,
      stop(this, t, id, ghostButton(this, t, id, { icon: icon(name), label, act, disabled, surface: "chrome" }), radiusOf("xs")));
    const go = (by) => () => setShared(KEY.wallpaper, all[(i + by + all.length) % all.length].id);
    const menuUp = popupOpen(this, "wallpaper-add", MENU_CLOSED);
    const shown = this.over || this.opening || menuUp || Date.now() < (this.shownUntil ?? 0) || /** @type {any} */ (this).fs.keyboard;
    const spinner = (size) => svg("mods/workspace-chrome/spinner.svg").size(size).flex_none().text_color(t.dim).spin(900);
    const switcher = h_flex().id("wallpaper-switcher").absolute().right(12).bottom(12).p(4).gap(4).items_center()
      .rounded(8).bg(t.chrome).text_size(12).text_color(t.dim)
      .opacity(shown ? 1 : 0).transition("opacity", FADE)
      .child(button("wallpaper-back", "chevron-left", "Previous wallpaper", go(-1), all.length < 2))
      // A picture still loading spins inside the name's fixed slot, so no button moves.
      .child(h_flex().w(Math.min(160, Math.max(0, (this.width ?? 304) - 144))).flex_none().gap(6).justify_center().items_center()
        .when(waiting, (el) => el.child(spinner(12)))
        .child(div().min_w(0).truncate().child(this.opening ? "Choosing…" : this.lib.importing ? `Importing ${this.lib.importing}…` : scene.name)))
      .child(button("wallpaper-next", "chevron-right", "Next wallpaper", go(1), all.length < 2))
      .child(button("wallpaper-frame", "crop", `Frame ${scene.name}`, (cx) => cx.spawn((cx) => this.startPreview(null, scene.name, cx, scene)), !!scene.redrawing))
      .child(trigger(this, t, "wallpaper-add", { icon: icon("plus"), label: "Add a wallpaper", hint: "Or drop an image on Home", size: "xs",
        closed: MENU_CLOSED, open: this.opening || undefined, onOpen: (b) => this.openMenu(b) }));
    const corner = div().id("wallpaper-corner").absolute().right(0).bottom(0).w(CORNER.w).h(CORNER.h)
      .on_hover((on, cx) => { this.over = on; if (!on) this.hot = null; cx.notify(); })
      .child(switcher);
    // With the switcher away, the spinner sits where its right end is.
    const chip = h_flex().id("wallpaper-wait").absolute().right(12).bottom(12).size(32).justify_center().items_center().rounded(8).bg(t.chrome)
      .role("status").accessibility_label(`Loading ${scene.name}`).opacity(shown ? 0 : 1).transition("opacity", FADE).child(spinner(14));
    return focusRoot(this, root.children(picture).when(waiting, (el) => el.child(chip)).child(corner));
  }

  // The picture's size in Home for framing `p`: covering or inside it at 1×, times the zoom.
  size(scene, p) {
    const unit = (p.mode === "contain" ? Math.min : Math.max)(this.height / scene.height, (this.width ?? 0) / scene.width) * p.zoom;
    return [scene.width * unit, scene.height * unit];
  }

  // framing.js's box: Home and the picture at 1×.
  box(d) {
    const [w, h] = this.size(d.scene, { ...d.placement, zoom: 1 });
    return { W: this.width ?? 0, H: this.height ?? 0, w, h };
  }

  setPlacement(d, change, cx) {
    if (d !== this.draft || d?.phase === 'applying' || !d.scene) return;
    d.placement = placement({ ...d.placement, ...change });
    const s = toSlider(d.placement.zoom);
    if (Math.abs(Number(this.scale.value()) - s) > 1e-6) this.scale.set_value(s);
    cx.notify();
  }

  // Zooms by `r` with Home point `at` (unzoomed px) held still; null, Home's middle.
  zoomBy(d, r, at, cx) {
    if (d !== this.draft || !d?.scene) return;
    this.setPlacement(d, zoomAt(d.placement, r, at ?? { x: (this.width ?? 0) / 2, y: (this.height ?? 0) / 2 }, this.box(d)), cx);
  }

  resetOf(d) { return placement({ mode: d.placement.mode }, d.scene?.focus); }

  compositionCanvas(t) {
    const d = this.draft, active = () => this.draft === d && !!d.scene && d.phase !== 'applying';
    const move = (from, dx, dy, cx) => { if (active()) this.setPlacement(d, pan(from, dx, dy, this.box(d)), cx); };
    return stop(this, t, "wallpaper-compose", div().id("wallpaper-compose")
      .when(active(), el => el.cursor_grab()).role("group")
      .accessibility_label("Wallpaper framing. Drag, scroll or use arrow keys; Shift moves faster. Minus and equals zoom, 0 resets.")
      .on_mouse_move((e, cx) => {
        // Step by step from where the picture is, so a zoom or key mid-drag doesn't make it jump.
        if (!this.drag) return;
        pointerMoved(e.position);
        const from = this.drag.at;
        this.drag.at = e.position;
        move(d.placement, (e.position.x - from.x) / zoom(), (e.position.y - from.y) / zoom(), cx);
      })
      .on_mouse_up("left", () => { this.drag = null; })
      .on_hover(on => { if (!on) this.drag = null; })
      .on_scroll_wheel((e, cx) => {
        cx.stop_propagation();
        const s = active() ? scroll(e, this.gesture) : null;
        if (!s) return;
        const z = zoom();
        if (s.pan) return move(d.placement, s.pan[0] / z, s.pan[1] / z, cx);
        const o = e.local_position ?? { x: e.position.x - (e.bounds?.x ?? 0), y: e.position.y - (e.bounds?.y ?? 0) };
        this.zoomBy(d, s.zoom, { x: o.x / z, y: o.y / z }, cx);
      })
      .on_key_down((e, cx) => {
        if (!active() || !plainKey(e)) return;
        /** @type {any} */ (this).fs.keyboard = true;
        const delta = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[e.key];
        if (e.key === "enter") cx.spawn((cx) => this.applyPreview(cx));
        else if (e.key === "escape") cx.spawn((cx) => this.cancelPreview(cx));
        else if (e.key === "-" || e.key === "=") this.zoomBy(d, nextPreset(d.placement.zoom, e.key === "=" ? 1 : -1) / d.placement.zoom, null, cx);
        else if (e.key === "0") this.setPlacement(d, this.resetOf(d), cx);
        else if (delta) { const step = e.modifiers.shift ? 50 : 10; move(d.placement, delta[0] * step, delta[1] * step, cx); }
        else return;
        cx.stop_propagation();
      }), 8, { handle: this.composeFocus })
      // stop() makes its focus-ring parent relative; the editor must still cover the whole Home.
      .absolute().inset_0()
      .on_mouse_down("left", (e, cx) => {
        if (!active()) return;
        this.composeFocus.focus();
        const drag = this.drag = { at: e.position };
        // Let go outside the window, or once it's no longer in front, no release comes (tip.js dragGone).
        const watch = cx.timer.every(POINTER_WATCH, () => {
          if (this.drag === drag && !dragGone(e.bounds)) return;
          if (this.drag === drag) this.drag = null;
          watch.cancel();
        });
        cx.stop_propagation();
      });
  }

  // A text button in the card's footer: T3's compact, filled, so the pointer takes the hand, as on the layout's dialogs.
  action(t, id, label, act, { disabled = false, variant = "outline" } = {}) {
    return stop(this, t, id, drawButton(t, id, { variant: /** @type {"primary" | "outline" | "danger"} */ (variant), size: "compact", text: label, act, disabled }), radiusOf("compact"));
  }

  // An icon button on the card.
  tool(t, id, name, label, act, disabled = false) {
    return stop(this, t, id, ghostButton(this, t, id, { icon: icon(name), label, act, disabled }), radiusOf("xs"));
  }

  // A ToggleGroup's toggle: a ghost, so, as the layout's other segments, the pointer stays as it is.
  toggle(t, id, o, act) {
    return drawButton(t, id, { ...o, size: "xs", surface: "card" }).when(!o.disabled, (el) => el.on_click((_e, cx) => act(cx)));
  }

  // The framing card, T3's popover in the switcher's place (docs/internals/specs/wallpaper.md). Name, then until the picture shows only how far
  // it has got; once shown it opens out upward: mode (an image's), Fill/Fit and Reset, Zoom. Its footer never moves: a status
  // slot, then Cancel and Apply, which become Close and Choose another… when the file can't be read. `waits`: which of the
  // card's waits show now (track()); before one does, nothing says so. Applying, every control is off at once, as none would
  // act; only Apply's words wait to read Applying….
  card(t, waits) {
    const d = this.draft, p = d.placement, broken = d.phase === 'broken', busy = d.phase === 'applying';
    const open = !!d.scene && !!d.shown && !waits.load;
    const spinner = (size) => svg("mods/workspace-chrome/spinner.svg").size(size).flex_none().text_color(t.dim).spin(900);
    const drawing = `Drawing ${d.image ? styleName(d.style) : "picture"}…`;
    let rows = [div().id("wallpaper-card-name").h(20).flex_none().truncate().text_size(13).font_semibold().text_color(t.foreground).child(d.name)];
    if (!open) {
      rows.push(broken
        ? div().id("wallpaper-card-error").flex_none().max_h(48).overflow_hidden().text_size(12).text_color(t.ansi1).child(d.message ?? "")
        : waits.load ? this.progress(t, d, d.phase === 'loading' ? "Reading image…" : drawing)
        : div().h(26).flex_none());
    } else {
      if (d.pixels) rows.push(this.modes(t, d, spinner, waits.draw));
      const reset = this.resetOf(d), atRest = p.zoom === reset.zoom && p.x === reset.x && p.y === reset.y;
      rows.push(h_flex().h(28).flex_none().gap(8).items_center()
        .child(h_flex().h(28).flex_1().min_w(0).p(2).gap(2).rounded(8).bg(t.raised).children([['cover', 'Fill'], ['contain', 'Fit']].map(([mode, text]) =>
          stop(this, t, `wallpaper-${mode}`, this.toggle(t, `wallpaper-${mode}`, { text, on: p.mode === mode, disabled: busy,
            label: `${mode === 'cover' ? 'Fill: crop to fill' : 'Fit: show the whole picture'}${p.mode === mode ? ', selected' : ''}`,
          }, cx => this.setPlacement(d, { mode }, cx)).rounded(6).flex_1().min_w(0), radiusOf("compact")))))
        .child(tip(this, t, "wallpaper-reset", atRest ? "Already at 100%, centred" : "Reset framing (0)",
          this.tool(t, "wallpaper-reset", "rotate-ccw", "Reset framing", cx => this.setPlacement(d, reset, cx), busy || atRest))));
      rows.push(this.zoomRow(t, d, busy));
    }
    // Broken, the reason is the card's body already.
    const status = broken ? null : d.message ? div().truncate().text_color(t.ansi1).child(d.message)
      : open && (waits.draw || waits.larger) ? h_flex().gap(6).items_center().child(spinner(12)).child(d.phase === 'converting' ? drawing : "Loading picture…")
      : open && d.saved?.id.startsWith("file:") && !busy ? this.action(t, "wallpaper-delete", "Delete", () => this.askRemove(d.saved), { variant: "danger" })
      : null;
    const footer = h_flex().id("wallpaper-card-footer").h(28).flex_none().gap(8).items_center()
      .child(h_flex().id("wallpaper-card-status").flex_1().min_w(0).items_center().text_size(12).text_color(t.dim).when(Boolean(status), (el) => el.child(status)))
      .child(broken ? this.action(t, "wallpaper-close", "Close", cx => cx.spawn(cx => this.cancelPreview(cx)))
        : this.action(t, "wallpaper-cancel", "Cancel", cx => { if (!busy) cx.spawn(cx => this.cancelPreview(cx)); }, { disabled: busy }))
      .child((broken ? this.action(t, "wallpaper-choose-another", "Choose another…", cx => cx.spawn(cx => this.choose(cx)), { variant: "primary", disabled: window()?.platform === "windows" })
        : this.action(t, "wallpaper-apply", waits.apply || (d.waiting && waits.draw) ? "Applying…" : "Apply", cx => cx.spawn(cx => this.applyPreview(cx)),
          { variant: "primary", disabled: !open || busy || (!!d.waiting && waits.draw) })).min_w(72));
    return v_flex().id("wallpaper-card").absolute().right(12).bottom(12).w(this.cardWidth()).p(16).gap(12)
      .rounded(8).bg(t.popover).border_1().border_color(t.border).shadow_lg().text_size(12).text_color(t.muted)
      // The canvas lies under it: a press or scroll here is the card's.
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_scroll_wheel((_e, cx) => cx.stop_propagation())
      .children([...rows, footer]);
  }

  cardWidth() { return Math.min(300, Math.max(0, (this.width ?? 324) - 24)); }

  // What the compact card says while the first picture comes: the step and a bar. An image's steps are known, so the bar
  // shows how far (eased to each, and over FILL to the end while Home loads the picture); with none known, it sweeps.
  progress(t, d, label) {
    const w = this.cardWidth() - 32, f = d.progress == null ? null : d.phase === 'ready' ? 1 : d.progress;
    const bar = div().id("wallpaper-progress-bar").absolute().top(0).h_full().rounded(4).bg(t.foreground);
    return v_flex().id("wallpaper-progress").h(26).flex_none().gap(6).role("progress_indicator")
      .accessibility_label(f == null ? label : `${label} ${Math.round(f * 100)}%`)
      .child(div().h(16).truncate().text_size(12).text_color(t.dim).child(label))
      .child(div().relative().h(4).w_full().rounded(4).bg(t.border).overflow_hidden()
        .child(f == null ? bar.w(w * 0.3).loop("left", { from: -w * 0.3, to: w, period: 1600 })
          : bar.left(0).w(w * f).transition("width", { duration: d.phase === 'ready' ? FILL : 300, easing: d.phase === 'ready' ? "linear" : "ease-out" })));
  }

  // T3's segmented ToggleGroup; the mode being drawn spins.
  modes(t, d, spinner, drawing) {
    const off = d.phase === 'applying';
    const styles = h_flex().id('wallpaper-styles').h(28).w_full().p(2).gap(2).rounded(8).bg(t.raised).role('group').accessibility_label('Image processing')
      .children(STYLES.map(([style, text], index) => stop(this, t, `wallpaper-style-${style}`,
        this.toggle(t, `wallpaper-style-${style}`, { text: style === 'quadrants' && (this.width ?? 324) < 324 ? 'Quads' : text,
          label: `${text}${d.style === style ? ', selected' : ''}`, on: d.style === style, disabled: off },
          cx => cx.spawn(cx => this.setStyle(style, cx))).px(3).rounded(6).flex_1().min_w(0).whitespace_nowrap()
          .when(drawing && d.phase === 'converting' && d.style === style, (el) => el.child(spinner(12).id("wallpaper-style-spinner")))
          .on_key_down((e, cx) => {
            if (off || !plainKey(e) || !ARROWS.includes(e.key)) return;
            const next = STYLES[(index + (['right', 'down'].includes(e.key) ? 1 : STYLES.length - 1)) % STYLES.length][0];
            enter(this, cx, `wallpaper-style-${next}`);
            cx.spawn(cx => this.setStyle(next, cx));
            cx.stop_propagation();
          }), 6)));
    return tip(this, t, 'wallpaper-styles', 'Dots, Braille, Blocks or Quadrants', styles, { below: true }).h(28).flex_none().w_full();
  }

  // − slider + and the zoom in percent. A slider (T3 has none: its 16px control icon and 4px spacing make the thumb and
  // track), logarithmic. Scrolling over the row zooms about Home's middle.
  zoomRow(t, d, off) {
    const z = d.placement.zoom, step = (dir) => (cx) => this.zoomBy(d, nextPreset(this.draft.placement.zoom, dir) / this.draft.placement.zoom, null, cx);
    const slider = stop(this, t, "wallpaper-zoom", div().id("wallpaper-zoom").h(24).flex_1().min_w(0).opacity(off ? DISABLED : 1)
      .role("group").accessibility_label("Wallpaper zoom, 100 to 400 percent")
      .on_key_down((e, cx) => {
        if (off || !plainKey(e) || !ARROWS.includes(e.key)) return;
        step(['right', 'up'].includes(e.key) ? 1 : -1)(cx);
        cx.stop_propagation();
      })
      .child(Slider.new(this.scale).disabled(off).w_full().child(SliderTrack.new(this.scale).disabled(off).h(24).w_full().flex().items_center()
        .child(SliderIndicator.new(this.scale).relative().w_full().h(4).rounded(4).bg(t.border).range_style(el => el.rounded(4).bg(t.foreground))
          .child(SliderThumb.new(this.scale).disabled(off).absolute().top(-6).size(16).rounded(8).bg(t.foreground).ml(-8))))), 6, { handle: this.zoomFocus });
    const row = h_flex().id("wallpaper-zoom-row").h(24).flex_none().items_center()
      .on_scroll_wheel((e, cx) => {
        cx.stop_propagation();
        const s = off ? null : scroll(e, this.gesture);
        if (s?.zoom) this.zoomBy(d, s.zoom, null, cx);
      })
      .child(this.tool(t, "wallpaper-zoom-out", "minus", "Zoom out", step(-1), off || z <= 1))
      .child(div().flex_1().min_w(0).mx(8).child(slider))
      .child(this.tool(t, "wallpaper-zoom-in", "plus", "Zoom in", step(1), off || z >= 4))
      .child(div().id("wallpaper-zoom-value").w(40).ml(4).flex_none().text_right().text_size(12).text_color(t.dim).child(`${Math.round(z * 100)}%`));
    return tip(this, t, "wallpaper-zoom-row", "Scroll to zoom at the pointer", row, { hint: "⌘-scroll on a trackpad" }).h(24).flex_none().w_full();
  }
}
