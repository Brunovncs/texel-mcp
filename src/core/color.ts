import type { RGBA } from './types';

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const SHIFT = /^(.+?):([+-]?\d+(?:\.\d+)?)$/;

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

export type ColorResult = { ok: true; color: RGBA } | { ok: false; error: string; hint?: string };

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
  const shift = SHIFT.exec(text);
  if (shift) {
    const inner = resolveColor(shift[1], palette, used, depth + 1);
    return inner.ok ? { ok: true, color: shiftLightness(inner.color, Number(shift[2])) } : inner;
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
