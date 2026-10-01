import { resolveColor, toHex } from './color';
import type { CompileResult } from './compile';
import { faceRect, FACES, PARTS, refName, SKIN_SIZE } from './layout';
import type { FaceRef, Image, Issue } from './types';
import { renderView } from './views';

export interface ReviewStats {
  model: string;
  layers: number;
  disabledLayers: number;
  colorsUsed: number;
  baseCoverage: number;
  overlayPixels: number;
  paletteSize: number;
}

export interface Review {
  ok: boolean;
  /** 0–100 technical health score: validity + in-game hygiene. It does NOT judge artistic quality — look at the render for that. */
  score: number;
  issues: Issue[];
  stats: ReviewStats;
  /** Text renders so non-visual agents can "see" the skin. */
  ascii: { front: string; back: string; key: Record<string, string> };
  next: string[];
}

const ASCII_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#$%&*+=?@^~<>/|';

function pixelsOf(tex: Image, ref: FaceRef, model: CompileResult['model']) {
  const r = faceRect(ref.part, ref.face, ref.layer, model);
  const out: number[][] = [];
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) {
      const i = ((r.y + y) * SKIN_SIZE + r.x + x) * 4;
      out.push([tex.data[i], tex.data[i + 1], tex.data[i + 2], tex.data[i + 3]]);
    }
  return out;
}

const key = (p: number[]) => (p[3] === 0 ? 'transparent' : toHex(p as [number, number, number, number]));

export function review(result: CompileResult): Review {
  const { texture: tex, model, spec } = result;
  const issues: Issue[] = [...result.issues];
  const add = (level: Issue['level'], code: string, path: string, message: string, hint?: string) => issues.push(hint ? { level, code, path, message, hint } : { level, code, path, message });

  const colors = new Set<string>();
  let baseOpaque = 0, baseTotal = 0, overlayPixels = 0;
  const holes: string[] = [];
  const flat: string[] = [];

  for (const part of PARTS)
    for (const face of FACES)
      for (const layer of ['base', 'overlay'] as const) {
        const ref: FaceRef = { part, face, layer };
        const px = pixelsOf(tex, ref, model);
        const opaque = px.filter((p) => p[3] > 0);
        opaque.forEach((p) => colors.add(key(p)));
        if (layer === 'base') {
          baseTotal += px.length;
          baseOpaque += opaque.length;
          if (opaque.length < px.length) holes.push(`${refName(ref)} (${px.length - opaque.length}px)`);
          const visible = face !== 'bottom' && (face !== 'top' || part === 'head');
          if (visible && px.length >= 32 && opaque.length === px.length) {
            const over = pixelsOf(tex, { part, face, layer: 'overlay' }, model);
            const counts = new Map<string, number>();
            px.forEach((p, i) => {
              const k = key(over[i][3] > 0 ? over[i] : p);
              counts.set(k, (counts.get(k) ?? 0) + 1);
            });
            if (Math.max(...counts.values()) / px.length >= 0.9) flat.push(refName(ref));
          }
        } else overlayPixels += opaque.length;
      }

  if (holes.length)
    add('warning', 'base-transparent', '$.layers', `${holes.length} base-layer face(s) have transparent pixels, which render black in-game: ${holes.slice(0, 8).join(', ')}${holes.length > 8 ? ', …' : ''}`, 'start with a "fill" on "all" so every base pixel is opaque');

  const faceFront = new Set<string>();
  const front = renderView(tex, model, 'front');
  for (let y = 0; y < 8; y++) for (let x = 4; x < 12; x++) {
    const i = (y * 16 + x) * 4;
    faceFront.add(key([...front.data.subarray(i, i + 4)]));
  }
  if (faceFront.size < 3) add('warning', 'blank-face', 'head.front', 'the face (head.front) uses fewer than 3 colors — it will read as blank', 'draw eyes, brows and a mouth with a "pixels" op on head.front');

  const hat = pixelsOf(tex, { part: 'head', face: 'front', layer: 'overlay' }, model);
  if (hat.every((p) => p[3] === 255)) add('info', 'hat-covers-face', 'head.front@overlay', 'the hat layer fully covers the face; fine for helmets, a mistake otherwise');

  if (flat.length) add('info', 'flat-surface', '$.layers', `${flat.length} face(s) are ≥90% one color: ${flat.slice(0, 6).join(', ')}${flat.length > 6 ? ', …' : ''}`, 'add depth with "shade" on edges, a "gradient", or "noise" with a small jitter (3–6)');

  if (colors.size > 0 && colors.size < 6) add('info', 'few-colors', '$.palette', `only ${colors.size} distinct colors; most good skins use 15–60`, 'give each material 2–4 tones (highlight, base, shadow)');

  const palette = spec?.palette && typeof spec.palette === 'object' ? spec.palette : {};
  const used = new Set(result.usedPalette);
  const unused = Object.keys(palette).filter((k) => !used.has(k));
  if (unused.length) add('info', 'unused-palette', '$.palette', `unused palette keys: ${unused.join(', ')}`);

  const layers = Array.isArray(spec?.layers) ? spec.layers : [];
  const disabled = layers.filter((l) => l && typeof l === 'object' && (l as { enabled?: boolean }).enabled === false).length;

  const weight = { error: 25, warning: 8, info: 2 } as const;
  let score = 100;
  for (const i of issues) score -= i.code === 'base-transparent' ? Math.min(20, holes.length * 2) : weight[i.level];
  score = Math.max(0, Math.min(100, score));

  const ascii = asciiViews(tex, model, palette, spec?.legend);
  const ok = !issues.some((i) => i.level === 'error');
  const next: string[] = [];
  if (!ok) next.push('Fix the errors first — ops with errors are skipped entirely.');
  if (issues.some((i) => i.code === 'base-transparent')) next.push('Cover every base pixel (fill "all" first, then paint on top).');
  if (issues.some((i) => i.code === 'blank-face')) next.push('Give the face readable features: 2px-wide eyes, a darker brow row, a mouth.');
  if (issues.some((i) => i.code === 'flat-surface')) next.push('Add shading: darker bottom rows, lighter top row, and subtle noise.');
  next.push('Look at the render (front/back/sides) and compare it to the brief; iterate on the weakest area.');

  return {
    ok,
    score,
    issues,
    stats: {
      model,
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

function asciiViews(tex: Image, model: CompileResult['model'], palette: Record<string, string>, legend?: Record<string, string>) {
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
        const ch = a === 0 ? '.' : pick(toHex([img.data[i], img.data[i + 1], img.data[i + 2], 255]));
        line += ch + ch;
      }
      lines.push(line);
    }
    return lines.join('\n');
  };
  const frontTxt = draw(renderView(tex, model, 'front'));
  const backTxt = draw(renderView(tex, model, 'back'));
  const keyOut: Record<string, string> = { '.': 'transparent' };
  for (const [hex, ch] of charOf) keyOut[ch] = names.has(hex) ? `${hex} (${names.get(hex)})` : hex;
  return { front: frontTxt, back: backTxt, key: keyOut };
}

/** Markdown rendering of a review — what "Copy for LLM" puts on the clipboard. */
export function reviewToMarkdown(r: Review, opts: { includeAscii?: boolean } = {}): string {
  const lines = [`## Texel review — score ${r.score}/100 ${r.ok ? '(valid)' : '(has errors)'}`, ''];
  const s = r.stats;
  lines.push(`- model: ${s.model} · layers: ${s.layers}${s.disabledLayers ? ` (${s.disabledLayers} disabled)` : ''} · colors used: ${s.colorsUsed} · base coverage: ${s.baseCoverage}% · overlay pixels: ${s.overlayPixels}`, '');
  if (r.issues.length) {
    lines.push('### Issues');
    for (const i of r.issues) lines.push(`- **${i.level}** \`${i.code}\` at \`${i.path}\`: ${i.message}${i.hint ? ` — _${i.hint}_` : ''}`);
    lines.push('');
  } else lines.push('No issues found.', '');
  if (opts.includeAscii !== false) {
    lines.push('### Text render (front | back, each pixel = 2 chars, "." = transparent)', '```');
    const f = r.ascii.front.split('\n'), b = r.ascii.back.split('\n');
    for (let i = 0; i < f.length; i++) lines.push(`${f[i]}   ${b[i]}`);
    lines.push('```', '', 'Key: ' + Object.entries(r.ascii.key).map(([c, v]) => `\`${c}\`=${v}`).join(', '), '');
  }
  lines.push('### Suggested next steps', ...r.next.map((n) => `- ${n}`));
  return lines.join('\n');
}
