/**
 * Every issue code Texel reports, with where it comes from and what it means. Codes are stable:
 * a script or an agent can match on them across releases. A test keeps this list equal to the codes
 * the source can emit, so a new check can't ship without an entry. The level (error, warning,
 * info) is on each issue; a few codes are reported at more than one level.
 */
export type IssueSource = 'spec' | 'review' | 'patch' | 'family' | 'pack' | 'pack-check';

export const ISSUE_CODES: Readonly<Record<string, { source: IssueSource; meaning: string }>> = {
  // Compiling a spec
  'bad-json': { source: 'spec', meaning: 'The text is not valid JSON.' },
  'bad-spec': { source: 'spec', meaning: 'The spec is not a JSON object.' },
  version: { source: 'spec', meaning: '"version" is missing or not 1.' },
  'bad-layout': { source: 'spec', meaning: 'Unknown "layout"; the spec compiles as a player skin.' },
  'bad-model': { source: 'spec', meaning: '"model" is not classic or slim.' },
  'model-ignored': { source: 'spec', meaning: '"model" set on a layout that is not a player skin.' },
  'bad-size': { source: 'spec', meaning: '"size" is malformed, or the layout cannot take it.' },
  'bad-asset': { source: 'spec', meaning: '"asset" is not a valid resource location.' },
  'bad-palette': { source: 'spec', meaning: '"palette" is not an object.' },
  'bad-palette-key': { source: 'spec', meaning: 'A palette key has characters a key cannot have.' },
  'bad-color': { source: 'spec', meaning: 'A color expression does not resolve.' },
  'color-guess': { source: 'spec', meaning: 'A color was read as the closest valid expression.' },
  'bad-legend': { source: 'spec', meaning: 'A legend key is not one character, or its value is not a color.' },
  'legend-reserved': { source: 'spec', meaning: '"." and "_" cannot be redefined in a legend.' },
  'no-layers': { source: 'spec', meaning: '"layers" is not an array.' },
  'unknown-key': { source: 'spec', meaning: 'A key Texel does not know; it is ignored.' },
  'bad-op': { source: 'spec', meaning: 'A layer is not an object.' },
  'unknown-op': { source: 'spec', meaning: 'A layer\'s "op" is not one of the operations.' },
  'missing-key': { source: 'spec', meaning: 'An operation lacks a required key.' },
  'bad-selector': { source: 'spec', meaning: 'A target names a part, face or layer the layout does not have.' },
  'bad-region': { source: 'spec', meaning: 'Unknown "region", or "region" combined with y/h.' },
  'region-miss': { source: 'spec', meaning: 'A region covers none of the target faces.' },
  'bad-number': { source: 'spec', meaning: 'A number has the wrong type.' },
  'out-of-range': { source: 'spec', meaning: 'A number or a point is outside its range.' },
  'bad-point': { source: 'spec', meaning: 'A point is not [x, y] in whole numbers.' },
  'bad-points': { source: 'spec', meaning: '"points" is not an array of points.' },
  'bad-rows': { source: 'spec', meaning: '"rows" is not an array of strings.' },
  'unknown-char': { source: 'spec', meaning: 'A "pixels" row uses a character with no legend entry.' },
  clipped: { source: 'spec', meaning: 'Some "pixels" fall outside the target face.' },
  'bad-direction': { source: 'spec', meaning: 'A gradient direction is not vertical or horizontal.' },
  'bad-kind': { source: 'spec', meaning: 'Unknown pattern kind.' },
  'bad-colors': { source: 'spec', meaning: '"colors" is empty or too short.' },
  'bad-flip': { source: 'spec', meaning: '"flip" is not h, v or hv.' },
  'bad-part': { source: 'spec', meaning: 'A mirror names an unknown part, or parts of different sizes.' },
  'bad-layer': { source: 'spec', meaning: 'A "layer" option is not base, overlay or both.' },
  'bad-option': { source: 'spec', meaning: 'An option is not one of its allowed values.' },
  'kind-guess': { source: 'spec', meaning: 'A material kind was read as the closest one.' },
  'bad-source': { source: 'spec', meaning: 'A symmetrize source is not left or right.' },
  'op-unsupported': { source: 'spec', meaning: 'The operation needs a part the layout does not have (face and hair need an 8×8×8 head).' },
  'bad-gui': { source: 'spec', meaning: '"gui" scaling is malformed or its borders do not fit.' },
  'gui-aspect': { source: 'spec', meaning: 'The GUI scaling size has other proportions than the texture.' },
  'gui-ignored': { source: 'spec', meaning: '"gui" set on a layout other than gui.' },
  'animation-ignored': { source: 'spec', meaning: '"animation" set on a layout the game draws still.' },
  'bad-animation': { source: 'spec', meaning: '"animation" is malformed.' },
  'bad-frame': { source: 'spec', meaning: 'A frame or its patch is malformed, or the patch does not apply.' },
  // Reviewing the result
  empty: { source: 'review', meaning: 'The texture is fully transparent.' },
  'base-transparent': { source: 'review', meaning: 'Base pixels left transparent render black in game.' },
  'blank-face': { source: 'review', meaning: 'The face uses fewer than 3 colors.' },
  'face-hidden': { source: 'review', meaning: 'The hat layer covers the eyes drawn on the base.' },
  'hat-covers-face': { source: 'review', meaning: 'The hat layer covers the whole face.' },
  'flat-surface': { source: 'review', meaning: 'Faces that are 90% one color.' },
  'few-colors': { source: 'review', meaning: 'Fewer colors than good textures of the size use.' },
  'unused-palette': { source: 'review', meaning: 'Palette keys no layer uses.' },
  'overwritten-layer': { source: 'review', meaning: 'A layer completely painted over by later ones.' },
  'tile-seam': { source: 'review', meaning: 'A tiling texture shows a seam where copies meet.' },
  'animation-static': { source: 'review', meaning: 'Every frame is the same picture.' },
  'frames-reused': { source: 'review', meaning: 'Repeated frames are stored once and listed by index.' },
  // Patches
  'bad-patch': { source: 'patch', meaning: 'The patch is not { "patch": [...] }.' },
  'patch-skipped': { source: 'patch', meaning: 'A patch entry could not apply (unknown id, bad shape).' },
  // Families
  'bad-family': { source: 'family', meaning: 'The document is not a family.' },
  'bad-base': { source: 'family', meaning: '"base" is not a spec with layers.' },
  'bad-variants': { source: 'family', meaning: '"variants" is not an object.' },
  'bad-variant': { source: 'family', meaning: 'A variant or its "patch" has the wrong shape.' },
  'bad-matrix': { source: 'family', meaning: '"matrix" is not axes of values.' },
  'bad-id': { source: 'family', meaning: 'A member id or axis value has characters an id cannot have.' },
  'duplicate-id': { source: 'family', meaning: 'Two members get the same id.' },
  'unknown-layer-id': { source: 'family', meaning: 'enable/disable names a layer id the base does not have.' },
  'variant-patch': { source: 'family', meaning: 'A variant\'s patch entry could not apply.' },
  'family-too-large': { source: 'family', meaning: 'The matrix expands past the member limit.' },
  'empty-family': { source: 'family', meaning: 'The family has no members.' },
  // Building a resource pack
  'unknown-version': { source: 'pack', meaning: 'No known pack format for the Minecraft version.' },
  'bad-namespace': { source: 'pack', meaning: 'The namespace has characters a namespace cannot have.' },
  'spec-errors': { source: 'pack', meaning: 'A spec with errors was left out of the pack.' },
  'no-asset': { source: 'pack', meaning: 'The texture has no place in a pack: set "asset".' },
  'duplicate-asset': { source: 'pack', meaning: 'Two textures write the same file.' },
  'particle-elsewhere': { source: 'pack', meaning: 'A particle outside particle/ gets no particle definition.' },
  // Checking a resource pack
  'pack-mcmeta-missing': { source: 'pack-check', meaning: 'No pack.mcmeta at the root.' },
  'pack-nested': { source: 'pack-check', meaning: 'The pack sits one folder too deep.' },
  'pack-mcmeta-invalid': { source: 'pack-check', meaning: 'pack.mcmeta has no "pack" object.' },
  'pack-description-missing': { source: 'pack-check', meaning: 'pack.mcmeta has no description.' },
  'pack-format-missing': { source: 'pack-check', meaning: 'pack.mcmeta declares no format.' },
  'pack-format-invalid': { source: 'pack-check', meaning: 'A format field has the wrong type or range.' },
  'pack-format-unknown': { source: 'pack-check', meaning: 'A format no known version uses.' },
  'pack-format-legacy-missing': { source: 'pack-check', meaning: 'Versions before 1.21.9 need pack_format.' },
  'pack-format-range-missing': { source: 'pack-check', meaning: '1.21.9 and later need min_format and max_format.' },
  'pack-target-unknown': { source: 'pack-check', meaning: 'The target version is not in the format table.' },
  'pack-target-unsupported': { source: 'pack-check', meaning: 'The pack\'s formats do not cover the target version.' },
  'pack-png-invalid': { source: 'pack-check', meaning: 'pack.png does not decode.' },
  'pack-png-not-square': { source: 'pack-check', meaning: 'pack.png is not square.' },
  'junk-file': { source: 'pack-check', meaning: 'Files the OS left (__MACOSX, .DS_Store).' },
  'root-file-extra': { source: 'pack-check', meaning: 'A root file the game does not read.' },
  'file-outside-assets': { source: 'pack-check', meaning: 'A file outside assets/<namespace>/.' },
  'path-invalid': { source: 'pack-check', meaning: 'A namespace or path character the game rejects.' },
  'json-invalid': { source: 'pack-check', meaning: 'A JSON or .mcmeta file does not parse.' },
  'texture-invalid': { source: 'pack-check', meaning: 'A texture is not a PNG that decodes.' },
  'texture-unchecked': { source: 'pack-check', meaning: 'A PNG Texel cannot decode (16-bit, interlaced, huge); only its size is checked.' },
  'animation-invalid': { source: 'pack-check', meaning: 'An .mcmeta animation field is malformed.' },
  'animation-frame-out-of-range': { source: 'pack-check', meaning: 'An animation frame index past the last frame.' },
  'animation-size-mismatch': { source: 'pack-check', meaning: 'The image is not a whole number of frames.' },
  'mcmeta-without-texture': { source: 'pack-check', meaning: 'An .mcmeta next to no texture.' },
  'gui-scaling-invalid': { source: 'pack-check', meaning: 'GUI scaling is malformed or its borders do not fit.' },
  'gui-scaling-aspect': { source: 'pack-check', meaning: 'GUI scaling proportions differ from the texture\'s.' },
  'texture-looks-animated': { source: 'pack-check', meaning: 'A strip of frames with no .mcmeta: the game squashes it.' },
  'texture-not-power-of-two': { source: 'pack-check', meaning: 'A block or item texture whose sides are not powers of two.' },
  'entity-texture-size': { source: 'pack-check', meaning: 'An entity texture does not fit the size of its Texel layout.' },
  'model-invalid': { source: 'pack-check', meaning: 'A model file has the wrong shape.' },
  'model-parent-missing': { source: 'pack-check', meaning: 'A model\'s parent is not in the pack.' },
  'model-parent-cycle': { source: 'pack-check', meaning: 'Models are each other\'s parents.' },
  'texture-missing': { source: 'pack-check', meaning: 'A referenced texture is not in the pack.' },
  'texture-ref-unresolved': { source: 'pack-check', meaning: 'A #variable in a model resolves to no texture.' },
  'model-missing': { source: 'pack-check', meaning: 'A referenced model is not in the pack.' },
  'blockstate-invalid': { source: 'pack-check', meaning: 'A block state file has the wrong shape.' },
  'item-definition-invalid': { source: 'pack-check', meaning: 'An item definition has the wrong shape.' },
  'item-definitions-unsupported': { source: 'pack-check', meaning: 'Item definitions in a pack for versions before 1.21.4.' },
  'particle-invalid': { source: 'pack-check', meaning: 'A particle definition has the wrong shape.' },
  'texture-unused': { source: 'pack-check', meaning: 'A texture nothing in the pack uses.' },
};

/** Exit codes of the CLI. */
export const EXIT_CODES: Readonly<Record<number, string>> = {
  0: 'Done: no errors (warnings and info may have been printed).',
  1: 'The spec, family or pack has errors (the issues say which); outputs with errors are not written.',
  2: 'Bad usage: unknown command, missing file or bad flag (the help is printed).',
};

/** The issue code reference: a table per source, for the docs. */
export function issueCodesToMarkdown(): string {
  const titles: Record<IssueSource, string> = { spec: 'Compiling a spec', review: 'Review', patch: 'Patches', family: 'Families', pack: 'Building a resource pack', 'pack-check': 'Checking a resource pack' };
  const out: string[] = [];
  for (const [source, title] of Object.entries(titles)) {
    out.push(`**${title}**`, '', '| code | meaning |', '| --- | --- |');
    for (const [code, c] of Object.entries(ISSUE_CODES)) if (c.source === source) out.push(`| \`${code}\` | ${c.meaning} |`);
    out.push('');
  }
  out.push('**CLI exit codes**', '', '| code | meaning |', '| --- | --- |', ...Object.entries(EXIT_CODES).map(([k, v]) => `| ${k} | ${v} |`));
  return out.join('\n');
}
