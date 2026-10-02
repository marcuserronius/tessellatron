import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from '../js/generators/registry.js';
import '../js/generators/index.js';
import { defaults } from '../js/params/schema.js';
import { apply } from '../js/core/affine.js';
import { applyTwist } from '../js/policies/orientation.js';

const region = [0, 0, 420, 320];
const gen = (id, over = {}, reg = region) => { const g = get(id); return g.generate({ ...defaults(g.params), ...over }, reg); };
const angleOf = (m) => (Math.atan2(m[1], m[0]) * 180) / Math.PI;
const dAngle = (a, b) => { const d = (((a - b) % 360) + 540) % 360 - 180; return Math.abs(d); };

test('origin offset: same tiles as the unshifted lattice over the shifted region, translated', () => {
  const o = [37, -23];
  for (const id of ['square', 'triangle', 'hexagon', 'snub-square', 'truncated-trihexagonal']) {
    for (const rotation of [0, 17]) {
      const a = gen(id, { rotation, originX: o[0], originY: o[1] });
      const b = gen(id, { rotation }, [region[0] - o[0], region[1] - o[1], region[2] - o[0], region[3] - o[1]]);
      const key = (t, dx = 0, dy = 0) => [...t.transform.slice(0, 4), t.transform[4] + dx, t.transform[5] + dy].map((v) => v.toFixed(6)).join();
      assert.deepEqual(a.tiles.map((t) => key(t)).sort(), b.tiles.map((t) => key(t, o[0], o[1])).sort(), `${id} rot ${rotation}`);
    }
  }
});

test('square: j is the absolute row; rows alternate by rowShift', () => {
  const s = 50, ir = gen('square', { size: s, rowShift: 0.5 });
  assert.ok(ir.tiles.length > 20);
  for (const t of ir.tiles) {
    const { i, j } = t.tags;
    assert.ok(Math.abs(t.transform[5] - j * s) < 1e-9);
    assert.ok(Math.abs(t.transform[4] - (i * s + (((j % 2) + 2) % 2) * 0.5 * s)) < 1e-9);
  }
});

test('twist: none or zero step leaves tiles untouched', () => {
  const plain = gen('hexagon');
  assert.deepEqual(applyTwist(plain.tiles, { twistMode: 'none', twistStep: 9 }, plain.prototiles), plain.tiles);
  assert.deepEqual(applyTwist(plain.tiles, { twistMode: 'rows', twistStep: 0 }, plain.prototiles), plain.tiles);
  assert.deepEqual(gen('hexagon', { twistMode: 'rows', twistStep: 0 }).tiles, plain.tiles);
});

test('twist: angle = index * step about the tile centre; centre and orient unchanged', () => {
  for (const id of ['square', 'triangle', 'hexagon']) {
    for (const [mode, index] of [['rows', (t) => t.tags.j], ['columns', (t) => t.tags.i], ['diagonals', (t) => t.tags.i + t.tags.j]]) {
      const base = gen(id), ir = gen(id, { twistMode: mode, twistStep: 7 });
      assert.equal(ir.tiles.length, base.tiles.length);
      ir.tiles.forEach((t, k) => {
        const b = base.tiles[k];
        assert.deepEqual(t.tags, b.tags);
        assert.deepEqual(t.orient, b.orient);
        const c0 = apply(b.transform, [0, 0]), c1 = apply(t.transform, [0, 0]);
        assert.ok(Math.hypot(c0[0] - c1[0], c0[1] - c1[1]) < 1e-9, `${id}/${mode} centre`);
        assert.ok(dAngle(angleOf(t.transform), angleOf(b.transform) + index(t) * 7) < 1e-9, `${id}/${mode} angle`);
      });
    }
  }
});

test('twist: pivot "vertex" keeps the first vertex fixed instead of the centre', () => {
  const base = gen('triangle'), ir = gen('triangle', { twistMode: 'diagonals', twistStep: 11, twistPivot: 'vertex' });
  const v0 = base.prototiles.tri.edges[0].path[0].slice(1);
  let moved = 0;
  ir.tiles.forEach((t, k) => {
    const a = apply(base.tiles[k].transform, v0), b = apply(t.transform, v0);
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9);
    const c0 = apply(base.tiles[k].transform, [0, 0]), c1 = apply(t.transform, [0, 0]);
    if (Math.hypot(c0[0] - c1[0], c0[1] - c1[1]) > 1e-6) moved++;
  });
  assert.ok(moved > 0, 'centres do move when pivoting about a vertex');
});
