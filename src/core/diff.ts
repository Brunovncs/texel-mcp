import { type Rig, refName, rigFor, texel } from './layout';
import type { Image, Model } from './types';

export interface FaceChange {
  face: string;
  changed: number;
  total: number;
}

export interface TextureDiff {
  changedPixels: number;
  faces: FaceChange[];
  /** Same size as the texture: changed pixels opaque magenta, unchanged transparent. */
  mask: Image;
}

/** Pixel-level diff of two textures, grouped by face, so an agent can verify a patch touched only what it meant to. */
export function diffTextures(before: Image, after: Image, model: Model | Rig): TextureDiff {
  const rig = typeof model === 'string' ? rigFor('player', model) : model;
  if (before.width !== after.width || before.height !== after.height) throw new Error(`the textures differ in size: ${before.width}×${before.height} and ${after.width}×${after.height}`);
  const mask: Image = { width: after.width, height: after.height, data: new Uint8ClampedArray(after.width * after.height * 4) };
  const faces: FaceChange[] = [];
  let changedPixels = 0;
  for (const ref of rig.refs()) {
    const r = rig.faceRect(ref.part, ref.face, ref.layer);
    let changed = 0;
    for (let ly = 0; ly < r.h; ly++)
      for (let lx = 0; lx < r.w; lx++) {
        const [x, y] = texel(r, lx, ly);
        const i = (y * after.width + x) * 4;
        const a = before.data, b = after.data;
        const same = a[i + 3] === 0 && b[i + 3] === 0 ? true : a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3];
        if (!same) {
          changed++;
          mask.data.set([255, 0, 255, 255], i);
        }
      }
    if (changed) faces.push({ face: refName(ref), changed, total: r.w * r.h });
    changedPixels += changed;
  }
  faces.sort((a, b) => b.changed - a.changed);
  return { changedPixels, faces, mask };
}

export function diffToMarkdown(d: TextureDiff): string {
  if (!d.changedPixels) return 'No pixels changed.';
  return [`${d.changedPixels} pixel(s) changed across ${d.faces.length} face(s):`, ...d.faces.map((f) => `- \`${f.face}\`: ${f.changed}/${f.total}`)].join('\n');
}
