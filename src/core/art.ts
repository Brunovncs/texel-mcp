import { perceptualLightness, toHex } from './color.js';
import { craftAdvice, type CraftAdvice } from './craft.js';
import { type Rig, rigFor } from './layout.js';
import { createFaceReader, type FacePixels } from './pixels.js';
import { FACE_GROUPS } from './selector.js';
import { mean } from './stats.js';
import type { FaceName, Image, Model, PartName, RGBA } from './types.js';

/**
 * Art checks: rough, deterministic proxies for the rubric items that pixels can answer (R2–R7 plus
 * color count). R1, whether the skin matches the brief, still needs eyes. Good enough to rank
 * candidates and decide when a fix round is worth it; not a replacement for looking. Character
 * layouts get all of them; mobs, capes, items and blocks get the ones that apply.
 */

export interface ArtCheck {
  id: 'face' | 'silhouette' | 'shading' | 'texture' | 'back' | 'depth' | 'colors';
  rubric: string;
  /** 0–1. */
  score: number;
  note: string;
  hint: string;
}

export interface ArtReport {
  /** 0–100, weighted average of the checks. */
  score: number;
  checks: ArtCheck[];
  /** Common pixel-art mistakes found in the texture (see craft.ts). Advisory: they never change a score. */
  advice: CraftAdvice[];
}

const WEIGHTS: Record<ArtCheck['id'], number> = { face: 0.25, silhouette: 0.15, shading: 0.15, texture: 0.15, back: 0.1, depth: 0.1, colors: 0.1 };

/** Every art check with its rubric item, so a review can say which ones a layout skips. */
export const ART_RUBRIC: readonly [ArtCheck['id'], string][] = [['face', 'R2'], ['silhouette', 'R3'], ['shading', 'R4'], ['texture', 'R5'], ['back', 'R6'], ['depth', 'R7'], ['colors', 'color']];
const SIDES = FACE_GROUPS.sides;

const clamp = (v: number) => Math.max(0, Math.min(1, v));
/** Mean that counts an empty measurement (a fully transparent face) as 0, so scores stay numbers. */
const average = (xs: number[]) => (xs.length ? mean(xs) : 0);
/** Share of the most common color. */
const flatShare = (px: RGBA[]) => {
  const counts = new Map<string, number>();
  for (const p of px) counts.set(toHex(p), (counts.get(toHex(p)) ?? 0) + 1);
  return px.length ? Math.max(...counts.values()) / px.length : 0;
};
const distinct = (px: RGBA[]) => new Set(px.map((p) => toHex(p))).size;
const meanLightness = (px: RGBA[]) => average(px.map(perceptualLightness));

export function artReview(tex: Image, model: Model | Rig, overlayPixels: number, colorsUsed: number): ArtReport {
  const rig = typeof model === 'string' ? rigFor('player', model) : model;
  const checks: ArtCheck[] = [];
  const add = (id: ArtCheck['id'], rubric: string, score: number, note: string, hint: string) => checks.push({ id, rubric, score: Math.round(clamp(score) * 100) / 100, note, hint });
  const character = Boolean(rig.def.character);
  const flatLayout = rig.parts.every((p) => rig.faces(p).length === 1);
  const body = rig.parts.filter((p) => p !== 'head');
  const legs = rig.def.groups?.legs ?? [];
  const solid = Boolean(rig.def.opaque);
  /**
   * The pixels that count. Layouts that must be opaque count every pixel (a hole is a flaw the check
   * should see); layouts with designed transparency (armor gaps, an item's background) skip clear ones.
   */
  const counted = (rows: FacePixels): RGBA[] => (solid ? rows.flat() : rows.flat().filter((p) => p[3] > 0));
  const reader = createFaceReader(tex, rig);
  const seen = (part: PartName, face: FaceName) => reader.visible({ part, face });
  const faceLightness = (rows: FacePixels) => meanLightness(counted(rows));

  if (character) {
    // R2: the face needs a few colors and a strong local contrast where the eyes go. The edge columns
    // are left out, so a hood's rim can't pass for eyes.
    const face = seen('head', 'front');
    const middle = face.slice(2, 7).map((row) => row.slice(1, 7));
    let contrast = 0;
    for (const row of middle) for (let x = 0; x + 1 < row.length; x++) contrast = Math.max(contrast, Math.abs(perceptualLightness(row[x]) - perceptualLightness(row[x + 1])));
    const faceColors = distinct(counted(middle));
    add('face', 'R2', 0.4 * clamp((faceColors - 1) / 4) + 0.6 * clamp((contrast - 10) / 25), `${faceColors} colors on the face, strongest eye-area contrast ${Math.round(contrast)}`, 'make the eyes pop: a light eye white next to a dark iris on row 4 (the "face" op does this), brows a row above, a mouth in a darker skin tone');

    // R3: head, body and legs should differ in lightness so the silhouette reads, and the arms should
    // stand off the torso. Arms count for less: sleeves the color of the shirt are a normal design.
    const head = faceLightness(face), torso = faceLightness(seen('body', 'front'));
    const legL = average(legs.map((p) => faceLightness(seen(p, 'front'))));
    const arms = (rig.def.groups?.arms ?? []).filter((p) => rig.faces(p).includes('front'));
    const armL = arms.length ? average(arms.map((p) => faceLightness(seen(p, 'front')))) : null;
    const sep = [Math.abs(head - torso), Math.abs(torso - legL)];
    const armGap = armL === null ? null : Math.abs(armL - torso);
    const parts = average(sep.map((d) => clamp(d / 10)));
    add(
      'silhouette',
      'R3',
      armGap === null ? parts : 0.8 * parts + 0.2 * clamp(armGap / 6),
      `lightness gap head↔body ${Math.round(sep[0])}, body↔legs ${Math.round(sep[1])}${armGap === null ? '' : `, arms↔body ${Math.round(armGap)}`}`,
      'vary lightness between parts: e.g. darker pants than the shirt, or a lighter shirt than the jacket; on a one-color character, darken the limbs a step and keep the head lightest',
    );
  }

  // R4: light from above, so the top rows of each side face are lighter than the bottom rows.
  if (!flatLayout) {
    const lit: number[] = [];
    for (const part of body)
      for (const f of SIDES) {
        const rows = seen(part, f);
        if (rows.length < 4 || !counted(rows).length) continue;
        const top = faceLightness(rows.slice(0, 3)), bottom = faceLightness(rows.slice(-3));
        lit.push(clamp((top - bottom) / 4));
      }
    const inner = (['rightArm', 'rightLeg'] as PartName[]).filter((p) => rig.part(p));
    const innerDark = inner.map((p) => (faceLightness(seen(p, 'left')) <= faceLightness(seen(p, 'right')) ? 1 : 0));
    const score = innerDark.length ? 0.75 * average(lit) + 0.25 * average(innerDark) : average(lit);
    if (lit.length) add('shading', 'R4', score, `${lit.filter((v) => v >= 0.5).length}/${lit.length} ${character ? 'limb' : 'side'} faces lighter on top`, 'add { "op": "lighting" } after the broad fills, or shade the bottom rows and inner faces darker');
  }

  // R5: no large flat areas, but no noise soup either.
  const visible: FacePixels[] = [];
  for (const part of rig.parts) for (const f of rig.faces(part).filter((f) => SIDES.includes(f))) {
    const rows = seen(part, f);
    if (counted(rows).length) visible.push(rows);
  }
  const flat = visible.filter((r) => flatShare(counted(r)) >= 0.9).length;
  let rough = 0, pairs = 0;
  const roughFaces = character && rig.layout === 'player' ? visible.slice(SIDES.length) : visible;
  for (const rows of roughFaces)
    for (const row of rows)
      for (let x = 0; x + 1 < row.length; x++) {
        if (!solid && (!row[x][3] || !row[x + 1][3])) continue;
        rough += Math.abs(perceptualLightness(row[x]) - perceptualLightness(row[x + 1]));
        pairs++;
      }
  // An item's outline against its fill is meant to be high contrast; only volumes can turn to noise soup.
  const soup = flatLayout ? 0 : rough / Math.max(1, pairs);
  if (visible.length)
    add('texture', 'R5', (1 - flat / visible.length) * (soup > 12 ? 0.6 : 1), `${flat}/${visible.length} faces almost one color, average neighbor difference ${soup.toFixed(1)}`, soup > 12 ? 'the texture is noisy: lower noise jitter to 2–4 and keep details on clean areas' : 'texture flat areas: "material" with a kind (fabric, leather, metal, fur…) or noise with jitter 2–4');

  if (character) {
    // R6: the back is designed, not just filled.
    const backs = [seen('head', 'back'), seen('body', 'back')].map(counted);
    add('back', 'R6', average(backs.map((px) => clamp((distinct(px) - 1) / 5) * (flatShare(px) >= 0.85 ? 0.5 : 1))), `head.back ${distinct(backs[0])} colors, body.back ${distinct(backs[1])} colors`, 'design the back: hair or hood on head.back, seams, straps, a cape or a backpack on body.back');
  }

  // R7: the overlay adds something 3D (only where the layout has a full overlay layer).
  if (rig.parts.filter((p) => rig.hasLayer(p, 'overlay')).length > 1)
    add('depth', 'R7', clamp(overlayPixels / 80), `${overlayPixels} overlay pixels`, 'use the overlay for volume: the "hair" op, a hood, collar, cuffs, boot tops or gear on @overlay');

  const few = flatLayout ? [4, 8] : [6, 12];
  add('colors', 'color', colorsUsed < few[0] ? 0.2 : colorsUsed < few[1] ? 0.6 : 1, `${colorsUsed} colors`, 'give each material 2–4 tones: "cloth~1" (lighter, warmer) and "cloth~-1" (darker, cooler)');

  const total = checks.length === Object.keys(WEIGHTS).length ? 1 : checks.reduce((s, c) => s + WEIGHTS[c.id], 0);
  const mean100 = Math.round((100 * checks.reduce((s, c) => s + c.score * WEIGHTS[c.id], 0)) / total);
  // A weak check keeps the score under 90, so 90+ always means nothing is weak (a weighted mean of
  // six good checks would otherwise hide a flat silhouette at 94).
  const score = checks.some((c) => c.score < ART_WEAK) ? Math.min(mean100, ART_CAP_WHEN_WEAK) : mean100;
  return { score, checks, advice: craftAdvice(tex, rig, reader) };
}

/** Art checks below this are worth a fix round. */
export const ART_WEAK = 0.6;
/** The highest art score while any check is weak. */
export const ART_CAP_WHEN_WEAK = 89;
