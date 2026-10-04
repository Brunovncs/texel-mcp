import base from '../../content/schema/skinspec.v1.json' with { type: 'json' };
import { LAYOUT_ALIASES, LAYOUT_IDS, LAYOUTS } from './layout.js';

/**
 * The JSON Schema of a skin spec. The operations are written by hand in
 * content/schema/skinspec.v1.json; the layouts come from the registry, so the schema can't fall
 * behind a new layout. Served at /schema/skinspec.v1.json and by the MCP server.
 */
export function specSchema(): Record<string, unknown> {
  const sizes = LAYOUT_IDS.map((id) => `${id} ${LAYOUTS[id].size.join('×')}`).join(', ');
  const layout = {
    enum: [...LAYOUT_IDS, ...Object.keys(LAYOUT_ALIASES)],
    default: 'player',
    description: `Texture layout (default player, a 64×64 skin): ${sizes}. Aliases name vanilla textures that share a layout. Each layout has its own part names (see the spec reference, section Layouts).`,
  };
  return { ...base, properties: { ...base.properties, layout } };
}
