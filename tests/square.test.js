import test from 'node:test';
import assert from 'node:assert/strict';
import * as square from '../js/generators/periodic/square.js';
import { defaults } from '../js/params/schema.js';
import { apply } from '../js/core/affine.js';

const base = { ...defaults(square.params), size: 100 };

test('covers region with a grid of tiles', () => {
  const ir = square.generate(base, [0, 0, 500, 300]);
  const centers = new Set(ir.tiles.map((t) => `${t.transform[4]},${t.transform[5]}`));
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) assert.ok(centers.has(`${i * 100},${j * 100}`));
});

test('checker mode alternates orient.rot and rotates tile transforms', () => {
  const ir = square.generate({ ...base, orientMode: 'checker' }, [0, 0, 300, 300]);
  const t = ir.tiles.find((t) => t.tags.i === 1 && t.tags.j === 0);
  assert.equal(t.orient.rot, 1);
  const [x, y] = apply(t.transform, [-50, -50]); // local top-left corner after a 90° turn -> top-right
  assert.ok(Math.abs(x - (t.transform[4] + 50)) < 1e-9 && Math.abs(y - (t.transform[5] - 50)) < 1e-9);
});

test('prototile edges are closed and paired', () => {
  const { edges } = square.generate(base, [0, 0, 100, 100]).prototiles.sq;
  assert.equal(edges.length, 4);
  edges.forEach((e, n) => assert.deepEqual(e.path[1].slice(1), edges[(n + 1) % 4].path[0].slice(1)));
  assert.equal(edges[0].pair.edge, 'e2');
});
