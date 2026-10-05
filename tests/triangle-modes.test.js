import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/generators/index.js';
import * as triangle from '../js/generators/periodic/triangle.js';
import { defaults, viewParams } from '../js/params/schema.js';
import { apply } from '../js/core/affine.js';
import { flattenPath, pathPoints } from '../js/core/path.js';
import { edgeClasses } from '../js/editor/classes.js';
import { DEFAULT_MODE, describeEdges, getMode, modeFor, modesOf, retile, shapeCounts, variantsOf } from '../js/editor/modes.js';
import { applyShape, canEdit, edgeFromPoints, shapeProblems, sanitizeShape } from '../js/editor/shape.js';
import { tileChoices, tileEditorSVG } from '../js/ui/tile-editor-svg.js';
import { buildSVG, editorModel } from '../js/app/pipeline.js';
import { styleParams } from '../js/style/colorings.js';

const SIZE = 60, ids = ['single', 'single-flip', 'pair', 'pair-flip', 'triple', 'triple-flip'];
const SETTINGS = [{}, { rotation: 23 }, { orientMode: 'cycle' }, { rotation: -90, orientMode: 'rows' }, { orientMode: 'checker', originX: 11, originY: -5 }];
const raw = (extra = {}, k = 5) => triangle.generate({ ...defaults(triangle.params), size: SIZE, ...extra }, [-k * SIZE, -k * SIZE, k * SIZE, k * SIZE]);
const det = (m) => m[0] * m[3] - m[1] * m[2];
const describe = (mode, extra) => { const ir = retile(raw(extra), mode); return describeEdges(ir, edgeClasses(ir), 'triangle'); };
const kinds = (mode, extra) => edgeClasses(retile(raw(extra), mode)).map((c) => `${c.kind}${c.members.length}`);
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('six triangle modes: one, two or three shapes, each rotated or flipped; the default is first', () => {
  assert.deepEqual(modesOf('triangle').map((m) => m.id), ids);
  assert.deepEqual(modesOf('triangle').map((m) => m.shapes), [1, 1, 2, 2, 3, 3]);
  assert.equal(modesOf('triangle')[0].id, DEFAULT_MODE);
  assert.equal(getMode('triangle', 'nope').id, DEFAULT_MODE);
  assert.ok(canEdit('triangle', defaults(triangle.params)).ok);
});

test('what each mode says about its edges, whatever the tiling rotation or generator orientation', () => {
  const want = {
    single: ['right (half-turn symmetric)', 'bottom (half-turn symmetric)', 'left (half-turn symmetric)'],
    'single-flip': ['right = left', 'bottom (locked)'],
    pair: ['A right = B right', 'A bottom = B bottom', 'A left = B left'],
    'pair-flip': ['A right = B left', 'A bottom = B bottom', 'A left = B right'],
    triple: ['A right (half-turn symmetric)', 'A bottom = B bottom = C bottom (half-turn symmetric)', 'A left (half-turn symmetric)',
      'B right (half-turn symmetric)', 'B left (half-turn symmetric)', 'C right (half-turn symmetric)', 'C left (half-turn symmetric)'],
    'triple-flip': ['A right = A left', 'A bottom = B bottom = C bottom (locked)', 'B right = B left', 'C right = C left'],
  };
  for (const id of ids) for (const extra of SETTINGS) assert.deepEqual(describe(id, extra), want[id], `${id} ${JSON.stringify(extra)}`);
});

test('retile: shapes per mode, flipped tiles are exactly the down triangles, and the drawing never changes', () => {
  const r = raw({ orientMode: 'cycle' }), outline = (ir, t) => ir.prototiles[t.proto].edges.flatMap((e) => pathPoints(e.path).slice(0, -1)).map((p) => apply(t.transform, p));
  const key = (pts) => pts.map((p) => p.map((v) => (Math.round(v * 1e6) / 1e6 + 0).toFixed(3)).join(',')).sort().join(' ');
  const bag = (ir) => ir.tiles.map((t) => key(outline(ir, t))).sort();
  for (const m of modesOf('triangle')) {
    const ir = retile(r, m.id);
    assert.equal(Object.keys(ir.prototiles).length, m.shapes, m.id);
    assert.deepEqual(Object.values(ir.prototiles).map((p) => p.tileClass.label), ['A', 'B', 'C'].slice(0, m.shapes));
    assert.deepEqual(bag(ir), bag(r), `${m.id}: same triangles in the same places`);
    assert.equal(retile(ir, m.id), ir, 'idempotent');
    const flip = m.id.endsWith('-flip');
    for (const t of ir.tiles) {
      assert.equal(t.orient.flip, flip && !t.tags.cls === false, `${m.id}: only down triangles are flipped`);
      assert.equal(det(t.transform) < 0, t.orient.flip);
      assert.equal(t.orient.rot, t.tags.cls ? 3 : 0, 'the half-turn of a down triangle stays in orient.rot');
    }
  }
  // changing mode from an already re-tiled IR gives the same result as from the raw one
  const via = retile(retile(r, 'triple-flip'), 'pair'), direct = retile(r, 'pair');
  assert.deepEqual(via.tiles.map((t) => t.transform.map((v) => +v.toFixed(9))), direct.tiles.map((t) => t.transform.map((v) => +v.toFixed(9))));
});

test('classes by mode: rotated gives free or point-symmetric edges, flipped gives free edges and one straight mirror line', () => {
  assert.deepEqual(kinds('single'), ['symmetric1', 'symmetric1', 'symmetric1']);
  assert.deepEqual(kinds('single-flip'), ['free2', 'locked1']);
  assert.deepEqual(kinds('pair'), ['free2', 'free2', 'free2']);
  assert.deepEqual(kinds('pair-flip'), ['free2', 'free2', 'free2']);
  assert.deepEqual(kinds('triple').filter((k) => k !== 'symmetric1'), ['symmetric3']);
  assert.equal(kinds('triple').length, 7);
  assert.deepEqual(kinds('triple-flip'), ['free2', 'locked3', 'free2', 'free2']);
  const flipped = edgeClasses(retile(raw(), 'single-flip')).find((c) => c.kind === 'locked');
  assert.match(flipped.reason, /disagree/);
});

// every pair of tile edges that share their end points must carry the same curve (either way round)
function fit(ir) {
  const groups = new Map(), r = (v) => Math.round(v * 1e4);
  for (const t of ir.tiles) for (const e of ir.prototiles[t.proto].edges) {
    const pts = flattenPath(e.path, 12).map((p) => apply(t.transform, p)), [a, b] = [pts[0], pts.at(-1)];
    const key = [a, b].map((p) => `${r(p[0])},${r(p[1])}`).sort().join('|');
    (groups.get(key) ?? groups.set(key, []).get(key)).push(pts);
  }
  let checked = 0, worst = 0;
  for (const g of groups.values()) {
    if (g.length !== 2) { assert.ok(g.length === 1, 'an edge is shared by two tiles at most'); continue; }
    const [p, q] = g, same = Math.hypot(p[0][0] - q[0][0], p[0][1] - q[0][1]) < 1e-6, Q = same ? q : [...q].reverse();
    worst = Math.max(worst, ...p.map((x, i) => Math.hypot(x[0] - Q[i][0], x[1] - Q[i][1])));
    checked++;
  }
  return { checked, worst };
}
const curve = (c) => (c.kind === 'symmetric' ? [['M', 0, 0], ['C', 0.1, 0.3, 0.3, 0.3, 0.5, 0]] : [['M', 0, 0], ['C', 0.2, 0.3, 0.6, -0.25, 1, 0]]);
const polyline = (c, i) => edgeFromPoints([[0.25, 0.12 + 0.02 * i], [0.6, -0.1]], c.kind);
const shapeFor = (mode, make, extra) => {
  const edges = {};
  edgeClasses(retile(raw(extra), mode)).forEach((c, i) => { if (c.kind !== 'locked') (edges[c.rep.proto] ??= {})[c.rep.edge] = make(c, i); });
  return { generator: 'triangle', ...(mode !== DEFAULT_MODE && { mode }), edges };
};

test('every mode, curves and polylines, any rotation or orientation: edited tiles still meet exactly and outlines stay closed', () => {
  for (const mode of ids) for (const make of [curve, polyline]) for (const extra of SETTINGS) {
    const ir = raw(extra), s = shapeFor(mode, make, extra), shaped = applyShape(ir, s), label = `${mode} ${make.name} ${JSON.stringify(extra)}`;
    assert.deepEqual(shapeProblems(ir, s), [], label);
    const { checked, worst } = fit(shaped);
    assert.ok(checked > 60 && worst < 1e-9, `${label}: ${checked} shared edges, worst ${worst}`);
    for (const proto of Object.values(shaped.prototiles)) {
      const ends = proto.edges.map((e) => [pathPoints(e.path)[0], pathPoints(e.path).at(-1)]);
      ends.forEach(([, b], n) => assert.ok(b.every((v, k) => close(v, ends[(n + 1) % 3][0][k])), `${label}: closed`));
    }
    assert.equal(Object.keys(shaped.prototiles).length, getMode('triangle', mode).shapes);
  }
});

test('mode single-flip: bending the right edge bends the left one as its mirror image; the bottom stays straight', () => {
  const s = { generator: 'triangle', mode: 'single-flip', edges: { tri: { e0: [['M', 0, 0], ['L', 0.5, 0.3], ['L', 1, 0]] } } };
  const shaped = applyShape(raw(), s), P = (n) => pathPoints(shaped.prototiles.tri.edges[n].path);
  assert.equal(P(0).length, 3); assert.equal(P(2).length, 3); assert.equal(P(1).length, 2);
  assert.ok(fit(shaped).worst < 1e-9);
  // the left edge bulges outwards by the same amount as the right one (a mirror image across the tile's axis)
  const bulge = (n) => { const [a, m, b] = P(n), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; return Math.hypot(m[0] - mid[0], m[1] - mid[1]); };
  assert.ok(close(bulge(0), bulge(2), 1e-9) && bulge(0) > 1);
});

test('mode pair-flip: A right = B left, so bending A\'s right edge dents B\'s left edge; B is drawn as a mirror image', () => {
  const s = { generator: 'triangle', mode: 'pair-flip', edges: { tri: { e0: [['M', 0, 0], ['L', 0.5, 0.25], ['L', 1, 0]] } } };
  const shaped = applyShape(raw(), s);
  assert.equal(pathPoints(shaped.prototiles.tri.edges[0].path).length, 3);
  assert.equal(pathPoints(shaped.prototiles.tri_b.edges[2].path).length, 3);   // B left
  assert.equal(pathPoints(shaped.prototiles.tri_b.edges[0].path).length, 2);   // B right: not touched
  assert.ok(fit(shaped).worst < 1e-9);
});

test('the same edits mean different tilings in different triangle modes', () => {
  const edges = { tri: { e0: [['M', 0, 0], ['L', 0.5, 0.3], ['L', 1, 0]] } };
  const d = (mode) => JSON.stringify(applyShape(raw(), { generator: 'triangle', mode, edges }).prototiles);
  assert.notEqual(d('pair'), d('pair-flip'));
  assert.notEqual(d('single-flip'), d('pair-flip'));
});

test('pipeline: the editor model and the SVG work in every mode, flipped tiles render as mirrored <use> transforms', () => {
  const style = defaults(styleParams), view = { ...defaults(viewParams), width: 400, height: 300 };
  for (const mode of ids) {
    const shape = shapeFor(mode, curve, {}), state = { generator: 'triangle', params: { ...defaults(triangle.params), size: SIZE }, style, view, shape };
    const model = editorModel(state);
    assert.equal(model.mode, mode);
    assert.equal(Object.keys(model.sample.prototiles).length, getMode('triangle', mode).shapes);
    const svg = buildSVG(state);
    assert.ok(svg.startsWith('<svg') && !/NaN|undefined/.test(svg), mode);
    const dets = [...svg.matchAll(/<use [^>]*matrix\(([^)]*)\)/g)].map((m) => det(m[1].split(/[ ,]+/).map(Number)));
    assert.ok(dets.length > 10, mode);
    assert.equal(dets.some((x) => x < 0), mode.endsWith('flip'), mode);
  }
});

test('tile editor: each mode and tile builds; flipped tiles show a mirror-image reference tile with the right edges editable', () => {
  const count = (svg, re) => (svg.match(re) ?? []).length;
  const hits = (mode, tile) => {
    const sample = retile(raw({}, 6), mode), classes = edgeClasses(sample), shape = shapeFor(mode, curve, {});
    const svg = tileEditorSVG({ sample, classes, shape, tile });
    assert.ok(svg.startsWith('<svg') && !/NaN|undefined/.test(svg), `${mode} ${tile}`);
    return { svg, hits: count(svg, /class="hit"/g), handles: count(svg, /class="handle"/g), locked: count(svg, /class="edge locked"/g) };
  };
  const labels = (mode) => tileChoices(retile(raw(), mode)).map((c) => c.label).join('');
  assert.deepEqual(ids.map(labels), ['A', 'A', 'AB', 'AB', 'ABC', 'ABC']);
  assert.deepEqual([hits('single').hits, hits('single').locked], [3, 0]);
  assert.deepEqual([hits('single-flip').hits, hits('single-flip').locked], [2, 1]);
  assert.deepEqual([hits('pair', 'tri').hits, hits('pair', 'tri_b').hits], [3, 3]);
  assert.deepEqual([hits('pair-flip', 'tri').hits, hits('pair-flip', 'tri_b').hits], [3, 3]);
  assert.deepEqual([hits('triple-flip', 'tri_c').hits, hits('triple-flip', 'tri_c').locked], [2, 1]);
  assert.ok(hits('pair-flip', 'tri_b').svg.includes('class="ghosts"'));
});

test('project files: triangle modes survive sanitizeShape', () => {
  for (const mode of ids.slice(1)) assert.equal(sanitizeShape({ generator: 'triangle', mode, edges: {} }).shape.mode, mode);
  assert.equal(sanitizeShape({ generator: 'triangle', mode: 'single', edges: {} }).shape.mode, undefined);
});

test('the Shape tab offers shape count and variant separately; together they pick one of the six modes (squares too)', () => {
  assert.deepEqual(shapeCounts('triangle'), [1, 2, 3]);
  assert.deepEqual(variantsOf('triangle').map(([id]) => id), ['rotated', 'flipped']);
  const picked = [1, 2, 3].flatMap((n) => ['rotated', 'flipped'].map((v) => modeFor('triangle', n, v)));
  assert.deepEqual(picked, ids);
  assert.deepEqual(shapeCounts('square'), [1, 2]);
  assert.deepEqual([1, 2].flatMap((n) => variantsOf('square').map(([v]) => modeFor('square', n, v))),
    ['single', 'turn-cw', 'turn-ccw', 'pair', 'pair-turn-cw', 'pair-turn-ccw']);
  assert.equal(modeFor('triangle', 3, 'nope'), 'triple'); // unknown variant: same count
});
import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/generators/index.js';
import * as triangle from '../js/generators/periodic/triangle.js';
import { defaults, viewParams } from '../js/params/schema.js';
import { apply } from '../js/core/affine.js';
import { flattenPath, pathPoints } from '../js/core/path.js';
import { edgeClasses } from '../js/editor/classes.js';
import { DEFAULT_MODE, describeEdges, getMode, modesOf, retile } from '../js/editor/modes.js';
import { applyShape, canEdit, edgeFromPoints, shapeProblems, sanitizeShape } from '../js/editor/shape.js';
import { tileChoices, tileEditorSVG } from '../js/ui/tile-editor-svg.js';
import { buildSVG, editorModel } from '../js/app/pipeline.js';
import { styleParams } from '../js/style/colorings.js';

const SIZE = 60, ids = ['single', 'single-flip', 'pair', 'pair-flip', 'triple', 'triple-flip'];
const SETTINGS = [{}, { rotation: 23 }, { orientMode: 'cycle' }, { rotation: -90, orientMode: 'rows' }, { orientMode: 'checker', originX: 11, originY: -5 }];
const raw = (extra = {}, k = 5) => triangle.generate({ ...defaults(triangle.params), size: SIZE, ...extra }, [-k * SIZE, -k * SIZE, k * SIZE, k * SIZE]);
const det = (m) => m[0] * m[3] - m[1] * m[2];
const describe = (mode, extra) => { const ir = retile(raw(extra), mode); return describeEdges(ir, edgeClasses(ir), 'triangle'); };
const kinds = (mode, extra) => edgeClasses(retile(raw(extra), mode)).map((c) => `${c.kind}${c.members.length}`);
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('six triangle modes: one, two or three shapes, each rotated or flipped; the default is first', () => {
  assert.deepEqual(modesOf('triangle').map((m) => m.id), ids);
  assert.deepEqual(modesOf('triangle').map((m) => m.shapes), [1, 1, 2, 2, 3, 3]);
  assert.equal(modesOf('triangle')[0].id, DEFAULT_MODE);
  assert.equal(getMode('triangle', 'nope').id, DEFAULT_MODE);
  assert.ok(canEdit('triangle', defaults(triangle.params)).ok);
});

test('what each mode says about its edges, whatever the tiling rotation or generator orientation', () => {
  const want = {
    single: ['right (half-turn symmetric)', 'bottom (half-turn symmetric)', 'left (half-turn symmetric)'],
    'single-flip': ['right = left', 'bottom (locked)'],
    pair: ['A right = B right', 'A bottom = B bottom', 'A left = B left'],
    'pair-flip': ['A right = B left', 'A bottom = B bottom', 'A left = B right'],
    triple: ['A right (half-turn symmetric)', 'A bottom = B bottom = C bottom (half-turn symmetric)', 'A left (half-turn symmetric)',
      'B right (half-turn symmetric)', 'B left (half-turn symmetric)', 'C right (half-turn symmetric)', 'C left (half-turn symmetric)'],
    'triple-flip': ['A right = A left', 'A bottom = B bottom = C bottom (locked)', 'B right = B left', 'C right = C left'],
  };
  for (const id of ids) for (const extra of SETTINGS) assert.deepEqual(describe(id, extra), want[id], `${id} ${JSON.stringify(extra)}`);
});

test('retile: shapes per mode, flipped tiles are exactly the down triangles, and the drawing never changes', () => {
  const r = raw({ orientMode: 'cycle' }), outline = (ir, t) => ir.prototiles[t.proto].edges.flatMap((e) => pathPoints(e.path).slice(0, -1)).map((p) => apply(t.transform, p));
  const key = (pts) => pts.map((p) => p.map((v) => (Math.round(v * 1e6) / 1e6 + 0).toFixed(3)).join(',')).sort().join(' ');
  const bag = (ir) => ir.tiles.map((t) => key(outline(ir, t))).sort();
  for (const m of modesOf('triangle')) {
    const ir = retile(r, m.id);
    assert.equal(Object.keys(ir.prototiles).length, m.shapes, m.id);
    assert.deepEqual(Object.values(ir.prototiles).map((p) => p.tileClass.label), ['A', 'B', 'C'].slice(0, m.shapes));
    assert.deepEqual(bag(ir), bag(r), `${m.id}: same triangles in the same places`);
    assert.equal(retile(ir, m.id), ir, 'idempotent');
    const flip = m.id.endsWith('-flip');
    for (const t of ir.tiles) {
      assert.equal(t.orient.flip, flip && !t.tags.cls === false, `${m.id}: only down triangles are flipped`);
      assert.equal(det(t.transform) < 0, t.orient.flip);
      assert.equal(t.orient.rot, t.tags.cls ? 3 : 0, 'the half-turn of a down triangle stays in orient.rot');
    }
  }
  // changing mode from an already re-tiled IR gives the same result as from the raw one
  const via = retile(retile(r, 'triple-flip'), 'pair'), direct = retile(r, 'pair');
  assert.deepEqual(via.tiles.map((t) => t.transform.map((v) => +v.toFixed(9))), direct.tiles.map((t) => t.transform.map((v) => +v.toFixed(9))));
});

test('classes by mode: rotated gives free or point-symmetric edges, flipped gives free edges and one straight mirror line', () => {
  assert.deepEqual(kinds('single'), ['symmetric1', 'symmetric1', 'symmetric1']);
  assert.deepEqual(kinds('single-flip'), ['free2', 'locked1']);
  assert.deepEqual(kinds('pair'), ['free2', 'free2', 'free2']);
  assert.deepEqual(kinds('pair-flip'), ['free2', 'free2', 'free2']);
  assert.deepEqual(kinds('triple').filter((k) => k !== 'symmetric1'), ['symmetric3']);
  assert.equal(kinds('triple').length, 7);
  assert.deepEqual(kinds('triple-flip'), ['free2', 'locked3', 'free2', 'free2']);
  const flipped = edgeClasses(retile(raw(), 'single-flip')).find((c) => c.kind === 'locked');
  assert.match(flipped.reason, /disagree/);
});

// every pair of tile edges that share their end points must carry the same curve (either way round)
function fit(ir) {
  const groups = new Map(), r = (v) => Math.round(v * 1e4);
  for (const t of ir.tiles) for (const e of ir.prototiles[t.proto].edges) {
    const pts = flattenPath(e.path, 12).map((p) => apply(t.transform, p)), [a, b] = [pts[0], pts.at(-1)];
    const key = [a, b].map((p) => `${r(p[0])},${r(p[1])}`).sort().join('|');
    (groups.get(key) ?? groups.set(key, []).get(key)).push(pts);
  }
  let checked = 0, worst = 0;
  for (const g of groups.values()) {
    if (g.length !== 2) { assert.ok(g.length === 1, 'an edge is shared by two tiles at most'); continue; }
    const [p, q] = g, same = Math.hypot(p[0][0] - q[0][0], p[0][1] - q[0][1]) < 1e-6, Q = same ? q : [...q].reverse();
    worst = Math.max(worst, ...p.map((x, i) => Math.hypot(x[0] - Q[i][0], x[1] - Q[i][1])));
    checked++;
  }
  return { checked, worst };
}
const curve = (c) => (c.kind === 'symmetric' ? [['M', 0, 0], ['C', 0.1, 0.3, 0.3, 0.3, 0.5, 0]] : [['M', 0, 0], ['C', 0.2, 0.3, 0.6, -0.25, 1, 0]]);
const polyline = (c, i) => edgeFromPoints([[0.25, 0.12 + 0.02 * i], [0.6, -0.1]], c.kind);
const shapeFor = (mode, make, extra) => {
  const edges = {};
  edgeClasses(retile(raw(extra), mode)).forEach((c, i) => { if (c.kind !== 'locked') (edges[c.rep.proto] ??= {})[c.rep.edge] = make(c, i); });
  return { generator: 'triangle', ...(mode !== DEFAULT_MODE && { mode }), edges };
};

test('every mode, curves and polylines, any rotation or orientation: edited tiles still meet exactly and outlines stay closed', () => {
  for (const mode of ids) for (const make of [curve, polyline]) for (const extra of SETTINGS) {
    const ir = raw(extra), s = shapeFor(mode, make, extra), shaped = applyShape(ir, s), label = `${mode} ${make.name} ${JSON.stringify(extra)}`;
    assert.deepEqual(shapeProblems(ir, s), [], label);
    const { checked, worst } = fit(shaped);
    assert.ok(checked > 60 && worst < 1e-9, `${label}: ${checked} shared edges, worst ${worst}`);
    for (const proto of Object.values(shaped.prototiles)) {
      const ends = proto.edges.map((e) => [pathPoints(e.path)[0], pathPoints(e.path).at(-1)]);
      ends.forEach(([, b], n) => assert.ok(b.every((v, k) => close(v, ends[(n + 1) % 3][0][k])), `${label}: closed`));
    }
    assert.equal(Object.keys(shaped.prototiles).length, getMode('triangle', mode).shapes);
  }
});

test('mode single-flip: bending the right edge bends the left one as its mirror image; the bottom stays straight', () => {
  const s = { generator: 'triangle', mode: 'single-flip', edges: { tri: { e0: [['M', 0, 0], ['L', 0.5, 0.3], ['L', 1, 0]] } } };
  const shaped = applyShape(raw(), s), P = (n) => pathPoints(shaped.prototiles.tri.edges[n].path);
  assert.equal(P(0).length, 3); assert.equal(P(2).length, 3); assert.equal(P(1).length, 2);
  assert.ok(fit(shaped).worst < 1e-9);
  // the left edge bulges outwards by the same amount as the right one (a mirror image across the tile's axis)
  const bulge = (n) => { const [a, m, b] = P(n), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; return Math.hypot(m[0] - mid[0], m[1] - mid[1]); };
  assert.ok(close(bulge(0), bulge(2), 1e-9) && bulge(0) > 1);
});

test('mode pair-flip: A right = B left, so bending A\'s right edge dents B\'s left edge; B is drawn as a mirror image', () => {
  const s = { generator: 'triangle', mode: 'pair-flip', edges: { tri: { e0: [['M', 0, 0], ['L', 0.5, 0.25], ['L', 1, 0]] } } };
  const shaped = applyShape(raw(), s);
  assert.equal(pathPoints(shaped.prototiles.tri.edges[0].path).length, 3);
  assert.equal(pathPoints(shaped.prototiles.tri_b.edges[2].path).length, 3);   // B left
  assert.equal(pathPoints(shaped.prototiles.tri_b.edges[0].path).length, 2);   // B right: not touched
  assert.ok(fit(shaped).worst < 1e-9);
});

test('the same edits mean different tilings in different triangle modes', () => {
  const edges = { tri: { e0: [['M', 0, 0], ['L', 0.5, 0.3], ['L', 1, 0]] } };
  const d = (mode) => JSON.stringify(applyShape(raw(), { generator: 'triangle', mode, edges }).prototiles);
  assert.notEqual(d('pair'), d('pair-flip'));
  assert.notEqual(d('single-flip'), d('pair-flip'));
});

test('pipeline: the editor model and the SVG work in every mode, flipped tiles render as mirrored <use> transforms', () => {
  const style = defaults(styleParams), view = { ...defaults(viewParams), width: 400, height: 300 };
  for (const mode of ids) {
    const shape = shapeFor(mode, curve, {}), state = { generator: 'triangle', params: { ...defaults(triangle.params), size: SIZE }, style, view, shape };
    const model = editorModel(state);
    assert.equal(model.mode, mode);
    assert.equal(Object.keys(model.sample.prototiles).length, getMode('triangle', mode).shapes);
    const svg = buildSVG(state);
    assert.ok(svg.startsWith('<svg') && !/NaN|undefined/.test(svg), mode);
    const dets = [...svg.matchAll(/<use [^>]*matrix\(([^)]*)\)/g)].map((m) => det(m[1].split(/[ ,]+/).map(Number)));
    assert.ok(dets.length > 10, mode);
    assert.equal(dets.some((x) => x < 0), mode.endsWith('flip'), mode);
  }
});

test('tile editor: each mode and tile builds; flipped tiles show a mirror-image reference tile with the right edges editable', () => {
  const count = (svg, re) => (svg.match(re) ?? []).length;
  const hits = (mode, tile) => {
    const sample = retile(raw({}, 6), mode), classes = edgeClasses(sample), shape = shapeFor(mode, curve, {});
    const svg = tileEditorSVG({ sample, classes, shape, tile });
    assert.ok(svg.startsWith('<svg') && !/NaN|undefined/.test(svg), `${mode} ${tile}`);
    return { svg, hits: count(svg, /class="hit"/g), handles: count(svg, /class="handle"/g), locked: count(svg, /class="edge locked"/g) };
  };
  const labels = (mode) => tileChoices(retile(raw(), mode)).map((c) => c.label).join('');
  assert.deepEqual(ids.map(labels), ['A', 'A', 'AB', 'AB', 'ABC', 'ABC']);
  assert.deepEqual([hits('single').hits, hits('single').locked], [3, 0]);
  assert.deepEqual([hits('single-flip').hits, hits('single-flip').locked], [2, 1]);
  assert.deepEqual([hits('pair', 'tri').hits, hits('pair', 'tri_b').hits], [3, 3]);
  assert.deepEqual([hits('pair-flip', 'tri').hits, hits('pair-flip', 'tri_b').hits], [3, 3]);
  assert.deepEqual([hits('triple-flip', 'tri_c').hits, hits('triple-flip', 'tri_c').locked], [2, 1]);
  assert.ok(hits('pair-flip', 'tri_b').svg.includes('class="ghosts"'));
});

test('project files: triangle modes survive sanitizeShape', () => {
  for (const mode of ids.slice(1)) assert.equal(sanitizeShape({ generator: 'triangle', mode, edges: {} }).shape.mode, mode);
  assert.equal(sanitizeShape({ generator: 'triangle', mode: 'single', edges: {} }).shape.mode, undefined);
});
import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/generators/index.js';
import * as triangle from '../js/generators/periodic/triangle.js';
import { defaults, viewParams } from '../js/params/schema.js';
import { apply } from '../js/core/affine.js';
import { flattenPath, pathPoints } from '../js/core/path.js';
import { edgeClasses } from '../js/editor/classes.js';
import { DEFAULT_MODE, describeEdges, getMode, modesOf, retile } from '../js/editor/modes.js';
import { applyShape, canEdit, edgeFromPoints, shapeProblems, sanitizeShape } from '../js/editor/shape.js';
import { tileChoices, tileEditorSVG } from '../js/ui/tile-editor-svg.js';
import { buildSVG, editorModel } from '../js/app/pipeline.js';
import { styleParams } from '../js/style/colorings.js';

const SIZE = 60, ids = ['single', 'single-flip', 'pair', 'pair-flip', 'triple', 'triple-flip'];
const SETTINGS = [{}, { rotation: 23 }, { orientMode: 'cycle' }, { rotation: -90, orientMode: 'rows' }, { orientMode: 'checker', originX: 11, originY: -5 }];
const raw = (extra = {}, k = 5) => triangle.generate({ ...defaults(triangle.params), size: SIZE, ...extra }, [-k * SIZE, -k * SIZE, k * SIZE, k * SIZE]);
const det = (m) => m[0] * m[3] - m[1] * m[2];
const describe = (mode, extra) => { const ir = retile(raw(extra), mode); return describeEdges(ir, edgeClasses(ir), 'triangle'); };
const kinds = (mode, extra) => edgeClasses(retile(raw(extra), mode)).map((c) => `${c.kind}${c.members.length}`);
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('six triangle modes: one, two or three shapes, each rotated or flipped; the default is first', () => {
  assert.deepEqual(modesOf('triangle').map((m) => m.id), ids);
  assert.deepEqual(modesOf('triangle').map((m) => m.shapes), [1, 1, 2, 2, 3, 3]);
  assert.equal(modesOf('triangle')[0].id, DEFAULT_MODE);
  assert.equal(getMode('triangle', 'nope').id, DEFAULT_MODE);
  assert.ok(canEdit('triangle', defaults(triangle.params)).ok);
});

test('what each mode says about its edges, whatever the tiling rotation or generator orientation', () => {
  const want = {
    single: ['right (half-turn symmetric)', 'bottom (half-turn symmetric)', 'left (half-turn symmetric)'],
    'single-flip': ['right = left', 'bottom (locked)'],
    pair: ['A right = B right', 'A bottom = B bottom', 'A left = B left'],
    'pair-flip': ['A right = B left', 'A bottom = B bottom', 'A left = B right'],
    triple: ['A right (half-turn symmetric)', 'A bottom = B bottom = C bottom (half-turn symmetric)', 'A left (half-turn symmetric)',
      'B right (half-turn symmetric)', 'B left (half-turn symmetric)', 'C right (half-turn symmetric)', 'C left (half-turn symmetric)'],
    'triple-flip': ['A right = A left', 'A bottom = B bottom = C bottom (locked)', 'B right = B left', 'C right = C left'],
  };
  for (const id of ids) for (const extra of SETTINGS) assert.deepEqual(describe(id, extra), want[id], `${id} ${JSON.stringify(extra)}`);
});

test('retile: shapes per mode, flipped tiles are exactly the down triangles, and the drawing never changes', () => {
  const r = raw({ orientMode: 'cycle' }), outline = (ir, t) => ir.prototiles[t.proto].edges.flatMap((e) => pathPoints(e.path).slice(0, -1)).map((p) => apply(t.transform, p));
  const key = (pts) => pts.map((p) => p.map((v) => (Math.round(v * 1e6) / 1e6 + 0).toFixed(3)).join(',')).sort().join(' ');
  const bag = (ir) => ir.tiles.map((t) => key(outline(ir, t))).sort();
  for (const m of modesOf('triangle')) {
    const ir = retile(r, m.id);
    assert.equal(Object.keys(ir.prototiles).length, m.shapes, m.id);
    assert.deepEqual(Object.values(ir.prototiles).map((p) => p.tileClass.label), ['A', 'B', 'C'].slice(0, m.shapes));
    assert.deepEqual(bag(ir), bag(r), `${m.id}: same triangles in the same places`);
    assert.equal(retile(ir, m.id), ir, 'idempotent');
    const flip = m.id.endsWith('-flip');
    for (const t of ir.tiles) {
      assert.equal(t.orient.flip, flip && !t.tags.cls === false, `${m.id}: only down triangles are flipped`);
      assert.equal(det(t.transform) < 0, t.orient.flip);
      assert.equal(t.orient.rot, t.tags.cls ? 3 : 0, 'the half-turn of a down triangle stays in orient.rot');
    }
  }
  // changing mode from an already re-tiled IR gives the same result as from the raw one
  const via = retile(retile(r, 'triple-flip'), 'pair'), direct = retile(r, 'pair');
  assert.deepEqual(via.tiles.map((t) => t.transform.map((v) => +v.toFixed(9))), direct.tiles.map((t) => t.transform.map((v) => +v.toFixed(9))));
});

test('classes by mode: rotated gives free or point-symmetric edges, flipped gives free edges and one straight mirror line', () => {
  assert.deepEqual(kinds('single'), ['symmetric1', 'symmetric1', 'symmetric1']);
  assert.deepEqual(kinds('single-flip'), ['free2', 'locked1']);
  assert.deepEqual(kinds('pair'), ['free2', 'free2', 'free2']);
  assert.deepEqual(kinds('pair-flip'), ['free2', 'free2', 'free2']);
  assert.deepEqual(kinds('triple').filter((k) => k !== 'symmetric1'), ['symmetric3']);
  assert.equal(kinds('triple').length, 7);
  assert.deepEqual(kinds('triple-flip'), ['free2', 'locked3', 'free2', 'free2']);
  const flipped = edgeClasses(retile(raw(), 'single-flip')).find((c) => c.kind === 'locked');
  assert.match(flipped.reason, /disagree/);
});

// every pair of tile edges that share their end points must carry the same curve (either way round)
function fit(ir) {
  const groups = new Map(), r = (v) => Math.round(v * 1e4);
  for (const t of ir.tiles) for (const e of ir.prototiles[t.proto].edges) {
    const pts = flattenPath(e.path, 12).map((p) => apply(t.transform, p)), [a, b] = [pts[0], pts.at(-1)];
    const key = [a, b].map((p) => `${r(p[0])},${r(p[1])}`).sort().join('|');
    (groups.get(key) ?? groups.set(key, []).get(key)).push(pts);
  }
  let checked = 0, worst = 0;
  for (const g of groups.values()) {
    if (g.length !== 2) { assert.ok(g.length === 1, 'an edge is shared by two tiles at most'); continue; }
    const [p, q] = g, same = Math.hypot(p[0][0] - q[0][0], p[0][1] - q[0][1]) < 1e-6, Q = same ? q : [...q].reverse();
    worst = Math.max(worst, ...p.map((x, i) => Math.hypot(x[0] - Q[i][0], x[1] - Q[i][1])));
    checked++;
  }
  return { checked, worst };
}
const curve = (c) => (c.kind === 'symmetric' ? [['M', 0, 0], ['C', 0.1, 0.3, 0.3, 0.3, 0.5, 0]] : [['M', 0, 0], ['C', 0.2, 0.3, 0.6, -0.25, 1, 0]]);
const polyline = (c, i) => edgeFromPoints([[0.25, 0.12 + 0.02 * i], [0.6, -0.1]], c.kind);
const shapeFor = (mode, make, extra) => {
  const edges = {};
  edgeClasses(retile(raw(extra), mode)).forEach((c, i) => { if (c.kind !== 'locked') (edges[c.rep.proto] ??= {})[c.rep.edge] = make(c, i); });
  return { generator: 'triangle', ...(mode !== DEFAULT_MODE && { mode }), edges };
};

test('every mode, curves and polylines, any rotation or orientation: edited tiles still meet exactly and outlines stay closed', () => {
  for (const mode of ids) for (const make of [curve, polyline]) for (const extra of SETTINGS) {
    const ir = raw(extra), s = shapeFor(mode, make, extra), shaped = applyShape(ir, s), label = `${mode} ${make.name} ${JSON.stringify(extra)}`;
    assert.deepEqual(shapeProblems(ir, s), [], label);
    const { checked, worst } = fit(shaped);
    assert.ok(checked > 60 && worst < 1e-9, `${label}: ${checked} shared edges, worst ${worst}`);
    for (const proto of Object.values(shaped.prototiles)) {
      const ends = proto.edges.map((e) => [pathPoints(e.path)[0], pathPoints(e.path).at(-1)]);
      ends.forEach(([, b], n) => assert.ok(b.every((v, k) => close(v, ends[(n + 1) % 3][0][k])), `${label}: closed`));
    }
    assert.equal(Object.keys(shaped.prototiles).length, getMode('triangle', mode).shapes);
  }
});

test('mode single-flip: bending the right edge bends the left one as its mirror image; the bottom stays straight', () => {
  const s = { generator: 'triangle', mode: 'single-flip', edges: { tri: { e0: [['M', 0, 0], ['L', 0.5, 0.3], ['L', 1, 0]] } } };
  const shaped = applyShape(raw(), s), P = (n) => pathPoints(shaped.prototiles.tri.edges[n].path);
  assert.equal(P(0).length, 3); assert.equal(P(2).length, 3); assert.equal(P(1).length, 2);
  assert.ok(fit(shaped).worst < 1e-9);
  // the left edge bulges outwards by the same amount as the right one (a mirror image across the tile's axis)
  const bulge = (n) => { const [a, m, b] = P(n), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; return Math.hypot(m[0] - mid[0], m[1] - mid[1]); };
  assert.ok(close(bulge(0), bulge(2), 1e-9) && bulge(0) > 1);
});

test('mode pair-flip: A right = B left, so bending A\'s right edge dents B\'s left edge; B is drawn as a mirror image', () => {
  const s = { generator: 'triangle', mode: 'pair-flip', edges: { tri: { e0: [['M', 0, 0], ['L', 0.5, 0.25], ['L', 1, 0]] } } };
  const shaped = applyShape(raw(), s);
  assert.equal(pathPoints(shaped.prototiles.tri.edges[0].path).length, 3);
  assert.equal(pathPoints(shaped.prototiles.tri_b.edges[2].path).length, 3);   // B left
  assert.equal(pathPoints(shaped.prototiles.tri_b.edges[0].path).length, 2);   // B right: not touched
  assert.ok(fit(shaped).worst < 1e-9);
});

test('the same edits mean different tilings in different triangle modes', () => {
  const edges = { tri: { e0: [['M', 0, 0], ['L', 0.5, 0.3], ['L', 1, 0]] } };
  const d = (mode) => JSON.stringify(applyShape(raw(), { generator: 'triangle', mode, edges }).prototiles);
  assert.notEqual(d('pair'), d('pair-flip'));
  assert.notEqual(d('single-flip'), d('pair-flip'));
});

test('pipeline: the editor model and the SVG work in every mode, flipped tiles render as mirrored <use> transforms', () => {
  const style = defaults(styleParams), view = { ...defaults(viewParams), width: 400, height: 300 };
  for (const mode of ids) {
    const shape = shapeFor(mode, curve, {}), state = { generator: 'triangle', params: { ...defaults(triangle.params), size: SIZE }, style, view, shape };
    const model = editorModel(state);
    assert.equal(model.mode, mode);
    assert.equal(Object.keys(model.sample.prototiles).length, getMode('triangle', mode).shapes);
    const svg = buildSVG(state);
    assert.ok(svg.startsWith('<svg') && !/NaN|undefined/.test(svg), mode);
    const dets = [...svg.matchAll(/<use [^>]*matrix\(([^)]*)\)/g)].map((m) => det(m[1].split(/[ ,]+/).map(Number)));
    assert.ok(dets.length > 10, mode);
    assert.equal(dets.some((x) => x < 0), mode.endsWith('flip'), mode);
  }
});

test('tile editor: each mode and tile builds; flipped tiles show a mirror-image reference tile with the right edges editable', () => {
  const count = (svg, re) => (svg.match(re) ?? []).length;
  const hits = (mode, tile) => {
    const sample = retile(raw({}, 6), mode), classes = edgeClasses(sample), shape = shapeFor(mode, curve, {});
    const svg = tileEditorSVG({ sample, classes, shape, tile });
    assert.ok(svg.startsWith('<svg') && !/NaN|undefined/.test(svg), `${mode} ${tile}`);
    return { svg, hits: count(svg, /class="hit"/g), handles: count(svg, /class="handle"/g), locked: count(svg, /class="edge locked"/g) };
  };
  const labels = (mode) => tileChoices(retile(raw(), mode)).map((c) => c.label).join('');
  assert.deepEqual(ids.map(labels), ['A', 'A', 'AB', 'AB', 'ABC', 'ABC']);
  assert.deepEqual([hits('single').hits, hits('single').locked], [3, 0]);
  assert.deepEqual([hits('single-flip').hits, hits('single-flip').locked], [2, 1]);
  assert.deepEqual([hits('pair', 'tri').hits, hits('pair', 'tri_b').hits], [3, 3]);
  assert.deepEqual([hits('pair-flip', 'tri').hits, hits('pair-flip', 'tri_b').hits], [3, 3]);
  assert.deepEqual([hits('triple-flip', 'tri_c').hits, hits('triple-flip', 'tri_c').locked], [2, 1]);
  assert.ok(hits('pair-flip', 'tri_b').svg.includes('class="ghosts"'));
});

test('project files: triangle modes survive sanitizeShape', () => {
  for (const mode of ids.slice(1)) assert.equal(sanitizeShape({ generator: 'triangle', mode, edges: {} }).shape.mode, mode);
  assert.equal(sanitizeShape({ generator: 'triangle', mode: 'single', edges: {} }).shape.mode, undefined);
});
