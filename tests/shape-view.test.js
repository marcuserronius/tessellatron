import test from 'node:test';
import assert from 'node:assert/strict';
import * as square from '../js/generators/periodic/square.js';
import * as hexagon from '../js/generators/periodic/hexagon.js';
import * as triangle from '../js/generators/periodic/triangle.js';
import { defaults } from '../js/params/schema.js';
import { tileEditorSVG, tileChoices } from '../js/ui/tile-editor-svg.js';
import { edgeClasses } from '../js/editor/classes.js';
import { retile } from '../js/editor/modes.js';
import { canEdit, editableParams } from '../js/editor/shape.js';

const model = (g, extra = {}, mode) => {
  const p = { ...defaults(g.params), size: 100, ...extra }, raw = g.generate(p, [-400, -400, 400, 400]), sample = mode ? retile(raw, mode) : raw;
  return { sample, classes: edgeClasses(sample) };
};
const svgOf = (g, shape, extra, opts) => tileEditorSVG({ ...model(g, extra, shape?.mode), shape, ...opts });
const count = (svg, re) => (svg.match(re) ?? []).length;
const shape = { generator: 'square', edges: { sq: { e0: [[0.3, 0.2], [0.7, 0.2]], e1: [[0.5, -0.2]] } } };

test('square editor: 8 ghost neighbours; every edge is editable, a later member of a class is dashed and has its own handles', () => {
  const svg = svgOf(square, shape);
  assert.equal(count(svg, /<path d="[^"]*" transform="matrix/g), 8);
  assert.equal(count(svg, /class="hit"/g), 4);
  assert.equal(count(svg, /class="edge rep"/g), 2);
  assert.equal(count(svg, /class="edge derived"/g), 2);
  assert.equal(count(svg, /class="handle"/g), 2 * 2 + 2 * 1); // top and bottom: 2 points each; right and left: 1 each
  assert.equal(count(svg, /class="derived-pt"/g), 0);
  assert.ok(svg.includes('data-pid="sq" data-edge="e0" data-index="1"') && svg.includes('data-edge="e3" data-index="0"'));
  assert.ok(!svg.includes('class="tile-editor invalid"'));
});

test('the bottom edge is the top edge seen the other way round: its handle indices run backwards', () => {
  const svg = svgOf(square, shape), idx = (edge) => [...svg.matchAll(new RegExp(`data-edge="${edge}" data-index="(\\d+)"`, 'g'))].map((m) => +m[1]);
  assert.deepEqual(idx('e0'), [0, 1]);
  assert.deepEqual(idx('e2'), [1, 0]);
});

test('with no shape there are no handles, but every edge stays pressable; invalid flag is reflected', () => {
  const svg = svgOf(square, null, {}, { invalid: true });
  assert.equal(count(svg, /class="handle"/g), 0);
  assert.equal(count(svg, /class="hit"/g), 4);
  assert.ok(svg.startsWith('<svg class="tile-editor invalid"'));
});

test('the viewBox is square and centred on the tile, with a margin for neighbours', () => {
  const [x, y, w, h] = svgOf(square, null).match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  assert.ok(w === h && x === y && Math.abs(x + w / 2) < 1e-9);
  assert.ok(w > 100 * Math.SQRT2 && w < 100 * 3);
});

test('shape edits show in the tile outline; a shape for another generator is ignored', () => {
  const plain = svgOf(square, null);
  assert.notEqual(svgOf(square, shape), plain);
  assert.equal(svgOf(square, { generator: 'hexagon', edges: shape.edges }), plain);
});

test('mode 2, two shapes: tiles A and B, each shown upright; a shared edge has handles on both sides', () => {
  const edit = { generator: 'square', mode: 'pair', edges: { sq: { e0: [[0.3, 0.2]] } } }; // A top = B bottom
  const m = model(square, {}, 'pair');
  assert.deepEqual(tileChoices(m.sample), [{ id: 'sq', label: 'A' }, { id: 'sq_b', label: 'B' }]);
  const a = tileEditorSVG({ ...m, shape: edit, tile: 'sq' }), b = tileEditorSVG({ ...m, shape: edit, tile: 'sq_b' });
  for (const svg of [a, b]) {
    assert.equal(count(svg, /class="hit"/g), 4);
    assert.equal(count(svg, /class="handle"/g), 1);
    assert.equal(count(svg, /<path d="[^"]*" transform="matrix/g), 8);
  }
  assert.ok(a.includes('data-pid="sq" data-edge="e0" data-index="0"'));
  assert.ok(b.includes('data-pid="sq_b" data-edge="e2" data-index="0"'));
  assert.notEqual(a, b);
  assert.equal(tileEditorSVG({ ...m, shape: edit, tile: 'nope' }), a); // unknown tile falls back to the first
});

test('mode 3, one shape turned to meet itself: editing the right edge shows on the bottom edge of the same tile; neighbours are turned', () => {
  const m = model(square, {}, 'turn-cw'), edit = { generator: 'square', mode: 'turn-cw', edges: { sq: { e1: [[0.3, 0.2]] } } };
  assert.deepEqual(tileChoices(m.sample), [{ id: 'sq', label: 'A' }]);
  const svg = tileEditorSVG({ ...m, shape: edit });
  assert.equal(count(svg, /class="handle"/g), 2);
  assert.ok(svg.includes('data-edge="e1" data-index="0"') && svg.includes('data-edge="e2" data-index="0"'));
  assert.equal(count(svg, /class="handle" data-pid="sq" data-edge="e0"/g) + count(svg, /class="handle" data-pid="sq" data-edge="e3"/g), 0);
  const turned = [...svg.matchAll(/transform="matrix\(([^)]*)\)"/g)].map((x) => x[1].split(' ').map(Number)).filter(([a, , , d]) => Math.abs(a) < 1e-9 && Math.abs(d) < 1e-9);
  assert.ok(turned.length >= 2, 'some neighbours are drawn quarter-turned');
});

test('mode 4, two shapes with quarter turns: A right = B bottom shows on both tiles; the mirror mode swaps the partner', () => {
  const cw = { generator: 'square', mode: 'pair-turn-cw', edges: { sq: { e1: [[0.3, 0.2]] } } };
  const m = model(square, {}, 'pair-turn-cw');
  assert.ok(tileEditorSVG({ ...m, shape: cw, tile: 'sq' }).includes('data-pid="sq" data-edge="e1" data-index="0"'));
  assert.ok(tileEditorSVG({ ...m, shape: cw, tile: 'sq_b' }).includes('data-pid="sq_b" data-edge="e2" data-index="0"'));
  const ccw = { ...cw, mode: 'pair-turn-ccw' }, mc = model(square, {}, 'pair-turn-ccw');
  assert.ok(tileEditorSVG({ ...mc, shape: ccw, tile: 'sq_b' }).includes('data-pid="sq_b" data-edge="e0" data-index="0"'));
});

test('locked edges have no targets: a row shift locks the horizontal edges, twist locks everything', () => {
  const brick = svgOf(square, null, { rowShift: 0.5 });
  assert.equal(count(brick, /class="hit"/g), 2);
  assert.equal(count(brick, /class="edge locked"/g), 2);
  const twisted = svgOf(square, null, { twistMode: 'rows', twistStep: 5 });
  assert.equal(count(twisted, /class="hit"/g), 0);
  assert.equal(count(twisted, /class="edge locked"/g), 4);
});

test('hexagon: six editable edges; triangle (no modes yet): up and down triangles share one shape with half-turn symmetric edges', () => {
  assert.equal(count(svgOf(hexagon, null, { size: 40 }), /class="hit"/g), 6);
  const m = model(triangle, { size: 60 });
  assert.deepEqual(tileChoices(m.sample).map((c) => c.id), ['tri']);
  const edit = { generator: 'triangle', edges: { tri: { e0: [[0.2, 0.2]] } } };
  const svg = tileEditorSVG({ ...m, shape: edit });
  assert.equal(count(svg, /class="hit"/g), 3);
  assert.equal(count(svg, /class="handle"/g), 1);
  assert.equal(count(svg, /class="fixed-pt"/g), 1);
});

test('a symmetric class (one shared shape forced onto triangles): first half draggable, fixed middle, mirrored half derived', () => {
  const p = { ...defaults(triangle.params), size: 100 }, tri = triangle.generate(p, [-400, -400, 400, 400]);
  const one = { ...tri, tiles: tri.tiles.map((t) => ({ ...t, orient: { rot: 0, flip: false } })) };
  const m = { sample: one, classes: edgeClasses(one) };
  const svg = tileEditorSVG({ ...m, shape: { generator: 'triangle', edges: { tri: { e0: [[0.2, 0.2], [0.35, -0.1]] } } } });
  assert.equal(count(svg, /class="hit"/g), 3);
  assert.equal(count(svg, /class="handle"/g), 2);
  assert.equal(count(svg, /class="fixed-pt"/g), 1);
  assert.equal(count(svg, /class="derived-pt"/g), 2);
});

test('editableParams is consistent with canEdit', () => {
  const p = defaults(square.params);
  for (const bad of [{}, { rowShift: 0.5 }, { twistMode: 'rows', twistStep: 4 }, { rowShift: 1, twistMode: 'diagonals', twistStep: -9 }]) {
    const params = { ...p, ...bad }, fix = editableParams('square', params);
    assert.equal(canEdit('square', { ...params, ...fix }).ok, true, JSON.stringify(bad));
    assert.equal(Object.keys(fix).length === 0, canEdit('square', params).ok);
  }
  assert.equal(editableParams('hexagon', {}), null);
});
