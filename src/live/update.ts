import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * Release check for the downloaded CLI and MCP server. Installed copies never update themselves, so
 * they compare their version with `<site>/version.json` (at most once a day, cached in ~/.texel) and
 * tell the agent running them to re-download the tools and the skill. Silent when offline.
 */

export interface Release {
  version: string;
  /** What changed, from CHANGELOG.md. */
  notes?: string;
  files: { skill: string; cli: string; mcp: string };
}

export interface Update extends Release {
  current: string;
}

interface Cache {
  site: string;
  checkedAt: number;
  release: Release | null;
}

/** Version of this build (package.json), or a dev marker when running unbundled. */
export const TEXEL_VERSION = typeof __TEXEL_VERSION__ === 'string' ? __TEXEL_VERSION__ : '0.0.0-dev';

const DAY = 24 * 60 * 60 * 1000;
/** Longest release notes a notice shows. Copies up to 0.5.0 cut at 600 characters with no mark, so keep CHANGELOG sections under it. */
export const NOTES_MAX = 600;

const parts = (v: string) => /^(\d+)\.(\d+)\.(\d+)/.exec(v)?.slice(1).map(Number) ?? null;

/** Whether `a` is a later release than `b` (x.y.z; anything else never counts as newer). */
export function isNewer(a: string, b: string): boolean {
  const x = parts(a), y = parts(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

/** A valid release with absolute file URLs (a build without SITE_URL publishes site-relative paths). */
function asRelease(v: unknown, site: string): Release | null {
  const r = v as Partial<Release> | null;
  const f = r?.files;
  if (typeof r?.version !== 'string' || typeof f?.skill !== 'string' || typeof f.cli !== 'string' || typeof f.mcp !== 'string') return null;
  try {
    const abs = (u: string) => new URL(u, `${site}/`).href;
    const one = typeof r.notes === 'string' ? r.notes.replace(/\s+/g, ' ').trim() : '';
    const notes = one.length > NOTES_MAX ? `${one.slice(0, NOTES_MAX - 1).trimEnd()}…` : one;
    return { version: r.version, ...(notes && { notes }), files: { skill: abs(f.skill), cli: abs(f.cli), mcp: abs(f.mcp) } };
  } catch {
    return null;
  }
}

function readCache(file: string): Cache | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Cache;
  } catch {
    return null;
  }
}

function writeCache(file: string, cache: Cache) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(cache));
  } catch {
    // A read-only home only means checking again next time.
  }
}

export interface CheckOptions {
  site: string;
  cacheFile?: string;
  timeoutMs?: number;
  now?: number;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

/** The newer release, or null when up to date, unknown, offline or disabled (TEXEL_NO_UPDATE_CHECK, CI). */
export async function checkForUpdate(current: string, options: CheckOptions): Promise<Update | null> {
  const { site, cacheFile = join(homedir(), '.texel', 'update-check.json'), timeoutMs = 1500, now = Date.now(), env = process.env, fetch: get = fetch } = options;
  if (env.TEXEL_NO_UPDATE_CHECK || env.CI || !parts(current) || current.includes('-')) return null;
  const cached = readCache(cacheFile);
  let release = cached?.site === site ? cached.release : null;
  if (cached?.site !== site || !(now - cached.checkedAt < DAY)) {
    try {
      const res = await get(`${site}/version.json`, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) release = asRelease(await res.json(), site) ?? release;
    } catch {
      // Offline: keep the last known release and retry tomorrow.
    }
    writeCache(cacheFile, { site, checkedAt: now, release });
  }
  return release && isNewer(release.version, current) ? { ...release, current } : null;
}

/** Whether the running script came from an npm install or npx (it then updates through npm, not by download). */
export function installedByNpm(file: string | undefined): boolean {
  if (!file) return false;
  let real = file;
  try {
    real = realpathSync(file);
  } catch {
    // A path that no longer resolves is judged as given.
  }
  return /[\\/]node_modules[\\/]/.test(real);
}

/**
 * Instructions for the agent: what to download over what. `file` is the running script. The notice
 * comes with a finished result, so it says that result stands and the update is for the next call.
 */
export function updateNotice(u: Update, tool: 'cli' | 'mcp', file = process.argv[1]): string {
  // A copy installed by a Claude Code plugin lives in the plugin cache: the plugin updates it, skill included.
  if (file && /[\\/]\.claude[\\/]plugins[\\/]/.test(file))
    return [
      `Texel ${u.version} is available (this ${tool === 'cli' ? 'texel.mjs' : 'MCP server'} is ${u.current}). This ${tool === 'cli' ? 'run' : 'tool call'} completed normally. It came with the Texel Claude Code plugin: ask the user to update the plugin (/plugin in Claude Code) and restart, then tell them what changed:`,
      ...(u.notes ? [`What changed: ${u.notes}`] : []),
      'Set TEXEL_NO_UPDATE_CHECK=1 to turn this check off.',
    ].join('\n');
  const npm = installedByNpm(file);
  const self = npm
    ? tool === 'cli'
      ? '- run `npm install -g texel-mcp@latest` (or call it as `npx -y -p texel-mcp@latest texel-cli`), then restart any running `texel-cli live`'
      : '- run `npm install -g texel-mcp@latest`, or point the MCP config at `npx -y texel-mcp@latest`, then ask the user to restart the Texel MCP server'
    : tool === 'cli'
      ? `- ${u.files.cli} → replace ${file ? resolve(file) : 'texel.mjs'}, then restart any running \`texel.mjs live\` from the new copy`
      : `- ${u.files.mcp} → replace ${file ? resolve(file) : 'texel-mcp.mjs'}, then ask the user to restart the Texel MCP server`;
  return [
    `Texel ${u.version} is available (this ${tool === 'cli' ? 'texel.mjs' : 'MCP server'} is ${u.current}). This ${tool === 'cli' ? 'run' : 'tool call'} completed normally; before your next Texel command, update and tell the user what changed:`,
    ...(u.notes ? [`What changed: ${u.notes}`] : []),
    self,
    `- ${u.files.skill} → replace your minecraft-skin-design SKILL.md, if you use that skill`,
    'Set TEXEL_NO_UPDATE_CHECK=1 to turn this check off.',
  ].join('\n');
}
