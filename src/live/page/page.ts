import { compile, longShareURL, review } from '../../core';
import { dataURLFromImage } from '../../web/canvas';
import { fitModel, SkinModel } from '../../web/model3d';

/**
 * The live session's own page, served by the local server at its root. Same origin as the event
 * stream, so it works in every browser without mixed-content or local-network prompts, and it
 * renders with the agent's copy of the compiler.
 */

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const site = document.querySelector<HTMLMetaElement>('meta[name="texel-site"]')?.content ?? '';
const stage = $('stage');
const model = new SkinModel(stage, { yaw: -28, pitch: -12, animate: 'idle', spin: !matchMedia('(prefers-reduced-motion: reduce)').matches });
fitModel(model, stage, 11);
model.enableControls(stage);

async function show(spec: string) {
  const result = compile(spec);
  const r = review(result);
  model.setSkin(dataURLFromImage(result.texture), result.model, result.layout);
  $('name').textContent = String(result.spec?.name ?? '').trim() || 'Untitled skin';
  $('score').textContent = `${r.score}/100`;
  $('score').dataset.tone = !r.ok ? 'bad' : r.score >= 90 ? 'good' : 'mid';
  const problems = r.issues.filter((i) => i.level !== 'info');
  $('status').textContent = problems.length ? problems.map((i) => `${i.level}: ${i.message}`).join(' · ') : 'No errors or warnings. Updates on every change the agent makes.';
  document.body.dataset.state = 'ready';
  if (site) $<HTMLAnchorElement>('studio').href = await longShareURL(site, spec);
}

const events = new EventSource('/events');
events.addEventListener('spec', (e) => {
  const { spec } = JSON.parse((e as MessageEvent<string>).data) as { spec: string };
  if (spec) void show(spec);
});
events.addEventListener('error', () => ($('status').textContent = 'Lost the agent. Is texel live still running?'));
