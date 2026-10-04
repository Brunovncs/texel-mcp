import { describe, expect, it } from 'vitest';
import { compile, faceRect, parseSelector, polish, resolveColor, review, tone, type SkinSpec } from '../src/core';

const base = (layers: SkinSpec['layers'], extra: Partial<SkinSpec> = {}): SkinSpec => ({ version: 1, layers, ...extra });
const at = (spec: SkinSpec, x: number, y: number) => {
  const d = compile(spec).texture.data;
  const i = (y * 64 + x) * 4;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
};
const codes = (spec: SkinSpec) => review(compile(spec)).issues.map((i) => i.code);
const L = (c: number[]) => (Math.max(c[0], c[1], c[2]) + Math.min(c[0], c[1], c[2])) / 2;

describe('tones', () => {
  it('steps lighter-warmer and darker-cooler', () => {
    const blue = resolveColor('#3060c0', {});
    const up = resolveColor('c~1', { c: '#3060c0' }), down = resolveColor('c~-2', { c: '#3060c0' });
    expect(blue.ok && up.ok && down.ok).toBe(true);
    if (!blue.ok || !up.ok || !down.ok) return;
    expect(L(up.color)).toBeGreaterThan(L(blue.color));
    expect(L(down.color)).toBeLessThan(L(blue.color));
    expect(tone([128, 128, 128, 255], 1)[0]).toBe(tone([128, 128, 128, 255], 1)[2]);
  });
});

describe('regions', () => {
  it('paints named rows on the parts they belong to', () => {
    const spec = base([{ op: 'fill', target: 'all', color: '#808080' }, { op: 'rect', target: 'all', region: 'belt', color: '#ff0000' }]);
    const body = faceRect('body', 'front', 'base', 'classic');
    expect(at(spec, body.x, body.y + 8)).toEqual([255, 0, 0, 255]);
    expect(at(spec, body.x, body.y + 7)).toEqual([128, 128, 128, 255]);
    const arm = faceRect('rightArm', 'front', 'base', 'classic');
    expect(at(spec, arm.x, arm.y + 8)).toEqual([128, 128, 128, 255]);
  });

  it('covers the cap face for hands and shoes', () => {
    const spec = base([{ op: 'fill', target: 'all', color: '#808080' }, { op: 'rect', target: 'legs', region: 'shoes', color: '#0000ff' }]);
    const bottom = faceRect('rightLeg', 'bottom', 'base', 'classic');
    expect(at(spec, bottom.x, bottom.y)).toEqual([0, 0, 255, 255]);
  });

  it('reports unknown regions and regions that miss', () => {
    expect(codes(base([{ op: 'rect', target: 'body', region: 'bellt', color: '#fff' }]))).toContain('bad-region');
    expect(codes(base([{ op: 'fill', target: 'all', color: '#888' }, { op: 'rect', target: 'head', region: 'shoes', color: '#fff' }]))).toContain('region-miss');
  });
});

describe('high-level ops', () => {
  const wizard = base(
    [
      { op: 'material', target: 'all', color: 'skin', kind: 'skin' },
      { op: 'material', target: 'body+arms', color: 'robe', kind: 'fabric' },
      { op: 'material', target: 'legs', region: 'boots', color: '#4a3324', kind: 'leather' },
      { op: 'face', skin: 'skin', eyes: '#3a6fd9', beard: 'full', beardColor: '#d8d8d8' },
      { op: 'hair', color: '#d8d8d8', style: 'long' },
      { op: 'lighting' },
    ],
    { palette: { skin: '#e0ac7e', robe: '#2f4fb0' } },
  );

  it('compile clean and score well on the art checks', () => {
    const r = review(compile(wizard));
    expect(r.issues.filter((i) => i.level !== 'info')).toEqual([]);
    expect(r.art.score).toBeGreaterThanOrEqual(85);
    expect(r.art.checks.find((c) => c.id === 'depth')!.score).toBe(1);
  });

  it('puts the eyes on row 4 with white outside the iris', () => {
    const face = faceRect('head', 'front', 'base', 'classic');
    expect(at(wizard, face.x + 1, face.y + 4)).toEqual([236, 238, 240, 255]);
    expect(at(wizard, face.x + 2, face.y + 4)).toEqual([58, 111, 217, 255]);
    expect(at(wizard, face.x + 5, face.y + 4)).toEqual([58, 111, 217, 255]);
  });

  it('lighting leaves the face alone and darkens the bottom of limbs', () => {
    const lit = compile(wizard), flat = compile({ ...wizard, layers: wizard.layers.slice(0, -1) });
    const face = faceRect('head', 'front', 'base', 'classic');
    const arm = faceRect('rightArm', 'front', 'base', 'classic');
    const px = (r: typeof lit, x: number, y: number) => [...r.texture.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];
    expect(px(lit, face.x + 2, face.y + 4)).toEqual(px(flat, face.x + 2, face.y + 4));
    expect(L(px(lit, arm.x, arm.y + 11))).toBeLessThan(L(px(flat, arm.x, arm.y + 11)));
  });

  it('rejects unknown options with a suggestion', () => {
    const r = review(compile(base([{ op: 'hair', color: '#000', style: 'shrot' } as never])));
    const issue = r.issues.find((i) => i.code === 'bad-option');
    expect(issue?.hint).toContain('short');
  });
});

describe('art checks and polish', () => {
  const flat = base([
    { op: 'fill', target: 'all', color: '#c08a5a' },
    { op: 'fill', target: 'body+arms', color: '#3a5bd9' },
    { op: 'fill', target: 'legs', color: '#3a5bd9' },
  ]);

  it('flag a flat, faceless skin', () => {
    const art = review(compile(flat)).art;
    expect(art.score).toBeLessThan(40);
    for (const id of ['face', 'texture', 'depth']) expect(art.checks.find((c) => c.id === id)!.score).toBeLessThan(0.6);
  });

  it('keep a skin with a weak check under 90, and measure the arms against the torso', () => {
    // Everything one blue: the face, light and texture are fine, the silhouette is not.
    const blob = base([
      { op: 'material', target: 'all', color: '#3a6ea5', kind: 'fabric' },
      { op: 'face', skin: '#3a6ea5', eyes: '#f0f0f0' },
      { op: 'lighting' },
      { op: 'rect', target: 'head@overlay', y: 0, h: 2, color: '#2a4e85' },
    ]);
    const art = review(compile(blob)).art;
    const r3 = art.checks.find((c) => c.rubric === 'R3')!;
    expect(r3.score).toBeLessThan(0.6);
    expect(r3.note).toContain('arms↔body');
    expect(art.score).toBeLessThanOrEqual(89);
  });

  it('polish adds lighting without the model', () => {
    const p = polish(flat);
    expect(p.applied).toContain('lighting');
    expect(review(compile(p.spec)).art.score).toBeGreaterThan(review(compile(flat)).art.score);
    expect(p.spec.layers.every((l) => !l.id || l.id.startsWith('polish-') || flat.layers.includes(l))).toBe(true);
  });

  it('polish textures faces that stay flat', () => {
    const lit = base([...flat.layers, { op: 'lighting', strength: 0 }]);
    expect(polish(lit).applied).toContain('texture');
  });

  it('polish fills transparent base pixels', () => {
    const p = polish(base([{ op: 'fill', target: 'body', color: '#3a5bd9' }]));
    expect(p.applied).toContain('base');
    expect(review(compile(p.spec)).issues.some((i) => i.code === 'base-transparent')).toBe(false);
  });
});

describe('traps a model falls into', () => {
  it('fill honours the area like rect', () => {
    const spec = base([{ op: 'fill', target: 'all', color: '#808080' }, { op: 'fill', target: 'head.sides@overlay', y: 0, h: 3, color: '#000000' }]);
    const front = faceRect('head', 'front', 'overlay', 'classic');
    expect(at(spec, front.x, front.y + 2)).toEqual([0, 0, 0, 255]);
    expect(at(spec, front.x, front.y + 3)[3]).toBe(0);
  });

  it('flags a face hidden under a hood filled over the whole head, and polish uncovers it', () => {
    const hooded = base([
      { op: 'fill', target: 'all', color: '#c08a5a' },
      { op: 'face', skin: '#c08a5a', eyes: '#2244aa' },
      { op: 'fill', target: 'head@overlay', color: '#2f4fb0' },
    ]);
    expect(codes(hooded)).toContain('face-hidden');
    const fixed = polish(hooded);
    expect(fixed.applied).toContain('face');
    expect(codes(fixed.spec)).not.toContain('face-hidden');
  });

  it('lets a visor with its own colors cover the face', () => {
    const visor = base([
      { op: 'fill', target: 'all', color: '#c08a5a' },
      { op: 'face', skin: '#c08a5a', eyes: '#2244aa' },
      { op: 'fill', target: 'head@overlay', color: '#eeeeee' },
      { op: 'fill', target: 'head.front@overlay', y: 2, h: 4, color: '#203040' },
    ]);
    expect(codes(visor)).not.toContain('face-hidden');
  });
});

describe('forgiving colors', () => {
  it('reads near-miss tone steps instead of failing the layer', () => {
    const spec = base([{ op: 'fill', target: 'all', color: 'armor-1' }], { palette: { armor: '#7080a0', armorLight: 'armor+1', coatish: 'armor:' } });
    const r = review(compile(spec));
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(r.issues.filter((i) => i.code === 'color-guess')).toHaveLength(3);
    const steps = resolveColor('armor~-1', { armor: '#7080a0' });
    expect(steps.ok && at(spec, 8, 8).slice(0, 3)).toEqual(steps.ok && steps.color.slice(0, 3));
  });

  it('still rejects a key that is really missing', () => {
    expect(codes(base([{ op: 'fill', target: 'all', color: 'nope-1' }]))).toContain('bad-color');
  });
});

describe('selectors and legends models write', () => {
  it('reads whole selectors joined with + as a union, carrying a trailing layer', () => {
    const r = parseSelector('head.right+head.back@overlay');
    expect(r.ok && r.refs.map((x) => `${x.part}.${x.face}@${x.layer}`)).toEqual(['head.right@overlay', 'head.back@overlay']);
    const u = parseSelector('body.sides+arms.sides');
    expect(u.ok && u.refs.length).toBe(12);
    const classic = parseSelector('head.top+back');
    expect(classic.ok && classic.refs.length).toBe(2);
    expect(parseSelector('hed.front+body.front').ok).toBe(false);
  });

  it('reads a part after a face as a new piece, and refuses a layer on an earlier piece only', () => {
    const r = parseSelector('head.front+body');
    expect(r.ok && r.refs.map((x) => `${x.part}.${x.face}`)).toEqual(['head.front', 'body.top', 'body.bottom', 'body.right', 'body.front', 'body.left', 'body.back']);
    expect(parseSelector('arms.front@overlay+legs.front')).toMatchObject({ ok: false, hint: expect.stringContaining('["arms.front@overlay","legs.front"]') });
    expect(parseSelector('arms.front@overlay+legs.front@base').ok).toBe(true);
  });

  it('ignores a reserved legend character instead of dropping the layer', () => {
    const spec = base([{ op: 'fill', target: 'all', color: '#888888' }, { op: 'pixels', target: 'head.front', y: 4, rows: ['.E....E.'], legend: { '.': '#ffffff', E: '#2244aa' } }]);
    expect(codes(spec)).toContain('legend-reserved');
    expect(codes(spec)).not.toContain('bad-legend');
    const face = faceRect('head', 'front', 'base', 'classic');
    expect(at(spec, face.x + 1, face.y + 4)).toEqual([34, 68, 170, 255]);
  });
});

describe('material kinds models write', () => {
  it('reads near words as the closest kind instead of dropping the layer', () => {
    const spec = base([{ op: 'material', target: 'all', color: '#7a5c3e', kind: 'feathers' } as never]);
    expect(codes(spec)).toContain('kind-guess');
    expect(codes(spec)).not.toContain('bad-option');
    expect(review(compile(spec)).issues.some((i) => i.code === 'base-transparent')).toBe(false);
    expect(codes(base([{ op: 'material', target: 'all', color: '#7a5c3e', kind: 'zzz' } as never]))).toContain('bad-option');
  });
});
