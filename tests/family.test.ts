import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { compile, decodePNG, diffTextures, encodePNG, expandFamily, review, textureToSpec, type SkinSpec } from '../src/core';

const base: SkinSpec = {
  version: 1,
  name: 'Base',
  palette: { primary: '#aa0000' },
  layers: [
    { op: 'fill', target: 'all', color: 'primary' },
    { op: 'fill', target: 'head.front', color: '#ffffff', id: 'badge', enabled: false },
  ],
};

describe('expandFamily', () => {
  it('builds the cartesian product of matrix axes in axis order', () => {
    const f = expandFamily({
      version: 1,
      kind: 'family',
      base,
      matrix: { team: { red: {}, blue: { palette: { primary: '#0000aa' } } }, rank: { a: {}, b: { enable: ['badge'] } } },
    });
    expect(f.ok).toBe(true);
    expect(f.members.map((m) => m.id)).toEqual(['red-a', 'red-b', 'blue-a', 'blue-b']);
    const blueB = f.members[3];
    expect(blueB.axes).toEqual({ team: 'blue', rank: 'b' });
    expect(blueB.spec.palette?.primary).toBe('#0000aa');
    expect(blueB.spec.layers[1].enabled).toBeUndefined();
    expect(f.members[0].spec.layers[1].enabled).toBe(false);
  });

  it('does not mutate the base spec', () => {
    expandFamily({ version: 1, kind: 'family', base, variants: { x: { disable: ['badge'], palette: { primary: '#000' } } } });
    expect(base.palette?.primary).toBe('#aa0000');
  });

  it('reports unknown layer ids with a suggestion', () => {
    const f = expandFamily({ version: 1, kind: 'family', base, variants: { x: { enable: ['badg'] } } });
    expect(f.ok).toBe(false);
    expect(f.issues[0]).toMatchObject({ code: 'unknown-layer-id', hint: expect.stringContaining('badge') });
  });

  it('rejects oversized matrices and bad ids', () => {
    const values = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`v${i}`, {}]));
    expect(expandFamily({ version: 1, kind: 'family', base, matrix: { a: values, b: values } }).issues[0].code).toBe('family-too-large');
    expect(expandFamily({ version: 1, kind: 'family', base, variants: { 'Bad Id': {} } }).issues[0].code).toBe('bad-id');
  });

  it('expands the bundled guild example into six valid skins', () => {
    const f = expandFamily(readFileSync('examples/families/guild.json', 'utf8'));
    expect(f.ok).toBe(true);
    expect(f.members).toHaveLength(6);
    for (const m of f.members) expect(review(compile(m.spec)).issues.filter((i) => i.level !== 'info'), m.id).toEqual([]);
  });
});

describe('PNG decode, import and diff', () => {
  it('round-trips a skin losslessly through PNG and textureToSpec', () => {
    const original = compile(readFileSync('examples/astronaut.json', 'utf8'));
    const bytes = encodePNG(original.texture, (raw) => deflateSync(raw));
    const decoded = decodePNG(bytes, (d) => inflateSync(d));
    expect(decoded.width).toBe(64);
    expect(decoded.data).toEqual(original.texture.data);
    const { spec, lossy } = textureToSpec(decoded);
    expect(lossy).toBe(false);
    expect(spec.model).toBe('slim');
    const reimported = compile(spec);
    expect(diffTextures(original.texture, reimported.texture, 'slim').changedPixels).toBe(0);
  });

  it('localizes changes to faces', () => {
    const a = compile({ version: 1, layers: [{ op: 'fill', target: 'all', color: '#333' }] });
    const b = compile({ version: 1, layers: [{ op: 'fill', target: 'all', color: '#333' }, { op: 'points', target: 'head.front', points: [[0, 0]], color: '#f00' }] });
    const d = diffTextures(a.texture, b.texture, 'classic');
    expect(d.changedPixels).toBe(1);
    expect(d.faces).toEqual([{ face: 'head.front', changed: 1, total: 64 }]);
  });
});
