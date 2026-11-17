// Verbatim from asciicn lib/ascii/sample.ts `autoLevels` (see provenance.txt).
import type { ToneField } from "./frame.ts";

export const autoLevels = (field: ToneField, clipPercent = 0.5): ToneField => {
  const { tones, colors } = field;
  const bins = new Uint32Array(256);
  let counted = 0;
  for (let index = 0; index < tones.length; index += 1) {
    if (colors && (colors[index * 4 + 3] ?? 0) === 0) {
      continue;
    }
    const tone = tones[index] ?? 0;
    bins[Math.min(255, Math.max(0, Math.round(tone * 255)))] += 1;
    counted += 1;
  }
  if (counted === 0) {
    return field;
  }
  const clip = Math.floor(
    (counted * Math.max(0, Math.min(49, clipPercent))) / 100
  );
  let low = 0;
  for (let seen = 0; low < 255; low += 1) {
    seen += bins[low] ?? 0;
    if (seen > clip) {
      break;
    }
  }
  let high = 255;
  for (let seen = 0; high > 0; high -= 1) {
    seen += bins[high] ?? 0;
    if (seen > clip) {
      break;
    }
  }
  if (high <= low) {
    return field;
  }
  const from = low / 255;
  const scale = 255 / (high - low);
  for (let index = 0; index < tones.length; index += 1) {
    const stretched = ((tones[index] ?? 0) - from) * scale;
    tones[index] = stretched > 0 ? Math.min(stretched, 1) : 0;
  }
  return field;
};
