import type { FaceName, FaceRef, LayerName, Model, PartName, Rect } from './types';

export const SKIN_SIZE = 64;
export const PARTS: readonly PartName[] = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];
export const FACES: readonly FaceName[] = ['top', 'bottom', 'right', 'front', 'left', 'back'];
export const LAYERS: readonly LayerName[] = ['base', 'overlay'];

/** Top-left UV origin of each box in the 64x64 texture. */
const UV: Record<LayerName, Record<PartName, [number, number]>> = {
  base: { head: [0, 0], body: [16, 16], rightArm: [40, 16], leftArm: [32, 48], rightLeg: [0, 16], leftLeg: [16, 48] },
  overlay: { head: [32, 0], body: [16, 32], rightArm: [40, 32], leftArm: [48, 48], rightLeg: [0, 32], leftLeg: [0, 48] },
};

/** Box size as [width, height, depth] in skin pixels. */
export function boxSize(part: PartName, model: Model): [number, number, number] {
  if (part === 'head') return [8, 8, 8];
  if (part === 'body') return [8, 12, 4];
  if ((part === 'rightArm' || part === 'leftArm') && model === 'slim') return [3, 12, 4];
  return [4, 12, 4];
}

/** Texture rectangle of one face. Local (0,0) is the top-left of the face as seen from outside the model. */
export function faceRect(part: PartName, face: FaceName, layer: LayerName, model: Model): Rect {
  const [u, v] = UV[layer][part];
  const [w, h, d] = boxSize(part, model);
  switch (face) {
    case 'top':
      return { x: u + d, y: v, w, h: d };
    case 'bottom':
      return { x: u + d + w, y: v, w, h: d };
    case 'right':
      return { x: u, y: v + d, w: d, h };
    case 'front':
      return { x: u + d, y: v + d, w, h };
    case 'left':
      return { x: u + d + w, y: v + d, w: d, h };
    case 'back':
      return { x: u + 2 * d + w, y: v + d, w, h };
  }
}

export function allFaceRefs(): FaceRef[] {
  const refs: FaceRef[] = [];
  for (const layer of LAYERS) for (const part of PARTS) for (const face of FACES) refs.push({ part, face, layer });
  return refs;
}

export function refName(ref: FaceRef): string {
  return `${ref.part}.${ref.face}${ref.layer === 'overlay' ? '@overlay' : ''}`;
}

export interface Location extends FaceRef {
  x: number;
  y: number;
}

/** Reverse lookup: which face (and local coordinate) owns a texture pixel. Null for unused pixels. */
export function locate(tx: number, ty: number, model: Model): Location | null {
  for (const ref of allFaceRefs()) {
    const r = faceRect(ref.part, ref.face, ref.layer, model);
    if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return { ...ref, x: tx - r.x, y: ty - r.y };
  }
  return null;
}
