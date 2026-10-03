import { describe, expect, it } from 'vitest';
import {
  boxEdges,
  compile,
  craftAdvice,
  extractPalette,
  newImage,
  renderCloseUp,
  resolveParts,
  review,
  reviewToMarkdown,
  rgbToHsl,
  rigFor,
  shiftLightness,
  shiftTone,
  referencePalette,
  tone,
  type Op,
  type RGBA,
} from '../src/core';

const skin = (layers: Op[]) => compile({ version: 1, layers });
const codes = (layers: Op[]) => {
  const c = skin(layers);
  return craftAdvice(c.texture, c.rig).map((a) => a.code);
};
const VOLUMES = 'body.sides+legs.sides+arms.sides';

describe('box edges', () => {
  it('pair the pixels that touch across each of the twelve edges', () => {
    const edges = boxEdges(rigFor('player'), 'head');
    expect(edges).toHaveLength(12);
    expect(edges.reduce((n, e) => n + e.pairs.length, 0)).toBe(12 * 8);
    // head.front's column 0 is the character's right edge: it meets head.right's last column.
    const side = edges.find((e) => e.faces.join() === 'right,front')!;
    expect(side.pairs).toContainEqual({ a: [7, 3], b: [0, 3] });
    // The back of head.top (row 0) meets the top row of head.back.
    const top = edges.find((e) => e.faces.join() === 'top,back')!;
    expect(top.pairs.every(({ a, b }) => a[1] === 0 && b[1] === 0)).toBe(true);
  });

  it('follow a lying body and skip planes', () => {
    const body = boxEdges(rigFor('pig'), 'body');
    expect(body).toHaveLength(12);
    // The pig's back (body.top) meets its rump (body.back) along body.top's row 0.
    expect(body.find((e) => e.faces.join() === 'top,back')!.pairs.every(({ a }) => a[1] === 0)).toBe(true);
    expect(boxEdges(rigFor('hoglin'), 'mane')).toEqual([]);
    expect(boxEdges(rigFor('item'), 'item')).toEqual([]);
  });
});

describe('craft advice', () => {
  const base: Op[] = [{ op: 'fill', target: 'all', color: '#6f8f4e' }];

  it('finds a band that stops at the corner, not one that wraps around', () => {
    expect(codes([...base, { op: 'rect', target: 'body.front', y: 8, h: 2, color: '#3a2a1a' }])).toContain('edge-mismatch');
    expect(codes([...base, { op: 'rect', target: 'body.front+sides', y: 8, h: 2, color: '#3a2a1a' }])).not.toContain('edge-mismatch');
  });

  it('finds faces darker on every edge than in the middle', () => {
    const pillow: Op[] = [
      { op: 'fill', target: 'all', color: '#3d5a2a' },
      { op: 'rect', target: 'body.front+back', x: 1, y: 1, w: 6, h: 10, color: '#8fb86a' },
      { op: 'rect', target: 'legs.sides+arms.sides+body.right+left', x: 1, y: 1, w: 2, h: 10, color: '#8fb86a' },
    ];
    expect(codes(pillow)).toContain('pillow-shading');
    expect(codes([...base, { op: 'lighting' }])).not.toContain('pillow-shading');
  });

  it('finds shadows that only get darker, and accepts tone steps', () => {
    const red = '#c03030';
    expect(codes([{ op: 'fill', target: 'all', color: red }, { op: 'rect', target: VOLUMES, y: -6, color: `${red}:-15` }])).toContain('unshifted-shadows');
    expect(codes([{ op: 'fill', target: 'all', color: red }, { op: 'rect', target: VOLUMES, y: -6, color: `${red}~-2` }])).not.toContain('unshifted-shadows');
  });

  it('finds per-pixel static, not smooth texture', () => {
    expect(codes([...base, { op: 'noise', target: 'all', jitter: 25, seed: 3 }])).toContain('confetti-noise');
    expect(codes([...base, { op: 'gradient', target: VOLUMES, from: '#8fb86a', to: '#3d5a2a' }])).not.toContain('confetti-noise');
  });

  it('never changes a score and shows in the review', () => {
    const plain = review(skin([...base, { op: 'lighting' }]));
    const banded = review(skin([...base, { op: 'lighting' }, { op: 'rect', target: 'body.front', y: 8, h: 2, color: '#3a2a1a' }]));
    expect(banded.art.advice.map((a) => a.code)).toContain('edge-mismatch');
    expect(banded.score).toBe(plain.score);
    expect(reviewToMarkdown(banded)).toContain('### Craft advice');
    expect(banded.next.some((n) => n.startsWith('edge-mismatch:'))).toBe(true);
  });

  it('names the faces and edges structurally', () => {
    const c = skin([...base, { op: 'rect', target: 'body.front', y: 8, h: 2, color: '#3a2a1a' }]);
    const edge = craftAdvice(c.texture, c.rig).find((a) => a.code === 'edge-mismatch')!;
    expect(edge.faces).toContainEqual({ part: 'body', face: 'front' });
    expect(edge.edges).toContainEqual({ part: 'body', faces: ['right', 'front'], rows: [8, 9] });
  });

  it('ignores a face whose border is transparent', () => {
    const c = compile({ version: 1, layout: 'villager', layers: [{ op: 'fill', target: 'body+jacket+leg+arm', color: '#6f8f4e' }, { op: 'clear', target: 'jacket', y: -2 }] });
    expect(craftAdvice(c.texture, c.rig).map((a) => a.code)).not.toContain('pillow-shading');
  });

  it('keeps a hue-shifted red ramp in one family across 0°', () => {
    const ramp: Op[] = [{ op: 'fill', target: 'all', color: '#d03a30' }, { op: 'rect', target: VOLUMES, y: -6, color: '#d03a30~-2' }];
    expect(codes(ramp)).not.toContain('unshifted-shadows');
  });

  it('stays quiet on flat layouts', () => {
    const c = compile({ version: 1, layout: 'item', layers: [{ op: 'noise', target: 'item', colors: ['#ff0000', '#00ff00'], density: 1, seed: 1 }] });
    expect(craftAdvice(c.texture, c.rig)).toEqual([]);
  });
});

describe('tone shifts', () => {
  it('drift hue like a tone ramp: shadows cooler, light warmer, grays untouched', () => {
    const red: RGBA = [192, 48, 48, 255];
    const hue = (c: RGBA) => rgbToHsl(c)[0] * 360;
    expect(hue(shiftTone(red, -15))).toBeGreaterThan(300);
    expect(hue(shiftTone(red, 15))).toBeGreaterThan(0);
    expect(hue(shiftTone(red, 15))).toBeLessThan(60);
    expect(shiftTone([128, 128, 128, 255], -15)).toEqual(shiftLightness([128, 128, 128, 255], -15));
    expect(shiftTone(red, 0)).toBe(red);
  });

  it('leave tone steps exactly as they were', () => {
    // 0.6.0's tone(): hue moves |step| × 0.012 of a turn, lightness step × 0.09.
    expect(tone([192, 48, 48, 255], -3)).toEqual([88, 14, 30, 255]);
    expect(tone([60, 140, 90, 255], 2)).toEqual([107, 185, 125, 255]);
  });
});

describe('palette from an image', () => {
  const image = () => {
    const img = newImage(20, 20);
    for (let i = 0; i < 400; i++) {
      const c: RGBA = i < 280 ? (i % 2 ? [236, 236, 232, 255] : [228, 228, 224, 255]) : i < 380 ? [40, 70, 160, 255] : [220, 30, 40, 255];
      img.data.set(c, i * 4);
    }
    return img;
  };

  it('keeps the main colors, merges near duplicates and finds the accent', () => {
    const swatches = extractPalette(image(), { colors: 3 });
    expect(swatches.map((s) => s.role)).toEqual(['neutral', 'midtone', 'accent']);
    expect(swatches[0].share).toBeCloseTo(0.7, 2);
    expect(swatches[2].color).toBe('#dc1e28');
    expect(extractPalette(image(), { colors: 3 })).toEqual(swatches);
  });

  it('turns swatches into a palette and legend', () => {
    const { entries, palette, legend } = referencePalette(extractPalette(image(), { colors: 3 }));
    expect(entries.map((e) => [e.key, e.char])).toEqual([['neutral1', 'A'], ['midtone1', 'B'], ['accent1', 'C']]);
    expect(Object.keys(palette)).toEqual(['neutral1', 'midtone1', 'accent1']);
    expect(legend).toEqual({ A: 'neutral1', B: 'midtone1', C: 'accent1' });
    expect(compile({ version: 1, palette, legend, layers: [{ op: 'fill', target: 'all', color: 'neutral1' }] }).ok).toBe(true);
  });

  it('ignores transparent pixels and falls back on a bad color count', () => {
    expect(extractPalette(newImage(4, 4))).toEqual([]);
    expect(extractPalette(image(), { colors: NaN })).toEqual(extractPalette(image()));
  });
});

describe('focus sheet', () => {
  it('resolves parts and groups, with a hint for typos', () => {
    expect(resolveParts(rigFor('player'), ['arms'])).toEqual({ ok: true, parts: ['rightArm', 'leftArm'] });
    expect(resolveParts(rigFor('player'), ['legs+head'])).toEqual({ ok: true, parts: ['head', 'rightLeg', 'leftLeg'] });
    expect(resolveParts(rigFor('player'), ['hed'])).toMatchObject({ ok: false, hint: expect.stringContaining('head') });
  });

  it('draws the parts alone from all six sides', () => {
    const c = skin([{ op: 'fill', target: 'all', color: '#888888' }, { op: 'fill', target: 'head.bottom', color: '#ff0000' }]);
    const { image, layout } = renderCloseUp(c.texture, c.rig, ['head']);
    expect(layout.panels.map((p) => p.name)).toEqual(['front', 'back', 'right', 'left', 'top', 'bottom']);
    expect(layout.panels.every((p) => p.w === layout.panels[0].w && p.h === layout.panels[0].h)).toBe(true);
    const bottom = layout.panels[5];
    const i = ((bottom.y + 2) * image.width + bottom.x + 2) * 4;
    expect([...image.data.subarray(i, i + 4)]).toEqual([255, 0, 0, 255]);
  });

  it('draws nothing for a part without a box', () => {
    const c = compile({ version: 1, layout: 'villager', layers: [{ op: 'fill', target: 'all', color: '#888888' }] });
    expect(renderCloseUp(c.texture, c.rig, ['hatRim']).layout.panels).toEqual([]);
  });

  it('keeps the selector hints', () => {
    expect(resolveParts(rigFor('zombie'), ['leftArm'])).toMatchObject({ ok: false, hint: expect.stringContaining('rightArm') });
  });
});
