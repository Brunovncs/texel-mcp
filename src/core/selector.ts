import { suggestHint } from './color';
import { FACES, type Rig, rigFor } from './layout';
import type { FaceName, FaceRef, LayerName, PartName } from './types';

const groupCache = new WeakMap<Rig, Record<string, readonly PartName[]>>();

/** Selector part names for a layout: `all`/`*`, its groups (arms, legs…) and each part. */
export function partGroups(rig: Rig): Record<string, readonly PartName[]> {
  let g = groupCache.get(rig);
  if (!g) {
    g = { all: rig.parts, '*': rig.parts, ...rig.def.groups, ...Object.fromEntries(rig.parts.map((p) => [p, [p]])) };
    groupCache.set(rig, g);
  }
  return g;
}

export type PartsResult = { ok: true; parts: PartName[] } | { ok: false; error: string; hint?: string };

/** Parts named by part or group names ("head", "arms", "head+legs"), in layout order. Same names and hints as selectors. */
export function resolveParts(rig: Rig, names: readonly string[]): PartsResult {
  const text = names.flatMap((n) => n.split('+')).map((n) => n.trim()).filter(Boolean).join('+');
  if (!text) return { ok: false, error: 'name at least one part, e.g. "head" or "arms"' };
  const r = expand(text, partGroups(rig), 'part', rig);
  if (!r.ok) return r;
  return { ok: true, parts: rig.parts.filter((p) => r.values.includes(p)) };
}

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

/**
 * Parse "<parts>[.<faces>][@<layer>]" against a layout. Parts and faces may be joined with "+".
 * Arrays are unions. Faces or layers a part doesn't have (a flat item's sides, a creeper's hat) are
 * left out; a selector that ends up with no face at all is an error.
 */
export function parseSelector(sel: unknown, rig: Rig = rigFor('player')): SelectorResult {
  const list = Array.isArray(sel) ? sel : [sel];
  if (list.length === 0) return { ok: false, error: 'target is empty' };
  const refs: FaceRef[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== 'string') return { ok: false, error: 'target must be a string or an array of strings' };
    const m = SELECTOR.exec(item.replace(/\s+/g, ''));
    // Models often join whole selectors with "+" ("body.sides+arms.sides"); read that as a union.
    if (!m && item.includes('+')) {
      const split = splitJoined(item.replace(/\s+/g, ''));
      if (split) {
        const r = parseSelector(split, rig);
        if (!r.ok) return r;
        for (const ref of r.refs) {
          const key = `${ref.part}.${ref.face}@${ref.layer}`;
          if (!seen.has(key)) seen.add(key), refs.push(ref);
        }
        continue;
      }
    }
    if (!m) return { ok: false, error: `malformed selector "${item}"`, hint: 'expected "<parts>[.<faces>][@<layer>]", e.g. "arms.front@overlay"' };
    const parts = expand(m[1], partGroups(rig), 'part', rig);
    if (!parts.ok) return parts;
    const faces = expand(m[2] ?? 'all', FACE_GROUPS, 'face', rig);
    if (!faces.ok) return faces;
    const layers = expand(m[3] ?? 'base', LAYER_GROUPS, 'layer', rig);
    if (!layers.ok) return layers;
    let added = 0;
    for (const layer of layers.values)
      for (const part of parts.values) {
        if (!rig.hasLayer(part, layer as LayerName)) continue;
        const own = rig.faces(part);
        for (const face of faces.values) {
          if (!own.includes(face as FaceName)) continue;
          added++;
          const key = `${part}.${face}@${layer}`;
          if (!seen.has(key)) {
            seen.add(key);
            refs.push({ part, face: face as FaceName, layer: layer as LayerName });
          }
        }
      }
    if (!added) {
      const flat = parts.values.every((p) => rig.faces(p).length === 1);
      return {
        ok: false,
        error: `"${item}" selects no face in the ${rig.layout} layout`,
        hint: flat ? `${parts.values.join(', ')} is flat: only ".front" exists` : `parts with an overlay here: ${rig.parts.filter((p) => rig.hasLayer(p, 'overlay')).join(', ') || 'none'}`,
      };
    }
  }
  return { ok: true, refs };
}

/**
 * "head.front+head.sides@overlay" → ["head.front@overlay", "head.sides@overlay"]. A piece without
 * a dot extends the one before it ("head.top+back" stays valid). A layer written only on the last
 * piece applies to all of them. Null when it doesn't split into more than one selector.
 */
function splitJoined(text: string): string[] | null {
  const groups: string[] = [];
  for (const token of text.split('+')) {
    if (token.includes('.') || !groups.length) groups.push(token);
    else groups[groups.length - 1] += `+${token}`;
  }
  if (groups.length < 2) return null;
  const layer = /@[^.@]+$/.exec(groups[groups.length - 1])?.[0];
  return groups.map((g) => (layer && !g.includes('@') ? g + layer : g));
}

function expand(
  text: string,
  groups: Record<string, readonly string[]>,
  kind: string,
  rig: Rig,
): { ok: true; values: string[] } | { ok: false; error: string; hint?: string } {
  const values: string[] = [];
  for (const token of text.split('+')) {
    const g = Object.hasOwn(groups, token) ? groups[token] : undefined;
    if (!g) {
      const where = kind === 'part' && rig.layout !== 'player' ? ` in the ${rig.layout} layout` : '';
      const mirrored = kind === 'part' && /^left(Arm|Leg)$/.test(token) && rig.part(token.replace('left', 'right')) ? `${token} reuses ${token.replace('left', 'right')}'s texture (mirrored) in this layout; target that instead` : null;
      return { ok: false, error: `unknown ${kind} "${token}"${where}`, hint: mirrored ?? suggestHint(token, Object.keys(groups)) ?? `valid: ${Object.keys(groups).join(', ')}` };
    }
    for (const v of g) if (!values.includes(v)) values.push(v);
  }
  return { ok: true, values };
}
