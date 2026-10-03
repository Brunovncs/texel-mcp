import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { SITE_ORIGIN } from '../live/site';
import { checkForUpdate } from '../live/update';
import { createTexelServer, SERVER_VERSION } from './server';
import { Workspace } from './workspace';

const args = process.argv.slice(2);
if (args.includes('--version')) {
  process.stdout.write(`${SERVER_VERSION}\n`);
  process.exit(0);
}
if (args.includes('--help')) {
  process.stdout.write(`texel-mcp ${SERVER_VERSION}: Texel MCP server (stdio)

  claude mcp add texel -- npx -y texel-mcp
  claude mcp add texel -- node /path/to/texel-mcp.mjs
  options: --workspace <dir>   directory for saved files (default: $TEXEL_WORKSPACE or cwd)
  env:     TEXEL_NO_UPDATE_CHECK=1 skips the daily check for a newer release
`);
  process.exit(0);
}
const wsFlag = args.indexOf('--workspace');
const workspace = new Workspace(wsFlag >= 0 ? args[wsFlag + 1] : undefined);

// A live session's open browser connections must not outlive the client.
process.stdin.on('end', () => process.exit(0));

const update = checkForUpdate(SERVER_VERSION, { site: SITE_ORIGIN });
serveStdio(() => createTexelServer(workspace, update), {
  onerror: (e) => process.stderr.write(`[texel-mcp] ${e.message}\n`),
});
