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
| `applyPatch(patch)` | Review + `{ applied, skipped }` | Apply a [spec patch](/docs/spec.md#patches) to the current spec. Layers without an id get `<op>-<index>` first. |
| `review()` | Review | `{ ok, score, art, issues, stats, ascii, next }`. |
| `reviewMarkdown()` | string | Review as markdown, with text render. |
| `validate(spec)` | Issue[] | Check a spec without loading it. |
| `setView({ yaw, pitch, overlay, animate })` | void | Pose the 3D preview for screenshots. |
| `textureDataURL()` | string | The texture PNG (64×64 for a player skin, the layout's size otherwise) as a data URL. |
| `sheetDataURL()` | string | Review sheet (front, back, right, left, texture) PNG. |
| `shareURL()` | Promise&lt;string&gt; | Short link (`/s/<id>`) that reopens this exact spec; falls back to a long `#z=` link offline. |
| `download(filename?)` | void | Save the PNG. |
| `examples()` | Promise&lt;object&gt; | The example index. |
| `loadExample(id)` | Promise&lt;Review&gt; | Load an example by id: `explorer`, `knight`, `robot`, `astronaut`, `wizard`, `cozy`, `winged-pig`, `miner-zombie`, `creeper`, `mud-pig`, `bronze-armor`, `banner-cape` or `ember-blade` (see `/examples/index.json`). |

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
| `texel_docs` | `{ page: "protocol" \| "spec" \| "art-guide" \| "families" \| "api" \| "install" }` |

## 3. URL

| URL | Effect |
| --- | --- |
| `/s/<id>` | A short share link (see *Share links*): a page with the skin in 3D, a download and an "edit in the studio" button, and a preview image at `/s/<id>.png` for link unfurls. |
| `/studio/?s=<id>` | Opens a shared skin in the studio. |
| `/studio/?live=<port>` | Follow a live session on this machine in the studio, to edit it (see *Live sessions*). |
| `/studio/#spec=<encodeURIComponent(JSON)>` | Load a spec. Easiest for agents to construct. |
| `/studio/#z=<base64url(deflate-raw(JSON))>` | Compressed form (what share links use). |
| `/studio/?example=knight` | Load an example. |
| `/studio/?view=inspect` | Screenshot mode: large 3D angles + flat sheet + score, no editor. |

Combine them: `/studio/?view=inspect#spec=...` → open, wait for `document.body.dataset.ready === "true"`, screenshot.

## 4. CLI (Node 20+, no dependencies)

```bash
curl -O https://<site>/texel.mjs
node texel.mjs init > spec.json                 # starter spec
node texel.mjs build spec.json -o skin.png --sheet sheet.png
node texel.mjs review spec.json                 # markdown + text render
node texel.mjs review spec.json --json          # machine-readable
node texel.mjs patch spec.json fix.json -o spec.json --sheet sheet.png   # apply a patch, print the review
node texel.mjs sheet spec.json -o sheet.png     # review sheet only
node texel.mjs sheet spec.json -o head.png --focus head   # close-up: some parts alone, all six sides
node texel.mjs palette reference.png --colors 12   # palette and legend from a reference PNG
node texel.mjs live spec.json --open            # live session (see below)
node texel.mjs share spec.json                  # short share link
node texel.mjs pull <link> -o spec.json         # spec behind a share link
node texel.mjs family guild.json -o skins/ --lineup lineup.png
node texel.mjs import skin.png -o spec.json     # existing PNG to an editable spec
node texel.mjs diff before.json after.json      # which faces changed
node texel.mjs format spec.json                 # canonical formatting
cat spec.json | node texel.mjs build - -o skin.png
```

Exit code `1` means the spec has errors. `patch` takes a [patch](/docs/spec.md#patches) file; without `-o` it prints the patched spec to stdout and the review to stderr. `-` reads the spec from stdin. Open `sheet.png` to look at the result (front | back | right | left | texture). `--focus` takes part or group names (`head`, `arms`, `body+legs`) and draws them alone on gray, from the front, back, sides, top and bottom; top and bottom read like face-local coordinates (back at the top). `palette` reads PNGs up to 2048×2048 and gives each color a role: `shadow`, `midtone`, `highlight`, `neutral` or `accent` (small, vivid, of a hue no larger color has).

A DOM-free ES module with the compiler is also published at `/texel-core.mjs` (`compile`, `review`, `renderSheet`, `renderCloseUp`, `extractPalette`, `referencePalette`, `encodePNG`, `formatSpec`, …).

## 5. Live sessions

A person watching the skin take shape can steer it while you work. The CLI and the MCP server run a tiny local server (127.0.0.1 only) with its own preview page, which follows every change over Server-Sent Events:

```bash
node texel.mjs live skin.json --open      # run in the background; prints http://127.0.0.1:4747/
# …edit skin.json as usual: every save appears in the person's tab
```

With MCP, call `texel_live` once; each `texel_render` is pushed to the open page. The port defaults to 4747 (the next free one is used if busy). The page is served by the same local server as the stream, so every browser shows it without prompts, and it renders with your copy of the compiler. Over SSH or in a container, forward the port and open it on the person's machine. The session also prints a studio URL (`/studio/?live=<port>`) for editing in the site's studio; Chromium-based browsers may ask once to let the site reach the local network for that one.

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
