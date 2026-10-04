import { type BoxDef, type Rig, rigFor, texel } from './layout.js';
import type { FaceName, Image, Model, PartName } from './types.js';

export type ViewName = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';
/** The four views from the sides, the ones every volume has. */
export const SIDE_VIEWS: readonly ViewName[] = ['front', 'back', 'right', 'left'];
/** Every view, from the four sides, then from above and below. */
export const ALL_VIEWS: readonly ViewName[] = [...SIDE_VIEWS, 'top', 'bottom'];

/** A face drawn at (x, y) of a view; `flip` mirrors it horizontally (a mirrored box). */
type Placement = { part: PartName; face: FaceName; x: number; y: number; flip?: boolean };

const asRig = (r: Model | Rig): Rig => (typeof r === 'string' ? rigFor('player', r) : r);

/** Background of the views on review sheets, and the lighter one behind a close-up. */
const SHEET_BG: [number, number, number] = [22, 24, 29];
const PANEL_BG: [number, number, number] = [30, 33, 40];
/** A mid gray stands in for the rest of the model, so both dark and light edges read. */
const CLOSE_UP_BG: [number, number, number] = [72, 76, 84];
/** A close-up's largest view is scaled to about this many pixels, between these scales. */
const CLOSE_UP_SIZE = 240;
const CLOSE_UP_MIN_SCALE = 8;
const CLOSE_UP_MAX_SCALE = 24;

/** The views a layout has: a flat texture only has its front; an animal lying along its body is also seen from above. */
export function viewsOf(rig: Model | Rig): readonly ViewName[] {
  const r = asRig(rig);
  if (r.parts.every((p) => r.faces(p).length === 1)) return ['front'];
  return r.parts.some((p) => r.part(p)?.turned) ? [...SIDE_VIEWS, 'top'] : SIDE_VIEWS;
}

/** Hand-placed player views, kept pixel-identical to earlier sheets. "right" looks at the character's right side (their front is on the viewer's right). */
function playerPlacements(view: Exclude<ViewName, 'top' | 'bottom'>, model: Model): { w: number; h: number; parts: Placement[] } {
  const slim = model === 'slim' ? 1 : 0;
  const at = (list: [PartName, FaceName, number, number][]) => list.map(([part, face, x, y]) => ({ part, face, x, y }));
  switch (view) {
    case 'front':
      return { w: 16, h: 32, parts: at([['head', 'front', 4, 0], ['body', 'front', 4, 8], ['rightArm', 'front', slim, 8], ['leftArm', 'front', 12, 8], ['rightLeg', 'front', 4, 20], ['leftLeg', 'front', 8, 20]]) };
    case 'back':
      return { w: 16, h: 32, parts: at([['head', 'back', 4, 0], ['body', 'back', 4, 8], ['leftArm', 'back', slim, 8], ['rightArm', 'back', 12, 8], ['leftLeg', 'back', 4, 20], ['rightLeg', 'back', 8, 20]]) };
    case 'right':
      return { w: 8, h: 32, parts: at([['head', 'right', 0, 0], ['body', 'right', 2, 8], ['rightLeg', 'right', 2, 20], ['rightArm', 'right', 2, 8]]) };
    case 'left':
      return { w: 8, h: 32, parts: at([['head', 'left', 0, 0], ['body', 'left', 2, 8], ['leftLeg', 'left', 2, 20], ['leftArm', 'left', 2, 8]]) };
  }
}

const SWAP: Record<FaceName, FaceName> = { top: 'top', bottom: 'bottom', front: 'front', back: 'back', right: 'left', left: 'right' };

/**
 * Orthographic views projected from the layout's boxes, farthest box first. A mirrored box shows
 * its part's texture flipped, with the right and left faces swapped (how vanilla shares a texture
 * between two limbs). `only` limits the view to some parts. The bottom view is drawn like the top
 * one (back at the top of the image, x toward the model's left), so its rows match face-local ones.
 */
function boxPlacements(rig: Rig, view: ViewName, only?: ReadonlySet<PartName>): { w: number; h: number; parts: Placement[] } {
  const size = (b: BoxDef) => rig.part(b.part)?.box ?? [0, 0, 0];
  // Java places some boxes on half pixels (a wolf's legs); the views snap them to the pixel grid.
  const boxes = rig.boxes.filter((b) => !only || only.has(b.part)).map((b): BoxDef => ({ ...b, at: b.at.map(Math.round) as [number, number, number] }));
  // A part without a box (a villager's hat rim) has nothing to draw.
  if (!boxes.length) return { w: 0, h: 0, parts: [] };
  const minOf = (i: 0 | 1 | 2) => Math.min(...boxes.map((b) => b.at[i]));
  const maxOf = (i: 0 | 1 | 2) => Math.max(...boxes.map((b) => b.at[i] + size(b)[i]));
  const [x0, x1, y0, y1, z0, z1] = [minOf(0), maxOf(0), minOf(1), maxOf(1), minOf(2), maxOf(2)];
  const side = view === 'right' || view === 'left';
  const flat = view === 'top' || view === 'bottom';
  // Distance of the box's near face from the viewer: front looks from -z, back from +z, right from -x, left from +x, top from -y, bottom from +y.
  const depth = (b: BoxDef) =>
    view === 'front' ? b.at[2] : view === 'back' ? -(b.at[2] + size(b)[2]) : view === 'right' ? b.at[0] : view === 'left' ? -(b.at[0] + size(b)[0]) : view === 'top' ? b.at[1] : -(b.at[1] + size(b)[1]);
  const order = boxes.map((b, i) => ({ b, i })).sort((p, q) => depth(q.b) - depth(p.b) || p.i - q.i);
  const parts = order.map(({ b }): Placement => {
    const [w, , d] = size(b);
    const x = view === 'front' || flat ? b.at[0] - x0 : view === 'back' ? x1 - (b.at[0] + w) : view === 'right' ? z1 - (b.at[2] + d) : b.at[2] - z0;
    // Seen from above (or below), the back is at the top of the image, as on every top face.
    const y = flat ? z1 - (b.at[2] + d) : b.at[1] - y0;
    const face = b.mirror ? SWAP[view] : view;
    return { part: b.part, face, x, y, flip: b.mirror };
  });
  return { w: side ? z1 - z0 : x1 - x0, h: flat ? z1 - z0 : y1 - y0, parts };
}

function placements(rig: Rig, view: ViewName, only?: ReadonlySet<PartName>) {
  return rig.layout === 'player' && !only && view !== 'top' && view !== 'bottom' ? playerPlacements(view, rig.model) : boxPlacements(rig, view, only);
}

export function newImage(width: number, height: number): Image {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function blend(img: Image, x: number, y: number, r: number, g: number, b: number, a: number) {
  if (a === 0 || x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  const d = img.data;
  if (a === 255 || d[i + 3] === 0) {
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
    return;
  }
  const t = a / 255;
  d[i] = Math.round(r * t + d[i] * (1 - t));
  d[i + 1] = Math.round(g * t + d[i + 1] * (1 - t));
  d[i + 2] = Math.round(b * t + d[i + 2] * (1 - t));
  d[i + 3] = Math.max(d[i + 3], a);
}

export interface ViewOptions {
  /** Composite the overlay layer over the base. Default true. */
  overlay?: boolean;
  /** Draw only these parts. Default: all. */
  parts?: readonly PartName[];
}

/** Render one orthographic view (base, then overlay composited on top). */
export function renderView(tex: Image, model: Model | Rig, view: ViewName, { overlay = true, parts }: ViewOptions = {}): Image {
  const rig = asRig(model);
  const p = placements(rig, view, parts && new Set(parts));
  const img = newImage(p.w, p.h);
  // Layouts where transparency is part of the design (armor, items) keep it in the views.
  const solid = rig.def.opaque ?? false;
  for (const { part, face, x: dx, y: dy, flip } of p.parts)
    for (const layer of overlay ? (['base', 'overlay'] as const) : (['base'] as const)) {
      if (!rig.hasLayer(part, layer) || !rig.faces(part).includes(face)) continue;
      const r = rig.faceRect(part, face, layer);
      for (let y = 0; y < r.h; y++)
        for (let x = 0; x < r.w; x++) {
          const [tx, ty] = texel(r, x, y);
          const i = (ty * tex.width + tx) * 4;
          const a = tex.data[i + 3];
          blend(img, dx + (flip ? r.w - 1 - x : x), dy + y, tex.data[i], tex.data[i + 1], tex.data[i + 2], layer === 'base' && solid ? (a ? 255 : 0) : a);
        }
    }
  return img;
}

function drawScaled(dst: Image, src: Image, ox: number, oy: number, k: number) {
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      const a = src.data[i + 3];
      if (!a) continue;
      for (let yy = 0; yy < k; yy++)
        for (let xx = 0; xx < k; xx++) blend(dst, ox + x * k + xx, oy + y * k + yy, src.data[i], src.data[i + 1], src.data[i + 2], a);
    }
}

function fillRect(img: Image, x: number, y: number, w: number, h: number, c: [number, number, number]) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) blend(img, xx, yy, c[0], c[1], c[2], 255);
}

export interface SheetLayout {
  width: number;
  height: number;
  panels: { name: string; x: number; y: number; w: number; h: number }[];
}

/**
 * Contact sheet for review: the views (front | back | right | left; a flat texture has only its
 * front) at 8x, then the raw texture at 4x on a checkerboard. Deterministic, identical in browser
 * and CLI.
 */
export function renderSheet(tex: Image, model: Model | Rig): { image: Image; layout: SheetLayout } {
  const rig = asRig(model);
  const k = rig.width <= 16 ? 16 : 8, t4 = rig.width <= 16 ? 16 : 4, pad = 16;
  const views = viewsOf(rig).map((v) => ({ name: v, img: renderView(tex, rig, v) }));
  const panels: SheetLayout['panels'] = [];
  let x = pad;
  for (const v of views) {
    panels.push({ name: v.name, x, y: pad, w: v.img.width * k, h: v.img.height * k });
    x += v.img.width * k + pad;
  }
  panels.push({ name: 'texture', x, y: pad, w: tex.width * t4, h: tex.height * t4 });
  const width = x + tex.width * t4 + pad;
  const height = pad * 2 + Math.max(tex.height * t4, ...views.map((v) => v.img.height * k));
  const image = newImage(width, height);
  fillRect(image, 0, 0, width, height, SHEET_BG);
  views.forEach((v, i) => {
    const p = panels[i];
    fillRect(image, p.x, p.y, p.w, p.h, PANEL_BG);
    drawScaled(image, v.img, p.x, p.y, k);
  });
  const t = panels[panels.length - 1];
  const cell = 4 * t4;
  for (let cy = 0; cy < tex.height / 4; cy++)
    for (let cx = 0; cx < tex.width / 4; cx++) fillRect(image, t.x + cx * cell, t.y + cy * cell, cell, cell, (cx + cy) % 2 ? [38, 41, 49] : PANEL_BG);
  drawScaled(image, tex, t.x, t.y, t4);
  return { image, layout: { width, height, panels } };
}

/**
 * A close-up of some parts alone (the head, the arms…): all six views, large, with nothing else in
 * front of them. For judging a face, a hood or one garment without the rest of the model. Parts
 * without a box draw nothing; with no box at all, the sheet has no panels.
 */
export function renderCloseUp(tex: Image, model: Model | Rig, parts: readonly PartName[]): { image: Image; layout: SheetLayout } {
  const rig = asRig(model);
  const pad = 16;
  const views = ALL_VIEWS.map((v) => ({ name: v, img: renderView(tex, rig, v, { parts }) })).filter((v) => v.img.width && v.img.height);
  const largest = Math.max(1, ...views.map((v) => Math.max(v.img.width, v.img.height)));
  const k = Math.max(CLOSE_UP_MIN_SCALE, Math.min(CLOSE_UP_MAX_SCALE, Math.floor(CLOSE_UP_SIZE / largest)));
  const panels: SheetLayout['panels'] = [];
  let x = pad;
  for (const v of views) {
    panels.push({ name: v.name, x, y: pad, w: v.img.width * k, h: v.img.height * k });
    x += v.img.width * k + pad;
  }
  const width = Math.max(x, pad * 2);
  const height = pad * 2 + Math.max(0, ...views.map((v) => v.img.height * k));
  const image = newImage(width, height);
  fillRect(image, 0, 0, width, height, SHEET_BG);
  views.forEach((v, i) => {
    const p = panels[i];
    fillRect(image, p.x, p.y, p.w, p.h, CLOSE_UP_BG);
    drawScaled(image, v.img, p.x, p.y, k);
  });
  return { image, layout: { width, height, panels } };
}

/**
 * Lineup for families: each member's front view (left) and back view (right) at 6×, wrapped into
 * rows of `columns` members. Member order matches the input order. Flat textures show only once.
 */
export function renderLineup(members: { texture: Image; model: Model; rig?: Rig }[], columns = 8): Image {
  const k = 6, pad = 12, gap = 12;
  const shots = members.map((m) => {
    const rig = m.rig ?? rigFor('player', m.model);
    const kk = rig.width <= 16 ? k * 2 : k;
    return { kk, imgs: viewsOf(rig).filter((v) => v === 'front' || v === 'back').map((v) => renderView(m.texture, rig, v)) };
  });
  const cellW = Math.max(...shots.map((s) => s.imgs.reduce((w, img) => w + img.width * s.kk, 0) + (s.imgs.length - 1) * (gap / 2)));
  const cellH = Math.max(...shots.map((s) => Math.max(...s.imgs.map((img) => img.height * s.kk))));
  const cols = Math.max(1, Math.min(columns, members.length));
  const rows = Math.ceil(members.length / cols);
  const width = pad * 2 + cols * cellW + (cols - 1) * gap;
  const height = pad * 2 + rows * cellH + (rows - 1) * gap;
  const image = newImage(width, height);
  fillRect(image, 0, 0, width, height, SHEET_BG);
  shots.forEach((s, i) => {
    let x = pad + (i % cols) * (cellW + gap);
    const y = pad + Math.floor(i / cols) * (cellH + gap);
    fillRect(image, x, y, cellW, cellH, PANEL_BG);
    for (const img of s.imgs) {
      drawScaled(image, img, x, y, s.kk);
      x += img.width * s.kk + gap / 2;
    }
  });
  return image;
}

export function scaleImage(src: Image, k: number): Image {
  const out = newImage(src.width * k, src.height * k);
  drawScaled(out, src, 0, 0, k);
  return out;
}
