# Changelog

Each release's section is published as `notes` in `/version.json`, and installed tools show it in their update notice, so the agent knows what changed and whether to redo anything. Keep it to one or two lines (under 600 characters, where installed copies cut it), and say whether specs still render the same PNGs. A test fails when the current version has no section.

## 0.7.0

Every review now has craft advice (`art.advice`): pillow shading, shadows that only get darker, static-like noise and bands that stop at a cube corner, with the faces and the fix; it never changes a score. `sheet --focus head` and `focus` on texel_render show some parts alone from six sides. New `palette` command and `texel_palette` tool: a reference PNG's colors as a palette. `lighting` and `shade` now cool shadows and warm lights like `~` steps, so specs using them render slightly different colors.

## 0.6.0

New layouts: `cold_chicken` (crest and tail fin), `cat` (every cat, the ocelot and the collar; its tail lies back like the body), `iron_golem` (128×128) and `witch` (64×128, the four-step hat and the mole). The review no longer calls a chicken's thin legs holes: parts cut by transparency (legs, crest, fin) are skipped by the opacity check. Specs for the existing layouts render the same PNGs.

## 0.5.1

Fixes: `sheep_wool_undercoat.png` uses the `sheep` body layout (it pointed at the wool), and release notes cut to fit a notice now end with …. Docs: how the game tints wool, that a lying body's top and bottom both start at the rump, and that a shared texture (four legs) must fit every spot. The skill checks `layouts` before deciding. Compiler unchanged.

## 0.5.0

New layouts: `sheep` and `sheep_wool` (the wool is its own texture, tinted by the game), `chicken`, `wolf` (every variant, and the collar), `hoglin` (and zoglin, 128×64), `cold_cow` and `warm_cow`. Their bodies (and a wolf's mane, a cold cow's horns) lie along the animal like the pig's. The views snap Java's half-pixel offsets to whole pixels. For layouts with a lying body the review sheet adds a view from above. The review lists the art checks a layout does not measure. The spec says which way x runs on top and bottom faces, where the pig's snout sits, and that lighting skips head.front on mobs too. Compiler unchanged for the existing layouts: specs render the same PNGs.

## 0.4.0

New layouts: `piglin` (also zombified piglin and brute), `pig` (temperate, warm and cold, with the cold pig's fur as body@overlay) and `cow` (temperate cow and mooshrooms). A pig's or cow's body lies along the animal, and its faces are named and drawn the way they face in game (`body.top` is the back). Two new examples: `winged-pig` (wings across faces with symmetrize and copy, a one-color body kept apart by value) and `mud-pig` (the pig layout). Art checks: R3 also weighs arms against the torso, and any weak check keeps the art score under 90. Specs for the existing layouts render the same PNGs; their art scores may shift a little.

## 0.3.5

Docs and skill only. The art guide says how R3 measures (front faces, overlay included, passing at a gap of about 6 points, arms not measured) and how to paint ice and glass; the skill no longer reads `mirror` as mandatory for limbs that differ on purpose. Compiler unchanged.

## 0.3.4

Docs and skill only. The art guide covers one-color characters (keeping head, body and limbs apart by value); the spec warns that `fur` (and feathers) turns blotchy on light colors; the skill says what to do when a feature can't read from the front, to read the docs online instead of keeping stale copies, and to check viewers after the first live push. Compiler unchanged.

## 0.3.3

`live` and `texel_live` printed the default port even when another session held it and they had moved to the next one, so the studio link showed someone else's skin; restart a running live to get the fix. The skill now says what a texture is for (player skin or the mob's own texture) and when a mob has no layout, and checks the viewer count before calling the studio open. The spec warns that `~` shadows turn pinks red. Compiler unchanged: specs render the same PNGs.

## 0.3.2

The update notice shows these notes, says the run that printed it completed normally, and asks to restart a running `texel.mjs live`. The skill keeps a single `texel.mjs` next to SKILL.md when updating. Compiler unchanged: specs render the same PNGs.

## 0.3.1

Skill instructions only: where `texel.mjs` lives, going live before the spec, docs links without MCP, drawing across faces with `copy`/`symmetrize`, a diff after every patch. Compiler unchanged.

## 0.3.0

Installed skill, CLI and MCP server learn when a newer release is out.
