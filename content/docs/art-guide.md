# Skin art guide

> Practical pixel-art rules for 64×64 Minecraft skins, written for agents: where features go, how to shade, and the mistakes that make skins look amateur.

## The face (head.front, 8×8)

The face is 8 pixels wide, so every pixel is a decision. A reliable layout:

| Row | Content |
| --- | --- |
| 0–1 | Hair (or helmet/hat) |
| 2 | Forehead, hair fringe on the edges (x=0 and x=7) |
| 3 | Eyebrows (hair color or darker), optional but adds expression |
| 4 | Eyes: white at x=1 and x=6, iris at x=2 and x=5 |
| 5 | Cheeks; nose as 1–2 slightly darker skin pixels at x=3–4 |
| 6 | Mouth: 2–4 pixels centered, a *darker skin tone*, not black |
| 7 | Chin / jaw, beard if any |

```
HHHHHHHH   H hair      h hair highlight
HhHHHhHH   S skin      s skin shadow
HSSSSSSH   D brow      W eye white
SDDSSDDS   E iris      M mouth
SWESSEWS
SSSssSSS
SSsMMsSS
SSSSSSSS
```

Rules of thumb:

- Eyes 2 px wide (white + iris) read best. Iris toward the center gives a friendly look; toward the edges looks surprised.
- Never outline the face in black. Contrast comes from value, not lines.
- Hair should wrap: continue it on `head.top`, `head.back` and the upper/back part of `head.right` / `head.left`.

## Body landmarks

| Area | Where |
| --- | --- |
| Collar / neckline | `body.front` rows 0–1 |
| Belt | `body.sides` row 8 or 9 (1 px) |
| Pants start | `body.sides` rows 9/10–11 (so the waist continues onto the legs) |
| Sleeves | `arms.sides` rows 0–3 (short) or 0–9 (long) |
| Hands | `arms.sides` last 2–3 rows + `arms.bottom` |
| Shoes | `legs.sides` last 2–3 rows + `legs.bottom` |
| Knees | `legs.front` row 5–6 |

## Shading

Minecraft's lighting is flat, so skins carry their own shading. Assume light from **above and slightly in front**.

1. **Tone ramp per material:** 3 to 4 tones: highlight (+8…+12), base, shadow (−8…−12), deep (−20…−28). Define them in the palette with `:` shifts.
2. **Top-down:** lighter on top rows/`top` faces, darker toward the bottom of each part. `gradient` with `steps: 3–5`, or `shade` on the last row.
3. **Inner and back faces darker:** limbs' inner faces (`rightArm.left`, `rightLeg.left`, …) and `back` faces by −6…−10.
4. **Separate overlapping parts:** the row where sleeves end, where shirt meets pants, and where boots begin should have a 1 px shadow.
5. **Texture, not noise soup:** `noise` with `jitter` 2–5 for cloth/metal grain; 6+ looks dirty. Don't jitter faces or small details.
6. **Hue-shift shadows** for richer art: shadows slightly cooler/more saturated, highlights warmer. (Pick explicit hex tones for that instead of `:` shifts.)

## Color

- 15–60 distinct colors is typical for a good skin. Fewer than 6 looks flat.
- 1 dominant hue, 1–2 secondary, 1 accent (small area, high saturation: buckles, eyes, gems, lights).
- Keep adjacent parts at different *values* (lightness), not just hues. Silhouettes must read in grayscale.
- Avoid pure `#000000` and pure `#ffffff` in large areas.

## The overlay layer

The overlay is a shell 0.5 px (head) / 0.25 px (body, limbs) outside the base. It is what makes skins feel 3D.

- **Hair volume:** extend hair on `head.*@overlay` a pixel or two past the base hairline.
- **Hoods / helmets:** fill `head@overlay`, then `clear` where the face should show.
- **Jackets, scarves, belts with pouches, backpacks:** `body.*@overlay`.
- **Cuffs, gloves, boot tops:** `arms/legs.*@overlay` bands.
- Keep overlay pixels fully opaque or fully transparent.

## Workflow that works

1. `fill all` with the dominant skin/suit color (no transparent base).
2. Fill parts: head, body, arms, legs.
3. Bands: sleeves, belt, pants, shoes.
4. Head: `pixels` for the face, hair on top/back/sides (`copy` right → left with `flip: "h"`).
5. Shading and texture on the broad areas: `gradient` / `shade` / `noise`.
6. Details on one side (they stay crisp because they come after the texture); `mirror` limbs; then asymmetric details.
7. Overlay pass.
8. Review, screenshot, patch.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Transparent base pixels | Start with `{ "op": "fill", "target": "all", "color": "…" }`. |
| Mixing up left/right | `rightArm` is on the **viewer's left** in the front view. |
| Arms painted 4 px wide on a slim model | Slim arm fronts are 3 px wide; use `pixels` rows of 3 chars. |
| Forgetting back and sides | Check `back`, `right` and `left` views in the review. |
| Black outlines everywhere | Use darker tones of the local color instead. |
| `noise` / `shade` as the last layers | They also hit eyes, collars and buttons. Texture broad areas first, then paint details. |
| Same value head/body/legs | Vary lightness between parts. |
