// Oracle: asciicn d5592fc980cad39578f13b16f6e015404160669b, MIT (../LICENSE-asciicn).
// Vendor pure modules with vendor-asciicn.sh beside this file,
// copy its sibling auto-levels.ts into that folder, then: bun generate-image-v3.ts <vendor-folder>
// Prints the fixture; never imports this project's image implementation.
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const site = resolve(process.argv[2]);
const { mapTones } = await import(pathToFileURL(`${site}/frame.ts`).href);
const { autoLevels } = await import(pathToFileURL(`${site}/auto-levels.ts`).href);
const { ANSI16, nearestIndex } = await import(pathToFileURL(`${site}/palettes.ts`).href);
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const cases = [];
for (const [style, gx, gy] of [["dots", 1, 1], ["blocks", 1, 1], ["quadrants", 2, 2], ["braille", 2, 4]]) {
  const columns = 384, rows = 96, width = columns * gx, height = rows * gy;
  const colors = new Uint8ClampedArray(width * height * 4), tones = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    colors[i * 4] = Math.floor(255 * x / (width - 1));
    colors[i * 4 + 1] = Math.floor(255 * y / (height - 1));
    colors[i * 4 + 2] = (Math.floor(x * 8 / width) + Math.floor(y * 8 / height)) % 2 ? 220 : 20;
    colors[i * 4 + 3] = x < width / 8 && y < height / 8 ? 0 : 255;
    tones[i] = (0.2126 * colors[i * 4] + 0.7152 * colors[i * 4 + 1] + 0.0722 * colors[i * 4 + 2]) / 255 * colors[i * 4 + 3] / 255;
  }
  const frame = mapTones(autoLevels({ width, height, colors, tones }), columns, rows, { charset: style, colorMode: "truecolor", dither: "none" });
  const cells = frame.glyphs.map((g, i) => [g, g === " " ? null : Array.from(frame.colors.slice(i * 4, i * 4 + 3))]);
  cases.push({ style, columns, rows, sha256: hash(cells) });
}
const rgb = [...ANSI16.vga, ...Array.from({ length: 96 }, (_, i) => [(i * 53) % 256, (i * 97) % 256, (i * 193) % 256])];
console.log(JSON.stringify({ upstream: "asciicn d5592fc980cad39578f13b16f6e015404160669b", license: "MIT; ../LICENSE-asciicn", cases, tints: rgb.map(rgb => ({ rgb, ansi: nearestIndex(rgb, ANSI16.vga) })) }, null, 2));
