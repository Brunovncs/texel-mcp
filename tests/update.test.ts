import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { bundleCli, bundleMcp, version } from '../scripts/bundles';
import { releaseNotes } from '../scripts/release';
import { checkForUpdate, isNewer, NOTES_MAX, updateNotice } from '../src/live/update';

const site = 'https://example.test';
const release = (v: string) => ({ name: 'texel', version: v, files: { skill: `${site}/skills/minecraft-skin-design/SKILL.md`, cli: `${site}/texel.mjs`, mcp: `${site}/texel-mcp.mjs` } });
const respond = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body)));
const DAY = 24 * 60 * 60 * 1000;

describe('release check', () => {
  const env = {};
  let cacheFile = '';
  beforeAll(() => void (cacheFile = join(mkdtempSync(join(tmpdir(), 'texel-update-')), 'check.json')));

  it('compares x.y.z versions', () => {
    expect(isNewer('0.10.0', '0.9.9')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.2.9', '0.3.0')).toBe(false);
    expect(isNewer('garbage', '0.1.0')).toBe(false);
  });

  it('reports a newer release and caches it for a day', async () => {
    const fetch = respond(release('0.4.0'));
    const u = await checkForUpdate('0.3.0', { site, cacheFile, env, fetch, now: 1000 });
    expect(u).toMatchObject({ version: '0.4.0', current: '0.3.0' });
    expect(await checkForUpdate('0.3.0', { site, cacheFile, env, fetch, now: 1000 + DAY - 1 })).toMatchObject({ version: '0.4.0' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await checkForUpdate('0.4.0', { site, cacheFile, env, fetch, now: 1000 + DAY - 1 })).toBeNull();
  });

  it('asks again after a day or for another site, and keeps the last answer offline', async () => {
    const offline = vi.fn(async () => Promise.reject(new Error('offline')));
    expect(await checkForUpdate('0.3.0', { site, cacheFile, env, fetch: offline, now: 1000 + DAY })).toMatchObject({ version: '0.4.0' });
    expect(offline).toHaveBeenCalledTimes(1);
    const other = respond(release('0.3.0'));
    expect(await checkForUpdate('0.3.0', { site: 'https://other.test', cacheFile, env, fetch: other, now: 1000 + DAY })).toBeNull();
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('is skipped when disabled, in CI and for dev builds', async () => {
    const fetch = respond(release('9.0.0'));
    const fresh = () => join(mkdtempSync(join(tmpdir(), 'texel-update-')), 'check.json');
    expect(await checkForUpdate('0.3.0', { site, cacheFile: fresh(), env: { TEXEL_NO_UPDATE_CHECK: '1' }, fetch })).toBeNull();
    expect(await checkForUpdate('0.3.0', { site, cacheFile: fresh(), env: { CI: 'true' }, fetch })).toBeNull();
    expect(await checkForUpdate('0.0.0-dev', { site, cacheFile: fresh(), env, fetch })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('resolves site-relative file paths', async () => {
    const fetch = respond({ version: '9.0.0', files: { skill: '/skills/minecraft-skin-design/SKILL.md', cli: '/texel.mjs', mcp: '/texel-mcp.mjs' } });
    const u = await checkForUpdate('0.3.0', { site, cacheFile: join(mkdtempSync(join(tmpdir(), 'texel-update-')), 'check.json'), env, fetch });
    expect(u?.files).toEqual(release('9.0.0').files);
  });

  it('keeps the release notes on one line', async () => {
    const fetch = respond({ ...release('9.0.0'), notes: 'Compiler unchanged.\n\nSkill only.' });
    const u = await checkForUpdate('0.3.0', { site, cacheFile: join(mkdtempSync(join(tmpdir(), 'texel-update-')), 'check.json'), env, fetch });
    expect(u?.notes).toBe('Compiler unchanged. Skill only.');
  });

  it('marks release notes it had to cut', async () => {
    const fetch = respond({ ...release('9.0.0'), notes: 'word '.repeat(200) });
    const u = await checkForUpdate('0.3.0', { site, cacheFile: join(mkdtempSync(join(tmpdir(), 'texel-update-')), 'check.json'), env, fetch });
    expect(u?.notes?.length).toBeLessThanOrEqual(NOTES_MAX);
    expect(u?.notes?.endsWith('…')).toBe(true);
  });

  it('ignores a malformed release', async () => {
    const fetch = respond({ version: '9.0.0' });
    expect(await checkForUpdate('0.3.0', { site, cacheFile: join(mkdtempSync(join(tmpdir(), 'texel-update-')), 'check.json'), env, fetch })).toBeNull();
  });

  it('tells the agent what to replace', () => {
    const text = updateNotice({ ...release('0.4.0'), current: '0.3.0' }, 'mcp', '/tools/texel-mcp.mjs');
    expect(text).toContain('Texel 0.4.0 is available');
    expect(text).toContain('This tool call completed normally');
    expect(text).toContain(`${site}/texel-mcp.mjs → replace`);
    expect(text).toContain('SKILL.md');
    expect(text).not.toContain('What changed');
  });

  it('sends npm installs to npm instead of a download', () => {
    const mcp = updateNotice({ ...release('0.4.0'), current: '0.3.0' }, 'mcp', '/usr/lib/node_modules/texel-mcp/dist/texel-mcp.mjs');
    expect(mcp).toContain('npm install -g texel-mcp@latest');
    expect(mcp).not.toContain(`${site}/texel-mcp.mjs`);
    const cli = updateNotice({ ...release('0.4.0'), current: '0.3.0' }, 'cli', 'C:\\npm-cache\\_npx\\1a2b\\node_modules\\texel-mcp\\dist\\texel.mjs');
    expect(cli).toContain('texel-mcp@latest');
  });

  it('says what changed and that a running live needs a restart', () => {
    const text = updateNotice({ ...release('0.4.0'), notes: 'Compiler unchanged.', current: '0.3.0' }, 'cli', '/tools/texel.mjs');
    expect(text).toContain('This run completed normally; before your next Texel command');
    expect(text).toContain('What changed: Compiler unchanged.');
    expect(text).toContain('restart any running `texel.mjs live`');
  });
});

describe('release metadata', () => {
  it('keeps package.json, the plugin and the skill on one version', () => {
    const plugin = JSON.parse(readFileSync('plugin/.claude-plugin/plugin.json', 'utf8')).version;
    const skill = /^metadata:\n(?: {2}.*\n)*? {2}version: (\S+)$/m.exec(readFileSync('plugin/skills/minecraft-skin-design/SKILL.md', 'utf8').replace(/\r\n/g, '\n'))?.[1];
    expect(plugin).toBe(version);
    expect(skill).toBe(version);
  });

  it('has release notes for the current version that fit a notice', () => {
    const notes = releaseNotes(readFileSync('CHANGELOG.md', 'utf8'), version);
    expect(notes, `CHANGELOG.md needs a "## ${version}" section`).not.toBe('');
    expect(notes.length, 'installed copies show at most NOTES_MAX characters of the notes').toBeLessThanOrEqual(NOTES_MAX);
  });

  it('reads one release section of the changelog', () => {
    const md = '# Changelog\n\nIntro.\n\n## 0.2.0\n\nSecond\nline.\n\n## 0.1.0\n\nFirst.\n';
    expect(releaseNotes(md, '0.2.0')).toBe('Second line.');
    expect(releaseNotes(md, '0.1.0')).toBe('First.');
    expect(releaseNotes(md, '0.3.0')).toBe('');
  });
});

describe('installed tools', () => {
  const dir = mkdtempSync(join(tmpdir(), 'texel-'));
  let server: Server;
  let env: NodeJS.ProcessEnv = {};
  /** A fresh home per run, so one test's cached check doesn't answer for the next. */
  const home = () => {
    const h = mkdtempSync(join(tmpdir(), 'texel-home-'));
    return { ...env, HOME: h, USERPROFILE: h };
  };
  /** Async, so this process's HTTP server can answer the child's check. */
  const run = (args: string[]) =>
    new Promise<{ stdout: string; stderr: string }>((resolve) => {
      const child = spawn(process.execPath, [join(dir, 'texel.mjs'), ...args], { cwd: dir, env: home() });
      let stdout = '', stderr = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('close', () => resolve({ stdout, stderr }));
    });
  beforeAll(async () => {
    server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(req.url === '/version.json' ? JSON.stringify({ ...release('99.0.0'), notes: 'Test notes.' }) : '{}');
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const { port } = server.address() as { port: number };
    const { TEXEL_NO_UPDATE_CHECK: _off, CI: _ci, ...rest } = process.env;
    void _off, void _ci;
    env = { ...rest, TEXEL_SITE: `http://127.0.0.1:${port}` };
    writeFileSync(join(dir, 'texel.mjs'), await bundleCli());
    writeFileSync(join(dir, 'texel-mcp.mjs'), await bundleMcp());
  }, 60_000);
  afterAll(() => void server.close());

  it('the CLI prints the update steps on stderr', async () => {
    writeFileSync(join(dir, 'spec.json'), JSON.stringify({ version: 1, layers: [{ op: 'fill', target: 'all', color: '#888888' }] }));
    const review = await run(['review', 'spec.json']);
    expect(review.stderr).toContain(`Texel 99.0.0 is available (this texel.mjs is ${version})`);
    expect(review.stderr).toContain('What changed: Test notes.');
    expect(review.stdout).not.toContain('99.0.0');
    expect((await run(['--version'])).stdout.trim()).toBe(version);
  });

  it('the MCP server adds them to one tool result', async () => {
    const child = spawn(process.execPath, [join(dir, 'texel-mcp.mjs'), '--workspace', dir], { env: home(), stdio: ['pipe', 'pipe', 'inherit'] });
    let buffer = '';
    const waiting = new Map<number, (v: { result?: { content: { text?: string }[] } }) => void>();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const msg = JSON.parse(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (typeof msg.id === 'number') waiting.get(msg.id)?.(msg);
      }
    });
    let next = 0;
    const send = (method: string, params: object) => {
      const id = ++next;
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      return new Promise<{ result?: { content: { text?: string }[] } }>((resolve) => waiting.set(id, resolve));
    };
    const texts = async () => (await send('tools/call', { name: 'texel_read_docs', arguments: { page: 'protocol' } })).result?.content.map((c) => c.text ?? '').join('\n') ?? '';
    try {
      await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      await new Promise((r) => setTimeout(r, 300));
      expect(await texts()).toContain(`Texel 99.0.0 is available (this MCP server is ${version})`);
      expect(await texts()).not.toContain('99.0.0');
    } finally {
      child.kill();
    }
  }, 30_000);
});
