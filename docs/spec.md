# Skin spec reference

> Complete reference for the Texel skin spec (`version: 1`): structure, colors, layouts (player skins, 57 mob layouts, armor, capes, items, blocks, plants, GUI sprites, particles, paintings), selectors, coordinates, all 18 operations, animation, glow, resource packs and every issue code.

## Shape

```json
{
  "$schema": "https://www.texel.dev.br/schema/skinspec.v1.json",
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
| `layout` | string | Texture layout. Default `player` (a 64×64 skin). See [Layouts](#layouts) for mobs, armor, capes, items and blocks. |
| `model` | `"classic"` \| `"slim"` | Player layout only: arm width 4px or 3px. Default `classic`. |
| `size` | `[w, h]` | Texture size, for layouts that take one: `gui` (any), `painting` (multiples of 16), `particle`, and square HD `item`, `block` and `plant` textures. See [GUI sprites](#gui-sprites). |
| `asset` | string | Its place in a resource pack, under `textures/`, without `.png`: `"item/ruby"`, `"mymod:entity/guard"`. Default: the layout's own. See [Resource packs](#resource-packs). |
| `animation` | object | Frames, each a patch over the layers. Items, blocks, plants, GUI sprites and particles. See [Animation](#animation). |
| `gui` | object | `gui` layout only: `{ "scaling": … }` for its `.png.mcmeta`. See [GUI sprites](#gui-sprites). |
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
- any of the above plus `~<n>` (−4…4): a step along a pixel-art tone ramp. Lighter steps also warm toward yellow, darker steps cool toward blue and gain saturation: `"cloth~1"` (highlight), `"cloth~-1"` (shadow), `"cloth~-2"` (deep shadow). On light, saturated pinks and skin tones the darker steps turn vivid red (`"#f0b0a8~-2"` is `#ea5257`); shade those with `:` (`"pink:-12"`) or name a duller shadow color.

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

Every part has two layers: `base` (the body) and `overlay` (a slightly larger shell: hat, jacket, sleeves, pants). Overlay starts fully transparent. This section is the `player` layout; other layouts are listed under [Layouts](#layouts).

### Face-local coordinates

Each operation works in **face-local coordinates**: `(0, 0)` is the top-left pixel of the face *as seen from outside the model*. Drawing is clipped to the face, so it never bleeds into neighbours.

- On `front`, x grows toward the character's left (viewer's right).
- On `right`, x=0 is the back edge and the last column touches the front.
- On `left`, x=0 touches the front and the last column is the back edge.
- On `back`, x grows toward the character's right.
- On `top` and `bottom`, row 0 touches the back, the last row touches the front, and x grows toward the character's left, as seen from above with the front at the bottom.

These hold for every part and layout, lying bodies included. On an animal the front is the head end and the back the rear end, so on a pig `body.top` and `body.bottom` both have row 0 at the rump; `body.top` column 0 runs along the edge of `body.right`, and its row 0 meets the top row of `body.back`.

Negative `x`/`y` count from the far edge: `"y": -2` means "the last 2 rows" when `h` is omitted.

## Layouts

`"layout"` picks which texture the spec paints. Everything else works the same: palette, legend, the 17 operations, selectors and face-local coordinates. Each layout has its own part names and texture size; the PNG comes out at that size, ready to drop where the game or the mod expects it.

<!-- layouts:start -->
| layout | size | parts (box w×h×d as in game; * has @overlay) | used by |
| --- | --- | --- | --- |
| `player` (`skin`) | 64×64 | head 8×8×8*, body 8×12×4*, rightArm 4×12×4*, leftArm 4×12×4*, rightLeg 4×12×4*, leftLeg 4×12×4* | player skins (Java and Bedrock, classic and slim); mod NPCs rendered with PlayerModel |
| `zombie` (`husk`) | 64×64 | head 8×8×8*, body 8×12×4, rightArm 4×12×4, rightLeg 4×12×4 | textures/entity/zombie/zombie.png; textures/entity/zombie/husk.png. Only the top half of the 64×64 texture is used. The left arm and leg reuse the right ones, mirrored. |
| `drowned` (`drowned_outer_layer`) | 64×64 | head 8×8×8*, body 8×12×4, rightArm 4×12×4, leftArm 4×12×4, rightLeg 4×12×4, leftLeg 4×12×4 | textures/entity/zombie/drowned.png; textures/entity/zombie/drowned_outer_layer.png (same layout, drawn slightly larger; leave it transparent where nothing hangs off). Like a player skin with its own left limbs, but only the head has an overlay (the hat). |
| `humanoid` (`armor`, `armour`, `legacy`) | 64×32 | head 8×8×8*, body 8×12×4, rightArm 4×12×4, rightLeg 4×12×4 | textures/entity/equipment/humanoid/*.png (armor layer 1: helmet on head + head@overlay, chestplate on body + arms, boots on legs); textures/entity/equipment/humanoid_leggings/*.png (armor layer 2: leggings on body + legs); textures/entity/skeleton/stray_overlay.png and bogged_overlay.png (the clothes over the skeleton); legacy 64×32 player skins. Armor draws slightly larger than the body, and pixels left transparent show the body underneath. The left arm and leg reuse the right ones, mirrored. |
| `skeleton` (`stray`, `wither_skeleton`, `bogged`) | 64×32 | head 8×8×8*, body 8×12×4, rightArm 2×12×2, rightLeg 2×12×2 | textures/entity/skeleton/skeleton.png; stray.png; wither_skeleton.png; bogged.png. Arms and legs are 2×12×2. Skeletons have see-through gaps: transparent base pixels are fine here. The left arm and leg reuse the right ones, mirrored. |
| `creeper` | 64×32 | head 8×8×8, body 8×12×4, leg 4×6×4 | textures/entity/creeper/creeper.png. All four legs share one texture. |
| `enderman` | 64×32 | head 8×8×8*, body 8×12×4, limb 2×30×2 | textures/entity/enderman/enderman.png; enderman_eyes.png (glowing eyes, same layout, transparent elsewhere). head@overlay is the jaw, drawn slightly smaller than the head. All four limbs share one 2×30×2 texture. |
| `spider` (`cave_spider`) | 64×32 | head 8×8×8, neck 6×6×6, body 10×8×12, leg 16×2×2 | textures/entity/spider/spider.png; cave_spider.png; spider_eyes.png (glowing eyes, same layout). All eight legs share one texture; the left ones are mirrored. In game the legs are angled; the views show them straight out. |
| `villager` (`zombie_villager`, `wandering_trader`) | 64×64 | head 8×10×8*, nose 2×4×2, hatRim 16×16×1, body 8×12×6, jacket 8×20×6, arm 4×8×4, armsMiddle 8×4×4, leg 4×12×4 | textures/entity/villager/villager.png (base body); villager/type/{biome}.png, villager/profession/{profession}.png, villager/profession_level/{level}.png (overlays in the same layout, mostly transparent); textures/entity/zombie_villager/... (same layout); textures/entity/wandering_trader.png. head@overlay is the hat (the .png.mcmeta "hat" field decides whether it shows). hatRim lies flat around the hat. The arms are crossed in game; the views show them unrotated in front of the body. |
| `piglin` (`zombified_piglin`, `piglin_brute`) | 64×64 | head 10×8×8, snout 4×4×1, rightTusk 1×2×1, leftTusk 1×2×1, rightEar 1×5×4, leftEar 1×5×4, body 8×12×4*, rightArm 4×12×4*, leftArm 4×12×4*, rightLeg 4×12×4*, leftLeg 4×12×4* | textures/entity/piglin/piglin.png; piglin_brute.png; zombified_piglin.png. A player body (classic arms, with jacket, sleeve and pant overlays) under a 10×8×8 head without a hat layer. The snout and the tusks sit on head.front; the ears hang angled 30° in game and the views show them straight down. |
| `pig` (`temperate_pig`, `warm_pig`, `cold_pig`) | 64×64 | head 8×8×8, snout 4×3×1, body 10×8×16 lying*, leg 4×6×4 | textures/entity/pig/temperate_pig.png; warm_pig.png; cold_pig.png (body@overlay is its fur coat); pig.png before 1.21.5 (64×32, the same UVs). The body lies along the pig: body.top is its back, body.front the chest, body.back the rump, body.bottom the belly, all named and drawn the way they face in game. body@overlay is the cold pig's fur coat; leave it transparent for the others. The snout covers columns 2–5 of rows 4–6 of head.front. All four legs share one texture; the left ones are mirrored. |
| `cow` (`temperate_cow`, `mooshroom`) | 64×64 | head 8×8×6, muzzle 6×3×1, horn 1×3×1, body 12×10×18 lying, udder 4×1×6 lying, leg 4×12×4 | textures/entity/cow/temperate_cow.png; red_mooshroom.png; brown_mooshroom.png; cow.png and mooshroom textures before 1.21.5. The body lies along the cow: body.top is its back, body.front the chest, body.back the rump, body.bottom the belly; the udder hangs under the belly. Both horns share one texture. The cold and warm cows of 1.21.5 have their own layouts, cold_cow and warm_cow. |
| `cold_cow` | 64×64 | head 8×8×6, muzzle 6×3×1, rightHorn 2×2×6 lying, leftHorn 2×2×6 lying, body 12×10×18 lying*, udder 4×1×6 lying, leg 4×12×4 | textures/entity/cow/cold_cow.png. The cow of cold biomes (1.21.5+): horns that point forward and a fur coat on body@overlay, drawn a little larger than the body. The body lies along the cow (body.top is its back), as in the cow layout. |
| `warm_cow` | 64×64 | head 8×8×6, muzzle 6×3×1, horn 4×2×2, hornTip 2×2×2, body 12×10×18 lying, udder 4×1×6 lying, leg 4×12×4 | textures/entity/cow/warm_cow.png. The cow of warm biomes (1.21.5+): long horns, each a horn and an upturned tip shared, mirrored, by both sides. The body lies along the cow (body.top is its back), as in the cow layout. |
| `sheep` (`sheep_wool_undercoat`) | 64×32 | head 6×6×8, body 8×6×16 lying, leg 4×12×4 | textures/entity/sheep/sheep.png (the sheared body under the wool); sheep_wool_undercoat.png (drawn under the wool of dyed sheep and tinted with their color). The bare sheep; its wool is another texture with its own layout, sheep_wool. The body lies along the sheep (body.top is its back). All four legs share one texture; the right ones are mirrored. |
| `sheep_wool` | 64×32 | head 6×6×6, body 8×6×16 lying, leg 4×6×4 | textures/entity/sheep/sheep_wool.png. The wool drawn over the sheep, a little larger than it: a cap on the head (its front sits inside the sheep's face and never shows), a coat on the body and the tops of the legs. The game multiplies it by the sheep's dye color: on a white sheep the colors show as painted, on a dyed one they are tinted. So a colored design is for white sheep, and whites and light grays suit every color. Transparent pixels leave the sheep showing. |
| `chicken` (`temperate_chicken`, `warm_chicken`) | 64×32 | head 4×6×3, beak 4×2×2, wattle 2×2×2, body 6×6×8 lying, wing 1×4×6, leg 3×5×3 | textures/entity/chicken/temperate_chicken.png; warm_chicken.png; chicken.png before 1.21.5. The body lies along the chicken (body.top is its back, body.back its tail end). Both wings share one texture, and so do both legs. The cold chicken of 1.21.5 has its own layout, cold_chicken. |
| `cold_chicken` | 64×32 | head 4×6×3, crest 6×3×4, beak 4×2×2, wattle 2×2×2, body 6×6×8 lying, tail 0×5×3 lying, wing 1×4×6, leg 3×5×3 | textures/entity/chicken/cold_chicken.png. The chicken of cold biomes (1.21.5+): the chicken layout plus a fluffy crest, wider than the head, that covers the top of it and the top two rows of head.front, and a tail: a flat fin over the rump with only .right and .left faces, whose transparent pixels cut its outline. The body lies along the chicken (body.top is its back). |
| `wolf` (`wolf_armor`) | 64×32 | head 6×6×4, ear 2×2×1, snout 3×3×4, mane 8×7×6 lying, body 6×6×9 lying, leg 2×8×2, tail 2×8×2 | textures/entity/wolf/wolf.png and its _tame and _angry variants; the other wolf variants (ashen, black, chestnut, rusty, snowy, spotted, striped, woods); wolf_collar.png (same layout, transparent but for the collar on the mane); textures/entity/equipment/wolf_body/*.png (wolf armor, drawn slightly larger than the wolf) and wolf_armor_crackiness_*.png. The mane (the shaggy front half) and the body lie along the wolf: their top is its back. Both ears share one texture, and all four legs too; the right legs are mirrored. In game the tail angles back and the head sits half a pixel off the grid; the views show the tail straight down and snap to whole pixels. |
| `cat` (`ocelot`, `cat_collar`) | 64×32 | head 5×4×5, nose 3×2×2, rightEar 1×1×2, leftEar 1×1×2, body 4×6×16 lying, tail 1×1×8 lying, tailTip 1×1×8 lying, frontLeg 2×10×2, hindLeg 2×6×2 | textures/entity/cat/*.png (tabby, black, red, siamese, british_shorthair, calico, persian, ragdoll, white, jellie, all_black); textures/entity/cat/ocelot.png; cat_collar.png (same layout, transparent but for the collar, tinted with its dye color). The body lies along the cat (body.top is its back, body.back its rump). The tail is two lying pieces, tail then tailTip, named as when the cat runs with its tail straight back (their top is the upper side); walking, it hangs in a curve. Both front legs share one texture, and both hind legs another. The nose sits on the bottom half of head.front. |
| `hoglin` (`zoglin`) | 128×64 | body 16×14×26, mane 0×10×19, head 14×6×19, rightEar 6×1×4, leftEar 6×1×4, rightHorn 2×11×2, leftHorn 2×11×2, rightFrontLeg 6×14×6, leftFrontLeg 6×14×6, rightHindLeg 5×11×5, leftHindLeg 5×11×5 | textures/entity/hoglin/hoglin.png; zoglin.png. The mane is a flat fin along the spine with only .right and .left faces, and transparent pixels cut its outline. In game the head hangs tilted 50° down and the ears angle out; the views show them straight. Every leg has its own texture. |
| `iron_golem` | 128×128 | head 8×10×8, nose 2×4×2, body 18×12×11, waist 9×5×6, rightArm 4×30×6, leftArm 4×30×6, rightLeg 6×16×5, leftLeg 6×16×5 | textures/entity/iron_golem/iron_golem.png; iron_golem_crackiness_low.png, _medium.png and _high.png (cracks over the golem, same layout, transparent elsewhere). The head sits low, in front of the shoulders, the nose covering rows 7–9 of head.front and hanging one pixel below the chin. The waist is drawn slightly larger than its box. The left leg has its own texture, drawn mirrored like a vanilla left limb, so paint it as a copy of the right leg seen from the other side. |
| `witch` | 64×128 | head 8×10×8, nose 2×4×2, mole 1×1×1, brim 10×2×10, hatLow 7×4×7, hatHigh 4×4×4, hatTip 1×2×1, body 8×12×6, jacket 8×20×6, arm 4×8×4, armsMiddle 8×4×4, leg 4×12×4 | textures/entity/witch.png. A villager body (robe on jacket, crossed arms) under a pointed hat of four stacked boxes: brim, hatLow, hatHigh, hatTip. The brim covers the top two rows of head.front. The mole is a 1-pixel box on the nose, whose texture sits in head's unused top-left corner. In game the hat bends back a little at each step and the nose wiggles; the views show them straight. |
| `fox` (`snow_fox`, `fox_sleep`) | 48×32 | head 8×6×6, rightEar 2×2×1, leftEar 2×2×1, snout 4×2×3, body 6×6×11 lying, tail 4×5×9 lying, rightLeg 2×6×2, leftLeg 2×6×2 | textures/entity/fox/fox.png; snow_fox.png; fox_sleep.png and snow_fox_sleep.png (the same fox with its eyes closed, shown while it sleeps). The body and the bushy tail lie along the fox: their top is its back, and the tail points straight back from the rump (in game it droops 3°). The snout sits on the bottom two rows of head.front. Both right legs share one texture, and both left legs another. The head sits half a pixel off the grid; the views snap it. |
| `rabbit` (`killer_bunny`, `caerbannog`) | 64×32 | head 5×4×5, nose 1×1×1, rightEar 2×5×1, leftEar 2×5×1, body 6×5×10, tail 3×3×2, rightFrontLeg 2×7×2, leftFrontLeg 2×7×2, rightHaunch 2×4×5, leftHaunch 2×4×5, rightHindFoot 2×1×7, leftHindFoot 2×1×7 | textures/entity/rabbit/brown.png, white.png, black.png, gold.png, salt.png, white_splotched.png, toast.png; caerbannog.png (the killer bunny). Every leg piece has its own texture: front legs, haunches (the thighs) and long hind feet that lie flat on the ground. The nose is a 1-pixel box on head.front, a row below the middle. In game the body leans 20° nose down, the haunches, front legs and tail lean too, and the ears splay 15° apart; the views show them straight. The adult model is drawn at 0.6 scale, which does not change the texture. The UVs are the same in 1.21.1, 1.21.5 and 1.21.11. |
| `bee` (`angry_bee`) | 64×64 | body 7×7×10, rightAntenna 1×2×3, leftAntenna 1×2×3, stinger 0×1×2, wing 9×0×6, frontLegs 7×2 flat, middleLegs 7×2 flat, backLegs 7×2 flat | textures/entity/bee/bee.png; bee_angry.png, bee_nectar.png, bee_angry_nectar.png (the same layout: red eyes, pollen on the body). The wings are flat planes with no height that lie on the back: only wing.top and wing.bottom have pixels, they show in the top view and close-ups, not from the sides, and the left wing is the right one mirrored. Vanilla paints only wing.top and leaves a stray copy of the wing below it that the game never reads; the game draws the wings from both sides. Each set of legs is a flat strip under the body (front only), and the stinger is a fin with only .right and .left faces; vanilla paints only its right face. The antennae are thin sticks painted on their inner side, and their texture boxes overlap by 4 pixels in vanilla (rightAntenna.top and .bottom read leftAntenna.front and .left), so keep those pixels transparent. In game the wings flap and splay 15°; the views show them flat. bee_stinger.png is the stinger stuck in a player, a separate 16×16 texture. |
| `parrot` | 32×32 | head 2×3×2, headTop 2×1×4, beak 1×2×1, beakTip 1×2×1, feather 0×5×4, body 3×6×3, wing 1×5×3, tail 3×4×1, leg 1×2×1 | textures/entity/parrot/parrot_red_blue.png, parrot_blue.png, parrot_green.png, parrot_yellow_blue.png, parrot_grey.png. A tiny bird: headTop is a slab over the head that juts forward over the beak, the beak hangs from head.front and beakTip is the hooked upper tip in front of it. The feather is a crest seen from the sides (.right and .left only). Both wings share one texture, and so do both legs. In game the body leans forward 28°, the tail 58°, the wings swing back 40° and are turned around (each wing's outside is its .left face on the right wing and its .right face on the left wing); the views show them straight and unturned. The vanilla files fill the unused space with an opaque background color. |
| `axolotl` | 64×64 | head 8×5×5, gills 8×3 flat, rightGills 3×7 flat, leftGills 3×7 flat, body 8×4×10, fin 0×5×9, tail 0×5×12, leg 3×5 flat, legBack 3×5 flat | textures/entity/axolotl/axolotl_lucy.png, axolotl_wild.png, axolotl_gold.png, axolotl_cyan.png, axolotl_blue.png. Only the top 48 rows are used. The gills are three flat fronds behind the head: gills on top, rightGills and leftGills on the sides (Java calls them the other way round). The fin along the back and the tail are fins seen from the sides; vanilla paints only their .right face and the game shows it from both sides. The four legs share one flat texture, leg, whose back side is legBack (not drawn in the views). The views show the legs hanging straight down under the body; in game they splay out and paddle. |
| `frog` (`temperate_frog`, `warm_frog`, `cold_frog`) | 48×48 | head 7×3×9, upperMouth 7×0×9, rightEye 3×2×3, leftEye 3×2×3, body 7×3×9, lowerMouth 7×0×9, tongue 4×0×7, vocalSac 7×2×3, rightArm 2×3×3, leftArm 2×3×3, rightHand 8×0×8, leftHand 8×0×8, rightLeg 3×3×4, leftLeg 3×3×4, rightFoot 8×0×8, leftFoot 8×0×8 | textures/entity/frog/temperate_frog.png, warm_frog.png, cold_frog.png. The head is the upper jaw and the body the lower one; they overlap by a row, so the head's bottom row and the body's top hide inside. The mouth is two flat planes with no height inside the jaws, upperMouth and lowerMouth, plus the tongue; they show when the frog opens its mouth, and vanilla paints only their .top faces. The vocalSac is the throat that puffs out when the frog croaks. The hands and feet are flat webbed planes on the ground (only .top and .bottom have pixels; vanilla paints the top); they show in close-ups, not from the sides. |
| `turtle` (`sea_turtle`, `big_sea_turtle`) | 128×64 | head 6×5×6, shell 19×6×20 lying, belly 11×3×18 lying, eggBelly 9×1×18 lying, rightFrontLeg 13×1×5, leftFrontLeg 13×1×5, rightHindLeg 4×1×10, leftHindLeg 4×1×10 | textures/entity/turtle/big_sea_turtle.png. The shell and the belly under it lie along the turtle: shell.top is the top of the shell, shell.front faces the head. eggBelly is a bulge under the belly that only shows while a turtle carries eggs. The flippers are flat slabs one pixel thick: the front ones stick out sideways, the hind ones trail behind. |
| `armadillo` | 64×64 | body 8×8×12*, head 3×5×2, rightEar 2×5 flat, leftEar 2×5 flat, tail 1×6×1, rightFrontLeg 2×3×2, leftFrontLeg 2×3×2, rightHindLeg 2×3×2, leftHindLeg 2×3×2, ball 10×10×10 | textures/entity/armadillo.png. body is the soft body and body@overlay the shell over it, drawn slightly larger: its bottom is open and its sides have gaps for the legs and head, so leave those transparent. ball is the armadillo rolled up when scared, a 10×10×10 cube shown instead of everything else; it has no place in the views. The ears are flat (front only). In game the head tilts 22° down, the tail 29° and the ears splay; the views show them straight. |
| `bat` | 32×32 | head 4×3×2, rightEar 3×5 flat, leftEar 3×5 flat, body 3×5×2, rightWing 2×7 flat, rightWingTip 6×8 flat, leftWing 2×7 flat, leftWingTip 6×8 flat, feet 3×2 flat, rightEarBack 3×5 flat, leftEarBack 3×5 flat, rightWingBack 2×7 flat, rightWingTipBack 6×8 flat, leftWingBack 2×7 flat, leftWingTipBack 6×8 flat, feetBack 3×2 flat | textures/entity/bat.png (the bat model of 1.20.3 and later). The ears, the wings (an inner piece and a tip on each side) and the feet are flat planes through the middle of the body. Each has a painted back: the parts ending in Back are the same planes seen from behind (drawn mirrored, so the left edge of a Back face is the right edge of its front), and the views only show the fronts. In game the bat hangs upside down at rest and flaps with its wings folded or spread; the views show it upright with the wings spread flat. |
| `horse` (`zombie_horse`, `skeleton_horse`, `horse_armor`) | 64×64 | head 6×5×7, muzzle 4×5×5, ear 2×3×1, neck 4×12×7, mane 2×16×2, body 10×10×22, tail 3×14×4, leg 4×11×4 | textures/entity/horse/horse_{white,creamy,chestnut,brown,black,gray,darkbrown}.png; horse_markings_{white,whitefield,whitedots,blackdots}.png (markings over the coat, same layout, transparent elsewhere); horse_zombie.png and horse_skeleton.png (zombie and skeleton horses); textures/entity/equipment/horse_body/*.png (horse armor: leather, copper, iron, gold, diamond, netherite, leather_overlay; drawn slightly larger, transparent where the coat shows). The body is a plain box along the horse (body.front is its chest, body.back its rump). The head is three boxes on top of the neck: head (with the eyes on its sides), muzzle in front of it, and the mane down the back of the neck. In game the neck leans forward 30° and the tail hangs back 30°; the views show both straight. Both ears share one texture, and so do all four legs; the left legs are mirrored. Saddles are separate textures (equipment/horse_saddle). Before 1.21.5 the saddle and bridle were painted into the free corners of the horse texture; those pixels belong to no part here. The front legs moved 2 pixels back in 1.21.5, with the same UVs. The skeleton horse is see-through: horse_skeleton.png leaves gaps between the bones (the neck, mane and ears are empty), so its transparent base pixels are intended. Leather horse armor (leather.png, tinted with the dye color) is filled edge to edge, unused corners included. |
| `donkey` (`mule`) | 64×64 | head 6×5×7, muzzle 4×5×5, ear 2×7×1, neck 4×12×7, mane 2×16×2, body 10×10×22, tail 3×14×4, chest 8×8×3, leg 4×11×4 | textures/entity/horse/donkey.png; textures/entity/horse/mule.png. The horse layout with long ears and a pair of chests, drawn only when the donkey or mule carries one. Vanilla leaves the mane transparent, so donkeys and mules show none; paint it to give them one. The 2×3 horse ear still sits unused at 19,16 in donkey.png and mule.png. Both ears share one texture, and so do both chests. In game each chest hangs on a flank turned 90° about y, chest.front facing out; the views show the chests unturned beside the body, front forward. The ears lean out 15° and the neck forward 30°; the views show them straight. The left legs are mirrored. Saddles are separate textures (equipment/donkey_saddle, mule_saddle). Before 1.21.5 the saddle was painted into the free corners of the texture; those pixels belong to no part here. |
| `llama` (`trader_llama`, `llama_decor`) | 128×64 | head 8×18×6, muzzle 4×4×9, ear 3×3×2, body 12×10×18 lying, rightChest 8×8×3, leftChest 8×8×3, leg 4×14×4 | textures/entity/llama/creamy.png (llamas and trader llamas); textures/entity/equipment/llama_body/*.png (the 16 carpets and trader_llama.png; same layout, drawn slightly larger, transparent where the wool shows); textures/entity/llama/decor/*.png in older versions (the same carpets). head is one tall box for the head and the long neck, eyes near its top; muzzle juts forward from it. The body lies along the llama: body.top is its back, body.front the chest, body.back the rump. Both ears share one texture, and all four legs too (none mirrored). The chests, drawn only when the llama carries them, each have their own texture and hang on the flanks turned 90° about y: rightChest.front faces out to the right, but leftChest faces its back outward. The views show both chests unturned beside the body, front forward. In 1.21.1 the carpets were textures/entity/llama/decor/*.png, same layout. |
| `camel` (`camel_husk`) | 128×128 | body 15×12×27, hump 9×5×11, tail 3×14 flat, neck 7×8×19, head 7×14×7, muzzle 5×5×6, rightEar 3×1×2, leftEar 3×1×2, rightFrontLeg 5×21×5, leftFrontLeg 5×21×5, rightHindLeg 5×21×5, leftHindLeg 5×21×5 | textures/entity/camel/camel.png; camel_husk.png (1.21.11). The neck runs forward from the chest, low, and head rises from its front end like a column, eyes near the top; muzzle juts forward from the top of head. The tail is a flat strip hanging from the rump, with only a .front face (seen from behind it shows mirrored), and transparent pixels cut its outline. Every leg and each ear has its own texture. Saddles are separate textures (equipment/camel_saddle, camel_husk_saddle). Before 1.21.5 the saddle, bridle and reins were painted into the bottom half of camel.png; those pixels belong to no part here. camel_husk.png (1.21.11) uses the same model and UVs. |
| `goat` | 64×64 | head 5×7×10, ear 3×2×1, horn 2×7×2, goatee 0×7×5, coat 11×14×11, body 9×11×16, rightFrontLeg 3×10×3, leftFrontLeg 3×10×3, rightHindLeg 3×6×3, leftHindLeg 3×6×3 | textures/entity/goat/goat.png (goats and screaming goats). Two boxes make the body: coat, the shaggy front half, and body, the narrower back half that runs on to the rump. The head (Java calls it nose) points down-forward at 55° in game, its .front the tip of the snout; the views show it straight out, with the goatee, a flat fin seen only from the sides, hanging under it. Both ears share one texture (the left mirrored), and so do both horns. Each leg has its own texture. A goat that lost a horn hides it; nothing changes in the texture. |
| `panda` | 64×64 | head 13×10×9, nose 7×5×2, ear 5×4×1, body 19×13×26 lying, leg 6×9×6 | textures/entity/panda/panda.png; lazy_panda.png, worried_panda.png, playful_panda.png, brown_panda.png, weak_panda.png, aggressive_panda.png (the personality variants). The body lies along the panda: body.top is its back, body.front the chest, body.back the rump. The nose covers the bottom half of head.front. Both ears share one texture, and all four legs too (none mirrored). Sitting, rolling and lying are animations; the texture stays the same. |
| `polar_bear` (`polarbear`) | 128×64 | head 7×7×7, mouth 5×3×3, ear 2×2×1, shoulders 12×10×12 lying, body 14×11×14 lying, frontLeg 4×10×6, hindLeg 4×10×8 | textures/entity/bear/polarbear.png. Two lying boxes make the body: shoulders, the front half, and body, the wider back half; for both, .top is the bear's back and .bottom its belly. The mouth juts from the bottom of head.front. Both ears share one texture; the left one is mirrored since 1.21.11 (before, both drew it the same way). Both front legs share one texture, and both hind legs another. Standing up on its hind legs is an animation; the views show the bear on all fours. |
| `slime` | 64×32 | outerCube 8×8×8, innerCube 6×6×6, rightEye 2×2×2, leftEye 2×2×2, mouth 1×1×1 | textures/entity/slime/slime.png. Two cubes from one texture: the game draws outerCube translucent around an opaque innerCube that carries the eyes and the mouth. Keep outerCube semi-transparent (vanilla alpha is about 50%) so the face shows through; the eyes and the mouth stick half a pixel out of innerCube.front. The magma cube has its own layout, magma_cube. |
| `magma_cube` (`magmacube`) | 64×64 | segment0 8×1×8, segment1 8×1×8, segment2 8×1×8, segment3 8×1×8, segment4 8×1×8, segment5 8×1×8, segment6 8×1×8, segment7 8×1×8, insideCube 4×4×4 | textures/entity/slime/magmacube.png (1.21.5+). The cube is eight stacked slices, segment0 at the top to segment7 at the bottom, each 1 pixel high with its own texture: their .front rows together make the face (the eyes sit on segment2 and segment3). Only segment0.top and segment7.bottom show when the cube is still; the other tops and bottoms show when it jumps and the slices spread apart, revealing insideCube, the glowing core. Before 1.21.5 magmacube.png was 64×32 with other UVs (slices sharing texture rows); this layout does not fit it. |
| `blaze` | 64×32 | head 8×8×8, rod 2×8×2 | textures/entity/blaze.png. All twelve rods share one texture. They circle the head in three rings (four at its level, four lower, four under it) and spin in game; the views show them at their resting places. |
| `ghast` (`ghast_shooting`) | 128×64 | body 32×32×32, tentacle 4×24×4 | textures/entity/ghast/ghast.png; ghast_shooting.png (the face with the mouth open); ghast.png and ghast_shooting.png before 1.21.6 (64×32: the same UVs at half the resolution; the game fits any 2:1 texture to the model, so a 128×64 one works there too). Since 1.21.6 the ghast texture is twice the resolution of its model, so this layout counts texture pixels: a 32-pixel cube and 4-pixel-wide tentacles. All nine tentacles share one texture in the unused top-left corner; in game they are 18 to 24 pixels long, cut from the top of it, and the views draw them all 24 long. |
| `happy_ghast` (`happy_ghast_ropes`) | 128×128 | body 32×32×32, tentacle 4×16×4 | textures/entity/ghast/happy_ghast.png; happy_ghast_ropes.png (the leash ropes drawn a little larger than the body when it is harnessed and leashed; transparent elsewhere). The grown happy ghast (1.21.6+). Its texture is twice the resolution of its model, so this layout counts texture pixels: a 32-pixel cube and 4-pixel-wide tentacles. All nine tentacles share one texture in the unused top-left corner; in game they are 8 to 16 pixels long, cut from the top of it, and the views draw them all 16 long. The ghastling (baby) has its own layout, happy_ghast_baby; the harness another, happy_ghast_harness. |
| `happy_ghast_baby` (`ghastling`) | 64×64 | body 16×16×16, innerBody 16×16×16, tentacle 2×8×2 | textures/entity/ghast/happy_ghast_baby.png. The ghastling, the baby happy ghast (1.21.6+), at the model's own resolution. body carries the face; innerBody is a second cube inside it, half a pixel smaller, that only shows through pixels left transparent in body (vanilla paints body opaque and innerBody pink). All nine tentacles share one texture in the unused top-left corner; in game they are 4 to 8 pixels long, cut from the top of it, and the views draw them all 8 long. |
| `happy_ghast_harness` | 128×128 | harness 32×32×32, goggles 32×10×10 | textures/entity/equipment/happy_ghast_body/{color}_harness.png (16 dye colors). The harness worn by a happy ghast (1.21.6+), at twice the resolution of its model like happy_ghast. harness wraps the whole cube; leave it transparent where the ghast should show. goggles is a bar across the face, drawn slightly larger; the views show it lowered over the eyes, as when the ghast is ridden; otherwise it is raised and tilted 45° up. |
| `phantom` (`phantom_eyes`) | 64×64 | head 7×3×5, body 5×3×9, tailBase 3×2×6, tailTip 1×1×6, wingBase 6×2×9, wingTip 13×1×9 | textures/entity/phantom.png; phantom_eyes.png (glowing eyes, same layout, transparent elsewhere). The phantom flies flat, so its boxes are already horizontal: wingBase.top and wingTip.top are the upper side of the wings, .bottom the underside, and the views see the wings edge-on. Both wings share one texture; the right one is mirrored. Transparent pixels cut the ragged outline of the wing tips. The head is 7 wide and the body 5, both off center by half a pixel in game. In game the head tilts down a little, the body tips up and the wings flap; the views show them straight. |
| `guardian` (`elder_guardian`, `guardian_elder`) | 64×64 | body 12×12×16, side 2×12×12, plate 12×2×12, eye 2×2×1, spike 2×9×2, tail0 4×4×8, tail1 3×3×7, tail2 2×2×6, fin 1×9×9 | textures/entity/guardian.png; textures/entity/guardian_elder.png (the elder guardian is the same model scaled up). The body is a 12×12×16 box with a 2-pixel side panel on each flank (the left one mirrored) and a plate on top and bottom (one texture for both), so it reads as a rounded block. The eye is a separate 2×2 box set into the middle of body.front. The tail is three boxes getting thinner toward the back, with a fin standing up at the end. Vanilla paints only what shows: the strips of body.top, .bottom, .right and .left that the panels and plates leave uncovered, side.right (the left panel shows it mirrored) and fin.right (the game draws the fin from both sides); the rest is transparent and hidden, so the base need not be opaque. The fin's 1-pixel top and bottom edges share texture pixels with body.left, as in vanilla. The twelve spikes share one texture in body's unused top-left corner; in game they stick out diagonally from the edges, so the views leave them out. |
| `shulker` (`shulker_box`) | 64×64 | lid 16×12×16, base 16×8×16, head 6×6×6 | textures/entity/shulker/shulker.png and shulker_{color}.png (16 dye colors); the shulker box block (same texture: lid and base only). The shell is two boxes: lid over base. Closed, the lid comes down to y 8, overlapping the base and hiding the head. The views show it half open, as when the shulker peeks, so the head shows between them. The two interlock: vanilla leaves an 8×4 notch transparent at the bottom middle of each side of the lid, and the top corners of each side of the base, so the base's raised middle fills the lid's notch when it closes. lid.bottom (the inside of the lid) and base.top (the floor of the shell) are transparent but for a rim. |
| `strider` (`strider_cold`, `strider_saddle`) | 64×128 | body 16×14×16, rightLeg 4×16×4, leftLeg 4×16×4, topBristle 12×16 flat, topBristleInner 12×16 flat, middleBristle 12×16 flat, middleBristleInner 12×16 flat, bottomBristle 12×16 flat, bottomBristleInner 12×16 flat | textures/entity/strider/strider.png; strider_cold.png (the shivering strider out of lava); textures/entity/equipment/strider_saddle/saddle.png (1.21.5+; textures/entity/strider/strider_saddle.png before), the saddle in the same layout, transparent elsewhere. Three tiers of bristles hang from each side of the body, both sides sharing a texture (the right side mirrored). Each tier is a flat 12×16 sheet with two faces: topBristle is the outer side and topBristleInner the side toward the body; column 0 is the edge on the body, row 0 the back end. Transparent pixels cut each bristle's outline; vanilla leaves the Inner faces transparent, since the game draws the outer face from both sides. They hang 50° to 70° from the body and sway, so the views leave them out. |
| `warden` | 128×128 | head 16×16×10, rightTendril 16×16 flat, leftTendril 16×16 flat, body 18×21×11, ribcage 9×21 flat, rightArm 8×28×8, leftArm 8×28×8, rightLeg 6×13×6, leftLeg 6×13×6 | textures/entity/warden/warden.png; warden_bioluminescent_layer.png, warden_heart.png, warden_pulsating_spots_1.png and _2.png (glowing layers in the same layout, transparent elsewhere: the heart on body, the spots on body, head and limbs). The ribcage is a flat sheet over body.front, one texture for both halves (the left one mirrored), with gaps that show the chest (and the heart) behind it. The tendrils are flat sheets on both sides of the head, each with its own texture, standing out sideways from the middle of the head; the side views see them edge-on. Their transparent pixels cut their outline. |
| `illager` (`vindicator`, `evoker`, `pillager`, `illusioner`) | 64×64 | head 8×10×8, hat 8×12×8, nose 2×4×2, body 8×12×6, jacket 8×20×6, freeArm 4×12×4, arm 4×8×4, armsMiddle 8×4×4, leg 4×12×4 | textures/entity/illager/vindicator.png; evoker.png; pillager.png; illusioner.png. A villager body (robe on jacket) with two sets of arms in one texture. freeArm is the pair that hangs at the sides, swings a weapon or casts spells (the pillager always uses it); arm and armsMiddle are the crossed arms vindicators, evokers and illusioners fold while idle, and the pillager leaves them transparent. Only one set shows at a time, so the views draw the hanging arms and the crossed ones have no box. hat is a hood over the head, 12 pixels tall and drawn slightly larger than it; only the illusioner paints it. Both legs share one texture, and so do both free arms; the left ones are mirrored. The nose covers rows 7–9 of head.front and hangs one pixel below the chin. |
| `armor_stand` | 64×64 | head 2×7×2, body 12×3×3, rightArm 2×12×2, leftArm 2×12×2, rightBodyStick 2×7×2, leftBodyStick 2×7×2, hip 8×2×2, rightLeg 2×11×2, leftLeg 2×11×2, basePlate 12×1×12 | textures/entity/armorstand/wood.png. head is the neck stick an equipped helmet or head sits on, and body the shoulder bar. Every stick has its own texture; the left arm and leg are drawn mirrored like vanilla left limbs. The arms show only when the stand has them, and basePlate only when it has one. The names along the bottom of the vanilla texture are an easter egg the model never draws. In game the body half-pixel and the legs a tenth of a pixel off the grid; the views snap to whole pixels. |
| `snow_golem` | 64×64 | head 8×8×8, upperBody 10×10×10, lowerBody 12×12×12, arm 12×2×2 | textures/entity/snow_golem.png. Three stacked snowballs and two stick arms that share one texture. Every box is drawn half a pixel smaller on each side in game, so the snowballs just touch; the views stack them whole, the head one pixel higher and the lower body one pixel lower than the Java boxes. In game the arms angle up about 57° and the right one is the same stick turned end for end; the views show both straight out to the sides. The carved pumpkin is a block drawn over the head, not part of this texture: head.front is the face under it, seen once the golem is sheared. |
| `allay` | 32×32 | head 5×5×5, body 3×4×2, lowerBody 3×5×2, rightArm 1×4×2, leftArm 1×4×2, wing 0×5×8 | textures/entity/allay/allay.png. The allay is drawn translucent, so partly transparent pixels are part of the design. lowerBody is a second, longer box over the body, drawn slightly smaller: the wispy lower half. Each arm has its own texture. Both wings share one texture and are flat planes with only .right and .left faces (vanilla paints only wing.right; the game draws it double-sided, so it shows from both sides); transparent pixels cut their outline. In game the wings spread out and back and the arms swing; the views show them folded straight behind the body and snap the half-pixel offsets to the grid. Not the vex layout: the vex has wider arms, a lower lowerBody and a mirrored left wing. |
| `vex` (`vex_charging`) | 32×32 | head 5×5×5, body 3×4×2, lowerBody 3×5×2, rightArm 2×4×2, leftArm 2×4×2, wing 0×5×8 | textures/entity/illager/vex.png; vex_charging.png (same layout, used while it attacks). The vex is drawn translucent, so partly transparent pixels are part of the design. lowerBody is a second, longer box hanging one pixel lower than the body, drawn slightly smaller: the wispy tail. Each arm has its own texture and sinks half a pixel into the body. Both wings share one texture, the left one mirrored; they are flat planes with only .right and .left faces (vanilla paints only wing.right; the game draws it double-sided, so it shows from both sides), and transparent pixels cut their outline. In game the wings spread out and flap; the views show them folded straight behind the body and snap the half-pixel offsets to the grid. |
| `squid` (`glow_squid`) | 64×32 | body 12×16×12, tentacle 2×18×2 | textures/entity/squid/squid.png; squid/glow_squid.png (same layout). The body points up with the tentacles hanging from its bottom in a ring; all eight share one texture. In game each tentacle is turned to face out from the center and they sway together; the views show them straight down, unturned and snapped to the grid. |
| `dolphin` | 64×64 | head 8×7×6, nose 2×2×4, body 8×7×13, backFin 1×5×4 lying, fin 1×4×7, tail 4×5×11, tailFin 10×1×6 | textures/entity/dolphin.png. The dolphin swims along z: body.front faces forward, the head and nose stick out in front, the tail and its flat tail fin trail behind. In game the back fin leans back 60°; the views stand it up on the back like a lying part (backFin.top is its tip). The two side fins share one texture, the left one mirrored; in game they splay out and down from the belly, and the views hang them straight down under it. The tail tilts slightly; the views show it straight. |
| `copper_golem` (`exposed_copper_golem`, `weathered_copper_golem`, `oxidized_copper_golem`) | 64×64 | head 8×5×10, nose 2×3×2, antenna 2×4×2, antennaTip 4×4×4, body 8×6×6, rightArm 3×10×4, leftArm 3×10×4, rightLeg 4×5×4, leftLeg 4×5×4 | textures/entity/copper_golem/copper_golem.png, exposed_copper_golem.png, weathered_copper_golem.png, oxidized_copper_golem.png; copper_golem_eyes.png and the other _eyes files (glowing eyes, same layout, transparent elsewhere). Exists only from 1.21.10. A wide, flat head with the nose on rows 1–3 of head.front and an antenna on top: a rod (antenna) and a knob (antennaTip). Every limb has its own texture, none mirrored. |
| `cape` (`elytra`) | 64×32 | cape 10×16×1, elytra 10×20×2 | player capes; textures/entity/equipment/wings/elytra.png. cape.front is the outer side people see from behind the player. The elytra region is one wing; the other wing is the same texture mirrored. |
| `item` | 16×16 | item 16×16 flat | textures/item/*.png; mod item textures. Leave the background transparent; the game draws the item from its opaque pixels. "size" makes an HD item (32×32, 64×64…). Frames in "animation" make an animated item (a strip and its .png.mcmeta). |
| `block` (`cube_all`) | 16×16 | block 16×16 flat | textures/block/*.png of cube_all blocks (stone, dirt, planks, ores, wool); one face of any block. Tiles next to copies of itself: the review checks the seams and the sheet shows it tiled 3×3. Blocks with other textures on top or in front have their own layouts: block_column, block_bottom_top, block_orientable. |
| `block_column` (`cube_column`, `log`, `pillar`) | 32×16 | side 16×16 flat, end 16×16 flat | textures/block/oak_log.png + oak_log_top.png and the other logs and stems; quartz_pillar, purpur_pillar, basalt, bone_block, hay_block. Two files: <name>.png (the side, bark running top to bottom) and <name>_top.png (both ends, the rings). Both tile. |
| `block_bottom_top` (`cube_bottom_top`) | 48×16 | side 16×16 flat, top 16×16 flat, bottom 16×16 flat | textures/block/sandstone.png, sandstone_top.png, sandstone_bottom.png; grass_block_side, mycelium_side, podzol_side, crimson_nylium_side (their bottom is another block). Three files: <name>_side.png, <name>_top.png and <name>_bottom.png. The top row of the side meets the top texture in game. |
| `block_orientable` (`orientable`) | 48×16 | front 16×16 flat, side 16×16 flat, top 16×16 flat | textures/block/furnace_front.png, furnace_side.png, furnace_top.png; dispenser, dropper, observer, carved_pumpkin, loom. Three files: <name>_front.png (faces the player who placed it), <name>_side.png (the other three sides) and <name>_top.png (top and bottom). |
| `plant` (`cross`, `flower`) | 16×16 | plant 16×16 flat | textures/block/*.png of cross blocks: poppy, dandelion, oak_sapling, dead_bush, wheat_stage7. Drawn on two crossed planes, so leave the background transparent. The bottom row touches the ground. |
| `gui` (`sprite`, `gui_sprite`) | 16×16 | sprite 16×16 flat | textures/gui/sprites/**/*.png (widget/button, container/slot, hud/heart/full, icon/…); textures/gui/container/*.png (whole screens, 256×256). Set "size" to the sprite size (a button is 200×20). "gui": { "scaling": … } is written to its .png.mcmeta: "nine_slice" keeps the corners and tiles the edges and the middle when the game resizes it, "tile" repeats it, "stretch" scales it. The "bevel" op draws raised and inset frames in the vanilla style. |
| `particle` | 8×8 | particle 8×8 flat | textures/particle/*.png (flame, heart, glint, generic_0…7); particles/<id>.json (lists the frames). Most vanilla particles are 8×8; "size" changes it. Frames in "animation" become one file per frame (<name>_0.png, <name>_1.png…), listed in order by the particle definition, the way vanilla animates particles. |
| `painting` | 16×16 | painting 16×16 flat | textures/painting/*.png (kebab 1×1, wanderer 1×2, pool 2×1, skeleton 4×3). Set "size" in pixels, 16 per block: a 2×1 painting is [32, 16]. A new painting also needs a painting_variant in a data pack. |
<!-- layouts:end -->

`*` marks parts with an `@overlay` layer. A flat part (items, blocks) only has `.front`, so `"target": "item"` is enough.

Notes that save a round:

- **Mirrored limbs.** In `zombie`, `humanoid`, `skeleton` and `enderman` the left arm and leg reuse the right ones mirrored in game, so there is only `rightArm`/`rightLeg` (or `limb`) to paint; `leftArm` is an error with a hint. `player` and `drowned` have their own left limbs.
- **Lying bodies.** The body of a pig, cow, sheep, chicken, wolf or cat (and a wolf's mane, a cold cow's horns, a cat's tail) lies along the animal. Its faces are named the way they face in game, and face-local coordinates read upright as you would see them: `body.top` is the back (row 0 at the rump, like every top face), `body.front` the chest, `body.back` the rump with the tail, `body.bottom` the belly, and `body.right`/`body.left` are 16 wide and 8 tall with the head toward the front. The table gives these boxes as they stand in game, and the review sheet adds a view from above for these layouts. The other ones stand upright: `iron_golem` and `witch` read like a player.
- **High-level ops.** `face` and `hair` need an 8×8×8 `head` (player, zombie, drowned, humanoid, skeleton, creeper, enderman, spider, pig); elsewhere they report `op-unsupported`, and other heads take `pixels`. `region` names (`sleeves`, `boots`…) cover the humanoid parts and simply miss elsewhere. `lighting` and `material` work on every layout.
- **Transparency.** Most mobs, `cape`, `painting` and the block layouts should be fully opaque, and the review warns about holes. Layouts whose vanilla textures keep transparent pixels on purpose don't: `humanoid` (armor), `skeleton`, `villager` and its overlays, the witch, `sheep_wool`, illagers, slimes, the translucent allay and vex, shulkers, guardians, `item`, `plant`, `gui` and `particle`. Parts cut by transparency (a chicken's leg, a fin, a ragged wing tip) are marked in the layout and never count as holes.
- **Flat planes and shared pixels.** Some mobs have planes with no width (fins, seen from the sides) or no height (a bee's wings, seen from above: the sheet adds a view from above). A few parts share texture pixels in vanilla itself (a bee's antennae, a guardian's fin edges): painting one paints the other there.
- **Several files for one mob.** Vanilla often splits a mob into several textures with the same layout: `enderman_eyes.png`, `spider_eyes.png`, `drowned_outer_layer.png`, the villager's biome and profession overlays, leather armor's `_overlay.png`. Write one spec per file, or a [family](families.md) when they share a palette.
- **Versions.** The layouts follow Java Edition 1.21.x. Bedrock uses the same UVs for most of them, but not for the drowned.
- **Bigger textures.** `item`, `block` and `plant` take a square `size` (32×32, 64×64…) for HD packs. Mob textures stay at the vanilla size; scale the PNG up by a whole number afterwards if a pack needs it.
- **Glowing parts.** `enderman_eyes.png`, `spider_eyes.png`, `phantom_eyes.png` and a mod's `<name>_eyes.png` are the glowing pixels of a mob on a transparent texture. Mark the ops that paint them with `"emissive": true` instead of writing a second spec: see [Glow](#glow).

The CLI lists the same table with `node texel.mjs layouts`, and `node texel.mjs init --layout creeper` prints a starter spec. A few layouts are files that start from an empty frame or have no vanilla model; for those, start from `init` too.

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

Join alternatives with `+`: `"head.top+back"`, `"arms+legs.sides"`. An array of selectors is a union. Whole selectors joined with `+` are read as a union too: `"body.sides+arms.sides"` is `["body.sides", "arms.sides"]`, and `"head.front+body"` is the face plus the whole body. A layer on the last one (`"head.right+head.back@overlay"`) applies to all of them; a layer on an earlier one only is ambiguous and an error, so write it on each or use an array.

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
Shift lightness of existing pixels by `amount` (−100…100), with the hue drift of a `~` step: darker turns slightly cooler, lighter slightly warmer (grays stay gray). The workhorse for depth.
```json
{ "op": "shade", "target": "rightLeg.left+back", "amount": -7 }
```

### copy
Copy one face (`from` must select exactly one) onto target faces. `flip`: `h`, `v`, `hv`. Sizes are resampled if they differ. Works on `@overlay` faces too, which is how a feature that spans several faces stays symmetric: paint one arm's part of a pair of wings, copy it to the other arm flipped, and `symmetrize` the part on the body.
```json
{ "op": "copy", "from": "head.right", "to": "head.left", "flip": "h" }
{ "op": "copy", "from": "leftArm.back@overlay", "to": "rightArm.back@overlay", "flip": "h" }
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
Fill an area with a color and the texture of a material, with its tones derived from that one color. `kind`: `plain`, `skin`, `fabric`, `knit`, `leather`, `metal`, `fur`, `stone`, `scales`, `wood`, `glow`. Takes the area options and `region`; `seed` varies the grain. `fur` has strong grain and turns blotchy on very light colors (white or pastel coats, and feathers, which are read as `fur`); use `skin` or `plain` plus `noise` with jitter 2–4 there.
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
Light from above and slightly in front, the way the art guide shades by hand: tops lighter, bottom rows and bottoms darker, backs and the inner faces of limbs darker. With no `target` it lights everything except `head.front` (the face, on mobs too). `strength` scales it (default 1, 0–3). Like `shade`, it cools what it darkens and warms what it lights. Put it after the broad fills and before small details, so buttons and eyes keep their exact colors.
```json
{ "op": "lighting" }
```

### bevel
A frame in the vanilla GUI style over the target area (the whole face, or `x`/`y`/`w`/`h`): `style` `raised` (default: `light` along the top and left, `dark` along the bottom and right) or `inset` (the reverse, like an inventory slot), `depth` rings (1–8, default 1), and an optional `outline` around it with its four corner pixels left out, like vanilla's rounded buttons and panels. `light` and `dark` default to `color` lightened and darkened. The inside is filled with `color`. Works on any flat face; made for `gui` sprites.
```json
{ "op": "bevel", "target": "sprite", "color": "#c6c6c6", "light": "#ffffff", "dark": "#555555", "outline": "#000000" }
```

## Glow

`"emissive": true` on any op makes the pixels it paints glow: they also go to a second texture, `<name>_eyes.png`, transparent everywhere else, the way vanilla draws `spider_eyes.png` and `enderman_eyes.png` and mods draw glowing eyes. On `face` only the eyes glow. A later op that paints over a glowing pixel turns it off unless it is emissive too; `shade`, `noise` and `lighting` adjust it and keep the glow; `copy`, `mirror` and `symmetrize` carry it along. The review counts the glowing pixels and the sheet shows them on black.

```json
{ "op": "face", "skin": "skin", "eyes": "#5ff3ff", "eyeStyle": "glow", "emissive": true }
```

## Animation

Items, blocks, plants, GUI sprites and particles can animate. `animation.frames` lists the frames; each is a [patch](#patches) over the spec's layers (by `id`), so a frame says only what changes, and `{}` is the spec as it is. `frametime` (ticks per frame, 20 per second, default 1), `interpolate` (blend between frames) and a frame's own `time` go to the `.png.mcmeta`.

```json
"animation": {
  "frametime": 4,
  "frames": [
    {},
    { "patch": [{ "do": "update", "id": "embers", "set": { "seed": 2 } }] },
    { "patch": [{ "do": "palette", "set": { "glow": "#ffb43a" } }], "time": 8 }
  ]
}
```

The texture compiles to a vertical strip of its distinct frames: a frame repeated later is stored once and listed by index in the `.png.mcmeta`, as vanilla does. A particle compiles to one file per frame instead (`<name>_0.png`, `<name>_1.png`…), listed by its particle definition. The layers themselves are frame 0 for everything else (the review, the views); the sheet adds every frame. The review warns when all frames are the same picture. Animating a mob texture is ignored: the game draws it still.

## GUI sprites

The `gui` layout is any size: a button is `"size": [200, 20]`, a slot `[18, 18]`, a whole container screen `[256, 256]` with `"asset": "gui/container/furnace"`. The default place in a pack is `gui/sprites/<name>`; set `asset` to replace a vanilla sprite, such as `gui/sprites/widget/button`.

`gui.scaling` tells the game how to draw the sprite at other sizes, and goes to its `.png.mcmeta`:

| `type` | Fields | The game |
| --- | --- | --- |
| `stretch` | | scales the sprite. |
| `tile` | `width`, `height` | repeats it. |
| `nine_slice` | `width`, `height`, `border` (a number or `{ "left", "top", "right", "bottom" }`), `stretch_inner` | keeps the corners, repeats the edges and the middle (or stretches the middle with `stretch_inner`). |

`width` and `height` default to the texture size. Borders must leave a middle. The sheet shows the sprite drawn at two other sizes the way the game resizes it, so a gradient that breaks when tiled shows right away. The `bevel` op draws the raised and inset frames vanilla uses.

## Blocks and tiling

`block` is one texture on every side (`cube_all`). `block_column` (logs, pillars: `side` and `end`), `block_bottom_top` (grass, sandstone: `side`, `top`, `bottom`) and `block_orientable` (furnaces: `front`, `side`, `top`) paint every texture of a block in one spec and come out as one file per part, named the vanilla way: `oak_log.png` and `oak_log_top.png`, `sandstone_side.png`, `furnace_front.png`. `plant` is a cross block's texture (flowers, saplings, crops), with a transparent background.

Blocks sit next to copies of themselves, so the review measures each part's seams: how much more the colors jump across the edge where two copies meet than between neighbors inside the texture (`stats.seams`, 1 = seamless). Over 2.5 it reports `tile-seam` with the part. The sheet shows every part tiled 3×3 and the block in 3D.

## Resource packs

`node texel.mjs pack` (or the MCP tool `texel_pack`) builds a resource pack from specs, families and folders of specs: a folder, or a `.zip` the game loads as is. Each texture goes to `assets/<namespace>/textures/<asset>.png` with every file it compiles to (block parts, animation strip and `.png.mcmeta`, particle frames, `_eyes`), and `pack.mcmeta` gets the format of `--mc-version` (1.21 to 1.21.11; the default is the latest).

Where each texture goes: the spec's `asset`; otherwise its layout's default, the vanilla texture for mobs (`entity/pig/temperate_pig`: a pack replaces it) or `item/<name>`, `block/<name>`, `particle/<name>`, `gui/sprites/<name>`, `painting/<name>` from the file name. `--namespace mymod` puts textures without one in a mod's namespace; `--models` also writes what a new item or block needs: the models (`item/generated`, or `item/handheld` for an item named like a tool or weapon, such as `ruby_sword` or `iron_hammer`, so it is held diagonally; `cube_all`, `cube_column`, `cube_bottom_top`, `orientable`, `cross`), a block state, and from 1.21.4 the item definition. A particle gets its `particles/<name>.json`. A mod also needs its names in `assets/<namespace>/lang/en_us.json` (`"item.mymod.ruby_sword": "Ruby Sword"`); the pack doesn't write them, so the game shows the raw keys until the mod or the pack has them.

`node texel.mjs check-pack <folder|zip>` (`texel_check_pack`) checks any pack, not only Texel's: `pack.mcmeta` and the versions its format covers, file and namespace names the game would skip, PNGs, `.mcmeta` animations and GUI scaling, entity textures against the size of their Texel layout, models, block states, item definitions and particles that point at missing files, and textures nothing uses. Each issue has the file, a JSON path and a hint; codes are in the table below.

## Importing a picture

`node texel.mjs import picture.png --layout item --pixelize` (or `texel_import_png` with `pixelize: true`) turns concept art, a render on a white background or an HD skin into an editable spec: a flat background is removed, the subject is cropped and scaled to the layout's size (averaging, so an HD skin halves exactly), colors are reduced (`--colors`, default 16), lone specks cleaned, and `--outline auto` draws a dark 1-pixel outline like vanilla items. Mob and skin layouts are scaled whole, keeping their UVs. Then the usual import: one layer per face, palette keys `c01`… to rename.

## Patches

To change an existing spec, send only what changes. Layers are addressed by `id`, so give every layer you may revisit one (`withIds` in `/texel-core.mjs` adds `"<op>-<index>"` ids to the rest). Entries apply in order; one that can't apply (unknown id) is skipped and reported, and the others still apply.

Apply one with `node texel.mjs patch skin.json fix.json -o skin.json`, the MCP tool `texel_patch` or `window.texel.applyPatch(patch)` in the studio. They add the `<op>-<index>` ids before patching and keep them in the result, so the next patch can use the same ids.

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

UV origin of each box in the 64×64 player skin PNG (other layouts list their boxes in [Layouts](#layouts); `node texel.mjs layouts` prints them). Within a box of size w×h×d at (u, v): top `(u+d, v)`, bottom `(u+d+w, v)`, right `(u, v+d)`, front `(u+d, v+d)`, left `(u+d+w, v+d)`, back `(u+2d+w, v+d)`.

| Part | base (u, v) | overlay (u, v) |
| --- | --- | --- |
| head | 0, 0 | 32, 0 |
| body | 16, 16 | 16, 32 |
| rightArm | 40, 16 | 40, 32 |
| leftArm | 32, 48 | 48, 48 |
| rightLeg | 0, 16 | 0, 32 |
| leftLeg | 16, 48 | 0, 48 |

## Review issue codes

Every issue has a `code`, stable across releases, a `level` (error: the op or file is skipped; warning: it works but shows; info: worth a look), a JSON `path` and usually a `hint`.

<!-- codes:start -->
**Compiling a spec**

| code | meaning |
| --- | --- |
| `bad-json` | The text is not valid JSON. |
| `bad-spec` | The spec is not a JSON object. |
| `version` | "version" is missing or not 1. |
| `bad-layout` | Unknown "layout"; the spec compiles as a player skin. |
| `bad-model` | "model" is not classic or slim. |
| `model-ignored` | "model" set on a layout that is not a player skin. |
| `bad-size` | "size" is malformed, or the layout cannot take it. |
| `bad-asset` | "asset" is not a valid resource location. |
| `bad-palette` | "palette" is not an object. |
| `bad-palette-key` | A palette key has characters a key cannot have. |
| `bad-color` | A color expression does not resolve. |
| `color-guess` | A color was read as the closest valid expression. |
| `bad-legend` | A legend key is not one character, or its value is not a color. |
| `legend-reserved` | "." and "_" cannot be redefined in a legend. |
| `no-layers` | "layers" is not an array. |
| `unknown-key` | A key Texel does not know; it is ignored. |
| `bad-op` | A layer is not an object. |
| `unknown-op` | A layer's "op" is not one of the operations. |
| `missing-key` | An operation lacks a required key. |
| `bad-selector` | A target names a part, face or layer the layout does not have. |
| `bad-region` | Unknown "region", or "region" combined with y/h. |
| `region-miss` | A region covers none of the target faces. |
| `bad-number` | A number has the wrong type. |
| `out-of-range` | A number or a point is outside its range. |
| `bad-point` | A point is not [x, y] in whole numbers. |
| `bad-points` | "points" is not an array of points. |
| `bad-rows` | "rows" is not an array of strings. |
| `unknown-char` | A "pixels" row uses a character with no legend entry. |
| `clipped` | Some "pixels" fall outside the target face. |
| `bad-direction` | A gradient direction is not vertical or horizontal. |
| `bad-kind` | Unknown pattern kind. |
| `bad-colors` | "colors" is empty or too short. |
| `bad-flip` | "flip" is not h, v or hv. |
| `bad-part` | A mirror names an unknown part, or parts of different sizes. |
| `bad-layer` | A "layer" option is not base, overlay or both. |
| `bad-option` | An option is not one of its allowed values. |
| `kind-guess` | A material kind was read as the closest one. |
| `bad-source` | A symmetrize source is not left or right. |
| `op-unsupported` | The operation needs a part the layout does not have (face and hair need an 8×8×8 head). |
| `bad-gui` | "gui" scaling is malformed or its borders do not fit. |
| `gui-aspect` | The GUI scaling size has other proportions than the texture. |
| `gui-ignored` | "gui" set on a layout other than gui. |
| `animation-ignored` | "animation" set on a layout the game draws still. |
| `bad-animation` | "animation" is malformed. |
| `bad-frame` | A frame or its patch is malformed, or the patch does not apply. |

**Review**

| code | meaning |
| --- | --- |
| `empty` | The texture is fully transparent. |
| `base-transparent` | Base pixels left transparent render black in game. |
| `blank-face` | The face uses fewer than 3 colors. |
| `face-hidden` | The hat layer covers the eyes drawn on the base. |
| `hat-covers-face` | The hat layer covers the whole face. |
| `flat-surface` | Faces that are 90% one color. |
| `few-colors` | Fewer colors than good textures of the size use. |
| `unused-palette` | Palette keys no layer uses. |
| `overwritten-layer` | A layer completely painted over by later ones. |
| `tile-seam` | A tiling texture shows a seam where copies meet. |
| `animation-static` | Every frame is the same picture. |
| `frames-reused` | Repeated frames are stored once and listed by index. |

**Patches**

| code | meaning |
| --- | --- |
| `bad-patch` | The patch is not { "patch": [...] }. |
| `patch-skipped` | A patch entry could not apply (unknown id, bad shape). |

**Families**

| code | meaning |
| --- | --- |
| `bad-family` | The document is not a family. |
| `bad-base` | "base" is not a spec with layers. |
| `bad-variants` | "variants" is not an object. |
| `bad-variant` | A variant or its "patch" has the wrong shape. |
| `bad-matrix` | "matrix" is not axes of values. |
| `bad-id` | A member id or axis value has characters an id cannot have. |
| `duplicate-id` | Two members get the same id. |
| `unknown-layer-id` | enable/disable names a layer id the base does not have. |
| `variant-patch` | A variant's patch entry could not apply. |
| `family-too-large` | The matrix expands past the member limit. |
| `empty-family` | The family has no members. |

**Building a resource pack**

| code | meaning |
| --- | --- |
| `unknown-version` | No known pack format for the Minecraft version. |
| `bad-namespace` | The namespace has characters a namespace cannot have. |
| `spec-errors` | A spec with errors was left out of the pack. |
| `no-asset` | The texture has no place in a pack: set "asset". |
| `duplicate-asset` | Two textures write the same file. |
| `particle-elsewhere` | A particle outside particle/ gets no particle definition. |

**Checking a resource pack**

| code | meaning |
| --- | --- |
| `pack-mcmeta-missing` | No pack.mcmeta at the root. |
| `pack-nested` | The pack sits one folder too deep. |
| `pack-mcmeta-invalid` | pack.mcmeta has no "pack" object. |
| `pack-description-missing` | pack.mcmeta has no description. |
| `pack-format-missing` | pack.mcmeta declares no format. |
| `pack-format-invalid` | A format field has the wrong type or range. |
| `pack-format-unknown` | A format no known version uses. |
| `pack-format-legacy-missing` | Versions before 1.21.9 need pack_format. |
| `pack-format-range-missing` | 1.21.9 and later need min_format and max_format. |
| `pack-target-unknown` | The target version is not in the format table. |
| `pack-target-unsupported` | The pack's formats do not cover the target version. |
| `pack-png-invalid` | pack.png does not decode. |
| `pack-png-not-square` | pack.png is not square. |
| `junk-file` | Files the OS left (__MACOSX, .DS_Store). |
| `root-file-extra` | A root file the game does not read. |
| `file-outside-assets` | A file outside assets/<namespace>/. |
| `path-invalid` | A namespace or path character the game rejects. |
| `json-invalid` | A JSON or .mcmeta file does not parse. |
| `texture-invalid` | A texture is not a PNG that decodes. |
| `texture-unchecked` | A PNG Texel cannot decode (16-bit, interlaced, huge); only its size is checked. |
| `animation-invalid` | An .mcmeta animation field is malformed. |
| `animation-frame-out-of-range` | An animation frame index past the last frame. |
| `animation-size-mismatch` | The image is not a whole number of frames. |
| `mcmeta-without-texture` | An .mcmeta next to no texture. |
| `gui-scaling-invalid` | GUI scaling is malformed or its borders do not fit. |
| `gui-scaling-aspect` | GUI scaling proportions differ from the texture's. |
| `texture-looks-animated` | A strip of frames with no .mcmeta: the game squashes it. |
| `texture-not-power-of-two` | A block or item texture whose sides are not powers of two. |
| `entity-texture-size` | An entity texture does not fit the size of its Texel layout. |
| `model-invalid` | A model file has the wrong shape. |
| `model-parent-missing` | A model's parent is not in the pack. |
| `model-parent-cycle` | Models are each other's parents. |
| `texture-missing` | A referenced texture is not in the pack. |
| `texture-ref-unresolved` | A #variable in a model resolves to no texture. |
| `model-missing` | A referenced model is not in the pack. |
| `blockstate-invalid` | A block state file has the wrong shape. |
| `item-definition-invalid` | An item definition has the wrong shape. |
| `item-definitions-unsupported` | Item definitions in a pack for versions before 1.21.4. |
| `particle-invalid` | A particle definition has the wrong shape. |
| `texture-unused` | A texture nothing in the pack uses. |

**CLI exit codes**

| code | meaning |
| --- | --- |
| 0 | Done: no errors (warnings and info may have been printed). |
| 1 | The spec, family or pack has errors (the issues say which); outputs with errors are not written. |
| 2 | Bad usage: unknown command, missing file or bad flag (the help is printed). |
<!-- codes:end -->

Score = 100 − 25 per error − 8 per warning − 2 per info (transparent-base penalty capped at 20). Craft advice (`art.advice`: `pillow-shading`, `unshifted-shadows`, `confetti-noise`, `edge-mismatch`) never changes a score.
