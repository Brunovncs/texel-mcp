# Skin spec reference

> Complete reference for the Texel skin spec (`version: 1`): structure, colors, selectors, coordinates and all 17 operations.

## Shape

```json
{
  "$schema": "/schema/skinspec.v1.json",
  "version": 1,
  "name": "Explorer",
  "description": "What this skin should look like (the brief).",
  "model": "classic",
  "palette": { "skin": "#d9a066", "skinShade": "skin:-8", "shirt": "#2f8f83" },
  "legend": { "S": "skin", "s": "skinShade", "W": "#ffffff", "E": "#2d5ba8" },
  "layers": [
    { "op": "fill", "target": "all", "color": "skin" },
    { "op": "fill", "target": "body", "color": "shirt" },
    { "op": "pixels", "target": "head.front", "y": 4, "rows": ["SWESSEWS"] }
  ]
}
```

| Key | Type | Notes |
| --- | --- | --- |
| `version` | `1` | Required. |
| `model` | `"classic"` \| `"slim"` | Arm width 4px or 3px. Default `classic`. |
| `palette` | object | Name → color. Names: letters, digits, `_`, `-`; start with a letter. |
| `legend` | object | Single char → color, for `pixels` rows. `.` and `_` are reserved. |
| `layers` | array | Operations, applied top to bottom. Required. |
| `name`, `description`, `author`, `tags` | metadata | `description` is the brief. |

## Colors

A color expression is one of:

- `#rgb`, `#rrggbb`, `#rrggbbaa`
- `transparent`
- a palette key: `"shirt"`
- any of the above plus `:<n>`: shift HSL lightness by *n* points: `"shirt:-12"`, `"#88aaff:+6"`
- any of the above plus `~<n>` (−4…4): a step along a pixel-art tone ramp. Lighter steps also warm toward yellow, darker steps cool toward blue and gain saturation: `"cloth~1"` (highlight), `"cloth~-1"` (shadow), `"cloth~-2"` (deep shadow).

Palette entries may reference each other, so a material needs only one base color; derive its tones where you use them (`"cloth~-1"`) or name them:

```json
"palette": { "cloth": "#7a5c3e", "clothLight": "cloth~1", "clothDark": "cloth~-1", "clothDeep": "cloth~-2" }
```

Base-layer pixels must be opaque (Minecraft renders transparent base pixels black). Overlay pixels are either opaque or `transparent`. Avoid partial alpha.

## Model anatomy

The character faces you. **`right`/`left` are the character's own sides**: `rightArm` appears on the viewer's *left* in the front view.

| Part | front / back (w×h) | right / left (w×h) | top / bottom (w×h) |
| --- | --- | --- | --- |
| `head` | 8×8 | 8×8 | 8×8 |
| `body` | 8×12 | 4×12 | 8×4 |
| `rightArm`, `leftArm` (classic) | 4×12 | 4×12 | 4×4 |
| `rightArm`, `leftArm` (slim) | 3×12 | 4×12 | 3×4 |
| `rightLeg`, `leftLeg` | 4×12 | 4×12 | 4×4 |

Every part has two layers: `base` (the body) and `overlay` (a slightly larger shell: hat, jacket, sleeves, pants). Overlay starts fully transparent.

### Face-local coordinates

Each operation works in **face-local coordinates**: `(0, 0)` is the top-left pixel of the face *as seen from outside the model*. Drawing is clipped to the face, so it never bleeds into neighbours.

- On `front`, x grows toward the character's left (viewer's right).
- On `right`, x=0 is the back edge and the last column touches the front.
- On `left`, x=0 touches the front and the last column is the back edge.
- On `back`, x grows toward the character's right.
- On `top`, the last row touches the front.

Negative `x`/`y` count from the far edge: `"y": -2` means "the last 2 rows" when `h` is omitted.

## Selectors

`target` picks one or more faces:

```
<parts>[.<faces>][@<layer>]
```

| Piece | Values |
| --- | --- |
| parts | `head` `body` `rightArm` `leftArm` `rightLeg` `leftLeg` · groups: `arms` `legs` `limbs` `all` |
| faces | `top` `bottom` `right` `front` `left` `back` · groups: `sides` (the four vertical faces, **front included**: `head.sides@overlay` covers the face), `all` (default) |
| layer | `base` (default), `overlay`, `both` |

Join alternatives with `+`: `"head.top+back"`, `"arms+legs.sides"`. An array of selectors is a union. Whole selectors joined with `+` are read as a union too: `"body.sides+arms.sides"` is `["body.sides", "arms.sides"]`, and a layer on the last one (`"head.right+head.back@overlay"`) applies to all of them.

Examples: `"all"` · `"head.front"` · `"legs.sides"` · `"body.front+back@overlay"` · `"arms.top@both"`.

When a selector matches several faces, the operation runs **once per face** in that face's local coordinates. `{"op":"rect","target":"legs.sides","y":-2,"color":"boots"}` paints the bottom two rows all the way around both legs.

## Area options

`fill`, `rect`, `clear`, `gradient`, `pattern`, `noise`, `shade` and `material` accept an optional area: `x`, `y` (default 0, negatives from the far edge), `w`, `h` (default: to the edge). Omit all four for the whole face.

Instead of `y`/`h`, a **`region`** names the rows. It only paints the parts it belongs to, so `"target": "all"` is safe, and the hand and shoe regions include the bottom face:

| Region | Parts | Rows |
| --- | --- | --- |
| `collar` | body | 0 |
| `chest` | body | 1–6 |
| `belt` | body | 8 |
| `waist` | body | 9–11 (where pants start) |
| `sleeves` | arms | 0–3, plus the top |
| `longSleeves` | arms | 0–8, plus the top |
| `cuffs` | arms | 8 |
| `hands` | arms | 9–11, plus the bottom |
| `gloves` | arms | 7–11, plus the bottom |
| `knees` | legs | 5 |
| `shoes` | legs | 9–11, plus the bottom |
| `boots` | legs | 6–11, plus the bottom |

```json
{ "op": "rect", "target": "body.sides", "region": "belt", "color": "leather" }
```

## Operations

Every op accepts `id` (string handle for patching), `note` (free text) and `enabled` (`false` skips it).

### fill
Paint whole faces. Like `rect`, it also takes the area options and `region`.
```json
{ "op": "fill", "target": "legs", "color": "pants" }
```

### rect
Paint an area. With only `y`/`h` it becomes a band.
```json
{ "op": "rect", "target": "body.sides", "y": 8, "h": 1, "color": "belt" }
```

### clear
Make an area transparent (overlay only, in practice).
```json
{ "op": "clear", "target": "head.front@overlay", "x": 1, "y": 3, "w": 6, "h": 2 }
```

### pixels
Pixel art as strings: one string per row, one char per pixel. Chars come from the op's `legend`, then the top-level `legend`. `.` keeps the existing pixel, `_` erases it. `x`/`y` offset the grid.
```json
{ "op": "pixels", "target": "head.front", "rows": [
  "HHHHHHHH",
  "HhHHHhHH",
  "HSSSSSSH",
  "SDDSSDDS",
  "SWESSEWS",
  "SSSssSSS",
  "SSsMMsSS",
  "SSSSSSSS"
] }
```

### points
Individual pixels.
```json
{ "op": "points", "target": "body.front", "points": [[3, 8], [4, 8]], "color": "buckle" }
```

### line
Bresenham line between two points (inclusive).
```json
{ "op": "line", "target": "body.front@overlay", "from": [1, 0], "to": [7, 7], "color": "strap" }
```

### gradient
Linear blend `from` → `to`, `vertical` (top→bottom, default) or `horizontal`. `steps` posterizes into N bands; pixel art usually wants 3–5.
```json
{ "op": "gradient", "target": "legs.sides", "from": "steelLight", "to": "steelDark", "steps": 4 }
```

### pattern
Repeating pattern: `checker` (first two colors), `stripes-h`, `stripes-v`, `diagonal` (cycles all colors). `size` = cell size in px. A color of `"."` keeps the existing pixel.
```json
{ "op": "pattern", "target": "body", "kind": "checker", "colors": ["steel", "steelDark"] }
```

### noise
Seeded, deterministic texture. `colors` + `density` (0–1, default 0.2) scatters colors; `jitter` (0–50) randomly shifts the lightness of existing pixels by ±jitter points. Use either or both. `seed` defaults to the layer index.
```json
{ "op": "noise", "target": "body.sides", "jitter": 4, "seed": 3 }
```

### shade
Shift lightness of existing pixels by `amount` (−100…100). The workhorse for depth.
```json
{ "op": "shade", "target": "rightLeg.left+back", "amount": -7 }
```

### copy
Copy one face (`from` must select exactly one) onto target faces. `flip`: `h`, `v`, `hv`. Sizes are resampled if they differ.
```json
{ "op": "copy", "from": "head.right", "to": "head.left", "flip": "h" }
```

### mirror
Mirror a whole part onto another (left/right faces swap, everything flips horizontally). `layer`: `base`, `overlay`, `both` (default).
```json
{ "op": "mirror", "from": "rightArm", "to": "leftArm" }
```

### symmetrize
Make faces left-right symmetric by copying one half onto the other. `source`: `left` (default, low x) or `right`.
```json
{ "op": "symmetrize", "target": "head.front" }
```

## High-level operations

These do the craft from the [art guide](/docs/art-guide.md) for you: face layout, hair that wraps around the head, material texture, light from above. Use them for the broad strokes, then add personality with `pixels`, `points` and `line`. They are ordinary layers: later layers still paint over them.

### material
Fill an area with a color and the texture of a material, with its tones derived from that one color. `kind`: `plain`, `skin`, `fabric`, `knit`, `leather`, `metal`, `fur`, `stone`, `scales`, `wood`, `glow`. Takes the area options and `region`; `seed` varies the grain.
```json
{ "op": "material", "target": "legs", "region": "boots", "color": "#4a3324", "kind": "leather" }
```

### face
A complete 8×8 face on `head.front` (or `target`): brows on row 3, eyes on row 4, nose, mouth on row 6. Needs `skin` and `eyes` (iris color). Optional:

| Key | Values |
| --- | --- |
| `eyeStyle` | `normal` (default), `wide`, `cute`, `angry`, `sad`, `closed`, `glow`, `visor`, `narrow` |
| `mouth` | `neutral` (default), `smile`, `grin`, `open`, `frown`, `fangs`, `none` |
| `beard` | `none` (default), `stubble`, `full`, `mustache`, `goatee` |
| `brows`, `mouthColor`, `beardColor`, `white` | colors (`brows: "none"` hides them); defaults are darker skin tones |
| `blush` | `true` or a color |
| `nose` | `false` hides it |

```json
{ "op": "face", "skin": "skin", "eyes": "#3a6fd9", "eyeStyle": "cute", "mouth": "smile", "blush": true }
```

### hair
Hair on the whole head, wrapping the top, back and sides, with volume on the overlay. `style`: `short` (default), `buzz`, `bob`, `long`, `spiky`, `curly`, `ponytail`, `mohawk`. `fringe`: `side` (default), `full`, `parted`, `none`. `layer`: `both` (default), `base`, `overlay`. Put it after `face`, since the fringe covers the top rows.
```json
{ "op": "hair", "color": "#6b3e1f", "style": "ponytail", "fringe": "full" }
```

### lighting
Light from above and slightly in front, the way the art guide shades by hand: tops lighter, bottom rows and bottoms darker, backs and the inner faces of limbs darker. With no `target` it lights everything except the face. `strength` scales it (default 1, 0–3). Put it after the broad fills and before small details, so buttons and eyes keep their exact colors.
```json
{ "op": "lighting" }
```

## Patches

To change an existing spec, send only what changes. Layers are addressed by `id`, so give every layer you may revisit one (`withIds` in `/texel-core.mjs` adds `"<op>-<index>"` ids to the rest). Entries apply in order; one that can't apply (unknown id) is skipped and reported, and the others still apply.

```json
{ "patch": [
  { "do": "update", "id": "face", "set": { "eyeStyle": "wide", "mouth": "smile" } },
  { "do": "replace", "id": "hood", "layer": { "op": "fill", "target": "head.top+back@overlay", "color": "robe~-1" } },
  { "do": "add", "after": "belt", "layer": { "op": "points", "target": "body.front", "points": [[3, 8], [4, 8]], "color": "gold" } },
  { "do": "remove", "id": "noise-12" },
  { "do": "palette", "set": { "robe": "#2f4fb0" } },
  { "do": "meta", "set": { "description": "Now with a gold buckle." } }
] }
```

| `do` | Fields | Effect |
| --- | --- | --- |
| `update` | `id`, `set` | Merge fields into a layer; `null` removes a field. |
| `replace` | `id`, `layer` | Swap a layer for a new one (it keeps the id). |
| `add` | `layer`, `after` or `before` (an id) | Insert a layer; at the end without an anchor. Remember order matters: later layers paint over earlier ones. |
| `remove` | `id` | Delete a layer. |
| `palette` | `set` | Add or change palette colors; `null` removes one. |
| `legend` | `set` | Add or change top-level legend characters; `null` removes one. |
| `meta` | `set` | Change `name`, `description` or `model`. |

## Texture map (for importing / debugging)

UV origin of each box in the 64×64 PNG. Within a box of size w×h×d at (u, v): top `(u+d, v)`, bottom `(u+d+w, v)`, right `(u, v+d)`, front `(u+d, v+d)`, left `(u+d+w, v+d)`, back `(u+2d+w, v+d)`.

| Part | base (u, v) | overlay (u, v) |
| --- | --- | --- |
| head | 0, 0 | 32, 0 |
| body | 16, 16 | 16, 32 |
| rightArm | 40, 16 | 40, 32 |
| leftArm | 32, 48 | 48, 48 |
| rightLeg | 0, 16 | 0, 32 |
| leftLeg | 16, 48 | 0, 48 |

## Review issue codes

| Code | Level | Meaning |
| --- | --- | --- |
| `bad-json`, `bad-spec`, `no-layers` | error | Spec cannot be read. |
| `bad-region`, `bad-option` | error | Unknown `region`, or a value outside an op's options (the hint suggests the closest). |
| `region-miss` | warning | The `region` covers none of the target faces. |
| `face-hidden` | warning | The hat layer covers the eyes of a face drawn on the base (usually a hood or hat filled over the whole head). |
| `unknown-op`, `missing-key`, `bad-selector`, `bad-color`, `unknown-char`, `bad-number`, `out-of-range`, `bad-point`, … | error | Layer skipped. |
| `unknown-key`, `version`, `clipped` | warning | Ignored input / pixels outside the face. |
| `base-transparent` | warning | Base pixels left transparent (render black in-game). |
| `blank-face` | warning | `head.front` has fewer than 3 colors. |
| `flat-surface` | info | A visible face is ≥90% one color. |
| `few-colors` | info | Fewer than 6 colors overall. |
| `hat-covers-face` | info | Hat layer is fully opaque over the face. |
| `kind-guess` | info | A `material` kind was read from a near word: `"feathers"` as `fur`, `"steel"` as `metal`. |
| `legend-reserved` | info | A legend defines `.` or `_`; the entry is ignored. |
| `color-guess` | info | A near-miss color was read as the closest valid expression: `"armor-1"` as `"armor~-1"`, `"coat:"` as `"coat"`. |
| `unused-palette` | info | Palette keys never referenced. |
| `overwritten-layer` | info | A layer is completely painted over by later layers, so it does nothing. The `fill` on `all` safety net is exempt. |

Score = 100 − 25 per error − 8 per warning − 2 per info (transparent-base penalty capped at 20).
