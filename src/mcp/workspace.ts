import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

/**
 * All file writes are confined to one directory: $SKINSMITH_WORKSPACE, or the server's working
 * directory. Paths that resolve outside it are rejected rather than normalized.
 */
export class Workspace {
  readonly root: string;

  constructor(root = process.env.SKINSMITH_WORKSPACE ?? process.cwd()) {
    this.root = resolve(root);
  }

  resolve(path: string): string {
    const full = isAbsolute(path) ? resolve(path) : resolve(this.root, path);
    const rel = relative(this.root, full);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`path "${path}" is outside the workspace (${this.root}); set SKINSMITH_WORKSPACE to change it`);
    return full;
  }

  write(path: string, data: string | Uint8Array): string {
    const full = this.resolve(path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, data);
    return full;
  }

  display(full: string): string {
    return relative(this.root, full) || '.';
  }
}
