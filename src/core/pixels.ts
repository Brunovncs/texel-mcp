import { type Rig, texel } from './layout';
import type { FaceRef, Image, PartFace, RGBA } from './types';

/**
 * Reading a texture face by face. Rows and columns are face-local (row 0 at the top of the face as
 * seen from outside the model), so checks never deal with UVs or turned parts themselves.
 */

/** Pixel rows of a face: `rows[y][x]`. */
export type FacePixels = RGBA[][];

export function pixelAt(tex: Image, x: number, y: number): RGBA {
  const i = (y * tex.width + x) * 4;
  return [tex.data[i], tex.data[i + 1], tex.data[i + 2], tex.data[i + 3]];
}

/** One layer of one face. */
export function readFaceLayer(tex: Image, rig: Rig, ref: FaceRef): FacePixels {
  const r = rig.faceRect(ref.part, ref.face, ref.layer);
  return Array.from({ length: r.h }, (_, y) => Array.from({ length: r.w }, (_, x) => pixelAt(tex, ...texel(r, x, y))));
}

/** A face as seen in game: overlay pixels over base ones. */
export function readVisibleFace(tex: Image, rig: Rig, { part, face }: PartFace): FacePixels {
  const base = readFaceLayer(tex, rig, { part, face, layer: 'base' });
  if (!rig.hasLayer(part, 'overlay')) return base;
  const over = readFaceLayer(tex, rig, { part, face, layer: 'overlay' });
  return base.map((row, y) => row.map((p, x) => (over[y][x][3] > 0 ? over[y][x] : p)));
}

/** Reads the faces of one texture, each at most once. Treat the returned rows as read-only. */
export interface FaceReader {
  readonly texture: Image;
  readonly rig: Rig;
  visible(face: PartFace): FacePixels;
}

export function createFaceReader(texture: Image, rig: Rig): FaceReader {
  const cache = new Map<string, FacePixels>();
  return {
    texture,
    rig,
    visible(face) {
      const key = `${face.part}.${face.face}`;
      let rows = cache.get(key);
      if (!rows) cache.set(key, (rows = readVisibleFace(texture, rig, face)));
      return rows;
    },
  };
}
