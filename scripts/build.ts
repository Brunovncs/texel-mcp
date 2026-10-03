import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bundleCli, bundleMcpWithMeta, rootDir, thirdPartyNotices } from './bundles';

/**
 * `build`: dist/texel-mcp.mjs and dist/texel.mjs for the npm package (the MCP SDK and zod stay
 * dependencies). `build --plugin`: the single-file server the Claude Code plugin runs, with the
 * licenses of everything it bundles.
 */
const out = (path: string, text: string) => {
  const full = resolve(rootDir, path);
  mkdirSync(resolve(full, '..'), { recursive: true });
  writeFileSync(full, text);
  console.log(`${path}  ${(Buffer.byteLength(text) / 1024).toFixed(1)} KiB`);
};

if (process.argv.includes('--plugin')) {
  const { text, metafile } = await bundleMcpWithMeta({ standalone: true });
  out('plugin/server/texel-mcp.mjs', text);
  out('plugin/server/THIRD_PARTY_NOTICES.md', thirdPartyNotices(metafile));
} else {
  out('dist/texel-mcp.mjs', (await bundleMcpWithMeta({ standalone: false })).text);
  out('dist/texel.mjs', await bundleCli());
}
