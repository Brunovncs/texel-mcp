import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  assetOf,
  buildPack,
  compile,
  decodePNG,
  encodePNG,
  expandFamily,
  renderBlock,
  renderScaled,
  renderSheet,
  review,
  textureFiles,
  tileSeams,
  validatePack,
  withSuffix,
  type Image,
  type SkinSpec,
} from '../src/core';

const spec = (layout: string, layers: SkinSpec['layers'], extra: Partial<SkinSpec> = {}): SkinSpec => ({ version: 1, layout, layers, ...extra });
const px = (img: Image, x: number, y: number) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
const codes = (s: SkinSpec) => compile(s).issues.map((i) => i.code);
const json = (bytes: Uint8Array | undefined) => JSON.parse(new TextDecoder().decode(bytes));

describe('texture size', () => {
  it('resizes layouts that take a size', () => {
    const c = compile(spec('gui', [{ op: 'fill', target: 'sprite', color: '#888888' }], { size: [200, 20] }));
    expect(c.ok).toBe(true);
    expect([c.texture.width, c.texture.height]).toEqual([200, 20]);
    expect(c.rig.faceRect('sprite', 'front', 'base')).toEqual({ x: 0, y: 0, w: 200, h: 20 });
    expect(compile(spec('item', [{ op: 'fill', target: 'item', color: '#888' }], { size: [32, 32] })).texture.width).toBe(32);
  });

  it('refuses sizes a layout cannot take', () => {
    expect(codes(spec('item', [], { size: [32, 16] }))).toContain('bad-size');
    expect(codes(spec('painting', [], { size: [20, 16] }))).toContain('bad-size');
    expect(codes(spec('zombie', [], { size: [128, 128] }))).toContain('bad-size');
    expect(codes(spec('gui', [], { size: [0, 10] }))).toContain('bad-size');
    expect(compile(spec('painting', [{ op: 'fill', target: 'all', color: '#555' }], { size: [32, 16] })).ok).toBe(true);
  });
});

describe('bevel', () => {
  it('draws a raised frame with an outline and open corners', () => {
    const c = compile(spec('gui', [{ op: 'bevel', target: 'sprite', color: '#c6c6c6', light: '#ffffff', dark: '#555555', outline: '#000000' }], { size: [8, 6] }));
    expect(c.ok).toBe(true);
    const t = c.texture;
    expect(px(t, 0, 0)[3]).toBe(0);
    expect(px(t, 1, 0)).toEqual([0, 0, 0, 255]);
    expect(px(t, 1, 1)).toEqual([255, 255, 255, 255]);
    expect(px(t, 6, 4)).toEqual([85, 85, 85, 255]);
    expect(px(t, 6, 1)).toEqual([198, 198, 198, 255]);
    expect(px(t, 3, 3)).toEqual([198, 198, 198, 255]);
  });

  it('swaps light and dark when inset', () => {
    const c = compile(spec('gui', [{ op: 'bevel', target: 'sprite', color: '#8b8b8b', light: '#ffffff', dark: '#373737', style: 'inset' }], { size: [18, 18] }));
    expect(px(c.texture, 0, 0)).toEqual([55, 55, 55, 255]);
    expect(px(c.texture, 17, 17)).toEqual([255, 255, 255, 255]);
  });
});

describe('emissive', () => {
  it('collects the glowing pixels into their own texture', () => {
    const c = compile(spec('spider', [{ op: 'fill', target: 'all', color: '#333333' }, { op: 'points', target: 'head.front', points: [[1, 3], [6, 3]], color: '#ff2020', emissive: true }]));
    expect(c.emissive).not.toBeNull();
    const r = c.rig.faceRect('head', 'front', 'base');
    expect(px(c.emissive!, r.x + 1, r.y + 3)).toEqual([255, 32, 32, 255]);
    expect(px(c.emissive!, r.x, r.y)[3]).toBe(0);
    expect(review(c).stats.emissivePixels).toBe(2);
    expect(textureFiles(c).map((f) => f.suffix)).toEqual(['', '_eyes']);
  });

  it('makes only the eyes of an emissive face glow, and loses the glow under later paint', () => {
    const c = compile(spec('player', [{ op: 'fill', target: 'all', color: '#c08060' }, { op: 'face', skin: '#c08060', eyes: '#30d0ff', eyeStyle: 'glow', emissive: true }]));
    const lit = textureFiles(c).find((f) => f.suffix === '_eyes')!.image;
    let n = 0;
    for (let i = 3; i < lit.data.length; i += 4) if (lit.data[i]) n++;
    expect(n).toBe(4);
    const covered = compile({ ...c.spec!, layers: [...c.spec!.layers, { op: 'fill', target: 'head.front', color: '#000000' }] });
    expect(covered.emissive).toBeNull();
  });
});

describe('animation', () => {
  const lava = spec(
    'block',
    [
      { op: 'fill', target: 'all', color: '#cf5a10' },
      { op: 'noise', id: 'bubbles', target: 'all', colors: ['#ffb020'], density: 0.2, seed: 1 },
    ],
    { animation: { frametime: 4, frames: [{}, { patch: [{ do: 'update', id: 'bubbles', set: { seed: 2 } }] }, { patch: [{ do: 'update', id: 'bubbles', set: { seed: 3 } }] }, {}] } },
  );

  it('compiles each frame and stores repeated ones once', () => {
    const c = compile(lava);
    expect(c.ok).toBe(true);
    expect(c.frames).toHaveLength(4);
    const [file] = textureFiles(c);
    expect([file.image.width, file.image.height]).toEqual([16, 48]);
    expect(file.mcmeta).toEqual({ animation: { frametime: 4, frames: [0, 1, 2, 0] } });
    const r = review(c);
    expect(r.stats.frames).toBe(4);
    expect(r.stats.distinctFrames).toBe(3);
    expect(r.issues.map((i) => i.code)).toContain('frames-reused');
  });

  it('reports frames that change nothing, bad patches and layouts that cannot animate', () => {
    expect(review(compile({ ...lava, animation: { frames: [{}, {}] } })).issues.map((i) => i.code)).toContain('animation-static');
    const bad = compile({ ...lava, animation: { frames: [{ patch: [{ do: 'update', id: 'nope', set: {} }] }] } });
    expect(bad.ok).toBe(false);
    expect(bad.issues.find((i) => i.code === 'bad-frame')?.path).toBe('$.animation.frames[0].patch[0]');
    expect(codes({ ...lava, layout: 'zombie', layers: [{ op: 'fill', target: 'all', color: '#555' }] })).toContain('animation-ignored');
    expect(codes({ ...lava, animation: { frametime: 0, frames: [{}] } })).toContain('bad-animation');
  });

  it('writes particles as one file per frame', () => {
    const c = compile(spec('particle', [{ op: 'fill', id: 'dot', target: 'particle', x: 3, y: 3, w: 2, h: 2, color: '#ffffff' }], { animation: { frames: [{}, { patch: [{ do: 'update', id: 'dot', set: { color: '#888888' } }] }] } }));
    expect(textureFiles(c).map((f) => f.suffix)).toEqual(['_0', '_1']);
  });
});

describe('blocks', () => {
  const log = spec('block_column', [
    { op: 'fill', target: 'side', color: '#6b4a2b' },
    { op: 'pattern', target: 'side', kind: 'stripes-v', colors: ['#6b4a2b', '#5a3d22'], size: 2 },
    { op: 'fill', target: 'end', color: '#b08850' },
  ]);

  it('split into one file per part', () => {
    const files = textureFiles(compile(log));
    expect(files.map((f) => f.suffix)).toEqual(['', '_top']);
    expect(files.every((f) => f.image.width === 16 && f.image.height === 16)).toBe(true);
    expect(withSuffix('oak_log.png', '_top')).toBe('oak_log_top.png');
  });

  it('measure seams where copies meet', () => {
    const seamless = compile(spec('block', [{ op: 'fill', target: 'block', color: '#777777' }, { op: 'noise', target: 'block', jitter: 6, seed: 4 }]));
    expect(tileSeams(seamless.texture, seamless.rig).block.horizontal).toBeLessThan(2);
    const framed = compile(spec('block', [{ op: 'fill', target: 'block', color: '#777777' }, { op: 'rect', target: 'block', w: 1, color: '#ffffff' }, { op: 'rect', target: 'block', x: -1, color: '#000000' }]));
    const r = review(framed);
    expect(r.stats.seams!.block.horizontal).toBeGreaterThan(2.5);
    expect(r.issues.find((i) => i.code === 'tile-seam')?.path).toBe('block.front');
  });

  it('show tiled and 3D previews on the sheet', () => {
    const c = compile(log);
    const sheet = renderSheet(c.texture, c.rig, c);
    expect(sheet.layout.panels.map((p) => p.name)).toEqual(['front', 'texture', 'tiled side', 'tiled end', 'block']);
    const cube = renderBlock(...[0, 1, 1].map((i) => ({ width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4).fill(i ? 100 : 200) })) as [Image, Image, Image]);
    expect(px(cube, 48, 24)).toEqual([200, 200, 200, 200]);
    expect(px(cube, 12, 60)[0]).toBe(80);
    expect(px(cube, 84, 60)[0]).toBe(60);
    expect(px(cube, 0, 0)[3]).toBe(0);
  });
});

describe('GUI sprites', () => {
  const button = (scaling: unknown) => spec('gui', [{ op: 'bevel', target: 'sprite', color: '#6f6f6f', outline: '#000000' }], { size: [20, 8], gui: { scaling } as SkinSpec['gui'] });

  it('check their scaling and write it to the .png.mcmeta', () => {
    const c = compile(button({ type: 'nine_slice', border: 3 }));
    expect(c.ok).toBe(true);
    expect(textureFiles(c)[0].mcmeta).toEqual({ gui: { scaling: { type: 'nine_slice', width: 20, height: 8, border: 3 } } });
    expect(codes(button({ type: 'nine_slice', border: 4 }))).toContain('bad-gui');
    expect(codes(button({ type: 'tile', width: 10, height: 10 }))).toContain('gui-aspect');
    expect(codes(button({ type: 'zoom' }))).toContain('bad-gui');
    expect(codes(spec('item', [], { gui: { scaling: { type: 'stretch' } } }))).toContain('gui-ignored');
  });

  it('resize the way the game does', () => {
    const c = compile(button({ type: 'nine_slice', border: 3 }));
    const wide = renderScaled(c.texture, c.gui!, 60, 8);
    // Corners stay put; the middle repeats.
    expect(px(wide, 0, 1)).toEqual(px(c.texture, 0, 1));
    expect(px(wide, 59, 7)).toEqual(px(c.texture, 19, 7));
    expect(px(wide, 30, 0)).toEqual(px(c.texture, 3 + ((30 - 3) % 14), 0));
    expect(renderSheet(c.texture, c.rig, c).layout.panels.map((p) => p.name)).toEqual(['front', 'texture', 'nine_slice 12×8', 'nine_slice 32×16']);
  });
});

describe('families', () => {
  it('change base layers by id, so members can differ in more than color', () => {
    const f = expandFamily({
      version: 1,
      kind: 'family',
      base: { version: 1, layers: [{ op: 'fill', target: 'all', color: '#808080' }, { op: 'face', id: 'face', skin: '#c08060', eyes: '#2244aa' }] },
      variants: {
        angry: { patch: [{ do: 'update', id: 'face', set: { eyeStyle: 'angry', mouth: 'frown' } }] },
        bearded: { patch: [{ do: 'update', id: 'face', set: { beard: 'full' } }], layers: [{ op: 'fill', target: 'legs', color: '#222222' }] },
      },
    });
    expect(f.ok).toBe(true);
    expect(f.members[0].spec.layers[1]).toMatchObject({ eyeStyle: 'angry', mouth: 'frown' });
    expect(f.members[1].spec.layers).toHaveLength(3);
    const broken = expandFamily({ version: 1, kind: 'family', base: { version: 1, layers: [] }, variants: { x: { patch: [{ do: 'remove', id: 'ghost' }] } } });
    expect(broken.ok).toBe(false);
    expect(broken.issues[0]).toMatchObject({ code: 'variant-patch', path: '$.variants.x.patch[0]' });
  });
});

describe('resource packs', () => {
  const deflate = (raw: Uint8Array) => deflateSync(raw);
  const ruby = { result: compile(spec('item', [{ op: 'fill', target: 'item', x: 6, y: 6, w: 4, h: 4, color: '#c01040' }])), name: 'Ruby' };
  const log = { result: compile(spec('block_column', [{ op: 'fill', target: 'all', color: '#6b4a2b' }], { asset: 'mymod:block/ash_log' })), name: 'ash' };
  const pig = { result: compile(spec('pig', [{ op: 'fill', target: 'all', color: '#f0a0a0' }])), name: 'pig' };

  it('place textures by asset or layout default', () => {
    expect(assetOf(ruby.result, 'Ruby')).toEqual({ namespace: 'minecraft', path: 'item/ruby' });
    expect(assetOf(log.result, 'ash', 'other')).toEqual({ namespace: 'mymod', path: 'block/ash_log' });
    expect(assetOf(pig.result, 'pig')).toEqual({ namespace: 'minecraft', path: 'entity/pig/temperate_pig' });
    expect(assetOf(compile(spec('cape', [])), 'x')).toHaveProperty('error');
  });

  it('build a pack the checker accepts, with models when asked', () => {
    const pack = buildPack([ruby, log, pig], { namespace: 'mymod', version: '1.21.4', models: true, deflate });
    expect(pack.ok).toBe(true);
    expect(pack.format).toBe(46);
    expect(json(pack.files.get('pack.mcmeta'))).toEqual({ pack: { description: 'Made with Texel (3 textures)', pack_format: 46 } });
    expect([...pack.files.keys()]).toEqual(
      expect.arrayContaining([
        'assets/mymod/textures/item/ruby.png',
        'assets/mymod/models/item/ruby.json',
        'assets/mymod/items/ruby.json',
        'assets/mymod/textures/block/ash_log.png',
        'assets/mymod/textures/block/ash_log_top.png',
        'assets/mymod/models/block/ash_log.json',
        'assets/mymod/blockstates/ash_log.json',
        'assets/mymod/textures/entity/pig/temperate_pig.png',
      ]),
    );
    expect(json(pack.files.get('assets/mymod/models/block/ash_log.json'))).toEqual({ parent: 'minecraft:block/cube_column', textures: { side: 'mymod:block/ash_log', end: 'mymod:block/ash_log_top' } });
    const check = validatePack(pack.files, { inflate: (d) => inflateSync(d), target: '1.21.4' });
    expect(check.issues.filter((i) => i.level !== 'info')).toEqual([]);
  });

  it('hold tools and weapons diagonally, like vanilla', () => {
    const sword = { result: compile(spec('item', [{ op: 'fill', target: 'item', x: 7, y: 2, w: 2, h: 12, color: '#c01040' }])), name: 'ruby_sword' };
    const pack = buildPack([sword, ruby], { models: true, deflate });
    expect(json(pack.files.get('assets/minecraft/models/item/ruby_sword.json')).parent).toBe('minecraft:item/handheld');
    expect(json(pack.files.get('assets/minecraft/models/item/ruby.json')).parent).toBe('minecraft:item/generated');
  });

  it('write the 1.21.9 pack format fields and report what it cannot place', () => {
    const latest = buildPack([ruby], { deflate });
    expect(json(latest.files.get('pack.mcmeta')).pack).toMatchObject({ min_format: 75, max_format: 75 });
    const bad = buildPack([{ result: compile(spec('cape', [{ op: 'fill', target: 'all', color: '#333' }])), name: 'cape' }, ruby, ruby], { version: '1.19', deflate });
    expect(bad.issues.map((i) => i.code)).toEqual(['unknown-version', 'no-asset', 'duplicate-asset']);
  });
});

describe('PNG decoding', () => {
  it('honors a transparent color key on grayscale and truecolor images', () => {
    // 2×1 grayscale, gray 0 transparent: a hand-made PNG like vanilla's armadillo scute overlay.
    const chunk = (type: string, data: number[]) => {
      const body = new Uint8Array([...type].map((c) => c.charCodeAt(0)).concat(data));
      let crc = ~0;
      for (const b of body) {
        crc ^= b;
        for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
      crc = ~crc >>> 0;
      return [...[24, 16, 8, 0].map((s) => (data.length >>> s) & 255), ...body, ...[24, 16, 8, 0].map((s) => (crc >>> s) & 255)];
    };
    const idat = [...deflateSync(new Uint8Array([0, 0, 200]))];
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', [0, 0, 0, 2, 0, 0, 0, 1, 8, 0, 0, 0, 0]), ...chunk('tRNS', [0, 0]), ...chunk('IDAT', idat), ...chunk('IEND', [])]);
    const img = decodePNG(bytes, (d) => inflateSync(d));
    expect(px(img, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(img, 1, 0)).toEqual([200, 200, 200, 255]);
    expect(encodePNG(img, deflate).length).toBeGreaterThan(0);
  });
});

const deflate = (raw: Uint8Array) => deflateSync(raw);

describe('issue codes', () => {
  it('are all registered, and the registry lists only codes the source can report', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { ISSUE_CODES } = await import('../src/core/codes');
    // craft.ts reports advice (art.advice, CRAFT_ADVICE_CODES), not issues.
    const source = readdirSync('src/core').filter((f) => f.endsWith('.ts') && f !== 'codes.ts' && f !== 'craft.ts').map((f) => readFileSync(`src/core/${f}`, 'utf8')).join('\n');
    const emitted = new Set([...source.matchAll(/(?:\w+\((?:'(?:error|warning|info)'|level), |code: )'([a-z0-9-]+)'/g)].map((m) => m[1]));
    expect([...emitted].filter((c) => !ISSUE_CODES[c]).sort()).toEqual([]);
    expect(Object.keys(ISSUE_CODES).filter((c) => !emitted.has(c)).sort()).toEqual([]);
  });
});
