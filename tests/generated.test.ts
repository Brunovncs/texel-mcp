import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { CLI_COMMANDS } from '../src/cli/usage';
import { compile, LAYOUT_IDS, OP_KEYS, specSchema } from '../src/core';
import { MCP_PROMPTS, MCP_TOOLS } from '../src/mcp/catalog';

const examples = readdirSync('examples')
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => ({ id: f.replace(/\.json$/, ''), spec: JSON.parse(readFileSync(`examples/${f}`, 'utf8')) }));

describe('JSON Schema', () => {
  const schema = specSchema();
  const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema);

  it('accepts every example', () => {
    for (const { id, spec } of examples) expect(validate(spec) ? [] : validate.errors, id).toEqual([]);
  });

  it('lists every layout and every op the compiler knows', () => {
    const props = schema.properties as Record<string, { enum?: string[] }>;
    expect(props.layout.enum).toEqual(expect.arrayContaining([...LAYOUT_IDS]));
    const op = (schema.$defs as Record<string, { properties: { op: { enum: string[] } } }>).op;
    expect([...op.properties.op.enum].sort()).toEqual(Object.keys(OP_KEYS).sort());
  });

  it('is the one published in schema/ (npm run build writes it)', () => {
    expect(JSON.parse(readFileSync('schema/skinspec.v1.json', 'utf8'))).toEqual(schema);
  });
});

describe('catalogs', () => {
  it('name the MCP tools and prompts the server registers', () => {
    const source = readFileSync('src/mcp/server.ts', 'utf8');
    const registered = (kind: 'Tool' | 'Prompt') => [...source.matchAll(kind === 'Tool' ? /registerTool\(\s*'(\w+)'/g : /registerPrompt\(\s*'(\w+)'/g)].map((m) => m[1]);
    expect(registered('Tool').sort()).toEqual([...MCP_TOOLS].sort());
    expect(registered('Prompt').sort()).toEqual([...MCP_PROMPTS].sort());
  });

  it('name every command the CLI handles', () => {
    const source = readFileSync('src/cli/cli.ts', 'utf8');
    const handled = [...source.matchAll(/case '([\w-]+)':/g)].map((m) => m[1]).filter((c) => !['help', '-h', '--help'].includes(c));
    expect(CLI_COMMANDS.map((c) => c.split(' ')[0]).sort()).toEqual([...new Set([...handled, '--version'])].sort());
  });
});

describe('rendering', () => {
  // The examples' textures, hashed. A change here changes what existing specs and share links render:
  // make it on purpose, say so in the changelog, and update with `npx vitest run -u`.
  it('stays the same for every example', async () => {
    const hashes = Object.fromEntries(examples.map(({ id, spec }) => [id, createHash('sha256').update(compile(spec).texture.data).digest('hex').slice(0, 16)]));
    await expect(`${JSON.stringify(hashes, null, 2)}\n`).toMatchFileSnapshot('./__snapshots__/render-hashes.json');
  });
});
