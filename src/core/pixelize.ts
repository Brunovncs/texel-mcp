import { labDistance, parseHex, perceptualLightness, toHex, toLab, tone, type Lab } from './color.js';
import type { Image, RGBA } from './types.js';

/**
 * Reference art to pixel art: a large image (concept art, a photo of a sword, an AI render on a
 * white background, an HD skin) becomes a clean texture of the target size, ready for
 * `textureToSpec`. Background removal, crop and fit, area-averaged downscale with premultiplied
 * alpha, alpha threshold, quantizing in Lab, cleanup, outline.
 */

export interface PixelizeOptions {
  /** Colors after quantizing (2–64); 0 keeps the averaged colors. Default 16. */
  colors?: number;
  /** Alpha at or above which a pixel is opaque (1–255); below it is transparent. Default 128. */
  alpha?: number;
  /**
   * 'auto' (default): when the image has no transparency, a flat background color touching the
   * corners is made transparent (flood fill from the border with a tolerance); 'keep': never; or a
   * color "#rrggbb" to flood from the border.
   */
  background?: 'auto' | 'keep' | string;
  /**
   * 'contain' (default): crop to the opaque bounding box, scale to fit keeping the aspect ratio,
   * center, pad transparent. 'cover': crop to the opaque box, then fill the target and cut the
   * excess. 'stretch': the whole image onto the whole target; use it, with background 'keep', for a
   * texture whose layout must survive (an HD skin; see `isIntegerScale`).
   */
  fit?: 'contain' | 'cover' | 'stretch';
  /**
   * Remove lone opaque pixels with no opaque neighbor, fill lone transparent holes enclosed by 4
   * opaque neighbors, and replace single pixels whose 4 neighbors share one close color
   * (despeckle). A high-contrast detail (an eye) and 1-pixel diagonal lines stay. Default true.
   */
  cleanup?: boolean;
  /**
   * A 1-pixel outline around the opaque shape, like vanilla items: "#rrggbb", or 'auto' (the
   * darkest color, darkened). The shape is fitted 1 pixel inside the target to make room. Default none.
   */
  outline?: string;
}

export interface PixelizeResult {
  /** `width`×`height`, every pixel fully opaque or fully transparent ([0, 0, 0, 0]). */
  image: Image;
  /** `#rrggbb` colors of the image, most common first. */
  palette: string[];
  /** What was done, in short sentences for the user. */
  notes: string[];
}

const MAX_SIDE = 512;
const DEFAULT_COLORS = 16;
const MIN_COLORS = 2;
const MAX_COLORS = 64;
const DEFAULT_ALPHA = 128;
/** ΔE within which a pixel is the background color (JPEG noise, paper grain). */
const BACKGROUND_TOLERANCE = 12;
/** Share of the border pixels that must be the background color for 'auto' to remove it. */
const BACKGROUND_BORDER_SHARE = 0.5;
/** A speck farther than this ΔE from its surroundings is a detail (an eye, a rivet) and stays. */
const SPECK_MAX_DELTA = 25;
/** Tone steps below the darkest color for an 'auto' outline. */
const OUTLINE_TONE = -2;
/** Median cut makes this many times the colors asked for; the closest are then merged. */
const OVERSPLIT = 2;
const KMEANS_ROUNDS = 4;
/** Colors closer than this ΔE are merged even within the budget: nobody sees them apart. */
const SAME_COLOR = 3;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const FITS = ['contain', 'cover', 'stretch'] as const;

interface Box { x: number; y: number; w: number; h: number }
interface Settings { colors: number; alpha: number; background: 'auto' | 'keep' | RGBA; fit: (typeof FITS)[number]; cleanup: boolean; outline: 'auto' | RGBA | null }

/** True when `src` is an exact integer multiple (1×, 2×, 4×…) of `width`×`height` with the same aspect ratio. */
export function isIntegerScale(src: Image, width: number, height: number): boolean {
  return width >= 1 && height >= 1 && src.width % width === 0 && src.height % height === 0 && src.width / width === src.height / height;
}

/** Pixelize a reference image to `width`×`height`. Deterministic; throws on bad options. */
export function pixelize(src: Image, width: number, height: number, opts: PixelizeOptions = {}): PixelizeResult {
  const s = settings(src, width, height, opts);
  const notes: string[] = [];
  const data = removeBackground(src, s, notes);
  const out = new Uint8ClampedArray(width * height * 4);
  const image: Image = { width, height, data: out };
  const box = s.fit === 'stretch' ? { x: 0, y: 0, w: src.width, h: src.height } : opaqueBox(data, src.width, src.height, s.alpha);
  if (!box) {
    notes.push('nothing opaque to draw');
    return { image, palette: [], notes };
  }
  if (s.fit !== 'stretch' && (box.w !== src.width || box.h !== src.height)) notes.push(`cropped to ${box.w}×${box.h} opaque area`);

  const margin = s.outline && width >= 3 && height >= 3 ? 1 : 0;
  const [from, to] = placement(s.fit, box, width - 2 * margin, height - 2 * margin);
  to.x += margin;
  to.y += margin;
  const factor = from.w / to.w;
  const exact = Number.isInteger(factor) && from.h / to.h === factor && [from.x, from.y, from.w, from.h].every(Number.isInteger);
  notes.push(`scaled ${Math.round(from.w)}×${Math.round(from.h)} to ${to.w}×${to.h}${exact && factor > 1 ? ` (exact ${factor}× average)` : ''}`);
  const sums = resample(data, src.width, src.height, from, to.w, to.h);
  for (let y = 0; y < to.h; y++)
    for (let x = 0; x < to.w; x++) {
      const i = (y * to.w + x) * 4;
      const a = sums[i + 3];
      if (Math.round(a * 255) < s.alpha) continue;
      const o = ((to.y + y) * width + to.x + x) * 4;
      out.set([Math.round(sums[i] / a), Math.round(sums[i + 1] / a), Math.round(sums[i + 2] / a), 255], o);
    }

  const distinct = histogram(out).size;
  const kept = s.colors && distinct ? quantize(out, s.colors) : distinct;
  notes.push(kept < distinct ? `quantized from ${distinct} to ${kept} colors` : `${distinct} colors`);

  if (s.cleanup) {
    const { lone, holes, specks } = cleanup(out, width, height);
    const done = [count(lone, 'lone pixel', 'removed'), count(holes, 'hole', 'filled'), count(specks, 'speck', 'merged')].filter(Boolean);
    if (done.length) notes.push(`cleanup: ${done.join(', ')}`);
  }

  if (s.outline) {
    const color = s.outline === 'auto' ? darkest(out) : s.outline;
    if (color) notes.push(`outline ${toHex(color)} (${outline(out, width, height, color)} pixels)`);
  }

  if (!histogram(out).size) notes.push('nothing opaque left at this size');
  return { image, palette: paletteOf(out), notes };
}

function settings(src: Image, width: number, height: number, opts: PixelizeOptions): Settings {
  if (!src || !Number.isInteger(src.width) || !Number.isInteger(src.height) || src.width < 1 || src.height < 1 || src.data?.length !== src.width * src.height * 4)
    throw new Error('the source must be an RGBA image with data of width × height × 4 bytes');
  for (const [name, v] of [['width', width], ['height', height]] as const)
    if (!Number.isInteger(v) || v < 1 || v > MAX_SIDE) throw new Error(`${name} must be an integer from 1 to ${MAX_SIDE}, got ${v}`);
  const { colors = DEFAULT_COLORS, alpha = DEFAULT_ALPHA, background = 'auto', fit = 'contain', cleanup = true, outline } = opts;
  if (!Number.isInteger(colors) || (colors !== 0 && (colors < MIN_COLORS || colors > MAX_COLORS)))
    throw new Error(`colors must be 0 (keep the averaged colors) or an integer from ${MIN_COLORS} to ${MAX_COLORS}, got ${colors}`);
  if (!Number.isInteger(alpha) || alpha < 1 || alpha > 255) throw new Error(`alpha must be an integer from 1 to 255, got ${alpha}`);
  if (!FITS.includes(fit)) throw new Error(`fit must be one of ${FITS.join(', ')}, got "${fit}"`);
  if (typeof cleanup !== 'boolean') throw new Error('cleanup must be true or false');
  return {
    colors,
    alpha,
    background: background === 'auto' || background === 'keep' ? background : hexOption('background', background, '"auto", "keep" or'),
    fit,
    cleanup,
    outline: outline === undefined ? null : outline === 'auto' ? 'auto' : hexOption('outline', outline, '"auto" or'),
  };
}

function hexOption(name: string, value: unknown, alternatives: string): RGBA {
  const c = typeof value === 'string' && HEX.test(value.trim()) ? parseHex(value) : null;
  if (!c) throw new Error(`${name} must be ${alternatives} a color "#rrggbb", got ${JSON.stringify(value)}`);
  return c;
}

const count = (n: number, noun: string, verb: string) => (n ? `${n} ${noun}${n === 1 ? '' : 's'} ${verb}` : '');

/** Flood fill from the border through the background color (and through pixels already transparent). */
function removeBackground(src: Image, s: Settings, notes: string[]): Uint8ClampedArray {
  const { width: w, height: h, data } = src;
  if (s.background === 'keep') return data;
  if (s.background === 'auto') for (let i = 3; i < data.length; i += 4) if (data[i] < s.alpha) return data;
  const bg = s.background === 'auto' ? borderColor(src) : s.background;
  if (!bg) return data;
  const near = nearColor(bg);
  const passable = (p: number) => data[p * 4 + 3] < s.alpha || near(data, p * 4);
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const push = (p: number) => {
    if (!seen[p] && passable(p)) (seen[p] = 1), (queue[tail++] = p);
  };
  for (let x = 0; x < w; x++) push(x), push((h - 1) * w + x);
  for (let y = 0; y < h; y++) push(y * w), push(y * w + w - 1);
  while (head < tail) {
    const p = queue[head++], x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < (h - 1) * w) push(p + w);
  }
  const out = new Uint8ClampedArray(data);
  let removed = 0;
  for (let k = 0; k < tail; k++) {
    const i = queue[k] * 4;
    if (data[i + 3] >= s.alpha) removed++;
    out.fill(0, i, i + 4);
  }
  notes.push(removed ? `background ${toHex(bg)} removed (${Math.round((removed / (w * h)) * 100)}% of the image)` : `no ${toHex(bg)} background on the border`);
  return out;
}

/** Whether the pixel at byte `i` is within the background tolerance of `bg`, cached per color. */
function nearColor(bg: RGBA): (data: Uint8ClampedArray, i: number) => boolean {
  const lab = toLab(bg);
  const cache = new Map<number, boolean>();
  return (data, i) => {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let hit = cache.get(key);
    if (hit === undefined) cache.set(key, (hit = labDistance(toLab([data[i], data[i + 1], data[i + 2], 255]), lab) <= BACKGROUND_TOLERANCE));
    return hit;
  };
}

/** The corner color most corners agree on, if at least two do and it covers half the border. */
function borderColor({ width: w, height: h, data }: Image): RGBA | null {
  const at = (x: number, y: number): RGBA => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2], 255];
  };
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  let best: RGBA | null = null, agree = 0;
  for (const c of corners) {
    const lab = toLab(c);
    const n = corners.filter((d) => labDistance(lab, toLab(d)) <= BACKGROUND_TOLERANCE).length;
    if (n > agree) (agree = n), (best = c);
  }
  if (!best || agree < 2) return null;
  const near = nearColor(best);
  let total = 0, hits = 0;
  const visit = (x: number, y: number) => {
    total++;
    if (near(data, (y * w + x) * 4)) hits++;
  };
  for (let x = 0; x < w; x++) visit(x, 0), h > 1 && visit(x, h - 1);
  for (let y = 1; y < h - 1; y++) visit(0, y), w > 1 && visit(w - 1, y);
  return hits / total >= BACKGROUND_BORDER_SHARE ? best : null;
}

function opaqueBox(data: Uint8ClampedArray, w: number, h: number, alpha: number): Box | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] >= alpha) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The source window (fractional for 'cover') and the integer target rectangle it lands on. */
function placement(fit: Settings['fit'], box: Box, bw: number, bh: number): [Box, Box] {
  if (fit === 'stretch') return [box, { x: 0, y: 0, w: bw, h: bh }];
  if (fit === 'cover') {
    const scale = Math.max(bw / box.w, bh / box.h);
    const vw = bw / scale, vh = bh / scale;
    return [{ x: box.x + (box.w - vw) / 2, y: box.y + (box.h - vh) / 2, w: vw, h: vh }, { x: 0, y: 0, w: bw, h: bh }];
  }
  const scale = Math.min(bw / box.w, bh / box.h);
  const dw = Math.max(1, Math.min(bw, Math.round(box.w * scale)));
  const dh = Math.max(1, Math.min(bh, Math.round(box.h * scale)));
  return [box, { x: Math.floor((bw - dw) / 2), y: Math.floor((bh - dh) / 2), w: dw, h: dh }];
}

/** For each of `n` output cells over [start, start + size): the source indices it covers and by how much. */
function spans(start: number, size: number, n: number, limit: number): { i: number; w: number }[][] {
  const step = size / n;
  return Array.from({ length: n }, (_, k) => {
    const a = start + k * step, b = a + step;
    const out: { i: number; w: number }[] = [];
    for (let i = Math.max(0, Math.floor(a)); i < Math.min(limit, Math.ceil(b)); i++) {
      const w = Math.min(b, i + 1) - Math.max(a, i);
      if (w > 1e-9) out.push({ i, w });
    }
    return out;
  });
}

/**
 * Area average of `from` into `dw`×`dh` cells, in two separable passes. Color is weighted by alpha
 * (premultiplied), so a transparent pixel's hidden color never bleeds in. Returns per cell
 * r·a, g·a, b·a (0–255 times alpha) and alpha (0–1).
 */
function resample(data: Uint8ClampedArray, w: number, h: number, from: Box, dw: number, dh: number): Float64Array {
  const xs = spans(from.x, from.w, dw, w), ys = spans(from.y, from.h, dh, h);
  const y0 = ys[0][0]?.i ?? 0, rows = (ys[dh - 1].at(-1)?.i ?? y0) - y0 + 1;
  const row = new Float64Array(rows * dw * 4);
  for (let r = 0; r < rows; r++)
    xs.forEach((cell, x) => {
      let pr = 0, pg = 0, pb = 0, pa = 0, total = 0;
      for (const { i, w: weight } of cell) {
        const p = ((y0 + r) * w + i) * 4, a = (data[p + 3] / 255) * weight;
        (pr += data[p] * a), (pg += data[p + 1] * a), (pb += data[p + 2] * a), (pa += a), (total += weight);
      }
      if (total) row.set([pr / total, pg / total, pb / total, pa / total], (r * dw + x) * 4);
    });
  const out = new Float64Array(dw * dh * 4);
  ys.forEach((cell, y) => {
    let total = 0;
    for (const { i, w: weight } of cell) {
      const p = (i - y0) * dw * 4;
      total += weight;
      for (let k = 0; k < dw * 4; k++) out[y * dw * 4 + k] += row[p + k] * weight;
    }
    if (total) for (let k = y * dw * 4; k < (y + 1) * dw * 4; k++) out[k] /= total;
  });
  return out;
}

/** Opaque colors as 0xrrggbb → pixel count. */
function histogram(data: Uint8ClampedArray): Map<number, number> {
  const hist = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) if (data[i + 3]) {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    hist.set(key, (hist.get(key) ?? 0) + 1);
  }
  return hist;
}

const rgbOf = (key: number): RGBA => [key >> 16, (key >> 8) & 255, key & 255, 255];

interface Bin { color: RGBA; lab: Lab; n: number }

/** Reduce the image to at most `k` colors in place, merging invisible differences; returns how many it kept. */
function quantize(data: Uint8ClampedArray, k: number): number {
  const bins: Bin[] = [...histogram(data)].sort((a, b) => a[0] - b[0]).map(([key, n]) => bin(rgbOf(key), n));
  let centers = mergeClosest(medianCut(bins, k * OVERSPLIT), k);
  const nearest = (lab: Lab) => {
    let best = 0, dist = Infinity;
    centers.forEach((c, i) => {
      const d = labDistance(lab, c.lab);
      if (d < dist) (dist = d), (best = i);
    });
    return best;
  };
  for (let round = 0; round < KMEANS_ROUNDS; round++) {
    const groups = centers.map((): Bin[] => []);
    for (const b of bins) groups[nearest(b.lab)].push(b);
    centers = groups.filter((g) => g.length).map((g) => bin(meanColor(g), g.reduce((s, b) => s + b.n, 0)));
  }
  const map = new Map<number, RGBA>(bins.map((b) => [(b.color[0] << 16) | (b.color[1] << 8) | b.color[2], centers[nearest(b.lab)].color]));
  for (let i = 0; i < data.length; i += 4) if (data[i + 3]) data.set(map.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])!, i);
  return histogram(data).size;
}

const bin = (color: RGBA, n: number): Bin => ({ color, lab: toLab(color), n });

function meanColor(bins: Bin[]): RGBA {
  const total = bins.reduce((s, b) => s + b.n, 0);
  const ch = (c: number) => Math.round(bins.reduce((s, b) => s + b.color[c] * b.n, 0) / total);
  return [ch(0), ch(1), ch(2), 255];
}

/** Split the widest bucket (channel range × √pixels) at its weighted median until there are `count`. */
function medianCut(bins: Bin[], count: number): Bin[] {
  const range = (bucket: Bin[], c: number) => {
    let lo = 255, hi = 0;
    for (const b of bucket) (lo = Math.min(lo, b.color[c])), (hi = Math.max(hi, b.color[c]));
    return hi - lo;
  };
  const buckets: Bin[][] = [bins];
  while (buckets.length < count) {
    let pick = -1, widest = 0;
    buckets.forEach((bucket, i) => {
      if (bucket.length < 2) return;
      const width = Math.max(range(bucket, 0), range(bucket, 1), range(bucket, 2)) * Math.sqrt(bucket.reduce((s, b) => s + b.n, 0));
      if (width > widest) (widest = width), (pick = i);
    });
    if (pick < 0) break;
    const bucket = buckets[pick];
    const c = [0, 1, 2].reduce((best, ch) => (range(bucket, ch) > range(bucket, best) ? ch : best), 0);
    const sorted = [...bucket].sort((a, b) => a.color[c] - b.color[c] || a.color[0] - b.color[0] || a.color[1] - b.color[1] || a.color[2] - b.color[2]);
    const half = sorted.reduce((s, b) => s + b.n, 0) / 2;
    let cut = 0;
    for (let acc = 0; cut < sorted.length - 1 && acc + sorted[cut].n <= half; cut++) acc += sorted[cut].n;
    cut = Math.max(1, Math.min(sorted.length - 1, cut));
    buckets.splice(pick, 1, sorted.slice(0, cut), sorted.slice(cut));
  }
  return buckets.map((b) => bin(meanColor(b), b.reduce((s, x) => s + x.n, 0)));
}

/** Merge the two closest colors (ΔE) until `count` remain and none are near twins, so a small distinct accent survives. */
function mergeClosest(clusters: Bin[], count: number): Bin[] {
  const out = [...clusters];
  while (out.length > 1) {
    let a = 0, b = 1, best = Infinity;
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const d = labDistance(out[i].lab, out[j].lab);
        if (d < best) (best = d), (a = i), (b = j);
      }
    if (out.length <= count && best >= SAME_COLOR) break;
    const merged = bin(meanColor([out[a], out[b]]), out[a].n + out[b].n);
    out.splice(b, 1);
    out.splice(a, 1, merged);
  }
  return out;
}

/**
 * One pass over a snapshot, so the result does not depend on scan order. A pixel touching its own
 * kind diagonally is part of a 1-pixel diagonal line (a blade highlight, a rod) and stays.
 */
function cleanup(data: Uint8ClampedArray, w: number, h: number): { lone: number; holes: number; specks: number } {
  const prev = new Uint8ClampedArray(data);
  const key = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return -1;
    const i = (y * w + x) * 4;
    return prev[i + 3] ? (prev[i] << 16) | (prev[i + 1] << 8) | prev[i + 2] : -1;
  };
  let lone = 0, holes = 0, specks = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, own = key(x, y);
      const around = [key(x, y - 1), key(x - 1, y), key(x + 1, y), key(x, y + 1)];
      const corners = [key(x - 1, y - 1), key(x + 1, y - 1), key(x - 1, y + 1), key(x + 1, y + 1)];
      const opaque = around.filter((k) => k >= 0);
      if (own >= 0 && !opaque.length && corners.every((k) => k < 0)) {
        data.fill(0, i, i + 4);
        lone++;
      } else if (own < 0 && opaque.length === 4) {
        const tally = new Map<number, number>();
        for (const k of opaque) tally.set(k, (tally.get(k) ?? 0) + 1);
        const fill = [...tally].reduce((best, e) => (e[1] > best[1] ? e : best))[0];
        data.set(rgbOf(fill), i);
        holes++;
      } else if (own >= 0 && opaque.length === 4 && opaque.every((k) => k === opaque[0]) && opaque[0] !== own && !corners.includes(own) && labDistance(toLab(rgbOf(own)), toLab(rgbOf(opaque[0]))) <= SPECK_MAX_DELTA) {
        data.set(rgbOf(opaque[0]), i);
        specks++;
      }
    }
  return { lone, holes, specks };
}

function darkest(data: Uint8ClampedArray): RGBA | null {
  let best: RGBA | null = null, low = Infinity;
  for (const key of [...histogram(data).keys()].sort((a, b) => a - b)) {
    const c = rgbOf(key), l = perceptualLightness(c);
    if (l < low) (low = l), (best = c);
  }
  return best && tone(best, OUTLINE_TONE);
}

/** Paint every transparent pixel 4-adjacent to the shape; returns how many. */
function outline(data: Uint8ClampedArray, w: number, h: number, color: RGBA): number {
  const prev = new Uint8ClampedArray(data);
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && prev[(y * w + x) * 4 + 3] > 0;
  let n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!opaque(x, y) && (opaque(x, y - 1) || opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y + 1))) {
        data.set([color[0], color[1], color[2], 255], (y * w + x) * 4);
        n++;
      }
  return n;
}

function paletteOf(data: Uint8ClampedArray): string[] {
  return [...histogram(data)].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([key]) => toHex(rgbOf(key)));
}
