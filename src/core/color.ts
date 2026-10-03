import type { RGBA } from './types';

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const SHIFT = /^(.+?):([+-]?\d+(?:\.\d+)?)$/;
const TONE = /^(.+?)~([+-]?[1-4])$/;

export const TRANSPARENT: RGBA = [0, 0, 0, 0];

export function parseHex(s: string): RGBA | null {
  const m = HEX.exec(s.trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('');
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), hex.length === 8 ? n(6) : 255];
}

export function toHex(c: RGBA): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}${c[3] < 255 ? h(c[3]) : ''}`;
}

export function rgbToHsl([r, g, b]: RGBA): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h / 6, s, l];
}

export function hslToRgb(h: number, s: number, l: number, a = 255): RGBA {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v, a];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(hue(h + 1 / 3) * 255), Math.round(hue(h) * 255), Math.round(hue(h - 1 / 3) * 255), a];
}

/** Shift HSL lightness by `pct` percentage points (-100..100). Alpha is preserved. */
export function shiftLightness(c: RGBA, pct: number): RGBA {
  if (pct === 0 || c[3] === 0) return c;
  const [h, s, l] = rgbToHsl(c);
  return hslToRgb(h, s, Math.min(1, Math.max(0, l + pct / 100)), c[3]);
}

/** Hue a painter's ramp drifts toward, as a fraction of a turn: lighter tones toward yellow, darker toward blue. */
export const WARM_HUE = 60 / 360;
export const COOL_HUE = 230 / 360;
/** HSL lightness points in one tone step (`~1`). */
const TONE_STEP_POINTS = 9;
/** Hue drift of one tone step, as a fraction of a turn (about 4°). */
const HUE_DRIFT_PER_STEP = 0.012;
/** Below this HSL saturation a color is a gray, and keeps its hue. */
const GRAY_SATURATION = 0.06;

/** `h` moved toward the warm or cool target by `amount` (fractions of a turn), never past it. Grays keep their hue. */
function driftHue(h: number, s: number, lighter: boolean, amount: number): number {
  if (s < GRAY_SATURATION) return h;
  let d = (lighter ? WARM_HUE : COOL_HUE) - h;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return (h + Math.sign(d) * Math.min(Math.abs(d), amount) + 1) % 1;
}

/**
 * One step along a pixel-art tone ramp (-4..4). Lighter steps warm toward yellow and lose a little
 * saturation; darker steps cool toward blue and gain some, which reads richer than plain lightness.
 */
export function tone(c: RGBA, step: number): RGBA {
  if (step === 0 || c[3] === 0) return c;
  const [h, s, l] = rgbToHsl(c);
  const hue = driftHue(h, s, step > 0, Math.abs(step) * HUE_DRIFT_PER_STEP);
  const sat = step < 0 ? Math.min(1, s + 0.04 * -step) : Math.max(0, s - 0.02 * step);
  return hslToRgb(hue, sat, Math.min(1, Math.max(0, l + step * (TONE_STEP_POINTS / 100))), c[3]);
}

/**
 * Lightness shift by `pct` points with the hue drift of a tone ramp (shadows cooler, light warmer),
 * for shading that should read like painted light rather than a gray overlay. Saturation is kept.
 */
export function shiftTone(c: RGBA, pct: number): RGBA {
  if (pct === 0 || c[3] === 0) return c;
  const [h, s, l] = rgbToHsl(c);
  return hslToRgb(driftHue(h, s, pct > 0, (Math.abs(pct) * HUE_DRIFT_PER_STEP) / TONE_STEP_POINTS), s, Math.min(1, Math.max(0, l + pct / 100)), c[3]);
}

export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  return [0, 1, 2, 3].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGBA;
}

export function luminance([r, g, b]: RGBA): number {
  const ch = (v: number) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** CIE L*a*b* coordinates: perceptual lightness 0–100, then the green–red and blue–yellow axes. */
export type Lab = [l: number, a: number, b: number];

/** Perceptual lightness (CIE L*), 0–100. Not HSL lightness, which `:` shifts and `shiftLightness` uses. */
export function perceptualLightness(c: RGBA): number {
  const y = luminance(c);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

/** CIE L*a*b* (D65) of an sRGB color. */
export function toLab([r, g, b]: RGBA): Lab {
  const lin = (v: number) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  const [rl, gl, bl] = [lin(r), lin(g), lin(b)];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f((0.4124 * rl + 0.3576 * gl + 0.1805 * bl) / 0.95047);
  const fy = f(0.2126 * rl + 0.7152 * gl + 0.0722 * bl);
  const fz = f((0.0193 * rl + 0.1192 * gl + 0.9505 * bl) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Perceptual color distance (CIE76 ΔE): about 2 is barely visible, above 10 reads as another color. */
export function deltaE(a: RGBA, b: RGBA): number {
  return labDistance(toLab(a), toLab(b));
}

/** ΔE between two colors already in Lab. */
export function labDistance([l1, a1, b1]: Lab, [l2, a2, b2]: Lab): number {
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** `guessed` explains how a near-miss expression was read, e.g. "armor-1" as "armor~-1". */
export type ColorResult = { ok: true; color: RGBA; guessed?: string } | { ok: false; error: string; hint?: string };

/** Near misses models write for tone steps: "armor-1", "armor+2", or a shift with no number ("coat:"). */
const NEAR_MISS = /^(.+?)(?:([-+])([1-4])|[:~])$/;

/**
 * Resolve a color expression against a palette. Palette values may themselves reference other
 * palette keys ("skinShade": "skin:-12"). `used` collects every palette key touched.
 */
export function resolveColor(
  expr: unknown,
  palette: Record<string, string>,
  used?: Set<string>,
  depth = 0,
): ColorResult {
  if (typeof expr !== 'string' || !expr.trim()) return { ok: false, error: 'color must be a non-empty string' };
  if (depth > 8) return { ok: false, error: `palette reference chain too deep at "${expr}"` };
  const text = expr.trim();
  const toned = TONE.exec(text);
  if (toned) {
    const inner = resolveColor(toned[1], palette, used, depth + 1);
    return inner.ok ? { ok: true, color: tone(inner.color, Number(toned[2])), guessed: inner.guessed } : inner;
  }
  const shift = SHIFT.exec(text);
  if (shift) {
    const inner = resolveColor(shift[1], palette, used, depth + 1);
    return inner.ok ? { ok: true, color: shiftLightness(inner.color, Number(shift[2])), guessed: inner.guessed } : inner;
  }
  if (text === 'transparent') return { ok: true, color: TRANSPARENT };
  if (text.startsWith('#')) {
    const c = parseHex(text);
    return c ? { ok: true, color: c } : { ok: false, error: `invalid hex color "${text}"`, hint: 'use #rgb, #rrggbb or #rrggbbaa' };
  }
  if (Object.prototype.hasOwnProperty.call(palette, text)) {
    used?.add(text);
    return resolveColor(palette[text], palette, used, depth + 1);
  }
  const near = NEAR_MISS.exec(text);
  if (near && Object.prototype.hasOwnProperty.call(palette, near[1])) {
    const inner = resolveColor(near[1], palette, used, depth + 1);
    const step = near[3] ? Number(`${near[2]}${near[3]}`) : 0;
    if (inner.ok) return { ok: true, color: tone(inner.color, step), guessed: `read "${text}" as "${near[1]}${step ? `~${step}` : ''}"` };
  }
  return { ok: false, error: `unknown color or palette key "${text}"`, hint: suggestHint(text, Object.keys(palette)) };
}

export function suggestHint(word: string, options: readonly string[]): string | undefined {
  const s = suggest(word, options);
  return s ? `did you mean "${s}"?` : undefined;
}

export function suggest(word: string, options: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const o of options) {
    const d = levenshtein(word.toLowerCase(), o.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = o;
    }
  }
  return best !== undefined && bestDist <= Math.max(2, Math.floor(word.length / 3)) ? best : undefined;
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}
