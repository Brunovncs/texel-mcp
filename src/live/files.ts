import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { deflateRawSync, deflateSync, inflateRawSync } from 'node:zlib';
import { type CompileResult, encodePNG, type Image, readZip, textureFiles, withSuffix, writeZip } from '../core';

/** File I/O shared by the CLI and the MCP server. */

export const png = (img: Image) => encodePNG(img, (raw) => deflateSync(raw, { level: 9 }));

/** Write through a temporary file and a rename, so a crash or a full disk never leaves half a PNG behind. */
export function writeAtomic(path: string, data: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

/**
 * Every file of a compiled texture next to `file` (a .png path): the texture itself, the other
 * files of a block (_top, _side…), animation strips and their .png.mcmeta, `_eyes`. Returns the paths.
 */
export function writeTextures(file: string, result: CompileResult, write: (path: string, data: string | Uint8Array) => string = (p, d) => (writeAtomic(p, d), p)): string[] {
  const out: string[] = [];
  for (const f of textureFiles(result)) {
    const path = withSuffix(file, f.suffix);
    out.push(write(path, png(f.image)));
    if (f.mcmeta) out.push(write(`${path}.mcmeta`, `${JSON.stringify(f.mcmeta, null, 2)}\n`));
  }
  return out;
}

/** A resource pack's files from a folder or a .zip. */
export function readPack(path: string): Map<string, Uint8Array> {
  if (statSync(path).isFile()) return readZip(new Uint8Array(readFileSync(path)), (d) => new Uint8Array(inflateRawSync(d)));
  const files = new Map<string, Uint8Array>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(relative(path, full).split('\\').join('/'), new Uint8Array(readFileSync(full)));
    }
  };
  walk(path);
  return files;
}

/** Write a pack as a .zip (when `out` ends in .zip) or into a folder. Returns what was written. */
export function writePack(out: string, files: Map<string, Uint8Array>): string {
  if (/\.zip$/i.test(out)) {
    writeAtomic(out, writeZip(files, (d) => new Uint8Array(deflateRawSync(d, { level: 9 }))));
    return out;
  }
  if (existsSync(out) && !statSync(out).isDirectory()) throw new Error(`${out} exists and is not a folder`);
  for (const [path, data] of files) writeAtomic(join(out, path), data);
  return out;
}
