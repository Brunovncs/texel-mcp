import { suggestHint } from './color.js';
import { applyPatch as patchSpec, type PatchEntry } from './patch.js';
import type { ColorExpr, Issue, Model, Op, SkinSpec } from './types.js';

/** A change applied to the family's base spec to produce one member. */
export interface VariantPatch {
  name?: string;
  description?: string;
  model?: Model;
  tags?: string[];
  /** Merged over the base palette. Keys set here override base keys. */
  palette?: Record<string, ColorExpr>;
  /** Merged over the base legend. */
  legend?: Record<string, ColorExpr>;
  /** Layer ids to force-enable (removes `enabled: false`). */
  enable?: string[];
  /** Layer ids to disable. */
  disable?: string[];
  /**
   * Changes to the base layers by id, as in a patch: "update" a layer's fields, "replace" or
   * "remove" it, "add" one next to another. This is what makes members different characters, not
   * only recolors. Applied after enable/disable, before `layers`.
   */
  patch?: PatchEntry[];
  /** Layers appended after the base layers. */
  layers?: Op[];
}

/**
 * A family describes many skins that share one base: team kits, faction uniforms, rarity tiers.
 * `variants` lists members explicitly; `matrix` generates the cartesian product of its axes.
 */
export interface SkinFamily {
  $schema?: string;
  version: 1;
  kind: 'family';
  name?: string;
  description?: string;
  base: SkinSpec;
  variants?: Record<string, VariantPatch>;
  matrix?: Record<string, Record<string, VariantPatch>>;
}

export interface FamilyMember {
  id: string;
  spec: SkinSpec;
  /** For matrix members: the value chosen on each axis. */
  axes?: Record<string, string>;
}

export interface FamilyExpansion {
  ok: boolean;
  name: string;
  members: FamilyMember[];
  issues: Issue[];
}

export const MAX_FAMILY_SIZE = 256;
const FAMILY_KEYS = ['$schema', 'version', 'kind', 'name', 'description', 'base', 'variants', 'matrix'];
const PATCH_KEYS = ['name', 'description', 'model', 'tags', 'palette', 'legend', 'enable', 'disable', 'patch', 'layers'];
const ID = /^[a-z0-9][a-z0-9-]*$/;

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function isFamily(value: unknown): value is SkinFamily {
  return isObj(value) && value.kind === 'family';
}

function applyPatch(spec: SkinSpec, patch: VariantPatch, path: string, issues: Issue[]): SkinSpec {
  const out = clone(spec);
  if (patch.model) out.model = patch.model;
  if (patch.tags) out.tags = [...(out.tags ?? []), ...patch.tags];
  if (patch.palette) out.palette = { ...(out.palette ?? {}), ...patch.palette };
  if (patch.legend) out.legend = { ...(out.legend ?? {}), ...patch.legend };
  const ids = out.layers.map((l) => l.id).filter((id): id is string => typeof id === 'string');
  const toggle = (list: string[] | undefined, key: 'enable' | 'disable') => {
    for (const id of list ?? []) {
      const layers = out.layers.filter((l) => l.id === id);
      if (!layers.length) {
        issues.push({ level: 'error', code: 'unknown-layer-id', path: `${path}.${key}`, message: `no base layer has id "${id}"`, hint: suggestHint(id, ids) ?? 'give the base layer an "id" first' });
        continue;
      }
      for (const l of layers) {
        if (key === 'enable') delete l.enabled;
        else l.enabled = false;
      }
    }
  };
  toggle(patch.enable, 'enable');
  toggle(patch.disable, 'disable');
  let result = out;
  if (patch.patch !== undefined) {
    if (!Array.isArray(patch.patch)) issues.push({ level: 'error', code: 'bad-variant', path: `${path}.patch`, message: '"patch" is a list of patch entries ({ "do": "update", "id": …, "set": … })' });
    else {
      // A member that silently lost a change would look like the base, so every skipped entry is an error here.
      const p = patchSpec(out, { patch: clone(patch.patch) });
      for (const i of p.issues) issues.push({ ...i, level: 'error', code: 'variant-patch', path: `${path}.patch${i.path.replace(/^\$\.patch/, '')}` });
      result = p.spec;
    }
  }
  if (patch.layers) result.layers.push(...clone(patch.layers));
  return result;
}

function checkPatch(raw: unknown, path: string, issues: Issue[]): raw is VariantPatch {
  if (!isObj(raw)) {
    issues.push({ level: 'error', code: 'bad-variant', path, message: 'a variant must be an object (a patch over the base spec)' });
    return false;
  }
  for (const k of Object.keys(raw))
    if (!PATCH_KEYS.includes(k)) issues.push({ level: 'warning', code: 'unknown-key', path: `${path}.${k}`, message: `unknown variant key "${k}" is ignored`, hint: suggestHint(k, PATCH_KEYS) });
  return true;
}

/** Expand a family into concrete specs. Never throws; problems are reported as issues. */
export function expandFamily(input: unknown): FamilyExpansion {
  const issues: Issue[] = [];
  let raw = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      return { ok: false, name: '', members: [], issues: [{ level: 'error', code: 'bad-json', path: '$', message: `invalid JSON: ${(e as Error).message}` }] };
    }
  }
  if (!isObj(raw) || raw.kind !== 'family')
    return { ok: false, name: '', members: [], issues: [{ level: 'error', code: 'bad-family', path: '$', message: 'a family must be an object with "kind": "family"' }] };
  for (const k of Object.keys(raw))
    if (!FAMILY_KEYS.includes(k)) issues.push({ level: 'warning', code: 'unknown-key', path: `$.${k}`, message: `unknown key "${k}" is ignored`, hint: suggestHint(k, FAMILY_KEYS) });
  if (!isObj(raw.base) || !Array.isArray(raw.base.layers)) {
    issues.push({ level: 'error', code: 'bad-base', path: '$.base', message: '"base" must be a skin spec with a "layers" array' });
    return { ok: false, name: String(raw.name ?? ''), members: [], issues };
  }
  const base = raw.base as unknown as SkinSpec;
  const familyName = String(raw.name ?? base.name ?? 'family');
  const members: FamilyMember[] = [];
  const seen = new Set<string>();
  const push = (m: FamilyMember, path: string) => {
    if (seen.has(m.id)) issues.push({ level: 'error', code: 'duplicate-id', path, message: `member id "${m.id}" appears twice` });
    seen.add(m.id);
    members.push(m);
  };

  if (raw.variants !== undefined) {
    if (!isObj(raw.variants)) issues.push({ level: 'error', code: 'bad-variants', path: '$.variants', message: '"variants" must map member ids to patches' });
    else
      for (const [id, patch] of Object.entries(raw.variants)) {
        const path = `$.variants.${id}`;
        if (!ID.test(id)) issues.push({ level: 'error', code: 'bad-id', path, message: `member id "${id}" must be lowercase letters, digits and "-"` });
        if (!checkPatch(patch, path, issues)) continue;
        const spec = applyPatch(base, patch, path, issues);
        spec.name = patch.name ?? `${base.name ?? familyName} (${id})`;
        if (patch.description) spec.description = patch.description;
        push({ id, spec }, path);
      }
  }

  if (raw.matrix !== undefined) {
    if (!isObj(raw.matrix) || !Object.values(raw.matrix).every(isObj)) {
      issues.push({ level: 'error', code: 'bad-matrix', path: '$.matrix', message: '"matrix" must map axis names to { value: patch } objects' });
    } else {
      const axes = Object.entries(raw.matrix as Record<string, Record<string, unknown>>);
      const size = axes.reduce((n, [, values]) => n * Object.keys(values).length, 1);
      if (size > MAX_FAMILY_SIZE) issues.push({ level: 'error', code: 'family-too-large', path: '$.matrix', message: `matrix expands to ${size} members; the limit is ${MAX_FAMILY_SIZE}` });
      else {
        let combos: { id: string[]; axes: Record<string, string>; patches: [VariantPatch, string][] }[] = [{ id: [], axes: {}, patches: [] }];
        for (const [axis, values] of axes) {
          const next: typeof combos = [];
          for (const combo of combos)
            for (const [value, patch] of Object.entries(values)) {
              const path = `$.matrix.${axis}.${value}`;
              if (!ID.test(value)) issues.push({ level: 'error', code: 'bad-id', path, message: `axis value "${value}" must be lowercase letters, digits and "-"` });
              if (!checkPatch(patch, path, issues)) continue;
              next.push({ id: [...combo.id, value], axes: { ...combo.axes, [axis]: value }, patches: [...combo.patches, [patch, path]] });
            }
          combos = next;
        }
        for (const combo of combos) {
          let spec = clone(base);
          for (const [patch, path] of combo.patches) spec = applyPatch(spec, patch, path, issues);
          const names = combo.patches.map(([p], i) => p.name ?? combo.id[i]);
          spec.name = `${base.name ?? familyName} (${names.join(', ')})`;
          push({ id: combo.id.join('-'), spec, axes: combo.axes }, '$.matrix');
        }
      }
    }
  }

  if (!members.length && !issues.some((i) => i.level === 'error'))
    issues.push({ level: 'error', code: 'empty-family', path: '$', message: 'family has no members', hint: 'add "variants" or a "matrix"' });
  // Deduplicate identical issues produced once per matrix combination.
  const unique = [...new Map(issues.map((i) => [`${i.code}|${i.path}|${i.message}`, i])).values()];
  return { ok: !unique.some((i) => i.level === 'error'), name: familyName, members, issues: unique };
}
