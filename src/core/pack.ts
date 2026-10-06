import type { CompileResult } from './compile.js';
import { textureFiles } from './outputs.js';
import { packFormatFor, PACK_FORMATS } from './pack-check.js';
import { encodePNG } from './png.js';
import type { Issue } from './types.js';

/**
 * A resource pack from compiled specs: each texture at its place under assets/<namespace>/textures/
 * (the spec's "asset", or the layout's default: a vanilla texture for mobs, a folder plus the
 * spec's name for items and blocks), with its .png.mcmeta, its `_eyes` texture, and for items and
 * blocks optionally the models, block states and item definitions a mod or a new item needs.
 */
export interface PackEntry {
  result: CompileResult;
  /** File stem the spec came from: the texture's name when it has no "asset". */
  name: string;
}

export interface PackBuildOptions {
  /** Namespace for assets without one. Default "minecraft" (replaces vanilla textures). */
  namespace?: string;
  /** Java version the pack is for (sets pack_format and the model files). Default: the latest known. */
  version?: string;
  description?: string;
  /** Write models, block states and item definitions for item, block and plant textures. */
  models?: boolean;
  /** zlib deflate (not raw), for the PNGs. */
  deflate: (raw: Uint8Array) => Uint8Array;
}

export interface PackBuild {
  ok: boolean;
  files: Map<string, Uint8Array>;
  issues: Issue[];
  /** Where each entry's textures went: "assets/minecraft/textures/item/ruby.png". */
  placed: { name: string; files: string[] }[];
  version: string;
  format: number;
}

const NAMESPACE = /^[a-z0-9_.-]+$/;
const json = (v: unknown) => new TextEncoder().encode(`${JSON.stringify(v, null, 2)}\n`);

/** "Ruby Sword!" → "ruby_sword". */
export function assetSlug(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '') || 'texture';
}

/** The namespace and path (under textures/, no .png) a spec's texture takes in a pack, or why it has none. */
export function assetOf(result: CompileResult, name: string, namespace = 'minecraft'): { namespace: string; path: string } | { error: string } {
  const asset = result.spec?.asset;
  if (typeof asset === 'string') {
    const [ns, path] = asset.includes(':') ? asset.split(':', 2) : [namespace, asset];
    return { namespace: ns, path };
  }
  const t = result.rig.def.texture;
  if (!t) return { error: `the ${result.layout} layout has no default place in a pack` };
  return { namespace, path: t.endsWith('/') ? `${t}${assetSlug(name)}` : t };
}

export function buildPack(entries: readonly PackEntry[], opts: PackBuildOptions): PackBuild {
  const known = Object.values(PACK_FORMATS).flat();
  const version = opts.version ?? known[known.length - 1];
  const issues: Issue[] = [];
  const files = new Map<string, Uint8Array>();
  const placed: PackBuild['placed'] = [];
  const format = packFormatFor(version);
  const namespace = opts.namespace ?? 'minecraft';
  if (format === null) issues.push({ level: 'error', code: 'unknown-version', path: 'version', message: `no known pack format for Minecraft ${version}`, hint: `known: ${known.join(', ')}` });
  if (!NAMESPACE.test(namespace)) issues.push({ level: 'error', code: 'bad-namespace', path: 'namespace', message: `namespace "${namespace}" may only use a-z, 0-9, "_", "-" and "."` });
  const itemDefinitions = (format ?? 0) >= 46;
  const put = (path: string, bytes: Uint8Array, owner: string) => {
    if (files.has(path)) issues.push({ level: 'error', code: 'duplicate-asset', path: owner, message: `${path} is written twice`, hint: 'give one of the specs its own "asset"' });
    files.set(path, bytes);
  };

  for (const { result, name } of entries) {
    if (!result.ok) {
      issues.push({ level: 'error', code: 'spec-errors', path: name, message: `${name} has errors and was left out`, hint: 'run review on it and fix the errors' });
      continue;
    }
    const where = assetOf(result, name, namespace);
    if ('error' in where) {
      issues.push({ level: 'error', code: 'no-asset', path: name, message: `${name}: ${where.error}`, hint: 'set "asset" in the spec, e.g. "entity/pig/temperate_pig" or "mymod:entity/guard"' });
      continue;
    }
    const { namespace: ns, path } = where;
    const def = result.rig.def;
    const out: string[] = [];
    const tex = (suffix: string) => `assets/${ns}/textures/${path}${suffix}.png`;
    for (const f of textureFiles(result)) {
      put(tex(f.suffix), encodePNG(f.image, opts.deflate), name);
      out.push(tex(f.suffix));
      if (f.mcmeta) put(`${tex(f.suffix)}.mcmeta`, json(f.mcmeta), name);
    }
    placed.push({ name, files: out });

    const id = path.split('/').pop()!;
    const ref = (suffix = '') => `${ns}:${path}${suffix}`;
    if (def.animated === 'sprites') {
      if (!path.startsWith('particle/')) issues.push({ level: 'info', code: 'particle-elsewhere', path: name, message: `${name} is not under particle/, so no particle definition was written` });
      else {
        const frames = result.frames && result.spec?.animation ? result.frames.map((_, i) => `${ns}:${path.slice('particle/'.length)}_${i}`) : [`${ns}:${path.slice('particle/'.length)}`];
        put(`assets/${ns}/particles/${id}.json`, json({ textures: frames }), name);
      }
    }
    if (!opts.models || !def.model) continue;
    const slots = Object.fromEntries(Object.entries(def.model.textures).map(([slot, part]) => [slot, ref(def.files?.[part] ?? '')]));
    if (def.texture === 'item/') {
      put(`assets/${ns}/models/item/${id}.json`, json({ parent: def.model.parent, textures: slots }), name);
      if (itemDefinitions) put(`assets/${ns}/items/${id}.json`, json({ model: { type: 'minecraft:model', model: `${ns}:item/${id}` } }), name);
    } else {
      put(`assets/${ns}/models/block/${id}.json`, json({ parent: def.model.parent, textures: slots }), name);
      put(`assets/${ns}/blockstates/${id}.json`, json({ variants: { '': { model: `${ns}:block/${id}` } } }), name);
      // A plant shows its texture flat in the inventory; a block shows the block.
      const flat = def.model.parent.endsWith('/cross');
      if (flat || !itemDefinitions) put(`assets/${ns}/models/item/${id}.json`, json(flat ? { parent: 'minecraft:item/generated', textures: { layer0: ref() } } : { parent: `${ns}:block/${id}` }), name);
      if (itemDefinitions) put(`assets/${ns}/items/${id}.json`, json({ model: { type: 'minecraft:model', model: flat ? `${ns}:item/${id}` : `${ns}:block/${id}` } }), name);
    }
  }

  const description = opts.description ?? `Made with Texel (${entries.length} texture${entries.length === 1 ? '' : 's'})`;
  const pack: Record<string, unknown> = { description };
  // 1.21.9 (format 65 and up) reads min_format/max_format; older versions read pack_format.
  if ((format ?? 0) >= 65) Object.assign(pack, { min_format: format, max_format: format });
  else pack.pack_format = format;
  files.set('pack.mcmeta', json({ pack }));
  return { ok: !issues.some((i) => i.level === 'error'), files: new Map([...files].sort(([a], [b]) => (a === 'pack.mcmeta' ? -1 : b === 'pack.mcmeta' ? 1 : a.localeCompare(b)))), issues, placed, version, format: format ?? 0 };
}
