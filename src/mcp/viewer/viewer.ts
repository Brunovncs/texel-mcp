import type { Model } from '../../core/types';
import { SkinModel, type ModelView } from '../../web/model3d';
import { HostBridge } from './host-bridge';

interface RenderResult {
  structuredContent?: { name?: string; model?: Model; score?: number; ok?: boolean; issues?: { level: string; code: string; message: string }[] };
  _meta?: Record<string, unknown>;
}

interface HostContext {
  theme?: 'light' | 'dark';
  styles?: { variables?: Record<string, string> };
}

const $ = (id: string) => document.getElementById(id)!;
const bridge = new HostBridge();
const stage = $('stage');
const model = new SkinModel(stage, { yaw: -28, pitch: -12, animate: 'idle' });
model.enableControls(stage);
let current: { name: string; texture: string } | null = null;

function applyContext(ctx: HostContext | undefined) {
  if (!ctx) return;
  if (ctx.theme) document.documentElement.dataset.theme = ctx.theme;
  for (const [k, v] of Object.entries(ctx.styles?.variables ?? {})) document.documentElement.style.setProperty(k, v);
}

function reportSize() {
  const rect = document.querySelector('main')!.getBoundingClientRect();
  bridge.notify('ui/notifications/size-changed', { width: Math.ceil(rect.width), height: Math.ceil(rect.height) });
}

function show(result: RenderResult) {
  const texture = result._meta?.['skinsmith/texture'];
  const s = result.structuredContent ?? {};
  if (typeof texture !== 'string') {
    $('status').textContent = 'No texture in this result.';
    return;
  }
  current = { name: s.name ?? 'Skin', texture };
  model.setSkin(texture, s.model ?? 'classic');
  $('name').textContent = current.name;
  $('score').textContent = s.score === undefined ? '' : `${s.score}/100`;
  $('score').dataset.tone = !s.ok ? 'bad' : (s.score ?? 0) >= 90 ? 'good' : 'mid';
  const problems = (s.issues ?? []).filter((i) => i.level !== 'info');
  $('status').textContent = problems.length ? problems.map((i) => `${i.level}: ${i.message}`).join(' · ') : 'No errors or warnings.';
  document.body.dataset.state = 'ready';
  reportSize();
}

const VIEWS: Record<string, ModelView> = { front: { yaw: 0, pitch: 0 }, three: { yaw: -28, pitch: -12 }, back: { yaw: 180, pitch: 0 }, side: { yaw: 90, pitch: 0 } };

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const view = t.closest<HTMLElement>('[data-view]')?.dataset.view;
  if (view) model.setView({ ...VIEWS[view], spin: false });
  const toggle = t.closest<HTMLElement>('[data-toggle]');
  if (toggle) {
    const v = model.getView();
    if (toggle.dataset.toggle === 'overlay') model.setView({ overlay: !v.overlay });
    if (toggle.dataset.toggle === 'walk') model.setView({ animate: v.animate === 'walk' ? 'idle' : 'walk' });
    const next = model.getView();
    toggle.setAttribute('aria-pressed', String(toggle.dataset.toggle === 'overlay' ? next.overlay : next.animate === 'walk'));
  }
});

$('feedback').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('feedback-text') as HTMLInputElement;
  const text = input.value.trim();
  if (!text || !current) return;
  try {
    await bridge.request('ui/message', { role: 'user', content: { type: 'text', text: `Revise the skin "${current.name}": ${text}` } });
    input.value = '';
    $('status').textContent = 'Feedback sent to the conversation.';
  } catch (err) {
    $('status').textContent = `Could not send feedback: ${(err as Error).message}`;
  }
});

bridge.on('ui/notifications/tool-input', () => {
  document.body.dataset.state = 'loading';
  $('status').textContent = 'Rendering…';
});
bridge.on('ui/notifications/tool-result', (params) => show(params as RenderResult));
bridge.on('ui/notifications/host-context-changed', (params) => applyContext(params as HostContext));

new ResizeObserver(() => {
  const { width, height } = stage.getBoundingClientRect();
  model.root.style.setProperty('--u', `${Math.max(4, Math.min(width / 22, height / 38)).toFixed(2)}px`);
}).observe(stage);

async function init() {
  if (!bridge.embedded) {
    $('status').textContent = 'This view runs inside an MCP Apps host (skinsmith_render).';
    return;
  }
  try {
    const res = await bridge.request<{ hostContext?: HostContext }>('ui/initialize', {
      protocolVersion: '2026-01-26',
      clientInfo: { name: 'skinsmith-viewer', version: '1' },
      capabilities: {},
      appCapabilities: { availableDisplayModes: ['inline'] },
    });
    applyContext(res.hostContext);
  } catch {
    /* hosts without an initialize handshake still deliver tool results */
  }
  bridge.notify('ui/notifications/initialized', {});
  reportSize();
}
init();
