# Skin spec reference

> Complete reference for the Texel skin spec (`version: 1`): structure, colors, selectors, coordinates and all 13 operations.

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

Palette entries may reference each other, which is the idiomatic way to build tone ramps:

```json
"palette": { "cloth": "#7a5c3e", "clothLight": "cloth:+10", "clothDark": "cloth:-12", "clothDeep": "cloth:-24" }
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
| faces | `top` `bottom` `right` `front` `left` `back` · groups: `sides` (the four vertical faces), `all` (default) |
| layer | `base` (default), `overlay`, `both` |

Join alternatives with `+`: `"head.top+back"`, `"arms+legs.sides"`. An array of selectors is a union.

Examples: `"all"` · `"head.front"` · `"legs.sides"` · `"body.front+back@overlay"` · `"arms.top@both"`.

When a selector matches several faces, the operation runs **once per face** in that face's local coordinates. `{"op":"rect","target":"legs.sides","y":-2,"color":"boots"}` paints the bottom two rows all the way around both legs.

## Area options

`rect`, `clear`, `gradient`, `pattern`, `noise` and `shade` accept an optional area: `x`, `y` (default 0, negatives from the far edge), `w`, `h` (default: to the edge). Omit all four for the whole face.

## Operations

Every op accepts `id` (string handle for patching), `note` (free text) and `enabled` (`false` skips it).

### fill
Paint whole faces.
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
| `unknown-op`, `missing-key`, `bad-selector`, `bad-color`, `unknown-char`, `bad-number`, `out-of-range`, `bad-point`, … | error | Layer skipped. |
| `unknown-key`, `version`, `clipped` | warning | Ignored input / pixels outside the face. |
| `base-transparent` | warning | Base pixels left transparent (render black in-game). |
| `blank-face` | warning | `head.front` has fewer than 3 colors. |
| `flat-surface` | info | A visible face is ≥90% one color. |
| `few-colors` | info | Fewer than 6 colors overall. |
| `hat-covers-face` | info | Hat layer is fully opaque over the face. |
| `unused-palette` | info | Palette keys never referenced. |

Score = 100 − 25 per error − 8 per warning − 2 per info (transparent-base penalty capped at 20).
