import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/generators/index.js';
import { get } from '../js/generators/registry.js';
import { defaults, viewParams } from '../js/params/schema.js';
import { styleParams } from '../js/style/colorings.js';
import { renderSVG } from '../js/render/svg.js';
import { buildIR, buildSVG, editorModel } from '../js/app/pipeline.js';

const state = (generator, extra = {}) => ({
  generator, params: defaults(get(generator).params), style: defaults(styleParams), view: { ...defaults(viewParams), width: 300, height: 200 }, ...extra,
});

test('without a shape the pipeline is exactly generate + renderSVG', () => {
  for (const id of ['square', 'hexagon', 'penrose']) {
    const s = state(id), ir = get(id).generate(s.params, [0, 0, 300, 200]);
    assert.deepEqual(buildIR(s, [0, 0, 300, 200]), ir);
    assert.equal(buildSVG(s), renderSVG(ir, s.style, s.view, { flatten: s.view.flatten, precision: s.view.precision }));
  }
});

test('a shape in the state reaches the SVG; one made for another generator does not', () => {
  const shape = { generator: 'square', edges: { sq: { e0: [[0.5, 0.2]] } } };
  const plain = buildSVG(state('square')), shaped = buildSVG(state('square', { shape }));
  assert.notEqual(shaped, plain);
  assert.ok(shaped.length > plain.length);
  assert.equal(buildSVG(state('hexagon', { shape })), buildSVG(state('hexagon')));
});

test('modes: the pipeline re-tiles for the shape\'s mode, caches per generator+params+mode (not per edits), and ignores the Orientation setting', () => {
  const edit = { generator: 'square', mode: 'pair-turn-cw', edges: { sq: { e1: [[0.3, 0.2]] } } };
  const s = state('square', { shape: edit }), turned = { ...s, params: { ...s.params, orientMode: 'cycle' } };
  const m1 = editorModel(s), m2 = editorModel({ ...s, shape: { ...edit, edges: { sq: { e1: [[0.4, 0.1]] } } } });
  assert.equal(m1, m2);                                                // edits don't invalidate
  assert.notEqual(editorModel({ ...s, shape: { ...edit, mode: 'pair' } }), m1); // the mode does
  assert.notEqual(editorModel({ ...s, shape: null }), m1);
  assert.equal(m1.mode, 'pair-turn-cw');
  assert.equal(m1.classes.length, 4);
  assert.deepEqual(Object.keys(m1.sample.prototiles), ['sq', 'sq_b']);
  const plain = buildIR({ ...turned, shape: null }, [-200, -200, 200, 200]), ir = buildIR(turned, [-200, -200, 200, 200]), ir0 = buildIR(s, [-200, -200, 200, 200]);
  assert.deepEqual(Object.keys(plain.prototiles), ['sq']);               // no shape: the generator's own output
  assert.deepEqual(Object.keys(ir.prototiles), ['sq', 'sq_b']);          // shape: one prototile per tile shape
  assert.equal(JSON.stringify(ir.tiles), JSON.stringify(ir0.tiles));      // orientMode 'cycle' changed nothing
  const bent = Object.entries(ir.prototiles).flatMap(([id, p]) => p.edges.filter((e) => e.path.length === 3).map((e) => `${id}.${e.id}`));
  assert.deepEqual(bent, ['sq.e1', 'sq_b.e2']); // A right = B bottom
});

test('a mode with no edits changes nothing in the picture', () => {
  const s = state('square', { shape: { generator: 'square', mode: 'pair', edges: {} } });
  assert.equal(buildSVG(s), buildSVG({ ...s, shape: null }));
});

test('a shape that belongs to another generator costs nothing: no class derivation, same IR', () => {
  const shape = { generator: 'square', edges: { sq: { e0: [[0.3, 0.2]] } } }, h = state('hexagon', { shape });
  assert.deepEqual(buildIR(h, [0, 0, 200, 200]), get('hexagon').generate(h.params, [0, 0, 200, 200]));
});

test('a curved edge reaches the SVG as a C command, in <defs> and flattened', () => {
  const shape = { generator: 'square', edges: { sq: { e0: [['M', 0, 0], ['C', 0.2, 0.4, 0.8, 0.4, 1, 0]] } } };
  const s = state('square', { shape });
  for (const flatten of [false, true]) {
    const svg = buildSVG({ ...s, view: { ...s.view, flatten } });
    assert.ok(/ d="[^"]*C[-\d. ]+[^"]*Z"/.test(svg) && !/NaN|undefined/.test(svg), `flatten ${flatten}`);
  }
});
