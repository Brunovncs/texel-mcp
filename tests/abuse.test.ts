import { request } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodePNG, resolveShareLink } from '../src/core';
import { startLive } from '../src/live/server';

describe('resolveShareLink', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches short links only from the site, with or without www', async () => {
    const fetch = vi.fn(async () => new Response('{"version":1,"layers":[]}'));
    vi.stubGlobal('fetch', fetch);
    expect(await resolveShareLink('https://evil.test/s/abcdefghij', 'https://example.test')).toBeNull();
    expect(await resolveShareLink('http://127.0.0.1:8080/studio/?s=abcdefghij', 'https://example.test')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(await resolveShareLink('https://www.example.test/s/abcdefghij', 'https://example.test')).toBe('{"version":1,"layers":[]}');
    expect(fetch).toHaveBeenCalledWith('https://www.example.test/api/s/?id=abcdefghij', expect.anything());
  });
});

describe('decodePNG', () => {
  it('refuses huge images before allocating or inflating anything', () => {
    const chunk = (kind: string, data: number[]) => [...[0, 0, 0, data.length], ...[...kind].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
    const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', [...be(30000), ...be(30000), 8, 6, 0, 0, 0]), ...chunk('IEND', [])]);
    const inflate = vi.fn((d: Uint8Array) => d);
    expect(() => decodePNG(png, inflate)).toThrow(/at most 512/);
    expect(inflate).not.toHaveBeenCalled();
  });
});

describe('live session origin checks', () => {
  const get = (port: number, headers: Record<string, string>) =>
    new Promise<{ status: number; origin: string | undefined }>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: '/spec', headers }, (res) => {
        res.resume();
        resolve({ status: res.statusCode ?? 0, origin: res.headers['access-control-allow-origin'] as string | undefined });
      });
      req.on('error', reject);
      req.end();
    });

  it('serves the site and local pages only, and only under a loopback Host', async () => {
    const live = await startLive({ site: 'https://www.example.test', port: 47490, initial: '{"version":1,"layers":[]}' });
    try {
      const host = `127.0.0.1:${live.port}`;
      expect(await get(live.port, { Host: host, Origin: 'https://example.test' })).toEqual({ status: 200, origin: 'https://example.test' });
      expect(await get(live.port, { Host: host, Origin: 'http://localhost:5173' })).toEqual({ status: 200, origin: 'http://localhost:5173' });
      expect(await get(live.port, { Host: host })).toEqual({ status: 200, origin: undefined });
      expect((await get(live.port, { Host: host, Origin: 'https://evil.test' })).status).toBe(403);
      // DNS rebinding: a page on evil.test that resolves to 127.0.0.1 is same-origin, so it sends its own Host.
      expect((await get(live.port, { Host: `evil.test:${live.port}` })).status).toBe(403);
    } finally {
      await live.close();
    }
  });
});
