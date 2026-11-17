// What the wallpaper keeps on disk, under <appHome>/asciicn-wallpaper/ (docs/internals/storage.md): the `.ans` file of each
// picture the person added, each one's `.tiles/<name>/scene.json` once it converts, and the pictures Home draws: a wallpaper's tiles put
// together in the theme's colours as one image (picture() in ascii-art.js), one per appearance, made again for a new palette
// from the uncoloured one kept beside it (templateOf).
// Module state is shared by every copy of the mod: two Homes don't convert one file twice, and a confirmed deletion stops
// another Home's conversion or Apply of that file.
import { checking, appHome, exec, notify, readTextFile, setShared, settings, shared, theme, writeTextFile } from "herdr";
import { VERSION, convert, picture, pictureSize } from "./ascii-art.js";

export const MOD = "asciicn-wallpaper";
// The shared keys this mod writes (storage.md): the picture picked, and each added one's framing.
export const KEY = { wallpaper: `${MOD}.scene`, placements: `${MOD}.placements` };
export const sh = (script, dir, timeout) => exec("sh", ["-c", script], { cwd: dir, timeout });
export const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
export const tick = (cx) => new Promise((go) => cx.timer.after(0, () => go(undefined)));
/** A light theme draws new images on paper (ascii-art.js): ink where the picture is dark. */
export const isLight = () => settings()?.dark === false;

// Batch cheap yields within 6ms, then let input/paint run. Work no longer wanted stops at the next chunk.
export async function finish(it, cx, current = () => true) {
  let until = Date.now() + 6;
  for (;;) {
    if (!current()) { it.return?.(); return null; }
    const step = it.next();
    if (step.done) return step.value;
    if (Date.now() >= until) { await tick(cx); until = Date.now() + 6; }
  }
}

const bounded = (n, fallback, min, max) => Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
/** Framing as storage.md has it, read safely; without any, the picture covers Home with its subject (`focus`) in view. */
export const placement = (p, focus = 0.5) => ({ mode: p?.mode === "contain" ? "contain" : "cover",
  zoom: bounded(p?.zoom, 1, 1, 4), x: bounded(p?.x, focus, 0, 1), y: bounded(p?.y, 0.5, 0, 1) });

const converting = new Map(), applying = new Set();
// Framing saved after a scan began is newer than what that scan saw: it mustn't be forgotten.
let placementsVersion = 0;
// Clear abandoned previews once per app run, before any copy starts a new one.
let previewsReady;
// Pictures by key: { path, px } once made, { error }, or { promise } while making, with the smaller one made before.
const pictures = new Map();
/**
 * The px a picture's SVG declares on its long edge, for `n` device px as Home shows it: up to the next STEP, so a window
 * dragged larger makes few; never past MAX, the size every picture had before. Herdr rasterises an SVG at twice the size
 * it declares (GPUI's SMOOTH_SVG_SCALE_FACTOR): that 2× keeps marks smaller than a pixel as bold as they were, where a
 * texture at the device px drew them visibly softer.
 */
const STEP = 512, MAX = 4096;
export const pictureSide = (n) => (Number.isFinite(n) && n > 0 ? Math.min(MAX, Math.ceil(n / STEP) * STEP) : MAX);

function forget(id) {
  const kept = { ...shared(KEY.placements) };
  if (!Object.hasOwn(kept, id)) return;
  delete kept[id];
  placementsVersion++;
  setShared(KEY.placements, kept);
}

const paletteOf = (t) => [t.foreground, ...Array.from({ length: 16 }, (_, n) => t[`ansi${n}`])].join("|");
// FNV-1a: a short file name for a key.
const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h.toString(36); };

/**
 * A picture's identity. A scene is `{ id, dir, width, height }` plus where its tiles come from: `tiles` (a built-in's, in
 * the mod's scenes/), `text` (a draft's frame) or `file` (an import's `.ans`, with its `sum`). Its pictures go in `dir`.
 */
export const pictureKey = (scene, t, light) => [scene.dir, scene.sum ?? VERSION, light ? "paper" : "ink", paletteOf(t)].join("\n");
export const madePicture = (key) => pictures.get(key);
// A folder emptied: what was made in it is gone.
const dropPictures = (dir) => { for (const key of pictures.keys()) if (key.startsWith(`${dir}\n`)) pictures.delete(key); };
/**
 * The scene's picture for a side with each tint's name for its colour (`@ansi1@`), kept beside its pictures: a new palette,
 * after a restart too, is one sed over it (draw), never a conversion. Named by source and version like the pictures; one
 * per side, and it goes with its folder.
 */
const templateOf = (scene, side) => `${scene.dir}/tiles-${side}-${hash([scene.dir, scene.sum ?? VERSION, side].join("\n"))}.tpl`;
// A theme colour as sed may write it: #hex only.
const hex = (c) => (/^#[0-9a-fA-F]{3,8}$/.test(c ?? "") ? c : null);

/**
 * Makes the scene's picture for theme `t` once, however many Homes ask: `{ path, width, height, px, paper }`, its path
 * relative to appHome as image() takes it. `fit(width, height)`: the px wanted on its long edge (pictureSide); one made at
 * least that size serves. While a larger one is made the smaller stays the key's, so Homes keep it up. One at a time per
 * key: a larger ask meanwhile gets that one, and asks again. Null if `current()` turns false first (the next ask starts
 * again); rejects if it fails.
 */
export function makePicture(scene, t, light, fit, cx, current = () => true) {
  if (checking()) return Promise.resolve(null);
  const key = pictureKey(scene, t, light), had = pictures.get(key);
  if (had?.promise) return had.promise;
  if (had?.path && (had.error || had.px >= fit(had.width, had.height))) return Promise.resolve(had);
  const kept = had?.path ? { path: had.path, width: had.width, height: had.height, px: had.px, ...(had.paper ? { paper: true } : {}) } : null;
  const promise = draw(scene, t, light, key, fit, cx, current).then(
    (made) => { if (made) pictures.set(key, made); else if (kept) pictures.set(key, kept); else pictures.delete(key); return made; },
    (e) => { pictures.set(key, { ...kept, error: `${e?.message ?? e}` }); throw e; });
  pictures.set(key, { ...kept, promise });
  return promise;
}

async function draw(scene, t, light, key, fit, cx, current) {
  // Named by its key and px, never rewritten: one on disk already at least the px wanted (made by an earlier run, or an
  // Apply's preview) is this picture, the smallest such.
  const side = light ? "light" : "dark", base = `${side}-${hash(key)}`;
  if (scene.text == null && scene.width && scene.height) {
    const want = fit(scene.width, scene.height);
    const listed = await sh(`cd ${quote(scene.dir)} 2>/dev/null || exit 0; for f in ${base}-*.svg; do [ -s "$f" ] && echo "$f"; done`);
    const [found] = listed.stdout.split("\n").map((f) => /** @type {[string, number]} */ ([f, Number(f.slice(base.length + 1, -4))]))
      .filter(([, px]) => px >= want).sort((a, b) => a[1] - b[1]);
    if (found) {
      return { path: `${scene.dir}/${found[0]}`.slice(appHome().length + 1), width: scene.width, height: scene.height, px: found[1],
        ...(scene.paper ? { paper: true } : {}) };
    }
  }
  const template = templateOf(scene, side);
  let { width, height, paper } = scene;
  if (!(width && height && (await exec("test", ["-s", template])).code === 0)) {
    const set = await tilesOf(scene, light, cx, current);
    if (!set || !current()) return null;
    ({ width, height, paper } = set);
    const made = await exec("mkdir", ["-p", scene.dir]);
    if (made.code !== 0) throw new Error(made.stderr.trim());
    await publish(scene.dir, template, (staged) => stage(staged, picture(set.tiles, (tint) => `@${tint}@`, width, height)));
    await sh(`for f in tiles-${side}-*.tpl; do [ "$f" = ${quote(template.slice(scene.dir.length + 1))} ] || rm -f "./$f"; done`, scene.dir);
  }
  if (!current()) return null;
  const px = fit(width, height), name = `${base}-${px}.svg`, at = `${scene.dir}/${name}`, [w, h] = pictureSize(width, height, px);
  // Each tint its colour, as picture() would: the theme's, else its foreground's. The size is the first on its first line.
  const fallback = hex(t.foreground) ?? "#000", colours = Object.keys(t).filter((n) => /^[a-z0-9_]+$/.test(n) && hex(t[n]))
    .map((n) => `s/@${n}@/${t[n]}/g`).concat(`s/@[a-z0-9_]*@/${fallback}/g`, `1s/ width="[0-9]*" height="[0-9]*"/ width="${w}" height="${h}"/`)
    .map((e) => `-e ${quote(e)}`).join(" ");
  // image() keeps what it loaded from a path: a new picture gets a new name, never a rewrite.
  await publish(scene.dir, at, async (staged) => {
    const coloured = await sh(`sed ${colours} ${quote(template)} > ${quote(staged)}`, scene.dir);
    if (coloured.code !== 0) throw new Error(coloured.stderr.trim());
  });
  // The other palettes and sizes of this appearance go; Homes showing one keep the image they loaded. Their keys go too: a
  // file no longer there never loads, so going back to one of them makes it again. This key's is replaced once it returns.
  await sh(`for f in ${side}-*.svg; do [ "$f" = ${quote(name)} ] || rm -f "./$f"; done`, scene.dir);
  const path = at.slice(appHome().length + 1), gone = `${path.slice(0, path.lastIndexOf("/") + 1)}${side}-`;
  for (const [k, had] of pictures) if (k !== key && had.path?.startsWith(gone) && had.path !== path) pictures.delete(k);
  return { path, width, height, px, ...(paper ? { paper } : {}) };
}

// `file`, written whole by `write(staged)` under a temporary name, then moved into place.
async function publish(dir, file, write) {
  const staged = `${dir}/.stage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    await write(staged);
    const moved = await exec("mv", ["-f", staged, file]);
    if (moved.code !== 0) throw new Error(moved.stderr.trim());
  } finally {
    await exec("rm", ["-rf", staged, `${staged}.parts`]);
  }
}

// The scene's tiles for a side: a built-in's from its files, else its .ans converted. Null if `current()` turns false first.
async function tilesOf(scene, light, cx, current) {
  let tiles = [], { width, height } = scene, paper;
  if (scene.tiles) {
    tiles = await Promise.all(scene.tiles.map(async (l) => ({ ...l, svg: (await readTextFile(`${appHome()}/mods/${MOD}/scenes/${scene.id}/${l.file}`)) ?? "" })));
  } else {
    let text = scene.text;
    if (text == null) {
      const read = await exec("cat", [scene.file]);
      if (read.code !== 0) throw new Error(read.stderr.trim());
      text = read.stdout;
    }
    const gather = function* () {
      const it = convert(text, light);
      for (;;) {
        const step = it.next();
        if (step.done) return step.value;
        if (step.value) tiles.push(step.value);
        yield;
      }
    };
    const frame = await finish(gather(), cx, current);
    if (!frame) return null;
    ({ width, height, paper } = frame);
  }
  if (!tiles.length) throw new Error("No visible marks. Try another picture.");
  return { tiles, width, height, paper };
}

// `text` written to the new file `file`: in one write while it is surely under the host's 1 MiB limit (3 UTF-8 bytes at most
// per UTF-16 unit), else in whole-character parts of at most 256 KiB, in `<file>.parts`, joined.
async function stage(file, text) {
  if (text.length * 3 <= 1024 * 1024) return writeTextFile(file, text, null);
  const folder = `${file}.parts`, made = await exec("mkdir", ["-p", folder]);
  if (made.code !== 0) throw new Error(made.stderr.trim());
  const paths = [];
  for (const [i, part] of (text.match(/[\s\S]{1,65536}/gu) ?? [""]).entries()) {
    const path = `${folder}/${i}.part`;
    await writeTextFile(path, part, null);
    paths.push(path);
  }
  const joined = await sh(`cat ${paths.map(quote).join(" ")} > ${quote(file)}`, folder);
  if (joined.code !== 0) throw new Error(joined.stderr.trim());
  await exec("rm", ["-rf", folder]);
}

export class Library {
  constructor(dir) {
    this.dir = dir;
    this.imported = [];
    this.importing = null;
    this.closed = false;
    // The px a newly imported file's picture is made at (makePicture's `fit`); its Home sets it.
    this.fit = (_width, _height) => MAX;
    this.ready = checking() ? Promise.resolve() : previewsReady ??= exec("rm", ["-rf", `${dir}/.preview`]).then(() => exec("mkdir", ["-p", `${dir}/.tiles`, `${dir}/.preview`]));
  }

  sceneOf(name, kept) {
    return { ...kept, id: `file:${name}`, name, dir: `${this.dir}/.tiles/${name}`, file: `${this.dir}/${name}.ans` };
  }

  // The folder's .ans files, each with its checksum.
  async sourceFiles() {
    const listed = await sh('for f in .ans .*.ans *.ans; do [ -f "$f" ] || continue; sum=$(cksum < "$f") || exit; printf "%s\\0%s\\0" "$sum" "${f%.ans}"; done', this.dir);
    if (listed.code !== 0) throw new Error(listed.stderr.trim());
    const fields = listed.stdout.split("\0"), files = [];
    for (let i = 0; i + 1 < fields.length; i += 2) {
      const name = fields[i + 1], sum = fields[i].trim().split(/\s+/).join("-");
      if (!name || name === "." || name === "..") {
        notify({ title: "Couldn't import the wallpaper", body: `${name}.ans: Rename this file before importing it.`, level: "warning" });
        continue;
      }
      files.push({ sum: `${sum}-${VERSION}`, name });
    }
    return files;
  }

  // Each file shown once converted, converted when it isn't yet or changed since; a removed one's cache and framing go.
  async refresh(cx, retryName = null) {
    if (checking()) return;
    const version = placementsVersion, placed = Object.keys(shared(KEY.placements) ?? {});
    const files = await this.sourceFiles();
    if (this.closed) return;
    // A built-in picture's framing is under its own id: only an added one's goes with its file.
    if (version === placementsVersion) for (const id of placed) if (id.startsWith("file:") && !files.some(f => id === `file:${f.name}`)) forget(id);
    const cleaned = await sh('cd .tiles || exit; for d in .*/ */; do d=${d%/}; case "$d" in .|..) continue;; esac; [ -e "../$d.ans" ] || rm -rf "./$d" || exit; done', this.dir);
    if (cleaned.code !== 0) throw new Error(cleaned.stderr.trim());
    const shown = [], todo = [];
    for (const f of files) {
      let kept = null;
      try { kept = JSON.parse((await readTextFile(`${this.dir}/.tiles/${f.name}/scene.json`)) ?? "null"); } catch { kept = null; }
      if (kept?.sum !== f.sum || (kept.failed && f.name === retryName)) {
        todo.push(f);
        // One listed already is drawn again: it stays listed, `redrawing`, so Home keeps it under its name meanwhile.
        const was = this.imported.find((s) => s.name === f.name);
        if (was) shown.push({ ...was, redrawing: true });
      } else if (!kept.failed) shown.push(this.sceneOf(f.name, kept));
    }
    this.imported = shown.sort((a, b) => a.name.localeCompare(b.name));
    cx.notify();
    for (const f of todo) await this.convertFile(f, cx);
  }

  async convertFile(f, cx) {
    const busy = converting.get(f.name);
    if (busy) { await busy.promise; await this.refresh(cx); return; }
    const job = { cancelled: false, promise: null };
    converting.set(f.name, job);
    job.promise = this.convertOwned(f, cx, job);
    let stale;
    try { stale = await job.promise; } finally { if (converting.get(f.name) === job) converting.delete(f.name); }
    if (stale && !job.cancelled) await this.refresh(cx);
  }

  // Draws its picture for the theme now, then marks it converted: scene.json last, so a half-made one converts again.
  async convertOwned(f, cx, job) {
    this.importing = f.name;
    cx.notify();
    const scene = this.sceneOf(f.name, { sum: f.sum, focus: 0.5 }), out = scene.dir;
    const mark = (data) => writeTextFile(`${out}/scene.json`, JSON.stringify({ sum: f.sum, ...data }), null);
    let stale = false;
    const current = async () => {
      if (job.cancelled) return false;
      const sum = await sh(`cksum < ${quote(`./${f.name}.ans`)}`, this.dir);
      return !job.cancelled && sum.code === 0 && `${sum.stdout.trim().split(/\s+/).join("-")}-${VERSION}` === f.sum;
    };
    try {
      const text = await exec("cat", [scene.file]);
      if (job.cancelled) return;
      await exec("rm", ["-rf", out]);
      dropPictures(out);
      if (text.code !== 0) throw new Error(text.stderr.trim());
      const t = theme(), light = isLight();
      const made = await makePicture({ ...scene, text: text.stdout }, t, light, this.fit, cx, () => !job.cancelled);
      if (!made || !(await current())) { stale = true; return true; }
      const { width, height, paper } = made;
      await mark({ focus: 0.5, width, height, ...(paper ? { paper } : {}) });
      if (!(await current())) { stale = true; return true; }
      this.imported = [...this.imported.filter((s) => s.name !== f.name), this.sceneOf(f.name, { sum: f.sum, focus: 0.5, width, height })]
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      if (job.cancelled) return;
      this.imported = this.imported.filter((s) => s.name !== f.name);
      await mark({ failed: true }).catch(() => null);
      const waiting = [...applying].filter(a => a.name === f.name);
      for (const a of waiting) a.error = `${e?.message ?? e}`;
      if (!waiting.length) notify({ title: "Couldn't import the wallpaper", body: `${f.name}.ans: ${e?.message ?? e}`, level: "warning" });
    } finally {
      if (job.cancelled || stale) { await exec("rm", ["-rf", out]); dropPictures(out); }
      // Deleted meanwhile (remove() cancels it): the entry kept listed while it was drawn again goes too.
      if (job.cancelled) this.imported = this.imported.filter((s) => s.name !== f.name);
      this.importing = null;
      cx.notify();
    }
  }

  async availableName(base) {
    const names = new Set((await this.sourceFiles()).map(f => f.name));
    let name = base;
    for (let n = 2; names.has(name); n++) name = `${base} ${n}`;
    return name;
  }

  // Never over an existing file: `link`, unlike ln, never puts the file inside an existing directory either. `before(staged)`
  // runs once the text is written, before the .ans appears.
  async saveFile(name, text, before = async (_staged) => {}) {
    await this.ready;
    const staged = `${this.dir}/.preview/save-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await stage(staged, text);
      await before(staged);
      const saved = await exec("link", [staged, `${this.dir}/${name}.ans`]);
      if (saved.code !== 0) throw new Error(saved.stderr.trim());
    } finally {
      await exec("rm", ["-rf", staged, `${staged}.parts`]);
    }
  }

  // A draft's picture, made for the theme now, becomes saved `name`'s, with the scene.json a conversion would write: put in
  // place before its .ans (`staged`) appears, so the scan that finds that has nothing to convert. Skipped, it converts.
  async adopt(name, staged, draft) {
    const t = theme(), light = isLight(), made = draft.scene && madePicture(pictureKey(draft.scene, t, light));
    if (!made?.path) return;
    const sum = await sh(`cksum < ${quote(staged)}`, this.dir);
    if (sum.code !== 0) return;
    const scene = this.sceneOf(name, { sum: `${sum.stdout.trim().split(/\s+/).join("-")}-${VERSION}` });
    const at = `${scene.dir}/${light ? "light" : "dark"}-${hash(pictureKey(scene, t, light))}-${made.px}.svg`;
    await exec("rm", ["-rf", scene.dir]);
    dropPictures(scene.dir);
    if ((await exec("mkdir", ["-p", scene.dir])).code !== 0 || (await exec("link", [`${appHome()}/${made.path}`, at])).code !== 0) return;
    const side = light ? "light" : "dark";
    await exec("link", [templateOf(draft.scene, side), templateOf(scene, side)]);
    const { width, height, paper } = made;
    await writeTextFile(`${scene.dir}/scene.json`, JSON.stringify({ sum: scene.sum, focus: 0.5, width, height, ...(paper ? { paper } : {}) }), null).catch(() => null);
  }

  /** Saves `id`'s framing and shows it. */
  frame(id, framing) {
    placementsVersion++;
    setShared(KEY.placements, { ...shared(KEY.placements), [id]: { ...framing } });
    setShared(KEY.wallpaper, id);
  }

  /**
   * Saves a draft's drawing (reusing `draft.savedName` while that file still holds it) and, once it has converted, selects
   * it with the draft's framing. False if `wanted()` turned false meanwhile; throws, keeping the selection, on failure.
   */
  async publish(draft, cx, wanted) {
    const job = { name: draft.savedName, cancelled: false, error: null, publishing: null };
    applying.add(job);
    try {
      let name = draft.savedName;
      if (name) {
        const saved = await exec("cat", [`${this.dir}/${name}.ans`]);
        if (saved.code !== 0 || saved.stdout !== draft.text) name = null;
      }
      if (!name) {
        name = await this.availableName(draft.name);
        job.name = name;
        if (job.cancelled) throw new Error("The saved drawing was deleted. Try Apply again.");
        job.publishing = this.saveFile(name, draft.text, (staged) => this.adopt(name, staged, draft));
        await job.publishing;
        draft.savedName = name;
      }
      await this.refresh(cx, name);
      if (!wanted() || this.closed) return false;
      if (job.cancelled) throw new Error("The saved drawing was deleted. Try Apply again.");
      if (!this.imported.some(s => s.name === name)) throw new Error(job.error ?? "The drawing couldn't be prepared. Try Apply again.");
      this.frame(`file:${name}`, draft.placement);
      return true;
    } finally {
      applying.delete(job);
    }
  }

  // After the person confirmed: its file, cache and framing go, its conversion and any Apply of it stop, and the
  // selection moves to the picture before it (`all`, the list as shown) only once the file is gone.
  async remove(scene, all, cx) {
    const i = all.findIndex(s => s.id === scene.id);
    // A publication already under way must finish first, never recreate the file afterwards.
    for (const a of applying) if (a.name === scene.name && a.publishing) await a.publishing.catch(() => null);
    const removed = await sh(`rm -f ${quote(`./${scene.name}.ans`)}`, this.dir);
    if (removed.code !== 0) {
      notify({ title: "Couldn't delete the wallpaper", body: `${scene.name}: ${removed.stderr.trim()}`, level: "warning" });
      return false;
    }
    const job = converting.get(scene.name);
    if (job) job.cancelled = true;
    for (const a of applying) if (a.name === scene.name) a.cancelled = true;
    forget(scene.id);
    if (shared(KEY.wallpaper) === scene.id && all.length > 1) setShared(KEY.wallpaper, all[(i - 1 + all.length) % all.length].id);
    this.imported = this.imported.filter((s) => s.id !== scene.id);
    cx.notify();
    const cleaned = await exec("rm", ["-rf", scene.dir]);
    dropPictures(scene.dir);
    if (cleaned.code !== 0) notify({ title: "Wallpaper deleted", body: `Its cached drawing couldn't be removed: ${cleaned.stderr.trim()}`, level: "warning" });
    return true;
  }
}
