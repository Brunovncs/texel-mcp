import type { Issue, Op, SkinSpec } from './types';

/**
 * Patches: change a spec by layer id instead of rewriting it. A model fixing or editing a skin
 * sends only what changes, so everything else stays exactly as it was and the reply is a fraction
 * of the size. Entries that can't apply (unknown id, bad shape) are skipped and reported; the rest
 * still apply, in order.
 *
 *   { "patch": [
 *     { "do": "update", "id": "face", "set": { "eyeStyle": "wide" } },
 *     { "do": "replace", "id": "hood", "layer": { "op": "fill", … } },
 *     { "do": "add", "layer": { "op": "points", … }, "after": "belt" },
 *     { "do": "remove", "id": "noise-2" },
 *     { "do": "palette", "set": { "cloth": "#3a5bd9" } },
 *     { "do": "legend", "set": { "E": "#2244aa" } },
 *     { "do": "meta", "set": { "description": "…" } }
 *   ] }
 */

export type PatchEntry =
  | { do: 'update'; id: string; set: Record<string, unknown> }
  | { do: 'replace'; id: string; layer: Op }
  | { do: 'add'; layer: Op; after?: string; before?: string }
  | { do: 'remove'; id: string }
  | { do: 'palette'; set: Record<string, string | null> }
  | { do: 'legend'; set: Record<string, string | null> }
  | { do: 'meta'; set: { name?: string; description?: string; model?: 'classic' | 'slim' } };

export interface Patch {
  patch: PatchEntry[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function isPatch(v: unknown): v is Patch {
  return isObj(v) && Array.isArray(v.patch) && !('layers' in v);
}

/**
 * Give every layer an id so a patch can point at it. Existing ids are kept; new ones are the op
 * name plus its position ("fill-0", "points-12"), which stays readable in a prompt.
 */
export function withIds(spec: SkinSpec): SkinSpec {
  const taken = new Set(spec.layers.map((l) => (isObj(l) && typeof l.id === 'string' ? l.id : null)).filter(Boolean));
  return {
    ...spec,
    layers: spec.layers.map((l, i) => {
      if (!isObj(l) || typeof l.id === 'string') return l;
      let id = `${typeof l.op === 'string' ? l.op : 'layer'}-${i}`;
      while (taken.has(id)) id += '_';
      taken.add(id);
      return { ...l, id } as Op;
    }),
  };
}

/** Apply a patch to a spec. Never throws; returns the new spec and what was skipped. */
export function applyPatch(spec: SkinSpec, patch: unknown): { spec: SkinSpec; applied: number; issues: Issue[] } {
  const issues: Issue[] = [];
  const skip = (i: number, message: string, hint?: string) =>
    issues.push(hint ? { level: 'warning', code: 'patch-skipped', path: `$.patch[${i}]`, message, hint } : { level: 'warning', code: 'patch-skipped', path: `$.patch[${i}]`, message });
  if (!isPatch(patch)) return { spec, applied: 0, issues: [{ level: 'error', code: 'bad-patch', path: '$', message: 'a patch is an object with a "patch" array' }] };

  let layers = [...spec.layers];
  let palette = { ...(spec.palette ?? {}) };
  let legend = { ...(spec.legend ?? {}) };
  const out: SkinSpec = { ...spec };
  const ids = () => layers.map((l) => (isObj(l) ? l.id : undefined));
  const find = (id: unknown) => (typeof id === 'string' ? ids().indexOf(id) : -1);
  const known = () => `known ids: ${ids().filter(Boolean).join(', ')}`;
  let applied = 0;

  patch.patch.forEach((raw, i) => {
    if (!isObj(raw)) return skip(i, 'each entry must be an object with "do"');
    const e = raw as Record<string, unknown>;
    switch (e.do) {
      case 'update': {
        const at = find(e.id);
        if (at < 0) return skip(i, `no layer with id ${JSON.stringify(e.id)}`, known());
        if (!isObj(e.set)) return skip(i, '"update" needs "set": the fields to change');
        // `null` drops a field, so a patch can remove an area or an option.
        const next: Record<string, unknown> = { ...(layers[at] as unknown as Record<string, unknown>) };
        for (const [k, v] of Object.entries(e.set)) {
          if (k === 'id') continue;
          if (v === null) delete next[k];
          else next[k] = v;
        }
        layers[at] = next as unknown as Op;
        break;
      }
      case 'replace': {
        const at = find(e.id);
        if (at < 0) return skip(i, `no layer with id ${JSON.stringify(e.id)}`, known());
        if (!isObj(e.layer)) return skip(i, '"replace" needs "layer"');
        layers[at] = { ...(e.layer as object), id: e.id } as Op;
        break;
      }
      case 'add': {
        if (!isObj(e.layer)) return skip(i, '"add" needs "layer"');
        const anchor = e.after ?? e.before;
        const at = anchor === undefined ? layers.length : find(anchor) + (e.after !== undefined ? 1 : 0);
        if (anchor !== undefined && find(anchor) < 0) return skip(i, `no layer with id ${JSON.stringify(anchor)} to add next to`, known());
        layers = [...layers.slice(0, at), e.layer as unknown as Op, ...layers.slice(at)];
        break;
      }
      case 'remove': {
        const at = find(e.id);
        if (at < 0) return skip(i, `no layer with id ${JSON.stringify(e.id)}`, known());
        layers = layers.filter((_, j) => j !== at);
        break;
      }
      case 'palette': {
        if (!isObj(e.set)) return skip(i, '"palette" needs "set": name → color (null removes)');
        for (const [k, v] of Object.entries(e.set)) {
          if (v === null) delete palette[k];
          else if (typeof v === 'string') palette = { ...palette, [k]: v };
        }
        break;
      }
      case 'legend': {
        if (!isObj(e.set)) return skip(i, '"legend" needs "set": character → color (null removes)');
        for (const [k, v] of Object.entries(e.set)) {
          if (v === null) delete legend[k];
          else if (typeof v === 'string') legend = { ...legend, [k]: v };
        }
        break;
      }
      case 'meta': {
        if (!isObj(e.set)) return skip(i, '"meta" needs "set"');
        for (const k of ['name', 'description'] as const) if (typeof e.set[k] === 'string') out[k] = e.set[k] as string;
        if (e.set.model === 'classic' || e.set.model === 'slim') out.model = e.set.model;
        break;
      }
      default:
        return skip(i, `unknown "do" ${JSON.stringify(e.do)}`, 'use update, replace, add, remove, palette, legend or meta');
    }
    applied++;
  });
  return { spec: { ...out, palette, ...(Object.keys(legend).length ? { legend } : {}), layers }, applied, issues };
}
