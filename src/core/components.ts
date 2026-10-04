import { mix, shiftLightness, shiftTone, tone } from './color.js';
import type { FaceName, FaceRef, PartName, RGBA } from './types.js';

/**
 * High-level ops: the craft rules from the art guide (face layout, hair that wraps, material
 * texture, light from above) done by the compiler, so a model only has to pick what and which
 * colors. Each works on one face at a time through a Surface.
 */

export interface Surface {
  ref: FaceRef;
  w: number;
  h: number;
  get(x: number, y: number): RGBA;
  /** `adjust`: the pixel is a variation of what was there (keeps the earlier layers alive). */
  set(x: number, y: number, c: RGBA, adjust?: boolean): void;
}

// ---- regions -------------------------------------------------------------------------------

/**
 * Named areas, so a band doesn't need row numbers. `y`/`h` apply to the side faces of the listed
 * parts; `top`/`bottom` also cover that cap face.
 */
export const REGIONS: Record<string, { parts: PartName[]; y: number; h: number; top?: boolean; bottom?: boolean }> = {
  collar: { parts: ['body'], y: 0, h: 1 },
  chest: { parts: ['body'], y: 1, h: 6 },
  belt: { parts: ['body'], y: 8, h: 1 },
  waist: { parts: ['body'], y: 9, h: 3 },
  sleeves: { parts: ['rightArm', 'leftArm'], y: 0, h: 4, top: true },
  longSleeves: { parts: ['rightArm', 'leftArm'], y: 0, h: 9, top: true },
  cuffs: { parts: ['rightArm', 'leftArm'], y: 8, h: 1 },
  hands: { parts: ['rightArm', 'leftArm'], y: 9, h: 3, bottom: true },
  gloves: { parts: ['rightArm', 'leftArm'], y: 7, h: 5, bottom: true },
  knees: { parts: ['rightLeg', 'leftLeg'], y: 5, h: 1 },
  shoes: { parts: ['rightLeg', 'leftLeg'], y: 9, h: 3, bottom: true },
  boots: { parts: ['rightLeg', 'leftLeg'], y: 6, h: 6, bottom: true },
};

// ---- lighting ------------------------------------------------------------------------------

const INNER: Partial<Record<PartName, FaceName>> = { rightArm: 'left', leftArm: 'right', rightLeg: 'left', leftLeg: 'right' };

/** Lightness shift (points) at a pixel for light from above and slightly in front. */
function lightAt(ref: FaceRef, y: number, h: number): number {
  const { part, face } = ref;
  if (face === 'top') return part === 'head' ? 4 : 6;
  if (face === 'bottom') return -14;
  if (part === 'head') {
    const side = face === 'back' ? -4 : face === 'front' ? 0 : -2;
    return side + (y === 0 ? 3 : y === h - 1 ? (face === 'front' ? -4 : -6) : 0);
  }
  const side = face === 'back' ? -5 : INNER[part] === face ? -8 : part === 'body' && face !== 'front' ? -3 : 0;
  const ramp = y === 0 ? 6 : y === h - 1 ? -10 : y === h - 2 ? -5 : 2 - (5 * (y - 1)) / Math.max(1, h - 3);
  return side + ramp;
}

export function applyLighting(s: Surface, strength: number) {
  for (let y = 0; y < s.h; y++) {
    const shift = Math.round(lightAt(s.ref, y, s.h) * strength);
    if (!shift) continue;
    for (let x = 0; x < s.w; x++) {
      const c = s.get(x, y);
      if (c[3] > 0) s.set(x, y, shiftTone(c, shift), true);
    }
  }
}

// ---- materials -----------------------------------------------------------------------------

export const MATERIALS = ['plain', 'skin', 'fabric', 'knit', 'leather', 'metal', 'fur', 'stone', 'scales', 'wood', 'glow'] as const;
export type Material = (typeof MATERIALS)[number];

/** Words models use for a material kind, read as the closest one. */
export const MATERIAL_ALIASES: Record<string, Material> = {
  cloth: 'fabric', cotton: 'fabric', silk: 'fabric', denim: 'fabric', canvas: 'fabric', robe: 'fabric',
  wool: 'knit', knitted: 'knit', yarn: 'knit',
  hide: 'leather', suede: 'leather', rubber: 'leather',
  steel: 'metal', iron: 'metal', gold: 'metal', silver: 'metal', armor: 'metal', armour: 'metal', chrome: 'metal', bronze: 'metal',
  feathers: 'fur', feather: 'fur', hair: 'fur', fluff: 'fur',
  rock: 'stone', brick: 'stone', concrete: 'stone', clay: 'stone',
  scale: 'scales', reptile: 'scales', dragon: 'scales', fish: 'scales',
  bark: 'wood', planks: 'wood', wooden: 'wood',
  light: 'glow', neon: 'glow', energy: 'glow', crystal: 'glow', magic: 'glow', ice: 'glow',
  flat: 'plain', solid: 'plain', paint: 'plain', plastic: 'plain',
};

export function applyMaterial(s: Surface, area: { x: number; y: number; w: number; h: number }, base: RGBA, kind: Material, rnd: () => number) {
  const jit = (c: RGBA, n: number) => (n ? shiftLightness(c, Math.round((rnd() * 2 - 1) * n)) : c);
  const pick = (weights: [number, number][]) => {
    let r = rnd();
    for (const [p, step] of weights) {
      if (r < p) return step;
      r -= p;
    }
    return 0;
  };
  for (let ly = 0; ly < area.h; ly++)
    for (let lx = 0; lx < area.w; lx++) {
      const x = area.x + lx, y = area.y + ly;
      let c: RGBA;
      switch (kind) {
        case 'plain':
          c = base;
          break;
        case 'skin':
          c = jit(base, 1);
          break;
        case 'fabric':
          c = jit(tone(base, pick([[0.08, -1]])), 3);
          break;
        case 'knit':
          c = jit((x + (y % 2)) % 2 ? shiftLightness(base, -5) : base, 2);
          break;
        case 'leather':
          c = jit(tone(base, pick([[0.12, -1], [0.04, 1]])), 3);
          break;
        case 'metal': {
          const step = ly === 0 ? 2 : lx === 1 && area.w > 2 ? 1 : ly === area.h - 1 ? -1 : pick([[0.05, -1]]);
          c = jit(tone(base, step), 2);
          break;
        }
        case 'fur':
          c = jit(tone(base, pick([[0.3, -1], [0.15, 1]])), 3);
          break;
        case 'stone':
          c = jit(tone(base, pick([[0.25, -1], [0.1, -2], [0.1, 1]])), 4);
          break;
        case 'scales':
          c = jit(tone(base, (x + y) % 3 === 0 ? -1 : (x + y) % 3 === 1 && y % 2 === 0 ? 1 : 0), 2);
          break;
        case 'wood':
          c = jit(tone(base, y % 3 === 2 ? -1 : pick([[0.1, -1]])), 2);
          break;
        case 'glow':
          c = tone(base, pick([[0.2, 2], [0.1, 1]]));
          break;
      }
      s.set(x, y, c);
    }
}

// ---- face ----------------------------------------------------------------------------------

export const EYE_STYLES = ['normal', 'wide', 'cute', 'angry', 'sad', 'closed', 'glow', 'visor', 'narrow'] as const;
export const MOUTHS = ['neutral', 'smile', 'grin', 'open', 'frown', 'fangs', 'none'] as const;
export const BEARDS = ['none', 'stubble', 'full', 'mustache', 'goatee'] as const;

export interface FaceColors {
  skin: RGBA;
  eyes: RGBA;
  white: RGBA;
  brows: RGBA | null;
  mouth: RGBA;
  beard: RGBA;
  blush: RGBA | null;
}

export interface FaceStyle {
  eyeStyle: (typeof EYE_STYLES)[number];
  mouth: (typeof MOUTHS)[number];
  beard: (typeof BEARDS)[number];
  nose: boolean;
}

/** An 8×8 face following the art guide's layout: brows on row 3, eyes on row 4, nose 5, mouth 6. */
export function drawFace(s: Surface, c: FaceColors, st: FaceStyle) {
  const g: RGBA[][] = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => c.skin));
  const put = (x: number, y: number, col: RGBA) => {
    if (x >= 0 && x < 8 && y >= 0 && y < 8) g[y][x] = col;
  };
  const both = (x: number, y: number, col: RGBA) => (put(x, y, col), put(7 - x, y, col));
  const shadow = shiftLightness(c.skin, -7), deep = mix(c.skin, [60, 30, 30, 255], 0.6);
  for (let x = 0; x < 8; x++) put(x, 7, shiftLightness(c.skin, -4));

  const brows = (inner: number, outer: number) => {
    if (!c.brows) return;
    both(1, outer, c.brows);
    both(2, inner, c.brows);
  };
  switch (st.eyeStyle) {
    case 'normal':
      both(1, 4, c.white), both(2, 4, c.eyes), brows(3, 3);
      break;
    case 'narrow':
      both(1, 4, shadow), both(2, 4, c.eyes), brows(3, 3);
      break;
    case 'wide':
      both(1, 3, c.white), both(2, 3, c.eyes), both(1, 4, c.white), both(2, 4, c.eyes), brows(2, 2);
      break;
    case 'cute':
      put(1, 3, c.white), put(2, 3, c.eyes), put(5, 3, c.white), put(6, 3, c.eyes);
      both(1, 4, c.eyes), both(2, 4, c.eyes), brows(2, 2);
      break;
    case 'angry':
      both(1, 4, c.white), both(2, 4, c.eyes), brows(3, 2);
      break;
    case 'sad':
      both(1, 4, c.white), both(2, 4, c.eyes), brows(2, 3);
      break;
    case 'closed':
      both(1, 4, deep), both(2, 4, deep), brows(3, 3);
      break;
    case 'glow':
      both(1, 4, c.eyes), both(2, 4, tone(c.eyes, 2)), brows(3, 3);
      break;
    case 'visor':
      for (let x = 0; x < 8; x++) put(x, 3, tone(c.eyes, 1)), put(x, 4, c.eyes);
      put(1, 3, tone(c.eyes, 3));
      break;
  }
  if (st.nose && st.eyeStyle !== 'visor') put(3, 5, shadow), put(4, 5, shadow);
  if (c.blush) both(1, 5, c.blush);

  const m = c.mouth;
  switch (st.mouth) {
    case 'neutral':
      put(3, 6, m), put(4, 6, m);
      break;
    case 'smile':
      both(2, 6, m), put(3, 6, shiftLightness(m, -8)), put(4, 6, shiftLightness(m, -8));
      break;
    case 'grin':
      both(2, 6, m), put(3, 6, c.white), put(4, 6, c.white);
      break;
    case 'open':
      put(3, 6, deep), put(4, 6, deep), put(3, 7, m), put(4, 7, m);
      break;
    case 'frown':
      put(3, 6, m), put(4, 6, m), both(2, 7, m);
      break;
    case 'fangs':
      both(2, 6, m), put(3, 6, m), put(4, 6, m), both(2, 7, c.white);
      break;
    case 'none':
      break;
  }

  const b = c.beard, bl = tone(b, -1);
  switch (st.beard) {
    case 'stubble':
      for (let x = 0; x < 8; x++) if ((x + 7) % 2 === 0 || x === 0 || x === 7) put(x, 7, mix(c.skin, b, 0.55));
      both(0, 6, mix(c.skin, b, 0.55));
      break;
    case 'full':
      both(0, 5, b), both(0, 6, b), both(1, 6, b), both(2, 6, bl);
      for (let x = 0; x < 8; x++) put(x, 7, x % 3 === 1 ? bl : b);
      break;
    case 'mustache':
      for (let x = 2; x < 6; x++) put(x, 5, x === 2 || x === 5 ? bl : b);
      break;
    case 'goatee':
      put(3, 7, b), put(4, 7, b);
      break;
    case 'none':
      break;
  }
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (x < s.w && y < s.h) s.set(x, y, g[y][x]);
}

// ---- hair ----------------------------------------------------------------------------------

export const HAIR_STYLES = ['short', 'buzz', 'bob', 'long', 'spiky', 'curly', 'ponytail', 'mohawk'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const FRINGES = ['full', 'side', 'parted', 'none'] as const;
export type Fringe = (typeof FRINGES)[number];

/** Rows of hair on the back of the head, and how far it reaches down the face's sides. */
const LENGTH: Record<HairStyle, { back: number; frame: number; overlay: boolean }> = {
  buzz: { back: 3, frame: 0, overlay: false },
  short: { back: 5, frame: 3, overlay: true },
  spiky: { back: 5, frame: 3, overlay: true },
  curly: { back: 6, frame: 4, overlay: true },
  mohawk: { back: 5, frame: 0, overlay: true },
  ponytail: { back: 5, frame: 3, overlay: true },
  bob: { back: 7, frame: 6, overlay: true },
  long: { back: 8, frame: 8, overlay: true },
};

/**
 * Hair on one head face. Faces see the head from outside: on `right` the front edge is x=7, on
 * `left` it is x=0, and on `top` it is y=7.
 */
export function drawHair(s: Surface, color: RGBA, style: HairStyle, fringe: Fringe, overlay: boolean) {
  const L = LENGTH[style];
  if (overlay && !L.overlay) return;
  const hi = tone(color, 1), lo = tone(color, -1), deep = tone(color, -2);
  const strand = (x: number, y: number) => ((x * 7 + y * 3) % 5 === 0 ? lo : (x * 3 + y) % 7 === 0 ? hi : color);
  const face = s.ref.face;
  const paint = (x: number, y: number, c: RGBA) => x >= 0 && y >= 0 && x < s.w && y < s.h && s.set(x, y, c);

  if (style === 'mohawk') {
    const cols = [3, 4];
    if (face === 'top') for (let y = 0; y < 8; y++) for (const x of cols) paint(x, y, y % 2 ? hi : color);
    if (face === 'front' && overlay) for (const x of cols) paint(x, 0, color);
    if (face === 'back') for (let y = 0; y < L.back; y++) for (const x of cols) paint(x, y, overlay ? lo : color);
    return;
  }

  if (face === 'top') {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        let c = strand(x, y);
        if (style === 'spiky' && overlay) c = (x + y) % 2 ? hi : color;
        if (style === 'curly') c = (x + y * 2) % 3 === 0 ? lo : (x * 2 + y) % 4 === 0 ? hi : color;
        if (!overlay && x > 1 && x < 6 && y > 1 && y < 6 && (x + y) % 3 === 0) c = hi;
        paint(x, y, c);
      }
    return;
  }

  if (face === 'bottom') return;

  if (face === 'back') {
    const rows = overlay ? Math.max(0, L.back - 2) : L.back;
    for (let y = 0; y < rows; y++) for (let x = 0; x < 8; x++) paint(x, y, y === rows - 1 ? (x % 2 ? lo : deep) : strand(x, y));
    if (style === 'ponytail' && overlay)
      for (let y = 3; y < 8; y++) {
        paint(3, y, y === 7 ? lo : hi);
        paint(4, y, y === 7 ? deep : color);
      }
    if (style === 'spiky' && overlay) for (let x = 0; x < 8; x += 2) paint(x, rows, lo);
    return;
  }

  if (face === 'right' || face === 'left') {
    // Distance from the back edge, so both sides mirror.
    const fromBack = (x: number) => (face === 'right' ? x : 7 - x);
    const rows = overlay ? Math.max(1, L.back - 3) : L.back;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const b = fromBack(x);
        // Full width at the crown, then only the back half; sideburns at the front for most styles.
        const crown = y < (overlay ? 1 : 2);
        const backHalf = y < rows && b < (style === 'long' || style === 'bob' ? 6 : 4) + (y < 3 ? 2 : 0);
        const burn = !overlay && L.frame > 0 && b === 6 && y < Math.min(L.frame, 4) + 1;
        if (crown || backHalf || burn) paint(x, y, y === rows - 1 && !crown ? lo : strand(x, y));
      }
    return;
  }

  // front
  if (overlay) {
    if (style === 'spiky') for (let x = 0; x < 8; x += 2) paint(x, 0, hi);
    else if (fringe === 'full') for (let x = 1; x < 7; x++) paint(x, 0, x % 2 ? color : hi);
    else if (fringe === 'side') for (let x = 0; x < 4; x++) paint(x, 0, color);
    if (L.frame > 4) for (let y = 1; y < Math.min(8, L.frame); y++) paint(0, y, lo), paint(7, y, lo);
    return;
  }
  for (let x = 0; x < 8; x++) paint(x, 0, strand(x, 0));
  const row = (y: number, xs: number[]) => xs.forEach((x) => paint(x, y, y === 2 ? lo : strand(x, y)));
  if (fringe === 'full') row(1, [0, 1, 2, 3, 4, 5, 6, 7]), row(2, [0, 7]);
  else if (fringe === 'side') row(1, [0, 1, 2, 3, 4, 5]), row(2, [0, 1, 2, 7]);
  else if (fringe === 'parted') row(1, [0, 1, 2, 5, 6, 7]), row(2, [0, 7]);
  else row(1, [0, 7]);
  for (let y = 2; y < Math.min(L.frame, 8); y++) paint(0, y, lo), paint(7, y, lo);
}
