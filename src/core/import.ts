import { toHex } from './color.js';
import { refName, resolveLayout, rigFor, texel } from './layout.js';
import type { Image, Model, Op, RGBA, SkinSpec } from './types.js';

const LEGEND_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&*+-/:;<=>?@^~|';

/** k-means in RGB, used only when a skin has more colors than the legend alphabet. */
function quantize(colors: RGBA[], k: number): (c: RGBA) => RGBA {
  let centers = colors.filter((_, i) => i % Math.ceil(colors.length / k) === 0).slice(0, k).map((c) => [...c] as RGBA);
  const nearest = (c: RGBA) => {
    let best = 0, bestDist = Infinity;
    centers.forEach((m, i) => {
      const d = (m[0] - c[0]) ** 2 + (m[1] - c[1]) ** 2 + (m[2] - c[2]) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };
  for (let iter = 0; iter < 8; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const c of colors) {
      const s = sums[nearest(c)];
      s[0] += c[0];
      s[1] += c[1];
      s[2] += c[2];
      s[3]++;
    }
    centers = centers.map((m, i) => (sums[i][3] ? [Math.round(sums[i][0] / sums[i][3]), Math.round(sums[i][1] / sums[i][3]), Math.round(sums[i][2] / sums[i][3]), 255] : m));
  }
  return (c) => centers[nearest(c)];
}

export interface ImportResult {
  spec: SkinSpec;
  /** True when colors were quantized to fit the legend alphabet. */
  lossy: boolean;
  legacy: boolean;
}

/**
 * Convert a decoded texture into an equivalent spec with one layer per painted face. Without a
 * layout it reads a player skin (64×64, or legacy 64×32) and detects classic/slim from the unused
 * slim-arm columns; with one ("zombie", "item"…) the image must be that layout's size.
 */
export function textureToSpec(image: Image, name = 'Imported skin', layoutId?: string): ImportResult {
  const def = resolveLayout(layoutId);
  if (!def) throw new Error(`unknown layout "${layoutId}"`);
  const player = def.id === 'player';
  if (player ? image.width !== 64 || (image.height !== 64 && image.height !== 32) : image.width !== def.size[0] || image.height !== def.size[1])
    throw new Error(player ? `expected a 64×64 or 64×32 skin, got ${image.width}×${image.height}` : `the ${def.id} layout is ${def.size[0]}×${def.size[1]}, got ${image.width}×${image.height}`);
  const legacy = player && image.height === 32;
  const at = (x: number, y: number): RGBA => {
    if (y >= image.height) return [0, 0, 0, 0];
    const i = (y * image.width + x) * 4;
    return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3] < 128 ? 0 : 255];
  };
  let slim = player && !legacy;
  for (let y = 20; y < 32 && slim; y++) for (let x = 54; x < 56; x++) if (at(x, y)[3]) slim = false;
  const model: Model = slim ? 'slim' : 'classic';
  const rig = rigFor(def, model);

  const unique = new Map<string, RGBA>();
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const c = at(x, y);
      if (c[3]) unique.set(toHex(c), c);
    }
  const lossy = unique.size > LEGEND_ALPHABET.length;
  const map = lossy ? quantize([...unique.values()], LEGEND_ALPHABET.length) : (c: RGBA) => c;

  const palette: Record<string, string> = {};
  const legend: Record<string, string> = {};
  const charOf = new Map<string, string>();
  const charFor = (c: RGBA) => {
    const hex = toHex(map(c));
    let ch = charOf.get(hex);
    if (!ch) {
      ch = LEGEND_ALPHABET[charOf.size];
      charOf.set(hex, ch);
      const key = `c${String(charOf.size).padStart(2, '0')}`;
      palette[key] = hex;
      legend[ch] = key;
    }
    return ch;
  };

  const layers: Op[] = [];
  for (const ref of rig.refs()) {
    if (legacy && (ref.part === 'leftArm' || ref.part === 'leftLeg' || (ref.layer === 'overlay' && ref.part !== 'head'))) continue;
    const r = rig.faceRect(ref.part, ref.face, ref.layer);
    const rows: string[] = [];
    let painted = false;
    for (let y = 0; y < r.h; y++) {
      let row = '';
      for (let x = 0; x < r.w; x++) {
        const c = at(...texel(r, x, y));
        if (c[3]) painted = true;
        row += c[3] ? charFor(c) : '.';
      }
      rows.push(row);
    }
    if (!painted) continue;
    const flat = rows.join('');
    const target = refName(ref);
    layers.push(new Set(flat).size === 1 && !flat.includes('.') ? { op: 'fill', target, color: legend[flat[0]] } : { op: 'pixels', target, rows });
  }
  if (legacy) layers.push({ op: 'mirror', from: 'rightArm', to: 'leftArm' }, { op: 'mirror', from: 'rightLeg', to: 'leftLeg' });

  return {
    spec: {
      version: 1,
      name,
      description: `Imported from a PNG${lossy ? ` (quantized from ${unique.size} to ${LEGEND_ALPHABET.length} colors)` : ''}${legacy ? ' (legacy 64×32 layout, limbs mirrored)' : ''}. Rename palette keys to describe materials before editing.`,
      ...(player ? { model } : { layout: def.id }),
      palette,
      legend,
      layers,
    },
    lossy,
    legacy,
  };
}
