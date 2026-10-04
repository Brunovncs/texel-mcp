/** Every CLI command with its arguments: the help text and protocol.json both read this list. */
export const CLI_COMMANDS: readonly string[] = [
  'live <spec.json> [--port 4747] [--open]',
  'build <spec.json|-> [-o skin.png] [--sheet sheet.png]',
  'review <spec.json|-> [--json]',
  'patch <spec.json|-> <patch.json> [-o patched.json] [--sheet sheet.png]',
  'sheet <spec.json|-> [-o sheet.png] [--focus head,arms]',
  'palette <image.png> [--colors 12] [--json]',
  'family <family.json|-> [-o out-dir] [--lineup lineup.png]',
  'import <texture.png> [-o spec.json] [--layout zombie]',
  'diff <before.json> <after.json>',
  'share <spec.json|-> [--long]',
  'pull <link|id> [-o skin.json]',
  'format <spec.json|->',
  'layouts',
  'init [--layout player|zombie|skeleton|creeper|cape|item|…]',
  '--version',
];

/** The usage block of the help text, command names aligned. */
export function usageLines(): string[] {
  const width = Math.max(...CLI_COMMANDS.map((c) => c.split(' ')[0].length));
  return CLI_COMMANDS.map((c) => {
    const [name, ...args] = c.split(' ');
    return `  node texel.mjs ${args.length ? `${name.padEnd(width)} ${args.join(' ')}` : name}`;
  });
}
