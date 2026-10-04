import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { bundleCli, bundleMcp } from '../scripts/bundles';

const dir = mkdtempSync(join(tmpdir(), 'texel-'));
const spec = {
  version: 1,
  name: 'Patched',
  palette: { cloth: '#3a5bd9' },
  layers: [
    { op: 'fill', target: 'all', color: '#888888' },
    { op: 'fill', id: 'shirt', target: 'body', color: 'cloth' },
  ],
};
const patch = { patch: [{ do: 'update', id: 'shirt', set: { color: '#aa3333' } }, { do: 'remove', id: 'nope' }] };

describe('cli patch', () => {
  let cli = '';
  beforeAll(async () => {
    cli = join(dir, 'texel.mjs');
    writeFileSync(cli, await bundleCli());
    writeFileSync(join(dir, 'spec.json'), JSON.stringify(spec));
    writeFileSync(join(dir, 'patch.json'), JSON.stringify(patch));
  }, 60_000);

  it('applies a patch, writes the spec and prints the review', () => {
    const run = spawnSync(process.execPath, [cli, 'patch', 'spec.json', 'patch.json', '-o', 'out.json'], { cwd: dir, encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('applied 1 of 2 patch entries');
    expect(run.stderr).toContain('no layer with id "nope"');
    const out = JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8'));
    expect(out.layers.map((l: { id: string }) => l.id)).toEqual(['fill-0', 'shirt']);
    expect(out.layers[1].color).toBe('#aa3333');
  });

  it('prints the patched spec to stdout without -o', () => {
    const run = spawnSync(process.execPath, [cli, 'patch', 'spec.json', 'patch.json'], { cwd: dir, encoding: 'utf8' });
    expect(JSON.parse(run.stdout).layers[1].color).toBe('#aa3333');
    expect(run.stderr).toContain('score');
  });

  it('rejects something that is not a patch', () => {
    const run = spawnSync(process.execPath, [cli, 'patch', 'spec.json', 'spec.json'], { cwd: dir, encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('patch');
  });
});

describe('mcp texel_patch', () => {
  let server = '';
  beforeAll(async () => {
    server = join(dir, 'texel-mcp.mjs');
    writeFileSync(server, await bundleMcp());
  }, 60_000);

  it('patches a spec and returns the review', async () => {
    const child = spawn(process.execPath, [server, '--workspace', dir], { stdio: ['pipe', 'pipe', 'inherit'] });
    let buffer = '';
    const waiting = new Map<number, (v: { result?: Record<string, unknown>; error?: unknown }) => void>();
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
      return new Promise<{ result?: Record<string, unknown>; error?: unknown }>((resolve) => waiting.set(id, resolve));
    };
    try {
      await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      const tools = await send('tools/list', {});
      expect((tools.result?.tools as { name: string }[]).map((t) => t.name)).toContain('texel_patch');
      const call = await send('tools/call', { name: 'texel_patch', arguments: { spec, patch, include: [] } });
      const out = call.result?.structuredContent as { applied: number; skipped: { code: string }[]; spec: typeof spec; ok: boolean };
      expect(call.result?.isError).toBeFalsy();
      expect(out.applied).toBe(1);
      expect(out.skipped.map((i) => i.code)).toEqual(['patch-skipped']);
      expect(out.spec.layers[1].color).toBe('#aa3333');
      expect(out.ok).toBe(true);
      const bad = await send('tools/call', { name: 'texel_patch', arguments: { spec, patch: { layers: [] } } });
      expect(bad.result?.isError).toBe(true);

      // A workspace file instead of an inline spec: patched in place, the reply carries no spec.
      writeFileSync(join(dir, 'knight.json'), JSON.stringify(spec));
      const onFile = await send('tools/call', { name: 'texel_patch', arguments: { file: 'knight.json', patch, include: [] } });
      const fileOut = onFile.result?.structuredContent as { file?: string; spec?: unknown; applied: number };
      expect(onFile.result?.isError).toBeFalsy();
      expect(fileOut).toMatchObject({ file: 'knight.json', applied: 1 });
      expect(fileOut.spec).toBeUndefined();
      expect(JSON.parse(readFileSync(join(dir, 'knight.json'), 'utf8')).layers[1].color).toBe('#aa3333');
      const rendered = await send('tools/call', { name: 'texel_render', arguments: { file: 'knight.json', include: [] } });
      expect(rendered.result?.isError).toBeFalsy();
      const both = await send('tools/call', { name: 'texel_render', arguments: { spec, file: 'knight.json' } });
      expect(both.result?.isError).toBe(true);
    } finally {
      child.kill();
    }
  }, 30_000);
});
