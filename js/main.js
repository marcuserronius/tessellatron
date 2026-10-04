/**
 * Bootstrap: wires store (undo/redo), schema-driven controls, presets, generator, renderer, export,
 * project save/load and URL-hash sharing (the page URL always encodes the current non-default settings).
 */
import './generators/index.js';
import { get, list } from './generators/registry.js';
import { createStore } from './app/store.js';
import { defaults, viewParams } from './params/schema.js';
import { listPresets, applyPreset } from './params/presets.js';
import { serializeProject, parseProject, toHash, fromHash } from './params/serialize.js';
import { styleParams } from './style/colorings.js';
import { buildSVG } from './app/pipeline.js';
import { buildControls } from './ui/controls.js';
import { mountShapeView } from './ui/shape-view.js';

const $ = (id) => document.getElementById(id);
const schemas = { generator: get, style: styleParams, view: viewParams };
const first = list()[0];

const stateFromHash = () => {
  try { return location.hash.length > 1 ? fromHash(location.hash, schemas).state : null; } catch { return null; }
};
const store = createStore(stateFromHash() ?? {
  generator: first.id,
  params: defaults(first.params),
  style: defaults(styleParams),
  view: defaults(viewParams),
  shape: null,
});

const currentSVG = () => buildSVG(store.get());

const setIn = (section) => (id, value) => store.set({ [section]: { ...store.get()[section], [id]: value } });
const shareURL = () => `${location.href.split('#')[0]}#${toHash(store.get(), schemas)}`;

/** (Re)build every panel from the store; call after any change made outside the controls themselves. */
function buildPanels() {
  const { generator, params, style, view } = store.get();
  const g = get(generator);
  $('generator').value = generator;
  $('preset').replaceChildren(new Option('Choose…', ''), ...listPresets(g).map((p) => new Option(p.name, p.id)));
  buildControls($('controls-gen'), g.params, params, setIn('params'));
  buildControls($('controls-style'), styleParams, style, setIn('style'));
  buildControls($('controls-view'), viewParams, view, setIn('view'));
}

$('generator').append(...list().map((g) => new Option(g.name, g.id)));
$('generator').addEventListener('change', (e) => {
  const g = get(e.target.value);
  store.set({ generator: g.id, params: defaults(g.params) }, { step: true });
  buildPanels();
});
$('preset').addEventListener('change', (e) => {
  const g = get(store.get().generator), preset = listPresets(g).find((p) => p.id === e.target.value);
  if (preset) { store.set(applyPreset(g, preset, store.get()), { step: true }); buildPanels(); }
});
buildPanels();

const shapeView = mountShapeView($('pane-shape'), {
  getState: store.get,
  setShape: (shape, opts) => store.set({ shape }, opts),
  setParams: (patch, opts) => { store.set({ params: { ...store.get().params, ...patch } }, opts); buildPanels(); },
});
const showTab = (name) => {
  $('pane-gen').hidden = name !== 'gen';
  $('pane-shape').hidden = name !== 'shape';
  document.body.classList.toggle('shaping', name === 'shape');
  $('tab-gen').setAttribute('aria-pressed', String(name === 'gen'));
  $('tab-shape').setAttribute('aria-pressed', String(name === 'shape'));
  if (name === 'shape') shapeView.update();
};
$('tab-gen').addEventListener('click', () => showTab('gen'));
$('tab-shape').addEventListener('click', () => showTab('shape'));

let pending = 0, hashTimer = 0;
const syncHistoryButtons = () => { $('undo').disabled = !store.canUndo(); $('redo').disabled = !store.canRedo(); };
store.subscribe(() => {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => { $('preview').innerHTML = currentSVG(); });
  syncHistoryButtons();
  if (!$('pane-shape').hidden) shapeView.update();
  clearTimeout(hashTimer); // debounced: some browsers rate-limit history.replaceState
  hashTimer = setTimeout(() => { try { history.replaceState(null, '', `#${toHash(store.get(), schemas)}`); } catch { /* ignore */ } }, 250);
});
$('preview').innerHTML = currentSVG();

const undo = () => store.undo() && buildPanels();
const redo = () => store.redo() && buildPanels();
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'z' || (k === 'y' && !e.metaKey)) { e.preventDefault(); (k === 'y' || e.shiftKey ? redo : undo)(); }
});

// Pasting a different share link into this tab (hashchange) loads it; our own replaceState does not fire it.
addEventListener('hashchange', () => {
  const state = stateFromHash();
  if (state && toHash(state, schemas) !== toHash(store.get(), schemas)) { store.set(state, { step: true }); buildPanels(); }
});
$('link').addEventListener('click', () => navigator.clipboard.writeText(shareURL()));

const save = (blob, name) => {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
};
$('download').addEventListener('click', () => save(new Blob([currentSVG()], { type: 'image/svg+xml' }), `${store.get().generator}-tiling.svg`));
$('copy').addEventListener('click', () => navigator.clipboard.writeText(currentSVG()));

$('save').addEventListener('click', () =>
  save(new Blob([serializeProject(store.get())], { type: 'application/json' }), `${store.get().generator}-project.json`));
$('load').addEventListener('click', () => $('load-file').click());
$('load-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = ''; // allow re-loading the same file
  if (!file) return;
  try {
    const { state, warnings } = parseProject(await file.text(), { generator: get, style: styleParams, view: viewParams });
    store.set(state, { step: true });
    buildPanels();
    if (warnings.length) alert(`Project loaded with adjustments:\n${warnings.join('\n')}`);
  } catch (err) { alert(`Could not load project: ${err.message}`); }
});
