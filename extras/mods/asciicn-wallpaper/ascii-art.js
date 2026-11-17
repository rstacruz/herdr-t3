// A picture made here (an image drawn in a mode, saved as `.ans` text) as one-colour SVG tiles the theme tints. Plain
// JavaScript, no host calls. The built-in pictures are tiles already, in the mod's scenes/.
//
// Each glyph is drawn as shapes, never as text: a mod's text collapses runs of spaces and its newlines. The shapes are
// asciicn's own (lib/ascii/glyphs.ts, MIT, LICENSE-asciicn): Braille as its 2×4 dots, blocks, quadrants and shades as
// rectangles, halftone dots as dots. Units: a cell is 1 tall and ASPECT wide; a dot's radius is in cell widths.
//
// A cell's colour picks the nearest VGA theme slot and its brightness a step of opacity (tintOf). Cells of one colour and step are one layer, cut into tiles of at most TILE cell heights
// across and down, each its own small SVG; picture() puts them together, in the theme's colours, as the one image Home draws.

// Part of each import's cache key: raise it whenever a frame or its cache would come out differently, and every import
// converts again. 6: only frames made here convert; another .ans in the folder fails once, with a notice.
export const VERSION = 6;
const IMAGE_STEPS = [0.1, 0.18, 0.28, 0.4, 0.55, 0.7, 0.85, 1];
// The non-drawing header a frame made here starts with: its mode, so it can turn over for light themes (`paper`) without
// its source picture. Half-width cells.
const IMAGE_HEADER = /^\x1b\]777;asciicn-wallpaper;image-v4;(dots|blocks|quadrants|braille)\x07/;
const imageMark = (style) => `\x1b]777;asciicn-wallpaper;image-v4;${style}\x07`;
const ASPECT = 0.5;
// Dense shade rectangles must also fit the host's 1 MiB text-write limit.
const TILE = 40;

const SHAPES = new Map();
const dot = (cx, cy, r) => ({ kind: "dot", cx, cy, r });
const rect = (x, y, w, h) => ({ kind: "rect", x, y, w, h });
const define = (glyphs, shape) => { for (const g of glyphs) SHAPES.set(g, shape); };

define("█", [rect(0, 0, 1, 1)]);
// Halves as one rectangle each.
define("▀", [rect(0, 0, 1, 0.5)]);
define("▄", [rect(0, 0.5, 1, 0.5)]);
define("▌", [rect(0, 0, 0.5, 1)]);
define("▐", [rect(0.5, 0, 0.5, 1)]);
// Quadrants by mask: top-left 1, top-right 2, bottom-left 4, bottom-right 8.
[..." ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█"].forEach((g, mask) => {
  if (mask === 0 || mask === 15 || SHAPES.has(g)) return;
  define(g, [0, 1, 2, 3].filter((bit) => mask & (1 << bit)).map((bit) => rect((bit % 2) / 2, Math.floor(bit / 2) / 2, 0.5, 0.5)));
});
// Shades on a 2×4 sub-grid, as terminal fonts draw them.
const shade = (lit) => [0, 1, 2, 3].flatMap((y) => [0, 1].filter((x) => lit(x, y)).map((x) => rect(x / 2, y / 4, 0.5, 0.25)));
define("░", shade((x, y) => (y === 0 && x === 0) || (y === 2 && x === 1)));
define("▒", shade((x, y) => (x + y) % 2 === 0));
define("▓", shade((x, y) => !((y === 1 && x === 1) || (y === 3 && x === 0))));
// Braille: each bit a dot, [row][column].
const BRAILLE_BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];
for (let mask = 1; mask < 256; mask++) {
  define(String.fromCodePoint(0x2800 + mask), BRAILLE_BITS.flatMap((bits, row) =>
    bits.flatMap((bit, column) => mask & bit ? [dot(column === 0 ? 0.3 : 0.7, (row + 0.5) / 4, 0.17)] : [])));
}
// Halftone dots.
for (const [g, r] of Object.entries({ "·": 0.07, "∙": 0.13, "•": 0.24, "⦁": 0.33, "●": 0.42 })) define(g, [dot(0.5, 0.5, r)]);
const shapeOf = (g) => SHAPES.get(g) ?? [];

// The colour a frame's SGR codes leave set: null, or { rgb: [r, g, b] } (38;2, the only colour a frame made here writes).
function sgr(codes, color) {
  const p = codes === "" ? [0] : codes.split(";").map(Number);
  for (let i = 0; i < p.length; i++) {
    if (p[i] === 0 || p[i] === 39) color = null;
    else if (p[i] === 38 && p[i + 1] === 2) { color = { rgb: p.slice(i + 2, i + 5) }; i += 4; }
  }
  return color;
}

// asciicn palettes.ts: VGA reference slots and perceptual nearestIndex (MIT, LICENSE-asciicn).
const VGA = [[0,0,0],[170,0,0],[0,170,0],[170,85,0],[0,0,170],[170,0,170],[0,170,170],[170,170,170],[85,85,85],[255,85,85],[85,255,85],[255,255,85],[85,85,255],[255,85,255],[85,255,255],[255,255,255]];
function oklab(rgb) {
  const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const VGA_LAB = VGA.map(oklab);

/** New image colours: nearest VGA theme slot, with eight steps of HSV value (not luminance); on paper, of darkness. */
export function tintOf(color, paper = false) {
  if (!color) return { tint: "foreground", step: 7 };
  const lab = oklab(color.rgb);
  let nearest = 0, distance = Infinity;
  for (const [index, target] of VGA_LAB.entries()) {
    const d = (lab[0] - target[0]) ** 2 + (lab[1] - target[1]) ** 2 + (lab[2] - target[2]) ** 2;
    if (d < distance) { nearest = index; distance = d; }
  }
  const [r, g, b] = color.rgb, light = paper ? 1 - (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 : Math.max(r, g, b) / 255;
  return { tint: `ansi${nearest}`, step: Math.min(7, Math.floor(light * 8)) };
}

const round = (v) => +v.toFixed(3);

// One tile's svg: dots as zero-length round-capped strokes a path per size, rectangles one filled path.
function svg(cells, aspect, box) {
  const bySize = new Map(), rects = [];
  for (const c of cells) for (const s of shapeOf(c.g)) {
    if (s.kind === "rect") rects.push([c, s]);
    else {
      if (!bySize.has(s.r)) bySize.set(s.r, []);
      bySize.get(s.r).push([(c.column + s.cx) * aspect, c.row + s.cy]);
    }
  }
  const paths = [...bySize].map(([r, at]) => {
    // Each dot moves from the last, rows in order: short relative numbers keep a file about a third of absolute ones.
    at.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    let d = "", x = 0, y = 0;
    for (const [n, [cx, cy]] of at.entries()) {
      const px = round(cx), py = round(cy);
      d += n === 0 ? `M${px} ${py}h0` : `m${round(px - x)} ${round(py - y)}h0`;
      x = px; y = py;
    }
    return `<path stroke-width="${round(2 * r * aspect)}" d="${d}"/>`;
  });
  if (rects.length) {
    const d = rects.map(([c, s]) => `M${round((c.column + s.x) * aspect)} ${round(c.row + s.y)}h${round(s.w * aspect)}v${round(s.h)}h${round(-s.w * aspect)}z`).join("");
    paths.push(`<path fill="#000" stroke="none" d="${d}"/>`);
  }
  const { x0, y0, x1, y1 } = box;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${round(x1 - x0)} ${y1 - y0}" fill="none" stroke="#000" stroke-linecap="round">${paths.join("")}</svg>\n`;
}

/**
 * Converts the `.ans` text of a frame made here (imageAns). Yields `null` now and then, a place to let the UI breathe, and
 * each tile as `{ file, svg, tint, opacity, x0, x1, y0, y1 }`; returns `{ width, height, aspect, paper: true }`, in cell
 * heights. `paper` turns its tones over for a light theme (each glyph its opposite, blank opaque cells full). Throws for any
 * other text.
 */
export function* convert(text, paper = false) {
  const header = text.match(IMAGE_HEADER), aspect = ASPECT;
  if (!header) throw new Error("This isn't a picture made here: add it with Choose image… or by dropping the image on Home.");
  text = text.slice(header[0].length);
  const turn = paper ? PAPER[header[1]] : null;
  const lines = text.replace(/\r/g, "").split("\n");
  while (lines.length && lines.at(-1) === "") lines.pop();
  const cells = [];
  let color = null, columns = 0;
  for (const [row, l] of lines.entries()) {
    let column = 0;
    for (const m of l.matchAll(/\x1b\[([0-9;]*)m|\x1b\[[0-9;?]*[A-Za-z]|([^\x1b])/gu)) {
      if (m[1] !== undefined) color = sgr(m[1], color);
      else if (m[2] !== undefined) {
        // A v4 blank cell without a colour is transparent: it stays blank on paper too.
        const g = turn ? (m[2] === " " && !color ? " " : turn(m[2])) : m[2];
        if (shapeOf(g).length) cells.push({ row, column, g, color });
        column += 1;
      }
    }
    columns = Math.max(columns, column);
    if (row % 16 === 15) yield null;
  }
  const layers = new Map();
  for (const [index, c] of cells.entries()) {
    const { tint, step } = tintOf(c.color, !!turn), key = `${tint}-${step}`;
    if (!layers.has(key)) layers.set(key, { tint, step, cells: [] });
    layers.get(key).cells.push(c);
    if (index % 1024 === 1023) yield null;
  }
  yield null;
  for (const [key, { tint, step, cells: mine }] of [...layers].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const opacity = IMAGE_STEPS[step];
    const groups = new Map();
    for (const c of mine) {
      const t = `${Math.floor((c.column * aspect) / TILE)}-${Math.floor(c.row / TILE)}`;
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t).push(c);
    }
    for (const [t, these] of groups) {
      const box = these.reduce((b, c) => ({ x0: Math.min(b.x0, c.column), x1: Math.max(b.x1, c.column + 1), y0: Math.min(b.y0, c.row), y1: Math.max(b.y1, c.row + 1) }),
        { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
      box.x0 = round(box.x0 * aspect); box.x1 = round(box.x1 * aspect);
      yield { file: `${key}-${t}.svg`, svg: svg(these, aspect, box), tint, opacity, ...box };
    }
  }
  return { width: round(columns * aspect), height: lines.length, aspect, paper: true };
}

/** The size a picture `width`×`height` declares with `side` px on its long edge. */
export const pictureSize = (width, height, side) => [width, height].map((n) => Math.ceil((n * side) / Math.max(width, height)));

/**
 * Tiles (`{ svg, tint, opacity }`, as convert yields them or scenes/ holds them) as one SVG, `side` px on its
 * long edge, each tile in `colour(tint)`. Opacity goes on strokes and fills, not a group, which would composite offscreen.
 */
export function picture(tiles, colour, width, height, side = 4096) {
  const [w, h] = pictureSize(width, height, side);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${width} ${height}">`
    + tiles.map(({ svg, tint, opacity }) => {
      const c = colour(tint);
      return `<g fill="none" stroke="${c}" stroke-linecap="round" stroke-opacity="${opacity}" fill-opacity="${opacity}">`
        + svg.replace(/^\s*<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "").replaceAll('fill="#000"', `fill="${c}"`) + "</g>";
    }).join("") + "</svg>\n";
}

// ---- An image: the frame asciicn's default for an image in Braille and true colour would make.

/** 96 rows of half-width cells. Each style requests its own samples per cell. */
export function imageGrid(width, height, style = "braille") {
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) throw new Error("invalid image dimensions");
  const [gx, gy] = imageCell(style);
  const rows = 96, columns = Math.max(16, Math.min(480, Math.round((2 * rows * width) / height)));
  return { columns, rows, width: columns * gx, height: rows * gy };
}

/**
 * The draft every image mode is drawn from: the crop that covers the grid (source pixels), resized by the system (sips or
 * ImageMagick) to Braille's sample grid, the finest any mode takes; the others average its whole blocks (sampleImage).
 */
export function imagePlan(width, height) {
  const { columns, rows } = imageGrid(width, height), aspect = columns * 0.5 / rows;
  const w = Math.min(width, Math.round(height * aspect)), h = Math.min(height, Math.round(width / aspect));
  const crop = { x: Math.floor((width - w) / 2), y: Math.floor((height - h) / 2), width: w, height: h };
  const [gx, gy] = IMAGE_GRIDS.braille;
  return { columns, rows, width: columns * gx, height: rows * gy, crop };
}

// Each sample the area-weighted mean of the draft pixels under it. Alpha is premultiplied.
function* areaImage(pixels, width, height) {
  if (pixels.width === width && pixels.height === height) return pixels;
  const rgba = new Uint8ClampedArray(width * height * 4), tones = new Float32Array(width * height);
  const sx = pixels.width / width, sy = pixels.height / height, source = pixels.rgba;
  const blocks = Number.isInteger(sx) && Number.isInteger(sy);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const x0 = x * sx, x1 = Math.min(pixels.width, (x + 1) * sx), y0 = y * sy, y1 = Math.min(pixels.height, (y + 1) * sy);
    let r = 0, g = 0, b = 0, a = 0;
    if (blocks) {
      for (let py = y0; py < y1; py++) {
        let at = (py * pixels.width + x0) * 4;
        for (let px = x0; px < x1; px++, at += 4) {
          const alpha = source[at + 3];
          r += source[at] * alpha; g += source[at + 1] * alpha; b += source[at + 2] * alpha; a += alpha;
        }
      }
    } else {
      for (let py = Math.floor(y0); py < Math.ceil(y1); py++) for (let px = Math.floor(x0); px < Math.ceil(x1); px++) {
        const weight = (Math.min(x1, px + 1) - Math.max(x0, px)) * (Math.min(y1, py + 1) - Math.max(y0, py));
        const at = (py * pixels.width + px) * 4, alpha = source[at + 3] * weight;
        r += source[at] * alpha; g += source[at + 1] * alpha; b += source[at + 2] * alpha; a += alpha;
      }
    }
    const i = y * width + x, color = a === 0 ? 0 : 1 / a, alpha = a / (sx * sy);
    rgba[i * 4] = r * color; rgba[i * 4 + 1] = g * color; rgba[i * 4 + 2] = b * color; rgba[i * 4 + 3] = alpha;
    tones[i] = (0.2126 * (r * color) + 0.7152 * (g * color) + 0.0722 * (b * color)) / 255 * (alpha / 255);
    if (i % 2048 === 2047) yield null;
  }
  return { width, height, rgba, tones };
}

/** The draft sampled for a style: its own grid's samples, each the mean of the draft pixels it covers. */
export function* sampleImage(pixels, style, plan) {
  const [gx, gy] = imageCell(style), width = plan.columns * gx, height = plan.rows * gy;
  if (!(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0 && pixels.width > 0 && pixels.height > 0 && pixels.rgba?.length === pixels.width * pixels.height * 4)) throw new Error("invalid image sample plan");
  return yield* areaImage(pixels, width, height);
}

const B64 = new Map([..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"].map((c, i) => [c.charCodeAt(0), i]));

/**
 * A BMP (24/32-bit, uncompressed, either row order) as base64 text or chunks of that text, to RGBA. Chunks need
 * not end at quartet boundaries. Cleans/decodes bounded slices and yields; returns `{ width, height, rgba }`.
 */
export function* decodeBmp(base64) {
  const parts = typeof base64 === "string" ? [base64] : base64;
  const bytes = new Uint8Array(Math.floor(parts.reduce((size, part) => size + part.length, 0) * 3 / 4));
  let n = 0, carry = "";
  for (const part of parts) for (let from = 0; from < part.length; from += 65536) {
    const text = carry + part.slice(from, from + 65536).replace(/[^A-Za-z0-9+/]/g, ""), end = text.length - text.length % 4;
    yield null;
    for (let i = 0; i < end; i += 4) {
      const a = B64.get(text.charCodeAt(i)), b = B64.get(text.charCodeAt(i + 1));
      const c = B64.get(text.charCodeAt(i + 2)), d = B64.get(text.charCodeAt(i + 3));
      bytes[n++] = (a << 2) | (b >> 4);
      bytes[n++] = ((b & 15) << 4) | (c >> 2);
      bytes[n++] = ((c & 3) << 6) | d;
      if (i % 16384 === 16380) yield null;
    }
    carry = text.slice(end);
  }
  if (carry.length >= 2) {
    const a = B64.get(carry.charCodeAt(0)), b = B64.get(carry.charCodeAt(1));
    bytes[n++] = (a << 2) | (b >> 4);
    if (carry.length === 3) bytes[n++] = ((b & 15) << 4) | (B64.get(carry.charCodeAt(2)) >> 2);
  }
  const u32 = (at) => (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
  if (bytes[0] !== 0x42 || bytes[1] !== 0x4d) throw new Error("not a BMP");
  if (n < 54) throw new Error("incomplete BMP");
  const data = u32(10), width = u32(18) | 0, signed = u32(22) | 0, bits = bytes[28] | (bytes[29] << 8), compression = u32(30);
  if ((bits !== 24 && bits !== 32) || (compression !== 0 && compression !== 3)) throw new Error(`a ${bits}-bit BMP, compression ${compression}`);
  const height = Math.abs(signed), stride = Math.ceil((bits * width) / 32) * 4, end = data + stride * height;
  if (width <= 0 || height === 0 || u32(14) < 40 || data < 14 + u32(14) || !Number.isSafeInteger(end) || end > n || u32(2) > n) throw new Error("incomplete BMP");
  const step = bits / 8, rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const from = data + (signed < 0 ? y : height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const at = from + x * step, pixel = y * width + x, to = pixel * 4;
      rgba[to] = bytes[at + 2]; rgba[to + 1] = bytes[at + 1]; rgba[to + 2] = bytes[at]; rgba[to + 3] = 255;
      if (pixel % 4096 === 4095) yield null;
    }
  }
  return { width, height, rgba };
}

// asciicn's autoLevels for an image: tones stretched so 0.5% of them clip at each end.
function* imageLevels({ width, height, rgba, tones: sampled }) {
  const tones = new Float32Array(width * height), bins = new Uint32Array(256);
  let counted = 0;
  for (let i = 0; i < tones.length; i++) {
    const t = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
    tones[i] = sampled?.[i] ?? t * rgba[i * 4 + 3] / 255;
    if (rgba[i * 4 + 3] !== 0) { bins[Math.min(255, Math.round(tones[i] * 255))]++; counted++; }
    if (i % 8192 === 8191) yield null;
  }
  yield null;
  const clip = Math.floor((counted * 0.5) / 100);
  let low = 0, high = 255;
  for (let seen = 0; low < 255; low++) if ((seen += bins[low]) > clip) break;
  for (let seen = 0; high > 0; high--) if ((seen += bins[high]) > clip) break;
  const from = high > low ? low / 255 : 0, scale = high > low ? 255 / (high - low) : 1;
  return { tones, from, scale };
}

const RAMPS = { dots: " ·∙•⦁●", blocks: " ░▒▓█" }, QUADRANTS = " ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█";
// Each mode's glyph for the opposite tone: a ramp read backwards, a dot or quadrant mask complemented.
const backwards = (ramp) => (g) => { const i = ramp.indexOf(g); return i < 0 ? g : ramp[ramp.length - 1 - i]; };
const PAPER = {
  dots: backwards(RAMPS.dots), blocks: backwards(RAMPS.blocks),
  quadrants: (g) => { const i = QUADRANTS.indexOf(g); return i < 0 ? g : QUADRANTS[15 - i]; },
  braille: (g) => {
    const mask = g === " " ? 0 : g.codePointAt(0) - 0x2800;
    return mask < 0 || mask > 255 ? g : mask === 255 ? " " : String.fromCodePoint(0x2800 + (255 ^ mask));
  },
};
const IMAGE_GRIDS = { dots: [1, 1], blocks: [1, 1], quadrants: [2, 2], braille: [2, 4] };
function imageCell(style) {
  if (!Object.hasOwn(IMAGE_GRIDS, style)) throw new Error("unknown image style");
  return IMAGE_GRIDS[style];
}

/** Website mapTones, no dither, autoLevels on. Metadata keeps new image geometry/colours across reloads. */
export function* imageAns(pixels, style = "braille") {
  const [gx, gy] = imageCell(style), { width, height, rgba } = pixels;
  if (width % gx || height % gy) throw new Error("image sample grid does not fit cells");
  const { tones, from, scale } = yield* imageLevels(pixels);
  for (let i = 0; i < tones.length; i++) {
    tones[i] = Math.max(0, Math.min(1, (tones[i] - from) * scale));
    if (i % 8192 === 8191) yield null;
  }
  const lines = [], avg = new Uint8ClampedArray(3);
  for (let row = 0; row < height / gy; row++) {
    let line = "", current = "";
    for (let column = 0; column < width / gx; column++) {
      let mask = 0, r = 0, g = 0, b = 0, a = 0, tone = 0;
      for (let dy = 0; dy < gy; dy++) for (let dx = 0; dx < gx; dx++) {
        const i = (row * gy + dy) * width + column * gx + dx;
        tone += tones[i];
        if (tones[i] > 0.5) mask |= style === "braille" ? BRAILLE_BITS[dy][dx] : 1 << (dy * 2 + dx);
        r += rgba[i * 4]; g += rgba[i * 4 + 1]; b += rgba[i * 4 + 2]; a += rgba[i * 4 + 3];
      }
      const ramp = RAMPS[style];
      const glyph = style === "braille" ? (mask ? String.fromCodePoint(0x2800 + mask) : " ")
        : style === "quadrants" ? QUADRANTS[mask]
        : ramp[Math.floor(tone * (ramp.length - 1) + 0.5)];
      // Preserve gradeRgb's default arithmetic before byte rounding: its half-integer ties can move by one ulp.
      avg[0] = (r / (gx * gy) / 255 - 0.5 + 0.5) * 255;
      avg[1] = (g / (gx * gy) / 255 - 0.5 + 0.5) * 255;
      avg[2] = (b / (gx * gy) / 255 - 0.5 + 0.5) * 255;
      // Blank cells keep their colour too (paper inks them); a transparent one resets it, so paper leaves it blank.
      const code = glyph === " " && !a ? "" : `\x1b[38;2;${avg[0]};${avg[1]};${avg[2]}m`;
      if (code !== current) { line += code || "\x1b[39m"; current = code; }
      line += glyph;
    }
    lines.push(line + (current ? "\x1b[0m" : ""));
    if (row % 8 === 7) yield null;
  }
  return imageMark(style) + lines.join("\n") + "\n";
}
