import { existsSync, mkdirSync, readFileSync, watchFile, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import {
  applyPatch,
  compile,
  decodePNG,
  diffTextures,
  diffToMarkdown,
  encodePNG,
  extractPalette,
  expandFamily,
  formatSpec,
  layoutsToMarkdown,
  longShareURL,
  resolveLayout,
  PROTOCOL,
  resolveShareLink,
  renderLineup,
  renderCloseUp,
  renderSheet,
  resolveParts,
  review,
  reviewToMarkdown,
  shareURL,
  paletteToMarkdown,
  referencePalette,
  REFERENCE_MAX_SIDE,
  textureToSpec,
  withIds,
  type SkinSpec,
} from '../core';
import { openBrowser, startLive } from '../live/server';
import { SITE_ORIGIN } from '../live/site';
import { checkForUpdate, TEXEL_VERSION, updateNotice } from '../live/update';
import { usageLines } from './usage';

const HELP = `texel ${TEXEL_VERSION}: compile Texel skin specs (${PROTOCOL}) into Minecraft skins

usage:
${usageLines().join('\n')}

live   serves a preview page on this machine and re-pushes the spec on every save, so the user can
       watch while you work. Run it in the background, give the user the printed URL, then just edit
       the file. The site's studio can follow the session too, for editing.
share  prints a short link (${SITE_ORIGIN}/s/<id>): the skin in 3D with a download and an edit button.
pull   downloads the spec behind a share link (short /s/<id> or long #z= link) to keep editing it.
layouts lists the texture layouts beyond player skins (mobs, armor, capes, items, blocks) and their parts.
sheet  --focus draws only the named parts (or groups) from all six sides, large, on gray: for
       judging a face, a hood or one garment on its own.
palette reads a reference PNG (concept art, a photo, another skin) and prints its main colors with a
       role each (shadow, midtone, highlight, neutral, accent) as a ready "palette" and "legend".
patch  applies a patch ({ "patch": [{ "do": "update", "id": …, "set": … }] }) and reviews the result.
       Without -o the patched spec goes to stdout and the review to stderr.

"-" reads the spec from stdin. Exit code is 1 when the spec has errors.
Once a day the CLI checks ${SITE_ORIGIN}/version.json and says on stderr when a newer release is out
(TEXEL_NO_UPDATE_CHECK=1 turns this off).
Docs: ${SITE_ORIGIN}/llms.txt · ${SITE_ORIGIN}/docs/spec.md · ${SITE_ORIGIN}/docs/protocol.md`;

const STARTER = {
  $schema: 'https://www.texel.dev.br/schema/skinspec.v1.json',
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

function summary(text: string) {
  const r = review(compile(text));
  const count = (l: string) => r.issues.filter((i) => i.level === l).length;
  return `score ${r.score}/100, ${count('error')} errors, ${count('warning')} warnings`;
}

async function live(file: string, args: string[]) {
  const read = () => {
    try {
      const text = readFileSync(file, 'utf8');
      JSON.parse(text);
      return text;
    } catch {
      return null;
    }
  };
  const session = await startLive({ site: SITE_ORIGIN, port: Number(flag(args, '--port') ?? 4747), initial: read() ?? undefined });
  process.stdout.write(`Live session for ${file}\nOpen (and share with the user): ${session.url}\nTo edit it in the studio instead: ${session.studioUrl}\nEvery save of the file is pushed to both. Ctrl+C to stop.\n`);
  if (!existsSync(file)) process.stdout.write(`waiting for ${file} to be created…\n`);
  if (args.includes('--open')) openBrowser(session.url);
  let last = '';
  const check = () => {
    const text = read();
    if (text === null || text === last) return;
    last = text;
    session.push(text);
    process.stdout.write(`[${new Date().toLocaleTimeString()}] pushed: ${summary(text)} · ${session.clients()} viewer(s)\n`);
  };
  check();
  watchFile(file, { interval: 250 }, check);
}

async function main(argv: string[]) {
  const [cmd, file, ...rest] = argv;
  if (cmd === '--version') return void process.stdout.write(`${TEXEL_VERSION}
`);
  const update = cmd && !['help', '--help', '-h'].includes(cmd) ? await checkForUpdate(TEXEL_VERSION, { site: SITE_ORIGIN }) : null;
  if (update) process.stderr.write(`${updateNotice(update, 'cli')}

`);
  switch (cmd) {
    case 'build': {
      const result = compile(readSpec(file));
      const r = review(result);
      if (result.ok) {
        const out = flag(rest, '-o') ?? 'skin.png';
        writeFileSync(out, png(result.texture));
        process.stderr.write(`wrote ${out} (${result.texture.width}x${result.texture.height}, ${result.layout === 'player' ? result.model : result.layout})\n`);
        const sheet = flag(rest, '--sheet');
        if (sheet) {
          writeFileSync(sheet, png(renderSheet(result.texture, result.rig).image));
          process.stderr.write(`wrote ${sheet} (views | texture)\n`);
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
    case 'patch': {
      const patchFile = rest[0];
      if (!patchFile || patchFile === '-o') fail('patch needs a spec file and a patch file');
      let spec: SkinSpec, body: unknown;
      try {
        spec = JSON.parse(readSpec(file));
        body = JSON.parse(readSpec(patchFile));
      } catch (e) {
        fail(`invalid JSON: ${(e as Error).message}`);
      }
      if (!Array.isArray(spec?.layers)) fail('the first file must be a spec with a "layers" array');
      const p = applyPatch(withIds(spec), body);
      for (const i of p.issues) process.stderr.write(`${i.level}: ${i.path}: ${i.message}${i.hint ? ` (${i.hint})` : ''}\n`);
      if (p.issues.some((i) => i.level === 'error')) process.exit(1);
      const result = compile(p.spec);
      const report = `applied ${p.applied} of ${p.applied + p.issues.length} patch entries\n\n${reviewToMarkdown(review(result), { includeAscii: false })}\n`;
      const sheet = flag(rest, '--sheet');
      if (sheet) {
        writeFileSync(sheet, png(renderSheet(result.texture, result.rig).image));
        process.stderr.write(`wrote ${sheet}\n`);
      }
      const out = flag(rest, '-o');
      if (out) {
        writeFileSync(out, formatSpec(p.spec));
        process.stderr.write(`wrote ${out}\n`);
        process.stdout.write(report);
      } else {
        process.stdout.write(formatSpec(p.spec));
        process.stderr.write(report);
      }
      process.exit(result.ok ? 0 : 1);
    }
    case 'sheet': {
      const result = compile(readSpec(file));
      const out = flag(rest, '-o') ?? 'sheet.png';
      const focus = flag(rest, '--focus');
      if (focus) {
        const parts = resolveParts(result.rig, focus.split(','));
        if (!parts.ok) fail(`${parts.error}${parts.hint ? ` (${parts.hint})` : ''}`);
        writeFileSync(out, png(renderCloseUp(result.texture, result.rig, parts.parts).image));
        process.stderr.write(`wrote ${out} (${parts.parts.join(', ')}: front | back | right | left | top | bottom)\n`);
      } else {
        writeFileSync(out, png(renderSheet(result.texture, result.rig).image));
        process.stderr.write(`wrote ${out}\n`);
      }
      process.exit(result.ok ? 0 : 1);
    }
    case 'palette': {
      if (!file) fail('palette needs a PNG file');
      let image: ReturnType<typeof decodePNG>;
      try {
        image = decodePNG(readFileSync(file), (d) => inflateSync(d), { maxSide: REFERENCE_MAX_SIDE });
      } catch (e) {
        fail(`${file}: ${(e as Error).message}`);
      }
      const colors = flag(rest, '--colors');
      if (colors !== undefined && !/^\d+$/.test(colors)) fail(`--colors takes a whole number (2–32), not "${colors}"`);
      const swatches = extractPalette(image, colors === undefined ? {} : { colors: Number(colors) });
      if (!swatches.length) fail(`${file} has no opaque pixels`);
      const result = referencePalette(swatches);
      process.stdout.write(`${rest.includes('--json') ? JSON.stringify(result, null, 2) : paletteToMarkdown(result)}\n`);
      return;
    }
    case 'family': {
      const family = expandFamily(readSpec(file));
      for (const i of family.issues) process.stderr.write(`${i.level}: ${i.path}: ${i.message}${i.hint ? ` (${i.hint})` : ''}\n`);
      if (!family.ok) process.exit(1);
      const dir = flag(rest, '-o') ?? 'skins';
      mkdirSync(dir, { recursive: true });
      const built = family.members.map((m) => ({ ...m, result: compile(m.spec) }));
      const lines = [`## ${family.name}: ${built.length} members`, '', '| id | name | score | issues |', '| --- | --- | --- | --- |'];
      for (const m of built) {
        const r = review(m.result);
        writeFileSync(join(dir, `${m.id}.png`), png(m.result.texture));
        writeFileSync(join(dir, `${m.id}.skin.json`), formatSpec(m.spec));
        lines.push(`| ${m.id} | ${m.spec.name} | ${r.score} | ${r.issues.filter((i) => i.level !== 'info').map((i) => i.code).join(', ') || '-'} |`);
      }
      const lineup = flag(rest, '--lineup');
      if (lineup) writeFileSync(lineup, png(renderLineup(built.map((m) => ({ texture: m.result.texture, model: m.result.model, rig: m.result.rig })), 6)));
      process.stderr.write(`wrote ${built.length} skins to ${dir}/${lineup ? ` and ${lineup}` : ''}\n`);
      process.stdout.write(lines.join('\n') + '\n');
      process.exit(built.every((m) => m.result.ok) ? 0 : 1);
    }
    case 'import': {
      if (!file) fail('missing PNG file');
      const layout = flag(rest, '--layout');
      if (layout && !resolveLayout(layout)) fail(`unknown layout "${layout}" (see: node texel.mjs layouts)`);
      const { spec, lossy } = textureToSpec(decodePNG(readFileSync(file), (d) => inflateSync(d)), basename(file).replace(/\.png$/i, ''), layout);
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
      if (a.layout !== b.layout || a.texture.width !== b.texture.width) fail(`the specs use different layouts (${a.layout}, ${b.layout})`);
      process.stdout.write(diffToMarkdown(diffTextures(a.texture, b.texture, b.rig)) + '\n');
      return;
    }
    case 'live':
      if (!file || file === '-') fail('live needs a spec file to watch');
      return live(file, rest);
    case 'share': {
      const text = readSpec(file);
      if (!compile(text).ok) fail('the spec has errors; fix them before sharing (node texel.mjs review)');
      if (rest.includes('--long')) return void process.stdout.write(`${await longShareURL(SITE_ORIGIN, text)}\n`);
      const { url, short } = await shareURL(SITE_ORIGIN, text);
      process.stdout.write(`${url}\n`);
      if (!short) process.stderr.write('note: the share service was unreachable, so this is a long self-contained link\n');
      return;
    }
    case 'pull': {
      if (!file) fail('pull needs a share link or id');
      const text = await resolveShareLink(file, SITE_ORIGIN);
      if (!text) fail(`could not load a spec from "${file}"`);
      let formatted: string;
      try {
        formatted = formatSpec(JSON.parse(text));
      } catch {
        fail('the link did not contain a valid spec');
      }
      const out = flag(rest, '-o');
      if (out) {
        writeFileSync(out, formatted);
        process.stderr.write(`wrote ${out} (${summary(formatted)})\n`);
      } else process.stdout.write(formatted);
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
    case 'init': {
      const id = flag([file, ...rest], '--layout');
      const def = resolveLayout(id);
      if (!def) fail(`unknown layout "${id}" (see: node texel.mjs layouts)`);
      if (def.id === 'player') {
        process.stdout.write(formatSpec(STARTER));
        return;
      }
      const parts = Object.keys(def.parts);
      const starter = {
        $schema: STARTER.$schema,
        version: 1,
        name: `Starter ${def.id}`,
        layout: def.id,
        palette: { main: '#6f8f4e', dark: 'main:-18', light: 'main:12' },
        layers: [
          def.opaque ? { op: 'fill', target: 'all', color: 'main', note: `parts: ${parts.join(', ')}` } : { op: 'fill', target: parts[0], color: 'main', note: `parts: ${parts.join(', ')}; leave the rest transparent where nothing should show` },
          { op: 'noise', target: def.opaque ? 'all' : parts[0], colors: ['dark', 'light'], density: 0.2, seed: 1 },
          ...(def.parts[parts[0]].box[2] ? [{ op: 'lighting' }] : []),
        ],
      };
      process.stdout.write(formatSpec(starter as unknown as SkinSpec));
      return;
    }
    case 'layouts':
      process.stdout.write(`${layoutsToMarkdown()}\n\nSet "layout" in the spec (default "player"). Selectors use these part names, e.g. "leg.front" or "item".\n`);
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

void main(process.argv.slice(2));
