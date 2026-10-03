# Changelog

Each release's section is published as `notes` in `/version.json`, and installed tools show it in their update notice, so the agent knows what changed and whether to redo anything. Keep it to one or two lines, and say whether specs still render the same PNGs. A test fails when the current version has no section.

## 0.3.2

The update notice shows these notes, says the run that printed it completed normally, and asks to restart a running `texel.mjs live`. The skill keeps a single `texel.mjs` next to SKILL.md when updating. Compiler unchanged: specs render the same PNGs.

## 0.3.1

Skill instructions only: where `texel.mjs` lives, going live before the spec, docs links without MCP, drawing across faces with `copy`/`symmetrize`, a diff after every patch. Compiler unchanged.

## 0.3.0

Installed skill, CLI and MCP server learn when a newer release is out.
