import type { CompileResult } from './compile.js';
import type { Animation, Image } from './types.js';

/**
 * The files a compiled texture becomes in game. Most layouts are one PNG; block layouts are one
 * per part (oak_log.png and oak_log_top.png); an animated texture is a vertical strip of its
 * distinct frames with a .png.mcmeta, or one PNG per frame for particles; what glows goes to a
 * matching `_eyes` PNG. Names are suffixes on the caller's file name.
 */
export interface TextureFile {
  /** Appended to the file name before ".png": "", "_top", "_eyes", "_0"… */
  suffix: string;
  image: Image;
  /** The .png.mcmeta beside it (animation, GUI scaling), if any. */
  mcmeta?: Record<string, unknown>;
  /** The animation frame a particle sprite shows. */
  frame?: number;
}

export function crop(img: Image, x: number, y: number, w: number, h: number): Image {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) data.set(img.data.subarray(((y + row) * img.width + x) * 4, ((y + row) * img.width + x + w) * 4), row * w * 4);
  return { width: w, height: h, data };
}

function stack(frames: Image[]): Image {
  const { width, height } = frames[0];
  const data = new Uint8ClampedArray(width * height * 4 * frames.length);
  frames.forEach((f, i) => data.set(f.data, i * width * height * 4));
  return { width, height: height * frames.length, data };
}

const same = (a: Image, b: Image) => a.data.length === b.data.length && a.data.every((v, i) => v === b.data[i]);
const hasPixels = (img: Image) => img.data.some((v, i) => i % 4 === 3 && v > 0);

/** Distinct frames in order of first use, and which of them each frame shows. */
export function distinctFrames(frames: readonly Image[]): { unique: Image[]; order: number[] } {
  const unique: Image[] = [];
  const order = frames.map((f) => {
    const at = unique.findIndex((u) => same(u, f));
    if (at >= 0) return at;
    unique.push(f);
    return unique.length - 1;
  });
  return { unique, order };
}

/** The "animation" section of a .png.mcmeta: frames listed only when the strip alone can't say it. */
export function animationMeta(animation: Animation, order: readonly number[]): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (animation.frametime && animation.frametime !== 1) meta.frametime = animation.frametime;
  if (animation.interpolate) meta.interpolate = true;
  const timed = animation.frames.some((f) => f.time !== undefined);
  if (timed || order.some((index, i) => index !== i)) meta.frames = order.map((index, i) => (animation.frames[i].time !== undefined ? { index, time: animation.frames[i].time } : index));
  return meta;
}

export function textureFiles(c: CompileResult): TextureFile[] {
  const def = c.rig.def;
  const pieces: { suffix: string; cut: (img: Image) => Image }[] = def.files
    ? Object.entries(def.files).map(([part, suffix]) => {
        const r = c.rig.faceRect(part, 'front', 'base');
        return { suffix, cut: (img: Image) => crop(img, r.x, r.y, r.w, r.h) };
      })
    : [{ suffix: '', cut: (img: Image) => img }];
  const animation = c.spec?.animation;
  const frames = c.frames && animation && def.animated ? c.frames : null;
  const out: TextureFile[] = [];
  for (const piece of pieces) {
    const still = piece.cut(c.texture);
    const gui = c.gui ? { gui: { scaling: c.gui } } : undefined;
    if (frames && def.animated === 'sprites') {
      frames.forEach((f, i) => out.push({ suffix: `${piece.suffix}_${i}`, image: piece.cut(f), frame: i, ...(gui ? { mcmeta: gui } : {}) }));
    } else if (frames) {
      const { unique, order } = distinctFrames(frames.map(piece.cut));
      if (unique.length === 1) out.push({ suffix: piece.suffix, image: unique[0], ...(gui ? { mcmeta: gui } : {}) });
      else out.push({ suffix: piece.suffix, image: stack(unique), mcmeta: { animation: animationMeta(animation!, order), ...gui } });
    } else out.push({ suffix: piece.suffix, image: still, ...(gui ? { mcmeta: gui } : {}) });
    if (c.emissive) {
      const glow = piece.cut(c.emissive);
      if (hasPixels(glow)) out.push({ suffix: `${piece.suffix}_eyes`, image: glow });
    }
  }
  return out;
}

/** "skin.png" + "_top" → "skin_top.png". */
export function withSuffix(file: string, suffix: string): string {
  const dot = /\.png$/i.test(file) ? file.length - 4 : file.length;
  return `${file.slice(0, dot)}${suffix}.png`;
}
