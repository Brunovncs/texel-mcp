import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isSiteOrigin } from '../core/share';

/**
 * Live session: a tiny local HTTP server that serves its own preview page at `/` and pushes every
 * new spec over SSE (`/events`). The agent keeps working however it likes (editing a file, calling
 * MCP tools) and the person watches the skin change while they talk to the agent. The page is
 * same-origin with the stream, so no browser blocks it, and it renders with the agent's compiler.
 * The site's studio can follow the session too (`/studio/?live=<port>`) for editing. Binds to
 * 127.0.0.1 only and serves nothing but the current spec, and only to the site and local pages:
 * other origins and non-loopback Host headers (DNS rebinding) are refused.
 */

export interface LiveSession {
  port: number;
  /** The session's own preview page, on this machine. */
  url: string;
  /** The site's studio following this session, for editing. */
  studioUrl: string;
  push(spec: string): void;
  clients(): number;
  close(): Promise<void>;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

const isLoopback = (origin: string) => {
  try {
    const u = new URL(origin);
    return (u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK.has(u.hostname);
  } catch {
    return false;
  }
};

/** CORS headers for an allowed origin (the site, or a page on this machine), or null to refuse. */
export function corsFor(origin: string | undefined, host: string | undefined, site: string): Record<string, string> | null {
  if (!host || !LOOPBACK.has(host.replace(/:\d+$/, '').toLowerCase())) return null;
  if (!origin) return {};
  if (!isSiteOrigin(origin, site) && !isLoopback(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    // Chromium's Private/Local Network Access preflight for public pages reaching loopback.
    'Access-Control-Allow-Private-Network': 'true',
    Vary: 'Origin',
  };
}

const nameOf = (spec: string) => {
  try {
    const n = (JSON.parse(spec) as { name?: unknown }).name;
    return typeof n === 'string' ? n : undefined;
  } catch {
    return undefined;
  }
};

export async function startLive(opts: { site: string; port?: number; initial?: string }): Promise<LiveSession> {
  let current = opts.initial ?? '';
  const streams = new Set<ServerResponse>();
  const frame = () => `event: spec\ndata: ${JSON.stringify({ spec: current, name: nameOf(current) })}\n\n`;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? '/').split('?')[0];
    const cors = corsFor(req.headers.origin, req.headers.host, opts.site);
    if (!cors) return res.writeHead(403).end();
    if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
    if (path === '/events') {
      res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('retry: 1500\n\n');
      if (current) res.write(frame());
      streams.add(res);
      req.on('close', () => streams.delete(res));
      return;
    }
    if (path === '/spec') return res.writeHead(current ? 200 : 204, { ...cors, 'Content-Type': 'application/json' }).end(current);
    if (path === '/' && req.method === 'GET') return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(livePage(opts.site, port));
    res.writeHead(404, cors).end();
  });
  const heartbeat = setInterval(() => {
    for (const s of streams) s.write(': ping\n\n');
  }, 15000);
  heartbeat.unref();

  const port = await listen(server, opts.port ?? 4747);
  // Never keep the host process alive on our own: the CLI's file watcher or the MCP transport does that.
  server.unref();
  return {
    port,
    url: `http://127.0.0.1:${port}/`,
    studioUrl: `${opts.site}/studio/?live=${port}`,
    push(spec) {
      if (spec === current) return;
      current = spec;
      const f = frame();
      for (const s of streams) s.write(f);
    },
    clients: () => streams.size,
    close: () =>
      new Promise((resolve) => {
        clearInterval(heartbeat);
        for (const s of streams) s.end();
        server.close(() => resolve());
      }),
  };
}

/** The preview page, or (in an unbundled dev run, where it isn't injected) a pointer to the studio. */
function livePage(site: string, port: number): string {
  if (typeof __TEXEL_LIVE_HTML__ === 'string') return __TEXEL_LIVE_HTML__.replace('__TEXEL_SITE__', site.replace(/"/g, '&quot;'));
  const studio = `${site}/studio/?live=${port}`;
  return `<!doctype html><meta charset="utf-8"><title>Texel live</title><p>This build has no preview page. Follow the session in the studio: <a href="${studio}">${studio}</a></p>`;
}

/**
 * Listen on `port`, or the next free one (up to 20 tries). A failed attempt drops its 'listening'
 * handler, or it would fire on the retry's success and report the busy port (another session's).
 */
function listen(server: ReturnType<typeof createServer>, port: number, tries = 20): Promise<number> {
  return new Promise((resolve, reject) => {
    const onListening = () => {
      server.off('error', onError);
      resolve((server.address() as AddressInfo).port);
    };
    const onError = (e: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      if (e.code === 'EADDRINUSE' && tries > 1) listen(server, port + 1, tries - 1).then(resolve, reject);
      else reject(e);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

/** Open a URL in the default browser. Best effort; never throws. */
export function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd, args as string[], { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' }).unref();
  } catch {
    /* no browser available */
  }
}
