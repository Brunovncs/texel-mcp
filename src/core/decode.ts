import type { Image } from './types.js';

/** Largest side accepted; callers check the exact skin size. */
const MAX_SIDE = 512;

/**
 * Minimal PNG decoder for skin files: non-interlaced, bit depth 8 for truecolor/grayscale,
 * 1–8 for palette images. `inflate` must accept a zlib stream (e.g. node:zlib inflateSync).
 */
export interface DecodeOptions {
  /** Largest side accepted, in pixels. Default 512 (skins and textures); reference images may allow more. */
  maxSide?: number;
}

export function decodePNG(bytes: Uint8Array, inflate: (data: Uint8Array) => Uint8Array, { maxSide = MAX_SIDE }: DecodeOptions = {}): Image {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!sig.every((b, i) => bytes[i] === b)) throw new Error('not a PNG file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  for (let o = 8; o < bytes.length; ) {
    const len = view.getUint32(o);
    const kind = String.fromCharCode(...bytes.subarray(o + 4, o + 8));
    const data = bytes.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR') {
      width = view.getUint32(o + 8);
      height = view.getUint32(o + 12);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    o += 12 + len;
  }
  // Before anything is allocated from the header: a forged IHDR could otherwise ask for gigabytes.
  if (!width || !height || width > maxSide || height > maxSide) throw new Error(`PNG is ${width}×${height}; at most ${maxSide}×${maxSide} is accepted here`);
  if (interlace) throw new Error('interlaced PNGs are not supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error(`unsupported PNG color type ${type}`);
  if (type !== 3 && depth !== 8) throw new Error(`unsupported bit depth ${depth} (only 8-bit truecolor/grayscale)`);

  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of idat) {
    joined.set(c, off);
    off += c.length;
  }
  const raw = inflate(joined);
  const bitsPerPixel = channels * depth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const pixels = new Uint8Array(stride * height);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 255;
    }
    pixels.set(cur, y * stride);
    prev = cur;
  }

  const key = trns && (type === 0 || type === 2) ? Array.from({ length: type === 0 ? 1 : 3 }, (_, c) => (trns[c * 2] << 8) | trns[c * 2 + 1]) : null;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const row = y * stride;
      if (type === 3) {
        const bit = x * depth;
        const idx = (pixels[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        out[o] = palette?.[idx * 3] ?? 0;
        out[o + 1] = palette?.[idx * 3 + 1] ?? 0;
        out[o + 2] = palette?.[idx * 3 + 2] ?? 0;
        out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
        continue;
      }
      const i = row + x * channels;
      // tRNS on a truecolor or grayscale image names one 16-bit sample value that is transparent.
      if (type === 6) out.set(pixels.subarray(i, i + 4), o);
      else if (type === 2) out.set([pixels[i], pixels[i + 1], pixels[i + 2], key && pixels[i] === key[0] && pixels[i + 1] === key[1] && pixels[i + 2] === key[2] ? 0 : 255], o);
      else if (type === 0) out.set([pixels[i], pixels[i], pixels[i], key && pixels[i] === key[0] ? 0 : 255], o);
      else out.set([pixels[i], pixels[i], pixels[i], pixels[i + 1]], o);
    }
  return { width, height, data: out };
}
