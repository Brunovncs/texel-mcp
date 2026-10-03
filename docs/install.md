# Install as a tool

> Give any agent native Texel tools: an MCP server (with an interactive 3D viewer for MCP Apps hosts), a CLI and a portable Agent Skill. Source, issues and releases: [github.com/Brunovncs/texel-mcp](https://github.com/Brunovncs/texel-mcp). The MCP server and the CLI need Node 20 or later.

## Claude Code plugin

The repository is also a Claude Code plugin marketplace. The plugin runs the single-file MCP server and adds the `minecraft-skin-design` skill:

```
/plugin marketplace add Brunovncs/texel-mcp
/plugin install texel@texel
```

Files are written to the project directory Claude Code was started in.

## MCP server

The server speaks MCP over stdio. The compiler, docs, examples, schemas and the 3D viewer are embedded, so it needs no network access except for `texel_share`, `texel_pull` and the daily update check.

### From npm

The package is `texel-mcp`. Once it is published on npm, no install step is needed:

```bash
claude mcp add texel --scope user -- npx -y texel-mcp
```

### From the repository

```bash
git clone https://github.com/Brunovncs/texel-mcp
cd texel-mcp
npm install
npm run build          # writes dist/texel-mcp.mjs and dist/texel.mjs
claude mcp add texel --scope user -- node /absolute/path/texel-mcp/dist/texel-mcp.mjs
```

`plugin/server/texel-mcp.mjs` in the repository is the same server as one file with its dependencies bundled; it runs with plain `node` and no `npm install`. The site serves the same kind of build at `https://<site>/texel-mcp.mjs`.

Files are written to the directory the server runs in. Pin it with `--env TEXEL_WORKSPACE=/path/to/skins` or the `--workspace <dir>` flag.

### Claude Desktop, Cursor, VS Code and other clients

```json
{
  "mcpServers": {
    "texel": {
      "command": "npx",
      "args": ["-y", "texel-mcp", "--workspace", "/absolute/path/skins"]
    }
  }
}
```

With a local build, use `"command": "node"` and `"args": ["/absolute/path/texel-mcp.mjs", "--workspace", "/absolute/path/skins"]`.

### What the server provides

| Kind | Name | Purpose |
| --- | --- | --- |
| tool | `texel_render` | Compile + review; returns the review sheet image. Opens the 3D viewer in MCP Apps hosts. |
| tool | `texel_patch` | Apply a [spec patch](/docs/spec.md#patches) (change layers by id) and render the result like `texel_render`. |
| tool | `texel_validate` | Fast error check, no images. |
| tool | `texel_save` | Write `.png`, `.skin.json` and optional sheet to the workspace. |
| tool | `texel_live` | Start a live session: returns a studio URL where the person watches every `texel_render`. |
| tool | `texel_share` | Short share link (`/s/<id>`) for a spec. |
| tool | `texel_pull` | The spec behind a share link, to keep developing an existing skin. |
| tool | `texel_render_family` | Expand a family; lineup image + per-member scores. |
| tool | `texel_save_family` | Write every member plus `lineup.png`. |
| tool | `texel_import_png` | Turn an existing skin PNG into an editable spec. |
| tool | `texel_palette` | The main colors of a reference PNG as a ready palette and legend, with a role per color. |
| tool | `texel_diff` | Which faces a change touched, with a pixel mask. |
| tool | `texel_get_example`, `texel_read_docs` | Offline examples and docs. |
| resource | `texel://docs/{page}`, `texel://examples/{id}`, `texel://schema/{name}` | Same content as resources. |
| resource | `ui://texel/viewer` | MCP App: interactive 3D preview with a feedback box that posts back to the chat. |
| prompt | `design_skin`, `continue_skin`, `design_family`, `critique_skin` | Protocol runbooks with arguments. |

All write tools are confined to the workspace directory; paths outside it are rejected.

## CLI

The same compiler as a command-line tool with no dependencies:

```bash
npx -y -p texel-mcp texel-cli build spec.json -o skin.png --sheet sheet.png   # once published on npm
node dist/texel.mjs build spec.json -o skin.png --sheet sheet.png             # from a repository build
curl -O https://<site>/texel.mjs && node texel.mjs build spec.json -o skin.png  # single file from the site
```

`texel-cli --help` (or `node texel.mjs --help`) lists every command: `build`, `review`, `patch`, `sheet`, `palette`, `family`, `import`, `diff`, `share`, `pull`, `live`, `format`, `layouts`, `init`.

## Agent Skill

The `minecraft-skin-design` skill follows the open Agent Skills format (a `SKILL.md` with `name` and `description` frontmatter). It teaches the protocol and works with either the MCP tools or the CLI. The Claude Code plugin installs it; to install it by hand, save `plugin/skills/minecraft-skin-design/SKILL.md` from the repository in your agent's skills directory. For Claude Code:

```bash
mkdir -p ~/.claude/skills/minecraft-skin-design
curl -o ~/.claude/skills/minecraft-skin-design/SKILL.md https://<site>/skills/minecraft-skin-design/SKILL.md
```

Agents without skill support can read [`/agent.md`](/agent.md) on the site instead: the protocol, spec reference and art guide in one file.

## Updates

Installed copies don't update themselves. Once a day the CLI and the MCP server fetch `https://<site>/version.json` (the current release and where its files live) and compare it with their own version. When a newer release is out, the CLI prints the update steps on stderr and the MCP server adds them to the next tool result, with the release notes. For a copy installed with npm or run through npx the steps say to update through npm; for a downloaded file they say which file to download over which. The run that printed the notice completed normally. The check waits at most 1.5 s, is cached in `~/.texel/`, stays silent offline, and is skipped when `CI` or `TEXEL_NO_UPDATE_CHECK=1` is set. `TEXEL_SITE` points share links, live sessions and the check at another origin. `--version` prints the installed version of either tool; the skill carries it in `metadata.version`.
