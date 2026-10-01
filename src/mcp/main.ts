import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createSkinsmithServer, SERVER_VERSION } from './server';
import { Workspace } from './workspace';

const args = process.argv.slice(2);
if (args.includes('--version')) {
  process.stdout.write(`${SERVER_VERSION}\n`);
  process.exit(0);
}
if (args.includes('--help')) {
  process.stdout.write(`skinsmith-mcp ${SERVER_VERSION} — Skinsmith MCP server (stdio)

  claude mcp add skinsmith -- node /path/to/skinsmith-mcp.mjs
  options: --workspace <dir>   directory for saved files (default: $SKINSMITH_WORKSPACE or cwd)
`);
  process.exit(0);
}
const wsFlag = args.indexOf('--workspace');
const workspace = new Workspace(wsFlag >= 0 ? args[wsFlag + 1] : undefined);

serveStdio(() => createSkinsmithServer(workspace), {
  onerror: (e) => process.stderr.write(`[skinsmith-mcp] ${e.message}\n`),
});
