# Install as a tool

> Give any agent native Skinsmith tools: an MCP server (with an interactive 3D viewer for MCP Apps hosts), a Claude Code plugin, and a portable Agent Skill.

## MCP server

`skinsmith-mcp.mjs` is a single file with no install step: the compiler, docs, examples, schemas and the 3D viewer are embedded. Requires Node 18+.

```bash
curl -O https://<site>/skinsmith-mcp.mjs
```

### Claude Code

```bash
claude mcp add skinsmith --scope user -- node /absolute/path/skinsmith-mcp.mjs
```

Files are written to the directory the server runs in. Pin it with `--env SKINSMITH_WORKSPACE=/path/to/skins` or the `--workspace <dir>` flag.

### Claude Desktop, Cursor, VS Code and other clients

```json
{
  "mcpServers": {
    "skinsmith": {
      "command": "node",
      "args": ["/absolute/path/skinsmith-mcp.mjs", "--workspace", "/absolute/path/skins"]
    }
  }
}
```

### What the server provides

| Kind | Name | Purpose |
| --- | --- | --- |
| tool | `skinsmith_render` | Compile + review; returns the review sheet image. Opens the 3D viewer in MCP Apps hosts. |
| tool | `skinsmith_validate` | Fast error check, no images. |
| tool | `skinsmith_save` | Write `.png`, `.skin.json` and optional sheet to the workspace. |
| tool | `skinsmith_render_family` | Expand a family; lineup image + per-member scores. |
| tool | `skinsmith_save_family` | Write every member plus `lineup.png`. |
| tool | `skinsmith_import_png` | Turn an existing skin PNG into an editable spec. |
| tool | `skinsmith_diff` | Which faces a change touched, with a pixel mask. |
| tool | `skinsmith_get_example`, `skinsmith_read_docs` | Offline examples and docs. |
| resource | `skinsmith://docs/{page}`, `skinsmith://examples/{id}`, `skinsmith://schema/{name}` | Same content as resources. |
| resource | `ui://skinsmith/viewer` | MCP App: interactive 3D preview with a feedback box that posts back to the chat. |
| prompt | `design_skin`, `design_family`, `critique_skin` | Protocol runbooks with arguments. |

All write tools are confined to the workspace directory; paths outside it are rejected.

## Claude Code plugin

The repository is also a plugin marketplace. The plugin bundles the MCP server and the `minecraft-skin-design` skill:

```bash
claude plugin marketplace add Brunovncs/skinsmith
claude plugin install skinsmith@skinsmith
```

## Agent Skill

The [`minecraft-skin-design`](/skills/minecraft-skin-design/SKILL.md) skill follows the open Agent Skills format (a `SKILL.md` with `name` and `description` frontmatter). Copy the folder into your agent's skills directory — for Claude Code, `~/.claude/skills/minecraft-skin-design/`. It teaches the protocol and works with either the MCP tools or the CLI.
