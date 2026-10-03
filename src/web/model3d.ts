import { type BoxDef, FACES, type Rig, rigFor } from '../core/layout';
import type { FaceName, LayerName, Model, PartName, Rect } from '../core/types';

/** Pivot (joint) position in skin pixels, origin at the top-center of the head; plus box center offset from the pivot. */
function rig(model: Model): Record<PartName, { pivot: [number, number]; offset: number }> {
  const armX = model === 'slim' ? 5.5 : 6;
  return {
    head: { pivot: [0, 8], offset: -4 },
    body: { pivot: [0, 8], offset: 6 },
    rightArm: { pivot: [-armX, 10], offset: 4 },
    leftArm: { pivot: [armX, 10], offset: 4 },
    rightLeg: { pivot: [-2, 20], offset: 6 },
    leftLeg: { pivot: [2, 20], offset: 6 },
  };
}

const INFLATE: Record<PartName, number> = { head: 0.5, body: 0.25, rightArm: 0.25, leftArm: 0.25, rightLeg: 0.25, leftLeg: 0.25 };
const u = (n: number) => `calc(var(--u) * ${+n.toFixed(4)})`;

function faceTransform(face: FaceName, w: number, h: number, d: number): string {
  switch (face) {
    case 'front': return `translateZ(${u(d / 2)})`;
    case 'back': return `rotateY(180deg) translateZ(${u(d / 2)})`;
    case 'right': return `rotateY(-90deg) translateZ(${u(w / 2)})`;
    case 'left': return `rotateY(90deg) translateZ(${u(w / 2)})`;
    case 'top': return `rotateX(90deg) translateZ(${u(h / 2)})`;
    case 'bottom': return `rotateX(-90deg) translateZ(${u(h / 2)})`;
  }
}

const SWAP: Record<FaceName, FaceName> = { top: 'top', bottom: 'bottom', front: 'front', back: 'back', right: 'left', left: 'right' };

/**
 * One textured box. `mirror` shows the part's texture flipped with right and left swapped (a
 * mirrored limb); `tile` wraps every face with the flat texture (a block shown as a cube).
 */
function buildBox(rig: Rig, part: PartName, layer: LayerName, opts: { mirror?: boolean; tile?: boolean; inflate?: number } = {}): HTMLElement {
  const [bw, bh, bd] = opts.tile ? [rig.part(part)!.box[0], rig.part(part)!.box[1], rig.part(part)!.box[0]] : rig.part(part)!.box;
  const inf = layer === 'overlay' ? (opts.inflate ?? 0.25) : 0;
  const w = bw + inf * 2, h = bh + inf * 2, d = bd + inf * 2;
  const box = document.createElement('div');
  box.className = `sm-box sm-${layer}`;
  const faces = opts.tile ? FACES : rig.faces(part).length === 1 ? (['front', 'back'] as FaceName[]) : rig.faces(part);
  for (const face of faces) {
    const src = opts.tile || rig.faces(part).length === 1 ? 'front' : opts.mirror ? SWAP[face] : face;
    const flip = Boolean(opts.mirror) !== (rig.faces(part).length === 1 && face === 'back');
    const r = rig.faceRect(part, src, layer);
    const dw = face === 'left' || face === 'right' ? d : w;
    const dh = face === 'top' || face === 'bottom' ? d : h;
    const sx = dw / r.w, sy = dh / r.h;
    const el = document.createElement('div');
    el.className = `sm-face sm-${face}`;
    el.dataset.part = part;
    el.dataset.face = src;
    el.dataset.layer = layer;
    el.style.cssText = [
      `width:${u(dw)}`,
      `height:${u(dh)}`,
      `left:${u(-dw / 2)}`,
      `top:${u(-dh / 2)}`,
      `background-size:${u(rig.width * sx)} ${u(rig.height * sy)}`,
      `background-position:${u(-r.x * sx)} ${u(-r.y * sy)}`,
      `transform:${faceTransform(face, w, h, d)}${flip ? ' scaleX(-1)' : ''}`,
    ].join(';');
    if (r.m) el.append(turnedTexture(rig, r, sx, sy));
    box.appendChild(el);
  }
  return box;
}

/**
 * A face of a turned part shows its texels turned too: the whole texture on an inner layer, mapped
 * onto the face by the inverse of the face's texel map (a signed permutation, so its transpose).
 */
function turnedTexture(rig: Rig, r: Rect, sx: number, sy: number): HTMLElement {
  const [a, b, c, d] = r.m!;
  // Texture position of the face's (0, 0) corner: pixel centers map to pixel centers.
  const cx = r.x + 0.5 - (a + b) / 2, cy = r.y + 0.5 - (c + d) / 2;
  const inner = document.createElement('div');
  inner.className = 'sm-face-texture';
  inner.style.cssText = [
    `width:${u(rig.width)}`,
    `height:${u(rig.height)}`,
    `transform:translate(${u(-sx * (a * cx + c * cy))}, ${u(-sy * (b * cx + d * cy))}) matrix(${sx * a}, ${sy * b}, ${sx * c}, ${sy * d}, 0, 0)`,
  ].join(';');
  return inner;
}

/** Pauses animations of models scrolled out of view. */
const visibility =
  typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver((entries) => {
        for (const e of entries) e.target.classList.toggle('is-offscreen', !e.isIntersecting);
      });

export interface ModelView {
  yaw?: number;
  pitch?: number;
  overlay?: boolean;
  animate?: 'walk' | 'idle' | 'none';
  spin?: boolean;
}

/** A Minecraft model (player, mob, cape, item or block) made of CSS 3D-transformed divs, textured with one image. */
export class SkinModel {
  readonly root: HTMLElement;
  /** Width and height of the figure in texture pixels, for fitting it into its host. */
  extent: [number, number] = [16, 32];
  onExtent: (() => void) | null = null;
  private figure: HTMLElement;
  private key: string | null = null;
  private state: Required<ModelView> = { yaw: -28, pitch: -12, overlay: true, animate: 'idle', spin: false };

  constructor(host: HTMLElement, view: ModelView = {}) {
    this.root = document.createElement('div');
    this.root.className = 'sm-scene';
    this.figure = document.createElement('div');
    this.figure.className = 'sm-figure';
    this.root.appendChild(this.figure);
    host.appendChild(this.root);
    this.setView(view);
    visibility?.observe(this.root);
  }

  setSkin(url: string, model: Model, layout = 'player') {
    const key = `${layout}:${model}`;
    if (key !== this.key) {
      this.key = key;
      const r = rigFor(layout, model);
      this.root.dataset.layout = r.layout;
      if (r.layout === 'player') this.rebuild(model);
      else this.rebuildBoxes(r);
      this.onExtent?.();
    }
    this.root.style.setProperty('--skin', `url("${url}")`);
  }

  /** Any layout other than the player: one static box per entry in the layout's box list. */
  private rebuildBoxes(r: Rig) {
    this.figure.replaceChildren();
    const size = (b: BoxDef) => r.part(b.part)!.box;
    const flat = r.parts.every((p) => r.faces(p).length === 1);
    const lo = [0, 1, 2].map((i) => Math.min(...r.boxes.map((b) => b.at[i])));
    const hi = [0, 1, 2].map((i) => Math.max(...r.boxes.map((b) => b.at[i] + (flat && i === 2 ? size(b)[0] : size(b)[i]))));
    const mid = lo.map((v, i) => (v + hi[i]) / 2);
    this.extent = [Math.max(hi[0] - lo[0], hi[2] - lo[2]), hi[1] - lo[1]];
    for (const b of r.boxes) {
      const [w, h, d] = size(b);
      const tile = flat && r.layout === 'block';
      const depth = tile ? w : d;
      const joint = document.createElement('div');
      joint.className = `sm-joint sm-part-${b.part}`;
      joint.style.transform = `translate3d(${u(b.at[0] + w / 2 - mid[0])}, ${u(b.at[1] + h / 2 - mid[1])}, ${u(-(b.at[2] + depth / 2 - mid[2]))})`;
      const holder = document.createElement('div');
      holder.className = 'sm-holder';
      holder.append(buildBox(r, b.part, 'base', { mirror: b.mirror, tile }));
      if (r.hasLayer(b.part, 'overlay')) holder.append(buildBox(r, b.part, 'overlay', { mirror: b.mirror, inflate: 0.5 }));
      joint.appendChild(holder);
      this.figure.appendChild(joint);
    }
  }

  private rebuild(model: Model) {
    this.extent = [16, 32];
    this.figure.replaceChildren();
    const r = rig(model);
    const player = rigFor('player', model);
    for (const part of Object.keys(r) as PartName[]) {
      const { pivot, offset } = r[part];
      const joint = document.createElement('div');
      joint.className = `sm-joint sm-${part}`;
      joint.style.transform = `translate3d(${u(pivot[0])}, ${u(pivot[1] - 16)}, 0)`;
      const swing = document.createElement('div');
      swing.className = 'sm-swing';
      const holder = document.createElement('div');
      holder.className = 'sm-holder';
      holder.style.transform = `translateY(${u(offset)})`;
      holder.append(buildBox(player, part, 'base'), buildBox(player, part, 'overlay', { inflate: INFLATE[part] }));
      swing.appendChild(holder);
      joint.appendChild(swing);
      this.figure.appendChild(joint);
    }
  }

  setView(view: ModelView) {
    Object.assign(this.state, Object.fromEntries(Object.entries(view).filter(([, v]) => v !== undefined)));
    const s = this.state;
    this.root.style.setProperty('--yaw', `${s.yaw}deg`);
    this.root.style.setProperty('--pitch', `${s.pitch}deg`);
    this.root.classList.toggle('no-overlay', !s.overlay);
    this.root.classList.toggle('spin', s.spin);
    this.root.dataset.anim = s.animate;
  }

  /** Stop auto-spin, keeping the current on-screen angle. */
  freeze() {
    if (!this.state.spin) return;
    const anim = this.figure.getAnimations().find((a) => (a as CSSAnimation).animationName === 'sm-spin');
    let yaw = this.state.yaw;
    if (anim) {
      const t = Number(anim.currentTime ?? 0);
      const dur = Number(anim.effect?.getComputedTiming().duration ?? 1) || 1;
      yaw += 360 * ((t % dur) / dur);
    }
    this.setView({ spin: false, yaw: ((yaw + 180) % 360) - 180 });
  }

  getView(): Required<ModelView> {
    return { ...this.state };
  }

  /**
   * Drag to rotate (pointer + keyboard). Pointer-downs on interactive children are ignored, and
   * `allowDrag` can veto a drag (e.g. while the pointer is used to paint).
   */
  enableControls(target: HTMLElement = this.root, allowDrag: (e: PointerEvent) => boolean = () => true) {
    let start: { x: number; y: number; yaw: number; pitch: number } | null = null;
    target.style.touchAction = 'none';
    target.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button, a, input, select, label, textarea, [data-no-drag]') || !allowDrag(e)) return;
      this.freeze();
      start = { x: e.clientX, y: e.clientY, yaw: this.state.yaw, pitch: this.state.pitch };
      target.setPointerCapture(e.pointerId);
      target.classList.add('dragging');
    });
    target.addEventListener('pointermove', (e) => {
      if (!start) return;
      this.setView({ yaw: start.yaw + (e.clientX - start.x) * 0.6, pitch: Math.max(-60, Math.min(60, start.pitch - (e.clientY - start.y) * 0.4)) });
    });
    const end = () => {
      start = null;
      target.classList.remove('dragging');
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    if (!target.hasAttribute('tabindex')) target.tabIndex = 0;
    target.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 45 : 15;
      if (e.key === 'ArrowLeft') this.setView({ yaw: this.state.yaw - step });
      else if (e.key === 'ArrowRight') this.setView({ yaw: this.state.yaw + step });
      else if (e.key === 'ArrowUp') this.setView({ pitch: Math.max(-60, this.state.pitch - 10) });
      else if (e.key === 'ArrowDown') this.setView({ pitch: Math.min(60, this.state.pitch + 10) });
      else return;
      e.preventDefault();
    });
  }
}

/** Scale a model to fill its host, following resizes. */
export function fitModel(model: SkinModel, host: HTMLElement, max = Infinity) {
  const fit = () => {
    const { width, height } = host.getBoundingClientRect();
    const [w, h] = model.extent;
    model.root.style.setProperty('--u', `${Math.max(4, Math.min(width / (w + 6), height / (h + 6), max)).toFixed(2)}px`);
  };
  model.onExtent = fit;
  new ResizeObserver(fit).observe(host);
}
