import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createTexelServer, SERVER_VERSION } from './server';
import { Workspace } from './workspace';

const args = process.argv.slice(2);
if (args.includes('--version')) {
  process.stdout.write(`${SERVER_VERSION}\n`);
  process.exit(0);
}
if (args.includes('--help')) {
  process.stdout.write(`texel-mcp ${SERVER_VERSION} — Texel MCP server (stdio)

  claude mcp add texel -- node /path/to/texel-mcp.mjs
  options: --workspace <dir>   directory for saved files (default: $TEXEL_WORKSPACE or cwd)
`);
  process.exit(0);
}
const wsFlag = args.indexOf('--workspace');
const workspace = new Workspace(wsFlag >= 0 ? args[wsFlag + 1] : undefined);

serveStdio(() => createTexelServer(workspace), {
  onerror: (e) => process.stderr.write(`[texel-mcp] ${e.message}\n`),
});
