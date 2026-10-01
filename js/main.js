/** Bootstrap: wires store, schema-driven controls, presets, generator, renderer, export, project save/load. */
import './generators/index.js';
import { get, list } from './generators/registry.js';
import { createStore } from './app/store.js';
import { defaults, viewParams } from './params/schema.js';
import { listPresets, applyPreset } from './params/presets.js';
import { serializeProject, parseProject } from './params/serialize.js';
import { styleParams } from './style/colorings.js';
import { renderSVG } from './render/svg.js';
import { buildControls } from './ui/controls.js';

const $ = (id) => document.getElementById(id);
const first = list()[0];
const store = createStore({
  generator: first.id,
  params: defaults(first.params),
  style: defaults(styleParams),
  view: defaults(viewParams),
});

const currentSVG = () => {
  const { generator, params, style, view } = store.get();
  const ir = get(generator).generate(params, [0, 0, view.width, view.height]);
  return renderSVG(ir, style, view, { flatten: view.flatten, precision: view.precision });
};

const setIn = (section) => (id, value) => store.set({ [section]: { ...store.get()[section], [id]: value } });

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
  store.set({ generator: g.id, params: defaults(g.params) });
  buildPanels();
});
$('preset').addEventListener('change', (e) => {
  const g = get(store.get().generator), preset = listPresets(g).find((p) => p.id === e.target.value);
  if (preset) { store.set(applyPreset(g, preset, store.get())); buildPanels(); }
});
buildPanels();

let pending = 0;
store.subscribe(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(() => { $('preview').innerHTML = currentSVG(); }); });
$('preview').innerHTML = currentSVG();

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
    store.set(state);
    buildPanels();
    if (warnings.length) alert(`Project loaded with adjustments:\n${warnings.join('\n')}`);
  } catch (err) { alert(`Could not load project: ${err.message}`); }
});
