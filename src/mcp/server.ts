import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { McpServer, ResourceTemplate, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  applyPatch,
  buildPack,
  compile,
  isFamily,
  packReportToMarkdown,
  pixelize,
  resolveLayout,
  validatePack,
  CRAFT_ADVICE_CODES,
  type CompileResult,
  decodePNG,
  diffTextures,
  diffToMarkdown,
  expandFamily,
  extractPalette,
  formatSpec,
  paletteToMarkdown,
  type Image,
  PROTOCOL,
  renderCloseUp,
  renderLineup,
  renderSheet,
  referencePalette,
  REFERENCE_MAX_SIDE,
  resolveParts,
  resolveShareLink,
  type Review,
  review,
  reviewToMarkdown,
  scaleImage,
  SWATCH_ROLES,
  shareURL,
  type SkinSpec,
  textureToSpec,
  withIds,
} from '../core';
import { DOC_PAGES, DOCS, EXAMPLE_IDS, EXAMPLES, FAMILY_EXAMPLES, SCHEMAS } from './content';
import { Workspace } from './workspace';
import { png, readPack, writePack, writeTextures } from '../live/files';
import { openBrowser, startLive, type LiveSession } from '../live/server';
import { SITE_ORIGIN } from '../live/site';
import { TEXEL_VERSION, updateNotice, type Update } from '../live/update';

export const SERVER_VERSION = TEXEL_VERSION;
export const VIEWER_URI = 'ui://texel/viewer';
export const VIEWER_MIME = 'text/html;profile=mcp-app';
/** Key under which render results carry the texture for the MCP App viewer (kept out of model context). */
export const TEXTURE_META_KEY = 'texel/texture';

const INSTRUCTIONS = `Texel compiles Minecraft skin specs (JSON: palette + ordered drawing ops) into PNGs: 64×64 player skins by default, and with "layout" also mobs (zombies, horses, foxes, illagers, golems… 57 mob layouts), armor, capes/elytra, items, blocks with their top and side files, plants, GUI sprites, particles and paintings (texel://docs/spec, section "Layouts"). Protocol ${PROTOCOL}.
Beyond one texture: "animation" (frames as patches) gives animated items, blocks, GUI sprites and particles; "emissive": true on an op writes the glowing pixels to <name>_eyes.png; texel_pack builds a resource pack from specs and texel_check_pack checks any pack; texel_import_png with pixelize turns a picture into an editable spec.
Workflow: read the "spec" docs (texel_read_docs or resource texel://docs/spec), draft a spec, call texel_render, look at the returned review sheet image and the issues, fix the weakest area (texel_patch changes a few layers by id), render again, then texel_save and texel_share. To judge one area up close, pass focus (e.g. ["head"]) to texel_render; to match a reference image, start the palette with texel_palette.
Keep the spec in a workspace file and pass "file" instead of "spec" to texel_render, texel_patch and texel_validate: texel_patch then edits the file in place and replies with only the review, so the spec isn't resent on every iteration.
When a person is waiting on the result, call texel_live first and give them the URL: every texel_render then appears in their open studio tab, so they can watch and steer while you work.
For many related skins (teams, factions, tiers), write a family (kind: "family") and use texel_render_family / texel_save_family.
The score only measures technical hygiene; judge appearance from the sheet image against the brief.`;

const specInput = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .describe('A Texel skin spec (version 1) as a JSON object or JSON text. Format: texel://docs/spec, schema: texel://schema/skinspec.v1');
const fileInput = z
  .string()
  .min(1)
  .optional()
  .describe('Instead of "spec": a .json spec file in the workspace, e.g. "skins/knight.json". Saves resending the whole spec on every call; texel_patch then edits the file in place.');
const patchInput = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .describe('A patch ({ patch: [{ do: "update", id, set }, …] }) as a JSON object or JSON text. Format: texel://docs/spec, section "Patches".');
const includeInput = z.array(z.enum(['sheet', 'texture', 'ascii'])).default(['sheet']).describe('Extra outputs. "sheet" is the review image; "ascii" adds a text render for models without vision.');
const focusInput = z
  .array(z.string())
  .optional()
  .describe('Also return a close-up of these parts or groups alone (e.g. ["head"], ["arms"]) from all six sides, large, on gray: for judging a face, a hood or one garment.');
const familyInput = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .describe('A skin family ({ kind: "family", base, variants?, matrix? }) as a JSON object or JSON text. Format: texel://docs/families');

const issueShape = z.object({ level: z.enum(['error', 'warning', 'info']), code: z.string(), path: z.string(), message: z.string(), hint: z.string().optional() });
const reviewShape = z.object({
  ok: z.boolean(),
  name: z.string(),
  model: z.enum(['classic', 'slim']),
  layout: z.string().describe('Texture layout: player, zombie, humanoid (armor), skeleton, item…'),
  size: z.tuple([z.number(), z.number()]).describe('Texture size in pixels: [width, height].'),
  score: z.number(),
  art: z.object({
    score: z.number().describe('0–100 from the art checks: face, silhouette, shading, texture, back, depth, colors.'),
    checks: z.array(z.object({ id: z.string(), rubric: z.string(), score: z.number(), note: z.string(), hint: z.string() })),
    advice: z
      .array(
        z.object({
          code: z.enum(CRAFT_ADVICE_CODES),
          faces: z.array(z.object({ part: z.string(), face: z.string() })),
          edges: z.array(z.object({ part: z.string(), faces: z.tuple([z.string(), z.string()]), rows: z.array(z.number()) })).optional(),
          message: z.string(),
          hint: z.string(),
        }),
      )
      .describe('Classic pixel-art mistakes found in the texture, with the faces where they show. Advisory: never changes a score.'),
  }),
  issues: z.array(issueShape),
  stats: z.object({
    layers: z.number(),
    disabledLayers: z.number(),
    colorsUsed: z.number(),
    baseCoverage: z.number(),
    overlayPixels: z.number(),
    paletteSize: z.number(),
    seams: z.record(z.string(), z.object({ horizontal: z.number(), vertical: z.number() })).optional().describe('Tiling layouts: how much each edge breaks where copies meet (1 = seamless, over 2.5 shows).'),
    frames: z.number().optional(),
    distinctFrames: z.number().optional(),
    emissivePixels: z.number().optional(),
  }),
  next: z.array(z.string()),
});

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const imageBlock = (img: Image) => ({ type: 'image' as const, data: base64(png(img)), mimeType: 'image/png' });
const textBlock = (text: string) => ({ type: 'text' as const, text });

function reviewPayload(result: CompileResult, r: Review) {
  const { model: _model, layout: _layout, ...stats } = r.stats;
  void _model, void _layout;
  return { ok: r.ok, name: String(result.spec?.name ?? 'Untitled'), model: result.model, layout: result.layout, size: [result.texture.width, result.texture.height] as [number, number], score: r.score, art: r.art, issues: r.issues, stats, next: r.next };
}

function toolError(message: string): CallToolResult {
  return { isError: true, content: [textBlock(message)] };
}

/**
 * Build a fully configured server. Called once per connection by the transport entry point. When
 * `update` resolves to a newer release, the next tool result carries the update instructions, once.
 */
export function createTexelServer(workspace = new Workspace(), update?: Promise<Update | null>): McpServer {
  const server = new McpServer({ name: 'texel', title: 'Texel', version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
  let live: LiveSession | null = null;

  let notice: string | null = null;
  void update?.then((u) => (notice = u && updateNotice(u, 'mcp')));
  const register = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: never, cb: (...args: unknown[]) => Promise<CallToolResult>) =>
    register(name, config, (async (...args: unknown[]) => {
      const result = await cb(...args);
      if (!notice) return result;
      const text = notice;
      notice = null;
      return { ...result, content: [...result.content, textBlock(text)] };
    }) as never)) as typeof server.registerTool;

  /** The spec a tool works on: inline, or a workspace file (whose path comes back for writing). */
  const specSource = (spec: unknown, file: string | undefined): { text: string; path?: string } | { error: string } => {
    if ((spec === undefined) === (file === undefined)) return { error: 'Pass either "spec" (the spec itself) or "file" (a spec file in the workspace), not both.' };
    if (file === undefined) return { text: typeof spec === 'string' ? spec : JSON.stringify(spec) };
    try {
      return { text: readFileSync(workspace.resolve(file), 'utf8'), path: file };
    } catch (e) {
      return { error: `Could not read ${file}: ${(e as Error).message}` };
    }
  };

  interface RenderOptions {
    /** Text before the review (a patch summary). */
    before?: string;
    /** Extra fields for structuredContent. */
    extra?: Record<string, unknown>;
    /** Parts or groups for a close-up. */
    focus?: string[];
  }

  /** Review a compiled spec, push it to the live session, and return the render outputs. */
  const rendered = (result: CompileResult, include: string[], { before = '', extra = {}, focus }: RenderOptions = {}): CallToolResult => {
    const parts = focus?.length ? resolveParts(result.rig, focus) : null;
    if (parts && !parts.ok) return toolError(`focus: ${parts.error}${parts.hint ? ` (${parts.hint})` : ''}`);
    const r = review(result);
    if (live && result.spec) live.push(formatSpec(result.spec));
    const content: CallToolResult['content'] = [textBlock(before + reviewToMarkdown(r, { includeAscii: include.includes('ascii') }))];
    if (include.includes('sheet')) content.push(imageBlock(renderSheet(result.texture, result.rig, result).image));
    if (parts?.ok) content.push(textBlock(`Close-up of ${parts.parts.join(', ')}: front | back | right | left | top | bottom.`), imageBlock(renderCloseUp(result.texture, result.rig, parts.parts).image));
    if (include.includes('texture')) content.push(imageBlock(scaleImage(result.texture, 4)));
    return {
      content,
      structuredContent: { ...reviewPayload(result, r), ...extra },
      _meta: { [TEXTURE_META_KEY]: `data:image/png;base64,${base64(png(result.texture))}` },
    };
  };

  // ---- tools --------------------------------------------------------------

  server.registerTool(
    'texel_render',
    {
      title: 'Render skin',
      description:
        'Compile a skin spec and review it. Returns a review sheet image (front | back | right | left views + raw texture), the review (score, issues with JSON paths and fix hints, art checks, craft advice, suggested next steps) and, on request, the texture (64×64 for a player skin), a text render and a close-up of some parts. Deterministic; never modifies files.',
      inputSchema: z.object({ spec: specInput.optional(), file: fileInput, include: includeInput, focus: focusInput }),
      outputSchema: reviewShape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: VIEWER_URI } },
    },
    async ({ spec, file, include, focus }) => {
      const source = specSource(spec, file);
      return 'error' in source ? toolError(source.error) : rendered(compile(source.text), include, { focus });
    },
  );

  server.registerTool(
    'texel_patch',
    {
      title: 'Patch skin',
      description:
        'Apply a patch to a spec (update, replace, add or remove layers by id; change palette, legend or meta) and render the result like texel_render. Layers without an id first get "<op>-<index>" and keep it, so the next patch can use the same ids. Entries that cannot apply are skipped and reported. With "spec", returns the patched spec, the review and the sheet. With "file", writes the patched spec back to that file and returns only the review and the sheet.',
      inputSchema: z.object({ spec: specInput.optional(), file: fileInput, patch: patchInput, include: includeInput }),
      outputSchema: reviewShape.extend({ spec: z.record(z.string(), z.unknown()).optional(), file: z.string().optional(), applied: z.number(), skipped: z.array(issueShape) }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: { ui: { resourceUri: VIEWER_URI } },
    },
    async ({ spec, file, patch, include }) => {
      const source = specSource(spec, file);
      if ('error' in source) return toolError(source.error);
      let base: SkinSpec, body: unknown;
      try {
        base = JSON.parse(source.text);
        body = typeof patch === 'string' ? JSON.parse(patch) : patch;
      } catch (e) {
        return toolError(`Invalid JSON: ${(e as Error).message}`);
      }
      if (!Array.isArray(base?.layers)) return toolError('The spec must be a skin spec with a "layers" array.');
      const p = applyPatch(withIds(base), body);
      if (p.issues.some((i) => i.level === 'error')) return toolError(p.issues.map((i) => i.message).join('\n'));
      const skipped = p.issues.map((i) => `- ${i.code} at ${i.path}: ${i.message}${i.hint ? ` (${i.hint})` : ''}`).join('\n');
      const summary = `Applied ${p.applied} of ${p.applied + p.issues.length} patch entries.${skipped ? `\n${skipped}` : ''}`;
      const extra = { applied: p.applied, skipped: p.issues };
      if (source.path) {
        workspace.write(source.path, formatSpec(p.spec));
        return rendered(compile(p.spec), include, { before: `${summary}\nSaved to ${source.path}.\n\n`, extra: { ...extra, file: source.path } });
      }
      const before = `${summary}\n\n\`\`\`json\n${formatSpec(p.spec)}\`\`\`\n\n`;
      return rendered(compile(p.spec), include, { before, extra: { ...extra, spec: p.spec as unknown as Record<string, unknown> } });
    },
  );

  server.registerTool(
    'texel_validate',
    {
      title: 'Validate skin spec',
      description: 'Check a spec for errors and warnings without rendering images. Cheap; use it after every edit.',
      inputSchema: z.object({ spec: specInput.optional(), file: fileInput }),
      outputSchema: z.object({ ok: z.boolean(), score: z.number(), issues: z.array(issueShape) }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ spec, file }) => {
      const source = specSource(spec, file);
      if ('error' in source) return toolError(source.error);
      const r = review(compile(source.text));
      const text = r.issues.length ? r.issues.map((i) => `${i.level} ${i.code} at ${i.path}: ${i.message}${i.hint ? ` (${i.hint})` : ''}`).join('\n') : 'No issues.';
      return { content: [textBlock(`score ${r.score}/100\n${text}`)], structuredContent: { ok: r.ok, score: r.score, issues: r.issues } };
    },
  );

  server.registerTool(
    'texel_save',
    {
      title: 'Save skin',
      description: `Compile a spec and write <path>.png (the texture), <path>.skin.json (the source) and optionally <path>.sheet.png into the workspace (${workspace.root}). Also writes every other file the texture is in game: a block's <path>_top.png / _side.png…, an animation's strip with <path>.png.mcmeta, a particle's <path>_0.png…, the glowing pixels as <path>_eyes.png. Refuses specs with errors.`,
      inputSchema: z.object({
        spec: specInput,
        path: z.string().min(1).describe('Output path without extension, relative to the workspace, e.g. "skins/frost-mage".'),
        sheet: z.boolean().default(false).describe('Also write the review sheet.'),
      }),
      outputSchema: z.object({ files: z.array(z.string()), score: z.number() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ spec, path, sheet }) => {
      const result = compile(spec);
      if (!result.ok || !result.spec) return toolError(`Not saved: the spec has errors.\n\n${reviewToMarkdown(review(result), { includeAscii: false })}`);
      const stem = path.replace(/\.(png|json)$/i, '').replace(/\.skin$/i, '');
      try {
        const files = [...writeTextures(`${stem}.png`, result, (p, d) => workspace.write(p, d)), workspace.write(`${stem}.skin.json`, formatSpec(result.spec))];
        if (sheet) files.push(workspace.write(`${stem}.sheet.png`, png(renderSheet(result.texture, result.rig, result).image)));
        const shown = files.map((f) => workspace.display(f));
        return { content: [textBlock(`Saved:\n${shown.map((f) => `- ${f}`).join('\n')}`)], structuredContent: { files: shown, score: review(result).score } };
      } catch (e) {
        return toolError((e as Error).message);
      }
    },
  );

  server.registerTool(
    'texel_live',
    {
      title: 'Start live preview',
      description:
        'Start (or reuse) a live session and return a studio URL for the user. While it runs, every texel_render result appears in their open browser tab immediately, so they can watch the skin evolve and give feedback mid-way. Call it before the first render and share the URL with the user.',
      inputSchema: z.object({
        open: z.boolean().default(false).describe('Also open the URL in the default browser of the machine running this server.'),
        port: z.number().int().min(1024).max(65535).optional().describe('Preferred local port (default 4747; the next free one is used if busy).'),
      }),
      outputSchema: z.object({ url: z.string(), studioUrl: z.string(), port: z.number(), viewers: z.number() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ open, port }) => {
      try {
        live ??= await startLive({ site: SITE_ORIGIN, port });
      } catch (e) {
        return toolError(`Could not start the live session: ${(e as Error).message}`);
      }
      if (open) openBrowser(live.url);
      return {
        content: [textBlock(`Live preview: ${live.url}
Give this URL to the user. Each texel_render now updates their page (${live.clients()} viewer(s) connected). To edit it in the studio instead: ${live.studioUrl}`)],
        structuredContent: { url: live.url, studioUrl: live.studioUrl, port: live.port, viewers: live.clients() },
      };
    },
  );

  server.registerTool(
    'texel_share',
    {
      title: 'Share skin',
      description: `Store the spec on ${SITE_ORIGIN} and return a short link (${SITE_ORIGIN}/s/<id>) that opens the exact skin in the studio. Falls back to a long self-contained link when offline.`,
      inputSchema: z.object({ spec: specInput }),
      outputSchema: z.object({ url: z.string(), short: z.boolean() }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ spec }) => {
      const result = compile(spec);
      if (!result.ok || !result.spec) return toolError('Not shared: the spec has errors. Run texel_validate.');
      const link = await shareURL(SITE_ORIGIN, JSON.stringify(result.spec));
      return { content: [textBlock(link.url)], structuredContent: link };
    },
  );

  server.registerTool(
    'texel_pull',
    {
      title: 'Load skin from link',
      description: `Load the spec behind a Texel share link (${SITE_ORIGIN}/s/<id>, a bare id, or a long studio link with #z= / #spec=) so you can keep developing an existing skin. Returns the spec JSON.`,
      inputSchema: z.object({ link: z.string().min(1).describe('A share link or short id.') }),
      outputSchema: z.object({ spec: z.record(z.string(), z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ link }) => {
      const text = await resolveShareLink(link, SITE_ORIGIN);
      let spec: Record<string, unknown>;
      try {
        spec = JSON.parse(text ?? '');
      } catch {
        return toolError(`Could not load a spec from "${link}".`);
      }
      return { content: [textBlock(`\`\`\`json\n${formatSpec(spec)}\`\`\``)], structuredContent: { spec } };
    },
  );

  server.registerTool(
    'texel_render_family',
    {
      title: 'Render skin family',
      description: 'Expand a family (base spec + variants and/or a matrix of axes) and review every member. Returns a lineup image (front and back of each member, in order) and a per-member score table.',
      inputSchema: z.object({ family: familyInput }),
      outputSchema: z.object({
        ok: z.boolean(),
        name: z.string(),
        members: z.array(z.object({ id: z.string(), name: z.string(), score: z.number(), ok: z.boolean(), issues: z.array(z.string()) })),
        issues: z.array(issueShape),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ family }) => {
      const f = expandFamily(family);
      const built = f.members.map((m) => {
        const result = compile(m.spec);
        return { m, result, r: review(result) };
      });
      const members = built.map(({ m, r }) => ({ id: m.id, name: String(m.spec.name), score: r.score, ok: r.ok, issues: r.issues.filter((i) => i.level !== 'info').map((i) => `${i.code} at ${i.path}`) }));
      const table = ['| # | id | score | issues |', '| --- | --- | --- | --- |', ...members.map((m, i) => `| ${i + 1} | ${m.id} | ${m.score} | ${m.issues.join('; ') || '-'} |`)].join('\n');
      const familyIssues = f.issues.map((i) => `- ${i.level} \`${i.code}\` at \`${i.path}\`: ${i.message}${i.hint ? `. ${i.hint}` : ''}`).join('\n');
      const content: CallToolResult['content'] = [textBlock(`## ${f.name}: ${members.length} members (lineup order = table order)\n\n${table}${familyIssues ? `\n\n### Family issues\n${familyIssues}` : ''}`)];
      if (built.length) content.push(imageBlock(renderLineup(built.map(({ result }) => ({ texture: result.texture, model: result.model, rig: result.rig })), 6)));
      return { content, structuredContent: { ok: f.ok && members.every((m) => m.ok), name: f.name, members, issues: f.issues } };
    },
  );

  server.registerTool(
    'texel_save_family',
    {
      title: 'Save skin family',
      description: `Expand a family and write <directory>/<member-id>.png and .skin.json for every member, plus <directory>/lineup.png, into the workspace (${workspace.root}). Refuses families with errors.`,
      inputSchema: z.object({ family: familyInput, directory: z.string().min(1).describe('Output directory relative to the workspace, e.g. "skins/guild".') }),
      outputSchema: z.object({ files: z.array(z.string()), members: z.number() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ family, directory }) => {
      const f = expandFamily(family);
      const built = f.members.map((m) => ({ m, result: compile(m.spec) }));
      const failed = built.filter(({ result }) => !result.ok).map(({ m }) => m.id);
      if (!f.ok || failed.length) return toolError(`Not saved. Family errors: ${f.issues.filter((i) => i.level === 'error').map((i) => i.message).join('; ') || 'none'}. Members with errors: ${failed.join(', ') || 'none'}.`);
      try {
        const files: string[] = [];
        for (const { m, result } of built) {
          files.push(...writeTextures(`${directory}/${m.id}.png`, result, (p, d) => workspace.write(p, d)));
          files.push(workspace.write(`${directory}/${m.id}.skin.json`, formatSpec(m.spec)));
        }
        files.push(workspace.write(`${directory}/lineup.png`, png(renderLineup(built.map(({ result }) => ({ texture: result.texture, model: result.model, rig: result.rig })), 6))));
        const shown = files.map((x) => workspace.display(x));
        return { content: [textBlock(`Saved ${built.length} skins (${shown.length} files) under ${workspace.display(workspace.resolve(directory))}/`)], structuredContent: { files: shown, members: built.length } };
      } catch (e) {
        return toolError((e as Error).message);
      }
    },
  );

  server.registerTool(
    'texel_import_png',
    {
      title: 'Import skin PNG',
      description:
        'Convert an existing PNG in the workspace into an editable spec, one layer per painted face, palette keys c01…cNN. A player skin (64×64 or legacy 64×32) by default; pass layout for a mob, armor, cape, item or block texture. With pixelize, any picture becomes a texture of the layout\'s size first (concept art or a render on a white background → a 16×16 item; an HD 128×128 skin → 64×64): background removed, colors reduced, specks cleaned. Rename palette keys to material names before editing.',
      inputSchema: z.object({
        path: z.string().min(1).describe('Path to a .png file, relative to the workspace.'),
        layout: z.string().optional().describe('Texture layout of the PNG, e.g. "zombie", "humanoid" (armor), "item". Default: player skin.'),
        pixelize: z.boolean().default(false).describe('Scale and clean a picture of any size into the layout\'s texture size first.'),
        size: z.tuple([z.number().int().min(1).max(512), z.number().int().min(1).max(512)]).optional().describe('With pixelize: the texture size for resizable layouts (gui, painting, HD items), e.g. [32, 32].'),
        colors: z.number().int().min(0).max(64).optional().describe('With pixelize: colors to keep (default 16; 0 keeps every averaged color).'),
        outline: z.string().optional().describe('With pixelize: a 1-pixel outline around the shape, "#rrggbb" or "auto" (items).'),
      }),
      outputSchema: z.object({ spec: z.record(z.string(), z.unknown()), lossy: z.boolean(), model: z.enum(['classic', 'slim']), layout: z.string() }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ path, layout, pixelize: px, size, colors, outline }) => {
      try {
        const def = resolveLayout(layout);
        if (!def) return toolError(`Unknown layout "${layout}". See texel_read_docs("spec"), section Layouts.`);
        const bytes = readFileSync(workspace.resolve(path));
        let image = decodePNG(bytes, (d) => inflateSync(d), px ? { maxSide: REFERENCE_MAX_SIDE } : undefined);
        let notes: string[] = [];
        if (px) {
          const flat = Object.values(def.parts).every((p) => p.box[2] === 0);
          const [w, h] = size ?? def.size;
          const r = pixelize(image, w, h, { ...(colors !== undefined ? { colors } : {}), ...(outline ? { outline } : {}), ...(flat ? {} : { fit: 'stretch' as const, background: 'keep', cleanup: false }) });
          image = r.image;
          notes = r.notes;
        }
        const { spec, lossy } = textureToSpec(image, path.split(/[\\/]/).pop()?.replace(/\.png$/i, ''), layout);
        const said = notes.length ? `Pixelized: ${notes.join('; ')}.\n` : '';
        return {
          content: [textBlock(`${said}${lossy ? 'Imported with color quantization.' : 'Imported losslessly.'}\n\n\`\`\`json\n${formatSpec(spec)}\`\`\``)],
          structuredContent: { spec: spec as unknown as Record<string, unknown>, lossy, model: spec.model ?? 'classic', layout: spec.layout ?? 'player' },
        };
      } catch (e) {
        return toolError(`Import failed: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    'texel_palette',
    {
      title: 'Palette from a reference image',
      description:
        'Read a reference PNG in the workspace (concept art, a photo of a figure, another skin) and return its main colors, most common first, each with a role (shadow, midtone, highlight, neutral, accent), as a ready spec "palette" and "legend". Use it to match a reference instead of guessing hex values; derive the other tones with "~" steps.',
      inputSchema: z.object({
        path: z.string().min(1).describe('Path to a .png file, relative to the workspace.'),
        colors: z.number().int().min(2).max(32).default(12).describe('How many colors to keep.'),
      }),
      outputSchema: z.object({
        entries: z.array(
          z.object({ key: z.string(), char: z.string().nullable(), color: z.string(), share: z.number(), perceptualLightness: z.number(), role: z.enum(SWATCH_ROLES) }),
        ),
        palette: z.record(z.string(), z.string()),
        legend: z.record(z.string(), z.string()),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ path, colors }) => {
      try {
        const image = decodePNG(readFileSync(workspace.resolve(path)), (d) => inflateSync(d), { maxSide: REFERENCE_MAX_SIDE });
        const swatches = extractPalette(image, { colors });
        if (!swatches.length) return toolError(`${path} has no opaque pixels.`);
        const result = referencePalette(swatches);
        return { content: [textBlock(paletteToMarkdown(result))], structuredContent: { ...result } };
      } catch (e) {
        return toolError(`Palette failed: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    'texel_pack',
    {
      title: 'Build resource pack',
      description: `Build a Minecraft resource pack from spec files, family files and folders of them in the workspace (${workspace.root}): every texture at its "asset" path (or its layout's default: vanilla paths for mobs, item/<name> for items…), with .png.mcmeta, _eyes files, particle definitions, pack.mcmeta for the Minecraft version, and with models: true also the models, block states and item definitions items and blocks need. Writes a .zip or a folder, then checks the result like texel_check_pack.`,
      inputSchema: z.object({
        files: z.array(z.string().min(1)).min(1).describe('Spec files, family files or folders of .json specs, relative to the workspace.'),
        out: z.string().min(1).default('texel-pack.zip').describe('Output .zip, or a folder, relative to the workspace.'),
        namespace: z.string().optional().describe('Namespace for textures whose "asset" has none. Default "minecraft" (replaces vanilla textures); a mod uses its id.'),
        mcVersion: z.string().optional().describe('Minecraft Java version, e.g. "1.21.4". Default: the latest Texel knows.'),
        models: z.boolean().default(false).describe('Also write models, block states and item definitions for item, block and plant textures (new items and blocks need them; replaced vanilla textures don\'t).'),
        description: z.string().optional(),
      }),
      outputSchema: z.object({ ok: z.boolean(), out: z.string(), format: z.number(), version: z.string(), files: z.number(), placed: z.array(z.object({ name: z.string(), files: z.array(z.string()) })), issues: z.array(issueShape) }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ files, out, namespace, mcVersion, models, description }) => {
      const entries: { name: string; result: CompileResult }[] = [];
      try {
        const add = (full: string) => {
          const data = JSON.parse(readFileSync(full, 'utf8'));
          const stem = basename(full).replace(/\.json$/i, '').replace(/\.skin$/i, '');
          if (isFamily(data)) for (const m of expandFamily(data).members) entries.push({ name: `${stem}_${m.id}`.replace(/-/g, '_'), result: compile(m.spec) });
          else entries.push({ name: stem, result: compile(data) });
        };
        for (const f of files) {
          const full = workspace.resolve(f);
          if (!existsSync(full)) return toolError(`${f} does not exist in the workspace.`);
          if (statSync(full).isDirectory()) for (const name of readdirSync(full).sort()) (/\.json$/i.test(name) ? add(join(full, name)) : null);
          else add(full);
        }
      } catch (e) {
        return toolError(`Could not read the specs: ${(e as Error).message}`);
      }
      const pack = buildPack(entries, { namespace, version: mcVersion, description, models, deflate: (raw) => deflateSync(raw, { level: 9 }) });
      const issues = pack.issues.map((i) => `- ${i.level} \`${i.code}\` ${i.path}: ${i.message}${i.hint ? ` (${i.hint})` : ''}`).join('\n');
      if (!pack.ok) return toolError(`Pack not written:\n${issues}`);
      let written: string;
      try {
        written = workspace.display(writePack(workspace.resolve(out), pack.files));
      } catch (e) {
        return toolError((e as Error).message);
      }
      const check = validatePack(pack.files, { inflate: (d) => inflateSync(d), target: pack.version });
      const all = [...pack.issues, ...check.issues.filter((i) => i.level !== 'info')];
      const text = [
        `Wrote ${written}: ${pack.placed.length} texture(s), ${pack.files.size} files, pack format ${pack.format} (Minecraft ${pack.version}).`,
        ...pack.placed.map((p) => `- ${p.name}: ${p.files.join(', ')}`),
        ...(issues ? ['', issues] : []),
        ...(check.issues.some((i) => i.level !== 'info') ? ['', packReportToMarkdown(check)] : []),
      ].join('\n');
      return { content: [textBlock(text)], structuredContent: { ok: check.ok, out: written, format: pack.format, version: pack.version, files: pack.files.size, placed: pack.placed, issues: all } };
    },
  );

  server.registerTool(
    'texel_check_pack',
    {
      title: 'Check resource pack',
      description: `Check a resource pack (a folder or a .zip in the workspace, ${workspace.root}), not only ones Texel made: pack.mcmeta and the versions its format covers, file and namespace names, PNGs, .mcmeta animations and GUI scaling, entity texture sizes against Texel's layouts, models, block states, item definitions and particles that point at missing files, and unused textures. Each issue has the file, a JSON path and a fix hint.`,
      inputSchema: z.object({
        path: z.string().min(1).describe('The pack folder or .zip, relative to the workspace.'),
        mcVersion: z.string().optional().describe('Minecraft Java version the pack must work on, e.g. "1.21.4".'),
      }),
      outputSchema: z.object({ ok: z.boolean(), versions: z.array(z.string()), issues: z.array(issueShape), stats: z.record(z.string(), z.number()) }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ path, mcVersion }) => {
      let files: Map<string, Uint8Array>;
      try {
        files = readPack(workspace.resolve(path));
      } catch (e) {
        return toolError(`Could not read ${path}: ${(e as Error).message}`);
      }
      const r = validatePack(files, { inflate: (d) => inflateSync(d), target: mcVersion });
      return { content: [textBlock(packReportToMarkdown(r))], structuredContent: { ok: r.ok, versions: r.versions, issues: r.issues, stats: { ...r.stats } } };
    },
  );

  server.registerTool(
    'texel_diff',
    {
      title: 'Diff two skins',
      description: 'Compare two specs pixel by pixel and report which faces changed. Use it to confirm a patch touched only what you intended. Returns the changed-pixel mask over the texture map (magenta = changed).',
      inputSchema: z.object({ before: specInput, after: specInput }),
      outputSchema: z.object({ changedPixels: z.number(), faces: z.array(z.object({ face: z.string(), changed: z.number(), total: z.number() })) }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ before, after }) => {
      const a = compile(before), b = compile(after);
      if (a.layout !== b.layout || a.texture.width !== b.texture.width) return toolError(`The specs use different layouts (${a.layout}, ${b.layout}); diff compares two textures of the same layout.`);
      const d = diffTextures(a.texture, b.texture, b.rig);
      const content: CallToolResult['content'] = [textBlock(diffToMarkdown(d))];
      if (d.changedPixels) content.push(imageBlock(scaleImage(d.mask, 4)));
      return { content, structuredContent: { changedPixels: d.changedPixels, faces: d.faces } };
    },
  );

  server.registerTool(
    'texel_get_example',
    {
      title: 'Get example spec',
      description: `Return a complete, working example spec to learn from or fork. Skins: ${EXAMPLE_IDS.join(', ')}. Family: guild.`,
      inputSchema: z.object({ id: z.enum([...EXAMPLE_IDS, 'guild']) }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const doc = id === 'guild' ? FAMILY_EXAMPLES.guild : EXAMPLES[id];
      return { content: [textBlock(`\`\`\`json\n${formatSpec(doc)}\`\`\``)] };
    },
  );

  server.registerTool(
    'texel_read_docs',
    {
      title: 'Read Texel docs',
      description: `Read a documentation page as markdown. Pages: ${DOC_PAGES.map((p) => `${p} (${DOCS[p].title})`).join(', ')}. Read "spec" before writing your first spec.`,
      inputSchema: z.object({ page: z.enum(DOC_PAGES) }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ page }) => ({ content: [textBlock(DOCS[page].text)] }),
  );

  // ---- resources ------------------------------------------------------------

  server.registerResource(
    'docs',
    new ResourceTemplate('texel://docs/{page}', {
      list: async () => ({ resources: DOC_PAGES.map((p) => ({ uri: `texel://docs/${p}`, name: p, title: DOCS[p].title, mimeType: 'text/markdown' })) }),
    }),
    { title: 'Texel documentation', description: 'Protocol, spec reference, art guide, families and interfaces.', mimeType: 'text/markdown' },
    async (uri, { page }) => {
      const doc = DOCS[String(page) as keyof typeof DOCS];
      if (!doc) throw new Error(`unknown docs page "${page}"`);
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: doc.text }] };
    },
  );

  server.registerResource(
    'examples',
    new ResourceTemplate('texel://examples/{id}', {
      list: async () => ({ resources: [...EXAMPLE_IDS, 'guild'].map((id) => ({ uri: `texel://examples/${id}`, name: id, mimeType: 'application/json' })) }),
    }),
    { title: 'Example specs', description: 'Complete skin specs and one family.', mimeType: 'application/json' },
    async (uri, { id }) => {
      const key = String(id);
      const doc = key === 'guild' ? FAMILY_EXAMPLES.guild : EXAMPLES[key as keyof typeof EXAMPLES];
      if (!doc) throw new Error(`unknown example "${id}"`);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: formatSpec(doc) }] };
    },
  );

  for (const [name, schema] of Object.entries(SCHEMAS))
    server.registerResource(`schema-${name}`, `texel://schema/${name}`, { title: `JSON Schema: ${name}`, mimeType: 'application/schema+json' }, async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'application/schema+json', text: JSON.stringify(schema, null, 2) }],
    }));

  server.registerResource('viewer', VIEWER_URI, { title: 'Skin viewer', description: 'Interactive 3D preview for texel_render results (MCP Apps).', mimeType: VIEWER_MIME }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: VIEWER_MIME, text: typeof __TEXEL_VIEWER_HTML__ === 'string' ? __TEXEL_VIEWER_HTML__ : '<!doctype html><p>Viewer not bundled.</p>', _meta: { ui: { prefersBorder: true, csp: { resourceDomains: [], connectDomains: [] } } } }],
  }));

  // ---- prompts ---------------------------------------------------------------

  server.registerPrompt(
    'design_skin',
    {
      title: 'Design a skin',
      description: 'Run the Skin Agent Protocol for one skin, from brief to saved PNG.',
      argsSchema: z.object({ brief: z.string().describe('What the skin should look like.'), model: z.enum(['classic', 'slim']).optional() }),
    },
    ({ brief, model }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Design a Minecraft skin with Texel.\n\nBrief: ${brief}\nModel: ${model ?? 'your choice (classic = 4px arms, slim = 3px)'}\n\n1. Read texel://docs/spec and texel://docs/art-guide (or call texel_read_docs).\n2. Call texel_live and give me the URL, so I can watch every render.\n3. Put the brief in "description", in the language I wrote it in (answer me in it too). Decide whatever the brief leaves open and state your choices in one line instead of asking. Define the palette first: 2–4 tones per material.\n4. Draft layers broad → fine, texture (gradient/shade/noise) before small details. Give layers you may revisit an "id".\n5. Call texel_render. Fix every error and warning. Then judge the sheet image against rubric R1–R8 in texel://docs/protocol.\n6. Patch the weakest area (texel_patch changes layers by id) and check the new sheet; use texel_diff to confirm what changed. Stop when R1–R8 pass (≈3–6 iterations).\n7. Save with texel_save (sheet: true), call texel_share, and report the link, the files and the final score.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'continue_skin',
    {
      title: 'Continue a skin',
      description: 'Keep developing an existing skin from its share link, changing only what is asked.',
      argsSchema: z.object({ link: z.string().describe('The skin share link (/s/<id>) or id.'), change: z.string().describe('What should change.') }),
    },
    ({ link, change }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Keep working on this Texel skin: ${link}\n\nWhat I want changed: ${change}\n\n1. Load it with texel_pull and keep the original for comparison.\n2. Call texel_live and give me the URL, so I can watch every render.\n3. Say in one line what you'll change, then patch only the layers involved with texel_patch (by id); leave everything else as it is.\n4. After each patch, judge the sheet against rubric R1–R8 in texel://docs/protocol, and use texel_diff against the original to confirm only the intended faces changed.\n5. Save with texel_save (sheet: true), call texel_share, and give me the new link and the files. Answer in the language of my request.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'design_texture',
    {
      title: 'Design a texture',
      description: 'Make a texture other than a player skin (a mob, block, item, GUI sprite, particle, animated or glowing texture) or a set of them as a resource pack.',
      argsSchema: z.object({
        brief: z.string().describe('What to make, e.g. "a ruby ore block and a ruby sword" or "a red stone button".'),
        pack: z.enum(['yes', 'no']).optional().describe('Also build a resource pack with the result.'),
      }),
    },
    ({ brief, pack }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Make Minecraft textures with Texel.\n\nBrief: ${brief}\n\n1. Read texel://docs/spec (section Layouts, and Animation, GUI sprites, Blocks and tiling, Resource packs as they apply) and the last section of texel://docs/art-guide. Pick the layout for each texture; fork the closest example (texel_get_example: ember-blade, ash-log, magma-pulse, stone-button, spark, zebra, sky-evoker).\n2. Call texel_live and give me the URL.\n3. Keep each spec in a workspace file and set "asset" where it goes in a pack. Say in one line what you decided the brief left open.\n4. Render each with texel_render and fix every error and warning. Then judge the sheet: blocks must show no seam in the tiled panel, GUI sprites must resize cleanly, frames must change as intended, glowing pixels must be only what glows. Patch by layer id (texel_patch).\n5. Save with texel_save (sheet: true).${pack === 'yes' ? ' Then build a resource pack with texel_pack (models: true for new items and blocks) and report its checks.' : ''} Give me the file paths. Answer in the language of my request.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'design_family',
    {
      title: 'Design a skin family',
      description: 'Design a coherent set of skins (teams, factions, tiers) as one family document.',
      argsSchema: z.object({ brief: z.string().describe('The set to design, e.g. "4 football teams, home and away kits".') }),
    },
    ({ brief }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Design a family of Minecraft skins with Texel.\n\nBrief: ${brief}\n\n1. Read texel://docs/families and texel://docs/spec; study the "guild" example (texel_get_example).\n2. Perfect the base spec first with texel_render. Name shared colors semantically (primary, trim) so variants only override the palette.\n3. Give optional details layer ids and toggle them per variant with enable/disable.\n4. Express the set as a matrix when it is a product of axes (team × kit), otherwise as explicit variants.\n5. Call texel_render_family and check the lineup: members must be distinguishable at a glance and share one visual language.\n6. Save with texel_save_family.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'critique_skin',
    {
      title: 'Critique a skin',
      description: 'Review an existing spec against the protocol rubric and propose concrete layer patches.',
      argsSchema: z.object({ spec: z.string().describe('The spec JSON to critique.') }),
    },
    ({ spec }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Critique this Texel spec. Call texel_render on it, then score each rubric item R1–R8 from texel://docs/protocol as pass/fail with one sentence of evidence from the sheet image. For every failure, propose the exact layer JSON to add or change.\n\n\`\`\`json\n${spec}\n\`\`\``,
          },
        },
      ],
    }),
  );

  return server;
}
