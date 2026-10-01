import apiDoc from '../../content/docs/api.md';
import artGuideDoc from '../../content/docs/art-guide.md';
import familiesDoc from '../../content/docs/families.md';
import installDoc from '../../content/docs/install.md';
import protocolDoc from '../../content/docs/protocol.md';
import specDoc from '../../content/docs/spec.md';
import astronaut from '../../public/examples/astronaut.json';
import explorer from '../../public/examples/explorer.json';
import guild from '../../public/examples/families/guild.json';
import knight from '../../public/examples/knight.json';
import robot from '../../public/examples/robot.json';
import familySchema from '../../public/schema/skinfamily.v1.json';
import specSchema from '../../public/schema/skinspec.v1.json';

/** Docs and examples are embedded so the server works offline, with no site round-trips. */
export const DOCS = {
  protocol: { title: 'Skin Agent Protocol', text: protocolDoc },
  spec: { title: 'Skin spec reference', text: specDoc },
  'art-guide': { title: 'Skin art guide', text: artGuideDoc },
  families: { title: 'Skin families', text: familiesDoc },
  api: { title: 'Agent interfaces', text: apiDoc },
  install: { title: 'Install as a tool', text: installDoc },
} as const;

export type DocPage = keyof typeof DOCS;
export const DOC_PAGES = Object.keys(DOCS) as [DocPage, ...DocPage[]];

export const EXAMPLES = { explorer, knight, robot, astronaut } as const;
export type ExampleId = keyof typeof EXAMPLES;
export const EXAMPLE_IDS = Object.keys(EXAMPLES) as [ExampleId, ...ExampleId[]];

export const FAMILY_EXAMPLES = { guild } as const;

export const SCHEMAS = { 'skinspec.v1': specSchema, 'skinfamily.v1': familySchema } as const;
