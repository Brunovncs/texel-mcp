export type Model = 'classic' | 'slim';
/** A part of the texture layout: head, body, rightArm… for players; leg, cape, item… elsewhere. */
export type PartName = string;
export type FaceName = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back';
export type LayerName = 'base' | 'overlay';
export type RGBA = [number, number, number, number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * For a face of a turned part: the texture pixel of face-local (x, y) is (x + m0·x + m1·y,
   * y + m2·x + m3·y), with (x, y) here the texture pixel of local (0, 0). Read faces through `texel`.
   */
  m?: [number, number, number, number];
}

/** One face of one part, both layers together (as seen in game). */
export interface PartFace {
  part: PartName;
  face: FaceName;
}

/** One layer of one face. */
export interface FaceRef extends PartFace {
  layer: LayerName;
}

/** A color expression: "#rrggbb", "#rgb", "#rrggbbaa", "transparent", a palette key, optionally with ":<lightness shift>" (e.g. "shirt:-15"). */
export type ColorExpr = string;
/** A target selector: "<parts>[.<faces>][@<layer>]", e.g. "head.front", "arms.sides@overlay", "legs+body". */
export type Selector = string | string[];

export interface OpBase {
  op: string;
  id?: string;
  note?: string;
  enabled?: boolean;
  /** The pixels this op paints glow: they also go to the emissive texture (<name>_eyes.png). On "face", only the eyes. */
  emissive?: boolean;
}

export interface AreaOpts {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** Named rows instead of y/h: collar, chest, belt, waist, sleeves, longSleeves, cuffs, hands, gloves, knees, shoes, boots. */
  region?: string;
}

export interface FillOp extends OpBase, AreaOpts { op: 'fill'; target: Selector; color: ColorExpr }
export interface RectOp extends OpBase, AreaOpts { op: 'rect'; target: Selector; color: ColorExpr }
export interface ClearOp extends OpBase, AreaOpts { op: 'clear'; target: Selector }
export interface PixelsOp extends OpBase {
  op: 'pixels';
  target: Selector;
  x?: number;
  y?: number;
  rows: string[];
  legend?: Record<string, ColorExpr>;
}
export interface PointsOp extends OpBase { op: 'points'; target: Selector; points: [number, number][]; color: ColorExpr }
export interface LineOp extends OpBase { op: 'line'; target: Selector; from: [number, number]; to: [number, number]; color: ColorExpr }
export interface GradientOp extends OpBase, AreaOpts {
  op: 'gradient';
  target: Selector;
  from: ColorExpr;
  to: ColorExpr;
  direction?: 'vertical' | 'horizontal';
  steps?: number;
}
export interface PatternOp extends OpBase, AreaOpts {
  op: 'pattern';
  target: Selector;
  kind: 'checker' | 'stripes-h' | 'stripes-v' | 'diagonal';
  colors: ColorExpr[];
  size?: number;
}
export interface NoiseOp extends OpBase, AreaOpts {
  op: 'noise';
  target: Selector;
  colors?: ColorExpr[];
  density?: number;
  jitter?: number;
  seed?: number;
}
export interface ShadeOp extends OpBase, AreaOpts { op: 'shade'; target: Selector; amount: number }
export interface CopyOp extends OpBase { op: 'copy'; from: string; to: Selector; flip?: 'h' | 'v' | 'hv' }
export interface MirrorOp extends OpBase { op: 'mirror'; from: PartName; to: PartName; layer?: LayerName | 'both' }
export interface SymmetrizeOp extends OpBase { op: 'symmetrize'; target: Selector; source?: 'left' | 'right' }

export interface MaterialOp extends OpBase, AreaOpts {
  op: 'material';
  target: Selector;
  color: ColorExpr;
  kind: 'plain' | 'skin' | 'fabric' | 'knit' | 'leather' | 'metal' | 'fur' | 'stone' | 'scales' | 'wood' | 'glow';
  seed?: number;
}
export interface FaceOp extends OpBase {
  op: 'face';
  target?: Selector;
  skin: ColorExpr;
  eyes: ColorExpr;
  eyeStyle?: 'normal' | 'wide' | 'cute' | 'angry' | 'sad' | 'closed' | 'glow' | 'visor' | 'narrow';
  mouth?: 'neutral' | 'smile' | 'grin' | 'open' | 'frown' | 'fangs' | 'none';
  beard?: 'none' | 'stubble' | 'full' | 'mustache' | 'goatee';
  nose?: boolean;
  white?: ColorExpr;
  brows?: ColorExpr | 'none';
  mouthColor?: ColorExpr;
  beardColor?: ColorExpr;
  blush?: boolean | ColorExpr;
}
export interface HairOp extends OpBase {
  op: 'hair';
  color: ColorExpr;
  style?: 'short' | 'buzz' | 'bob' | 'long' | 'spiky' | 'curly' | 'ponytail' | 'mohawk';
  fringe?: 'full' | 'side' | 'parted' | 'none';
  layer?: LayerName | 'both';
}
export interface LightingOp extends OpBase { op: 'lighting'; target?: Selector; strength?: number }
/** A frame in the vanilla GUI style: light top-left and dark bottom-right edges (raised), or the reverse (inset). */
export interface BevelOp extends OpBase, AreaOpts {
  op: 'bevel';
  target: Selector;
  color: ColorExpr;
  style?: 'raised' | 'inset';
  light?: ColorExpr;
  dark?: ColorExpr;
  /** A 1-pixel border around the bevel with its corner pixels left out, like vanilla panels and buttons. */
  outline?: ColorExpr;
  depth?: number;
}

export type Op =
  | FillOp
  | RectOp
  | ClearOp
  | PixelsOp
  | PointsOp
  | LineOp
  | GradientOp
  | PatternOp
  | NoiseOp
  | ShadeOp
  | CopyOp
  | MirrorOp
  | SymmetrizeOp
  | MaterialOp
  | FaceOp
  | HairOp
  | LightingOp
  | BevelOp;

export interface SkinSpec {
  $schema?: string;
  version: 1;
  name?: string;
  description?: string;
  author?: string;
  tags?: string[];
  /** Texture layout: player (default), zombie, humanoid (armor), skeleton, creeper, cape, item, block. */
  layout?: string;
  /** Arm width, player layout only. */
  model?: Model;
  palette?: Record<string, ColorExpr>;
  legend?: Record<string, ColorExpr>;
  layers: Op[];
  /** Texture size, [width, height], for layouts that take one (gui, painting, particle, HD items and blocks). */
  size?: [number, number];
  /** Where the texture goes in a resource pack: "item/ruby" or "mymod:item/ruby" (under textures/, no .png). */
  asset?: string;
  /** Frames for item, block, GUI and particle textures: each one a patch over the layers. */
  animation?: Animation;
  /** GUI sprites: how the game resizes the sprite, written to its .png.mcmeta. */
  gui?: { scaling: GuiScaling };
}

export interface AnimationFrame {
  /** Changes from the spec's own layers for this frame (patch entries, by layer id). Empty or missing: the spec as it is. */
  patch?: unknown[];
  /** Ticks this frame shows, overriding "frametime". */
  time?: number;
}

export interface Animation {
  /** Ticks per frame (20 ticks = 1 second). Default 1. */
  frametime?: number;
  /** Blend between frames (vanilla does it for magma and prismarine). */
  interpolate?: boolean;
  frames: AnimationFrame[];
}

export type GuiScaling =
  | { type: 'stretch' }
  | { type: 'tile'; width?: number; height?: number }
  | {
      type: 'nine_slice';
      width?: number;
      height?: number;
      border: number | { left: number; top: number; right: number; bottom: number };
      stretch_inner?: boolean;
    };

export type IssueLevel = 'error' | 'warning' | 'info';

export interface Issue {
  level: IssueLevel;
  code: string;
  path: string;
  message: string;
  hint?: string;
}

export interface Image {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
