import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { isSiteOrigin } from '../core/share';

/**
 * Live session: a tiny local HTTP server the studio follows over SSE (`/studio/?live=<port>`).
 * The agent keeps working however it likes (editing a file, calling MCP tools); every new spec is
 * pushed to open studio tabs so the person can watch the skin change while they talk to the agent.
 * Binds to 127.0.0.1 only and serves nothing but the current spec, and only to the site and local
 * pages: other origins and non-loopback Host headers (DNS rebinding) are refused.
 */

export interface LiveSession {
  port: number;
  /** Studio URL that follows this session. */
  url: string;
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
    url: `${opts.site}/studio/?live=${port}`,
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

/** Listen on `port`, or the next free one (up to 20 tries). */
function listen(server: ReturnType<typeof createServer>, port: number, tries = 20): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE' && tries > 1) listen(server, port + 1, tries - 1).then(resolve, reject);
      else reject(e);
    };
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', onError);
      resolve(port);
    });
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
