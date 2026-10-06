import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compile, diffTextures, issueCodesToMarkdown, LAYOUT_IDS, LAYOUTS, layoutsToMarkdown, polish, renderLineup, renderSheet, renderView, review, locate, rigFor, texel, textureToSpec, viewsOf, type SkinSpec } from '../src/core';

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
    expect(rect('piglin', 'head', 'front')).toEqual({ x: 8, y: 8, w: 10, h: 8 });
    expect(rect('piglin', 'snout', 'front')).toEqual({ x: 32, y: 2, w: 4, h: 4 });
    expect(rect('piglin', 'leftEar', 'right')).toEqual({ x: 51, y: 10, w: 4, h: 5 });
    expect(rect('pig', 'snout', 'front')).toEqual({ x: 17, y: 17, w: 4, h: 3 });
    expect(rect('pig', 'leg', 'front')).toEqual({ x: 4, y: 20, w: 4, h: 6 });
    expect(rect('cow', 'head', 'front')).toEqual({ x: 6, y: 6, w: 8, h: 8 });
    expect(rect('cow', 'muzzle', 'front')).toEqual({ x: 2, y: 34, w: 6, h: 3 });
    expect(rect('cold_cow', 'muzzle', 'front')).toEqual({ x: 10, y: 34, w: 6, h: 3 });
    expect(rect('sheep', 'head', 'front')).toEqual({ x: 8, y: 8, w: 6, h: 6 });
    expect(rect('sheep_wool', 'head', 'front')).toEqual({ x: 6, y: 6, w: 6, h: 6 });
    expect(rect('chicken', 'beak', 'front')).toEqual({ x: 16, y: 2, w: 4, h: 2 });
    expect(rect('wolf', 'snout', 'front')).toEqual({ x: 4, y: 14, w: 3, h: 3 });
    expect(rect('hoglin', 'head', 'front')).toEqual({ x: 80, y: 20, w: 14, h: 6 });
    expect(rect('hoglin', 'mane', 'right')).toEqual({ x: 90, y: 52, w: 19, h: 10 });
    expect(rigFor('hoglin').faces('mane')).toEqual(['right', 'left']);
    expect(rect('cold_chicken', 'crest', 'front')).toEqual({ x: 48, y: 4, w: 6, h: 3 });
    expect(rect('cat', 'head', 'front')).toEqual({ x: 5, y: 5, w: 5, h: 4 });
    expect(rect('cat', 'nose', 'front')).toEqual({ x: 2, y: 26, w: 3, h: 2 });
    expect(rect('iron_golem', 'body', 'front')).toEqual({ x: 11, y: 51, w: 18, h: 12 });
    expect(rect('iron_golem', 'leftArm', 'front')).toEqual({ x: 66, y: 64, w: 4, h: 30 });
    expect(rect('witch', 'brim', 'front')).toEqual({ x: 10, y: 74, w: 10, h: 2 });
    expect(rect('witch', 'mole', 'front')).toEqual({ x: 1, y: 1, w: 1, h: 1 });
  });

  it('match the Java texture UVs of the mobs added in 0.9.0', () => {
    // [layout, part, face, layer, [x, y, w, h]]: each from the model's texOffs and addBox in 1.21.11.
    const cases: [string, string, 'front' | 'top' | 'right', 'base' | 'overlay', [number, number, number, number]][] = [
      ['fox', 'head', 'front', 'base', [7, 11, 8, 6]],
      ['fox', 'snout', 'front', 'base', [9, 21, 4, 2]],
      ['rabbit', 'head', 'front', 'base', [37, 5, 5, 4]],
      ['rabbit', 'rightHindFoot', 'top', 'base', [15, 24, 2, 7]],
      ['bee', 'body', 'front', 'base', [10, 10, 7, 7]],
      ['bee', 'wing', 'top', 'base', [6, 18, 9, 6]],
      ['parrot', 'head', 'front', 'base', [4, 4, 2, 3]],
      ['parrot', 'feather', 'right', 'base', [2, 22, 4, 5]],
      ['axolotl', 'head', 'front', 'base', [5, 6, 8, 5]],
      ['axolotl', 'tail', 'right', 'base', [2, 31, 12, 5]],
      ['frog', 'head', 'front', 'base', [9, 22, 7, 3]],
      ['frog', 'leftFoot', 'top', 'base', [10, 32, 8, 8]],
      ['turtle', 'head', 'front', 'base', [9, 6, 6, 5]],
      ['turtle', 'rightFrontLeg', 'front', 'base', [32, 35, 13, 1]],
      ['armadillo', 'body', 'front', 'base', [12, 52, 8, 8]],
      ['armadillo', 'body', 'front', 'overlay', [12, 32, 8, 8]],
      ['bat', 'head', 'front', 'base', [2, 9, 4, 3]],
      ['bat', 'rightWingTip', 'front', 'base', [16, 0, 6, 8]],
      ['horse', 'head', 'front', 'base', [7, 20, 6, 5]],
      ['horse', 'body', 'top', 'base', [22, 32, 10, 22]],
      ['donkey', 'ear', 'front', 'base', [1, 13, 2, 7]],
      ['donkey', 'chest', 'front', 'base', [29, 24, 8, 8]],
      ['llama', 'head', 'front', 'base', [6, 20, 8, 18]],
      ['llama', 'leftChest', 'front', 'base', [48, 44, 8, 8]],
      ['camel', 'muzzle', 'front', 'base', [56, 6, 5, 5]],
      ['camel', 'body', 'top', 'base', [27, 25, 15, 27]],
      ['goat', 'head', 'front', 'base', [44, 56, 5, 7]],
      ['goat', 'coat', 'front', 'base', [11, 39, 11, 14]],
      ['panda', 'head', 'front', 'base', [9, 15, 13, 10]],
      ['panda', 'leg', 'right', 'base', [40, 6, 6, 9]],
      ['polar_bear', 'head', 'front', 'base', [7, 7, 7, 7]],
      ['polar_bear', 'mouth', 'front', 'base', [3, 47, 5, 3]],
      ['slime', 'innerCube', 'front', 'base', [6, 22, 6, 6]],
      ['slime', 'leftEye', 'front', 'base', [34, 6, 2, 2]],
      ['magma_cube', 'segment5', 'front', 'base', [40, 17, 8, 1]],
      ['magma_cube', 'insideCube', 'front', 'base', [28, 44, 4, 4]],
      ['blaze', 'rod', 'front', 'base', [2, 18, 2, 8]],
      ['ghast', 'body', 'front', 'base', [32, 32, 32, 32]],
      ['ghast', 'tentacle', 'right', 'base', [0, 4, 4, 24]],
      ['happy_ghast', 'body', 'top', 'base', [32, 0, 32, 32]],
      ['happy_ghast_baby', 'innerBody', 'front', 'base', [16, 48, 16, 16]],
      ['happy_ghast_harness', 'goggles', 'front', 'base', [10, 74, 32, 10]],
      ['phantom', 'wingTip', 'top', 'base', [25, 24, 13, 9]],
      ['phantom', 'head', 'front', 'base', [5, 5, 7, 3]],
      ['guardian', 'body', 'front', 'base', [16, 16, 12, 12]],
      ['guardian', 'fin', 'right', 'base', [25, 28, 9, 9]],
      ['shulker', 'head', 'front', 'base', [6, 58, 6, 6]],
      ['shulker', 'lid', 'front', 'base', [16, 16, 16, 12]],
      ['strider', 'leftLeg', 'front', 'base', [4, 59, 4, 16]],
      ['strider', 'middleBristle', 'front', 'base', [32, 49, 12, 16]],
      ['warden', 'head', 'front', 'base', [10, 42, 16, 16]],
      ['warden', 'ribcage', 'front', 'base', [90, 11, 9, 21]],
      ['illager', 'head', 'front', 'base', [8, 8, 8, 10]],
      ['illager', 'freeArm', 'front', 'base', [44, 50, 4, 12]],
      ['armor_stand', 'basePlate', 'top', 'base', [12, 32, 12, 12]],
      ['armor_stand', 'body', 'front', 'base', [3, 29, 12, 3]],
      ['snow_golem', 'head', 'front', 'base', [8, 8, 8, 8]],
      ['snow_golem', 'lowerBody', 'front', 'base', [12, 48, 12, 12]],
      ['allay', 'rightArm', 'front', 'base', [25, 2, 1, 4]],
      ['allay', 'wing', 'right', 'base', [16, 22, 8, 5]],
      ['vex', 'rightArm', 'front', 'base', [25, 2, 2, 4]],
      ['vex', 'lowerBody', 'front', 'base', [2, 18, 3, 5]],
      ['squid', 'body', 'front', 'base', [12, 12, 12, 16]],
      ['squid', 'tentacle', 'front', 'base', [50, 2, 2, 18]],
      ['dolphin', 'head', 'front', 'base', [6, 6, 8, 7]],
      ['dolphin', 'tailFin', 'top', 'base', [25, 20, 10, 6]],
      ['copper_golem', 'head', 'front', 'base', [10, 10, 8, 5]],
      ['copper_golem', 'rightArm', 'front', 'base', [40, 20, 3, 10]],
    ];
    for (const [layout, part, face, layer, [x, y, w, h]] of cases) expect(rigFor(layout).faceRect(part, face, layer), `${layout} ${part}.${face}@${layer}`).toMatchObject({ x, y, w, h });
  });

  it('keep both sides of a flat lying fin on their own texture faces', () => {
    // Cold chicken tail: texture box 0×3×5 at (38, 9), turned with the body. Turning about x keeps
    // the side faces on their side, though a box with no width has both at x = 0.
    const rig = rigFor('cold_chicken');
    expect(rig.faces('tail')).toEqual(['right', 'left']);
    const cells = (face: 'right' | 'left') => {
      const r = rig.faceRect('tail', face, 'base');
      const xs: number[] = [];
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) xs.push(texel(r, x, y)[0]);
      return [Math.min(...xs), Math.max(...xs)];
    };
    expect(cells('right')).toEqual([38, 42]);
    expect(cells('left')).toEqual([43, 47]);
  });

  it('skip parts cut by transparency in the opacity check', () => {
    const c = compile(spec('chicken', [{ op: 'fill', target: 'all', color: '#eeeeee' }, { op: 'clear', target: 'leg' }]));
    expect(review(c).issues.find((i) => i.code === 'base-transparent')).toBeUndefined();
    const hole = compile(spec('chicken', [{ op: 'fill', target: 'all', color: '#eeeeee' }, { op: 'clear', target: 'wing' }]));
    expect(review(hole).issues.find((i) => i.code === 'base-transparent')).toBeTruthy();
  });

  it('name a lying body\'s faces the way they face in game', () => {
    // Pig body: texture box 10×16×8 at (28, 8), turned 90° about x. Each face of the animal reads
    // from the texture face Java puts there: back → texture back, chest → top, rump → bottom, belly → front.
    const rig = rigFor('pig');
    const region = (face: 'top' | 'front' | 'back' | 'bottom' | 'right' | 'left') => {
      const r = rig.faceRect('body', face, 'base');
      const xs: number[] = [], ys: number[] = [];
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const [tx, ty] = texel(r, x, y); xs.push(tx); ys.push(ty); }
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1, size: [r.w, r.h] };
    };
    expect(region('top')).toEqual({ x: 54, y: 16, w: 10, h: 16, size: [10, 16] });
    expect(region('front')).toEqual({ x: 36, y: 8, w: 10, h: 8, size: [10, 8] });
    expect(region('back')).toEqual({ x: 46, y: 8, w: 10, h: 8, size: [10, 8] });
    expect(region('bottom')).toEqual({ x: 36, y: 16, w: 10, h: 16, size: [10, 16] });
    expect(region('right')).toEqual({ x: 28, y: 16, w: 8, h: 16, size: [16, 8] });
    expect(region('left')).toEqual({ x: 46, y: 16, w: 8, h: 16, size: [16, 8] });
    expect(rig.part('body')!.box).toEqual([10, 8, 16]);
    // The right side's top row (front on the viewer's right, as on every right face) is the texture
    // right face's first column, which runs from the head at its row 0 to the rump.
    const right = rig.faceRect('body', 'right', 'base');
    expect(texel(right, 15, 0)).toEqual([28, 16]);
    expect(texel(right, 0, 0)).toEqual([28, 31]);
    expect(texel(right, 15, 7)).toEqual([35, 16]);
    for (const ref of rig.refs()) {
      const r = rig.faceRect(ref.part, ref.face, ref.layer);
      for (const [x, y] of [[0, 0], [r.w - 1, 0], [0, r.h - 1], [r.w - 1, r.h - 1]]) expect(locate(...texel(r, x, y), rig)).toMatchObject({ ...ref, x, y });
    }
  });

  it('add a view from above for lying bodies only', () => {
    expect(viewsOf(rigFor('pig'))).toContain('top');
    expect(viewsOf(rigFor('creeper'))).not.toContain('top');
    expect(viewsOf(rigFor('player'))).not.toContain('top');
    const c = compile(spec('pig', [{ op: 'fill', target: 'all', color: '#f0a0a0' }, { op: 'fill', target: 'body.top', color: '#000000' }]));
    const top = renderView(c.texture, c.rig, 'top');
    // Snout to hind legs, head at the bottom: the back fills the middle of the view.
    expect([top.width, top.height]).toEqual([10, 24]);
    expect(px(top, 5, 6)).toEqual([0, 0, 0, 255]);
    expect(px(top, 5, 23)).toEqual([240, 160, 160, 255]);
  });

  it('paint a lying body by its in-game faces', () => {
    const c = compile(spec('pig', [{ op: 'fill', target: 'all', color: '#f0a0a0' }, { op: 'rect', target: 'body.top', y: 0, h: 1, color: '#000000' }]));
    expect(c.ok).toBe(true);
    // Row 0 of the back is at the rump: on the texture back face that is its last row, reversed.
    for (let x = 54; x < 64; x++) expect(px(c.texture, x, 31)).toEqual([0, 0, 0, 255]);
    expect(px(c.texture, 54, 16)).toEqual([240, 160, 160, 255]);
  });

  it('keep every face inside the texture, and base faces apart', () => {
    // Problems are collected and checked once: an expect per pixel of 69 layouts is slow.
    const problems = new Set<string>();
    for (const id of LAYOUT_IDS) {
      const rig = rigFor(id);
      const seen = new Map<number, string>();
      for (const ref of rig.refs()) {
        const r = rig.faceRect(ref.part, ref.face, ref.layer);
        for (let ly = 0; ly < r.h; ly++)
          for (let lx = 0; lx < r.w; lx++) {
            const [x, y] = texel(r, lx, ly);
            if (x < 0 || y < 0 || x >= rig.width || y >= rig.height) problems.add(`${id} ${ref.part}.${ref.face}@${ref.layer} leaves the texture`);
            // A few vanilla models share texture pixels between parts on purpose (a bee's antennae).
            if (ref.layer !== 'base' || rig.part(ref.part)?.shared) continue;
            const k = y * rig.width + x;
            if (seen.has(k)) problems.add(`${id}: ${ref.part}.${ref.face} overlaps ${seen.get(k)}`);
            seen.set(k, `${ref.part}.${ref.face}`);
          }
      }
    }
    expect([...problems]).toEqual([]);
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
  }, 30_000);

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
    const doc = readFileSync('docs/spec.md', 'utf8');
    const table = /<!-- layouts:start -->\n([\s\S]*?)\n<!-- layouts:end -->/.exec(doc)?.[1];
    expect(table).toBe(layoutsToMarkdown());
    const codes = /<!-- codes:start -->\n([\s\S]*?)\n<!-- codes:end -->/.exec(doc)?.[1];
    expect(codes, 'regenerate the issue code tables in docs/spec.md').toBe(issueCodesToMarkdown());
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
