import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { deflateSync } from 'node:zlib';
import { compile, encodePNG, LAYOUT_ALIASES, LAYOUT_IDS, renderSheet, review } from '../src/core';

/**
 * Numbers quoted in the README. Run with `npm run measure` (optionally `-- --runs 500`). Timings
 * are wall-clock medians of in-process runs after a warm-up, on whatever machine runs this.
 */
const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const RUNS = arg('--runs', 200);

const index = JSON.parse(readFileSync('examples/index.json', 'utf8')) as { examples: { id: string }[]; families: { id: string; members: number }[] };
const png = (img: Parameters<typeof encodePNG>[0]) => encodePNG(img, (raw) => deflateSync(raw, { level: 9 }));
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const time = (fn: () => void) => {
  for (let i = 0; i < 10; i++) fn();
  const t: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return median(t);
};

console.log(`machine: ${cpus()[0]?.model.trim()} (${cpus().length} threads), ${platform()} ${release()}, Node ${process.version}, ${RUNS} runs per example`);
console.log('');
console.log('| example | layout | texture | spec bytes (file) | spec bytes (minified) | approx tokens (min/4) | PNG bytes | PNG base64 chars | compile+PNG ms | full render ms | identical PNGs | sha256 (first 12) |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');

const rows: { compile: number; full: number; ratio: number }[] = [];
for (const { id } of index.examples) {
  const file = readFileSync(`examples/${id}.json`, 'utf8');
  const minified = JSON.stringify(JSON.parse(file));
  const first = compile(file);
  if (!first.ok) throw new Error(`${id} does not compile`);
  const bytes = png(first.texture);
  const hashes = new Set<string>();
  const compileMs = time(() => void hashes.add(sha(png(compile(file).texture))));
  const fullMs = time(() => {
    const r = compile(file);
    review(r);
    png(renderSheet(r.texture, r.rig).image);
    png(r.texture);
  });
  const layout = String((JSON.parse(file) as { layout?: string }).layout ?? 'player');
  rows.push({ compile: compileMs, full: fullMs, ratio: Buffer.byteLength(minified) / bytes.length });
  console.log(
    `| ${id} | ${layout} | ${first.texture.width}x${first.texture.height} | ${Buffer.byteLength(file)} | ${Buffer.byteLength(minified)} | ${Math.round(Buffer.byteLength(minified) / 4)} | ${bytes.length} | ${Buffer.from(bytes).toString('base64').length} | ${compileMs.toFixed(2)} | ${fullMs.toFixed(2)} | ${hashes.size === 1 ? `yes (${RUNS + 10} runs)` : `NO (${hashes.size} distinct)`} | ${sha(bytes).slice(0, 12)} |`,
  );
}

console.log('');
console.log(`examples: ${index.examples.length} specs + ${index.families.length} family (${index.families.map((f) => `${f.id}: ${f.members} members`).join(', ')})`);
console.log(`layouts: ${LAYOUT_IDS.length} (${LAYOUT_IDS.join(', ')}), plus ${Object.keys(LAYOUT_ALIASES).length} aliases`);
const ops = (JSON.parse(readFileSync('schema/skinspec.v1.json', 'utf8')) as { $defs: { op: { properties: { op: { enum: string[] } } } } }).$defs.op.properties.op.enum;
console.log(`ops: ${ops.length} (${ops.join(', ')})`);
console.log(`median over examples: compile+PNG ${median(rows.map((r) => r.compile)).toFixed(2)} ms, full render ${median(rows.map((r) => r.full)).toFixed(2)} ms, minified spec / PNG bytes ${median(rows.map((r) => r.ratio)).toFixed(2)}x`);
