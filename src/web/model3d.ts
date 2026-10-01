import { boxSize, faceRect, FACES } from '../core/layout';
import type { FaceName, LayerName, Model, PartName } from '../core/types';

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

function buildBox(part: PartName, layer: LayerName, model: Model): HTMLElement {
  const [bw, bh, bd] = boxSize(part, model);
  const inf = layer === 'overlay' ? INFLATE[part] : 0;
  const w = bw + inf * 2, h = bh + inf * 2, d = bd + inf * 2;
  const box = document.createElement('div');
  box.className = `sm-box sm-${layer}`;
  for (const face of FACES) {
    const r = faceRect(part, face, layer, model);
    const dw = face === 'left' || face === 'right' ? d : w;
    const dh = face === 'top' || face === 'bottom' ? d : h;
    const sx = dw / r.w, sy = dh / r.h;
    const el = document.createElement('div');
    el.className = `sm-face sm-${face}`;
    el.dataset.part = part;
    el.dataset.face = face;
    el.dataset.layer = layer;
    el.style.cssText = [
      `width:${u(dw)}`,
      `height:${u(dh)}`,
      `left:${u(-dw / 2)}`,
      `top:${u(-dh / 2)}`,
      `background-size:${u(64 * sx)} ${u(64 * sy)}`,
      `background-position:${u(-r.x * sx)} ${u(-r.y * sy)}`,
      `transform:${faceTransform(face, w, h, d)}`,
    ].join(';');
    box.appendChild(el);
  }
  return box;
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

/** A Minecraft player model made of CSS 3D-transformed divs, textured with one skin image. */
export class SkinModel {
  readonly root: HTMLElement;
  private figure: HTMLElement;
  private model: Model | null = null;
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

  setSkin(url: string, model: Model) {
    if (model !== this.model) this.rebuild(model);
    this.root.style.setProperty('--skin', `url("${url}")`);
  }

  private rebuild(model: Model) {
    this.model = model;
    this.figure.replaceChildren();
    const r = rig(model);
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
      holder.append(buildBox(part, 'base', model), buildBox(part, 'overlay', model));
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
