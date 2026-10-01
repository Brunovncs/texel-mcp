import { mix, resolveColor, shiftLightness, suggestHint, TRANSPARENT } from './color';
import { boxSize, faceRect, PARTS, SKIN_SIZE } from './layout';
import { parseSelector } from './selector';
import type { FaceName, FaceRef, Image, Issue, LayerName, Model, PartName, Rect, RGBA, SkinSpec } from './types';

export const OP_KEYS: Record<string, { required: string[]; optional: string[] }> = {
  fill: { required: ['target', 'color'], optional: [] },
  rect: { required: ['target', 'color'], optional: ['x', 'y', 'w', 'h'] },
  clear: { required: ['target'], optional: ['x', 'y', 'w', 'h'] },
  pixels: { required: ['target', 'rows'], optional: ['x', 'y', 'legend'] },
  points: { required: ['target', 'points', 'color'], optional: [] },
  line: { required: ['target', 'from', 'to', 'color'], optional: [] },
  gradient: { required: ['target', 'from', 'to'], optional: ['direction', 'steps', 'x', 'y', 'w', 'h'] },
  pattern: { required: ['target', 'kind', 'colors'], optional: ['size', 'x', 'y', 'w', 'h'] },
  noise: { required: ['target'], optional: ['colors', 'density', 'jitter', 'seed', 'x', 'y', 'w', 'h'] },
  shade: { required: ['target', 'amount'], optional: ['x', 'y', 'w', 'h'] },
  copy: { required: ['from', 'to'], optional: ['flip'] },
  mirror: { required: ['from', 'to'], optional: ['layer'] },
  symmetrize: { required: ['target'], optional: ['source'] },
};
const COMMON_KEYS = ['op', 'id', 'note', 'enabled'];
const SPEC_KEYS = ['$schema', 'version', 'name', 'description', 'author', 'tags', 'model', 'palette', 'legend', 'layers'];
const RESERVED_CHARS = new Set(['.', '_']);

export interface CompileResult {
  ok: boolean;
  spec: SkinSpec | null;
  model: Model;
  texture: Image;
  issues: Issue[];
  /** Palette keys that were referenced at least once. */
  usedPalette: string[];
}

type Json = Record<string, unknown>;

class Ctx {
  readonly data = new Uint8ClampedArray(SKIN_SIZE * SKIN_SIZE * 4);
  readonly issues: Issue[] = [];
  readonly used = new Set<string>();
  palette: Record<string, string> = {};
  legend: Record<string, string> = {};
  constructor(public model: Model) {}

  issue(level: Issue['level'], code: string, path: string, message: string, hint?: string) {
    this.issues.push(hint ? { level, code, path, message, hint } : { level, code, path, message });
  }

  get(x: number, y: number): RGBA {
    const i = (y * SKIN_SIZE + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  set(x: number, y: number, c: RGBA) {
    const i = (y * SKIN_SIZE + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3];
  }

  rect(ref: FaceRef): Rect {
    return faceRect(ref.part, ref.face, ref.layer, this.model);
  }

  color(expr: unknown, path: string): RGBA | null {
    const r = resolveColor(expr, this.palette, this.used);
    if (r.ok) return r.color;
    this.issue('error', 'bad-color', path, r.error, r.hint);
    return null;
  }

  targets(sel: unknown, path: string): FaceRef[] | null {
    const r = parseSelector(sel);
    if (r.ok) return r.refs;
    this.issue('error', 'bad-selector', path, r.error, r.hint);
    return null;
  }
}

/** Compile a skin spec (object or JSON text) into a 64x64 RGBA texture. Never throws. */
export function compile(input: unknown): CompileResult {
  let raw: unknown = input;
  const early: Issue[] = [];
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      early.push({ level: 'error', code: 'bad-json', path: '$', message: `invalid JSON: ${(e as Error).message}` });
      raw = null;
    }
  }
  const model: Model = isObj(raw) && raw.model === 'slim' ? 'slim' : 'classic';
  const ctx = new Ctx(model);
  ctx.issues.push(...early);

  if (!isObj(raw)) {
    if (!early.length) ctx.issue('error', 'bad-spec', '$', 'spec must be a JSON object');
    return finish(ctx, null);
  }
  const spec = raw as Json;
  checkKeys(ctx, spec, SPEC_KEYS, '$');
  if (spec.version !== 1) ctx.issue('warning', 'version', '$.version', 'missing or unknown "version"; assuming 1', 'add "version": 1');
  if (spec.model !== undefined && spec.model !== 'classic' && spec.model !== 'slim')
    ctx.issue('error', 'bad-model', '$.model', `model must be "classic" or "slim", got ${JSON.stringify(spec.model)}`);

  if (spec.palette !== undefined) {
    if (!isObj(spec.palette)) ctx.issue('error', 'bad-palette', '$.palette', 'palette must be an object of name → color');
    else {
      for (const [k, v] of Object.entries(spec.palette)) {
        if (!/^[A-Za-z][\w-]*$/.test(k)) ctx.issue('error', 'bad-palette-key', `$.palette.${k}`, `palette key "${k}" must start with a letter and use only letters, digits, "_" or "-"`);
        if (typeof v !== 'string') ctx.issue('error', 'bad-color', `$.palette.${k}`, 'palette values must be color strings');
        else ctx.palette[k] = v;
      }
      for (const k of Object.keys(ctx.palette)) {
        const r = resolveColor(ctx.palette[k], ctx.palette);
        if (!r.ok) ctx.issue('error', 'bad-color', `$.palette.${k}`, r.error, r.hint);
      }
    }
  }

  if (spec.legend !== undefined) {
    if (!isObj(spec.legend)) ctx.issue('error', 'bad-legend', '$.legend', 'legend must be an object of single character → color');
    else ctx.legend = readLegend(ctx, spec.legend, '$.legend');
  }

  if (!Array.isArray(spec.layers)) {
    ctx.issue('error', 'no-layers', '$.layers', '"layers" must be an array of operations');
  } else {
    spec.layers.forEach((op, i) => applyOp(ctx, op, i));
  }
  return finish(ctx, spec as unknown as SkinSpec);
}

function finish(ctx: Ctx, spec: SkinSpec | null): CompileResult {
  return {
    ok: !ctx.issues.some((i) => i.level === 'error'),
    spec,
    model: ctx.model,
    texture: { width: SKIN_SIZE, height: SKIN_SIZE, data: ctx.data },
    issues: ctx.issues,
    usedPalette: [...ctx.used],
  };
}

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkKeys(ctx: Ctx, obj: Json, allowed: string[], path: string) {
  for (const k of Object.keys(obj))
    if (!allowed.includes(k)) ctx.issue('warning', 'unknown-key', `${path}.${k}`, `unknown key "${k}" is ignored`, suggestHint(k, allowed));
}

function readLegend(ctx: Ctx, legend: Json, path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [ch, v] of Object.entries(legend)) {
    if ([...ch].length !== 1) ctx.issue('error', 'bad-legend', `${path}.${ch}`, `legend keys must be a single character, got "${ch}"`);
    else if (RESERVED_CHARS.has(ch)) ctx.issue('error', 'bad-legend', `${path}.${ch}`, `"${ch}" is reserved ("." keeps the pixel, "_" erases it)`);
    else if (typeof v !== 'string') ctx.issue('error', 'bad-legend', `${path}.${ch}`, 'legend values must be color expressions');
    else out[ch] = v;
  }
  return out;
}

function num(ctx: Ctx, v: unknown, path: string, opts: { int?: boolean; min?: number; max?: number } = {}): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || (opts.int && !Number.isInteger(v))) {
    ctx.issue('error', 'bad-number', path, `expected ${opts.int ? 'an integer' : 'a number'}, got ${JSON.stringify(v)}`);
    return null;
  }
  if ((opts.min !== undefined && v < opts.min) || (opts.max !== undefined && v > opts.max)) {
    ctx.issue('error', 'out-of-range', path, `${v} is outside [${opts.min ?? '-∞'}, ${opts.max ?? '∞'}]`);
    return null;
  }
  return v;
}

function point(ctx: Ctx, v: unknown, path: string): [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => Number.isInteger(n))) {
    ctx.issue('error', 'bad-point', path, `expected [x, y] integers, got ${JSON.stringify(v)}`);
    return null;
  }
  return [v[0], v[1]];
}

/** Resolve local area (x,y,w,h) against a face rect. Negative x/y count from the right/bottom edge. Result is clipped. */
function area(op: Json, face: Rect): Rect {
  let x = typeof op.x === 'number' ? op.x : 0;
  let y = typeof op.y === 'number' ? op.y : 0;
  if (x < 0) x += face.w;
  if (y < 0) y += face.h;
  const w = typeof op.w === 'number' ? op.w : face.w - x;
  const h = typeof op.h === 'number' ? op.h : face.h - y;
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(face.w, x + w), y1 = Math.min(face.h, y + h);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

function checkArea(ctx: Ctx, op: Json, path: string): boolean {
  let ok = true;
  for (const k of ['x', 'y', 'w', 'h']) if (op[k] !== undefined && num(ctx, op[k], `${path}.${k}`, { int: true, ...(k === 'w' || k === 'h' ? { min: 0 } : {}) }) === null) ok = false;
  return ok;
}

function eachPixel(ctx: Ctx, refs: FaceRef[], op: Json, fn: (tx: number, ty: number, lx: number, ly: number, ref: FaceRef, a: Rect) => void) {
  for (const ref of refs) {
    const face = ctx.rect(ref);
    const a = area(op, face);
    for (let ly = a.y; ly < a.y + a.h; ly++) for (let lx = a.x; lx < a.x + a.w; lx++) fn(face.x + lx, face.y + ly, lx, ly, ref, a);
  }
}

function plot(ctx: Ctx, face: Rect, lx: number, ly: number, c: RGBA) {
  if (lx < 0) lx += face.w;
  if (ly < 0) ly += face.h;
  if (lx >= 0 && ly >= 0 && lx < face.w && ly < face.h) ctx.set(face.x + lx, face.y + ly, c);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function applyOp(ctx: Ctx, raw: unknown, index: number) {
  const path = `$.layers[${index}]`;
  if (!isObj(raw)) return ctx.issue('error', 'bad-op', path, 'each layer must be an object with an "op" field');
  const op = raw;
  const kind = op.op;
  if (typeof kind !== 'string' || !OP_KEYS[kind])
    return ctx.issue('error', 'unknown-op', `${path}.op`, `unknown op ${JSON.stringify(kind)}`, suggestHint(String(kind), Object.keys(OP_KEYS)) ?? `valid ops: ${Object.keys(OP_KEYS).join(', ')}`);
  if (op.enabled === false) return;
  const def = OP_KEYS[kind];
  checkKeys(ctx, op, [...COMMON_KEYS, ...def.required, ...def.optional], path);
  const missing = def.required.filter((k) => op[k] === undefined);
  if (missing.length) return ctx.issue('error', 'missing-key', path, `"${kind}" requires: ${missing.join(', ')}`);

  const before = ctx.issues.length;
  const failed = () => ctx.issues.slice(before).some((i) => i.level === 'error');

  switch (kind) {
    case 'fill':
    case 'rect':
    case 'clear': {
      const refs = ctx.targets(op.target, `${path}.target`);
      const c = kind === 'clear' ? TRANSPARENT : ctx.color(op.color, `${path}.color`);
      if (!checkArea(ctx, op, path) || !refs || !c) return;
      eachPixel(ctx, refs, kind === 'fill' ? {} : op, (tx, ty) => ctx.set(tx, ty, c));
      return;
    }
    case 'pixels': {
      const refs = ctx.targets(op.target, `${path}.target`);
      if (!checkArea(ctx, op, path)) return;
      if (!Array.isArray(op.rows) || !op.rows.every((r) => typeof r === 'string'))
        return ctx.issue('error', 'bad-rows', `${path}.rows`, '"rows" must be an array of strings');
      const legend = isObj(op.legend) ? { ...ctx.legend, ...readLegend(ctx, op.legend, `${path}.legend`) } : ctx.legend;
      const cache = new Map<string, RGBA | null>();
      const rows = op.rows as string[];
      for (const ch of new Set(rows.join(''))) {
        if (RESERVED_CHARS.has(ch)) continue;
        if (!(ch in legend)) {
          ctx.issue('error', 'unknown-char', `${path}.rows`, `character "${ch}" is not in the legend`, `add it to "legend" (op-level or top-level), or use "." to keep / "_" to erase`);
          cache.set(ch, null);
        } else cache.set(ch, ctx.color(legend[ch], `${path}.legend.${ch}`));
      }
      if (!refs || failed()) return;
      const ox = typeof op.x === 'number' ? op.x : 0;
      const oy = typeof op.y === 'number' ? op.y : 0;
      let clipped = false;
      for (const ref of refs) {
        const face = ctx.rect(ref);
        rows.forEach((row, ry) => {
          [...row].forEach((ch, rx) => {
            const lx = ox + rx, ly = oy + ry;
            if (lx >= face.w || ly >= face.h || lx < 0 || ly < 0) {
              if (ch !== '.') clipped = true;
              return;
            }
            if (ch === '.') return;
            ctx.set(face.x + lx, face.y + ly, ch === '_' ? TRANSPARENT : (cache.get(ch) as RGBA));
          });
        });
      }
      if (clipped) ctx.issue('warning', 'clipped', `${path}.rows`, 'some pixels fall outside the target face and were clipped', 'check face sizes in the spec reference (e.g. head faces are 8x8, arm fronts 4x12, slim arm fronts 3x12)');
      return;
    }
    case 'points': {
      const refs = ctx.targets(op.target, `${path}.target`);
      const c = ctx.color(op.color, `${path}.color`);
      if (!Array.isArray(op.points)) return ctx.issue('error', 'bad-points', `${path}.points`, '"points" must be an array of [x, y]');
      const pts = op.points.map((p, i) => point(ctx, p, `${path}.points[${i}]`));
      if (!refs || !c || failed()) return;
      for (const ref of refs) {
        const face = ctx.rect(ref);
        for (const p of pts as [number, number][]) plot(ctx, face, p[0], p[1], c);
      }
      return;
    }
    case 'line': {
      const refs = ctx.targets(op.target, `${path}.target`);
      const c = ctx.color(op.color, `${path}.color`);
      const a = point(ctx, op.from, `${path}.from`);
      const b = point(ctx, op.to, `${path}.to`);
      if (!refs || !c || !a || !b) return;
      for (const ref of refs) {
        const face = ctx.rect(ref);
        let [x0, y0] = a;
        const [x1, y1] = b;
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        for (;;) {
          plot(ctx, face, x0, y0, c);
          if (x0 === x1 && y0 === y1) break;
          const e2 = 2 * err;
          if (e2 >= dy) { err += dy; x0 += sx; }
          if (e2 <= dx) { err += dx; y0 += sy; }
        }
      }
      return;
    }
    case 'gradient': {
      const refs = ctx.targets(op.target, `${path}.target`);
      const from = ctx.color(op.from, `${path}.from`);
      const to = ctx.color(op.to, `${path}.to`);
      if (op.direction !== undefined && op.direction !== 'vertical' && op.direction !== 'horizontal')
        ctx.issue('error', 'bad-direction', `${path}.direction`, 'direction must be "vertical" or "horizontal"');
      const steps = op.steps === undefined ? null : num(ctx, op.steps, `${path}.steps`, { int: true, min: 2, max: 64 });
      if (!checkArea(ctx, op, path) || !refs || !from || !to || failed()) return;
      const horizontal = op.direction === 'horizontal';
      eachPixel(ctx, refs, op, (tx, ty, lx, ly, _ref, a) => {
        const len = horizontal ? a.w : a.h;
        const i = horizontal ? lx - a.x : ly - a.y;
        let t = len <= 1 ? 0 : i / (len - 1);
        if (steps) t = Math.min(steps - 1, Math.floor(t * steps)) / (steps - 1);
        ctx.set(tx, ty, mix(from, to, t));
      });
      return;
    }
    case 'pattern': {
      const refs = ctx.targets(op.target, `${path}.target`);
      const kinds = ['checker', 'stripes-h', 'stripes-v', 'diagonal'];
      if (!kinds.includes(op.kind as string)) ctx.issue('error', 'bad-kind', `${path}.kind`, `kind must be one of ${kinds.join(', ')}`, suggestHint(String(op.kind), kinds));
      if (!Array.isArray(op.colors) || op.colors.length < 2) return ctx.issue('error', 'bad-colors', `${path}.colors`, '"colors" must list at least 2 colors ("." keeps the existing pixel)');
      const colors = op.colors.map((c, i) => (c === '.' ? null : ctx.color(c, `${path}.colors[${i}]`)));
      const size = op.size === undefined ? 1 : num(ctx, op.size, `${path}.size`, { int: true, min: 1, max: 16 });
      if (!checkArea(ctx, op, path) || !refs || size === null || failed()) return;
      const n = colors.length;
      eachPixel(ctx, refs, op, (tx, ty, lx, ly, _ref, a) => {
        const px = Math.floor((lx - a.x) / size), py = Math.floor((ly - a.y) / size);
        const idx = op.kind === 'stripes-h' ? py % n : op.kind === 'stripes-v' ? px % n : op.kind === 'diagonal' ? Math.floor((lx - a.x + ly - a.y) / size) % n : (px + py) % 2;
        const c = colors[idx];
        if (c) ctx.set(tx, ty, c);
      });
      return;
    }
    case 'noise': {
      const refs = ctx.targets(op.target, `${path}.target`);
      if (op.colors === undefined && op.jitter === undefined)
        return ctx.issue('error', 'missing-key', path, '"noise" needs "colors" (scatter) and/or "jitter" (lightness variation)');
      const colors = op.colors === undefined ? null : Array.isArray(op.colors) && op.colors.length ? op.colors.map((c, i) => ctx.color(c, `${path}.colors[${i}]`)) : (ctx.issue('error', 'bad-colors', `${path}.colors`, '"colors" must be a non-empty array'), null);
      const density = op.density === undefined ? 0.2 : num(ctx, op.density, `${path}.density`, { min: 0, max: 1 });
      const jitter = op.jitter === undefined ? 0 : num(ctx, op.jitter, `${path}.jitter`, { min: 0, max: 50 });
      const seed = op.seed === undefined ? index + 1 : num(ctx, op.seed, `${path}.seed`, { int: true });
      if (!checkArea(ctx, op, path) || !refs || density === null || jitter === null || seed === null || failed()) return;
      const rnd = mulberry32(seed);
      eachPixel(ctx, refs, op, (tx, ty) => {
        if (colors && rnd() < density) ctx.set(tx, ty, colors[Math.floor(rnd() * colors.length)] as RGBA);
        if (jitter) {
          const cur = ctx.get(tx, ty);
          if (cur[3] > 0) ctx.set(tx, ty, shiftLightness(cur, Math.round((rnd() * 2 - 1) * jitter)));
        }
      });
      return;
    }
    case 'shade': {
      const refs = ctx.targets(op.target, `${path}.target`);
      const amount = num(ctx, op.amount, `${path}.amount`, { min: -100, max: 100 });
      if (!checkArea(ctx, op, path) || !refs || amount === null) return;
      eachPixel(ctx, refs, op, (tx, ty) => ctx.set(tx, ty, shiftLightness(ctx.get(tx, ty), amount)));
      return;
    }
    case 'copy': {
      const src = ctx.targets(op.from, `${path}.from`);
      const dst = ctx.targets(op.to, `${path}.to`);
      if (op.flip !== undefined && !['h', 'v', 'hv'].includes(op.flip as string)) ctx.issue('error', 'bad-flip', `${path}.flip`, 'flip must be "h", "v" or "hv"');
      if (src && src.length !== 1) ctx.issue('error', 'bad-selector', `${path}.from`, `"from" must select exactly one face, got ${src.length}`, 'e.g. "head.front" or "body.back@overlay"');
      if (!src || !dst || failed()) return;
      const flip = (op.flip as string) ?? '';
      for (const ref of dst) blit(ctx, src[0], ref, flip.includes('h'), flip.includes('v'));
      return;
    }
    case 'mirror': {
      const from = op.from as PartName, to = op.to as PartName;
      for (const [k, v] of [['from', from], ['to', to]] as const)
        if (!PARTS.includes(v)) ctx.issue('error', 'bad-part', `${path}.${k}`, `unknown part ${JSON.stringify(v)}`, suggestHint(String(v), PARTS));
      const layerOpt = op.layer ?? 'both';
      if (!['base', 'overlay', 'both'].includes(layerOpt as string)) ctx.issue('error', 'bad-layer', `${path}.layer`, 'layer must be "base", "overlay" or "both"');
      if (failed()) return;
      const layers: LayerName[] = layerOpt === 'both' ? ['base', 'overlay'] : [layerOpt as LayerName];
      const swap: Record<FaceName, FaceName> = { top: 'top', bottom: 'bottom', front: 'front', back: 'back', right: 'left', left: 'right' };
      for (const layer of layers) {
        const snapshot = new Uint8ClampedArray(ctx.data);
        for (const face of Object.keys(swap) as FaceName[])
          blit(ctx, { part: from, face: swap[face], layer }, { part: to, face, layer }, true, false, snapshot);
      }
      return;
    }
    case 'symmetrize': {
      const refs = ctx.targets(op.target, `${path}.target`);
      if (op.source !== undefined && op.source !== 'left' && op.source !== 'right') ctx.issue('error', 'bad-source', `${path}.source`, 'source must be "left" or "right" (texture-space half to keep)');
      if (!refs || failed()) return;
      const keepLeft = op.source !== 'right';
      for (const ref of refs) {
        const face = ctx.rect(ref);
        for (let y = 0; y < face.h; y++)
          for (let x = 0; x < Math.floor(face.w / 2); x++) {
            const l = face.x + x, r = face.x + face.w - 1 - x, ty = face.y + y;
            if (keepLeft) ctx.set(r, ty, ctx.get(l, ty));
            else ctx.set(l, ty, ctx.get(r, ty));
          }
      }
      return;
    }
  }
}

/** Copy one face onto another with optional flips; nearest-neighbour resampling when sizes differ. */
function blit(ctx: Ctx, src: FaceRef, dst: FaceRef, flipH: boolean, flipV: boolean, snapshot?: Uint8ClampedArray) {
  const s = ctx.rect(src), d = ctx.rect(dst);
  const from = snapshot ?? new Uint8ClampedArray(ctx.data);
  for (let y = 0; y < d.h; y++)
    for (let x = 0; x < d.w; x++) {
      let sx = Math.floor((x * s.w) / d.w), sy = Math.floor((y * s.h) / d.h);
      if (flipH) sx = s.w - 1 - sx;
      if (flipV) sy = s.h - 1 - sy;
      const i = ((s.y + sy) * SKIN_SIZE + s.x + sx) * 4;
      ctx.set(d.x + x, d.y + y, [from[i], from[i + 1], from[i + 2], from[i + 3]]);
    }
}

export function faceSize(part: PartName, face: FaceName, model: Model): [number, number] {
  const [w, h, d] = boxSize(part, model);
  if (face === 'front' || face === 'back') return [w, h];
  if (face === 'left' || face === 'right') return [d, h];
  return [w, d];
}
