import { describe, expect, it } from 'vitest';
import { compile, perceptualLightness, textureToSpec, type Image, type RGBA } from '../src/core';
import { isIntegerScale, pixelize } from '../src/core/pixelize';

const image = (width: number, height: number, paint: (x: number, y: number) => RGBA): Image => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4);
  return { width, height, data };
};

const at = (img: Image, x: number, y: number): number[] => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

const distinct = (img: Image) => {
  const set = new Set<string>();
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) set.add(img.data.slice(i, i + 3).join());
  return set.size;
};

const CLEAR: RGBA = [0, 0, 0, 0];
const RAW = { background: 'keep', fit: 'stretch', colors: 0, cleanup: false } as const;

describe('pixelize: downscale', () => {
  it('averages each 2×2 block exactly for an integer factor', () => {
    const color = (x: number, y: number): RGBA => [(x * 7 + y * 3) % 256, (x * y) % 256, (x + y * 5) % 256, 255];
    const src = image(128, 128, color);
    const { image: out, notes } = pixelize(src, 64, 64, RAW);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const block = [color(2 * x, 2 * y), color(2 * x + 1, 2 * y), color(2 * x, 2 * y + 1), color(2 * x + 1, 2 * y + 1)];
        const mean = [0, 1, 2].map((c) => Math.round(block.reduce((s, p) => s + p[c], 0) / 4));
        expect(at(out, x, y)).toEqual([...mean, 255]);
      }
    expect(notes).toContain('scaled 128×128 to 64×64 (exact 2× average)');
    expect(isIntegerScale(src, 64, 64)).toBe(true);
    expect(isIntegerScale(src, 64, 32)).toBe(false);
    expect(isIntegerScale(image(100, 100, () => CLEAR), 64, 64)).toBe(false);
  });

  it('weights color by alpha, so hidden colors of transparent pixels never bleed in', () => {
    const src = image(2, 2, (x) => (x === 0 ? [200, 40, 40, 255] : [0, 255, 0, 0]));
    expect(at(pixelize(src, 1, 1, RAW).image, 0, 0)).toEqual([200, 40, 40, 255]);
    expect(at(pixelize(src, 1, 1, { ...RAW, alpha: 200 }).image, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it('uses fractional coverage for a non-integer factor', () => {
    const grays = [0, 90, 180];
    const src = image(3, 1, (x) => [grays[x], grays[x], grays[x], 255]);
    const out = pixelize(src, 2, 1, RAW).image;
    expect(at(out, 0, 0)).toEqual([30, 30, 30, 255]);
    expect(at(out, 1, 0)).toEqual([150, 150, 150, 255]);
  });
});

describe('pixelize: background and fit', () => {
  const disc = image(100, 100, (x, y) => (Math.hypot(x - 50, y - 50) < 30 ? [200, 30, 30, 255] : [255, 255, 255, 255]));

  it('removes a flat background touching the corners', () => {
    const { image: out, notes } = pixelize(disc, 10, 10, { fit: 'stretch' });
    expect(at(out, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(at(out, 5, 5)).toEqual([200, 30, 30, 255]);
    expect(notes.some((n) => n.startsWith('background #ffffff removed'))).toBe(true);
    expect(at(pixelize(disc, 10, 10, { fit: 'stretch', background: 'keep' }).image, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(at(pixelize(disc, 10, 10, { fit: 'stretch', background: '#00ff00' }).image, 0, 0)).toEqual([255, 255, 255, 255]);
  });

  it('leaves an image that already has transparency alone', () => {
    const src = image(10, 10, (x, y) => (x === 0 && y === 0 ? CLEAR : [255, 255, 255, 255]));
    const { image: out } = pixelize(src, 10, 10, { fit: 'stretch', cleanup: false });
    expect(at(out, 5, 0)).toEqual([255, 255, 255, 255]);
  });

  const bar = image(300, 300, (x, y) => (x >= 50 && x < 250 && y >= 100 && y < 200 ? [40, 60, 200, 255] : CLEAR));

  it('contain crops to the opaque box, keeps the aspect ratio and centers', () => {
    const { image: out, notes } = pixelize(bar, 16, 16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) expect(at(out, x, y)[3]).toBe(y >= 4 && y < 12 ? 255 : 0);
    expect(notes).toContain('cropped to 200×100 opaque area');
  });

  it('cover fills the target and stretch maps the whole image', () => {
    const cover = pixelize(bar, 16, 16, { fit: 'cover' }).image;
    for (let i = 3; i < cover.data.length; i += 4) expect(cover.data[i]).toBe(255);
    const stretch = pixelize(bar, 6, 6, { fit: 'stretch' }).image;
    expect(at(stretch, 0, 0)[3]).toBe(0);
    expect(at(stretch, 3, 3)[3]).toBe(255);
  });
});

describe('pixelize: colors, cleanup, outline', () => {
  it('quantizes to at most the colors asked for', () => {
    const src = image(64, 64, (x, y) => [x * 4, y * 4, (x * y) % 256, 255]);
    const { image: out, palette, notes } = pixelize(src, 32, 32, { background: 'keep', fit: 'stretch', colors: 8 });
    expect(distinct(out)).toBeLessThanOrEqual(8);
    expect(palette.length).toBe(distinct(out));
    expect(notes.some((n) => /^quantized from \d+ to [2-8] colors$/.test(n))).toBe(true);
  });

  const square = (center: RGBA, lone = true) =>
    image(16, 16, (x, y) => {
      if (lone && x === 1 && y === 1) return [220, 20, 20, 255];
      if (x === 8 && y === 8) return center;
      return x >= 6 && x <= 10 && y >= 6 && y <= 10 ? [40, 160, 60, 255] : CLEAR;
    });

  it('removes a lone pixel and fills a hole', () => {
    const src = square(CLEAR);
    const clean = pixelize(src, 16, 16, { ...RAW, cleanup: true });
    expect(at(clean.image, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(at(clean.image, 8, 8)).toEqual([40, 160, 60, 255]);
    expect(clean.notes).toContain('cleanup: 1 lone pixel removed, 1 hole filled');
    const raw = pixelize(src, 16, 16, RAW).image;
    expect(at(raw, 1, 1)).toEqual([220, 20, 20, 255]);
    expect(at(raw, 8, 8)).toEqual([0, 0, 0, 0]);
  });

  it('merges a close speck but keeps a high-contrast detail', () => {
    const opts = { ...RAW, cleanup: true };
    expect(at(pixelize(square([50, 150, 70, 255], false), 16, 16, opts).image, 8, 8)).toEqual([40, 160, 60, 255]);
    expect(at(pixelize(square([10, 10, 10, 255], false), 16, 16, opts).image, 8, 8)).toEqual([10, 10, 10, 255]);
  });

  it('keeps 1-pixel diagonal lines', () => {
    const rod = image(16, 16, (x, y) => (x === y ? [120, 80, 40, 255] : CLEAR));
    const rodOut = pixelize(rod, 16, 16, { ...RAW, cleanup: true }).image;
    for (let k = 0; k < 16; k++) expect(at(rodOut, k, k)).toEqual([120, 80, 40, 255]);
    const blade = image(16, 16, (x, y) => (x === y ? [220, 228, 235, 255] : [170, 180, 190, 255]));
    const bladeOut = pixelize(blade, 16, 16, { ...RAW, cleanup: true }).image;
    for (let k = 0; k < 16; k++) expect(at(bladeOut, k, k)).toEqual([220, 228, 235, 255]);
  });

  it('draws a 1-pixel outline inside the target', () => {
    const src = image(32, 32, (x, y) => (x >= 8 && x < 24 && y >= 8 && y < 24 ? [90, 120, 200, 255] : CLEAR));
    const { image: out, notes } = pixelize(src, 16, 16, { outline: '#101010' });
    expect(at(out, 0, 5)).toEqual([16, 16, 16, 255]);
    expect(at(out, 15, 5)).toEqual([16, 16, 16, 255]);
    expect(at(out, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(at(out, 5, 5)).toEqual([90, 120, 200, 255]);
    expect(notes).toContain('outline #101010 (56 pixels)');
    const auto = pixelize(src, 16, 16, { outline: 'auto' }).image;
    const edge = at(auto, 0, 5) as RGBA;
    expect(perceptualLightness(edge)).toBeLessThan(perceptualLightness([90, 120, 200, 255]));
  });
});

describe('pixelize: contract', () => {
  it('is deterministic', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256);
    const src = image(90, 70, () => [rand(), rand(), rand(), 255]);
    const a = pixelize(src, 20, 20, { colors: 6, outline: 'auto' });
    const b = pixelize(src, 20, 20, { colors: 6, outline: 'auto' });
    expect(b.image.data).toEqual(a.image.data);
    expect(b.palette).toEqual(a.palette);
    expect(b.notes).toEqual(a.notes);
  });

  it('validates its options', () => {
    const src = image(4, 4, () => [1, 2, 3, 255]);
    expect(() => pixelize(src, 0, 16)).toThrow(/width must be an integer from 1 to 512/);
    expect(() => pixelize(src, 16, 513)).toThrow(/height/);
    expect(() => pixelize(src, 1.5, 16)).toThrow(/width/);
    expect(() => pixelize(src, 16, 16, { colors: 1 })).toThrow(/colors/);
    expect(() => pixelize(src, 16, 16, { colors: 65 })).toThrow(/colors/);
    expect(() => pixelize(src, 16, 16, { alpha: 0 })).toThrow(/alpha/);
    expect(() => pixelize(src, 16, 16, { background: '#zzz' })).toThrow(/background/);
    expect(() => pixelize(src, 16, 16, { outline: 'red' })).toThrow(/outline/);
    expect(() => pixelize(src, 16, 16, { fit: 'fill' as 'cover' })).toThrow(/fit/);
    expect(() => pixelize({ width: 4, height: 4, data: new Uint8ClampedArray(3) }, 16, 16)).toThrow(/source/);
  });

  it('turns a 160×160 sword render into a 16×16 item that round-trips through a spec', () => {
    let seed = 11;
    const grain = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 7) - 3;
    const sword = image(160, 160, (x, y) => {
      const t = x - y, d = x + y - 160;
      if (t >= -60 && t <= 120 && Math.abs(d) <= 3) return [232, 238, 242, 255];
      if (t >= -60 && t <= 120 && Math.abs(d) <= 10) return [184, 196, 204, 255];
      if (t >= -75 && t < -60 && Math.abs(d) <= 30) return [200, 154, 42, 255];
      if (t >= -120 && t < -75 && Math.abs(d) <= 7) return [107, 68, 35, 255];
      if (t >= -135 && t < -120 && Math.abs(d) <= 11) return [200, 154, 42, 255];
      const g = 252 + grain();
      return [g, g, g, 255];
    });
    const result = pixelize(sword, 16, 16, { outline: 'auto' });
    expect(result.notes.some((n) => n.startsWith('background #'))).toBe(true);
    expect(at(result.image, 0, 0)[3]).toBe(0);
    expect(at(result.image, 15, 15)[3]).toBe(0);
    expect(result.palette.length).toBeGreaterThan(2);
    expect(result.palette.length).toBeLessThanOrEqual(17);
    const opaque = result.image.data.filter((_, i) => i % 4 === 3 && result.image.data[i] === 255).length;
    expect(opaque).toBeGreaterThan(20);
    expect(opaque).toBeLessThan(200);

    const { spec } = textureToSpec(result.image, 'Sword', 'item');
    const compiled = compile(spec);
    expect(compiled.ok).toBe(true);
    expect([...compiled.texture.data]).toEqual([...result.image.data]);
  });
});
