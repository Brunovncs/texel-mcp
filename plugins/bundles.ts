import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build, type BuildOptions, type Plugin } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
/** Inline markdown as text, substituting the deployment origin for the `https://<site>` placeholder. */
const markdownText: Plugin = {
  name: 'markdown-text',
  setup(b) {
    const site = (process.env.SITE_URL ?? '').replace(/\/$/, '');
    b.onLoad({ filter: /\.md$/ }, (args) => ({ contents: readFileSync(args.path, 'utf8').replaceAll('https://<site>', site || 'https://<site>'), loader: 'text' }));
  },
};

const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version as string;

async function bundleText(options: BuildOptions): Promise<string> {
  const r = await build({ bundle: true, write: false, target: 'es2022', legalComments: 'none', logLevel: 'silent', ...options });
  const [file] = r.outputFiles ?? [];
  if (!file) throw new Error(`esbuild produced no output for ${String(options.entryPoints)}`);
  return file.text;
}

/** Zero-dependency Node CLI. */
export function bundleCli() {
  return bundleText({ entryPoints: [resolve(root, 'src/cli/cli.ts')], platform: 'node', format: 'esm', banner: { js: `// Texel CLI ${version} — generated file. Docs: /llms.txt` } });
}

/** DOM-free compiler module. */
export function bundleCore() {
  return bundleText({ entryPoints: [resolve(root, 'src/core/index.ts')], platform: 'neutral', format: 'esm', banner: { js: `// Texel core ${version} — generated file. Docs: /llms.txt` } });
}

/** Self-contained MCP App document: inlined CSS + JS, no network access required. */
export async function bundleViewerHtml() {
  const [js, css] = await Promise.all([
    bundleText({ entryPoints: [resolve(root, 'src/mcp/viewer/viewer.ts')], platform: 'browser', format: 'iife', minify: true }),
    bundleText({ entryPoints: [resolve(root, 'src/mcp/viewer/viewer.css')], loader: { '.css': 'css' }, minify: true }),
  ]);
  const template = readFileSync(resolve(root, 'src/mcp/viewer/viewer.html'), 'utf8');
  return template.replace('/*__STYLE__*/', () => css).replace('/*__SCRIPT__*/', () => js.replace(/<\/script/gi, '<\\/script'));
}

/** Single-file MCP stdio server with docs, examples, schemas and the viewer embedded. */
export async function bundleMcp() {
  const viewer = await bundleViewerHtml();
  return bundleText({
    entryPoints: [resolve(root, 'src/mcp/main.ts')],
    platform: 'node',
    format: 'esm',
    plugins: [markdownText],
    minify: true,
    define: { __TEXEL_VIEWER_HTML__: JSON.stringify(viewer), __TEXEL_VERSION__: JSON.stringify(version) },
    banner: { js: `#!/usr/bin/env node\n// Texel MCP server ${version} — generated file.\nimport { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);` },
  });
}
