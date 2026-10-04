import type { FaceName, FaceRef, LayerName, Model, PartName, Rect } from './types.js';

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
  /** [width, height, depth] in texture pixels. Depth 0 marks a flat texture (front face only); width 0 a plane seen from the sides. */
  box: [number, number, number];
  /** UV origin of the base layer. */
  uv: [number, number];
  /** UV origin of the overlay (hat/jacket) layer, if the layout has one for this part. */
  overlay?: [number, number];
  /**
   * The box lies turned 90° about x in game (Java xRot = π/2), like a quadruped's body: `box` is
   * the texture box [w, h, d] and the model box is [w, d, h]. Faces are named as they face in game
   * (top is the back of the animal, front its chest) and read upright through `texel`.
   */
  turned?: boolean;
  /** Transparent pixels cut the part's outline (a fin, a crest), so the opacity check skips it. */
  cutout?: boolean;
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
    id: 'piglin',
    title: 'Piglin (64×64)',
    size: [64, 64],
    parts: {
      head: { box: [10, 8, 8], uv: [0, 0] },
      snout: { box: [4, 4, 1], uv: [31, 1] },
      rightTusk: { box: [1, 2, 1], uv: [2, 0] },
      leftTusk: { box: [1, 2, 1], uv: [2, 4] },
      rightEar: { box: [1, 5, 4], uv: [39, 6] },
      leftEar: { box: [1, 5, 4], uv: [51, 6] },
      body: { ...BODY, overlay: [16, 32] },
      rightArm: { box: [4, 12, 4], uv: [40, 16], overlay: [40, 32] },
      leftArm: { box: [4, 12, 4], uv: [32, 48], overlay: [48, 48] },
      rightLeg: { box: [4, 12, 4], uv: [0, 16], overlay: [0, 32] },
      leftLeg: { box: [4, 12, 4], uv: [16, 48], overlay: [0, 48] },
    },
    groups: {
      arms: ['rightArm', 'leftArm'],
      legs: ['rightLeg', 'leftLeg'],
      limbs: ['rightArm', 'leftArm', 'rightLeg', 'leftLeg'],
      ears: ['rightEar', 'leftEar'],
      tusks: ['rightTusk', 'leftTusk'],
    },
    boxes: [
      { part: 'head', at: [-5, -8, -4] },
      { part: 'snout', at: [-2, -4, -5] },
      { part: 'rightTusk', at: [-3, -2, -5] },
      { part: 'leftTusk', at: [2, -2, -5] },
      { part: 'rightEar', at: [-6, -6, -2] },
      { part: 'leftEar', at: [5, -6, -2] },
      { part: 'body', at: [-4, 0, -2] },
      { part: 'rightArm', at: [-8, 0, -2] },
      { part: 'leftArm', at: [4, 0, -2] },
      { part: 'rightLeg', at: [-4, 12, -2] },
      { part: 'leftLeg', at: [0, 12, -2] },
    ],
    character: true,
    opaque: true,
    usedBy: ['textures/entity/piglin/piglin.png', 'piglin_brute.png', 'zombified_piglin.png'],
    note: 'A player body (classic arms, with jacket, sleeve and pant overlays) under a 10×8×8 head without a hat layer. The snout and the tusks sit on head.front; the ears hang angled 30° in game and the views show them straight down.',
  },
  {
    id: 'pig',
    title: 'Pig (64×64)',
    size: [64, 64],
    parts: {
      head: { box: [8, 8, 8], uv: [0, 0] },
      snout: { box: [4, 3, 1], uv: [16, 16] },
      body: { box: [10, 16, 8], uv: [28, 8], overlay: [28, 32], turned: true },
      leg: { box: [4, 6, 4], uv: [0, 16] },
    },
    groups: { legs: ['leg'] },
    boxes: [
      { part: 'head', at: [-4, 8, -14] },
      { part: 'snout', at: [-2, 12, -15] },
      { part: 'body', at: [-5, 10, -8] },
      { part: 'leg', at: [-5, 18, 5] },
      { part: 'leg', at: [1, 18, 5], mirror: true },
      { part: 'leg', at: [-5, 18, -7] },
      { part: 'leg', at: [1, 18, -7], mirror: true },
    ],
    opaque: true,
    usedBy: ['textures/entity/pig/temperate_pig.png', 'warm_pig.png', 'cold_pig.png (body@overlay is its fur coat)', 'pig.png before 1.21.5 (64×32, the same UVs)'],
    note: 'The body lies along the pig: body.top is its back, body.front the chest, body.back the rump, body.bottom the belly, all named and drawn the way they face in game. body@overlay is the cold pig\'s fur coat; leave it transparent for the others. The snout covers columns 2–5 of rows 4–6 of head.front. All four legs share one texture; the left ones are mirrored.',
  },
  {
    id: 'cow',
    title: 'Cow and mooshroom (64×64)',
    size: [64, 64],
    parts: {
      head: { box: [8, 8, 6], uv: [0, 0] },
      muzzle: { box: [6, 3, 1], uv: [1, 33] },
      horn: { box: [1, 3, 1], uv: [22, 0] },
      body: { box: [12, 18, 10], uv: [18, 4], turned: true },
      udder: { box: [4, 6, 1], uv: [52, 0], turned: true },
      leg: { box: [4, 12, 4], uv: [0, 16] },
    },
    groups: { legs: ['leg'] },
    boxes: [
      { part: 'head', at: [-4, 0, -14] },
      { part: 'muzzle', at: [-3, 5, -15] },
      { part: 'horn', at: [-5, -1, -13] },
      { part: 'horn', at: [4, -1, -13] },
      { part: 'body', at: [-6, 2, -8] },
      { part: 'udder', at: [-2, 12, 4] },
      { part: 'leg', at: [-6, 12, 5] },
      { part: 'leg', at: [2, 12, 5], mirror: true },
      { part: 'leg', at: [-6, 12, -7] },
      { part: 'leg', at: [2, 12, -7], mirror: true },
    ],
    opaque: true,
    usedBy: ['textures/entity/cow/temperate_cow.png', 'red_mooshroom.png', 'brown_mooshroom.png', 'cow.png and mooshroom textures before 1.21.5'],
    note: 'The body lies along the cow: body.top is its back, body.front the chest, body.back the rump, body.bottom the belly; the udder hangs under the belly. Both horns share one texture. The cold and warm cows of 1.21.5 have their own layouts, cold_cow and warm_cow.',
  },
  {
    id: 'cold_cow',
    title: 'Cold cow (64×64)',
    size: [64, 64],
    parts: {
      head: { box: [8, 8, 6], uv: [0, 0] },
      muzzle: { box: [6, 3, 1], uv: [9, 33] },
      rightHorn: { box: [2, 6, 2], uv: [0, 40], turned: true },
      leftHorn: { box: [2, 6, 2], uv: [0, 32], turned: true },
      body: { box: [12, 18, 10], uv: [18, 4], overlay: [20, 32], turned: true },
      udder: { box: [4, 6, 1], uv: [52, 0], turned: true },
      leg: { box: [4, 12, 4], uv: [0, 16] },
    },
    groups: { legs: ['leg'], horns: ['rightHorn', 'leftHorn'] },
    boxes: [
      { part: 'head', at: [-4, 0, -14] },
      { part: 'muzzle', at: [-3, 5, -15] },
      { part: 'rightHorn', at: [-6, 0, -16] },
      { part: 'leftHorn', at: [4, 0, -16] },
      { part: 'body', at: [-6, 2, -8] },
      { part: 'udder', at: [-2, 12, 4] },
      { part: 'leg', at: [-6, 12, 5] },
      { part: 'leg', at: [2, 12, 5], mirror: true },
      { part: 'leg', at: [-6, 12, -7] },
      { part: 'leg', at: [2, 12, -7], mirror: true },
    ],
    opaque: true,
    usedBy: ['textures/entity/cow/cold_cow.png'],
    note: 'The cow of cold biomes (1.21.5+): horns that point forward and a fur coat on body@overlay, drawn a little larger than the body. The body lies along the cow (body.top is its back), as in the cow layout.',
  },
  {
    id: 'warm_cow',
    title: 'Warm cow (64×64)',
    size: [64, 64],
    parts: {
      head: { box: [8, 8, 6], uv: [0, 0] },
      muzzle: { box: [6, 3, 1], uv: [1, 33] },
      horn: { box: [4, 2, 2], uv: [27, 0] },
      hornTip: { box: [2, 2, 2], uv: [39, 0] },
      body: { box: [12, 18, 10], uv: [18, 4], turned: true },
      udder: { box: [4, 6, 1], uv: [52, 0], turned: true },
      leg: { box: [4, 12, 4], uv: [0, 16] },
    },
    groups: { legs: ['leg'], horns: ['horn', 'hornTip'] },
    boxes: [
      { part: 'head', at: [-4, 0, -14] },
      { part: 'muzzle', at: [-3, 5, -15] },
      { part: 'horn', at: [-8, 1, -13] },
      { part: 'hornTip', at: [-8, -1, -13] },
      { part: 'horn', at: [4, 1, -13], mirror: true },
      { part: 'hornTip', at: [6, -1, -13], mirror: true },
      { part: 'body', at: [-6, 2, -8] },
      { part: 'udder', at: [-2, 12, 4] },
      { part: 'leg', at: [-6, 12, 5] },
      { part: 'leg', at: [2, 12, 5], mirror: true },
      { part: 'leg', at: [-6, 12, -7] },
      { part: 'leg', at: [2, 12, -7], mirror: true },
    ],
    opaque: true,
    usedBy: ['textures/entity/cow/warm_cow.png'],
    note: 'The cow of warm biomes (1.21.5+): long horns, each a horn and an upturned tip shared, mirrored, by both sides. The body lies along the cow (body.top is its back), as in the cow layout.',
  },
  {
    id: 'sheep',
    title: 'Sheep (64×32)',
    size: [64, 32],
    parts: {
      head: { box: [6, 6, 8], uv: [0, 0] },
      body: { box: [8, 16, 6], uv: [28, 8], turned: true },
      leg: { box: [4, 12, 4], uv: [0, 16] },
    },
    groups: { legs: ['leg'] },
    boxes: [
      { part: 'head', at: [-3, 2, -14] },
      { part: 'body', at: [-4, 6, -8] },
      { part: 'leg', at: [-5, 12, 5], mirror: true },
      { part: 'leg', at: [1, 12, 5] },
      { part: 'leg', at: [-5, 12, -7], mirror: true },
      { part: 'leg', at: [1, 12, -7] },
    ],
    opaque: true,
    usedBy: ['textures/entity/sheep/sheep.png (the sheared body under the wool)', 'sheep_wool_undercoat.png (drawn under the wool of dyed sheep and tinted with their color)'],
    note: 'The bare sheep; its wool is another texture with its own layout, sheep_wool. The body lies along the sheep (body.top is its back). All four legs share one texture; the right ones are mirrored.',
  },
  {
    id: 'sheep_wool',
    title: 'Sheep wool (64×32)',
    size: [64, 32],
    parts: {
      head: { box: [6, 6, 6], uv: [0, 0] },
      body: { box: [8, 16, 6], uv: [28, 8], turned: true },
      leg: { box: [4, 6, 4], uv: [0, 16] },
    },
    groups: { legs: ['leg'] },
    boxes: [
      { part: 'head', at: [-3, 2, -12] },
      { part: 'body', at: [-4, 6, -8] },
      { part: 'leg', at: [-5, 12, 5] },
      { part: 'leg', at: [1, 12, 5] },
      { part: 'leg', at: [-5, 12, -7] },
      { part: 'leg', at: [1, 12, -7] },
    ],
    usedBy: ['textures/entity/sheep/sheep_wool.png'],
    note: 'The wool drawn over the sheep, a little larger than it: a cap on the head (its front sits inside the sheep\'s face and never shows), a coat on the body and the tops of the legs. The game multiplies it by the sheep\'s dye color: on a white sheep the colors show as painted, on a dyed one they are tinted. So a colored design is for white sheep, and whites and light grays suit every color. Transparent pixels leave the sheep showing.',
  },
  {
    id: 'chicken',
    title: 'Chicken (64×32)',
    size: [64, 32],
    parts: {
      head: { box: [4, 6, 3], uv: [0, 0] },
      beak: { box: [4, 2, 2], uv: [14, 0] },
      wattle: { box: [2, 2, 2], uv: [14, 4] },
      body: { box: [6, 8, 6], uv: [0, 9], turned: true },
      wing: { box: [1, 4, 6], uv: [24, 13] },
      leg: { box: [3, 5, 3], uv: [26, 0], cutout: true },
    },
    groups: { legs: ['leg'], wings: ['wing'] },
    boxes: [
      { part: 'head', at: [-2, 9, -6] },
      { part: 'beak', at: [-2, 11, -8] },
      { part: 'wattle', at: [-1, 13, -7] },
      { part: 'body', at: [-3, 13, -4] },
      { part: 'wing', at: [-4, 13, -3] },
      { part: 'wing', at: [3, 13, -3] },
      { part: 'leg', at: [-3, 19, -2] },
      { part: 'leg', at: [0, 19, -2] },
    ],
    opaque: true,
    usedBy: ['textures/entity/chicken/temperate_chicken.png', 'warm_chicken.png', 'chicken.png before 1.21.5'],
    note: 'The body lies along the chicken (body.top is its back, body.back its tail end). Both wings share one texture, and so do both legs. The cold chicken of 1.21.5 has its own layout, cold_chicken.',
  },
  {
    id: 'cold_chicken',
    title: 'Cold chicken (64×32)',
    size: [64, 32],
    parts: {
      head: { box: [4, 6, 3], uv: [0, 0] },
      crest: { box: [6, 3, 4], uv: [44, 0], cutout: true },
      beak: { box: [4, 2, 2], uv: [14, 0] },
      wattle: { box: [2, 2, 2], uv: [14, 4] },
      body: { box: [6, 8, 6], uv: [0, 9], turned: true },
      tail: { box: [0, 3, 5], uv: [38, 9], turned: true, cutout: true },
      wing: { box: [1, 4, 6], uv: [24, 13] },
      leg: { box: [3, 5, 3], uv: [26, 0], cutout: true },
    },
    groups: { legs: ['leg'], wings: ['wing'] },
    boxes: [
      { part: 'head', at: [-2, 9, -6] },
      { part: 'crest', at: [-3, 8, -6] },
      { part: 'beak', at: [-2, 11, -8] },
      { part: 'wattle', at: [-1, 13, -7] },
      { part: 'body', at: [-3, 13, -4] },
      { part: 'tail', at: [0, 12, 3] },
      { part: 'wing', at: [-4, 13, -3] },
      { part: 'wing', at: [3, 13, -3] },
      { part: 'leg', at: [-3, 19, -2] },
      { part: 'leg', at: [0, 19, -2] },
    ],
    opaque: true,
    usedBy: ['textures/entity/chicken/cold_chicken.png'],
    note: 'The chicken of cold biomes (1.21.5+): the chicken layout plus a fluffy crest, wider than the head, that covers the top of it and the top two rows of head.front, and a tail: a flat fin over the rump with only .right and .left faces, whose transparent pixels cut its outline. The body lies along the chicken (body.top is its back).',
  },
  {
    id: 'wolf',
    title: 'Wolf (64×32)',
    size: [64, 32],
    parts: {
      head: { box: [6, 6, 4], uv: [0, 0] },
      ear: { box: [2, 2, 1], uv: [16, 14] },
      snout: { box: [3, 3, 4], uv: [0, 10] },
      mane: { box: [8, 6, 7], uv: [21, 0], turned: true },
      body: { box: [6, 9, 6], uv: [18, 14], turned: true },
      leg: { box: [2, 8, 2], uv: [0, 18] },
      tail: { box: [2, 8, 2], uv: [9, 18] },
    },
    groups: { legs: ['leg'] },
    boxes: [
      { part: 'head', at: [-3, 10.5, -9] },
      { part: 'ear', at: [-3, 8.5, -7] },
      { part: 'ear', at: [1, 8.5, -7] },
      { part: 'snout', at: [-1.5, 13.5, -12] },
      { part: 'mane', at: [-4, 10, -6] },
      { part: 'body', at: [-3, 11, 2] },
      { part: 'leg', at: [-2.5, 16, 6], mirror: true },
      { part: 'leg', at: [0.5, 16, 6] },
      { part: 'leg', at: [-2.5, 16, -5], mirror: true },
      { part: 'leg', at: [0.5, 16, -5] },
      { part: 'tail', at: [-1, 12, 7] },
    ],
    opaque: true,
    usedBy: ['textures/entity/wolf/wolf.png and its _tame and _angry variants', 'the other wolf variants (ashen, black, chestnut, rusty, snowy, spotted, striped, woods)', 'wolf_collar.png (same layout, transparent but for the collar on the mane)'],
    note: 'The mane (the shaggy front half) and the body lie along the wolf: their top is its back. Both ears share one texture, and all four legs too; the right legs are mirrored. In game the tail angles back and the head sits half a pixel off the grid; the views show the tail straight down and snap to whole pixels.',
  },
  {
    id: 'cat',
    title: 'Cat and ocelot (64×32)',
    size: [64, 32],
    parts: {
      head: { box: [5, 4, 5], uv: [0, 0] },
      nose: { box: [3, 2, 2], uv: [0, 24] },
      rightEar: { box: [1, 1, 2], uv: [0, 10] },
      leftEar: { box: [1, 1, 2], uv: [6, 10] },
      body: { box: [4, 16, 6], uv: [20, 0], turned: true },
      tail: { box: [1, 8, 1], uv: [0, 15], turned: true },
      tailTip: { box: [1, 8, 1], uv: [4, 15], turned: true },
      frontLeg: { box: [2, 10, 2], uv: [40, 0] },
      hindLeg: { box: [2, 6, 2], uv: [8, 13] },
    },
    groups: { ears: ['rightEar', 'leftEar'], legs: ['frontLeg', 'hindLeg'], tails: ['tail', 'tailTip'] },
    boxes: [
      { part: 'head', at: [-2.5, 13, -12] },
      { part: 'nose', at: [-1.5, 15, -13] },
      { part: 'rightEar', at: [-2, 12, -9] },
      { part: 'leftEar', at: [1, 12, -9] },
      // Legs first: their tops share the body's height and sit inside it.
      { part: 'frontLeg', at: [-2.2, 14, -5] },
      { part: 'frontLeg', at: [0.2, 14, -5] },
      { part: 'hindLeg', at: [-2.1, 18, 6] },
      { part: 'hindLeg', at: [0.1, 18, 6] },
      { part: 'body', at: [-2, 14, -7] },
      { part: 'tail', at: [-0.5, 14, 8] },
      { part: 'tailTip', at: [-0.5, 14, 16] },
    ],
    opaque: true,
    usedBy: [
      'textures/entity/cat/*.png (tabby, black, red, siamese, british_shorthair, calico, persian, ragdoll, white, jellie, all_black)',
      'textures/entity/cat/ocelot.png',
      'cat_collar.png (same layout, transparent but for the collar, tinted with its dye color)',
    ],
    note: 'The body lies along the cat (body.top is its back, body.back its rump). The tail is two lying pieces, tail then tailTip, named as when the cat runs with its tail straight back (their top is the upper side); walking, it hangs in a curve. Both front legs share one texture, and both hind legs another. The nose sits on the bottom half of head.front.',
  },
  {
    id: 'hoglin',
    title: 'Hoglin (128×64)',
    size: [128, 64],
    parts: {
      body: { box: [16, 14, 26], uv: [1, 1] },
      mane: { box: [0, 10, 19], uv: [90, 33] },
      head: { box: [14, 6, 19], uv: [61, 1] },
      rightEar: { box: [6, 1, 4], uv: [1, 1] },
      leftEar: { box: [6, 1, 4], uv: [1, 6] },
      rightHorn: { box: [2, 11, 2], uv: [10, 13] },
      leftHorn: { box: [2, 11, 2], uv: [1, 13] },
      rightFrontLeg: { box: [6, 14, 6], uv: [66, 42] },
      leftFrontLeg: { box: [6, 14, 6], uv: [41, 42] },
      rightHindLeg: { box: [5, 11, 5], uv: [21, 45] },
      leftHindLeg: { box: [5, 11, 5], uv: [0, 45] },
    },
    groups: {
      ears: ['rightEar', 'leftEar'],
      horns: ['rightHorn', 'leftHorn'],
      legs: ['rightFrontLeg', 'leftFrontLeg', 'rightHindLeg', 'leftHindLeg'],
    },
    boxes: [
      { part: 'body', at: [-8, 0, -13] },
      { part: 'mane', at: [0, -7, -16] },
      { part: 'head', at: [-7, -1, -31] },
      { part: 'rightEar', at: [-12, -1, -17] },
      { part: 'leftEar', at: [6, -1, -17] },
      { part: 'rightHorn', at: [-8, -7, -25] },
      { part: 'leftHorn', at: [6, -7, -25] },
      { part: 'rightFrontLeg', at: [-7, 10, -11.5] },
      { part: 'leftFrontLeg', at: [1, 10, -11.5] },
      { part: 'rightHindLeg', at: [-7.5, 13, 7.5] },
      { part: 'leftHindLeg', at: [2.5, 13, 7.5] },
    ],
    usedBy: ['textures/entity/hoglin/hoglin.png', 'zoglin.png'],
    note: 'The mane is a flat fin along the spine with only .right and .left faces, and transparent pixels cut its outline. In game the head hangs tilted 50° down and the ears angle out; the views show them straight. Every leg has its own texture.',
  },
  {
    id: 'iron_golem',
    title: 'Iron golem (128×128)',
    size: [128, 128],
    parts: {
      head: { box: [8, 10, 8], uv: [0, 0] },
      nose: { box: [2, 4, 2], uv: [24, 0] },
      body: { box: [18, 12, 11], uv: [0, 40] },
      waist: { box: [9, 5, 6], uv: [0, 70] },
      rightArm: { box: [4, 30, 6], uv: [60, 21] },
      leftArm: { box: [4, 30, 6], uv: [60, 58] },
      rightLeg: { box: [6, 16, 5], uv: [37, 0] },
      leftLeg: { box: [6, 16, 5], uv: [60, 0] },
    },
    groups: { arms: ['rightArm', 'leftArm'], legs: ['rightLeg', 'leftLeg'], limbs: ['rightArm', 'leftArm', 'rightLeg', 'leftLeg'] },
    boxes: [
      { part: 'head', at: [-4, -19, -7.5] },
      { part: 'nose', at: [-1, -12, -9.5] },
      { part: 'body', at: [-9, -9, -6] },
      { part: 'waist', at: [-4.5, 3, -3] },
      { part: 'rightArm', at: [-13, -9.5, -3] },
      { part: 'leftArm', at: [9, -9.5, -3] },
      { part: 'rightLeg', at: [-7.5, 8, -3] },
      { part: 'leftLeg', at: [1.5, 8, -3], mirror: true },
    ],
    opaque: true,
    usedBy: ['textures/entity/iron_golem/iron_golem.png', 'iron_golem_crackiness_low.png, _medium.png and _high.png (cracks over the golem, same layout, transparent elsewhere)'],
    note: 'The head sits low, in front of the shoulders, the nose covering rows 7–9 of head.front and hanging one pixel below the chin. The waist is drawn slightly larger than its box. The left leg has its own texture, drawn mirrored like a vanilla left limb, so paint it as a copy of the right leg seen from the other side.',
  },
  {
    id: 'witch',
    title: 'Witch (64×128)',
    size: [64, 128],
    parts: {
      head: { box: [8, 10, 8], uv: [0, 0] },
      nose: { box: [2, 4, 2], uv: [24, 0] },
      mole: { box: [1, 1, 1], uv: [0, 0] },
      brim: { box: [10, 2, 10], uv: [0, 64] },
      hatLow: { box: [7, 4, 7], uv: [0, 76] },
      hatHigh: { box: [4, 4, 4], uv: [0, 87] },
      hatTip: { box: [1, 2, 1], uv: [0, 95] },
      body: { box: [8, 12, 6], uv: [16, 20] },
      jacket: { box: [8, 20, 6], uv: [0, 38] },
      arm: { box: [4, 8, 4], uv: [44, 22] },
      armsMiddle: { box: [8, 4, 4], uv: [40, 38] },
      leg: { box: [4, 12, 4], uv: [0, 22] },
    },
    groups: { hat: ['brim', 'hatLow', 'hatHigh', 'hatTip'], arms: ['arm', 'armsMiddle'], legs: ['leg'] },
    boxes: [
      { part: 'head', at: [-4, -10, -4] },
      { part: 'nose', at: [-1, -3, -6] },
      { part: 'mole', at: [0, -1, -6.75] },
      { part: 'brim', at: [-5, -10, -5] },
      { part: 'hatLow', at: [-3.25, -14, -3] },
      { part: 'hatHigh', at: [-1.5, -18, -1] },
      { part: 'hatTip', at: [0.25, -20, 1] },
      { part: 'body', at: [-4, 0, -3] },
      { part: 'jacket', at: [-4, 0, -3] },
      { part: 'leg', at: [-4, 12, -2] },
      { part: 'leg', at: [0, 12, -2], mirror: true },
      { part: 'arm', at: [-8, 1, -3] },
      { part: 'arm', at: [4, 1, -3], mirror: true },
      { part: 'armsMiddle', at: [-4, 5, -3] },
    ],
    usedBy: ['textures/entity/witch.png'],
    note: 'A villager body (robe on jacket, crossed arms) under a pointed hat of four stacked boxes: brim, hatLow, hatHigh, hatTip. The brim covers the top two rows of head.front. The mole is a 1-pixel box on the nose, whose texture sits in head\'s unused top-left corner. In game the hat bends back a little at each step and the nose wiggles; the views show them straight.',
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
  zombified_piglin: 'piglin',
  piglin_brute: 'piglin',
  temperate_pig: 'pig',
  warm_pig: 'pig',
  cold_pig: 'pig',
  temperate_cow: 'cow',
  mooshroom: 'cow',
  sheep_wool_undercoat: 'sheep',
  temperate_chicken: 'chicken',
  warm_chicken: 'chicken',
  zoglin: 'hoglin',
  ocelot: 'cat',
  cat_collar: 'cat',
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
/** A box with no width (a hoglin's mane) is a plane seen from the sides. */
const PLANE_FACES: readonly FaceName[] = ['right', 'left'];
const rigs = new Map<string, Rig>();

export function rigFor(layout: LayoutDef | string = 'player', model: Model = 'classic'): Rig {
  const def = typeof layout === 'string' ? (resolveLayout(layout) ?? LAYOUTS.player) : layout;
  const slim = def.id === 'player' && model === 'slim';
  const key = `${def.id}:${slim ? 'slim' : 'classic'}`;
  const cached = rigs.get(key);
  if (cached) return cached;
  const parts: Record<string, PartDef> = {};
  const texBox: Record<string, [number, number, number]> = {};
  for (const [name, p] of Object.entries(def.parts)) {
    const part = slim && SLIM[name] ? { ...p, ...SLIM[name] } : p;
    texBox[name] = part.box;
    parts[name] = part.turned ? { ...part, box: [part.box[0], part.box[2], part.box[1]] } : part;
  }
  const boxes = slim ? def.boxes.map((b) => (SLIM_BOXES[b.part] ? { ...b, at: SLIM_BOXES[b.part] } : b)) : def.boxes;
  const names = Object.keys(parts);
  const faces = (part: PartName) => (parts[part]?.box[2] === 0 ? FLAT_FACES : parts[part]?.box[0] === 0 ? PLANE_FACES : FACES);
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
      return p.turned ? turnedFace(u, v, texBox[part], face) : boxFace(u, v, p.box, face);
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

type Vec3 = [number, number, number];

/**
 * Where the center of face-local pixel (x, y) sits on an upright w×h×d box, in box coordinates: x
 * toward the box's left, y down, z from front to back. It follows Java's cube UVs, so `boxFace`
 * local (0, 0) is the top-left of the face seen from outside, and top and bottom have the back at row 0.
 */
function facePoint([w, h, d]: Vec3, face: FaceName, x: number, y: number): Vec3 {
  const px = x + 0.5, py = y + 0.5;
  switch (face) {
    case 'front': return [px, py, 0];
    case 'back': return [w - px, py, d];
    case 'top': return [px, 0, d - py];
    case 'bottom': return [px, h, d - py];
    case 'right': return [0, py, d - px];
    case 'left': return [w, py, px];
  }
}

/**
 * The face and local pixel a point on the surface of an upright box belongs to (inverse of `facePoint`).
 * `side` picks the side face of a box with no width, where both sides share x = 0.
 */
function pointFace([w, h, d]: Vec3, [X, Y, Z]: Vec3, side?: FaceName): [FaceName, number, number] {
  const px = (v: number) => Math.floor(v);
  if (!side) {
    if (Z === 0) return ['front', px(X), px(Y)];
    if (Z === d) return ['back', px(w - X), px(Y)];
    if (Y === 0) return ['top', px(X), px(d - Z)];
    if (Y === h) return ['bottom', px(X), px(d - Z)];
  }
  if (side === 'right' || (!side && X === 0)) return ['right', px(d - Z), px(Y)];
  return ['left', px(Z), px(Y)];
}

/**
 * A face of a part turned 90° about x (Java xRot = π/2: y' = −z, z' = y). `tex` is the texture
 * box [w, h, d]; the model box is [w, d, h]. The face's pixels are found on the texture box by
 * turning their positions back, and the result is an affine map from upright local pixels.
 */
function turnedFace(u: number, v: number, tex: Vec3, face: FaceName): Rect {
  const [w, h, d] = tex;
  const model: Vec3 = [w, d, h];
  // Turning about x keeps the side faces on their side.
  const side = face === 'right' || face === 'left' ? face : undefined;
  const at = (x: number, y: number): [number, number] => {
    const [X, Y, Z] = facePoint(model, face, x, y);
    const [src, sx, sy] = pointFace(tex, [X, Z, d - Y], side);
    const r = boxFace(u, v, tex, src);
    return [r.x + sx, r.y + sy];
  };
  const [fw, fh] = face === 'front' || face === 'back' ? [w, d] : face === 'top' || face === 'bottom' ? [w, h] : [h, d];
  const [ox, oy] = at(0, 0), [ax, ay] = at(1, 0), [bx, by] = at(0, 1);
  return { x: ox, y: oy, w: fw, h: fh, m: [ax - ox, bx - ox, ay - oy, by - oy] };
}

/** Texture pixel of a face-local pixel; faces of turned parts map through `m`. */
export function texel(r: Rect, x: number, y: number): [number, number] {
  return r.m ? [r.x + r.m[0] * x + r.m[1] * y, r.y + r.m[2] * x + r.m[3] * y] : [r.x + x, r.y + y];
}

/** Face-local pixel of a texture pixel, or null when the pixel is outside the face. */
function local(r: Rect, tx: number, ty: number): [number, number] | null {
  const dx = tx - r.x, dy = ty - r.y;
  // m is a signed permutation matrix, so its inverse is its transpose (+ 0 turns −0 into 0).
  const [x, y] = r.m ? [r.m[0] * dx + r.m[2] * dy + 0, r.m[1] * dx + r.m[3] * dy + 0] : [dx, dy];
  return x >= 0 && y >= 0 && x < r.w && y < r.h ? [x, y] : null;
}

/** A face-local pixel: column, then row. */
export type FacePixel = readonly [x: number, y: number];

/** Two pixels side by side across an edge: `a` on the edge's first face, `b` on its second. */
export interface EdgePair {
  a: FacePixel;
  b: FacePixel;
}

/** Two faces of one box that meet at an edge, with the pixels that touch across it. */
export interface FaceEdge {
  part: PartName;
  faces: readonly [FaceName, FaceName];
  pairs: EdgePair[];
}

/** The axis each face looks along: x for the sides, y for top and bottom, z for front and back. */
const NORMAL_AXIS: Record<FaceName, 0 | 1 | 2> = { right: 0, left: 0, top: 1, bottom: 1, front: 2, back: 2 };

/**
 * The twelve edges of a part's box, in face-local pixels. Works on the box as seen in game, so a
 * turned part's edges join the faces that meet in game. Flat and zero-width parts have none.
 */
export function boxEdges(rig: Rig, part: PartName): FaceEdge[] {
  const def = rig.part(part);
  if (!def || rig.faces(part).length !== FACES.length) return [];
  const box = def.box;
  const edges = new Map<string, FaceEdge>();
  for (const a of FACES) {
    const { w, h } = rig.faceRect(part, a, 'base');
    const n = NORMAL_AXIS[a];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = facePoint(box, a, x, y);
        for (const axis of [0, 1, 2] as const) {
          if (axis === n) continue;
          for (const bound of [0, box[axis]]) {
            if (Math.abs(p[axis] - bound) !== 0.5) continue;
            // The neighbor's center: on the edge's other plane, half a pixel in from this face.
            const q: Vec3 = [...p];
            q[axis] = bound;
            q[n] = p[n] === 0 ? 0.5 : box[n] - 0.5;
            const [b, bx, by] = pointFace(box, q);
            if (FACES.indexOf(b) <= FACES.indexOf(a)) continue;
            const key = `${a}|${b}`;
            const edge = edges.get(key) ?? { part, faces: [a, b], pairs: [] };
            edge.pairs.push({ a: [x, y], b: [bx, by] });
            edges.set(key, edge);
          }
        }
      }
  }
  return [...edges.values()];
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
  const lines = ['| layout | size | parts (box w×h×d as in game; * has @overlay) | used by |', '| --- | --- | --- | --- |'];
  for (const def of LAYOUT_LIST) {
    const aliases = Object.entries(LAYOUT_ALIASES).filter(([, v]) => v === def.id).map(([k]) => k);
    const parts = Object.entries(def.parts).map(([name, p]) => `${name} ${!p.box[2] ? `${p.box[0]}×${p.box[1]} flat` : p.turned ? `${p.box[0]}×${p.box[2]}×${p.box[1]} lying` : p.box.join('×')}${p.overlay ? '*' : ''}`).join(', ');
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
    const l = local(rig.faceRect(ref.part, ref.face, ref.layer), tx, ty);
    if (l) return { ...ref, x: l[0], y: l[1] };
  }
  return null;
}
