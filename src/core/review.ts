import { ART_RUBRIC, ART_WEAK, artReview, type ArtReport } from './art';
import { resolveColor, rgbToHsl, toHex } from './color';
import type { CompileResult } from './compile';
import { type Rig, refName, texel } from './layout';
import type { FaceRef, Image, Issue, RGBA } from './types';
import { renderView, viewsOf } from './views';

export interface ReviewStats {
  model: string;
  layout: string;
  layers: number;
  disabledLayers: number;
  colorsUsed: number;
  baseCoverage: number;
  overlayPixels: number;
  paletteSize: number;
}

export interface Review {
  ok: boolean;
  /** 0–100 technical health score: validity + in-game hygiene. It does NOT judge artistic quality; look at the render for that. */
  score: number;
  issues: Issue[];
  /** Art checks (face, silhouette, shading, texture, back, depth, colors): how good it is likely to look. */
  art: ArtReport;
  stats: ReviewStats;
  /** Text renders so non-visual agents can "see" the skin. */
  ascii: { front: string; back: string; key: Record<string, string> };
  next: string[];
}

const ASCII_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#$%&*+=?@^~<>/|';

function pixelsOf(tex: Image, ref: FaceRef, rig: Rig) {
  const r = rig.faceRect(ref.part, ref.face, ref.layer);
  const out: number[][] = [];
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) {
      const [tx, ty] = texel(r, x, y);
      const i = (ty * tex.width + tx) * 4;
      out.push([tex.data[i], tex.data[i + 1], tex.data[i + 2], tex.data[i + 3]]);
    }
  return out;
}

const key = (p: number[]) => (p[3] === 0 ? 'transparent' : toHex(p as [number, number, number, number]));

export function review(result: CompileResult): Review {
  const { texture: tex, model, rig, spec } = result;
  const character = Boolean(rig.def.character);
  const issues: Issue[] = [...result.issues];
  const add = (level: Issue['level'], code: string, path: string, message: string, hint?: string) => issues.push(hint ? { level, code, path, message, hint } : { level, code, path, message });

  const colors = new Set<string>();
  let baseOpaque = 0, baseTotal = 0, overlayPixels = 0;
  const holes: string[] = [];
  const flat: string[] = [];

  for (const part of rig.parts)
    for (const face of rig.faces(part))
      for (const layer of ['base', 'overlay'] as const) {
        if (!rig.hasLayer(part, layer)) continue;
        const ref: FaceRef = { part, face, layer };
        const px = pixelsOf(tex, ref, rig);
        const opaque = px.filter((p) => p[3] > 0);
        opaque.forEach((p) => colors.add(key(p)));
        if (layer === 'base') {
          baseTotal += px.length;
          baseOpaque += opaque.length;
          if (opaque.length < px.length && !rig.part(part)?.cutout) holes.push(`${refName(ref)} (${px.length - opaque.length}px)`);
          const visible = face !== 'bottom' && (face !== 'top' || part === 'head' || rig.layout !== 'player');
          if (visible && px.length >= 32 && opaque.length === px.length) {
            const over = rig.hasLayer(part, 'overlay') ? pixelsOf(tex, { part, face, layer: 'overlay' }, rig) : px.map(() => [0, 0, 0, 0]);
            const counts = new Map<string, number>();
            px.forEach((p, i) => {
              const k = key(over[i][3] > 0 ? over[i] : p);
              counts.set(k, (counts.get(k) ?? 0) + 1);
            });
            if (Math.max(...counts.values()) / px.length >= 0.9) flat.push(refName(ref));
          }
        } else overlayPixels += opaque.length;
      }

  if (!rig.def.opaque && baseOpaque === 0)
    add('warning', 'empty', '$.layers', `the ${rig.layout} texture is fully transparent`, 'paint something: start with "fill" or "pixels"');
  if (holes.length && rig.def.opaque)
    add('warning', 'base-transparent', '$.layers', `${holes.length} base-layer face(s) have transparent pixels, which render black in-game: ${holes.slice(0, 8).join(', ')}${holes.length > 8 ? ', …' : ''}`, 'start with a "fill" on "all" so every base pixel is opaque');

  const faceFront = new Set<string>();
  if (character) {
    const front = renderView(tex, rig, 'front');
    const head = rig.boxes.find((b) => b.part === 'head');
    const hx = (head?.at[0] ?? 0) - Math.min(...rig.boxes.map((b) => b.at[0])), hy = (head?.at[1] ?? 0) - Math.min(...rig.boxes.map((b) => b.at[1]));
    for (let y = hy; y < hy + 8; y++) for (let x = hx; x < hx + 8; x++) {
      const i = (y * front.width + x) * 4;
      faceFront.add(key([...front.data.subarray(i, i + 4)]));
    }
  }
  if (character && faceFront.size < 3) add('warning', 'blank-face', 'head.front', 'the face (head.front) uses fewer than 3 colors and will read as blank', 'draw eyes, brows and a mouth with a "pixels" op on head.front');

  // A face drawn on the base, then hidden under the same color as the rest of the hat layer, is
  // almost always an accident: a hood or hat filled over the whole head ("sides" includes the
  // front). A visor has colors of its own, so it passes.
  const hasHat = character && rig.hasLayer('head', 'overlay');
  const hat = hasHat ? pixelsOf(tex, { part: 'head', face: 'front', layer: 'overlay' }, rig) : [];
  const eyeArea = hasHat ? [3, 4, 5].flatMap((y) => [1, 2, 5, 6].map((x) => hat[y * 8 + x])) : [];
  const drawn = hasHat && new Set(pixelsOf(tex, { part: 'head', face: 'front', layer: 'base' }, rig).slice(24, 48).map(key)).size >= 3;
  const elsewhere = new Set(hasHat ? (['right', 'left', 'top', 'back'] as const).flatMap((face) => pixelsOf(tex, { part: 'head', face, layer: 'overlay' }, rig).filter((p) => p[3] > 0).map(key)) : []);
  if (drawn && eyeArea.every((p) => p[3] === 255) && eyeArea.every((p) => elsewhere.has(key(p))))
    add('warning', 'face-hidden', 'head.front@overlay', 'the hat layer covers the eyes of the face drawn underneath', 'clear the face on the overlay ({ "op": "clear", "target": "head.front@overlay", "x": 1, "y": 3, "w": 6, "h": 4 }), and remember "sides" includes the front');
  else if (hasHat && hat.every((p) => p[3] === 255)) add('info', 'hat-covers-face', 'head.front@overlay', 'the hat layer fully covers the face; fine for helmets, a mistake otherwise');

  if (flat.length) add('info', 'flat-surface', '$.layers', `${flat.length} face(s) are ≥90% one color: ${flat.slice(0, 6).join(', ')}${flat.length > 6 ? ', …' : ''}`, 'add depth with "shade" on edges, a "gradient", or "noise" with a small jitter (3–6)');

  if (colors.size > 0 && colors.size < (rig.width <= 16 ? 4 : 6)) add('info', 'few-colors', '$.palette', `only ${colors.size} distinct colors; most good ${rig.width <= 16 ? 'item and block textures use 6–16' : 'textures use 15–60'}`, 'give each material 2–4 tones (highlight, base, shadow)');

  const palette = spec?.palette && typeof spec.palette === 'object' ? spec.palette : {};
  const used = new Set(result.usedPalette);
  const unused = Object.keys(palette).filter((k) => !used.has(k));
  if (unused.length) add('info', 'unused-palette', '$.palette', `unused palette keys: ${unused.join(', ')}`);

  const layers = Array.isArray(spec?.layers) ? spec.layers : [];
  for (const i of result.deadLayers) {
    const id = (layers[i] as { id?: unknown } | undefined)?.id;
    add('info', 'overwritten-layer', `$.layers[${i}]`, `layer ${i}${typeof id === 'string' ? ` ("${id}")` : ''} is completely painted over by later layers and has no visible effect`, 'delete it, or move it after the layers that cover it');
  }
  const disabled = layers.filter((l) => l && typeof l === 'object' && (l as { enabled?: boolean }).enabled === false).length;

  const weight = { error: 25, warning: 8, info: 2 } as const;
  let score = 100;
  for (const i of issues) score -= i.code === 'base-transparent' ? Math.min(20, holes.length * 2) : weight[i.level];
  score = Math.max(0, Math.min(100, score));

  const ascii = asciiViews(tex, rig, palette, spec?.legend);
  const ok = !issues.some((i) => i.level === 'error');
  const next: string[] = [];
  if (!ok) next.push('Fix the errors first: ops with errors are skipped entirely.');
  if (issues.some((i) => i.code === 'base-transparent')) next.push('Cover every base pixel (fill "all" first, then paint on top).');
  if (issues.some((i) => i.code === 'blank-face')) next.push('Give the face readable features: 2px-wide eyes, a darker brow row, a mouth.');
  if (issues.some((i) => i.code === 'flat-surface')) next.push('Add shading: darker bottom rows, lighter top row, and subtle noise.');
  const art = artReview(tex, rig, overlayPixels, colors.size);
  for (const c of art.checks) if (c.score < ART_WEAK) next.push(`${c.rubric} ${c.id} (${c.score}): ${c.hint}.`);
  next.push('Look at the render (front/back/sides) and compare it to the brief; iterate on the weakest area.');

  return {
    ok,
    score,
    issues,
    art,
    stats: {
      model,
      layout: rig.layout,
      layers: layers.length,
      disabledLayers: disabled,
      colorsUsed: colors.size,
      baseCoverage: Math.round((baseOpaque / Math.max(1, baseTotal)) * 1000) / 10,
      overlayPixels,
      paletteSize: Object.keys(palette).length,
    },
    ascii,
    next,
  };
}

function asciiViews(tex: Image, rig: Rig, palette: Record<string, string>, legend?: Record<string, string>) {
  const charOf = new Map<string, string>();
  const names = new Map<string, string>();
  const taken = new Set<string>(['.']);
  for (const [ch, expr] of Object.entries(legend ?? {})) {
    const r = resolveColor(expr, palette);
    if (r.ok && r.color[3] > 0 && !charOf.has(toHex(r.color)) && !taken.has(ch) && ch !== ' ') {
      charOf.set(toHex(r.color), ch);
      taken.add(ch);
      names.set(toHex(r.color), expr);
    }
  }
  for (const [name, expr] of Object.entries(palette)) {
    const r = resolveColor(expr, palette);
    if (r.ok && r.color[3] > 0 && !names.has(toHex(r.color))) names.set(toHex(r.color), name);
  }
  const hsl = (hex: string) => rgbToHsl([1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16)).concat(255) as RGBA);
  const named = [...names.keys()].map((hex) => ({ hex, hsl: hsl(hex) }));
  /**
   * Shade, gradient and jitter only move lightness, so a pixel with the hue and saturation of a named
   * color is drawn with that color's char. Keeps the key short and the render readable.
   */
  const nearestNamed = (hex: string) => {
    if (names.has(hex)) return hex;
    const [h, s, l] = hsl(hex);
    let best: string | null = null, bestD = Infinity;
    for (const n of named) {
      const [nh, ns, nl] = n.hsl;
      const dh = s < 0.08 && ns < 0.08 ? 0 : Math.min(Math.abs(h - nh), 1 - Math.abs(h - nh));
      const ds = Math.abs(s - ns), dl = Math.abs(l - nl);
      if (dh > 0.035 || ds > 0.15 || dl > 0.16) continue;
      const d = dl + dh * 2 + ds / 2;
      if (d < bestD) (best = n.hex), (bestD = d);
    }
    return best ?? hex;
  };
  let poolIdx = 0;
  const pick = (hex: string) => {
    let ch = charOf.get(hex);
    if (ch) return ch;
    while (poolIdx < ASCII_POOL.length && taken.has(ASCII_POOL[poolIdx])) poolIdx++;
    ch = poolIdx < ASCII_POOL.length ? ASCII_POOL[poolIdx++] : '?';
    taken.add(ch);
    charOf.set(hex, ch);
    return ch;
  };
  const draw = (img: Image) => {
    const lines: string[] = [];
    for (let y = 0; y < img.height; y++) {
      let line = '';
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        const a = img.data[i + 3];
        const ch = a === 0 ? '.' : pick(nearestNamed(toHex([img.data[i], img.data[i + 1], img.data[i + 2], 255])));
        line += ch + ch;
      }
      lines.push(line);
    }
    return lines.join('\n');
  };
  const frontTxt = draw(renderView(tex, rig, 'front'));
  const backTxt = viewsOf(rig).includes('back') ? draw(renderView(tex, rig, 'back')) : '';
  const keyOut: Record<string, string> = { '.': 'transparent' };
  for (const [hex, ch] of charOf) keyOut[ch] = names.has(hex) ? `${hex} (${names.get(hex)})` : hex;
  return { front: frontTxt, back: backTxt, key: keyOut };
}

/** Markdown rendering of a review: what "Copy for LLM" puts on the clipboard. */
export function reviewToMarkdown(r: Review, opts: { includeAscii?: boolean } = {}): string {
  const lines = [`## Texel review: score ${r.score}/100 ${r.ok ? '(valid)' : '(has errors)'}`, ''];
  const s = r.stats;
  lines.push(`- ${s.layout && s.layout !== 'player' ? `layout: ${s.layout}` : `model: ${s.model}`} · layers: ${s.layers}${s.disabledLayers ? ` (${s.disabledLayers} disabled)` : ''} · colors used: ${s.colorsUsed} · base coverage: ${s.baseCoverage}% · overlay pixels: ${s.overlayPixels}`, '');
  if (r.issues.length) {
    lines.push('### Issues');
    for (const i of r.issues) lines.push(`- **${i.level}** \`${i.code}\` at \`${i.path}\`: ${i.message}${i.hint ? `. _${i.hint}_` : ''}`);
    lines.push('');
  } else lines.push('No issues found.', '');
  lines.push(`### Art checks: ${r.art.score}/100`, '');
  for (const c of r.art.checks) lines.push(`- ${c.score >= ART_WEAK ? 'ok' : '**weak**'} ${c.rubric} ${c.id} ${c.score}: ${c.note}`);
  const skipped = ART_RUBRIC.filter(([id]) => !r.art.checks.some((c) => c.id === id));
  if (skipped.length) lines.push(`- not measured for this layout: ${skipped.map(([id, rubric]) => `${rubric} ${id}`).join(', ')}`);
  lines.push('- R1 (does it match the brief) is never measured: look at the sheet', '');
  if (opts.includeAscii !== false) {
    lines.push('### Text render (front | back, each pixel = 2 chars, "." = transparent; shaded tones shown as their nearest named color)', '```');
    const f = r.ascii.front.split('\n'), b = r.ascii.back ? r.ascii.back.split('\n') : [];
    for (let i = 0; i < f.length; i++) lines.push(b.length ? `${f[i]}   ${b[i] ?? ''}` : f[i]);
    lines.push('```', '', 'Key: ' + Object.entries(r.ascii.key).map(([c, v]) => `\`${c}\`=${v}`).join(', '), '');
  }
  lines.push('### Suggested next steps', ...r.next.map((n) => `- ${n}`));
  return lines.join('\n');
}
