---
name: minecraft-skin-design
description: Design, render, review and export Minecraft skins (64×64 PNG, classic or slim) and other textures (zombie, skeleton, armor, creeper, enderman, spider, villager, cape/elytra, 16×16 items and blocks) as Texel JSON specs, including families of related skins (teams, factions, tiers). Use when the user asks for a Minecraft skin, a set of skins, a mob, armor, cape or item texture, to edit or remix an existing texture PNG, or mentions Texel.
license: MIT
metadata:
  protocol: texel/1
  version: 0.3.2
---

# Minecraft skin design with Texel

A skin is a JSON **spec**, a palette plus an ordered list of drawing operations that target faces of the player model, compiled deterministically to a PNG. Never hand-edit PNG bytes; always work on the spec.

## Tools

Prefer the Texel MCP tools when they are available (`texel_render`, `texel_patch`, `texel_live`, `texel_share`, `texel_validate`, `texel_save`, `texel_render_family`, `texel_save_family`, `texel_import_png`, `texel_diff`, `texel_read_docs`, `texel_get_example`).

Without MCP, use the CLI (Node 18+). Download https://www.texel.dev.br/texel.mjs once into this skill's folder, next to this SKILL.md (e.g. `~/.claude/skills/minecraft-skin-design/texel.mjs`), and run it from there in every project, so there is one copy to keep current; `node <path>/texel.mjs --version` prints its version. Below, `texel.mjs` stands for that path:

```bash
node texel.mjs live spec.json --open          # background: the user watches every save
node texel.mjs review spec.json               # issues + text render
node texel.mjs patch spec.json fix.json -o spec.json --sheet sheet.png   # change layers by id
node texel.mjs build spec.json -o skin.png --sheet sheet.png
node texel.mjs share spec.json                # short share link
node texel.mjs pull <link> -o spec.json       # continue an existing skin from its link
node texel.mjs family family.json -o skins/ --lineup lineup.png
node texel.mjs import existing.png -o spec.json [--layout zombie]
node texel.mjs layouts                       # texture layouts and their part names
```

Read `sheet.png` / `lineup.png` with your image-viewing tool to judge the result.

When the CLI or an MCP tool says a newer Texel release is available, the result it came with still stands; update before your next Texel command. Download the files it lists, this SKILL.md included. Keep a single `texel.mjs` next to this SKILL.md: if the notice names a copy elsewhere, save the new one here instead, delete the old one and use this path from then on. Restart a running `live` from the new copy, re-read this SKILL.md, and tell the user what changed (the notice's "What changed" line says whether earlier renders are affected).

## Procedure

1. **Brief.** Restate the request as 1–3 sentences of visible features; store it in `description`, in the user's language (reply in it too; keep keys and ids in English). Don't open with questions: decide what was left open, state your choices in one line.
2. **Go live, before writing the spec.** Start a live session (`texel_live`, or `node texel.mjs live spec.json --open` in the background; the file may not exist yet, it is pushed on every save) and send the user its URL right away, in the same reply as the brief, so they watch the skin take shape and can steer mid-way.
3. **Learn the format.** Read the spec reference before your first spec and the art guide for pixel-art rules: `texel_read_docs` pages `spec` and `art-guide`, or without MCP https://www.texel.dev.br/docs/spec.md and https://www.texel.dev.br/docs/art-guide.md. Fork an example when one is close (`texel_get_example`, or https://www.texel.dev.br/examples/index.json and `/examples/<name>.json`).
4. **Palette first.** Name colors by role (`skin`, `hair`, `primary`, `trim`) with derived tones (`"primaryDark": "primary:-12"`), 2–4 tones per material.
5. **Layers broad → fine.** `fill` on `all` first (no transparent base pixels) → parts → bands (`rect` with `y`/`h`) → shading on broad areas (`gradient`, `shade`, `noise` jitter 2–5) → details (face `pixels`, collars, buttons) → overlay. Texture before details, or noise smears them. Don't paint areas you fully repaint later (`overwritten-layer`). Paint `rightArm`/`rightLeg`, then `mirror`. Give revisitable layers an `id`.
   Draw a feature that crosses faces (wings over `body.back` and the arm backs, a cape, straps) once per side and copy it instead of mirroring rows by hand: paint the left half of `body.back@overlay` and `symmetrize` it, paint `leftArm.back@overlay` and `copy` it to `rightArm.back@overlay` with `"flip": "h"`. Both work on `@overlay` faces. Then check that it still reads from the front.
6. **Render and review.** Fix every error and warning first. Then look at the sheet image and check the rubric:
   - R1 every brief feature visible · R2 face readable (eyes, brows, mouth) · R3 parts distinguishable by value · R4 light from above, darker undersides and inner faces · R5 no large flat areas · R6 back and sides designed · R7 overlay adds depth · R8 zero errors/warnings.
7. **Patch the weakest item** with a spec patch by layer id (`texel_patch` / `texel.mjs patch`; docs page `spec`, section Patches), look at the new render, and after every patch diff it against the previous version (`texel_diff` / `texel.mjs diff`; keep a copy before patching in place) to confirm the change touched only the intended faces. Stop when R1–R8 pass or after ~6 iterations.
8. **Ship.** Save the PNG, the `.skin.json` source and the sheet, and create the short share link (`texel_share` / `texel.mjs share`). Give the user the link and the file paths (not the JSON itself), and how to use it: upload it at minecraft.net → Profile → Skin (classic or slim to match `model`), or save the PNGs into a resource pack or a mod's assets folder. For many skins, build them in one go with a family (`texel_save_family` / `texel.mjs family`).

## Continuing an existing skin

Given a share link (`/s/<id>`), load the spec (`texel_pull` or `texel.mjs pull <link> -o skin.json`), keep a copy of the original, go live, and change only what was asked: patch the layers involved by id, then use `texel_diff` / `texel.mjs diff` to confirm nothing else moved. Finish with a new share link (links are immutable; each version gets its own).

## Families

For several related skins, write one family document (`kind: "family"`) instead of copy-pasting specs: a `base` spec plus `variants` or a `matrix` of axes whose patches override the palette and toggle layers by id. Perfect the base first, then check the lineup for members that are too similar. Read docs page `families`.

## Other textures

Set `"layout"` in the spec to paint something other than a player skin: `zombie`, `drowned`, `humanoid` (armor layers), `skeleton`, `creeper`, `enderman`, `spider`, `villager`, `cape` (with elytra), `item`, `block`. Each has its own part names and size; read the Layouts section of the spec reference (or `node texel.mjs layouts`) before the first draft, and fork the closest example (`miner-zombie`, `creeper`, `bronze-armor`, `banner-cape`, `ember-blade`). Mobs whose left limbs mirror the right ones only have `rightArm`/`rightLeg`. Armor, skeletons and items keep transparent pixels on purpose; items need an outline and a clear background. Ship the PNG under the path the game or mod expects (the layout table lists the vanilla paths).

## Pitfalls

- `right`/`left` are the character's sides: `rightArm` is on the viewer's left in the front view.
- Slim arm fronts are 3 px wide; classic 4 px.
- Base layer pixels must be opaque; overlay pixels opaque or `transparent`, never semi-transparent.
- The review score measures hygiene only; a 100 can still look bad. Always look at the image.
