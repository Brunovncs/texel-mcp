import { readFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { compile, encodePNG, faceRect, formatSpec, locate, parseSelector, resolveColor, review, type SkinSpec } from '../src/core';

const px = (spec: SkinSpec | string, x: number, y: number) => {
  const d = compile(spec).texture.data;
  const i = (y * 64 + x) * 4;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
};

const base = (layers: SkinSpec['layers'], extra: Partial<SkinSpec> = {}): SkinSpec => ({ version: 1, layers, ...extra });

describe('layout', () => {
  it('matches the vanilla UV map', () => {
    expect(faceRect('head', 'front', 'base', 'classic')).toEqual({ x: 8, y: 8, w: 8, h: 8 });
    expect(faceRect('head', 'front', 'overlay', 'classic')).toEqual({ x: 40, y: 8, w: 8, h: 8 });
    expect(faceRect('body', 'back', 'base', 'classic')).toEqual({ x: 32, y: 20, w: 8, h: 12 });
    expect(faceRect('rightArm', 'front', 'base', 'slim')).toEqual({ x: 44, y: 20, w: 3, h: 12 });
    expect(faceRect('leftLeg', 'top', 'base', 'classic')).toEqual({ x: 20, y: 48, w: 4, h: 4 });
    expect(faceRect('leftArm', 'front', 'overlay', 'classic')).toEqual({ x: 52, y: 52, w: 4, h: 12 });
  });

  it('locates texels back to faces', () => {
    expect(locate(9, 12, 'classic')).toMatchObject({ part: 'head', face: 'front', layer: 'base', x: 1, y: 4 });
    expect(locate(0, 0, 'classic')).toBeNull();
  });
});

describe('selectors and colors', () => {
  it('expands groups, faces and layers', () => {
    const r = parseSelector('arms.sides@both');
    expect(r.ok && r.refs.length).toBe(16);
    const bad = parseSelector('hed.front');
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.hint).toContain('head');
  });

  it('resolves palette chains and lightness shifts', () => {
    const palette = { a: '#808080', b: 'a:+10' };
    const r = resolveColor('b', palette);
    expect(r.ok && r.color[0]).toBeGreaterThan(128);
    expect(resolveColor('nope', palette).ok).toBe(false);
  });
});

describe('compile', () => {
  it('fills and clips per face with negative coordinates', () => {
    const spec = base([
      { op: 'fill', target: 'all', color: '#111' },
      { op: 'rect', target: 'legs.sides', y: -2, color: '#f00' },
    ]);
    const front = faceRect('rightLeg', 'front', 'base', 'classic');
    expect(px(spec, front.x, front.y + 10)).toEqual([255, 0, 0, 255]);
    expect(px(spec, front.x, front.y + 9)).toEqual([17, 17, 17, 255]);
  });

  it('draws pixel rows with legends, keep and erase', () => {
    const spec = base([
      { op: 'fill', target: 'head.front@overlay', color: '#fff' },
      { op: 'pixels', target: 'head.front@overlay', rows: ['A._'] },
    ], { legend: { A: '#00f' } });
    expect(px(spec, 40, 8)).toEqual([0, 0, 255, 255]);
    expect(px(spec, 41, 8)).toEqual([255, 255, 255, 255]);
    expect(px(spec, 42, 8)[3]).toBe(0);
  });

  it('mirrors limbs with left/right faces swapped', () => {
    const spec = base([
      { op: 'fill', target: 'all', color: '#000' },
      { op: 'points', target: 'rightArm.right', points: [[0, 0]], color: '#f00' },
      { op: 'mirror', from: 'rightArm', to: 'leftArm' },
    ]);
    const left = faceRect('leftArm', 'left', 'base', 'classic');
    expect(px(spec, left.x + left.w - 1, left.y)).toEqual([255, 0, 0, 255]);
  });

  it('reports errors without throwing and still renders valid layers', () => {
    const r = compile(base([{ op: 'fill', target: 'all', color: '#0f0' }, { op: 'fil', target: 'head', color: '#f00' } as never, { op: 'fill', target: 'head', color: 'missing' }]));
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['unknown-op', 'bad-color']));
    expect(r.issues.find((i) => i.code === 'unknown-op')?.hint).toContain('fill');
    expect(px(r.spec!, 8, 8)).toEqual([0, 255, 0, 255]);
  });

  it('handles invalid JSON text', () => {
    const r = compile('{ nope');
    expect(r.ok).toBe(false);
    expect(r.issues[0].code).toBe('bad-json');
  });

  it('is deterministic (noise is seeded)', () => {
    const spec = base([{ op: 'fill', target: 'all', color: '#888' }, { op: 'noise', target: 'all', jitter: 10 }]);
    expect(compile(spec).texture.data).toEqual(compile(spec).texture.data);
  });
});

describe('review', () => {
  it('flags transparent base pixels and blank faces', () => {
    const r = review(compile(base([{ op: 'fill', target: 'head', color: '#c90' }])));
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain('base-transparent');
    expect(codes).toContain('blank-face');
    expect(r.ascii.front.split('\n')).toHaveLength(32);
  });

  it('passes every bundled example without errors or warnings', () => {
    const index = JSON.parse(readFileSync('public/examples/index.json', 'utf8')).examples as { id: string }[];
    for (const { id } of index) {
      const r = review(compile(readFileSync(`public/examples/${id}.json`, 'utf8')));
      expect(r.issues.filter((i) => i.level !== 'info'), id).toEqual([]);
    }
  });
});

describe('png + format', () => {
  it('encodes a valid PNG', () => {
    const png = encodePNG(compile(base([{ op: 'fill', target: 'all', color: '#123456' }])).texture, (raw) => deflateSync(raw));
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(new TextDecoder().decode(png.slice(37, 41))).toBe('IDAT');
    const len = new DataView(png.buffer).getUint32(33);
    const raw = inflateSync(png.slice(41, 41 + len));
    expect(raw.length).toBe((64 * 4 + 1) * 64);
  });

  it('round-trips through the formatter', () => {
    const spec = JSON.parse(readFileSync('public/examples/knight.json', 'utf8'));
    expect(JSON.parse(formatSpec(spec))).toEqual(spec);
  });
});
