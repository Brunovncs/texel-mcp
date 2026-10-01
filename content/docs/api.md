# Agent interfaces

> Four ways to render a Texel spec: browser JavaScript API, WebMCP tools, URL, and a zero-dependency Node CLI. All share the same deterministic compiler. Plus live sessions (the person watches while the agent works) and short share links.

## 1. Browser: `window.texel`

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
| `shareURL()` | Promise&lt;string&gt; | Short link (`/s/<id>`) that reopens this exact spec; falls back to a long `#z=` link offline. |
| `download(filename?)` | void | Save the PNG. |
| `examples()` | Promise&lt;object&gt; | The example index. |
| `loadExample(id)` | Promise&lt;Review&gt; | Load `explorer`, `knight`, `robot`, `astronaut`. |

```js
const r = texel.setSpec(mySpec);
if (!r.ok) console.log(r.issues);
texel.updateLayer('eyes', { rows: ['SWESSEWS'] });
texel.setView({ yaw: -30, pitch: -10 });   // then screenshot
texel.download('ranger.png');
```

The studio also exposes stable DOM hooks: `#spec-input` (the JSON textarea), `#preview-3d`, `#review-sheet`, `#review-json` (a `<script type="application/json">` kept in sync with the latest review), and `[data-action]` buttons.

## 2. WebMCP tools

On browsers that implement [WebMCP](https://github.com/webmachinelearning/webmcp) (`navigator.modelContext`), the studio registers tools with the same semantics:

| Tool | Input |
| --- | --- |
| `texel_get_spec` | none |
| `texel_set_spec` | `{ spec }` |
| `texel_patch_layers` | `{ add?, update?: [{ ref, patch }], remove?: [ref] }` |
| `texel_review` | `{ format?: "json" \| "markdown" }` |
| `texel_set_view` | `{ yaw?, pitch?, overlay?, animate? }` |
| `texel_share_url` | none |
| `texel_docs` | `{ page: "protocol" \| "spec" \| "art-guide" \| "api" }` |

## 3. URL

| URL | Effect |
| --- | --- |
| `/s/<id>` | A short share link (see *Share links*). |
| `/studio/?live=<port>` | Follow a live session on this machine (see *Live sessions*). |
| `/studio/#spec=<encodeURIComponent(JSON)>` | Load a spec. Easiest for agents to construct. |
| `/studio/#z=<base64url(deflate-raw(JSON))>` | Compressed form (what share links use). |
| `/studio/?example=knight` | Load an example. |
| `/studio/?view=inspect` | Screenshot mode: large 3D angles + flat sheet + score, no editor. |

Combine them: `/studio/?view=inspect#spec=...` → open, wait for `document.body.dataset.ready === "true"`, screenshot.

## 4. CLI (Node 18+, no dependencies)

```bash
curl -O https://<site>/texel.mjs
node texel.mjs init > spec.json                 # starter spec
node texel.mjs build spec.json -o skin.png --sheet sheet.png
node texel.mjs review spec.json                 # markdown + text render
node texel.mjs review spec.json --json          # machine-readable
node texel.mjs live spec.json --open            # live session (see below)
node texel.mjs share spec.json                  # short share link
node texel.mjs pull <link> -o spec.json         # spec behind a share link
cat spec.json | node texel.mjs build - -o skin.png
```

Exit code `1` means the spec has errors. Open `sheet.png` to look at the result (front | back | right | left | texture).

A DOM-free ES module with the compiler is also published at `/texel-core.mjs` (`compile`, `review`, `renderSheet`, `encodePNG`, `formatSpec`, …).

## 5. Live sessions

A person watching the skin take shape can steer it while you work. The CLI and the MCP server run a tiny local server (127.0.0.1 only) that the studio follows over Server-Sent Events:

```bash
node texel.mjs live skin.json --open      # run in the background; prints https://<site>/studio/?live=4747
# …edit skin.json as usual: every save appears in the person's tab
```

With MCP, call `texel_live` once; each `texel_render` is pushed to the open tab. The port defaults to 4747 (the next free one is used if busy). Chromium-based browsers may ask once to allow the page to reach the local network: that is the studio connecting to `127.0.0.1`.

## 6. Share links

`node texel.mjs share skin.json`, the MCP tool `texel_share` and `texel.shareURL()` store the spec and return `https://<site>/s/<id>`. The id is a hash of the spec, so the same spec always gets the same link and a link never changes. Raw API:

| Request | Response |
| --- | --- |
| `POST /api/s/` with the spec JSON as the body (≤ 48 KB) | `201 { id, url }` |
| `GET /api/s/?id=<id>` | The spec JSON |

When the service is unreachable every interface falls back to the long, self-contained `/studio/#z=` link (`share --long` forces it).

To keep developing a shared skin, `node texel.mjs pull <link> -o skin.json` (MCP: `texel_pull`) turns any link back into its spec. The studio's *Keep working on it with an agent* box writes a ready-made prompt for that: the skin's link plus what should change.

## 7. Machine-readable manifest

`/protocol.json` lists every resource, interface and tool above in JSON.
