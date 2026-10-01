import { describe, expect, it } from 'vitest';
import { compile, decodeShare, encodeShare, longShareURL, review, type SkinSpec } from '../src/core';
import { startLive } from '../src/live/server';

const base = (layers: SkinSpec['layers'], extra: Partial<SkinSpec> = {}): SkinSpec => ({ version: 1, layers, ...extra });
const codes = (spec: SkinSpec) => review(compile(spec)).issues.map((i) => `${i.code}@${i.path}`);

describe('overwritten-layer', () => {
  it('flags layers that are completely painted over', () => {
    const spec = base([
      { op: 'fill', target: 'all', color: '#888888' },
      { op: 'fill', target: 'body', color: '#ff0000' },
      { op: 'fill', target: 'body', color: '#00ff00' },
    ]);
    expect(codes(spec)).toContain('overwritten-layer@$.layers[1]');
    expect(codes(spec)).not.toContain('overwritten-layer@$.layers[0]');
  });

  it('keeps layers that shade, noise or copies still show', () => {
    const spec = base([
      { op: 'fill', target: 'all', color: '#888888' },
      { op: 'fill', target: 'rightArm', color: '#3366cc' },
      { op: 'shade', target: 'rightArm', amount: -10 },
      { op: 'noise', target: 'rightArm', jitter: 3 },
      { op: 'mirror', from: 'rightArm', to: 'leftArm' },
      { op: 'fill', target: 'rightArm', color: '#000000' },
    ]);
    expect(codes(spec).filter((c) => c.startsWith('overwritten-layer'))).toEqual([]);
  });
});

describe('text render', () => {
  it('draws shaded tones with their base color char', () => {
    const r = review(compile(base([{ op: 'fill', target: 'all', color: 'cloth' }, { op: 'gradient', target: 'body.sides', from: 'cloth:+8', to: 'cloth:-8', steps: 4 }], { palette: { cloth: '#3b7dd8' }, legend: { C: 'cloth' } })));
    expect(Object.keys(r.ascii.key).sort()).toEqual(['.', 'C']);
  });
});

describe('share links', () => {
  it('round-trips the compressed payload', async () => {
    const json = JSON.stringify(base([{ op: 'fill', target: 'all', color: '#123456' }]));
    expect(await decodeShare(await encodeShare(json))).toBe(json);
    expect(await longShareURL('https://example.test', json)).toMatch(/^https:\/\/example\.test\/studio\/#z=/);
  });
});

describe('live session', () => {
  it('streams the current spec and every push to studio clients', async () => {
    const live = await startLive({ site: 'https://example.test', port: 47470, initial: '{"version":1,"layers":[]}' });
    try {
      expect(live.url).toBe(`https://example.test/studio/?live=${live.port}`);
      const res = await fetch(`http://127.0.0.1:${live.port}/events`);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let text = '';
      const until = async (needle: string) => {
        while (!text.includes(needle)) text += decoder.decode((await reader.read()).value);
      };
      await until('"layers\\":[]');
      live.push('{"version":1,"name":"Pushed","layers":[]}');
      await until('"name":"Pushed"');
      expect(live.clients()).toBe(1);
      await reader.cancel();
    } finally {
      await live.close();
    }
  });
});
