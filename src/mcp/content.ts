import apiDoc from '../../docs/api.md';
import artGuideDoc from '../../docs/art-guide.md';
import familiesDoc from '../../docs/families.md';
import installDoc from '../../docs/install.md';
import protocolDoc from '../../docs/protocol.md';
import specDoc from '../../docs/spec.md';
import astronaut from '../../examples/astronaut.json';
import bannerCape from '../../examples/banner-cape.json';
import bronzeArmor from '../../examples/bronze-armor.json';
import cozy from '../../examples/cozy.json';
import creeper from '../../examples/creeper.json';
import emberBlade from '../../examples/ember-blade.json';
import explorer from '../../examples/explorer.json';
import guild from '../../examples/families/guild.json';
import knight from '../../examples/knight.json';
import minerZombie from '../../examples/miner-zombie.json';
import mudPig from '../../examples/mud-pig.json';
import robot from '../../examples/robot.json';
import wizard from '../../examples/wizard.json';
import wingedPig from '../../examples/winged-pig.json';
import zebra from '../../examples/zebra.json';
import skyEvoker from '../../examples/sky-evoker.json';
import ashLog from '../../examples/ash-log.json';
import magmaPulse from '../../examples/magma-pulse.json';
import stoneButton from '../../examples/stone-button.json';
import spark from '../../examples/spark.json';
import familySchema from '../../schema/skinfamily.v1.json';
import { specSchema } from '../core/schema';

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

export const EXAMPLES = {
  explorer,
  knight,
  robot,
  astronaut,
  wizard,
  cozy,
  'winged-pig': wingedPig,
  'miner-zombie': minerZombie,
  creeper,
  'mud-pig': mudPig,
  'bronze-armor': bronzeArmor,
  'banner-cape': bannerCape,
  'ember-blade': emberBlade,
  zebra,
  'sky-evoker': skyEvoker,
  'ash-log': ashLog,
  'magma-pulse': magmaPulse,
  'stone-button': stoneButton,
  spark,
} as const;
export type ExampleId = keyof typeof EXAMPLES;
export const EXAMPLE_IDS = Object.keys(EXAMPLES) as [ExampleId, ...ExampleId[]];

export const FAMILY_EXAMPLES = { guild } as const;

export const SCHEMAS = { 'skinspec.v1': specSchema(), 'skinfamily.v1': familySchema } as const;
