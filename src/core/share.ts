/**
 * Share links, usable from browsers and Node 18+ alike (fetch, CompressionStream, btoa).
 *
 * - Short: `<site>/s/<id>`, the spec stored server-side under a content hash.
 * - Long:  `<site>/studio/#z=<base64url(deflate-raw(JSON))>`, works offline and without the server.
 */

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Compact JSON → deflate-raw → base64url, the payload of `#z=` links. */
export async function encodeShare(json: string): Promise<string> {
  const compact = JSON.stringify(JSON.parse(json));
  return toBase64Url(await pipe(new TextEncoder().encode(compact), new CompressionStream('deflate-raw')));
}

export async function decodeShare(z: string): Promise<string> {
  return new TextDecoder().decode(await pipe(fromBase64Url(z), new DecompressionStream('deflate-raw')));
}

export async function longShareURL(site: string, json: string): Promise<string> {
  try {
    return `${site}/studio/#z=${await encodeShare(json)}`;
  } catch {
    return `${site}/studio/#spec=${encodeURIComponent(json)}`;
  }
}

/** Store the spec on the site and return its short link, or null when the service is unreachable. */
export async function shortShareURL(site: string, json: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const res = await fetch(`${site}/api/s/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(JSON.parse(json)),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const { url } = (await res.json()) as { url?: unknown };
    return typeof url === 'string' ? url : null;
  } catch {
    return null;
  }
}

/** Short link when possible, long link otherwise. */
export async function shareURL(site: string, json: string): Promise<{ url: string; short: boolean }> {
  const short = await shortShareURL(site, json);
  return short ? { url: short, short: true } : { url: await longShareURL(site, json), short: false };
}

/** Load a short-link spec by id. */
export async function fetchSharedSpec(site: string, id: string): Promise<string | null> {
  try {
    const res = await fetch(`${site}/api/s/?id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(8000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}
