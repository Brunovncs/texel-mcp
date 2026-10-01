import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { McpServer, ResourceTemplate, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  compile,
  decodePNG,
  diffTextures,
  diffToMarkdown,
  encodePNG,
  expandFamily,
  formatSpec,
  PROTOCOL,
  renderLineup,
  renderSheet,
  review,
  reviewToMarkdown,
  scaleImage,
  shareURL,
  textureToSpec,
  type CompileResult,
  type Image,
  type Review,
} from '../core';
import { DOC_PAGES, DOCS, EXAMPLE_IDS, EXAMPLES, FAMILY_EXAMPLES, SCHEMAS } from './content';
import { Workspace } from './workspace';
import { openBrowser, startLive, type LiveSession } from '../live/server';
import { SITE_ORIGIN } from '../live/site';

export const SERVER_VERSION = typeof __TEXEL_VERSION__ === 'string' ? __TEXEL_VERSION__ : '0.0.0-dev';
export const VIEWER_URI = 'ui://texel/viewer';
export const VIEWER_MIME = 'text/html;profile=mcp-app';
/** Key under which render results carry the texture for the MCP App viewer (kept out of model context). */
export const TEXTURE_META_KEY = 'texel/texture';

const INSTRUCTIONS = `Texel compiles Minecraft skin specs (JSON: palette + ordered drawing ops) into 64×64 PNGs. Protocol ${PROTOCOL}.
Workflow: read the "spec" docs (texel_read_docs or resource texel://docs/spec), draft a spec, call texel_render, look at the returned review sheet image and the issues, patch the spec, render again, then texel_save and texel_share.
When a person is waiting on the result, call texel_live first and give them the URL: every texel_render then appears in their open studio tab, so they can watch and steer while you work.
For many related skins (teams, factions, tiers), write a family (kind: "family") and use texel_render_family / texel_save_family.
The score only measures technical hygiene; judge appearance from the sheet image against the brief.`;

const specInput = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .describe('A Texel skin spec (version 1) as a JSON object or JSON text. Format: texel://docs/spec, schema: texel://schema/skinspec.v1');
const familyInput = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .describe('A skin family ({ kind: "family", base, variants?, matrix? }) as a JSON object or JSON text. Format: texel://docs/families');

const issueShape = z.object({ level: z.enum(['error', 'warning', 'info']), code: z.string(), path: z.string(), message: z.string(), hint: z.string().optional() });
const reviewShape = z.object({
  ok: z.boolean(),
  name: z.string(),
  model: z.enum(['classic', 'slim']),
  score: z.number(),
  issues: z.array(issueShape),
  stats: z.object({ layers: z.number(), disabledLayers: z.number(), colorsUsed: z.number(), baseCoverage: z.number(), overlayPixels: z.number(), paletteSize: z.number() }),
  next: z.array(z.string()),
});

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const png = (img: Image) => encodePNG(img, (raw) => deflateSync(raw, { level: 9 }));
const imageBlock = (img: Image) => ({ type: 'image' as const, data: base64(png(img)), mimeType: 'image/png' });
const textBlock = (text: string) => ({ type: 'text' as const, text });

function reviewPayload(result: CompileResult, r: Review) {
  const { model: _model, ...stats } = r.stats;
  void _model;
  return { ok: r.ok, name: String(result.spec?.name ?? 'Untitled'), model: result.model, score: r.score, issues: r.issues, stats, next: r.next };
}

function toolError(message: string): CallToolResult {
  return { isError: true, content: [textBlock(message)] };
}

/** Build a fully configured server. Called once per connection by the transport entry point. */
export function createTexelServer(workspace = new Workspace()): McpServer {
  const server = new McpServer({ name: 'texel', title: 'Texel', version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
  let live: LiveSession | null = null;

  // ---- tools --------------------------------------------------------------

  server.registerTool(
    'texel_render',
    {
      title: 'Render skin',
      description:
        'Compile a skin spec and review it. Returns a review sheet image (front | back | right | left views + raw texture), the review (score, issues with JSON paths and fix hints, suggested next steps) and, on request, the 64×64 texture and a text render. Deterministic; never modifies files.',
      inputSchema: z.object({
        spec: specInput,
        include: z.array(z.enum(['sheet', 'texture', 'ascii'])).default(['sheet']).describe('Extra outputs. "sheet" is the review image; "ascii" adds a text render for models without vision.'),
      }),
      outputSchema: reviewShape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: VIEWER_URI } },
    },
    async ({ spec, include }) => {
      const result = compile(spec);
      const r = review(result);
      if (live && result.spec) live.push(formatSpec(result.spec));
      const content: CallToolResult['content'] = [textBlock(reviewToMarkdown(r, { includeAscii: include.includes('ascii') }))];
      if (include.includes('sheet')) content.push(imageBlock(renderSheet(result.texture, result.model).image));
      if (include.includes('texture')) content.push(imageBlock(scaleImage(result.texture, 4)));
      return {
        content,
        structuredContent: reviewPayload(result, r),
        _meta: { [TEXTURE_META_KEY]: `data:image/png;base64,${base64(png(result.texture))}` },
      };
    },
  );

  server.registerTool(
    'texel_validate',
    {
      title: 'Validate skin spec',
      description: 'Check a spec for errors and warnings without rendering images. Cheap; use it after every edit.',
      inputSchema: z.object({ spec: specInput }),
      outputSchema: z.object({ ok: z.boolean(), score: z.number(), issues: z.array(issueShape) }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ spec }) => {
      const r = review(compile(spec));
      const text = r.issues.length ? r.issues.map((i) => `${i.level} ${i.code} at ${i.path}: ${i.message}${i.hint ? ` (${i.hint})` : ''}`).join('\n') : 'No issues.';
      return { content: [textBlock(`score ${r.score}/100\n${text}`)], structuredContent: { ok: r.ok, score: r.score, issues: r.issues } };
    },
  );

  server.registerTool(
    'texel_save',
    {
      title: 'Save skin',
      description: `Compile a spec and write <path>.png (the skin), <path>.skin.json (the source) and optionally <path>.sheet.png into the workspace (${workspace.root}). Refuses specs with errors.`,
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
        const files = [workspace.write(`${stem}.png`, png(result.texture)), workspace.write(`${stem}.skin.json`, formatSpec(result.spec))];
        if (sheet) files.push(workspace.write(`${stem}.sheet.png`, png(renderSheet(result.texture, result.model).image)));
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
      outputSchema: z.object({ url: z.string(), port: z.number(), viewers: z.number() }),
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
Give this URL to the user. Each texel_render now updates their studio tab (${live.clients()} viewer(s) connected).`)],
        structuredContent: { url: live.url, port: live.port, viewers: live.clients() },
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
      if (built.length) content.push(imageBlock(renderLineup(built.map(({ result }) => ({ texture: result.texture, model: result.model })), 6)));
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
          files.push(workspace.write(`${directory}/${m.id}.png`, png(result.texture)));
          files.push(workspace.write(`${directory}/${m.id}.skin.json`, formatSpec(m.spec)));
        }
        files.push(workspace.write(`${directory}/lineup.png`, png(renderLineup(built.map(({ result }) => ({ texture: result.texture, model: result.model })), 6))));
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
      description: 'Convert an existing skin PNG (64×64 or legacy 64×32) in the workspace into an editable spec, one layer per painted face, palette keys c01…cNN. Rename palette keys to material names before editing.',
      inputSchema: z.object({ path: z.string().min(1).describe('Path to a .png file, relative to the workspace.') }),
      outputSchema: z.object({ spec: z.record(z.string(), z.unknown()), lossy: z.boolean(), model: z.enum(['classic', 'slim']) }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ path }) => {
      try {
        const bytes = readFileSync(workspace.resolve(path));
        const { spec, lossy } = textureToSpec(decodePNG(bytes, (d) => inflateSync(d)), path.split(/[\\/]/).pop()?.replace(/\.png$/i, ''));
        return {
          content: [textBlock(`${lossy ? 'Imported with color quantization.' : 'Imported losslessly.'}\n\n\`\`\`json\n${formatSpec(spec)}\`\`\``)],
          structuredContent: { spec: spec as unknown as Record<string, unknown>, lossy, model: spec.model ?? 'classic' },
        };
      } catch (e) {
        return toolError(`Import failed: ${(e as Error).message}`);
      }
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
      const d = diffTextures(a.texture, b.texture, b.model);
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
            text: `Design a Minecraft skin with Texel.\n\nBrief: ${brief}\nModel: ${model ?? 'your choice (classic = 4px arms, slim = 3px)'}\n\n1. Read texel://docs/spec and texel://docs/art-guide (or call texel_read_docs).\n2. Call texel_live and give me the URL, so I can watch every render.\n3. Put the brief in "description", in the language I wrote it in (answer me in it too). Decide whatever the brief leaves open and state your choices in one line instead of asking. Define the palette first: 2–4 tones per material.\n4. Draft layers broad → fine, texture (gradient/shade/noise) before small details. Give layers you may revisit an "id".\n5. Call texel_render. Fix every error and warning. Then judge the sheet image against rubric R1–R8 in texel://docs/protocol.\n6. Patch the weakest area and render again; use texel_diff to confirm what changed. Stop when R1–R8 pass (≈3–6 iterations).\n7. Save with texel_save (sheet: true), call texel_share, and report the link, the files and the final score.`,
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
