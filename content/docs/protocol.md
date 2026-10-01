# Skin Agent Protocol

> The loop an AI agent follows to design, test and ship a Minecraft skin with Texel. Version `texel/1`.

A skin is **data, not pixels**: a JSON *spec* made of a palette and an ordered list of drawing operations. The spec compiles deterministically to a 64×64 PNG. Because the source is structured, an agent can reason about it, diff it, patch one layer at a time, and verify every step.

## The loop

```
BRIEF → READ → DRAFT → RENDER → REVIEW → PATCH ──┐
                          ▲                      │
                          └──────────────────────┘
                                  … → SHIP
```

### 1. Brief

Write down what you are making before touching pixels. Put it in the spec's `description`: reviewers (you, later) compare the render against it.

> "A desert ranger: tan skin, sun-bleached cloak with hood on the hat layer, leather belt with pouches, dusty boots. Classic arms."

Requests can arrive in any language. Answer the person in their language and write `description` in it too (the studio shows it to them); keep palette keys and layer `id`s in plain ASCII English. Don't open with a round of questions: make tasteful choices for anything unspecified, state them in one line, and let the person steer while they watch (see *Live session*).

### 2. Read

| Resource | Why |
| --- | --- |
| [/agent.md](/agent.md) | This protocol, the spec reference and the art guide in **one file**. Fetch it instead of the three pages separately. |
| [/docs/spec.md](/docs/spec.md) | The format: selectors, coordinates, every op. **Required.** |
| [/docs/art-guide.md](/docs/art-guide.md) | Where eyes go, how to shade, what makes skins look good. |
| [/schema/skinspec.v1.json](/schema/skinspec.v1.json) | JSON Schema for validation / structured output. |
| [/examples/index.json](/examples/index.json) | Complete, working specs to learn from or fork. |
| [/docs/api.md](/docs/api.md) | How to render: browser, URL, WebMCP, or CLI. |

### 3. Draft

1. **Palette first.** For each material (skin, hair, shirt, pants, shoes, metal…) define a base color plus derived tones: `"shirtDark": "shirt:-10"`. 2–4 tones per material.
2. **Broad → fine.** Start with `fill` on `all` (so no base pixel is transparent), then fill whole parts, then bands (`rect` with only `y`/`h`), then shading and texture on those broad areas (`gradient`, `shade`, `noise`), then small details (`pixels`, `points`, `line`). Texture goes *before* details: `noise` and `shade` change every pixel in their area, so running them last smears eyes, collars and buttons. Later layers overwrite earlier ones, so don't fill an area you repaint completely afterwards; the review flags those layers as `overwritten-layer`.
3. **Paint one side, mirror the other.** Design `rightArm`/`rightLeg`, then `mirror` them. Add asymmetric details *after* the mirror.
4. **Use the overlay** (`@overlay`) for things that stick out: hair tufts, hoods, helmets, jackets, backpacks.
5. **Give layers `id`s** for anything you might revisit (`"id": "eyes"`), so patches are surgical.

### 4. Render

Pick whichever interface your runtime has. They all run the same compiler:

- **Code execution:** `curl -O https://<site>/texel.mjs && node texel.mjs build skin.json -o skin.png --sheet sheet.png`.
- **MCP:** `texel_render` returns the review and the sheet image.
- **Browser agent:** open `/studio/`, then call `window.texel.setSpec(spec)` (or the WebMCP tool `texel_set_spec`).
- **URL only:** open `/studio/?view=inspect#spec=<encodeURIComponent(JSON)>` and take a screenshot.

#### Live session

When a person is waiting on the skin, let them watch it being made instead of seeing only the end result. Start the session **before your first draft** and give them the URL:

- **Code execution:** run `node texel.mjs live skin.json --open` in the background. It prints a studio URL (`/studio/?live=<port>`); every time you save `skin.json` their tab updates. Keep using `build` for your own review.
- **MCP:** call `texel_live` and share the returned URL; every `texel_render` then shows up in their tab.
- **Browser agent:** work in a studio tab the person can see; `window.texel` updates it directly.

They can react mid-way ("shorter hair", "more pink") and you patch, instead of starting over after the reveal.

### 5. Review

Every render returns a **review**: `score` (0–100 technical health), `issues` (with `path`, `code` and a `hint`), `stats`, and a **text render** of the front and back views, so even text-only agents can see the result.

Then look at it. The score only checks hygiene; it cannot tell whether the skin looks good. Screenshot `/studio/?view=inspect` (3D angles + flat sheet) or open the `--sheet` PNG and judge it against the rubric:

| # | Check | Pass when |
| --- | --- | --- |
| R1 | Brief match | Every feature in `description` is visible. |
| R2 | Face | Eyes, brows and mouth read clearly at 1× in the front view. |
| R3 | Silhouette | Head, torso, arms and legs are distinguishable by color/value. |
| R4 | Shading | Light comes from above: top rows lighter, bottoms and inner sides darker. |
| R5 | Texture | No large perfectly flat areas (use noise jitter 2–5 or patterns). |
| R6 | All sides | Back and sides are designed, not just filled. |
| R7 | Depth | The overlay layer adds at least one 3D element (hair, hood, collar, gear). |
| R8 | Hygiene | Review has 0 errors and 0 warnings. |

### 6. Patch

Change the smallest thing that fixes the weakest rubric item, then render again. In the browser: `texel.updateLayer("eyes", { rows: [...] })`, `texel.addLayers([...])`, `texel.toggleLayer(3)`. With files: edit the JSON and rebuild.

Stop when R1–R8 all pass, or after ~6 iterations with diminishing returns.

### 7. Ship

Deliver three things:

1. The **share link**: `node texel.mjs share skin.json`, `texel_share` or `texel.shareURL()`. It is short (`/s/<id>`) and opens the exact skin in the studio, where the person can also download the PNG.
2. The **PNG** (CLI `build` output, `texel_save`, or `texel.download()`), uploaded at minecraft.net or any launcher with the model (classic/slim) matching `model`.
3. The **spec JSON**, the editable source. Give the file path; paste the JSON into the chat only when you cannot save files.

## Contract

- Compilation is deterministic: same spec → same PNG, byte for byte, in every interface.
- Compilation never throws. Invalid layers are skipped and reported; valid ones still render.
- Layers apply in order; later layers overwrite earlier ones (no blending).
- Issue `code`s are stable identifiers you can branch on.
