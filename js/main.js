/** Bootstrap: wires store, schema-driven controls, generator, renderer, export. */
import './generators/index.js';
import { get, list } from './generators/registry.js';
import { createStore } from './app/store.js';
import { defaults, viewParams } from './params/schema.js';
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

function buildGeneratorControls() {
  const { generator, params } = store.get();
  buildControls($('controls-gen'), get(generator).params, params, setIn('params'));
}

$('generator').append(...list().map((g) => new Option(g.name, g.id)));
$('generator').addEventListener('change', (e) => {
  const g = get(e.target.value);
  store.set({ generator: g.id, params: defaults(g.params) });
  buildGeneratorControls();
});
buildGeneratorControls();
buildControls($('controls-style'), styleParams, store.get().style, setIn('style'));
buildControls($('controls-view'), viewParams, store.get().view, setIn('view'));

let pending = 0;
store.subscribe(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(() => { $('preview').innerHTML = currentSVG(); }); });
$('preview').innerHTML = currentSVG();

$('download').addEventListener('click', () => {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([currentSVG()], { type: 'image/svg+xml' })),
    download: `${store.get().generator}-tiling.svg`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
});
$('copy').addEventListener('click', () => navigator.clipboard.writeText(currentSVG()));
