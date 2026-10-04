import { ART_WEAK } from './art.js';
import { toHex } from './color.js';
import { compile, type CompileResult } from './compile.js';
import { texel } from './layout.js';
import { review } from './review.js';
import type { FaceName, Op, PartName, SkinSpec } from './types.js';

/**
 * Deterministic fixes for what the review can see, at no model cost: cover transparent base pixels,
 * uncover a face hidden under the hat layer, add light from above, texture faces that are one flat color. Each fix is a plain layer (ids start
 * with "polish-") and is kept only if it raises the art score without adding warnings.
 */
export function polish(spec: SkinSpec): { spec: SkinSpec; applied: string[] } {
  const score = (s: SkinSpec) => {
    const r = review(compile(s));
    return { art: r.art.score, problems: r.issues.filter((i) => i.level !== 'info').length, r };
  };
  let current = spec;
  let best = score(spec);
  const applied: string[] = [];
  const layers = () => (Array.isArray(current.layers) ? current.layers : []);
  const tryFix = (name: string, next: Op[], force = false) => {
    const candidate = { ...current, layers: next };
    const s = score(candidate);
    if (s.problems > best.problems || (!force && s.art <= best.art)) return;
    current = candidate;
    best = s;
    applied.push(name);
  };

  if (best.r.issues.some((i) => i.code === 'base-transparent')) {
    const color = [...colorCounts(current)].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#808080';
    tryFix('base', [{ op: 'fill', target: 'all', color, id: 'polish-base' }, ...layers()], true);
  }

  if (best.r.issues.some((i) => i.code === 'face-hidden'))
    tryFix('face', [...layers(), { op: 'clear', target: 'head.front@overlay', x: 1, y: 3, w: 6, h: 4, id: 'polish-face' }], true);

  const check = (id: string) => best.r.art.checks.find((c) => c.id === id)?.score ?? 1;

  if (check('shading') < ART_WEAK && !layers().some((l) => l.op === 'lighting')) tryFix('lighting', [...layers(), { op: 'lighting', id: 'polish-lighting' }]);

  if (check('texture') < ART_WEAK) {
    const faces = flatFaces(current);
    if (faces.length) tryFix('texture', [...layers(), { op: 'noise', target: faces, jitter: 3, id: 'polish-texture' }]);
  }

  return { spec: current, applied };
}

const SIDES: FaceName[] = ['front', 'back', 'right', 'left'];

function pixels({ texture, rig }: CompileResult, part: PartName, face: FaceName) {
  if (!rig.faces(part).includes(face)) return [];
  const r = rig.faceRect(part, face, 'base');
  const out: string[] = [];
  for (let ly = 0; ly < r.h; ly++)
    for (let lx = 0; lx < r.w; lx++) {
      const [x, y] = texel(r, lx, ly);
      const i = (y * texture.width + x) * 4;
      if (texture.data[i + 3] === 255) out.push(toHex([texture.data[i], texture.data[i + 1], texture.data[i + 2], 255]));
    }
  return out;
}

function colorCounts(spec: SkinSpec) {
  const counts = new Map<string, number>();
  const compiled = compile(spec);
  for (const part of compiled.rig.parts) for (const face of SIDES) for (const hex of pixels(compiled, part, face)) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  return counts;
}

/** Visible base faces that are at least 90% one color; the face itself is left alone. */
function flatFaces(spec: SkinSpec) {
  const out: string[] = [];
  const compiled = compile(spec);
  for (const part of compiled.rig.parts)
    for (const face of SIDES) {
      if (part === 'head' && face === 'front' && compiled.rig.def.character) continue;
      const px = pixels(compiled, part, face);
      const counts = new Map<string, number>();
      for (const hex of px) counts.set(hex, (counts.get(hex) ?? 0) + 1);
      if (px.length && Math.max(...counts.values()) / px.length >= 0.9) out.push(`${part}.${face}`);
    }
  return out;
}
