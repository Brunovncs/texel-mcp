import type { FaceName, FaceRef, LayerName, Model, PartName, Rect } from './types';

export const SKIN_SIZE = 64;
export const FACES: readonly FaceName[] = ['top', 'bottom', 'right', 'front', 'left', 'back'];
export const LAYERS: readonly LayerName[] = ['base', 'overlay'];

/**
 * Texture layouts: which boxes a texture wraps and where each face sits in it. A layout is data, so
 * the compiler, the review, the views and the 3D preview all read the same table.
 *
 * Box geometry (`at`) is the box's min corner in model pixels: x grows toward the model's left (the
 * viewer's right when facing it), y grows down, and the front faces -z, as in Java's model parts.
 */
export interface PartDef {
  /** [width, height, depth] in texture pixels. Depth 0 marks a flat texture (front face only). */
  box: [number, number, number];
  /** UV origin of the base layer. */
  uv: [number, number];
  /** UV origin of the overlay (hat/jacket) layer, if the layout has one for this part. */
  overlay?: [number, number];
}

export interface BoxDef {
  part: PartName;
  at: [number, number, number];
  /** Drawn with the part's texture mirrored, the way vanilla shares one texture between both limbs. */
  mirror?: boolean;
}

export interface LayoutDef {
  id: string;
  title: string;
  size: [number, number];
  parts: Record<PartName, PartDef>;
  /** Extra selector groups (besides `all`, `*` and the part names). */
  groups?: Record<string, PartName[]>;
  boxes: BoxDef[];
  /** A character with a face on head.front: face checks, R2–R7 art checks. */
  character?: boolean;
  /** Every base pixel should be opaque (transparent base pixels render black in game). */
  opaque?: boolean;
  /** Vanilla textures and other uses that share this layout. */
  usedBy: string[];
  note?: string;
}

const HEAD: PartDef = { box: [8, 8, 8], uv: [0, 0], overlay: [32, 0] };
const BODY: PartDef = { box: [8, 12, 4], uv: [16, 16] };

const LAYOUT_LIST: LayoutDef[] = [
  {
    id: 'player',
    title: 'Player skin',
    size: [64, 64],
    parts: {
      head: HEAD,
      body: { ...BODY, overlay: [16, 32] },
      rightArm: { box: [4, 12, 4], uv: [40, 16], overlay: [40, 32] },
      leftArm: { box: [4, 12, 4], uv: [32, 48], overlay: [48, 48] },
      rightLeg: { box: [4, 12, 4], uv: [0, 16], overlay: [0, 32] },
      leftLeg: { box: [4, 12, 4], uv: [16, 48], overlay: [0, 48] },
    },
    groups: { arms: ['rightArm', 'leftArm'], legs: ['rightLeg', 'leftLeg'], limbs: ['rightArm', 'leftArm', 'rightLeg', 'leftLeg'] },
    boxes: [
      { part: 'head', at: [-4, -8, -4] },
      { part: 'body', at: [-4, 0, -2] },
      { part: 'rightArm', at: [-8, 0, -2] },
      { part: 'leftArm', at: [4, 0, -2] },
      { part: 'rightLeg', at: [-4, 12, -2] },
      { part: 'leftLeg', at: [0, 12, -2] },
    ],
    character: true,
    opaque: true,
    usedBy: ['player skins (Java and Bedrock, classic and slim)', 'mod NPCs rendered with PlayerModel'],
  },
  {
    id: 'zombie',
    title: 'Zombie (humanoid, 64×64)',
    size: [64, 64],
    parts: { head: HEAD, body: BODY, rightArm: { box: [4, 12, 4], uv: [40, 16] }, rightLeg: { box: [4, 12, 4], uv: [0, 16] } },
    groups: { arms: ['rightArm'], legs: ['rightLeg'], limbs: ['rightArm', 'rightLeg'] },
    boxes: [
      { part: 'head', at: [-4, -8, -4] },
      { part: 'body', at: [-4, 0, -2] },
      { part: 'rightArm', at: [-8, 0, -2] },
      { part: 'rightArm', at: [4, 0, -2], mirror: true },
      { part: 'rightLeg', at: [-4, 12, -2] },
      { part: 'rightLeg', at: [0, 12, -2], mirror: true },
    ],
    character: true,
    opaque: true,
    usedBy: ['textures/entity/zombie/zombie.png', 'textures/entity/zombie/husk.png'],
    note: 'Only the top half of the 64×64 texture is used. The left arm and leg reuse the right ones, mirrored.',
  },
  {
    id: 'drowned',
    title: 'Drowned (64×64)',
    size: [64, 64],
    parts: {
      head: HEAD,
      body: BODY,
      rightArm: { box: [4, 12, 4], uv: [40, 16] },
      leftArm: { box: [4, 12, 4], uv: [32, 48] },
      rightLeg: { box: [4, 12, 4], uv: [0, 16] },
      leftLeg: { box: [4, 12, 4], uv: [16, 48] },
    },
    groups: { arms: ['rightArm', 'leftArm'], legs: ['rightLeg', 'leftLeg'], limbs: ['rightArm', 'leftArm', 'rightLeg', 'leftLeg'] },
    boxes: [
      { part: 'head', at: [-4, -8, -4] },
      { part: 'body', at: [-4, 0, -2] },
      { part: 'rightArm', at: [-8, 0, -2] },
      { part: 'leftArm', at: [4, 0, -2] },
      { part: 'rightLeg', at: [-4, 12, -2] },
      { part: 'leftLeg', at: [0, 12, -2] },
    ],
    character: true,
    opaque: true,
    usedBy: ['textures/entity/zombie/drowned.png', 'textures/entity/zombie/drowned_outer_layer.png (same layout, drawn slightly larger; leave it transparent where nothing hangs off)'],
    note: 'Like a player skin with its own left limbs, but only the head has an overlay (the hat).',
  },
  {
    id: 'humanoid',
    title: 'Humanoid 64×32 (armor, legacy skins)',
    size: [64, 32],
    parts: { head: HEAD, body: BODY, rightArm: { box: [4, 12, 4], uv: [40, 16] }, rightLeg: { box: [4, 12, 4], uv: [0, 16] } },
    groups: { arms: ['rightArm'], legs: ['rightLeg'], limbs: ['rightArm', 'rightLeg'] },
    boxes: [
      { part: 'head', at: [-4, -8, -4] },
      { part: 'body', at: [-4, 0, -2] },
      { part: 'rightArm', at: [-8, 0, -2] },
      { part: 'rightArm', at: [4, 0, -2], mirror: true },
      { part: 'rightLeg', at: [-4, 12, -2] },
      { part: 'rightLeg', at: [0, 12, -2], mirror: true },
    ],
    usedBy: [
      'textures/entity/equipment/humanoid/*.png (armor layer 1: helmet on head + head@overlay, chestplate on body + arms, boots on legs)',
      'textures/entity/equipment/humanoid_leggings/*.png (armor layer 2: leggings on body + legs)',
      'textures/entity/skeleton/stray_overlay.png and bogged_overlay.png (the clothes over the skeleton)',
      'legacy 64×32 player skins',
    ],
    note: 'Armor draws slightly larger than the body, and pixels left transparent show the body underneath. The left arm and leg reuse the right ones, mirrored.',
  },
  {
    id: 'skeleton',
    title: 'Skeleton (64×32)',
    size: [64, 32],
    parts: { head: HEAD, body: BODY, rightArm: { box: [2, 12, 2], uv: [40, 16] }, rightLeg: { box: [2, 12, 2], uv: [0, 16] } },
    groups: { arms: ['rightArm'], legs: ['rightLeg'], limbs: ['rightArm', 'rightLeg'] },
    boxes: [
      { part: 'head', at: [-4, -8, -4] },
      { part: 'body', at: [-4, 0, -2] },
      { part: 'rightArm', at: [-6, 0, -1] },
      { part: 'rightArm', at: [4, 0, -1], mirror: true },
      { part: 'rightLeg', at: [-3, 12, -1] },
      { part: 'rightLeg', at: [1, 12, -1], mirror: true },
    ],
    character: true,
    usedBy: ['textures/entity/skeleton/skeleton.png', 'stray.png', 'wither_skeleton.png', 'bogged.png'],
    note: 'Arms and legs are 2×12×2. Skeletons have see-through gaps: transparent base pixels are fine here. The left arm and leg reuse the right ones, mirrored.',
  },
  {
    id: 'creeper',
    title: 'Creeper (64×32)',
    size: [64, 32],
    parts: { head: { box: [8, 8, 8], uv: [0, 0] }, body: BODY, leg: { box: [4, 6, 4], uv: [0, 16] } },
    groups: { legs: ['leg'] },
    boxes: [
      { part: 'head', at: [-4, -2, -4] },
      { part: 'body', at: [-4, 6, -2] },
      { part: 'leg', at: [-4, 18, 2] },
      { part: 'leg', at: [0, 18, 2] },
      { part: 'leg', at: [-4, 18, -6] },
      { part: 'leg', at: [0, 18, -6] },
    ],
    opaque: true,
    usedBy: ['textures/entity/creeper/creeper.png'],
    note: 'All four legs share one texture.',
  },
  {
    id: 'enderman',
    title: 'Enderman (64×32)',
    size: [64, 32],
    parts: { head: { box: [8, 8, 8], uv: [0, 0], overlay: [0, 16] }, body: { box: [8, 12, 4], uv: [32, 16] }, limb: { box: [2, 30, 2], uv: [56, 0] } },
    groups: { arms: ['limb'], legs: ['limb'], limbs: ['limb'] },
    boxes: [
      { part: 'head', at: [-4, -21, -4] },
      { part: 'body', at: [-4, -14, -2] },
      { part: 'limb', at: [-6, -14, -1] },
      { part: 'limb', at: [4, -14, -1], mirror: true },
      { part: 'limb', at: [-3, -5, -1] },
      { part: 'limb', at: [1, -5, -1], mirror: true },
    ],
    opaque: true,
    usedBy: ['textures/entity/enderman/enderman.png', 'enderman_eyes.png (glowing eyes, same layout, transparent elsewhere)'],
    note: 'head@overlay is the jaw, drawn slightly smaller than the head. All four limbs share one 2×30×2 texture.',
  },
  {
    id: 'spider',
    title: 'Spider (64×32)',
    size: [64, 32],
    parts: { head: { box: [8, 8, 8], uv: [32, 4] }, neck: { box: [6, 6, 6], uv: [0, 0] }, body: { box: [10, 8, 12], uv: [0, 12] }, leg: { box: [16, 2, 2], uv: [18, 0] } },
    groups: { legs: ['leg'] },
    boxes: [
      { part: 'head', at: [-4, 11, -11] },
      { part: 'neck', at: [-3, 12, -3] },
      { part: 'body', at: [-5, 11, 3] },
      ...[1, 0, -1, -2].flatMap((z): BoxDef[] => [
        { part: 'leg', at: [-19, 14, z] },
        { part: 'leg', at: [3, 14, z], mirror: true },
      ]),
    ],
    opaque: true,
    usedBy: ['textures/entity/spider/spider.png', 'cave_spider.png', 'spider_eyes.png (glowing eyes, same layout)'],
    note: 'All eight legs share one texture; the left ones are mirrored. In game the legs are angled; the views show them straight out.',
  },
  {
    id: 'villager',
    title: 'Villager (64×64)',
    size: [64, 64],
    parts: {
      head: { box: [8, 10, 8], uv: [0, 0], overlay: [32, 0] },
      nose: { box: [2, 4, 2], uv: [24, 0] },
      hatRim: { box: [16, 16, 1], uv: [30, 47] },
      body: { box: [8, 12, 6], uv: [16, 20] },
      jacket: { box: [8, 20, 6], uv: [0, 38] },
      arm: { box: [4, 8, 4], uv: [44, 22] },
      armsMiddle: { box: [8, 4, 4], uv: [40, 38] },
      leg: { box: [4, 12, 4], uv: [0, 22] },
    },
    groups: { arms: ['arm', 'armsMiddle'], legs: ['leg'] },
    boxes: [
      { part: 'head', at: [-4, -10, -4] },
      { part: 'nose', at: [-1, -3, -6] },
      { part: 'body', at: [-4, 0, -3] },
      { part: 'jacket', at: [-4, 0, -3] },
      { part: 'leg', at: [-4, 12, -2] },
      { part: 'leg', at: [0, 12, -2], mirror: true },
      { part: 'arm', at: [-8, 1, -3] },
      { part: 'arm', at: [4, 1, -3], mirror: true },
      { part: 'armsMiddle', at: [-4, 5, -3] },
    ],
    usedBy: [
      'textures/entity/villager/villager.png (base body)',
      'villager/type/{biome}.png, villager/profession/{profession}.png, villager/profession_level/{level}.png (overlays in the same layout, mostly transparent)',
      'textures/entity/zombie_villager/... (same layout)',
    ],
    note: 'head@overlay is the hat (the .png.mcmeta "hat" field decides whether it shows). hatRim lies flat around the hat. The arms are crossed in game; the views show them unrotated in front of the body.',
  },
  {
    id: 'cape',
    title: 'Cape and elytra (64×32)',
    size: [64, 32],
    parts: { cape: { box: [10, 16, 1], uv: [0, 0] }, elytra: { box: [10, 20, 2], uv: [22, 0] } },
    boxes: [
      { part: 'cape', at: [-17, 0, 0] },
      { part: 'elytra', at: [-5, 0, 0] },
      { part: 'elytra', at: [5, 0, 0], mirror: true },
    ],
    opaque: true,
    usedBy: ['player capes', 'textures/entity/equipment/wings/elytra.png'],
    note: 'cape.front is the outer side people see from behind the player. The elytra region is one wing; the other wing is the same texture mirrored.',
  },
  {
    id: 'item',
    title: 'Item (16×16)',
    size: [16, 16],
    parts: { item: { box: [16, 16, 0], uv: [0, 0] } },
    boxes: [{ part: 'item', at: [0, 0, 0] }],
    usedBy: ['textures/item/*.png', 'mod item textures'],
    note: 'Leave the background transparent; the game draws the item from its opaque pixels.',
  },
  {
    id: 'block',
    title: 'Block face (16×16)',
    size: [16, 16],
    parts: { block: { box: [16, 16, 0], uv: [0, 0] } },
    boxes: [{ part: 'block', at: [0, 0, 0] }],
    opaque: true,
    usedBy: ['textures/block/*.png (one file per face: e.g. _top, _side, _bottom)'],
    note: 'Tiles seamlessly next to itself: keep the edges compatible.',
  },
];

export const LAYOUTS: Readonly<Record<string, LayoutDef>> = Object.fromEntries(LAYOUT_LIST.map((l) => [l.id, l]));
export const LAYOUT_IDS = LAYOUT_LIST.map((l) => l.id);
export type LayoutId = string;

/** Other names agents use for a layout. */
export const LAYOUT_ALIASES: Readonly<Record<string, string>> = {
  skin: 'player',
  husk: 'zombie',
  drowned_outer_layer: 'drowned',
  cave_spider: 'spider',
  zombie_villager: 'villager',
  armor: 'humanoid',
  armour: 'humanoid',
  legacy: 'humanoid',
  stray: 'skeleton',
  wither_skeleton: 'skeleton',
  bogged: 'skeleton',
  elytra: 'cape',
};

export function resolveLayout(id: unknown): LayoutDef | null {
  if (id === undefined) return LAYOUTS.player;
  if (typeof id !== 'string') return null;
  const key = id.toLowerCase();
  const real = Object.hasOwn(LAYOUT_ALIASES, key) ? LAYOUT_ALIASES[key] : key;
  return Object.hasOwn(LAYOUTS, real) ? LAYOUTS[real] : null;
}

/** A layout with a player model applied (slim arms). Everything that reads a texture goes through one. */
export interface Rig {
  layout: string;
  model: Model;
  width: number;
  height: number;
  def: LayoutDef;
  parts: readonly PartName[];
  boxes: readonly BoxDef[];
  part(name: PartName): PartDef | undefined;
  faces(part: PartName): readonly FaceName[];
  hasLayer(part: PartName, layer: LayerName): boolean;
  /** Texture rectangle of one face. Local (0,0) is the top-left of the face as seen from outside the model. */
  faceRect(part: PartName, face: FaceName, layer: LayerName): Rect;
  /** Every face that exists in the texture. */
  refs(): FaceRef[];
}

const SLIM: Record<string, Partial<PartDef>> = { rightArm: { box: [3, 12, 4] }, leftArm: { box: [3, 12, 4] } };
const SLIM_BOXES: Record<string, [number, number, number]> = { rightArm: [-7, 0, -2], leftArm: [4, 0, -2] };
const FLAT_FACES: readonly FaceName[] = ['front'];
const rigs = new Map<string, Rig>();

export function rigFor(layout: LayoutDef | string = 'player', model: Model = 'classic'): Rig {
  const def = typeof layout === 'string' ? (resolveLayout(layout) ?? LAYOUTS.player) : layout;
  const slim = def.id === 'player' && model === 'slim';
  const key = `${def.id}:${slim ? 'slim' : 'classic'}`;
  const cached = rigs.get(key);
  if (cached) return cached;
  const parts: Record<string, PartDef> = {};
  for (const [name, p] of Object.entries(def.parts)) parts[name] = slim && SLIM[name] ? { ...p, ...SLIM[name] } : p;
  const boxes = slim ? def.boxes.map((b) => (SLIM_BOXES[b.part] ? { ...b, at: SLIM_BOXES[b.part] } : b)) : def.boxes;
  const names = Object.keys(parts);
  const faces = (part: PartName) => (parts[part]?.box[2] === 0 ? FLAT_FACES : FACES);
  const rig: Rig = {
    layout: def.id,
    model: def.id === 'player' ? model : 'classic',
    width: def.size[0],
    height: def.size[1],
    def,
    parts: names,
    boxes,
    part: (name) => (Object.hasOwn(parts, name) ? parts[name] : undefined),
    faces,
    hasLayer: (part, layer) => Object.hasOwn(parts, part) && (layer === 'base' || Boolean(parts[part].overlay)),
    faceRect(part, face, layer) {
      const p = parts[part];
      const [u, v] = layer === 'overlay' ? (p.overlay ?? p.uv) : p.uv;
      return boxFace(u, v, p.box, face);
    },
    refs() {
      const out: FaceRef[] = [];
      for (const layer of LAYERS) for (const part of names) if (rig.hasLayer(part, layer)) for (const face of faces(part)) out.push({ part, face, layer });
      return out;
    },
  };
  rigs.set(key, rig);
  return rig;
}

function boxFace(u: number, v: number, [w, h, d]: [number, number, number], face: FaceName): Rect {
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

/** Markdown table of every layout with its parts and face sizes: the CLI's `layouts` and the spec reference. */
export function layoutsToMarkdown(): string {
  const lines = ['| layout | size | parts (box w×h×d; * has @overlay) | used by |', '| --- | --- | --- | --- |'];
  for (const def of LAYOUT_LIST) {
    const aliases = Object.entries(LAYOUT_ALIASES).filter(([, v]) => v === def.id).map(([k]) => k);
    const parts = Object.entries(def.parts).map(([name, p]) => `${name} ${p.box[2] ? p.box.join('×') : `${p.box[0]}×${p.box[1]} flat`}${p.overlay ? '*' : ''}`).join(', ');
    lines.push(`| \`${def.id}\`${aliases.length ? ` (${aliases.map((a) => `\`${a}\``).join(', ')})` : ''} | ${def.size.join('×')} | ${parts} | ${def.usedBy.join('; ')}${def.note ? `. ${def.note}` : ''} |`);
  }
  return lines.join('\n');
}

// ---- player shorthands, kept for the site and older callers ---------------------------------

export const PARTS: readonly PartName[] = rigFor('player').parts;

/** Box size as [width, height, depth] in skin pixels (player layout). */
export function boxSize(part: PartName, model: Model): [number, number, number] {
  return rigFor('player', model).part(part)?.box ?? [0, 0, 0];
}

/** Texture rectangle of one player-skin face. Local (0,0) is the top-left of the face as seen from outside the model. */
export function faceRect(part: PartName, face: FaceName, layer: LayerName, model: Model): Rect {
  return rigFor('player', model).faceRect(part, face, layer);
}

export function allFaceRefs(rig: Rig = rigFor('player')): FaceRef[] {
  return rig.refs();
}

export function refName(ref: FaceRef): string {
  return `${ref.part}.${ref.face}${ref.layer === 'overlay' ? '@overlay' : ''}`;
}

export interface Location extends FaceRef {
  x: number;
  y: number;
}

/** Reverse lookup: which face (and local coordinate) owns a texture pixel. Null for unused pixels. */
export function locate(tx: number, ty: number, model: Model | Rig): Location | null {
  const rig = typeof model === 'string' ? rigFor('player', model) : model;
  for (const ref of rig.refs()) {
    const r = rig.faceRect(ref.part, ref.face, ref.layer);
    if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return { ...ref, x: tx - r.x, y: ty - r.y };
  }
  return null;
}
