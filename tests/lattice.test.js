import test from 'node:test';
import assert from 'node:assert/strict';
import * as triangle from '../js/generators/periodic/triangle.js';
import * as hexagon from '../js/generators/periodic/hexagon.js';
import { defaults } from '../js/params/schema.js';
import { apply } from '../js/core/affine.js';

const region = [0, 0, 400, 300];
const outline = (pt) => pt.edges.map((e) => e.path[0].slice(1));

function containing(ir, pt) {
  return ir.tiles.filter((t) => {
    const P = outline(ir.prototiles[t.proto]).map((v) => apply(t.transform, v));
    const s = P.map((a, n) => { const b = P[(n + 1) % P.length]; return (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]); });
    return s.every((v) => v > 0) || s.every((v) => v < 0);
  }).length;
}

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

for (const gen of [triangle, hexagon]) {
  for (const rotation of [0, 17, -33]) {
    for (const orientMode of ['none', 'cycle', 'rows']) {
      test(`${gen.id}: every interior point covered exactly once (rot ${rotation}, ${orientMode})`, () => {
        const ir = gen.generate({ ...defaults(gen.params), rotation, orientMode }, region);
        for (let n = 0; n < 200; n++) {
          const pt = [20 + rnd() * 360, 20 + rnd() * 260];
          assert.equal(containing(ir, pt), 1, `point ${pt}`);
        }
      });
    }
  }

  test(`${gen.id}: edge pairs map each edge onto its partner`, () => {
    const pt = gen.generate(defaults(gen.params), region).prototiles;
    const proto = Object.values(pt)[0], byId = Object.fromEntries(proto.edges.map((e) => [e.id, e]));
    const key = (v) => v.map((x) => Math.round(x * 1e6) / 1e6).join(',');
    for (const e of proto.edges) {
      const mapped = e.path.map((c) => key(apply(e.pair.transform, c.slice(1)))).sort();
      assert.deepEqual(mapped, byId[e.pair.edge].path.map((c) => key(c.slice(1))).sort());
    }
  });
}

test('orientation cycle changes orient.rot but not geometry; triangle up/down differ by 3', () => {
  const p = defaults(triangle.params);
  const a = triangle.generate(p, region), b = triangle.generate({ ...p, orientMode: 'cycle' }, region);
  assert.equal(a.tiles.length, b.tiles.length);
  assert.ok(b.tiles.some((t) => t.orient.rot !== a.tiles[b.tiles.indexOf(t)].orient.rot));
  assert.deepEqual(new Set(a.tiles.map((t) => t.orient.rot)), new Set([0, 3]));
});
