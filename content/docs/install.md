# Install as a tool

> Give any agent native Texel tools: an MCP server (with an interactive 3D viewer for MCP Apps hosts), a Claude Code plugin, and a portable Agent Skill.

## MCP server

`texel-mcp.mjs` is a single file with no install step: the compiler, docs, examples, schemas and the 3D viewer are embedded. Requires Node 18+.

```bash
curl -O https://<site>/texel-mcp.mjs
```

### Claude Code

```bash
claude mcp add texel --scope user -- node /absolute/path/texel-mcp.mjs
```

Files are written to the directory the server runs in. Pin it with `--env TEXEL_WORKSPACE=/path/to/skins` or the `--workspace <dir>` flag.

### Claude Desktop, Cursor, VS Code and other clients

```json
{
  "mcpServers": {
    "texel": {
      "command": "node",
      "args": ["/absolute/path/texel-mcp.mjs", "--workspace", "/absolute/path/skins"]
    }
  }
}
```

### What the server provides

| Kind | Name | Purpose |
| --- | --- | --- |
| tool | `texel_render` | Compile + review; returns the review sheet image. Opens the 3D viewer in MCP Apps hosts. |
| tool | `texel_validate` | Fast error check, no images. |
| tool | `texel_save` | Write `.png`, `.skin.json` and optional sheet to the workspace. |
| tool | `texel_render_family` | Expand a family; lineup image + per-member scores. |
| tool | `texel_save_family` | Write every member plus `lineup.png`. |
| tool | `texel_import_png` | Turn an existing skin PNG into an editable spec. |
| tool | `texel_diff` | Which faces a change touched, with a pixel mask. |
| tool | `texel_get_example`, `texel_read_docs` | Offline examples and docs. |
| resource | `texel://docs/{page}`, `texel://examples/{id}`, `texel://schema/{name}` | Same content as resources. |
| resource | `ui://texel/viewer` | MCP App: interactive 3D preview with a feedback box that posts back to the chat. |
| prompt | `design_skin`, `design_family`, `critique_skin` | Protocol runbooks with arguments. |

All write tools are confined to the workspace directory; paths outside it are rejected.

## Claude Code plugin

The repository is also a plugin marketplace. The plugin bundles the MCP server and the `minecraft-skin-design` skill:

```bash
claude plugin marketplace add Brunovncs/texel
claude plugin install texel@texel
```

## Agent Skill

The [`minecraft-skin-design`](/skills/minecraft-skin-design/SKILL.md) skill follows the open Agent Skills format (a `SKILL.md` with `name` and `description` frontmatter). Copy the folder into your agent's skills directory. For Claude Code, `~/.claude/skills/minecraft-skin-design/`. It teaches the protocol and works with either the MCP tools or the CLI.
