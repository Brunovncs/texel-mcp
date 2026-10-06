import { decodePNG } from './decode.js';
import { resolveLayout } from './layout.js';
import type { Issue, IssueLevel } from './types.js';

/** Resource pack format → the Java versions that read it. */
export const PACK_FORMATS: Readonly<Record<number, readonly string[]>> = {
  34: ['1.21', '1.21.1'],
  42: ['1.21.2', '1.21.3'],
  46: ['1.21.4'],
  55: ['1.21.5'],
  63: ['1.21.6'],
  64: ['1.21.7', '1.21.8'],
  69: ['1.21.9', '1.21.10'],
  75: ['1.21.11'],
};
const KNOWN_FORMATS = Object.keys(PACK_FORMATS).map(Number);
/** First format with item definitions (assets/<ns>/items, 1.21.4). */
const ITEMS_FORMAT = 46;
/** First format that reads min_format/max_format (1.21.9). */
const RANGE_FORMAT = 65;

export function packFormatFor(version: string): number | null {
  const v = version.trim().replace(/^1\.21\.0$/, '1.21');
  return KNOWN_FORMATS.find((f) => PACK_FORMATS[f].includes(v)) ?? null;
}

export interface PackStats {
  textures: number;
  models: number;
  blockstates: number;
  items: number;
  particles: number;
  animated: number;
  other: number;
}

export interface PackReport {
  /** No errors (warnings and info may remain). */
  ok: boolean;
  issues: Issue[];
  /** Formats the pack declares, or null when pack.mcmeta doesn't say. */
  formats: { min: number; max: number } | null;
  /** Known Java versions inside `formats`. */
  versions: string[];
  stats: PackStats;
}

export interface PackCheckOptions {
  /** zlib inflate for PNGs (e.g. node:zlib inflateSync). */
  inflate: (d: Uint8Array) => Uint8Array;
  /** A Java version the pack must support, e.g. "1.21.4". */
  target?: string;
}

interface Asset {
  file: string;
  /** Path from `assets/`, with an overlay directory stripped. */
  rel: string;
  ns: string;
  /** Path after `assets/<ns>/`. */
  sub: string;
}

type Obj = Record<string, unknown>;

const NS_RE = /^[a-z0-9_.-]+$/;
const PATH_RE = /^[a-z0-9_./-]+$/;
const JUNK_RE = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/;
/** Texture folders the game reads by code, not through models or atlases. */
const CODE_DIRS = new Set(['entity', 'gui', 'painting', 'mob_effect', 'trims', 'environment', 'misc', 'font', 'models', 'colormap', 'map', 'effect']);
const SKIP_LAYOUTS = new Set(['player', 'item', 'block']);
/** Larger textures are measured from the header only. */
const MAX_DECODE_PIXELS = 4096 * 4096;
const LEVELS: IssueLevel[] = ['error', 'warning', 'info'];

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isPos = (v: unknown): v is number => isInt(v) && v > 0;
const pow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;
const jp = (base: string, k: string | number) => (typeof k === 'number' ? `${base}[${k}]` : /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? `${base}.${k}` : `${base}[${JSON.stringify(k)}]`);
const stripType = (t: unknown) => (typeof t === 'string' ? t.replace(/^minecraft:/, '') : '');

function loc(ref: string): [ns: string, path: string] {
  const i = ref.indexOf(':');
  return i < 0 ? ['minecraft', ref] : [ref.slice(0, i) || 'minecraft', ref.slice(i + 1)];
}

function pngSize(b: Uint8Array): { width: number; height: number } | null {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (b.length < 24 || !sig.every((x, i) => b[i] === x) || String.fromCharCode(...b.subarray(12, 16)) !== 'IHDR') return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

/** Check a resource pack given as path → bytes (e.g. from readZip). */
export function validatePack(input: ReadonlyMap<string, Uint8Array>, { inflate, target }: PackCheckOptions): PackReport {
  const norm = new Map<string, Uint8Array>();
  for (const [k, v] of input) norm.set(k.replace(/\\/g, '/').replace(/^\.\//, ''), v);
  let files = norm;
  let prefix = '';
  const lead: Issue[] = [];
  if (!files.has('pack.mcmeta')) {
    const nested = [...files.keys()].filter((k) => /^[^/]+\/pack\.mcmeta$/.test(k) && !JUNK_RE.test(k));
    if (nested.length === 1) {
      prefix = nested[0].slice(0, -'pack.mcmeta'.length);
      lead.push({
        level: 'error',
        code: 'pack-nested',
        path: nested[0],
        message: `pack.mcmeta is inside the folder ${prefix}, so the game sees no pack at the root`,
        hint: `Zip the contents of ${prefix} (pack.mcmeta, assets/) rather than the folder itself`,
      });
      files = new Map([...norm].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
    }
  }
  const r = check(files, inflate, target);
  const issues = [...lead, ...r.issues.map((i) => (prefix ? { ...i, path: prefix + i.path } : i))];
  issues.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
  return { ...r, issues, ok: !issues.some((i) => i.level === 'error') };
}

function check(files: ReadonlyMap<string, Uint8Array>, inflate: PackCheckOptions['inflate'], target?: string): Omit<PackReport, 'ok'> {
  const issues: Issue[] = [];
  const add = (level: IssueLevel, code: string, file: string, json: string | null, message: string, hint: string) =>
    issues.push({ level, code, path: json ? `${file} ${json}` : file, message, hint });
  const stats: PackStats = { textures: 0, models: 0, blockstates: 0, items: 0, particles: 0, animated: 0, other: 0 };

  const parsed = new Map<string, unknown>();
  const text = new TextDecoder('utf-8', { fatal: true });
  const readJson = (file: string): unknown => {
    if (parsed.has(file)) return parsed.get(file);
    let value: unknown;
    try {
      value = JSON.parse(text.decode(files.get(file)));
    } catch (e) {
      add('error', 'json-invalid', file, null, `not valid JSON: ${(e as Error).message}`, 'Fix the syntax (no comments or trailing commas; save as UTF-8); the game skips a file it cannot parse');
    }
    parsed.set(file, value);
    return value;
  };

  const junk = [...files.keys()].filter((k) => JUNK_RE.test(k));
  if (junk.length)
    add('info', 'junk-file', junk[0], null, `${junk.length} file(s) left by the OS (__MACOSX/, .DS_Store, Thumbs.db…)`, 'Delete them before zipping; the game ignores them');

  // pack.mcmeta
  let formats: PackReport['formats'] = null;
  const overlays: string[] = [];
  const M = 'pack.mcmeta';
  if (!files.has(M))
    add('error', 'pack-mcmeta-missing', M, null, 'the pack has no pack.mcmeta at its root', 'Add pack.mcmeta with {"pack": {"pack_format": <format>, "description": "…"}} next to assets/');
  else {
    const meta = readJson(M);
    const pack = isObj(meta) ? meta.pack : undefined;
    if (meta !== undefined && !isObj(pack))
      add('error', 'pack-mcmeta-invalid', M, '$.pack', 'pack.mcmeta needs a "pack" object', 'Write {"pack": {"pack_format": <format>, "description": "…"}}');
    if (isObj(pack)) {
      if (pack.description === undefined)
        add('error', 'pack-description-missing', M, '$.pack.description', 'pack.description is required', 'Add "description": "<text>" to the pack object');
      formats = readFormats(pack, M, add);
    }
    const entries = isObj(meta) && isObj(meta.overlays) ? meta.overlays.entries : undefined;
    if (Array.isArray(entries)) for (const e of entries) if (isObj(e) && typeof e.directory === 'string') overlays.push(e.directory.replace(/\/+$/, ''));
  }
  const versions = formats ? KNOWN_FORMATS.filter((f) => f >= formats!.min && f <= formats!.max).flatMap((f) => PACK_FORMATS[f]) : [];
  if (target !== undefined) {
    const want = packFormatFor(target);
    if (want === null)
      add('warning', 'pack-target-unknown', M, null, `target ${target} is not a version this checker knows`, `Use one of ${Object.values(PACK_FORMATS).flat().join(', ')}`);
    else if (formats && (want < formats.min || want > formats.max))
      add('warning', 'pack-target-unsupported', M, '$.pack', `the pack declares format ${fmtRange(formats)}, but ${target} reads format ${want}`, `Set pack_format to ${want}, or widen the range to include it`);
  }

  if (files.has('pack.png')) {
    const size = pngSize(files.get('pack.png')!);
    let bad = !size;
    if (size)
      try {
        decodePNG(files.get('pack.png')!, inflate, { maxSide: 4096 });
      } catch {
        bad = true;
      }
    if (bad) add('warning', 'pack-png-invalid', 'pack.png', null, 'pack.png is not a readable PNG', 'Save the pack icon as a plain 8-bit RGBA PNG (e.g. 128×128)');
    else if (size!.width !== size!.height)
      add('warning', 'pack-png-not-square', 'pack.png', null, `pack.png is ${size!.width}×${size!.height}; the pack list shows it squashed into a square`, 'Use a square icon, e.g. 128×128');
  }

  // Paths
  const assets: Asset[] = [];
  const index = new Map<string, Asset>();
  for (const file of files.keys()) {
    if (file === M || file === 'pack.png' || JUNK_RE.test(file)) continue;
    if (!file.includes('/')) {
      add('info', 'root-file-extra', file, null, 'the game reads only pack.mcmeta, pack.png and assets/ at the root', 'Remove it from the pack, or keep it if it is a readme or license');
      continue;
    }
    const overlay = overlays.find((d) => file.startsWith(`${d}/assets/`));
    const rel = overlay ? file.slice(overlay.length + 1) : file;
    const parts = rel.split('/');
    if (parts[0] !== 'assets' || parts.length < 3) {
      const dataPack = parts[0] === 'data';
      add('warning', 'file-outside-assets', file, null, dataPack ? 'data/ belongs to a data pack; a resource pack ignores it' : 'the game reads only files under assets/<namespace>/', dataPack ? 'Ship data/ as a separate data pack' : 'Move it under assets/<namespace>/ (e.g. assets/minecraft/textures/…) or remove it');
      stats.other++;
      continue;
    }
    const ns = parts[1], sub = parts.slice(2).join('/');
    if (!NS_RE.test(ns) || !PATH_RE.test(sub)) {
      const bad = !NS_RE.test(ns) ? `namespace "${ns}"` : `path "${sub}"`;
      add('error', 'path-invalid', file, null, `${bad} has characters the game rejects, so it ignores the file`, 'Use only lowercase a–z, 0–9, _ - . (and / between folders): rename e.g. "Ruby Sword.png" to "ruby_sword.png" and update references');
      stats.other++;
      continue;
    }
    const a: Asset = { file, rel, ns, sub };
    assets.push(a);
    if (!index.has(rel) || !overlay) index.set(rel, a);
  }

  const used = new Set<string>();
  const atlasDirs: string[] = [];
  const parents = new Set<string>();
  const models = new Map<string, { a: Asset; json: Obj }>();
  const modelRel = (ref: string) => {
    const [ns, p] = loc(ref);
    return `assets/${ns}/models/${p}.json`;
  };
  const needModel = (ref: string, file: string, json: string) => {
    if (loc(ref)[0] === 'minecraft' || index.has(modelRel(ref))) return;
    add('error', 'model-missing', file, json, `model ${ref} is not in the pack (${modelRel(ref)})`, `Add ${modelRel(ref)} or fix the reference (<namespace>:<path> relative to models/, without .json)`);
  };
  const needTexture = (rel: string, ns: string, ref: string, file: string, json: string) => {
    used.add(rel);
    if (ns === 'minecraft' || index.has(rel)) return;
    add('error', 'texture-missing', file, json, `texture ${ref} is not in the pack (${rel})`, `Add ${rel} or fix the reference; the game draws the missing-texture checkerboard`);
  };
  const textureRef = (ref: string, file: string, json: string) => {
    const [ns, p] = loc(ref);
    needTexture(`assets/${ns}/textures/${p}.png`, ns, ref, file, json);
  };

  for (const a of assets) {
    const { file, sub } = a;
    const isJson = sub.endsWith('.json') || sub.endsWith('.mcmeta');
    const json = isJson ? readJson(file) : undefined;
    const top = sub.split('/')[0];
    if (top === 'textures' && sub.endsWith('.png')) {
      stats.textures++;
      checkTexture(a);
    } else if (top === 'textures' && sub.endsWith('.png.mcmeta')) {
      if (!files.has(file.slice(0, -'.mcmeta'.length)))
        add('warning', 'mcmeta-without-texture', file, null, 'no texture next to this .mcmeta', `Add ${file.slice(0, -'.mcmeta'.length)} or remove the .mcmeta`);
    } else if (top === 'models' && sub.endsWith('.json')) {
      stats.models++;
      if (isObj(json)) models.set(a.rel, { a, json });
      else if (json !== undefined) add('error', 'model-invalid', file, '$', 'a model must be a JSON object', 'Write {"parent": …, "textures": {…}}');
    } else if (top === 'blockstates' && sub.endsWith('.json')) {
      stats.blockstates++;
      if (json !== undefined) checkBlockstate(file, json);
    } else if (top === 'items' && sub.endsWith('.json')) {
      stats.items++;
      if (json !== undefined) checkItem(file, json);
    } else if (top === 'particles' && sub.endsWith('.json')) {
      stats.particles++;
      if (json !== undefined) checkParticle(file, json);
    } else {
      stats.other++;
      if (top === 'atlases' && isObj(json)) readAtlas(file, json);
      else if (top === 'font' && sub.endsWith('.json') && isObj(json)) readFont(file, json);
    }
  }

  for (const { a, json } of models.values()) checkModel(a, json);
  for (const rel of models.keys()) if (!parents.has(rel)) checkLeaf(rel);

  if (stats.items && formats && formats.max < ITEMS_FORMAT) {
    const first = assets.find((a) => a.sub.startsWith('items/'))!;
    add('warning', 'item-definitions-unsupported', first.file, null, `item definitions (items/*.json) arrived in 1.21.4 (format ${ITEMS_FORMAT}); the pack's format ${fmtRange(formats)} ignores them`, `Raise the format to ${ITEMS_FORMAT}+ or use models/item/*.json overrides for older versions`);
  }

  for (const a of assets) {
    if (a.ns === 'minecraft' || !a.sub.startsWith('textures/') || !a.sub.endsWith('.png') || used.has(a.rel)) continue;
    const tex = a.sub.slice('textures/'.length);
    if (CODE_DIRS.has(tex.split('/')[0]) || atlasDirs.some((d) => tex.startsWith(`${d}/`))) continue;
    add('info', 'texture-unused', a.file, null, `no model, item definition, particle, font or atlas in the pack uses ${a.ns}:${tex.slice(0, -4)}`, 'Reference it from a model\'s "textures", or remove it if it is left over');
  }

  return { issues, formats, versions, stats };

  function checkTexture(a: Asset) {
    const bytes = files.get(a.file)!;
    const size = pngSize(bytes);
    if (!size) {
      add('error', 'texture-invalid', a.file, null, 'not a PNG file', 'Re-export it as PNG (renaming a .jpg or .webp to .png does not convert it)');
      return;
    }
    const { width: w, height: h } = size;
    if (w * h > MAX_DECODE_PIXELS)
      add('info', 'texture-unchecked', a.file, null, `${w}×${h} is too large to decode here; only its size was checked`, 'Make sure it opens in an image editor');
    else
      try {
        decodePNG(bytes, inflate, { maxSide: 16384 });
      } catch (e) {
        const msg = (e as Error).message;
        if (/interlaced|unsupported/.test(msg)) add('info', 'texture-unchecked', a.file, null, `${msg}; the game reads it, this checker only checked its size`, 'Nothing to fix, unless the game shows it wrong');
        else {
          add('error', 'texture-invalid', a.file, null, `the PNG does not decode: ${msg}`, 'Re-export it from an image editor');
          return;
        }
      }
    const metaFile = `${a.file}.mcmeta`;
    const meta = files.has(metaFile) ? readJson(metaFile) : undefined;
    let frame: [number, number] = [w, h];
    if (isObj(meta)) {
      if (meta.animation !== undefined) {
        stats.animated++;
        frame = checkAnimation(metaFile, meta.animation, w, h) ?? frame;
      }
      if (meta.gui !== undefined) checkGui(metaFile, meta.gui, frame);
    }
    const parts = a.sub.split('/');
    const dir = parts[1];
    if (['block', 'item', 'particle'].includes(dir) && parts.length > 2 && !files.has(metaFile) && h > w && h % w === 0)
      add('warning', 'texture-looks-animated', a.file, null, `${w}×${h} looks like an animation strip of ${h / w} frames, but there is no .mcmeta; the game squashes it into one square`, `Add ${parts.at(-1)}.mcmeta with {"animation": {"frametime": 2}}, or crop it to ${w}×${w}`);
    if (['block', 'item'].includes(dir) && parts.length > 2 && !(pow2(frame[0]) && pow2(frame[1])))
      add('info', 'texture-not-power-of-two', a.file, null, `${frame[0]}×${frame[1]} is not a power of two; mipmaps blur or the atlas shrinks it`, 'Use 16×16, 32×32, 64×64…');
    if (dir === 'entity') {
      const name = parts.at(-1)!.slice(0, -4);
      for (const id of [name, parts.at(-2)!]) {
        const l = resolveLayout(id);
        if (!l || SKIP_LAYOUTS.has(l.id)) continue;
        const [lw, lh] = l.size;
        if (w % lw || h % lh || w / lw !== h / lh)
          add('warning', 'entity-texture-size', a.file, null, `${w}×${h} does not fit the ${l.id} layout (${lw}×${lh}, or a whole multiple for HD)`, `Resize the canvas to ${lw}×${lh} (or ${lw * 2}×${lh * 2}, ${lw * 4}×${lh * 4}…) keeping the UV layout`);
        break;
      }
    }
  }

  function checkAnimation(file: string, anim: unknown, w: number, h: number): [number, number] | null {
    const bad = (json: string, message: string, hint: string) => add('error', 'animation-invalid', file, json, message, hint);
    if (!isObj(anim)) {
      bad('$.animation', 'animation must be an object', 'Write {"animation": {"frametime": 2}}');
      return null;
    }
    if (anim.frametime !== undefined && !isPos(anim.frametime)) bad('$.animation.frametime', 'frametime must be a positive integer (ticks per frame)', 'Use e.g. "frametime": 2');
    if (anim.interpolate !== undefined && typeof anim.interpolate !== 'boolean') bad('$.animation.interpolate', 'interpolate must be true or false', 'Use "interpolate": true');
    for (const k of ['width', 'height'] as const)
      if (anim[k] !== undefined && !isPos(anim[k])) {
        bad(`$.animation.${k}`, `${k} must be a positive integer`, `Set ${k} to the frame's ${k} in pixels, or remove it for square frames`);
        return null;
      }
    const side = Math.min(w, h);
    const fw = (anim.width as number | undefined) ?? (anim.height !== undefined ? w : side);
    const fh = (anim.height as number | undefined) ?? (anim.width !== undefined ? h : side);
    if (w % fw || h % fh) {
      const explicit = anim.width !== undefined || anim.height !== undefined;
      add('error', 'animation-size-mismatch', file, explicit ? '$.animation' : null, `the ${w}×${h} image is not a whole number of ${fw}×${fh} frames`, explicit ? 'Make width/height divide the image size' : `Stack square frames: the height must be a multiple of the width (e.g. ${w}×${w * Math.max(2, Math.round(h / w))})`);
      return null;
    }
    const count = (w / fw) * (h / fh);
    if (anim.frames !== undefined) {
      if (!Array.isArray(anim.frames)) bad('$.animation.frames', 'frames must be an array', 'Use e.g. "frames": [0, 1, {"index": 2, "time": 10}]');
      else
        anim.frames.forEach((f, i) => {
          const p = `$.animation.frames[${i}]`;
          const index = isInt(f) ? f : isObj(f) && isInt(f.index) ? f.index : null;
          if (index === null) return bad(p, 'a frame is an index or {"index": n, "time": ticks}', 'Use a frame number from 0');
          if (isObj(f) && f.time !== undefined && !isPos(f.time)) bad(`${p}.time`, 'time must be a positive integer', 'Use ticks, e.g. "time": 10');
          if (index < 0 || index >= count)
            add('error', 'animation-frame-out-of-range', file, p, `frame ${index} does not exist: the image has ${count} frame(s) (0–${count - 1})`, 'Use an index inside the strip, or add frames to the image');
        });
    }
    return [fw, fh];
  }

  function checkGui(file: string, gui: unknown, [w, h]: [number, number]) {
    const bad = (json: string, message: string, hint: string) => add('error', 'gui-scaling-invalid', file, json, message, hint);
    if (!isObj(gui)) return bad('$.gui', 'gui must be an object', 'Write {"gui": {"scaling": {"type": "stretch"}}}');
    const s = gui.scaling;
    if (s === undefined) return;
    if (!isObj(s) || !['stretch', 'tile', 'nine_slice'].includes(s.type as string))
      return bad('$.gui.scaling.type', 'scaling.type must be "stretch", "tile" or "nine_slice"', 'Pick one of stretch, tile, nine_slice');
    if (s.type === 'stretch') return;
    if (!isPos(s.width) || !isPos(s.height))
      return bad('$.gui.scaling', `${s.type} needs positive integer width and height`, 'Set width and height to the size the sprite is designed at, e.g. 200×20');
    if (s.type === 'nine_slice') {
      const b = s.border;
      const sides = isInt(b) ? { left: b, top: b, right: b, bottom: b } : isObj(b) ? b : null;
      if (!sides || !(['left', 'top', 'right', 'bottom'] as const).every((k) => isInt(sides[k]) && (sides[k] as number) >= 0))
        return bad('$.gui.scaling.border', 'border must be a number or {"left", "top", "right", "bottom"} of non-negative integers', 'Use e.g. "border": 4');
      const [l, t, r, btm] = [sides.left, sides.top, sides.right, sides.bottom] as number[];
      if (l + r >= s.width || t + btm >= s.height)
        return bad('$.gui.scaling.border', `borders (${l}+${r} across, ${t}+${btm} down) leave no center in ${s.width}×${s.height}`, 'Make left+right smaller than width and top+bottom smaller than height');
    }
    if (s.width * h !== s.height * w)
      add('warning', 'gui-scaling-aspect', file, '$.gui.scaling', `scaling is ${s.width}×${s.height} but the image is ${w}×${h}: a different aspect ratio`, `Use a size with the image's ratio (e.g. ${w}×${h}), or resize the image`);
  }

  function checkModel(a: Asset, m: Obj) {
    const { file } = a;
    if (m.parent !== undefined) {
      if (typeof m.parent !== 'string') add('error', 'model-invalid', file, '$.parent', 'parent must be a string', 'Use e.g. "parent": "minecraft:item/generated"');
      else if (!/^(minecraft:)?builtin\//.test(m.parent)) {
        const rel = modelRel(m.parent);
        if (index.has(rel)) parents.add(rel);
        else if (loc(m.parent)[0] !== 'minecraft')
          add('error', 'model-parent-missing', file, '$.parent', `parent ${m.parent} is not in the pack (${rel})`, `Add ${rel}, or point parent at a vanilla model such as minecraft:item/generated`);
      }
      const seen = new Set([a.rel]);
      for (let cur = models.get(a.rel); cur && typeof cur.json.parent === 'string'; ) {
        const next = modelRel(cur.json.parent);
        if (seen.has(next)) {
          add('error', 'model-parent-cycle', file, '$.parent', 'the parent chain loops back on itself', 'Break the loop: one model in the chain must have a vanilla parent or none');
          break;
        }
        seen.add(next);
        cur = models.get(next);
      }
    }
    if (m.textures !== undefined) {
      if (!isObj(m.textures)) add('error', 'model-invalid', file, '$.textures', 'textures must be an object', 'Use e.g. "textures": {"layer0": "ns:item/name"}');
      else
        for (const [k, v] of Object.entries(m.textures)) {
          const ref = spriteOf(v);
          if (ref === null) add('error', 'model-invalid', file, jp('$.textures', k), 'a texture is a string or {"sprite": "…"}', 'Use "<namespace>:<path>" or "#<variable>"');
          else if (!ref.startsWith('#')) textureRef(ref, file, jp('$.textures', k));
        }
    }
    if (Array.isArray(m.overrides))
      m.overrides.forEach((o, i) => isObj(o) && typeof o.model === 'string' && needModel(o.model, file, `$.overrides[${i}].model`));
  }

  /** A model no other pack model inherits from: its texture variables must all resolve. */
  function checkLeaf(rel: string) {
    const chain: { a: Asset; json: Obj }[] = [];
    let leaves = false;
    const seen = new Set<string>();
    for (let r: string | null = rel; r && !seen.has(r); ) {
      seen.add(r);
      const m = models.get(r);
      if (!m) {
        leaves = true;
        break;
      }
      chain.push(m);
      const p = m.json.parent;
      r = typeof p === 'string' ? modelRel(p) : null;
      if (typeof p === 'string' && (/^(minecraft:)?builtin\//.test(p) || !models.has(r!))) {
        leaves = true;
        break;
      }
    }
    const vars: Obj = {};
    for (const m of [...chain].reverse()) if (isObj(m.json.textures)) Object.assign(vars, m.json.textures);
    const resolves = (v: string) => {
      let cur: string | null = v;
      for (let i = 0; i < 32 && cur?.startsWith('#'); i++) cur = spriteOf(vars[cur.slice(1)]);
      return cur !== null && !cur.startsWith('#');
    };
    const leaf = chain[0];
    const level: IssueLevel = leaves ? 'warning' : 'error';
    const hint = leaves ? 'Define the variable in this model\'s "textures" (the vanilla parent may define it, but this checker cannot see it)' : 'Define the variable in "textures" of this model or a parent';
    if (isObj(leaf.json.textures))
      for (const [k, v] of Object.entries(leaf.json.textures)) {
        const ref = spriteOf(v);
        if (ref?.startsWith('#') && !resolves(ref)) add(level, 'texture-ref-unresolved', leaf.a.file, jp('$.textures', k), `${ref} does not resolve to a texture`, hint);
      }
    const holder = chain.find((m) => Array.isArray(m.json.elements));
    if (!holder) return;
    (holder.json.elements as unknown[]).forEach((el, i) => {
      if (!isObj(el) || !isObj(el.faces)) return;
      for (const [face, f] of Object.entries(el.faces)) {
        if (!isObj(f) || typeof f.texture !== 'string') continue;
        const ref = f.texture.startsWith('#') ? f.texture : `#${f.texture}`;
        if (!resolves(ref))
          add(level, 'texture-ref-unresolved', holder.a.file, `${jp(`$.elements[${i}].faces`, face)}.texture`, `${ref} does not resolve to a texture${holder === leaf ? '' : ` in ${leaf.a.file}, which inherits these elements`}`, hint);
      }
    });
  }

  function checkBlockstate(file: string, j: unknown) {
    const bad = (json: string, message: string) => add('error', 'blockstate-invalid', file, json, message, 'Write {"variants": {"": {"model": "ns:block/name"}}} or {"multipart": [{"apply": {"model": …}}]}');
    if (!isObj(j) || (j.variants === undefined && j.multipart === undefined)) return bad('$', 'a blockstate needs "variants" or "multipart"');
    const apply = (v: unknown, p: string) =>
      (Array.isArray(v) ? v.map((x, i) => [x, `${p}[${i}]`] as const) : [[v, p] as const]).forEach(([x, q]) =>
        isObj(x) && typeof x.model === 'string' ? needModel(x.model, file, `${q}.model`) : bad(q, 'each variant needs a "model"'),
      );
    if (j.variants !== undefined) {
      if (!isObj(j.variants)) bad('$.variants', 'variants must be an object');
      else for (const [k, v] of Object.entries(j.variants)) apply(v, jp('$.variants', k));
    }
    if (j.multipart !== undefined) {
      if (!Array.isArray(j.multipart)) bad('$.multipart', 'multipart must be an array');
      else j.multipart.forEach((part, i) => (isObj(part) ? apply(part.apply, `$.multipart[${i}].apply`) : bad(`$.multipart[${i}]`, 'a multipart case must be an object')));
    }
  }

  function checkItem(file: string, j: unknown) {
    if (!isObj(j) || !isObj(j.model))
      return add('error', 'item-definition-invalid', file, '$.model', 'an item definition needs a "model" object', 'Write {"model": {"type": "minecraft:model", "model": "ns:item/name"}}');
    const walk = (node: unknown, p: string): void => {
      if (Array.isArray(node)) return node.forEach((x, i) => walk(x, `${p}[${i}]`));
      if (!isObj(node)) return;
      const type = stripType(node.type);
      if (type === 'model' && typeof node.model === 'string') needModel(node.model, file, `${p}.model`);
      if (type === 'special' && typeof node.base === 'string') needModel(node.base, file, `${p}.base`);
      for (const [k, v] of Object.entries(node)) if (typeof v === 'object' && v) walk(v, jp(p, k));
    };
    walk(j.model, '$.model');
  }

  function checkParticle(file: string, j: unknown) {
    const t = isObj(j) ? j.textures : undefined;
    if (!isObj(j) || (t !== undefined && !(Array.isArray(t) && t.every((x) => typeof x === 'string'))))
      return add('error', 'particle-invalid', file, '$.textures', 'a particle needs "textures": an array of "<namespace>:<name>"', 'Write {"textures": ["ns:name"]} (each is textures/particle/<name>.png)');
    (t as string[] | undefined)?.forEach((ref, i) => {
      const [ns, p] = loc(ref);
      needTexture(`assets/${ns}/textures/particle/${p}.png`, ns, ref, file, `$.textures[${i}]`);
    });
  }

  function readAtlas(file: string, j: Obj) {
    if (!Array.isArray(j.sources)) return;
    j.sources.forEach((s, i) => {
      if (!isObj(s)) return;
      const type = stripType(s.type);
      const p = `$.sources[${i}]`;
      if ((type === 'single' || type === 'unstitch') && typeof s.resource === 'string') textureRef(s.resource, file, `${p}.resource`);
      else if (type === 'directory' && typeof s.source === 'string') atlasDirs.push(s.source.replace(/\/+$/, ''));
      else if (type === 'paletted_permutations') {
        if (Array.isArray(s.textures)) s.textures.forEach((t, k) => typeof t === 'string' && textureRef(t, file, `${p}.textures[${k}]`));
        if (typeof s.palette_key === 'string') textureRef(s.palette_key, file, `${p}.palette_key`);
      }
    });
  }

  function readFont(file: string, j: Obj) {
    if (!Array.isArray(j.providers)) return;
    j.providers.forEach((pr, i) => {
      if (!isObj(pr) || stripType(pr.type) !== 'bitmap' || typeof pr.file !== 'string') return;
      const [ns, p] = loc(pr.file);
      needTexture(`assets/${ns}/textures/${p}`, ns, pr.file, file, `$.providers[${i}].file`);
    });
  }
}

function spriteOf(v: unknown): string | null {
  return typeof v === 'string' ? v : isObj(v) && typeof v.sprite === 'string' ? v.sprite : null;
}

const fmtRange = (f: { min: number; max: number }) => (f.min === f.max ? `${f.min}` : `${f.min}–${f.max}`);

type Add = (level: IssueLevel, code: string, file: string, json: string | null, message: string, hint: string) => void;

function readFormats(pack: Obj, file: string, add: Add): PackReport['formats'] {
  const lows: number[] = [], highs: number[] = [];
  let invalid = false;
  const bad = (field: string, message: string) => {
    invalid = true;
    add('error', 'pack-format-invalid', file, `$.pack.${field}`, message, 'See the format table: e.g. "pack_format": 46 for 1.21.4');
  };
  const pf = pack.pack_format;
  if (pf !== undefined) {
    if (isInt(pf)) lows.push(pf), highs.push(pf);
    else bad('pack_format', 'pack_format must be an integer');
  }
  const sf = pack.supported_formats;
  if (sf !== undefined) {
    const r = isInt(sf) ? [sf, sf] : Array.isArray(sf) && sf.length === 2 && sf.every(isInt) ? sf : isObj(sf) && isInt(sf.min_inclusive) && isInt(sf.max_inclusive) ? [sf.min_inclusive, sf.max_inclusive] : null;
    if (r) lows.push(r[0]), highs.push(r[1]);
    else bad('supported_formats', 'supported_formats must be an integer, [min, max] or {"min_inclusive", "max_inclusive"}');
  }
  const major = (v: unknown) => (isInt(v) ? v : Array.isArray(v) && v.length >= 1 && v.length <= 2 && v.every(isInt) ? (v[0] as number) : null);
  const hasMin = pack.min_format !== undefined, hasMax = pack.max_format !== undefined;
  if (hasMin !== hasMax) bad(hasMin ? 'max_format' : 'min_format', 'min_format and max_format go together');
  for (const [k, list] of [['min_format', lows], ['max_format', highs]] as const) {
    if (pack[k] === undefined) continue;
    const m = major(pack[k]);
    if (m === null) bad(k, `${k} must be an integer or [major, minor]`);
    else list.push(m);
  }
  if (!lows.length || !highs.length) {
    if (!invalid) add('error', 'pack-format-missing', file, '$.pack', 'pack.mcmeta declares no format', 'Add "pack_format": <format> (and "min_format"/"max_format" for 1.21.9+), e.g. 46 for 1.21.4');
    return null;
  }
  const f = { min: Math.min(...lows), max: Math.max(...highs) };
  if (f.min > f.max) bad('min_format', `the declared formats run backwards (${f.min} > ${f.max})`);
  if (isInt(pf) && !KNOWN_FORMATS.includes(pf))
    add('warning', 'pack-format-unknown', file, '$.pack.pack_format', `pack_format ${pf} is not a 1.21 format this checker knows (${KNOWN_FORMATS.join(', ')})`, 'Check the format for your Minecraft version; e.g. 34 for 1.21.1, 46 for 1.21.4');
  else if (!KNOWN_FORMATS.some((k) => k >= f.min && k <= f.max))
    add('warning', 'pack-format-unknown', file, '$.pack', `formats ${fmtRange(f)} include no 1.21 format this checker knows (${KNOWN_FORMATS.join(', ')})`, 'Check the format for your Minecraft version; e.g. 34 for 1.21.1, 46 for 1.21.4');
  if (hasMin && f.min < RANGE_FORMAT && pf === undefined)
    add('warning', 'pack-format-legacy-missing', file, '$.pack', `the pack claims formats below ${RANGE_FORMAT} (before 1.21.9), but those versions only read pack_format`, `Add "pack_format": ${f.min} alongside min_format/max_format`);
  if (isInt(pf) && f.max >= RANGE_FORMAT && !hasMin)
    add('warning', 'pack-format-range-missing', file, '$.pack', `1.21.9+ (format ${RANGE_FORMAT}+) reads min_format/max_format`, `Add "min_format": ${f.min}, "max_format": ${f.max}`);
  return f;
}

export function packReportToMarkdown(r: PackReport): string {
  const s = r.stats;
  const lines = [`## Texel pack check: ${r.ok ? 'valid' : 'has errors'}`, ''];
  lines.push(`- format: ${r.formats ? fmtRange(r.formats) : 'unknown'}${r.versions.length ? ` (Java ${r.versions.join(', ')})` : ''}`);
  lines.push(`- textures: ${s.textures} (${s.animated} animated) · models: ${s.models} · blockstates: ${s.blockstates} · item definitions: ${s.items} · particles: ${s.particles} · other files: ${s.other}`, '');
  if (!r.issues.length) lines.push('No issues found.');
  else {
    const count = (l: IssueLevel) => r.issues.filter((i) => i.level === l).length;
    lines.push(`### Issues: ${count('error')} error(s), ${count('warning')} warning(s), ${count('info')} info`, '');
    for (const i of r.issues) lines.push(`- **${i.level}** \`${i.code}\` at \`${i.path}\`: ${i.message}${i.hint ? `. _${i.hint}_` : ''}`);
  }
  return lines.join('\n');
}
