import test from 'node:test';
import assert from 'node:assert/strict';
import { generators } from '../js/generators/periodic/archimedean.js';
import { defaults } from '../js/params/schema.js';
import { apply } from '../js/core/affine.js';

const W = 600, H = 450, region = [0, 0, W, H];
const outline = (pt) => pt.edges.map((e) => e.path[0].slice(1));
const worldPolys = (ir) => ir.tiles.map((t) => ({ n: ir.prototiles[t.proto].edges.length, P: outline(ir.prototiles[t.proto]).map((v) => apply(t.transform, v)) }));
const variants = generators.flatMap((g) => (g.params.some((p) => p.id === 'mirror') ? [false, true] : [false]).map((mirror) => [g, mirror]));

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('all eight Archimedean tilings are registered with distinct ids', () => {
  assert.equal(generators.length, 8);
  assert.equal(new Set(generators.map((g) => g.id)).size, 8);
});

for (const [g, mirror] of variants) {
  for (const rotation of [0, 17, -33]) {
    const label = `${g.id}${mirror ? ' (mirror)' : ''} rot ${rotation}`;
    const ir = g.generate({ ...defaults(g.params), rotation, mirror }, region);
    const polys = worldPolys(ir);

    test(`${label}: every interior point covered exactly once`, () => {
      for (let k = 0; k < 300; k++) {
        const pt = [40 + rnd() * (W - 80), 40 + rnd() * (H - 80)];
        const hits = polys.filter(({ P }) => {
          const s = P.map((a, i) => { const b = P[(i + 1) % P.length]; return (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]); });
          return s.every((v) => v > 0) || s.every((v) => v < 0);
        }).length;
        assert.equal(hits, 1, `point ${pt}`);
      }
    });

    test(`${label}: interior vertices match ${g.config} and close to 360°`, () => {
      const want = g.config.split('.').map(Number).sort((a, b) => a - b).join('.');
      const at = new Map();
      for (const { n, P } of polys) for (const [x, y] of P) {
        const key = `${Math.round(x * 100)},${Math.round(y * 100)}`;
        if (!at.has(key)) at.set(key, { x, y, ns: [] });
        at.get(key).ns.push(n);
      }
      const m = 1; // any vertex inside the region has all its tiles emitted (lattice padding = largest circumradius)
      let checked = 0;
      for (const { x, y, ns } of at.values()) {
        if (x < m || y < m || x > W - m || y > H - m) continue;
        checked++;
        assert.equal(ns.sort((a, b) => a - b).join('.'), want, `vertex ${x},${y}`);
        assert.ok(Math.abs(ns.reduce((a, n) => a + 180 - 360 / n, 0) - 360) < 1e-9);
      }
      assert.ok(checked > 10, 'enough vertices checked');
    });
  }

  test(`${g.id}${mirror ? ' (mirror)' : ''}: side length equals size; orient.rot is a class index`, () => {
    const p = { ...defaults(g.params), size: 50, mirror };
    const ir = g.generate(p, region);
    for (const pt of Object.values(ir.prototiles)) {
      const V = outline(pt);
      V.forEach((a, i) => assert.ok(Math.abs(Math.hypot(a[0] - V[(i + 1) % V.length][0], a[1] - V[(i + 1) % V.length][1]) - 50) < 1e-9));
    }
    assert.ok(ir.tiles.every((t) => Number.isInteger(t.orient.rot) && t.orient.rot >= 0 && t.tags.cls >= 0 && t.tags.cls <= 2));
  });
}

test('snub square: squares come in two orientations, triangles in four', () => {
  const g = generators.find((x) => x.id === 'snub-square'), ir = g.generate(defaults(g.params), region);
  const rots = (n) => new Set(ir.tiles.filter((t) => t.tags.n === n).map((t) => t.orient.rot)).size;
  assert.deepEqual([rots(4), rots(3)], [2, 4]);
});

test('mirror reflects the snub tilings (different tile positions, same count class)', () => {
  const g = generators.find((x) => x.id === 'snub-hexagonal'), p = defaults(g.params);
  const a = g.generate(p, region), b = g.generate({ ...p, mirror: true }, region);
  const key = (ir) => new Set(ir.tiles.map((t) => `${Math.round(t.transform[4])},${Math.round(t.transform[5])}`));
  assert.notDeepEqual(key(a), key(b));
});
