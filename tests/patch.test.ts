import { describe, expect, it } from 'vitest';
import { applyPatch, isPatch, withIds, type SkinSpec } from '../src/core';

const spec: SkinSpec = {
  version: 1,
  name: 'A',
  description: 'old',
  palette: { cloth: '#3a5bd9' },
  layers: [
    { op: 'fill', target: 'all', color: '#888888' },
    { op: 'face', id: 'face', skin: '#c08a5a', eyes: '#2244aa' },
    { op: 'rect', target: 'body.sides', region: 'belt', color: '#5b3a1f' },
  ],
};

describe('patches', () => {
  it('gives every layer an id without touching existing ones', () => {
    expect(withIds(spec).layers.map((l) => l.id)).toEqual(['fill-0', 'face', 'rect-2']);
  });

  it('applies update, add, replace, remove, palette and meta in order', () => {
    const base = withIds(spec);
    const r = applyPatch(base, {
      patch: [
        { do: 'update', id: 'face', set: { eyeStyle: 'wide', eyes: null } },
        { do: 'add', after: 'rect-2', layer: { op: 'points', target: 'body.front', points: [[3, 8]], color: 'gold' } },
        { do: 'replace', id: 'fill-0', layer: { op: 'fill', target: 'all', color: 'cloth' } },
        { do: 'remove', id: 'rect-2' },
        { do: 'palette', set: { gold: '#e3b341', cloth: null } },
        { do: 'meta', set: { description: 'new' } },
      ],
    });
    expect(r.issues).toEqual([]);
    expect(r.applied).toBe(6);
    expect(r.spec.layers.map((l) => l.op)).toEqual(['fill', 'face', 'points']);
    expect(r.spec.layers[0]).toEqual({ op: 'fill', target: 'all', color: 'cloth', id: 'fill-0' });
    expect(r.spec.layers[1]).toEqual({ op: 'face', id: 'face', skin: '#c08a5a', eyeStyle: 'wide' });
    expect(r.spec.palette).toEqual({ gold: '#e3b341' });
    expect(r.spec.description).toBe('new');
    expect(base.layers).toHaveLength(3);
  });

  it('skips entries it cannot apply and keeps the rest', () => {
    const r = applyPatch(withIds(spec), { patch: [{ do: 'remove', id: 'nope' }, { do: 'update', id: 'face', set: { mouth: 'smile' } }, { do: 'paint' }] });
    expect(r.applied).toBe(1);
    expect(r.issues.map((i) => i.code)).toEqual(['patch-skipped', 'patch-skipped']);
    expect(r.issues[0].hint).toContain('face');
  });

  it('patches the legend', () => {
    const r = applyPatch(spec, { patch: [{ do: 'legend', set: { E: '#2244aa' } }] });
    expect(r.spec.legend).toEqual({ E: '#2244aa' });
  });

  it('tells a patch from a whole spec', () => {
    expect(isPatch({ patch: [] })).toBe(true);
    expect(isPatch(spec)).toBe(false);
    expect(applyPatch(spec, spec).issues[0].code).toBe('bad-patch');
  });
});
