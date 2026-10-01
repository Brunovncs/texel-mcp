# Agent interfaces

> Four ways to render a Skinsmith spec — browser JavaScript API, WebMCP tools, URL, and a zero-dependency Node CLI. All share the same deterministic compiler.

## 1. Browser: `window.skinsmith`

Open `/studio/`. Every method is synchronous unless noted and returns plain JSON-serializable data.

| Method | Returns | Notes |
| --- | --- | --- |
| `help()` | string | Quick reference (markdown). |
| `getSpec()` | object | Current spec. |
| `setSpec(spec)` | Review | Replace the spec (object or JSON string), render, return the review. |
| `addLayers(layers, index?)` | Review | Insert layers (default: append). |
| `updateLayer(idOrIndex, patch)` | Review | Shallow-merge `patch` into one layer. |
| `removeLayer(idOrIndex)` | Review | Delete a layer. |
| `toggleLayer(idOrIndex, enabled?)` | Review | Enable/disable without deleting. |
| `setPalette(patch)` | Review | Merge palette entries (`null` deletes a key). |
| `review()` | Review | `{ ok, score, issues, stats, ascii, next }`. |
| `reviewMarkdown()` | string | Review as markdown, with text render. |
| `validate(spec)` | Issue[] | Check a spec without loading it. |
| `setView({ yaw, pitch, overlay, animate })` | void | Pose the 3D preview for screenshots. |
| `textureDataURL()` | string | The 64×64 skin PNG as a data URL. |
| `sheetDataURL()` | string | Review sheet (front, back, right, left, texture) PNG. |
| `shareURL()` | Promise&lt;string&gt; | Compressed link that reopens this exact spec. |
| `download(filename?)` | void | Save the PNG. |
| `examples()` | Promise&lt;object&gt; | The example index. |
| `loadExample(id)` | Promise&lt;Review&gt; | Load `explorer`, `knight`, `robot`, `astronaut`. |

```js
const r = skinsmith.setSpec(mySpec);
if (!r.ok) console.log(r.issues);
skinsmith.updateLayer('eyes', { rows: ['SWESSEWS'] });
skinsmith.setView({ yaw: -30, pitch: -10 });   // then screenshot
skinsmith.download('ranger.png');
```

The studio also exposes stable DOM hooks: `#spec-input` (the JSON textarea), `#preview-3d`, `#review-sheet`, `#review-json` (a `<script type="application/json">` kept in sync with the latest review), and `[data-action]` buttons.

## 2. WebMCP tools

On browsers that implement [WebMCP](https://github.com/webmachinelearning/webmcp) (`navigator.modelContext`), the studio registers tools with the same semantics:

| Tool | Input |
| --- | --- |
| `skinsmith_get_spec` | — |
| `skinsmith_set_spec` | `{ spec }` |
| `skinsmith_patch_layers` | `{ add?, update?: [{ ref, patch }], remove?: [ref] }` |
| `skinsmith_review` | `{ format?: "json" \| "markdown" }` |
| `skinsmith_set_view` | `{ yaw?, pitch?, overlay?, animate? }` |
| `skinsmith_share_url` | — |
| `skinsmith_docs` | `{ page: "protocol" \| "spec" \| "art-guide" \| "api" }` |

## 3. URL

| URL | Effect |
| --- | --- |
| `/studio/#spec=<encodeURIComponent(JSON)>` | Load a spec. Easiest for agents to construct. |
| `/studio/#z=<base64url(deflate-raw(JSON))>` | Compressed form (what share links use). |
| `/studio/?example=knight` | Load an example. |
| `/studio/?view=inspect` | Screenshot mode: large 3D angles + flat sheet + score, no editor. |

Combine them: `/studio/?view=inspect#spec=...` → open, wait for `document.body.dataset.ready === "true"`, screenshot.

## 4. CLI (Node 18+, no dependencies)

```bash
curl -O https://<site>/skinsmith.mjs
node skinsmith.mjs init > spec.json                 # starter spec
node skinsmith.mjs build spec.json -o skin.png --sheet sheet.png
node skinsmith.mjs review spec.json                 # markdown + text render
node skinsmith.mjs review spec.json --json          # machine-readable
cat spec.json | node skinsmith.mjs build - -o skin.png
```

Exit code `1` means the spec has errors. Open `sheet.png` to look at the result (front | back | right | left | texture).

A DOM-free ES module with the compiler is also published at `/skinsmith-core.mjs` (`compile`, `review`, `renderSheet`, `encodePNG`, `formatSpec`, …).

## 5. Machine-readable manifest

`/protocol.json` lists every resource, interface and tool above in JSON.
