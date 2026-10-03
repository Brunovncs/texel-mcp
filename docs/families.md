# Skin families

> Generate many related skins (teams, factions, rarity tiers, colorways) from one base spec and a few variants. One file, dozens of consistent skins.

A **family** is a document with `"kind": "family"`, a `base` skin spec, and members defined by `variants` (explicit list), a `matrix` (cartesian product of axes), or both.

```json
{
  "version": 1,
  "kind": "family",
  "name": "Guild uniforms",
  "base": { "version": 1, "palette": { "primary": "#9b2f2f", "trim": "#e0a940" }, "layers": [ ... ] },
  "matrix": {
    "guild": {
      "ember": { "palette": { "primary": "#9b2f2f" } },
      "tide":  { "palette": { "primary": "#2c5d9b" } }
    },
    "rank": {
      "recruit": { "disable": ["trim"] },
      "captain": { "enable": ["cape", "insignia"] }
    }
  }
}
```

This expands to four members: `ember-recruit`, `ember-captain`, `tide-recruit`, `tide-captain`. See the complete [guild example](/examples/families/guild.json).

## Variant patches

Every variant (and every matrix axis value) is a patch applied to a copy of the base. This is a smaller format than a [spec patch](/docs/spec.md#patches) (`{ "patch": [{ "do": … }] }`): it can recolor, toggle layers by id and append layers, but it can't change or remove a base layer.

| Key | Effect |
| --- | --- |
| `palette` | Merged over the base palette. The main way to recolor. |
| `legend` | Merged over the base legend. |
| `enable` | Layer ids to switch on (removes `enabled: false`). |
| `disable` | Layer ids to switch off. |
| `layers` | Layers appended after the base layers. |
| `model` | Override `classic` / `slim`. |
| `name`, `description`, `tags` | Member metadata. |

Matrix patches are applied in axis order, so later axes win on conflicts.

## Designing a good family

1. **Perfect the base first.** Render it alone until it passes the rubric; every flaw is multiplied by the member count.
2. **Name colors by role, not hue.** `primary`, `secondary`, `trim`, `accent`, so variants only swap values. Derive shades from them (`"primaryDark": "primary:-12"`) and the whole ramp follows.
3. **Optional details get ids.** Capes, badges, helmets, rank stripes: add them to the base with `"enabled": false` and an `id`, then `enable` them per variant. Several layers can share one id and toggle together.
4. **Distinguishable at a glance.** Check the lineup: members should differ in value or silhouette, not just hue.
5. **Member ids** are lowercase letters, digits and `-`. Matrix ids join axis values with `-`. The limit is 256 members.

## Rendering families

| Interface | How |
| --- | --- |
| MCP | `texel_render_family` (lineup image + score table), `texel_save_family` |
| CLI | `node texel.mjs family guild.json -o skins/ --lineup lineup.png` |

The **lineup** shows each member's front and back, in expansion order (variants first, then matrix combinations).
