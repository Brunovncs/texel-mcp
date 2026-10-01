/**
 * Stable, diff-friendly JSON formatting for specs: short objects and number arrays stay on one
 * line, "rows" pixel grids get one row per line so they read like pixel art.
 */
export function formatSpec(value: unknown): string {
  return fmt(value, '', null) + '\n';
}

const MAX_INLINE = 96;

function fmt(v: unknown, indent: string, key: string | null): string {
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    const inline = `[${v.map((x) => fmt(x, '', null)).join(', ')}]`;
    const forceBlock = key === 'rows' || key === 'layers';
    if (!forceBlock && inline.length + indent.length <= MAX_INLINE && !inline.includes('\n')) return inline;
    const inner = indent + '  ';
    return `[\n${v.map((x) => inner + fmt(x, inner, null)).join(',\n')}\n${indent}]`;
  }
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    if (entries.length === 0) return '{}';
    const inline = `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${fmt(x, '', k)}`).join(', ')} }`;
    const hasBlockChild = entries.some(([k]) => k === 'rows' || k === 'layers' || k === 'palette' || k === 'legend');
    if (!hasBlockChild && inline.length + indent.length <= MAX_INLINE && !inline.includes('\n')) return inline;
    const inner = indent + '  ';
    return `{\n${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${fmt(x, inner, k)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(v);
}
