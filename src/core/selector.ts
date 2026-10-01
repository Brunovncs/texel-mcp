import { suggestHint } from './color';
import { FACES, PARTS } from './layout';
import type { FaceName, FaceRef, LayerName, PartName } from './types';

export const PART_GROUPS: Record<string, readonly PartName[]> = {
  all: PARTS,
  '*': PARTS,
  arms: ['rightArm', 'leftArm'],
  legs: ['rightLeg', 'leftLeg'],
  limbs: ['rightArm', 'leftArm', 'rightLeg', 'leftLeg'],
  ...Object.fromEntries(PARTS.map((p) => [p, [p]])),
};

export const FACE_GROUPS: Record<string, readonly FaceName[]> = {
  all: FACES,
  '*': FACES,
  sides: ['right', 'front', 'left', 'back'],
  ...Object.fromEntries(FACES.map((f) => [f, [f]])),
};

const LAYER_GROUPS: Record<string, readonly LayerName[]> = {
  base: ['base'],
  overlay: ['overlay'],
  both: ['base', 'overlay'],
};

const SELECTOR = /^([^.@]+)(?:\.([^.@]+))?(?:@([^.@]+))?$/;

export type SelectorResult = { ok: true; refs: FaceRef[] } | { ok: false; error: string; hint?: string };

/** Parse "<parts>[.<faces>][@<layer>]". Parts and faces may be joined with "+". Arrays are unions. */
export function parseSelector(sel: unknown): SelectorResult {
  const list = Array.isArray(sel) ? sel : [sel];
  if (list.length === 0) return { ok: false, error: 'target is empty' };
  const refs: FaceRef[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== 'string') return { ok: false, error: 'target must be a string or an array of strings' };
    const m = SELECTOR.exec(item.replace(/\s+/g, ''));
    if (!m) return { ok: false, error: `malformed selector "${item}"`, hint: 'expected "<parts>[.<faces>][@<layer>]", e.g. "arms.front@overlay"' };
    const parts = expand(m[1], PART_GROUPS, 'part');
    if (!parts.ok) return parts;
    const faces = expand(m[2] ?? 'all', FACE_GROUPS, 'face');
    if (!faces.ok) return faces;
    const layers = expand(m[3] ?? 'base', LAYER_GROUPS, 'layer');
    if (!layers.ok) return layers;
    for (const layer of layers.values)
      for (const part of parts.values)
        for (const face of faces.values) {
          const key = `${part}.${face}@${layer}`;
          if (!seen.has(key)) {
            seen.add(key);
            refs.push({ part: part as PartName, face: face as FaceName, layer: layer as LayerName });
          }
        }
  }
  return { ok: true, refs };
}

function expand(
  text: string,
  groups: Record<string, readonly string[]>,
  kind: string,
): { ok: true; values: string[] } | { ok: false; error: string; hint?: string } {
  const values: string[] = [];
  for (const token of text.split('+')) {
    const g = groups[token];
    if (!g) return { ok: false, error: `unknown ${kind} "${token}"`, hint: suggestHint(token, Object.keys(groups)) ?? `valid: ${Object.keys(groups).join(', ')}` };
    for (const v of g) if (!values.includes(v)) values.push(v);
  }
  return { ok: true, values };
}
