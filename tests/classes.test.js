import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/generators/index.js';
import { get, list } from '../js/generators/registry.js';
import { defaults } from '../js/params/schema.js';
import { edgeClasses, slotKey } from '../js/editor/classes.js';
import { DEFAULT_MODE, modesOf, getMode, retile, describeEdges } from '../js/editor/modes.js';
import { pairClasses } from '../js/editor/pairing.js';
import { apply, translate } from '../js/core/affine.js';

const SIZE = 60;
const irOf = (id, extra = {}, k = 4) => {
  const g = get(id), p = { ...defaults(g.params), size: SIZE, ...extra };
  return g.generate(p, [-k * SIZE, -k * SIZE, k * SIZE, k * SIZE]);
};
const tiled = (mode, extra, k) => retile(irOf('square', extra, k), mode);
const describe = (mode, extra, k) => { const ir = tiled(mode, extra, k); return describeEdges(ir, edgeClasses(ir), 'square'); };
const summary = (cs) => cs.map((c) => `${c.kind[0]}[${c.members.map((m) => `${m.proto}.${m.edge}${m.reversed ? 'r' : ''}`).join(' ')}]`);

test('the six square modes, simplest first, with the default first', () => {
  assert.deepEqual(modesOf('square').map((m) => m.id), ['single', 'pair', 'turn-cw', 'turn-ccw', 'pair-turn-cw', 'pair-turn-ccw']);
  assert.equal(DEFAULT_MODE, 'single');
  assert.equal(getMode('square', 'nope').id, 'single'); // unknown ids fall back
  assert.equal(getMode('hexagon', 'single'), null);     // no modes yet
});

test('mode 1, one shape, no turns: right = left, top = bottom', () => {
  assert.deepEqual(describe('single'), ['top = bottom', 'right = left']);
});

test('mode 2, two shapes, no turns: A right = B left, A top = B bottom (and the reverse)', () => {
  assert.deepEqual(describe('pair'), ['A top = B bottom', 'A right = B left', 'A bottom = B top', 'A left = B right']);
});

test('mode 3, one shape, quarter turns: right = bottom, left = top; the other direction mirrors it', () => {
  assert.deepEqual(describe('turn-cw'), ['top = left', 'right = bottom']);
  assert.deepEqual(describe('turn-ccw'), ['top = right', 'bottom = left']);
});

test('mode 4, two shapes, quarter turns: A right = B bottom, A left = B top (and the reverse); the other direction mirrors it', () => {
  assert.deepEqual(describe('pair-turn-cw'), ['A top = B left', 'A right = B bottom', 'A bottom = B right', 'A left = B top']);
  assert.deepEqual(describe('pair-turn-ccw'), ['A top = B right', 'A right = B top', 'A bottom = B left', 'A left = B bottom']);
});

test('every mode gives only free classes (no locked or symmetric edges), whatever the generator orientation setting or tiling rotation', () => {
  for (const mode of modesOf('square')) for (const extra of [{}, { rotation: 17 }, { orientMode: 'cycle' }, { rotation: -90, orientMode: 'rows' }]) {
    const cs = edgeClasses(tiled(mode.id, extra));
    assert.ok(cs.every((c) => c.kind === 'free'), `${mode.id} ${JSON.stringify(extra)}`);
    assert.equal(cs.length, mode.shapes === 1 ? 2 : 4, mode.id);
    assert.ok(cs.every((c) => c.members.length === (mode.shapes === 1 ? 2 : 2)));
  }
});

test('retile: shapes per mode, upright tiles keep the prototile id, turns are set, the drawing is unchanged', () => {
  const raw = irOf('square', { orientMode: 'checker' }), pair = retile(raw, 'pair-turn-cw');
  assert.deepEqual(Object.keys(pair.prototiles), ['sq', 'sq_b']);
  assert.deepEqual(Object.values(pair.prototiles).map((p) => p.tileClass.label), ['A', 'B']);
  assert.equal(pair.meta.mode, 'pair-turn-cw');
  assert.equal(retile(pair, 'pair-turn-cw'), pair); // idempotent
  assert.deepEqual(Object.keys(retile(raw, 'turn-cw').prototiles), ['sq']);
  for (const t of pair.tiles) { // shape by checkerboard parity, turn by the pinwheel table
    const i = t.tags.i, j = t.tags.j, mod = (a) => ((a % 2) + 2) % 2;
    assert.equal(t.proto, (i + j) % 2 === 0 || mod(i + j) === 0 ? 'sq' : 'sq_b');
    assert.equal(t.orient.rot, [[0, 3], [1, 2]][mod(i)][mod(j)]);
  }
  // squares are symmetric: every tile covers exactly the same points as before, only its edge labels moved
  const corners = (t, ir) => ir.prototiles[t.proto].edges.map((e) => apply(t.transform, e.path[0].slice(1))).map((p) => p.map((v) => Math.round(v * 1e6)).join(',')).sort().join(';');
  raw.tiles.forEach((t, k) => assert.equal(corners(t, pair), corners(raw.tiles[k], raw)));
});

test('retile undoes turns the generator already applied, so the Orientation setting never leaks into a mode', () => {
  const a = retile(irOf('square', { orientMode: 'cycle' }), 'pair'), b = retile(irOf('square'), 'pair');
  assert.deepEqual(a.tiles.map((t) => t.transform.map((v) => +v.toFixed(9))), b.tiles.map((t) => t.transform.map((v) => +v.toFixed(9))));
  assert.ok(a.tiles.every((t) => t.orient.rot === 0));
});

test('retile leaves generators without modes alone', () => {
  const hex = irOf('hexagon');
  assert.equal(retile(hex, 'pair'), hex);
});

test('square, one shape: two free classes matching the generator pair metadata (and hexagon likewise)', () => {
  for (const id of ['square', 'hexagon']) {
    const ir = irOf(id), cs = edgeClasses(ir), pid = Object.keys(ir.prototiles)[0], stat = pairClasses(ir.prototiles[pid]);
    assert.equal(cs.length, stat.length, id);
    stat.forEach((s, i) => {
      assert.equal(cs[i].rep.edge, s.rep, id);
      assert.equal(cs[i].kind, 'free', id);
      const m = cs[i].members[1];
      assert.equal(m.edge, s.partner);
      assert.ok(m.reversed);
      for (const pt of [[0, 0], [10, -7]]) assert.ok(Math.hypot(...apply(m.transform, pt).map((v, k) => v - apply(s.transform, pt)[k])) < 1e-6, id);
    });
  }
  assert.deepEqual(edgeClasses(irOf('square'))[0].members[1].transform, translate(0, SIZE));
});

test('quarter turns: a shape turned to meet itself: right and bottom are the same curve a quarter turn about their shared corner', () => {
  const ir = tiled('turn-cw'), [, right] = edgeClasses(ir), h = SIZE / 2;
  assert.deepEqual(right.members.map((m) => m.edge), ['e1', 'e2']);
  const m = right.members[1].transform; // e1 -> e2: right edge onto the bottom edge
  const corner = [h, h]; // bottom-right corner, the 4-fold centre
  assert.ok(Math.hypot(...apply(m, corner).map((v, k) => v - corner[k])) < 1e-9);
  assert.ok(Math.hypot(...apply(m, [h, 0]).map((v, k) => v - [0, h][k])) < 1e-9); // middle of right edge -> middle of bottom edge
});

test('tilings that are not edge to edge lock what cannot match: a row shift locks top/bottom, twist locks all', () => {
  const cs = edgeClasses(irOf('square', { rowShift: 0.5 }));
  assert.deepEqual(summary(cs), ['l[sq.e0]', 'f[sq.e1 sq.e3r]', 'l[sq.e2]']);
  assert.match(cs[0].reason, /no matching neighbour/);
  assert.ok(edgeClasses(irOf('square', { twistMode: 'rows', twistStep: 5 })).every((c) => c.kind === 'locked'));
});

test('without modes the IR is read as given: tiles of one shape in several orientations share it (hexagon, triangle)', () => {
  assert.deepEqual(summary(edgeClasses(irOf('hexagon'))), ['f[hex.e0 hex.e3r]', 'f[hex.e1 hex.e4r]', 'f[hex.e2 hex.e5r]']);
  assert.deepEqual(summary(edgeClasses(irOf('triangle'))), ['s[tri.e0]', 's[tri.e1]', 's[tri.e2]']); // up and down triangles share a shape: half-turn symmetric edges
  for (const id of ['hexagon', 'triangle']) for (const orientMode of ['none', 'checker', 'rows', 'cycle']) {
    const cs = edgeClasses(irOf(id, { orientMode }));
    assert.ok(cs.length >= 1 && cs.every((c) => c.kind !== 'locked'), `${id} ${orientMode}: ${summary(cs)}`);
  }
});

test('classes do not depend on the patch size, and every class starts with its representative', () => {
  assert.deepEqual(summary(edgeClasses(tiled('pair-turn-cw', {}, 3))), summary(edgeClasses(tiled('pair-turn-cw', {}, 6))));
  for (const g of list()) {
    const ir = g.generate(defaults(g.params), [-300, -300, 300, 300]);
    for (const c of edgeClasses(ir)) {
      assert.deepEqual(c.members[0].transform, [1, 0, 0, 1, 0, 0]);
      assert.equal(c.members[0].reversed, false);
      assert.equal(slotKey(c.members[0]), slotKey(c.rep));
    }
  }
});

test('every registered generator yields classes without throwing (tilings with no pair metadata too)', () => {
  for (const g of list()) assert.doesNotThrow(() => edgeClasses(g.generate(defaults(g.params), [-200, -200, 200, 200])), g.id);
});
