/** Names of the MCP server's tools and prompts, for the docs and protocol.json; a test keeps them equal to what the server registers. */
export const MCP_TOOLS = [
  'texel_render',
  'texel_patch',
  'texel_validate',
  'texel_save',
  'texel_live',
  'texel_share',
  'texel_pull',
  'texel_render_family',
  'texel_save_family',
  'texel_import_png',
  'texel_palette',
  'texel_pack',
  'texel_check_pack',
  'texel_diff',
  'texel_get_example',
  'texel_read_docs',
] as const;

export const MCP_PROMPTS = ['design_skin', 'design_texture', 'continue_skin', 'design_family', 'critique_skin'] as const;
