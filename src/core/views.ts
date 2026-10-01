import { faceRect, SKIN_SIZE } from './layout';
import type { FaceName, Image, Model, PartName } from './types';

export type ViewName = 'front' | 'back' | 'right' | 'left';
export const VIEWS: readonly ViewName[] = ['front', 'back', 'right', 'left'];

type Placement = [PartName, FaceName, number, number];

/** Orthographic views. "right" looks at the character's right side (their front is on the viewer's right). */
function placements(view: ViewName, model: Model): { w: number; h: number; parts: Placement[] } {
  const slim = model === 'slim' ? 1 : 0;
  switch (view) {
    case 'front':
      return { w: 16, h: 32, parts: [['head', 'front', 4, 0], ['body', 'front', 4, 8], ['rightArm', 'front', slim, 8], ['leftArm', 'front', 12, 8], ['rightLeg', 'front', 4, 20], ['leftLeg', 'front', 8, 20]] };
    case 'back':
      return { w: 16, h: 32, parts: [['head', 'back', 4, 0], ['body', 'back', 4, 8], ['leftArm', 'back', slim, 8], ['rightArm', 'back', 12, 8], ['leftLeg', 'back', 4, 20], ['rightLeg', 'back', 8, 20]] };
    case 'right':
      return { w: 8, h: 32, parts: [['head', 'right', 0, 0], ['body', 'right', 2, 8], ['rightLeg', 'right', 2, 20], ['rightArm', 'right', 2, 8]] };
    case 'left':
      return { w: 8, h: 32, parts: [['head', 'left', 0, 0], ['body', 'left', 2, 8], ['leftLeg', 'left', 2, 20], ['leftArm', 'left', 2, 8]] };
  }
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

/** Render one orthographic view (base, then overlay composited on top). */
export function renderView(tex: Image, model: Model, view: ViewName, overlay = true): Image {
  const p = placements(view, model);
  const img = newImage(p.w, p.h);
  for (const [part, face, dx, dy] of p.parts)
    for (const layer of overlay ? (['base', 'overlay'] as const) : (['base'] as const)) {
      const r = faceRect(part, face, layer, model);
      for (let y = 0; y < r.h; y++)
        for (let x = 0; x < r.w; x++) {
          const i = ((r.y + y) * SKIN_SIZE + r.x + x) * 4;
          blend(img, dx + x, dy + y, tex.data[i], tex.data[i + 1], tex.data[i + 2], layer === 'base' ? (tex.data[i + 3] ? 255 : 0) : tex.data[i + 3]);
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
 * Contact sheet for review: front | back | right | left views at 8x, then the raw texture at 4x
 * on a checkerboard. Deterministic, identical in browser and CLI.
 */
export function renderSheet(tex: Image, model: Model): { image: Image; layout: SheetLayout } {
  const k = 8, pad = 16;
  const views = VIEWS.map((v) => ({ name: v, img: renderView(tex, model, v) }));
  const panels: SheetLayout['panels'] = [];
  let x = pad;
  for (const v of views) {
    panels.push({ name: v.name, x, y: pad, w: v.img.width * k, h: v.img.height * k });
    x += v.img.width * k + pad;
  }
  panels.push({ name: 'texture', x, y: pad, w: SKIN_SIZE * 4, h: SKIN_SIZE * 4 });
  const width = x + SKIN_SIZE * 4 + pad;
  const height = pad * 2 + 32 * k;
  const image = newImage(width, height);
  fillRect(image, 0, 0, width, height, [22, 24, 29]);
  views.forEach((v, i) => {
    const p = panels[i];
    fillRect(image, p.x, p.y, p.w, p.h, [30, 33, 40]);
    drawScaled(image, v.img, p.x, p.y, k);
  });
  const t = panels[4];
  for (let cy = 0; cy < SKIN_SIZE / 4; cy++)
    for (let cx = 0; cx < SKIN_SIZE / 4; cx++) fillRect(image, t.x + cx * 16, t.y + cy * 16, 16, 16, (cx + cy) % 2 ? [38, 41, 49] : [30, 33, 40]);
  drawScaled(image, tex, t.x, t.y, 4);
  return { image, layout: { width, height, panels } };
}

/**
 * Lineup for families: each member's front view (top row) and back view (bottom row) at 6×,
 * wrapped into rows of `columns` members. Member order matches the input order.
 */
export function renderLineup(members: { texture: Image; model: Model }[], columns = 8): Image {
  const k = 6, pad = 12, gap = 12, cellW = 16 * k * 2 + gap / 2, cellH = 32 * k;
  const cols = Math.max(1, Math.min(columns, members.length));
  const rows = Math.ceil(members.length / cols);
  const width = pad * 2 + cols * cellW + (cols - 1) * gap;
  const height = pad * 2 + rows * cellH + (rows - 1) * gap;
  const image = newImage(width, height);
  fillRect(image, 0, 0, width, height, [22, 24, 29]);
  members.forEach((m, i) => {
    const x = pad + (i % cols) * (cellW + gap);
    const y = pad + Math.floor(i / cols) * (cellH + gap);
    fillRect(image, x, y, cellW, cellH, [30, 33, 40]);
    drawScaled(image, renderView(m.texture, m.model, 'front'), x, y, k);
    drawScaled(image, renderView(m.texture, m.model, 'back'), x + 16 * k + gap / 2, y, k);
  });
  return image;
}

export function scaleImage(src: Image, k: number): Image {
  const out = newImage(src.width * k, src.height * k);
  drawScaled(out, src, 0, 0, k);
  return out;
}
