---
name: minecraft-skin-design
description: Design, render, review and export Minecraft Java skins (64×64 PNG, classic or slim) as Texel JSON specs, including families of related skins (teams, factions, tiers). Use when the user asks for a Minecraft skin, a set of skins, to edit or remix an existing skin PNG, or mentions Texel.
license: MIT
metadata:
  protocol: texel/1
---

# Minecraft skin design with Texel

A skin is a JSON **spec** — a palette plus an ordered list of drawing operations that target faces of the player model — compiled deterministically to a PNG. Never hand-edit PNG bytes; always work on the spec.

## Tools

Prefer the Texel MCP tools when they are available (`texel_render`, `texel_validate`, `texel_save`, `texel_render_family`, `texel_save_family`, `texel_import_png`, `texel_diff`, `texel_read_docs`, `texel_get_example`).

Without MCP, use the CLI (Node 18+) — download `texel.mjs` from the Texel site, then:

```bash
node texel.mjs review spec.json               # issues + text render
node texel.mjs build spec.json -o skin.png --sheet sheet.png
node texel.mjs family family.json -o skins/ --lineup lineup.png
node texel.mjs import existing.png -o spec.json
```

Read `sheet.png` / `lineup.png` with your image-viewing tool to judge the result.

## Procedure

1. **Brief.** Restate the request as 1–3 sentences of visible features; store it in `description`.
2. **Learn the format.** Read the spec reference (`texel_read_docs` page `spec`) before your first spec, and the art guide for pixel-art rules. Fork an example when one is close.
3. **Palette first.** Name colors by role (`skin`, `hair`, `primary`, `trim`) with derived tones (`"primaryDark": "primary:-12"`), 2–4 tones per material.
4. **Layers broad → fine.** `fill` on `all` first (no transparent base pixels) → parts → bands (`rect` with `y`/`h`) → face with `pixels` → shading (`shade`, `gradient`, `noise` jitter 2–5) → overlay details. Paint `rightArm`/`rightLeg`, then `mirror`. Give revisitable layers an `id`.
5. **Render and review.** Fix every error and warning first. Then look at the sheet image and check the rubric:
   - R1 every brief feature visible · R2 face readable (eyes, brows, mouth) · R3 parts distinguishable by value · R4 light from above, darker undersides and inner faces · R5 no large flat areas · R6 back and sides designed · R7 overlay adds depth · R8 zero errors/warnings.
6. **Patch the weakest item**, re-render, and use `texel_diff` to confirm the change touched only the intended faces. Stop when R1–R8 pass or after ~6 iterations.
7. **Ship.** Save the PNG, the `.skin.json` source and the sheet. Tell the user the file paths and how to upload the skin (minecraft.net → Profile → Skin, choosing classic or slim to match `model`).

## Families

For several related skins, write one family document (`kind: "family"`) instead of copy-pasting specs: a `base` spec plus `variants` or a `matrix` of axes whose patches override the palette and toggle layers by id. Perfect the base first, then check the lineup for members that are too similar. Read docs page `families`.

## Pitfalls

- `right`/`left` are the character's sides: `rightArm` is on the viewer's left in the front view.
- Slim arm fronts are 3 px wide; classic 4 px.
- Base layer pixels must be opaque; overlay pixels opaque or `transparent`, never semi-transparent.
- The review score measures hygiene only — a 100 can still look bad. Always look at the image.
