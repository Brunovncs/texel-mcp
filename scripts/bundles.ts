import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type BuildOptions, type Metafile, type Plugin } from 'esbuild';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** Origin used for share links, live sessions and the `https://<site>` placeholder in the docs. */
const SITE = (process.env.SITE_URL || 'https://www.texel.dev.br').replace(/\/$/, '');
export const REPO_URL = 'https://github.com/Brunovncs/texel-mcp';

/** Inline markdown as text, substituting the site origin for the `https://<site>` placeholder. */
const markdownText: Plugin = {
  name: 'markdown-text',
  setup(b) {
    b.onLoad({ filter: /\.md$/ }, (args) => ({ contents: readFileSync(args.path, 'utf8').replaceAll('https://<site>', SITE), loader: 'text' }));
  },
};

export const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version as string;
const buildDefine = { __TEXEL_SITE__: JSON.stringify(process.env.SITE_URL ? SITE : ''), __TEXEL_VERSION__: JSON.stringify(version) };

interface Bundle {
  text: string;
  metafile: Metafile;
}

async function bundle(options: BuildOptions): Promise<Bundle> {
  const r = await build({ bundle: true, write: false, target: 'es2022', legalComments: 'eof', logLevel: 'silent', metafile: true, ...options });
  const [file] = r.outputFiles ?? [];
  if (!file || !r.metafile) throw new Error(`esbuild produced no output for ${String(options.entryPoints)}`);
  return { text: file.text, metafile: r.metafile };
}

/** Zero-dependency Node CLI. */
export async function bundleCli() {
  const live = await bundleLiveHtml();
  const { text } = await bundle({
    entryPoints: [resolve(root, 'src/cli/cli.ts')],
    platform: 'node',
    format: 'esm',
    define: { __TEXEL_LIVE_HTML__: JSON.stringify(live), ...buildDefine },
    banner: { js: `#!/usr/bin/env node\n// Texel CLI ${version}. Generated file. Source: ${REPO_URL}` },
  });
  return text;
}

/** Self-contained MCP App document: inlined CSS + JS, no network access required. */
export async function bundleViewerHtml() {
  const [js, css] = await Promise.all([
    bundle({ entryPoints: [resolve(root, 'src/mcp/viewer/viewer.ts')], platform: 'browser', format: 'iife', minify: true }),
    bundle({ entryPoints: [resolve(root, 'src/mcp/viewer/viewer.css')], loader: { '.css': 'css' }, minify: true }),
  ]);
  const template = readFileSync(resolve(root, 'src/mcp/viewer/viewer.html'), 'utf8');
  return template.replace('/*__STYLE__*/', () => css.text).replace('/*__SCRIPT__*/', () => js.text.replace(/<\/script/gi, '<\\/script'));
}

/** The live session's page, served by the local server: inlined CSS + JS. */
export async function bundleLiveHtml() {
  const [js, css] = await Promise.all([
    bundle({ entryPoints: [resolve(root, 'src/live/page/page.ts')], platform: 'browser', format: 'iife', minify: true }),
    bundle({ entryPoints: [resolve(root, 'src/live/page/page.css')], loader: { '.css': 'css' }, minify: true }),
  ]);
  const template = readFileSync(resolve(root, 'src/live/page/page.html'), 'utf8');
  return template.replace('/*__STYLE__*/', () => css.text).replace('/*__SCRIPT__*/', () => js.text.replace(/<\/script/gi, '<\\/script'));
}

/**
 * MCP stdio server with docs, examples, schemas and the viewer embedded. With `standalone` the MCP
 * SDK and zod are bundled too (the Claude Code plugin has no install step); otherwise they stay
 * imports, resolved from the package's dependencies.
 */
export async function bundleMcpWithMeta({ standalone = true } = {}): Promise<Bundle> {
  const [viewer, live] = await Promise.all([bundleViewerHtml(), bundleLiveHtml()]);
  const header = `#!/usr/bin/env node\n// Texel MCP server ${version}. Generated file. Source: ${REPO_URL}`;
  return bundle({
    entryPoints: [resolve(root, 'src/mcp/main.ts')],
    platform: 'node',
    format: 'esm',
    plugins: [markdownText],
    minify: standalone,
    ...(standalone ? {} : { packages: 'external' as const }),
    define: { __TEXEL_VIEWER_HTML__: JSON.stringify(viewer), __TEXEL_LIVE_HTML__: JSON.stringify(live), ...buildDefine },
    banner: {
      js: standalone
        ? `${header}\n// Bundles third-party packages; their licenses are in THIRD_PARTY_NOTICES.md next to this file.\nimport { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);`
        : header,
    },
  });
}

export async function bundleMcp(options?: { standalone?: boolean }) {
  return (await bundleMcpWithMeta(options)).text;
}

/** Package root of a bundled input inside node_modules (handles scoped names). */
function packageDir(input: string): string | null {
  const parts = resolve(root, input).split(sep);
  const i = parts.lastIndexOf('node_modules');
  if (i < 0) return null;
  const name = parts[i + 1]?.startsWith('@') ? parts.slice(i + 1, i + 3) : parts.slice(i + 1, i + 2);
  return [...parts.slice(0, i + 1), ...name].join(sep);
}

/** License texts of every third-party package that ended up in a bundle. */
export function thirdPartyNotices(metafile: Metafile): string {
  const dirs = [...new Set(Object.keys(metafile.inputs).map(packageDir).filter((d): d is string => d !== null))];
  const entries = dirs
    .map((dir) => {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string; version: string; license?: string; repository?: string | { url?: string } };
      const file = readdirSync(dir).find((f) => /^(licen[sc]e|copying)(\.(md|txt))?$/i.test(f));
      const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
      const notice = readdirSync(dir).find((f) => /^notice(\.(md|txt))?$/i.test(f));
      const text = [
        file ? readFileSync(join(dir, file), 'utf8').trim() : `No license file shipped; package.json declares ${pkg.license ?? 'no license'}.`,
        ...(notice ? [readFileSync(join(dir, notice), 'utf8').trim()] : []),
      ].join('\n\n');
      return { name: pkg.name, body: `## ${pkg.name} ${pkg.version}\n\nLicense: ${pkg.license ?? 'unknown'}${repo ? `\nRepository: ${repo}` : ''}\n\n\`\`\`\n${text}\n\`\`\`\n` };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return [
    '# Third-party notices',
    '',
    `\`texel-mcp.mjs\` in this directory is a single-file build of the Texel MCP server (${REPO_URL}, MIT). It bundles the following packages, whose licenses are reproduced here.`,
    '',
    ...entries.map((e) => e.body),
  ].join('\n');
}

export const rootDir = root;
