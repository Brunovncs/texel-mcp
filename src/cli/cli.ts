import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import {
  compile,
  decodePNG,
  diffTextures,
  diffToMarkdown,
  encodePNG,
  expandFamily,
  formatSpec,
  PROTOCOL,
  renderLineup,
  renderSheet,
  review,
  reviewToMarkdown,
  textureToSpec,
} from '../core';

const HELP = `skinsmith — compile Skinsmith skin specs (${PROTOCOL}) into Minecraft skins

usage:
  node skinsmith.mjs build  <spec.json|-> [-o skin.png] [--sheet sheet.png]
  node skinsmith.mjs review <spec.json|-> [--json]
  node skinsmith.mjs sheet  <spec.json|-> [-o sheet.png]
  node skinsmith.mjs family <family.json|-> [-o out-dir] [--lineup lineup.png]
  node skinsmith.mjs import <skin.png> [-o spec.json]
  node skinsmith.mjs diff   <before.json> <after.json>
  node skinsmith.mjs format <spec.json|->
  node skinsmith.mjs init

"-" reads the spec from stdin. Exit code is 1 when the spec has errors.
Docs: /llms.txt · /docs/spec.md · /docs/protocol.md`;

const STARTER = {
  $schema: '/schema/skinspec.v1.json',
  version: 1,
  name: 'Starter',
  model: 'classic',
  palette: { skin: '#d9a066', shirt: '#2f8f83', pants: '#34457a', shoes: '#3b3b3b', hair: '#4a2f17', eye: '#2d5ba8' },
  legend: { S: 'skin', H: 'hair', W: '#ffffff', E: 'eye', M: 'skin:-25' },
  layers: [
    { op: 'fill', target: 'all', color: 'skin' },
    { op: 'fill', target: 'body', color: 'shirt' },
    { op: 'rect', target: 'arms.sides', h: 4, color: 'shirt' },
    { op: 'fill', target: 'legs', color: 'pants' },
    { op: 'rect', target: 'legs.sides', y: -2, color: 'shoes' },
    { op: 'fill', target: 'head.top+back', color: 'hair' },
    { op: 'rect', target: 'head.sides', h: 2, color: 'hair' },
    { op: 'pixels', target: 'head.front', y: 2, rows: ['H......H', '........', '.WE..EW.', '........', '..MMMM..'] },
  ],
};

function readSpec(file: string | undefined): string {
  if (!file) fail('missing spec file (use "-" for stdin)');
  return file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function fail(msg: string): never {
  process.stderr.write(`error: ${msg}\n\n${HELP}\n`);
  process.exit(2);
}

const png = (img: Parameters<typeof encodePNG>[0]) => encodePNG(img, (raw) => deflateSync(raw, { level: 9 }));

function main(argv: string[]) {
  const [cmd, file, ...rest] = argv;
  switch (cmd) {
    case 'build': {
      const result = compile(readSpec(file));
      const r = review(result);
      if (result.ok) {
        const out = flag(rest, '-o') ?? 'skin.png';
        writeFileSync(out, png(result.texture));
        process.stderr.write(`wrote ${out} (64x64, ${result.model})\n`);
        const sheet = flag(rest, '--sheet');
        if (sheet) {
          writeFileSync(sheet, png(renderSheet(result.texture, result.model).image));
          process.stderr.write(`wrote ${sheet} (front | back | right | left | texture)\n`);
        }
      }
      process.stdout.write(reviewToMarkdown(r, { includeAscii: false }) + '\n');
      process.exit(result.ok ? 0 : 1);
    }
    case 'review': {
      const result = compile(readSpec(file));
      const r = review(result);
      process.stdout.write(rest.includes('--json') ? JSON.stringify(r, null, 2) + '\n' : reviewToMarkdown(r) + '\n');
      process.exit(result.ok ? 0 : 1);
    }
    case 'sheet': {
      const result = compile(readSpec(file));
      const out = flag(rest, '-o') ?? 'sheet.png';
      writeFileSync(out, png(renderSheet(result.texture, result.model).image));
      process.stderr.write(`wrote ${out}\n`);
      process.exit(result.ok ? 0 : 1);
    }
    case 'family': {
      const family = expandFamily(readSpec(file));
      for (const i of family.issues) process.stderr.write(`${i.level}: ${i.path}: ${i.message}${i.hint ? ` (${i.hint})` : ''}\n`);
      if (!family.ok) process.exit(1);
      const dir = flag(rest, '-o') ?? 'skins';
      mkdirSync(dir, { recursive: true });
      const built = family.members.map((m) => ({ ...m, result: compile(m.spec) }));
      const lines = [`## ${family.name} — ${built.length} members`, '', '| id | name | score | issues |', '| --- | --- | --- | --- |'];
      for (const m of built) {
        const r = review(m.result);
        writeFileSync(join(dir, `${m.id}.png`), png(m.result.texture));
        writeFileSync(join(dir, `${m.id}.skin.json`), formatSpec(m.spec));
        lines.push(`| ${m.id} | ${m.spec.name} | ${r.score} | ${r.issues.filter((i) => i.level !== 'info').map((i) => i.code).join(', ') || '—'} |`);
      }
      const lineup = flag(rest, '--lineup');
      if (lineup) writeFileSync(lineup, png(renderLineup(built.map((m) => ({ texture: m.result.texture, model: m.result.model })), 6)));
      process.stderr.write(`wrote ${built.length} skins to ${dir}/${lineup ? ` and ${lineup}` : ''}\n`);
      process.stdout.write(lines.join('\n') + '\n');
      process.exit(built.every((m) => m.result.ok) ? 0 : 1);
    }
    case 'import': {
      if (!file) fail('missing PNG file');
      const { spec, lossy } = textureToSpec(decodePNG(readFileSync(file), (d) => inflateSync(d)), basename(file).replace(/\.png$/i, ''));
      const out = flag(rest, '-o');
      if (out) writeFileSync(out, formatSpec(spec));
      else process.stdout.write(formatSpec(spec));
      if (lossy) process.stderr.write('note: colors were quantized to fit the legend alphabet\n');
      return;
    }
    case 'diff': {
      const other = rest[0];
      if (!other) fail('diff needs two spec files');
      const a = compile(readSpec(file)), b = compile(readSpec(other));
      process.stdout.write(diffToMarkdown(diffTextures(a.texture, b.texture, b.model)) + '\n');
      return;
    }
    case 'format': {
      const text = readSpec(file);
      try {
        process.stdout.write(formatSpec(JSON.parse(text)));
      } catch (e) {
        fail(`invalid JSON: ${(e as Error).message}`);
      }
      return;
    }
    case 'init':
      process.stdout.write(formatSpec(STARTER));
      return;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(HELP + '\n');
      return;
    default:
      fail(`unknown command "${cmd}"`);
  }
}

main(process.argv.slice(2));
