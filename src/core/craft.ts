import { COOL_HUE, deltaE, perceptualLightness, rgbToHsl } from './color.js';
import { boxEdges, FACES, type FaceEdge, type Rig } from './layout.js';
import { createFaceReader, type FacePixels, type FaceReader } from './pixels.js';
import { FACE_GROUPS } from './selector.js';
import { mean, stdDev } from './stats.js';
import type { FaceName, Image, PartFace, PartName, RGBA } from './types.js';

/**
 * Craft advice: detectors for classic pixel-art mistakes (pillow shading, shadows that only get
 * darker, confetti noise, details that stop at a cube corner). Each names the faces and the op
 * that fixes it. Advice never changes the health or the art score: a deliberate style can trip any
 * of them, and none has been checked against human judgment yet.
 */

export const CRAFT_ADVICE_CODES = ['pillow-shading', 'unshifted-shadows', 'confetti-noise', 'edge-mismatch'] as const;
export type CraftAdviceCode = (typeof CRAFT_ADVICE_CODES)[number];

/** A detail that stops at a vertical cube edge: the edge, and the rows where it breaks. */
export interface EdgeBreak {
  part: PartName;
  faces: readonly [FaceName, FaceName];
  rows: number[];
}

export interface CraftAdvice {
  code: CraftAdviceCode;
  /** The faces where it shows. */
  faces: PartFace[];
  /** For `edge-mismatch`, the edges in question. */
  edges?: EdgeBreak[];
  message: string;
  hint: string;
}

const PILLOW = {
  /** Every border at least this much darker (L*) than the inside… */
  borderDrop: 8,
  /** …and the borders together at least this much. */
  rimDrop: 10,
  minFaces: 2,
} as const;

const SHADOWS = {
  /** Below this HSL saturation a pixel is a gray, with no hue to shift. */
  minSaturation: 0.15,
  /** Pixels within this many degrees of a family's center hue belong to it. */
  familyRadius: 40,
  minPixels: 8,
  /** L* between the darker and lighter halves: closer is texture, farther apart is two materials. */
  minSpread: 10,
  maxSpread: 30,
  /** Degrees a shadow should drift toward blue for its shading to count as hue-shifted. */
  minShift: 1.5,
  /** Blues sit at the cool end of the ramp already: their shadows have nowhere cooler to go. */
  nearCool: 25,
  minFaces: 3,
  minShare: 0.4,
} as const;

const CONFETTI = {
  /** Faces with less L* spread than this are smooth, whatever their neighbors do. */
  minStdDev: 5,
  /** Mean neighbor difference over standard deviation: about 1.13 for independent pixels, well under 1 for clusters. */
  ratio: 0.95,
  minFaces: 3,
  minShare: 0.25,
} as const;

const EDGES = {
  /** ΔE at which two pixels are different colors rather than tones of one texture. */
  different: 18,
  /** Share of the edge that must continue around the corner for a break to be a stray detail. */
  minContinuous: 0.6,
  /** Consecutive breaking rows; single pixels are texture noise. */
  minRun: 2,
  minPairs: 4,
} as const;

/** Faces smaller than this have no inside to compare against. */
const MIN_FACE_SIDE = 4;
/** Share of opaque pixels a face needs before its texture is judged. */
const MIN_COVERAGE = 0.75;
const SIDE_FACES = FACE_GROUPS.sides;
const COOL_DEGREES = COOL_HUE * 360;

/** A face the texture detectors judge: its visible pixels and their L* (null where transparent). */
interface MeasuredFace {
  ref: PartFace;
  pixels: FacePixels;
  lightness: (number | null)[][];
}

export function craftAdvice(texture: Image, rig: Rig, reader: FaceReader = createFaceReader(texture, rig)): CraftAdvice[] {
  const faces = measuredFaces(reader);
  return [pillowShading(faces), unshiftedShadows(faces), confettiNoise(faces), edgeMismatch(reader)].filter((a): a is CraftAdvice => a !== null);
}

/**
 * The side faces of every volume, as seen in game. A character's face is left out (eyes and a mouth
 * are high-contrast on purpose), and so are flat layouts, which have no volumes to shade.
 */
function measuredFaces({ rig, visible }: FaceReader): MeasuredFace[] {
  const out: MeasuredFace[] = [];
  for (const part of rig.parts) {
    if (rig.faces(part).length !== FACES.length) continue;
    for (const face of SIDE_FACES) {
      if (rig.def.character && part === 'head' && face === 'front') continue;
      const pixels = visible({ part, face });
      if (pixels.length < MIN_FACE_SIDE || pixels[0].length < MIN_FACE_SIDE) continue;
      const opaque = pixels.flat().filter((p) => p[3] > 0).length;
      if (opaque / (pixels.length * pixels[0].length) < MIN_COVERAGE) continue;
      out.push({ ref: { part, face }, pixels, lightness: pixels.map((row) => row.map((p) => (p[3] > 0 ? perceptualLightness(p) : null))) });
    }
  }
  return out;
}

const defined = (values: (number | null)[]): number[] => values.filter((v): v is number => v !== null);
const faceName = ({ part, face }: PartFace) => `${part}.${face}`;

/** Pillow shading: every edge of a face darker than its middle, a cushion lit from the front instead of a form lit from above. */
function pillowShading(faces: MeasuredFace[]): CraftAdvice | null {
  const hits = faces.filter(({ lightness: l }) => {
    const h = l.length, w = l[0].length;
    const borders = [l[0], l[h - 1], l.map((row) => row[0]), l.map((row) => row[w - 1])].map((edge) => mean(defined(edge)));
    const inside = mean(defined(l.slice(1, -1).flatMap((row) => row.slice(1, -1))));
    // A border or an inside with no opaque pixel has nothing to compare.
    if (![...borders, inside].every(Number.isFinite)) return false;
    return borders.every((b) => b <= inside - PILLOW.borderDrop) && inside - mean(borders) >= PILLOW.rimDrop;
  });
  if (hits.length < PILLOW.minFaces) return null;
  const refs = hits.map((f) => f.ref);
  return {
    code: 'pillow-shading',
    faces: refs,
    message: `${hits.length} face(s) are darker on every edge than in the middle (pillow shading): ${formatList(refs.map(faceName))}`,
    hint: 'shade by direction instead: lighter top rows, darker bottom rows and inner sides ({ "op": "lighting" } does this); keep dark outlines for the silhouette, not for every face',
  };
}

const hueOf = (p: RGBA) => rgbToHsl(p)[0] * 360;
/** Signed hue difference b − a in degrees, in [−180, 180). */
const hueDelta = (a: number, b: number) => ((b - a + 540) % 360) - 180;
const hueDistance = (a: number, b: number) => Math.abs(hueDelta(a, b));

/** Hue of a group's mean color, in degrees, or null when the mean is a gray. */
function meanHue(pixels: RGBA[]): number | null {
  const channel = (i: number) => mean(pixels.map((p) => p[i]));
  const [h, s] = rgbToHsl([channel(0), channel(1), channel(2), 255]);
  return s < SHADOWS.minSaturation / 2 ? null : h * 360;
}

/**
 * Chromatic pixels grouped around their most common hues, wrapping at 360°: the densest 10° bin
 * seeds a family that takes every pixel within `familyRadius`, until too few pixels are left. A
 * hue-shifted ramp stays in one family, which fixed bins would cut in two.
 */
function hueFamilies(pixels: RGBA[]): RGBA[][] {
  let rest = pixels.map((p) => ({ p, hue: hueOf(p) }));
  const families: RGBA[][] = [];
  while (rest.length >= SHADOWS.minPixels) {
    const bins = new Array<number>(36).fill(0);
    for (const { hue } of rest) bins[Math.floor(hue / 10) % 36]++;
    const center = bins.indexOf(Math.max(...bins)) * 10 + 5;
    const near = (hue: number) => hueDistance(hue, center) <= SHADOWS.familyRadius;
    families.push(rest.filter((x) => near(x.hue)).map((x) => x.p));
    rest = rest.filter((x) => !near(x.hue));
  }
  return families.filter((f) => f.length >= SHADOWS.minPixels);
}

/**
 * Shadows that only get darker. Each hue family on a face is split at its median L*; when the darker
 * half is not cooler than the lighter one, the shading reads gray. Painted light drifts hue:
 * shadows toward blue, highlights toward yellow.
 */
function unshiftedShadows(faces: MeasuredFace[]): CraftAdvice | null {
  let measured = 0;
  const hits: PartFace[] = [];
  for (const { ref, pixels } of faces) {
    const chromatic = pixels.flat().filter((p) => p[3] > 0 && rgbToHsl(p)[1] >= SHADOWS.minSaturation);
    let judged = false, unshifted = false;
    for (const family of hueFamilies(chromatic)) {
      const sorted = [...family].sort((a, b) => perceptualLightness(a) - perceptualLightness(b));
      const half = sorted.length >> 1;
      const dark = sorted.slice(0, half), light = sorted.slice(half);
      const spread = mean(light.map(perceptualLightness)) - mean(dark.map(perceptualLightness));
      if (spread < SHADOWS.minSpread || spread > SHADOWS.maxSpread) continue;
      const darkHue = meanHue(dark), lightHue = meanHue(light);
      if (darkHue === null || lightHue === null || hueDistance(lightHue, COOL_DEGREES) < SHADOWS.nearCool) continue;
      judged = true;
      if (hueDistance(lightHue, COOL_DEGREES) - hueDistance(darkHue, COOL_DEGREES) < SHADOWS.minShift) unshifted = true;
    }
    if (judged) measured++;
    if (unshifted) hits.push(ref);
  }
  if (hits.length < SHADOWS.minFaces || hits.length < measured * SHADOWS.minShare) return null;
  return {
    code: 'unshifted-shadows',
    faces: hits,
    message: `on ${hits.length} of ${measured} shaded faces the shadows keep the hue of the lit color (or turn warmer), so the shading reads gray: ${formatList(hits.map(faceName))}`,
    hint: 'darken with tone steps, which cool shadows toward blue and warm highlights: "cloth~-1" and "cloth~1" instead of "cloth:-12"; "lighting" and "shade" already drift the hue',
  };
}

/** Confetti noise: neighbors as different as random pixels, so texture reads as static instead of clusters. */
function confettiNoise(faces: MeasuredFace[]): CraftAdvice | null {
  const hits = faces.filter(({ lightness: l }) => {
    const spread = stdDev(defined(l.flat()));
    if (!(spread >= CONFETTI.minStdDev)) return false;
    const steps: number[] = [];
    l.forEach((row, y) =>
      row.forEach((v, x) => {
        if (v === null) return;
        const right = row[x + 1], below = l[y + 1]?.[x];
        if (right !== undefined && right !== null) steps.push(Math.abs(v - right));
        if (below !== undefined && below !== null) steps.push(Math.abs(v - below));
      }),
    );
    return mean(steps) / spread > CONFETTI.ratio;
  });
  if (hits.length < CONFETTI.minFaces || hits.length < faces.length * CONFETTI.minShare) return null;
  const refs = hits.map((f) => f.ref);
  return {
    code: 'confetti-noise',
    faces: refs,
    message: `${hits.length} face(s) look like static: neighboring pixels differ as much as random ones (${formatList(refs.map(faceName))})`,
    hint: 'texture in clusters of 2–3 pixels: lower "noise" density or jitter, or use "material" kinds (fabric, leather, stone…) whose patterns cluster',
  };
}

/**
 * Details that stop at a vertical cube edge: most of the edge continues around the corner, but a
 * run of rows changes color, like a belt or a stripe painted on the front only. Edges that change
 * everywhere (skin on the front, hair on the side) are a design choice and are not reported.
 */
function edgeMismatch({ rig, visible }: FaceReader): CraftAdvice | null {
  const vertical = (e: FaceEdge) => e.faces.every((f) => SIDE_FACES.includes(f));
  const breaks: (EdgeBreak & { pairs: number })[] = [];
  for (const part of rig.parts)
    for (const edge of boxEdges(rig, part).filter(vertical)) {
      const [first, second] = edge.faces.map((face) => visible({ part, face }));
      const pairs = edge.pairs.filter(({ a, b }) => first[a[1]][a[0]][3] > 0 && second[b[1]][b[0]][3] > 0);
      if (pairs.length < EDGES.minPairs) continue;
      const rows = pairs.filter(({ a, b }) => deltaE(first[a[1]][a[0]], second[b[1]][b[0]]) >= EDGES.different).map(({ a }) => a[1]);
      if (longestRun(rows) >= EDGES.minRun && 1 - rows.length / pairs.length >= EDGES.minContinuous) breaks.push({ part, faces: edge.faces, rows, pairs: pairs.length });
    }
  if (!breaks.length) return null;
  const describe = (e: (typeof breaks)[number]) => `${e.part}.${e.faces[0]} ↔ ${e.part}.${e.faces[1]} (${e.rows.length} of ${e.pairs} rows: ${formatRanges(e.rows)})`;
  const faces = new Map<string, PartFace>();
  for (const e of breaks) for (const face of e.faces) faces.set(`${e.part}.${face}`, { part: e.part, face });
  return {
    code: 'edge-mismatch',
    faces: [...faces.values()],
    edges: breaks.map(({ part, faces: pair, rows }) => ({ part, faces: pair, rows })),
    message: `${breaks.length} cube edge(s) where a detail stops at the corner instead of wrapping around: ${formatList(breaks.map(describe), 4)}`,
    hint: 'carry bands, belts and trims around the corner (same rows on the side faces, e.g. target "body.front+sides"), or end them a pixel before the edge',
  };
}

/** Length of the longest run of consecutive integers among `values`. */
function longestRun(values: number[]): number {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  let longest = 0, current = 0;
  for (let i = 0; i < sorted.length; i++) {
    current = i > 0 && sorted[i] === sorted[i - 1] + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

/** "3–5, 8" for a list of indexes. */
function formatRanges(values: number[]): string {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    runs.push(i === j ? `${sorted[i]}` : `${sorted[i]}–${sorted[j]}`);
    i = j + 1;
  }
  return runs.join(', ');
}

function formatList(items: string[], max = 6): string {
  return `${items.slice(0, max).join(', ')}${items.length > max ? ', …' : ''}`;
}
