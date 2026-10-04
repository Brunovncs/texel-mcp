import { labDistance, perceptualLightness, rgbToHsl, toHex, toLab, type Lab } from './color.js';
import type { Image, RGBA } from './types.js';

/**
 * Palette extraction from a reference image (concept art, a photo of a figure, an existing skin):
 * median-cut quantization, a merge of near duplicates, then a role for each color so an agent can
 * map it onto materials and tone ramps instead of guessing hex values.
 */

/**
 * What a color is likely for: the darkest tones, the body of a material, its lights, grays, or a
 * small vivid detail (a gem, a nose, an emblem).
 */
export const SWATCH_ROLES = ['shadow', 'midtone', 'highlight', 'neutral', 'accent'] as const;
export type SwatchRole = (typeof SWATCH_ROLES)[number];

export interface Swatch {
  /** `#rrggbb`. */
  color: string;
  /** Share of the image's opaque pixels, 0–1. */
  share: number;
  /** CIE L*, 0–100. */
  perceptualLightness: number;
  role: SwatchRole;
}

export interface PaletteOptions {
  /** How many colors to keep (2–32). Default 12. */
  colors?: number;
}

/** A swatch with the palette key and legend character it gets in a spec. */
export interface PaletteEntry extends Swatch {
  key: string;
  /** Legend character, or null past the end of the legend alphabet. */
  char: string | null;
}

/** Swatches ready for a spec: `palette` and `legend` go straight into it. */
export interface ReferencePalette {
  entries: PaletteEntry[];
  palette: Record<string, string>;
  legend: Record<string, string>;
}

/** Largest side of a reference image, in pixels: larger than a texture, small enough to decode quickly. */
export const REFERENCE_MAX_SIDE = 2048;

const DEFAULT_COLORS = 12;
const MIN_COLORS = 2;
const MAX_COLORS = 32;
/** Pixels at least this opaque count; anti-aliased edges against a transparent background do not. */
const MIN_ALPHA = 128;
/** Most pixels read from one image; larger images are sampled on a regular grid. */
const MAX_SAMPLES = 65_536;
/** Median cut first makes this many times the clusters asked for; the closest ones are then merged. */
const OVERSPLIT = 4;
/** Below this HSL saturation a color is a gray. */
const NEUTRAL_SATURATION = 0.12;
/** An accent is at least this saturated, at most this share of the image… */
const ACCENT_SATURATION = 0.45;
const ACCENT_MAX_SHARE = 0.06;
/** …and this many degrees of hue away from every larger color. */
const ACCENT_HUE_GAP = 30;
/** L* below which a color is a shadow, and above which a highlight. */
const SHADOW_BELOW = 30;
const HIGHLIGHT_ABOVE = 78;
/** Legend characters, in the order they are handed out (no `.` or `_`, which are reserved). */
const LEGEND_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** A group of pixels reduced to its mean color and size. */
interface Cluster {
  color: RGBA;
  lab: Lab;
  size: number;
}

/** Colors of an image, most common first. Deterministic: the same image always gives the same palette. */
export function extractPalette(img: Image, { colors = DEFAULT_COLORS }: PaletteOptions = {}): Swatch[] {
  const target = Number.isFinite(colors) ? Math.max(MIN_COLORS, Math.min(MAX_COLORS, Math.round(colors))) : DEFAULT_COLORS;
  const pixels = opaquePixels(img);
  if (!pixels.length) return [];
  const clusters = mergeClosest(medianCut(pixels, target * OVERSPLIT), target).sort((a, b) => b.size - a.size || toHex(a.color).localeCompare(toHex(b.color)));
  return clusters.map(({ color, size }, i) => {
    const share = size / pixels.length;
    return {
      color: toHex(color),
      share: Math.round(share * 1000) / 1000,
      perceptualLightness: Math.round(perceptualLightness(color)),
      role: roleOf(color, share, clusters.slice(0, i)),
    };
  });
}

/** Keys named by role ("midtone1", "accent1"…) and one legend character per key, for `pixels` rows. */
export function referencePalette(swatches: readonly Swatch[]): ReferencePalette {
  const counts = new Map<SwatchRole, number>();
  const entries = swatches.map((sw, i): PaletteEntry => {
    const n = (counts.get(sw.role) ?? 0) + 1;
    counts.set(sw.role, n);
    return { ...sw, key: `${sw.role}${n}`, char: LEGEND_CHARS[i] ?? null };
  });
  return {
    entries,
    palette: Object.fromEntries(entries.map((e) => [e.key, e.color])),
    legend: Object.fromEntries(entries.filter((e) => e.char !== null).map((e) => [e.char, e.key])),
  };
}

/** Markdown table of a reference palette, then the JSON to paste into a spec. */
export function paletteToMarkdown({ entries, palette, legend }: ReferencePalette): string {
  return [
    '| key | char | color | role | share | L* |',
    '| --- | --- | --- | --- | --- | --- |',
    ...entries.map((e) => `| ${e.key} | ${e.char ?? ''} | ${e.color} | ${e.role} | ${Math.round(e.share * 100)}% | ${e.perceptualLightness} |`),
    '',
    '```json',
    JSON.stringify({ palette, legend }, null, 2),
    '```',
    '',
    'Derive each material\'s other tones with "~" steps ("midtone1~-1"), and merge near duplicates.',
  ].join('\n');
}

function opaquePixels(img: Image): RGBA[] {
  const step = Math.max(1, Math.ceil(Math.sqrt((img.width * img.height) / MAX_SAMPLES)));
  const out: RGBA[] = [];
  for (let y = 0; y < img.height; y += step)
    for (let x = 0; x < img.width; x += step) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] >= MIN_ALPHA) out.push([img.data[i], img.data[i + 1], img.data[i + 2], 255]);
    }
  return out;
}

/**
 * Median cut: split the bucket with the widest channel range (weighted by size, so big areas split
 * too) at the median of that channel, until there are `count` buckets.
 */
function medianCut(pixels: RGBA[], count: number): Cluster[] {
  const buckets: RGBA[][] = [pixels];
  while (buckets.length < count) {
    let pick = -1, widest = 0;
    buckets.forEach((bucket, i) => {
      if (bucket.length < 2) return;
      const width = Math.max(channelRange(bucket, 0), channelRange(bucket, 1), channelRange(bucket, 2)) * Math.sqrt(bucket.length);
      if (width > widest) (widest = width), (pick = i);
    });
    if (pick < 0) break;
    const bucket = buckets[pick];
    const channel = ([0, 1, 2] as const).reduce((best, c) => (channelRange(bucket, c) > channelRange(bucket, best) ? c : best), 0 as 0 | 1 | 2);
    const sorted = [...bucket].sort((a, b) => a[channel] - b[channel] || a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    const mid = sorted.length >> 1;
    buckets.splice(pick, 1, sorted.slice(0, mid), sorted.slice(mid));
  }
  return buckets.filter((b) => b.length).map((b) => cluster(meanColor(b.map((color) => ({ color, size: 1 }))), b.length));
}

/**
 * Merge the two most similar clusters (smallest ΔE) until `count` remain, so near duplicates of a
 * big area collapse while a small, distinct accent survives.
 */
function mergeClosest(clusters: Cluster[], count: number): Cluster[] {
  const out = [...clusters];
  while (out.length > count) {
    let a = 0, b = 1, best = Infinity;
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const d = labDistance(out[i].lab, out[j].lab);
        if (d < best) (best = d), (a = i), (b = j);
      }
    const merged = cluster(meanColor([out[a], out[b]]), out[a].size + out[b].size);
    out.splice(b, 1);
    out.splice(a, 1, merged);
  }
  return out;
}

function cluster(color: RGBA, size: number): Cluster {
  return { color, lab: toLab(color), size };
}

function channelRange(pixels: RGBA[], channel: number): number {
  let lo = 255, hi = 0;
  for (const p of pixels) (lo = Math.min(lo, p[channel])), (hi = Math.max(hi, p[channel]));
  return hi - lo;
}

/** Size-weighted mean color. */
function meanColor(parts: { color: RGBA; size: number }[]): RGBA {
  const total = parts.reduce((sum, p) => sum + p.size, 0);
  const channel = (i: number) => Math.round(parts.reduce((sum, p) => sum + p.color[i] * p.size, 0) / total);
  return [channel(0), channel(1), channel(2), 255];
}

/**
 * The role of a color among the larger ones before it. An accent is small, vivid and of a hue no
 * larger color has; a small vivid tone of a big color is just one of its tones.
 */
function roleOf(color: RGBA, share: number, larger: readonly Cluster[]): SwatchRole {
  const [hue, saturation] = rgbToHsl(color);
  if (saturation < NEUTRAL_SATURATION) return 'neutral';
  const ownHue = larger.every((c) => {
    const [h, s] = rgbToHsl(c.color);
    return s < NEUTRAL_SATURATION || Math.abs(((hue - h + 1.5) % 1) - 0.5) * 360 >= ACCENT_HUE_GAP;
  });
  if (saturation >= ACCENT_SATURATION && share < ACCENT_MAX_SHARE && ownHue) return 'accent';
  const lightness = perceptualLightness(color);
  if (lightness < SHADOW_BELOW) return 'shadow';
  if (lightness > HIGHLIGHT_ABOVE) return 'highlight';
  return 'midtone';
}
