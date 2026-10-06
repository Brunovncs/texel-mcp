import { deflateRawSync, deflateSync, inflateRawSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodePNG } from '../src/core/png';
import { PACK_FORMATS, packFormatFor, packReportToMarkdown, validatePack } from '../src/core/pack-check';
import { readZip, writeZip } from '../src/core/zip';

const enc = new TextEncoder();
const png = (w: number, h: number) => encodePNG({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) }, (raw) => deflateSync(raw));
const json = (v: unknown) => enc.encode(JSON.stringify(v));
const META = { pack: { pack_format: 46, description: 'Ruby' } };

const GOOD: Record<string, unknown> = {
  'pack.mcmeta': META,
  'pack.png': png(64, 64),
  'assets/ruby/items/ruby.json': { model: { type: 'minecraft:model', model: 'ruby:item/ruby' } },
  'assets/ruby/models/item/ruby.json': { parent: 'minecraft:item/generated', textures: { layer0: 'ruby:item/ruby' } },
  'assets/ruby/textures/item/ruby.png': png(16, 16),
  'assets/ruby/blockstates/ruby_block.json': { variants: { '': { model: 'ruby:block/ruby_block' } } },
  'assets/ruby/models/block/ruby_block.json': { parent: 'minecraft:block/cube_all', textures: { all: 'ruby:block/ruby_block' } },
  'assets/ruby/textures/block/ruby_block.png': png(16, 16),
  'assets/ruby/models/block/ruby_ore.json': { parent: 'block/cube_all', textures: { all: { sprite: 'ruby:block/ruby_ore' } } },
  'assets/ruby/textures/block/ruby_ore.png': png(16, 64),
  'assets/ruby/textures/block/ruby_ore.png.mcmeta': { animation: { frametime: 2, interpolate: true, frames: [0, 1, { index: 3, time: 4 }] } },
  'assets/ruby/models/block/pedestal_base.json': {
    textures: { particle: '#top' },
    elements: [{ from: [0, 0, 0], to: [16, 8, 16], faces: { up: { texture: '#top' }, north: { texture: 'side' } } }],
  },
  'assets/ruby/models/block/pedestal.json': { parent: 'ruby:block/pedestal_base', textures: { top: 'ruby:block/ruby_block', side: '#top' } },
  'assets/ruby/particles/sparkle.json': { textures: ['ruby:sparkle'] },
  'assets/ruby/textures/particle/sparkle.png': png(8, 8),
  'assets/ruby/lang/en_us.json': { 'item.ruby.ruby': 'Ruby' },
  'assets/minecraft/textures/entity/creeper/creeper.png': png(128, 64),
  'assets/minecraft/textures/block/stone.png': png(16, 16),
  'assets/minecraft/textures/gui/sprites/widget/button.png': png(200, 20),
  'assets/minecraft/textures/gui/sprites/widget/button.png.mcmeta': { gui: { scaling: { type: 'nine_slice', width: 200, height: 20, border: { left: 3, top: 3, right: 3, bottom: 4 } } } },
};

const pack = (changes: Record<string, unknown> = {}) => {
  const files = new Map<string, Uint8Array>();
  for (const [k, v] of Object.entries({ ...GOOD, ...changes })) if (v !== null) files.set(k, v instanceof Uint8Array ? v : json(v));
  return files;
};
const check = (changes: Record<string, unknown> = {}, target?: string) => validatePack(pack(changes), { inflate: (d) => inflateSync(d), target });
const find = (changes: Record<string, unknown>, code: string, target?: string) => check(changes, target).issues.filter((i) => i.code === code);

describe('zip', () => {
  const entries = [...pack()];

  it('round-trips files, deterministically', () => {
    const zip = writeZip(entries, (d) => deflateRawSync(d));
    expect(writeZip(entries, (d) => deflateRawSync(d))).toEqual(zip);
    const back = readZip(zip, (d) => inflateRawSync(d));
    expect([...back.keys()]).toEqual(entries.map(([k]) => k));
    for (const [k, v] of entries) expect(back.get(k)).toEqual(v);
  });

  it('stores what deflate does not shrink, skips directories and normalizes backslashes', () => {
    const noise = Uint8Array.from({ length: 256 }, (_, i) => (i * 167 + 13) & 255);
    const zip = writeZip([['dir/', new Uint8Array()], ['a~b.bin', noise], ['empty.txt', new Uint8Array()]], (d) => deflateRawSync(d));
    for (let i = 0; i < zip.length - 2; i++) if (zip[i] === 0x61 && zip[i + 1] === 0x7e && zip[i + 2] === 0x62) zip[i + 1] = 0x5c;
    const back = readZip(zip, (d) => inflateRawSync(d));
    expect([...back.keys()]).toEqual(['a/b.bin', 'empty.txt']);
    expect(back.get('a/b.bin')).toEqual(noise);
  });

  it('rejects corrupt and unsupported archives', () => {
    const zip = writeZip([['a.txt', enc.encode('hello hello hello hello')]], (d) => deflateRawSync(d));
    expect(() => readZip(enc.encode('not a zip at all, just text'), (d) => inflateRawSync(d))).toThrow(/not a zip/);
    const encrypted = zip.slice();
    const cd = encrypted.findIndex((_, i) => encrypted[i] === 0x50 && encrypted[i + 1] === 0x4b && encrypted[i + 2] === 1 && encrypted[i + 3] === 2);
    encrypted[cd + 8] |= 1;
    expect(() => readZip(encrypted, (d) => inflateRawSync(d))).toThrow(/encrypted/);
    const zip64 = zip.slice();
    zip64.set([0xff, 0xff], zip64.length - 12);
    expect(() => readZip(zip64, (d) => inflateRawSync(d))).toThrow(/zip64/);
    const flipped = zip.slice();
    flipped[35] ^= 0xff;
    expect(() => readZip(flipped, (d) => inflateRawSync(d))).toThrow(/corrupt zip/);
  });

  it('feeds validatePack', () => {
    const files = readZip(writeZip(entries, (d) => deflateRawSync(d)), (d) => inflateRawSync(d));
    expect(validatePack(files, { inflate: (d) => inflateSync(d) }).ok).toBe(true);
  });
});

describe('validatePack', () => {
  it('passes a good pack without issues', () => {
    const r = check({}, '1.21.4');
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.formats).toEqual({ min: 46, max: 46 });
    expect(r.versions).toEqual(['1.21.4']);
    expect(r.stats).toEqual({ textures: 7, models: 5, blockstates: 1, items: 1, particles: 1, animated: 1, other: 1 });
    expect(packReportToMarkdown(r)).toContain('No issues found.');
  });

  it('maps formats and versions', () => {
    expect(packFormatFor('1.21.10')).toBe(69);
    expect(packFormatFor('1.21.0')).toBe(34);
    expect(packFormatFor('1.20.1')).toBeNull();
    expect(PACK_FORMATS[64]).toEqual(['1.21.7', '1.21.8']);
    const r = check({ 'pack.mcmeta': { pack: { description: 'x', pack_format: 46, min_format: 46, max_format: [75, 0] } } });
    expect(r.formats).toEqual({ min: 46, max: 75 });
    expect(r.versions).toEqual(['1.21.4', '1.21.5', '1.21.6', '1.21.7', '1.21.8', '1.21.9', '1.21.10', '1.21.11']);
    expect(r.issues).toEqual([]);
    expect(check({ 'pack.mcmeta': { pack: { description: 'x', pack_format: 34, supported_formats: [34, 46] } } }).formats).toEqual({ min: 34, max: 46 });
  });

  it('checks pack.mcmeta', () => {
    expect(find({ 'pack.mcmeta': null }, 'pack-mcmeta-missing')[0].path).toBe('pack.mcmeta');
    expect(find({ 'pack.mcmeta': enc.encode('{"pack": {') }, 'json-invalid')[0].path).toBe('pack.mcmeta');
    expect(find({ 'pack.mcmeta': { pack: { pack_format: 46 } } }, 'pack-description-missing')[0].path).toBe('pack.mcmeta $.pack.description');
    expect(find({ 'pack.mcmeta': { pack: { description: 'x' } } }, 'pack-format-missing')).toHaveLength(1);
    expect(find({ 'pack.mcmeta': { pack: { description: 'x', pack_format: '46' } } }, 'pack-format-invalid')[0].path).toBe('pack.mcmeta $.pack.pack_format');
    expect(find({ 'pack.mcmeta': { pack: { description: 'x', pack_format: 99 } } }, 'pack-format-unknown')[0].level).toBe('warning');
    expect(find({ 'pack.mcmeta': { pack: { description: 'x', min_format: 34, max_format: 75 } } }, 'pack-format-legacy-missing')).toHaveLength(1);
    expect(find({ 'pack.mcmeta': { pack: { description: 'x', pack_format: 75 } } }, 'pack-format-range-missing')).toHaveLength(1);
    expect(find({}, 'pack-target-unsupported', '1.21.1')[0].path).toBe('pack.mcmeta $.pack');
    expect(find({}, 'pack-target-unknown', '1.19')).toHaveLength(1);
  });

  it('finds a pack zipped inside its folder', () => {
    const files = new Map([...pack({ 'assets/ruby/models/item/ruby.json': { parent: 'ruby:item/nope' } })].map(([k, v]) => [`Ruby Pack/${k}`, v]));
    const r = validatePack(files, { inflate: (d) => inflateSync(d) });
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatchObject({ code: 'pack-nested', path: 'Ruby Pack/pack.mcmeta' });
    expect(r.issues.find((i) => i.code === 'model-parent-missing')?.path).toBe('Ruby Pack/assets/ruby/models/item/ruby.json $.parent');
    expect(r.formats).toEqual({ min: 46, max: 46 });
  });

  it('checks paths and root files', () => {
    expect(find({ 'assets/Ruby/textures/item/x.png': png(16, 16) }, 'path-invalid')[0]).toMatchObject({ level: 'error', path: 'assets/Ruby/textures/item/x.png' });
    expect(find({ 'assets/ruby/textures/item/Ruby Sword.png': png(16, 16) }, 'path-invalid')).toHaveLength(1);
    expect(find({ 'readme.txt': enc.encode('hi') }, 'root-file-extra')[0].level).toBe('info');
    expect(find({ 'data/ruby/recipe/x.json': {} }, 'file-outside-assets')[0].path).toBe('data/ruby/recipe/x.json');
    expect(find({ '__MACOSX/._pack.mcmeta': enc.encode('x'), 'assets/.DS_Store': enc.encode('x') }, 'junk-file')).toHaveLength(1);
    expect(find({ 'pack.png': png(64, 32) }, 'pack-png-not-square')).toHaveLength(1);
    expect(find({ 'pack.png': enc.encode('nope') }, 'pack-png-invalid')).toHaveLength(1);
  });

  it('accepts overlay directories declared in pack.mcmeta', () => {
    const r = check({
      'pack.mcmeta': { ...META, overlays: { entries: [{ formats: [46, 75], directory: 'v1214' }] } },
      'v1214/assets/ruby/models/item/ruby.json': { parent: 'minecraft:item/generated', textures: { layer0: 'ruby:item/ruby' } },
    });
    expect(r.issues).toEqual([]);
  });

  it('parses every JSON file', () => {
    const [i] = find({ 'assets/ruby/lang/en_us.json': enc.encode('{"a": 1,}') }, 'json-invalid');
    expect(i.path).toBe('assets/ruby/lang/en_us.json');
    expect(i.message).toMatch(/^not valid JSON/);
  });

  it('decodes textures', () => {
    expect(find({ 'assets/ruby/textures/item/ruby.png': enc.encode('GIF89a') }, 'texture-invalid')[0].path).toBe('assets/ruby/textures/item/ruby.png');
    const truncated = png(16, 16).slice(0, 40);
    expect(find({ 'assets/ruby/textures/item/ruby.png': truncated }, 'texture-invalid')).toHaveLength(1);
  });

  it('checks animations', () => {
    const M = 'assets/ruby/textures/block/ruby_ore.png.mcmeta';
    expect(find({ [M]: { animation: { frametime: 0 } } }, 'animation-invalid')[0].path).toBe(`${M} $.animation.frametime`);
    expect(find({ [M]: { animation: { interpolate: 'yes' } } }, 'animation-invalid')[0].path).toBe(`${M} $.animation.interpolate`);
    expect(find({ [M]: { animation: { frames: [0, 9] } } }, 'animation-frame-out-of-range')[0].path).toBe(`${M} $.animation.frames[1]`);
    expect(find({ [M]: { animation: { frames: [{ index: 4 }] } } }, 'animation-frame-out-of-range')).toHaveLength(1);
    expect(find({ 'assets/ruby/textures/block/ruby_ore.png': png(16, 40) }, 'animation-size-mismatch')[0].path).toBe(M);
    expect(find({ [M]: { animation: { width: 16, height: 24 } } }, 'animation-size-mismatch')[0].path).toBe(`${M} $.animation`);
    expect(find({ [M]: { animation: { height: 32 } } }, 'animation-size-mismatch')).toEqual([]);
    expect(find({ [M]: null }, 'texture-looks-animated')[0]).toMatchObject({ level: 'warning', path: 'assets/ruby/textures/block/ruby_ore.png' });
    expect(find({ [M]: {} }, 'texture-looks-animated')).toEqual([]);
  });

  it('checks gui scaling', () => {
    const M = 'assets/minecraft/textures/gui/sprites/widget/button.png.mcmeta';
    const gui = (scaling: unknown) => ({ [M]: { gui: { scaling } } });
    expect(find(gui({ type: 'zoom' }), 'gui-scaling-invalid')[0].path).toBe(`${M} $.gui.scaling.type`);
    expect(find(gui({ type: 'tile' }), 'gui-scaling-invalid')[0].path).toBe(`${M} $.gui.scaling`);
    expect(find(gui({ type: 'nine_slice', width: 200, height: 20, border: 10 }), 'gui-scaling-invalid')[0].path).toBe(`${M} $.gui.scaling.border`);
    expect(find(gui({ type: 'nine_slice', width: 200, height: 20, border: { left: 1 } }), 'gui-scaling-invalid')).toHaveLength(1);
    expect(find(gui({ type: 'tile', width: 100, height: 100 }), 'gui-scaling-aspect')[0].level).toBe('warning');
    expect(find(gui({ type: 'stretch' }), 'gui-scaling-aspect')).toEqual([]);
  });

  it('flags block and item sizes that are not powers of two', () => {
    const r = find({ 'assets/ruby/textures/item/ruby.png': png(24, 24) }, 'texture-not-power-of-two');
    expect(r[0]).toMatchObject({ level: 'info', path: 'assets/ruby/textures/item/ruby.png' });
    expect(find({ 'assets/minecraft/textures/gui/odd.png': png(24, 24) }, 'texture-not-power-of-two')).toEqual([]);
  });

  it('checks entity textures against their layout', () => {
    const [creeper] = find({ 'assets/minecraft/textures/entity/creeper/creeper.png': png(64, 64) }, 'entity-texture-size');
    expect(creeper.path).toBe('assets/minecraft/textures/entity/creeper/creeper.png');
    expect(creeper.message).toContain('creeper layout (64×32');
    expect(find({ 'assets/minecraft/textures/entity/equipment/humanoid/ruby.png': png(64, 64) }, 'entity-texture-size')[0].message).toContain('humanoid');
    expect(find({ 'assets/minecraft/textures/entity/creeper/creeper_armor.png': png(32, 32) }, 'entity-texture-size')).toHaveLength(1);
    const fine = {
      'assets/minecraft/textures/entity/zombie/husk.png': png(64, 64),
      'assets/minecraft/textures/entity/hoglin/hoglin.png': png(256, 128),
      'assets/minecraft/textures/entity/player/wide/steve.png': png(64, 32),
      'assets/minecraft/textures/entity/villager/profession/farmer.png': png(64, 64),
    };
    expect(find(fine, 'entity-texture-size')).toEqual([]);
  });

  it('checks model parents and textures', () => {
    const F = 'assets/ruby/models/item/ruby.json';
    expect(find({ [F]: { parent: 'ruby:item/nope' } }, 'model-parent-missing')[0]).toMatchObject({ level: 'error', path: `${F} $.parent` });
    expect(find({ [F]: { parent: 'builtin/generated' } }, 'model-parent-missing')).toEqual([]);
    expect(find({ [F]: { parent: 'item/generated', textures: { layer0: 'ruby:item/nope' } } }, 'texture-missing')[0].path).toBe(`${F} $.textures.layer0`);
    expect(find({ [F]: { parent: 'item/generated', textures: { layer0: 'minecraft:item/diamond' } } }, 'texture-missing')).toEqual([]);
    const a = 'assets/ruby/models/block/a.json', b = 'assets/ruby/models/block/b.json';
    expect(find({ [a]: { parent: 'ruby:block/b' }, [b]: { parent: 'ruby:block/a' } }, 'model-parent-cycle')).toHaveLength(2);
  });

  it('resolves texture variables of leaf models', () => {
    const P = 'assets/ruby/models/block/pedestal.json', B = 'assets/ruby/models/block/pedestal_base.json';
    const own = find({ [P]: { parent: 'ruby:block/pedestal_base', textures: { top: 'ruby:block/ruby_block', side: '#nope' } } }, 'texture-ref-unresolved');
    expect(own.map((i) => [i.level, i.path])).toEqual([
      ['error', `${P} $.textures.side`],
      ['error', `${B} $.elements[0].faces.north.texture`],
    ]);
    expect(own[1].message).toContain(P);
    const vanilla = find({ 'assets/ruby/models/item/ruby.json': { parent: 'item/generated', textures: { layer0: '#gem' } } }, 'texture-ref-unresolved');
    expect(vanilla[0]).toMatchObject({ level: 'warning', path: 'assets/ruby/models/item/ruby.json $.textures.layer0' });
  });

  it('checks blockstates', () => {
    const F = 'assets/ruby/blockstates/ruby_block.json';
    expect(find({ [F]: { variants: { '': { model: 'ruby:block/nope' } } } }, 'model-missing')[0].path).toBe(`${F} $.variants[""].model`);
    expect(find({ [F]: { variants: { 'facing=north': [{ model: 'ruby:block/ruby_block' }, { model: 'ruby:block/nope' }] } } }, 'model-missing')[0].path).toBe(`${F} $.variants["facing=north"][1].model`);
    expect(find({ [F]: { multipart: [{ apply: { model: 'ruby:block/nope' } }] } }, 'model-missing')[0].path).toBe(`${F} $.multipart[0].apply.model`);
    expect(find({ [F]: { multipart: [{ apply: { model: 'minecraft:block/stone' } }] } }, 'model-missing')).toEqual([]);
    expect(find({ [F]: { variant: {} } }, 'blockstate-invalid')[0].path).toBe(`${F} $`);
  });

  it('checks item definitions', () => {
    const F = 'assets/ruby/items/ruby.json';
    const cond = { model: { type: 'minecraft:condition', property: 'minecraft:using_item', on_true: { type: 'minecraft:model', model: 'ruby:item/nope' }, on_false: { type: 'model', model: 'ruby:item/ruby' } } };
    expect(find({ [F]: cond }, 'model-missing').map((i) => i.path)).toEqual([`${F} $.model.on_true.model`]);
    const select = { model: { type: 'minecraft:select', property: 'minecraft:display_context', cases: [{ when: 'gui', model: { type: 'minecraft:model', model: 'ruby:item/gui' } }], fallback: { type: 'minecraft:model', model: 'ruby:item/ruby' } } };
    expect(find({ [F]: select }, 'model-missing')[0].path).toBe(`${F} $.model.cases[0].model.model`);
    expect(find({ [F]: { model: 'ruby:item/ruby' } }, 'item-definition-invalid')[0].path).toBe(`${F} $.model`);
    expect(find({ 'pack.mcmeta': { pack: { description: 'x', pack_format: 34 } } }, 'item-definitions-unsupported')[0]).toMatchObject({ level: 'warning', path: F });
  });

  it('checks particles', () => {
    const F = 'assets/ruby/particles/sparkle.json';
    expect(find({ [F]: { textures: ['ruby:sparkle', 'ruby:glint'] } }, 'texture-missing')[0]).toMatchObject({ path: `${F} $.textures[1]` });
    expect(find({ [F]: { textures: 'ruby:sparkle' } }, 'particle-invalid')[0].path).toBe(`${F} $.textures`);
    expect(find({ [F]: { textures: ['minecraft:flame'] } }, 'texture-missing')).toEqual([]);
  });

  it('reports unused textures outside the minecraft namespace', () => {
    const unused = {
      'assets/ruby/textures/item/old.png': png(16, 16),
      'assets/minecraft/textures/item/diamond.png': png(16, 16),
      'assets/ruby/textures/entity/golem.png': png(64, 64),
      'assets/ruby/textures/gui/icon.png': png(16, 16),
    };
    expect(find(unused, 'texture-unused').map((i) => [i.level, i.path])).toEqual([['info', 'assets/ruby/textures/item/old.png']]);
    const atlas = { ...unused, 'assets/minecraft/atlases/blocks.json': { sources: [{ type: 'minecraft:directory', source: 'item', prefix: 'item/' }] } };
    expect(find(atlas, 'texture-unused')).toEqual([]);
    const font = { ...unused, 'assets/ruby/font/icons.json': { providers: [{ type: 'bitmap', file: 'ruby:item/old.png', ascent: 8, chars: [''] }] } };
    expect(find(font, 'texture-unused')).toEqual([]);
  });

  it('renders markdown with each issue and its hint', () => {
    const md = packReportToMarkdown(check({ 'assets/ruby/models/item/ruby.json': { parent: 'ruby:item/nope' } }));
    expect(md).toContain('has errors');
    expect(md).toContain('`model-parent-missing` at `assets/ruby/models/item/ruby.json $.parent`');
    expect(md).toContain('format: 46 (Java 1.21.4)');
  });
});
