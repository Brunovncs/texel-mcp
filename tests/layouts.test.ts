import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compile, diffTextures, LAYOUT_IDS, LAYOUTS, layoutsToMarkdown, polish, renderLineup, renderSheet, renderView, review, rigFor, textureToSpec, viewsOf, type SkinSpec } from '../src/core';

const spec = (layout: string, layers: SkinSpec['layers'], extra: Partial<SkinSpec> = {}): SkinSpec => ({ version: 1, layout, layers, ...extra });
const px = (img: { width: number; data: Uint8ClampedArray }, x: number, y: number) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

describe('layouts', () => {
  it('match the Java 1.21 texture UVs', () => {
    const rect = (layout: string, part: string, face: 'front' | 'top' | 'right', layer: 'base' | 'overlay' = 'base') => rigFor(layout).faceRect(part, face, layer);
    expect(rect('zombie', 'rightArm', 'front')).toEqual({ x: 44, y: 20, w: 4, h: 12 });
    expect(rect('zombie', 'head', 'front', 'overlay')).toEqual({ x: 40, y: 8, w: 8, h: 8 });
    expect(rect('drowned', 'leftArm', 'front')).toEqual({ x: 36, y: 52, w: 4, h: 12 });
    expect(rect('drowned', 'leftLeg', 'front')).toEqual({ x: 20, y: 52, w: 4, h: 12 });
    expect(rect('humanoid', 'rightLeg', 'front')).toEqual({ x: 4, y: 20, w: 4, h: 12 });
    expect(rect('skeleton', 'rightArm', 'front')).toEqual({ x: 42, y: 18, w: 2, h: 12 });
    expect(rect('skeleton', 'rightLeg', 'right')).toEqual({ x: 0, y: 18, w: 2, h: 12 });
    expect(rect('creeper', 'leg', 'front')).toEqual({ x: 4, y: 20, w: 4, h: 6 });
    expect(rect('enderman', 'limb', 'front')).toEqual({ x: 58, y: 2, w: 2, h: 30 });
    expect(rect('enderman', 'head', 'front', 'overlay')).toEqual({ x: 8, y: 24, w: 8, h: 8 });
    expect(rect('spider', 'body', 'front')).toEqual({ x: 12, y: 24, w: 10, h: 8 });
    expect(rect('spider', 'leg', 'front')).toEqual({ x: 20, y: 2, w: 16, h: 2 });
    expect(rect('villager', 'jacket', 'front')).toEqual({ x: 6, y: 44, w: 8, h: 20 });
    expect(rect('villager', 'head', 'front')).toEqual({ x: 8, y: 8, w: 8, h: 10 });
    expect(rect('cape', 'cape', 'front')).toEqual({ x: 1, y: 1, w: 10, h: 16 });
    expect(rect('cape', 'elytra', 'front')).toEqual({ x: 24, y: 2, w: 10, h: 20 });
    expect(rect('item', 'item', 'front')).toEqual({ x: 0, y: 0, w: 16, h: 16 });
  });

  it('keep every face inside the texture, and base faces apart', () => {
    for (const id of LAYOUT_IDS) {
      const rig = rigFor(id);
      const seen = new Map<number, string>();
      for (const ref of rig.refs()) {
        const r = rig.faceRect(ref.part, ref.face, ref.layer);
        expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= rig.width && r.y + r.h <= rig.height, `${id} ${ref.part}.${ref.face}@${ref.layer}`).toBe(true);
        if (ref.layer !== 'base') continue;
        for (let y = r.y; y < r.y + r.h; y++)
          for (let x = r.x; x < r.x + r.w; x++) {
            const k = y * rig.width + x;
            expect(seen.get(k), `${id}: ${ref.part}.${ref.face} overlaps ${seen.get(k)}`).toBeUndefined();
            seen.set(k, `${ref.part}.${ref.face}`);
          }
      }
    }
  });

  it('compile, review, render and polish every layout', () => {
    for (const id of LAYOUT_IDS) {
      const s = spec(id, [{ op: 'fill', target: 'all', color: '#6f8f4e' }, { op: 'material', target: 'all', color: '#6f8f4e', kind: 'stone' }, { op: 'lighting' }]);
      const c = compile(s);
      expect(c.ok, `${id}: ${JSON.stringify(c.issues)}`).toBe(true);
      expect([c.texture.width, c.texture.height]).toEqual(LAYOUTS[id].size);
      const r = review(c);
      expect(r.stats.layout).toBe(id);
      expect(r.art.score).toBeGreaterThan(0);
      for (const v of viewsOf(c.rig)) expect(renderView(c.texture, c.rig, v).width).toBeGreaterThan(0);
      expect(renderSheet(c.texture, c.rig).image.width).toBeGreaterThan(0);
      expect(() => polish(s)).not.toThrow();
    }
  });

  it('resolve aliases and reject unknown layouts', () => {
    expect(compile(spec('husk', [{ op: 'fill', target: 'all', color: '#555' }])).layout).toBe('zombie');
    expect(compile(spec('armor', [{ op: 'fill', target: 'head', color: '#555' }])).texture.height).toBe(32);
    const bad = compile(spec('dragon', [{ op: 'fill', target: 'all', color: '#555' }]));
    expect(bad.issues.find((i) => i.code === 'bad-layout')).toBeTruthy();
    expect(bad.layout).toBe('player');
  });

  it('explain parts and faces a layout does not have', () => {
    const left = compile(spec('zombie', [{ op: 'fill', target: 'leftArm', color: '#555' }]));
    expect(left.issues[0]).toMatchObject({ code: 'bad-selector' });
    expect(left.issues[0].hint).toMatch(/rightArm/);
    expect(compile(spec('item', [{ op: 'fill', target: 'item.top', color: '#555' }])).issues[0]).toMatchObject({ code: 'bad-selector' });
    expect(compile(spec('creeper', [{ op: 'fill', target: 'all@overlay', color: '#555' }])).issues[0]).toMatchObject({ code: 'bad-selector' });
    expect(compile(spec('item', [{ op: 'face', skin: '#c08060', eyes: '#222' }])).issues[0]).toMatchObject({ code: 'op-unsupported' });
    expect(compile(spec('creeper', [{ op: 'fill', target: 'all', color: '#3a3' }, { op: 'hair', color: '#222' }])).ok).toBe(true);
    expect(compile(spec('zombie', [{ op: 'fill', target: 'all', color: '#555' }], { model: 'slim' })).issues[0]).toMatchObject({ code: 'model-ignored' });
    expect(compile(spec('creeper', [{ op: 'mirror', from: 'head', to: 'leg' }])).issues[0]).toMatchObject({ code: 'bad-part' });
  });

  it('draw mirrored limbs flipped in the views', () => {
    const c = compile(spec('zombie', [{ op: 'fill', target: 'all', color: '#404040' }, { op: 'rect', target: 'rightArm.front', w: 1, color: '#ff0000' }]));
    const front = renderView(c.texture, c.rig, 'front');
    expect(front.width).toBe(16);
    expect(px(front, 0, 12)).toEqual([255, 0, 0, 255]); // right arm, its column 0 on the viewer's left
    expect(px(front, 15, 12)).toEqual([255, 0, 0, 255]); // mirrored left arm: the same column on the far right
    expect(px(front, 12, 12)).toEqual([64, 64, 64, 255]);
  });

  it('keeps designed transparency in items and armor', () => {
    const item = compile(spec('item', [{ op: 'pixels', target: 'item', x: 7, y: 2, rows: ['A', 'A', 'B'], legend: { A: '#c0c0c0', B: '#6b4a2b' } }]));
    const r = review(item);
    expect(r.issues.find((i) => i.code === 'base-transparent')).toBeUndefined();
    expect(px(renderView(item.texture, item.rig, 'front'), 0, 0)[3]).toBe(0);
    expect(viewsOf(item.rig)).toEqual(['front']);
    expect(review(compile(spec('item', []))).issues.find((i) => i.code === 'empty')).toBeTruthy();
    expect(review(compile(spec('creeper', [{ op: 'fill', target: 'head', color: '#3a3' }]))).issues.find((i) => i.code === 'base-transparent')).toBeTruthy();
  });

  it('import a texture back into an equivalent spec for any layout', () => {
    for (const id of ['zombie', 'skeleton', 'cape', 'item', 'villager']) {
      const c = compile(spec(id, [{ op: 'noise', target: 'all', colors: ['#aa3333', '#33aa33', '#3333aa'], density: 1, seed: 7 }]));
      const back = textureToSpec(c.texture, id, id);
      expect(back.spec.layout).toBe(id);
      const again = compile(back.spec);
      expect(diffTextures(c.texture, again.texture, c.rig).changedPixels, id).toBe(0);
    }
    expect(() => textureToSpec(compile(spec('item', [])).texture, 'x', 'zombie')).toThrow(/64×64/);
  });

  it('render a lineup that mixes layouts', () => {
    const members = ['player', 'item', 'creeper'].map((id) => compile(spec(id, [{ op: 'fill', target: 'all', color: '#888' }])));
    expect(renderLineup(members, 3).width).toBeGreaterThan(0);
  });

  it('stay in sync with the spec reference table', () => {
    const doc = readFileSync('content/docs/spec.md', 'utf8');
    const table = /<!-- layouts:start -->\n([\s\S]*?)\n<!-- layouts:end -->/.exec(doc)?.[1];
    expect(table).toBe(layoutsToMarkdown());
  });
});

describe('hostile specs', () => {
  it('never hang or throw', () => {
    const t0 = Date.now();
    const line = compile({ version: 1, layers: [{ op: 'line', target: 'head.front', from: [1e17, 0], to: [0, 0], color: '#fff' }] });
    expect(line.issues[0]).toMatchObject({ code: 'out-of-range' });
    expect(Date.now() - t0).toBeLessThan(1000);
    for (const raw of [
      { version: 1, layers: [{ op: 'toString' }] },
      { version: 1, layers: [{ op: 'fill', target: 'constructor', color: '#fff' }] },
      { version: 1, layers: [{ op: 'fill', target: 'head.constructor', color: '#fff' }] },
      { version: 1, layers: [{ op: 'material', target: 'all', color: '#fff', kind: 'constructor' }] },
      { version: 1, layout: 'constructor', layers: [] },
      { version: 1, layout: '__proto__', layers: [] },
    ])
      expect(() => review(compile(raw))).not.toThrow();
  });
});
