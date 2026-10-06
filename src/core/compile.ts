import { mix, resolveColor, shiftLightness, shiftTone, suggestHint, TRANSPARENT } from './color.js';
import { applyLighting, applyMaterial, BEARDS, drawFace, drawHair, EYE_STYLES, FRINGES, HAIR_STYLES, MATERIAL_ALIASES, MATERIALS, MOUTHS, REGIONS, type Material, type Surface } from './components.js';
import { boxSize, LAYOUT_IDS, LAYOUTS, resolveLayout, type Rig, rigFor, sizeProblem, texel } from './layout.js';
import { applyPatch } from './patch.js';
import { parseSelector } from './selector.js';
import type { FaceName, FaceRef, GuiScaling, Image, Issue, LayerName, Model, PartName, Rect, RGBA, SkinSpec } from './types.js';

export const OP_KEYS: Record<string, { required: string[]; optional: string[] }> = {
  fill: { required: ['target', 'color'], optional: ['x', 'y', 'w', 'h', 'region'] },
  rect: { required: ['target', 'color'], optional: ['x', 'y', 'w', 'h', 'region'] },
  clear: { required: ['target'], optional: ['x', 'y', 'w', 'h', 'region'] },
  pixels: { required: ['target', 'rows'], optional: ['x', 'y', 'legend'] },
  points: { required: ['target', 'points', 'color'], optional: [] },
  line: { required: ['target', 'from', 'to', 'color'], optional: [] },
  gradient: { required: ['target', 'from', 'to'], optional: ['direction', 'steps', 'x', 'y', 'w', 'h', 'region'] },
  pattern: { required: ['target', 'kind', 'colors'], optional: ['size', 'x', 'y', 'w', 'h', 'region'] },
  noise: { required: ['target'], optional: ['colors', 'density', 'jitter', 'seed', 'x', 'y', 'w', 'h', 'region'] },
  shade: { required: ['target', 'amount'], optional: ['x', 'y', 'w', 'h', 'region'] },
  copy: { required: ['from', 'to'], optional: ['flip'] },
  mirror: { required: ['from', 'to'], optional: ['layer'] },
  symmetrize: { required: ['target'], optional: ['source'] },
  material: { required: ['target', 'color', 'kind'], optional: ['seed', 'x', 'y', 'w', 'h', 'region'] },
  face: { required: ['skin', 'eyes'], optional: ['target', 'eyeStyle', 'mouth', 'beard', 'nose', 'white', 'brows', 'mouthColor', 'beardColor', 'blush'] },
  hair: { required: ['color'], optional: ['style', 'fringe', 'layer'] },
  lighting: { required: [], optional: ['target', 'strength'] },
  bevel: { required: ['target', 'color'], optional: ['style', 'light', 'dark', 'outline', 'depth', 'x', 'y', 'w', 'h', 'region'] },
};
const COMMON_KEYS = ['op', 'id', 'note', 'enabled', 'emissive'];
export const SPEC_KEYS = ['$schema', 'version', 'name', 'description', 'author', 'tags', 'layout', 'model', 'size', 'asset', 'palette', 'legend', 'layers', 'animation', 'gui'];
export const MAX_FRAMES = 128;
/** A resource location under textures/: "item/ruby" or "mymod:item/ruby". */
export const ASSET_PATTERN = /^(?:[a-z0-9_.-]+:)?[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*$/;
/** Points and line ends further out than this are mistakes, and would make a line op loop for ages. */
const MAX_COORD = 256;
const RESERVED_CHARS = new Set(['.', '_']);
const NO_LAYERS: ReadonlySet<number> = new Set();

export interface CompileResult {
  ok: boolean;
  spec: SkinSpec | null;
  model: Model;
  /** Resolved layout id (aliases like "husk" become "zombie"). */
  layout: string;
  rig: Rig;
  texture: Image;
  issues: Issue[];
  /** Palette keys that were referenced at least once. */
  usedPalette: string[];
  /** Indices of layers that drew pixels, none of which survive later layers. */
  deadLayers: number[];
  /** What glows (ops with "emissive"): the texture's colors there, transparent elsewhere. Null when nothing glows. */
  emissive: Image | null;
  /** Every frame of an animated texture, the first included, when the spec has "animation" and the layout animates. */
  frames?: Image[];
  /** GUI scaling of a gui sprite, checked against its size. */
  gui?: GuiScaling;
}

type Json = Record<string, unknown>;

class Ctx {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  readonly issues: Issue[] = [];
  readonly used = new Set<string>();
  /** Layers whose paint is still visible in each texel, for dead-layer detection. */
  contrib: ReadonlySet<number>[];
  readonly drew = new Set<number>();
  /** 1 where the pixel glows. */
  readonly glow: Uint8Array;
  /** The current op paints glowing pixels. */
  glowing = false;
  private own: ReadonlySet<number> = NO_LAYERS;
  private current = -1;
  palette: Record<string, string> = {};
  legend: Record<string, string> = {};
  constructor(public rig: Rig) {
    this.width = rig.width;
    this.height = rig.height;
    this.data = new Uint8ClampedArray(rig.width * rig.height * 4);
    this.contrib = Array.from({ length: rig.width * rig.height }, () => NO_LAYERS);
    this.glow = new Uint8Array(rig.width * rig.height);
  }

  get model() {
    return this.rig.model;
  }

  issue(level: Issue['level'], code: string, path: string, message: string, hint?: string) {
    this.issues.push(hint ? { level, code, path, message, hint } : { level, code, path, message });
  }

  get(x: number, y: number): RGBA {
    const i = (y * this.width + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  get layer() {
    return this.current;
  }

  set layer(i: number) {
    this.current = i;
    this.own = new Set([i]);
  }

  /**
   * Write a texel. By default the current layer replaces whatever was there; `keep` lists earlier
   * layers that still show through (shade/noise adjust a pixel, copies carry their source's layers).
   * A pixel glows when the op is emissive; an adjusted one keeps its glow, a copied one takes `glow`.
   */
  set(x: number, y: number, c: RGBA, keep?: ReadonlySet<number>, glow?: boolean) {
    const t = y * this.width + x;
    this.contrib[t] = keep ? new Set([...keep, this.current]) : this.own;
    this.glow[t] = this.glowing || (glow ?? (keep ? this.glow[t] === 1 : false)) ? 1 : 0;
    this.drew.add(this.current);
    const i = t * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3];
  }

  rect(ref: FaceRef): Rect {
    return this.rig.faceRect(ref.part, ref.face, ref.layer);
  }

  color(expr: unknown, path: string): RGBA | null {
    const r = resolveColor(expr, this.palette, this.used);
    if (r.ok) {
      if (r.guessed) this.issue('info', 'color-guess', path, r.guessed, 'write tone steps as "name~-1" and shifts as "name:-10"');
      return r.color;
    }
    this.issue('error', 'bad-color', path, r.error, r.hint);
    return null;
  }

  targets(sel: unknown, path: string): FaceRef[] | null {
    const r = parseSelector(sel, this.rig);
    if (r.ok) return r.refs;
    this.issue('error', 'bad-selector', path, r.error, r.hint);
    return null;
  }
}

/** Compile a skin spec (object or JSON text) into an RGBA texture in its layout (64×64 for a player skin). Never throws. */
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
  const layout = isObj(raw) ? resolveLayout(raw.layout) : resolveLayout(undefined);
  const sizeIssue = isObj(raw) && raw.size !== undefined ? (Array.isArray(raw.size) ? sizeProblem(layout ?? LAYOUTS.player, raw.size) : '"size" is [width, height]') : null;
  const size = isObj(raw) && Array.isArray(raw.size) && !sizeIssue ? (raw.size as [number, number]) : undefined;
  const ctx = new Ctx(rigFor(layout ?? 'player', model, size));
  ctx.issues.push(...early);
  if (sizeIssue) ctx.issue('error', 'bad-size', '$.size', `${sizeIssue}; got ${JSON.stringify((raw as Json).size)}`, layout?.resizable ? undefined : 'drop "size"');
  if (isObj(raw) && !layout)
    ctx.issue('error', 'bad-layout', '$.layout', `unknown layout ${JSON.stringify(raw.layout)}; compiling as "player"`, suggestHint(String(raw.layout), LAYOUT_IDS) ?? `valid: ${LAYOUT_IDS.join(', ')}`);

  if (!isObj(raw)) {
    if (!early.length) ctx.issue('error', 'bad-spec', '$', 'spec must be a JSON object');
    return finish(ctx, null);
  }
  const spec = raw as Json;
  checkKeys(ctx, spec, SPEC_KEYS, '$');
  if (spec.version !== 1) ctx.issue('warning', 'version', '$.version', 'missing or unknown "version"; assuming 1', 'add "version": 1');
  if (spec.model !== undefined && spec.model !== 'classic' && spec.model !== 'slim')
    ctx.issue('error', 'bad-model', '$.model', `model must be "classic" or "slim", got ${JSON.stringify(spec.model)}`);
  else if (spec.model === 'slim' && ctx.rig.layout !== 'player')
    ctx.issue('warning', 'model-ignored', '$.model', `"model" picks the arm width of a player skin; the ${ctx.rig.layout} layout ignores it`, 'drop "model"');

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
        else if (r.guessed) ctx.issue('info', 'color-guess', `$.palette.${k}`, r.guessed, 'write tone steps as "name~-1" and shifts as "name:-10"');
      }
    }
  }

  if (spec.legend !== undefined) {
    if (!isObj(spec.legend)) ctx.issue('error', 'bad-legend', '$.legend', 'legend must be an object of single character → color');
    else ctx.legend = readLegend(ctx, spec.legend, '$.legend');
  }
  if (spec.asset !== undefined && (typeof spec.asset !== 'string' || !ASSET_PATTERN.test(spec.asset)))
    ctx.issue('error', 'bad-asset', '$.asset', `"asset" is a texture's place in a resource pack, like "item/ruby" or "mymod:item/ruby"; got ${JSON.stringify(spec.asset)}`, 'lowercase letters, digits, "_", "-", "." and "/", no ".png", an optional "namespace:" in front');
  const gui = spec.gui === undefined ? undefined : readGui(ctx, spec.gui);

  if (!Array.isArray(spec.layers)) {
    ctx.issue('error', 'no-layers', '$.layers', '"layers" must be an array of operations');
  } else {
    spec.layers.forEach((op, i) => {
      ctx.layer = i;
      applyOp(ctx, op, i);
    });
  }
  const result = finish(ctx, spec as unknown as SkinSpec);
  if (gui) result.gui = gui;
  if (spec.animation !== undefined) animate(result, spec);
  return result;
}

function readGui(ctx: Ctx, raw: unknown): GuiScaling | undefined {
  const path = '$.gui';
  if (ctx.rig.layout !== 'gui') return void ctx.issue('warning', 'gui-ignored', path, `"gui" sets how a GUI sprite resizes; the ${ctx.rig.layout} layout ignores it`, 'use "layout": "gui", or drop "gui"');
  const bad = (message: string, hint?: string) => void ctx.issue('error', 'bad-gui', path, message, hint);
  if (!isObj(raw) || !isObj(raw.scaling)) return bad('"gui" is { "scaling": { "type": "stretch" | "tile" | "nine_slice", … } }');
  const sc = raw.scaling;
  const type = sc.type;
  if (type !== 'stretch' && type !== 'tile' && type !== 'nine_slice') return bad(`unknown scaling type ${JSON.stringify(type)}`, suggestHint(String(type), ['stretch', 'tile', 'nine_slice']) ?? 'use stretch, tile or nine_slice');
  if (type === 'stretch') return { type };
  const [tw, th] = [ctx.width, ctx.height];
  const w = sc.width === undefined ? tw : num(ctx, sc.width, `${path}.scaling.width`, { int: true, min: 1, max: 4096 });
  const h = sc.height === undefined ? th : num(ctx, sc.height, `${path}.scaling.height`, { int: true, min: 1, max: 4096 });
  if (w === null || h === null) return;
  if (w * th !== h * tw) ctx.issue('warning', 'gui-aspect', `${path}.scaling`, `scaling is ${w}×${h} but the texture is ${tw}×${th}: the game squashes it`, 'give "width" and "height" the texture\'s proportions, or drop them to use its size');
  if (type === 'tile') return { type, width: w, height: h };
  const b = sc.border;
  const sides = typeof b === 'number' ? { left: b, top: b, right: b, bottom: b } : isObj(b) ? { left: b.left, top: b.top, right: b.right, bottom: b.bottom } : null;
  if (!sides || !Object.values(sides).every((v) => Number.isInteger(v) && (v as number) >= 0))
    return bad('nine_slice needs "border": a number of pixels, or { "left", "top", "right", "bottom" }');
  const { left, top, right, bottom } = sides as Record<string, number>;
  if (left + right >= w || top + bottom >= h) return bad(`borders ${left}+${right} × ${top}+${bottom} leave no middle in a ${w}×${h} sprite`, 'make the borders smaller than half the sprite');
  if (sc.stretch_inner !== undefined && typeof sc.stretch_inner !== 'boolean') return bad('"stretch_inner" is true or false');
  return { type, width: w, height: h, border: typeof b === 'number' ? b : { left, top, right, bottom }, ...(sc.stretch_inner !== undefined ? { stretch_inner: sc.stretch_inner as boolean } : {}) };
}

/** Compile each frame of "animation" (a patch over the spec's layers) into `result.frames`. */
function animate(result: CompileResult, spec: Json) {
  const issue = (level: Issue['level'], code: string, path: string, message: string, hint?: string) => result.issues.push(hint ? { level, code, path, message, hint } : { level, code, path, message });
  const a = spec.animation;
  const path = '$.animation';
  if (!result.rig.def.animated) return issue('warning', 'animation-ignored', path, `the ${result.layout} layout can't animate: the game draws its texture still`, 'animate item, block, plant, gui and particle textures');
  if (!isObj(a) || !Array.isArray(a.frames) || !a.frames.length) {
    issue('error', 'bad-animation', path, '"animation" is { "frametime"?, "interpolate"?, "frames": [{ "patch": [...] }, …] }');
    result.ok = false;
    return;
  }
  const before = result.issues.length;
  if (a.frametime !== undefined && !(Number.isInteger(a.frametime) && (a.frametime as number) >= 1)) issue('error', 'bad-animation', `${path}.frametime`, '"frametime" is a whole number of ticks, 1 or more (20 ticks = 1 second)');
  if (a.interpolate !== undefined && typeof a.interpolate !== 'boolean') issue('error', 'bad-animation', `${path}.interpolate`, '"interpolate" is true or false');
  if (a.frames.length > MAX_FRAMES) issue('error', 'bad-animation', `${path}.frames`, `${a.frames.length} frames; the limit is ${MAX_FRAMES}`);
  for (const k of Object.keys(a)) if (!['frametime', 'interpolate', 'frames'].includes(k)) issue('warning', 'unknown-key', `${path}.${k}`, `unknown key "${k}" is ignored`, suggestHint(k, ['frametime', 'interpolate', 'frames']));
  if (result.issues.slice(before).some((i) => i.level === 'error')) {
    result.ok = false;
    return;
  }
  const { animation: _, ...still } = spec;
  const seen = new Set(result.issues.map((i) => `${i.code}|${i.path}|${i.message}`));
  const frames: Image[] = [];
  a.frames.forEach((f, i) => {
    const at = `${path}.frames[${i}]`;
    if (!isObj(f)) return issue('error', 'bad-frame', at, 'each frame is an object: { "patch": [...], "time"?: ticks }');
    for (const k of Object.keys(f)) if (k !== 'patch' && k !== 'time') issue('warning', 'unknown-key', `${at}.${k}`, `unknown key "${k}" is ignored`, suggestHint(k, ['patch', 'time']));
    if (f.time !== undefined && !(Number.isInteger(f.time) && (f.time as number) >= 1)) issue('error', 'bad-frame', `${at}.time`, '"time" is a whole number of ticks, 1 or more');
    let frameSpec = still as unknown as SkinSpec;
    if (f.patch !== undefined) {
      if (!Array.isArray(f.patch)) return issue('error', 'bad-frame', `${at}.patch`, '"patch" is a list of patch entries ({ "do": "update", "id": …, "set": … })');
      const p = applyPatch(frameSpec, { patch: f.patch });
      for (const pi of p.issues) issue('error', 'bad-frame', `${at}.patch${pi.path.replace(/^\$\.patch/, '')}`, pi.message, pi.hint);
      frameSpec = p.spec;
    }
    const c = compile(frameSpec);
    for (const ci of c.issues) {
      const key = `${ci.code}|${ci.path}|${ci.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issue(ci.level, ci.code, `${at} ${ci.path}`, `frame ${i}: ${ci.message}`, ci.hint);
    }
    frames.push(c.texture);
  });
  result.ok = !result.issues.some((i) => i.level === 'error');
  if (frames.length === a.frames.length) result.frames = frames;
}

/** The usual `fill` on `all` is a safety net against transparent base pixels, so it never counts as dead. */
const isSafetyFill = (op: unknown) => isObj(op) && op.op === 'fill' && op.target === 'all';

function finish(ctx: Ctx, spec: SkinSpec | null): CompileResult {
  const survivors = new Set<number>();
  for (const c of ctx.contrib) for (const i of c) survivors.add(i);
  const layers = Array.isArray(spec?.layers) ? spec.layers : [];
  const deadLayers = [...ctx.drew].filter((i) => !survivors.has(i) && !isSafetyFill(layers[i])).sort((a, b) => a - b);
  let emissive: Image | null = null;
  if (ctx.glow.some((g, t) => g && ctx.data[t * 4 + 3] > 0)) {
    const data = new Uint8ClampedArray(ctx.data.length);
    ctx.glow.forEach((g, t) => {
      if (g) data.set(ctx.data.subarray(t * 4, t * 4 + 4), t * 4);
    });
    emissive = { width: ctx.width, height: ctx.height, data };
  }
  return {
    ok: !ctx.issues.some((i) => i.level === 'error'),
    spec,
    model: ctx.model,
    layout: ctx.rig.layout,
    rig: ctx.rig,
    texture: { width: ctx.width, height: ctx.height, data: ctx.data },
    issues: ctx.issues,
    usedPalette: [...ctx.used],
    deadLayers,
    emissive,
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
    // Defining "." or "_" changes nothing they mean, so drop the entry instead of the whole layer.
    else if (RESERVED_CHARS.has(ch)) ctx.issue('info', 'legend-reserved', `${path}.${ch}`, `"${ch}" is reserved ("." keeps the pixel, "_" erases it); this legend entry is ignored`);
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
  if (v.some((n) => Math.abs(n) > MAX_COORD)) {
    ctx.issue('error', 'out-of-range', path, `${JSON.stringify(v)} is far outside any face (limit ±${MAX_COORD})`, 'coordinates are local to the face: 0 to its width/height minus 1, or negative to count from the far edge');
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
  if (op.region !== undefined) {
    if (typeof op.region !== 'string' || !Object.hasOwn(REGIONS, op.region)) {
      ctx.issue('error', 'bad-region', `${path}.region`, `unknown region ${JSON.stringify(op.region)}`, suggestHint(String(op.region), Object.keys(REGIONS)) ?? `valid: ${Object.keys(REGIONS).join(', ')}`);
      ok = false;
    } else if (op.y !== undefined || op.h !== undefined) {
      ctx.issue('error', 'bad-region', `${path}.region`, '"region" sets the rows itself; drop "y" and "h"');
      ok = false;
    }
  }
  for (const k of ['x', 'y', 'w', 'h']) if (op[k] !== undefined && num(ctx, op[k], `${path}.${k}`, { int: true, ...(k === 'w' || k === 'h' ? { min: 0 } : {}) }) === null) ok = false;
  return ok;
}

/** The op's area on one face, or null when its `region` doesn't cover that face. */
function areaOn(op: Json, ref: FaceRef, face: Rect): Rect | null {
  if (op.region === undefined) return area(op, face);
  const r = REGIONS[op.region as string];
  if (!r.parts.includes(ref.part)) return null;
  if (ref.face === 'top') return r.top ? area({ x: op.x, w: op.w }, face) : null;
  if (ref.face === 'bottom') return r.bottom ? area({ x: op.x, w: op.w }, face) : null;
  return area({ ...op, y: r.y, h: r.h }, face);
}

function regionMiss(ctx: Ctx, op: Json, path: string, hit: number) {
  if (op.region !== undefined && !hit)
    ctx.issue('warning', 'region-miss', `${path}.region`, `region "${op.region}" covers none of the target faces`, `it applies to: ${REGIONS[op.region as string].parts.join(', ')}`);
}

function eachPixel(ctx: Ctx, refs: FaceRef[], op: Json, fn: (tx: number, ty: number, lx: number, ly: number, ref: FaceRef, a: Rect) => void) {
  let hit = 0;
  for (const ref of refs) {
    const face = ctx.rect(ref);
    const a = areaOn(op, ref, face);
    if (!a) continue;
    hit++;
    for (let ly = a.y; ly < a.y + a.h; ly++) for (let lx = a.x; lx < a.x + a.w; lx++) fn(...texel(face, lx, ly), lx, ly, ref, a);
  }
  regionMiss(ctx, op, `$.layers[${ctx.layer}]`, hit);
}

function surface(ctx: Ctx, ref: FaceRef): Surface {
  const r = ctx.rect(ref);
  return {
    ref,
    w: r.w,
    h: r.h,
    get: (x, y) => ctx.get(...texel(r, x, y)),
    set: (x, y, c, adjust) => {
      const [tx, ty] = texel(r, x, y);
      ctx.set(tx, ty, c, adjust ? ctx.contrib[ty * ctx.width + tx] : undefined);
    },
  };
}

function oneOf<T extends string>(ctx: Ctx, v: unknown, options: readonly T[], fallback: T, path: string): T | null {
  if (v === undefined) return fallback;
  if (typeof v === 'string' && (options as readonly string[]).includes(v)) return v as T;
  ctx.issue('error', 'bad-option', path, `expected one of ${options.join(', ')}, got ${JSON.stringify(v)}`, suggestHint(String(v), options));
  return null;
}

function plot(ctx: Ctx, face: Rect, lx: number, ly: number, c: RGBA) {
  if (lx < 0) lx += face.w;
  if (ly < 0) ly += face.h;
  if (lx >= 0 && ly >= 0 && lx < face.w && ly < face.h) ctx.set(...texel(face, lx, ly), c);
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
  if (typeof kind !== 'string' || !Object.hasOwn(OP_KEYS, kind))
    return ctx.issue('error', 'unknown-op', `${path}.op`, `unknown op ${JSON.stringify(kind)}`, suggestHint(String(kind), Object.keys(OP_KEYS)) ?? `valid ops: ${Object.keys(OP_KEYS).join(', ')}`);
  if (op.enabled === false) return;
  const def = OP_KEYS[kind];
  checkKeys(ctx, op, [...COMMON_KEYS, ...def.required, ...def.optional], path);
  const missing = def.required.filter((k) => op[k] === undefined);
  if (missing.length) return ctx.issue('error', 'missing-key', path, `"${kind}" requires: ${missing.join(', ')}`);

  const before = ctx.issues.length;
  const failed = () => ctx.issues.slice(before).some((i) => i.level === 'error');
  if (op.emissive !== undefined && typeof op.emissive !== 'boolean') ctx.issue('error', 'bad-option', `${path}.emissive`, '"emissive" is true or false');
  ctx.glowing = op.emissive === true && kind !== 'face';

  switch (kind) {
    case 'fill':
    case 'rect':
    case 'clear': {
      const refs = ctx.targets(op.target, `${path}.target`);
      const c = kind === 'clear' ? TRANSPARENT : ctx.color(op.color, `${path}.color`);
      if (!checkArea(ctx, op, path) || !refs || !c) return;
      eachPixel(ctx, refs, op, (tx, ty) => ctx.set(tx, ty, c));
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
            ctx.set(...texel(face, lx, ly), ch === '_' ? TRANSPARENT : (cache.get(ch) as RGBA));
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
          if (cur[3] > 0) ctx.set(tx, ty, shiftLightness(cur, Math.round((rnd() * 2 - 1) * jitter)), ctx.contrib[ty * ctx.width + tx]);
        }
      });
      return;
    }
    case 'shade': {
      const refs = ctx.targets(op.target, `${path}.target`);
      const amount = num(ctx, op.amount, `${path}.amount`, { min: -100, max: 100 });
      if (!checkArea(ctx, op, path) || !refs || amount === null) return;
      eachPixel(ctx, refs, op, (tx, ty) => ctx.set(tx, ty, shiftTone(ctx.get(tx, ty), amount), ctx.contrib[ty * ctx.width + tx]));
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
      const parts = ctx.rig.parts;
      for (const [k, v] of [['from', from], ['to', to]] as const)
        if (!parts.includes(v)) ctx.issue('error', 'bad-part', `${path}.${k}`, `unknown part ${JSON.stringify(v)}${ctx.rig.layout === 'player' ? '' : ` in the ${ctx.rig.layout} layout`}`, suggestHint(String(v), parts) ?? `valid: ${parts.join(', ')}`);
      if (!failed() && String(ctx.rig.part(from)?.box) !== String(ctx.rig.part(to)?.box))
        ctx.issue('error', 'bad-part', path, `"${from}" and "${to}" are different sizes; mirror copies between matching parts`, 'use "copy" with "flip" for anything else');
      const layerOpt = op.layer ?? 'both';
      if (!['base', 'overlay', 'both'].includes(layerOpt as string)) ctx.issue('error', 'bad-layer', `${path}.layer`, 'layer must be "base", "overlay" or "both"');
      if (failed()) return;
      const layers = (layerOpt === 'both' ? (['base', 'overlay'] as LayerName[]) : [layerOpt as LayerName]).filter((l) => ctx.rig.hasLayer(from, l) && ctx.rig.hasLayer(to, l));
      const swap: Record<FaceName, FaceName> = { top: 'top', bottom: 'bottom', front: 'front', back: 'back', right: 'left', left: 'right' };
      for (const layer of layers) {
        const snapshot = { data: new Uint8ClampedArray(ctx.data), contrib: ctx.contrib.slice(), glow: ctx.glow.slice() };
        for (const face of Object.keys(swap) as FaceName[])
          blit(ctx, { part: from, face: swap[face], layer }, { part: to, face, layer }, true, false, snapshot);
      }
      return;
    }
    case 'material': {
      const refs = ctx.targets(op.target, `${path}.target`);
      const c = ctx.color(op.color, `${path}.color`);
      // A near word for the kind ("feathers", "steel") is read as the closest one rather than dropping the layer.
      const alias = typeof op.kind === 'string' && Object.hasOwn(MATERIAL_ALIASES, op.kind.toLowerCase()) ? MATERIAL_ALIASES[op.kind.toLowerCase()] : undefined;
      if (alias) ctx.issue('info', 'kind-guess', `${path}.kind`, `read kind "${op.kind}" as "${alias}"`, `valid kinds: ${MATERIALS.join(', ')}`);
      const kind: Material | null = alias ?? oneOf(ctx, op.kind, MATERIALS, 'plain', `${path}.kind`);
      const seed = op.seed === undefined ? index + 1 : num(ctx, op.seed, `${path}.seed`, { int: true });
      if (!checkArea(ctx, op, path) || !refs || !c || !kind || seed === null) return;
      const rnd = mulberry32(seed);
      let hit = 0;
      for (const ref of refs) {
        const a = areaOn(op, ref, ctx.rect(ref));
        if (!a) continue;
        hit++;
        applyMaterial(surface(ctx, ref), a, c, kind, rnd);
      }
      regionMiss(ctx, op, path, hit);
      return;
    }
    case 'face': {
      if (op.target === undefined && String(ctx.rig.part('head')?.box) !== '8,8,8') return unsupported(ctx, path, kind);
      const refs = ctx.targets(op.target ?? 'head.front', `${path}.target`);
      const skin = ctx.color(op.skin, `${path}.skin`);
      const eyes = ctx.color(op.eyes, `${path}.eyes`);
      const white = op.white === undefined ? ([236, 238, 240, 255] as RGBA) : ctx.color(op.white, `${path}.white`);
      const brows = op.brows === undefined || op.brows === 'none' ? null : ctx.color(op.brows, `${path}.brows`);
      const mouth = op.mouthColor === undefined ? null : ctx.color(op.mouthColor, `${path}.mouthColor`);
      const beard = op.beardColor === undefined ? null : ctx.color(op.beardColor, `${path}.beardColor`);
      const blush = op.blush === undefined || op.blush === false ? null : op.blush === true ? mix(skin ?? TRANSPARENT, [232, 96, 110, 255], 0.35) : ctx.color(op.blush, `${path}.blush`);
      const eyeStyle = oneOf(ctx, op.eyeStyle, EYE_STYLES, 'normal', `${path}.eyeStyle`);
      const mouthStyle = oneOf(ctx, op.mouth, MOUTHS, 'neutral', `${path}.mouth`);
      const beardStyle = oneOf(ctx, op.beard, BEARDS, 'none', `${path}.beard`);
      if (op.nose !== undefined && typeof op.nose !== 'boolean') ctx.issue('info', 'bad-option', `${path}.nose`, '"nose" is true or false; anything else draws the nose');
      if (!refs || !skin || !eyes || !white || failed() || !eyeStyle || !mouthStyle || !beardStyle) return;
      const colors = {
        skin,
        eyes,
        white,
        brows: op.brows === 'none' ? null : (brows ?? mix(skin, [58, 36, 28, 255], 0.7)),
        mouth: mouth ?? mix(skin, [120, 52, 48, 255], 0.5),
        beard: beard ?? brows ?? mix(skin, [58, 36, 28, 255], 0.7),
        blush,
      };
      for (const ref of refs) {
        const eyes = drawFace(surface(ctx, ref), colors, { eyeStyle, mouth: mouthStyle, beard: beardStyle, nose: op.nose !== false });
        const r = ctx.rect(ref);
        if (op.emissive === true)
          for (const [x, y] of eyes) {
            const [tx, ty] = texel(r, x, y);
            ctx.glow[ty * ctx.width + tx] = 1;
          }
      }
      return;
    }
    case 'hair': {
      const c = ctx.color(op.color, `${path}.color`);
      const style = oneOf(ctx, op.style, HAIR_STYLES, 'short', `${path}.style`);
      const fringe = oneOf(ctx, op.fringe, FRINGES, style === 'spiky' || style === 'curly' ? 'full' : 'side', `${path}.fringe`);
      const layer = oneOf(ctx, op.layer, ['base', 'overlay', 'both'] as const, 'both', `${path}.layer`);
      if (!c || !style || !fringe || !layer) return;
      if (String(ctx.rig.part('head')?.box) !== '8,8,8') return unsupported(ctx, path, kind);
      const layers = (layer === 'both' ? (['base', 'overlay'] as LayerName[]) : [layer]).filter((l) => ctx.rig.hasLayer('head', l));
      for (const l of layers)
        for (const face of ['top', 'back', 'right', 'left', 'front'] as FaceName[]) drawHair(surface(ctx, { part: 'head', face, layer: l }), c, style, fringe, l === 'overlay');
      return;
    }
    case 'lighting': {
      const explicit = op.target !== undefined;
      const refs = explicit ? ctx.targets(op.target, `${path}.target`) : ctx.rig.refs();
      const strength = op.strength === undefined ? 1 : num(ctx, op.strength, `${path}.strength`, { min: 0, max: 3 });
      if (!refs || strength === null) return;
      // The face keeps its exact colors unless it is targeted on purpose.
      for (const ref of refs) if (explicit || ref.part !== 'head' || ref.face !== 'front') applyLighting(surface(ctx, ref), strength);
      return;
    }
    case 'bevel': {
      const refs = ctx.targets(op.target, `${path}.target`);
      const c = ctx.color(op.color, `${path}.color`);
      const style = oneOf(ctx, op.style, ['raised', 'inset'] as const, 'raised', `${path}.style`);
      const light = op.light === undefined ? c && shiftLightness(c, 22) : ctx.color(op.light, `${path}.light`);
      const dark = op.dark === undefined ? c && shiftLightness(c, -28) : ctx.color(op.dark, `${path}.dark`);
      const outline = op.outline === undefined ? null : ctx.color(op.outline, `${path}.outline`);
      const depth = op.depth === undefined ? 1 : num(ctx, op.depth, `${path}.depth`, { int: true, min: 1, max: 8 });
      if (!checkArea(ctx, op, path) || !refs || !c || !light || !dark || !style || depth === null || failed()) return;
      const [hi, lo] = style === 'raised' ? [light, dark] : [dark, light];
      let hit = 0;
      for (const ref of refs) {
        const face = ctx.rect(ref);
        const a = areaOn(op, ref, face);
        if (!a) continue;
        hit++;
        let { x, y, w, h } = a;
        const put = (lx: number, ly: number, col: RGBA) => ctx.set(...texel(face, lx, ly), col);
        if (outline && w > 2 && h > 2) {
          for (let i = 1; i < w - 1; i++) put(x + i, y, outline), put(x + i, y + h - 1, outline);
          for (let j = 1; j < h - 1; j++) put(x, y + j, outline), put(x + w - 1, y + j, outline);
          x++, y++, w -= 2, h -= 2;
        }
        // Each ring: light along the top and left, dark along the bottom and right, the base color in the two corners where they meet.
        for (let d = 0; d < depth && w > 0 && h > 0; d++, x++, y++, w -= 2, h -= 2) {
          for (let i = 0; i < w; i++) put(x + i, y, hi), put(x + i, y + h - 1, lo);
          for (let j = 0; j < h; j++) put(x, y + j, hi), put(x + w - 1, y + j, lo);
          if (w > 1 && h > 1) put(x + w - 1, y, c), put(x, y + h - 1, c);
        }
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c);
      }
      regionMiss(ctx, op, path, hit);
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
            const l = texel(face, x, y), r = texel(face, face.w - 1 - x, y);
            const [src, dst] = keepLeft ? [l, r] : [r, l];
            ctx.set(dst[0], dst[1], ctx.get(src[0], src[1]), ctx.contrib[src[1] * ctx.width + src[0]], ctx.glow[src[1] * ctx.width + src[0]] === 1);
          }
      }
      return;
    }
  }
}

/** Copy one face onto another with optional flips; nearest-neighbour resampling when sizes differ. */
function unsupported(ctx: Ctx, path: string, kind: string) {
  ctx.issue('error', 'op-unsupported', `${path}.op`, `"${kind}" draws on a character's 8×8×8 head, which the ${ctx.rig.layout} layout doesn't have`, 'paint it with "pixels" or "fill" instead');
}

function blit(ctx: Ctx, src: FaceRef, dst: FaceRef, flipH: boolean, flipV: boolean, snapshot?: { data: Uint8ClampedArray; contrib: ReadonlySet<number>[]; glow: Uint8Array }) {
  const s = ctx.rect(src), d = ctx.rect(dst);
  const from = snapshot?.data ?? new Uint8ClampedArray(ctx.data);
  const fromContrib = snapshot?.contrib ?? ctx.contrib.slice();
  const fromGlow = snapshot?.glow ?? ctx.glow.slice();
  for (let y = 0; y < d.h; y++)
    for (let x = 0; x < d.w; x++) {
      let sx = Math.floor((x * s.w) / d.w), sy = Math.floor((y * s.h) / d.h);
      if (flipH) sx = s.w - 1 - sx;
      if (flipV) sy = s.h - 1 - sy;
      const [fx, fy] = texel(s, sx, sy);
      const t = fy * ctx.width + fx, i = t * 4;
      ctx.set(...texel(d, x, y), [from[i], from[i + 1], from[i + 2], from[i + 3]], fromContrib[t], fromGlow[t] === 1);
    }
}

export function faceSize(part: PartName, face: FaceName, model: Model): [number, number] {
  const [w, h, d] = boxSize(part, model);
  if (face === 'front' || face === 'back') return [w, h];
  if (face === 'left' || face === 'right') return [d, h];
  return [w, d];
}
