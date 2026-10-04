import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/generators/index.js';
import { list, get } from '../js/generators/registry.js';
import { defaults } from '../js/params/schema.js';
import { pairingProblems, pairClasses, edgeEnds } from '../js/editor/pairing.js';
import { translate, multiply, rotate } from '../js/core/affine.js';

const proto = (id, size) => {
  const g = get(id);
  const ir = g.generate({ ...defaults(g.params), size }, [0, 0, 10, 10]);
  return Object.values(ir.prototiles)[0];
};

test('square: two classes, top/bottom and left/right, representative = lower edge', () => {
  const cs = pairClasses(proto('square', 100));
  assert.deepEqual(cs.map(({ rep, partner, self }) => [rep, partner, self]), [['e0', 'e2', false], ['e1', 'e3', false]]);
  assert.deepEqual(cs[0].transform, translate(0, 100));
  assert.deepEqual(cs[1].transform, translate(-100, 0));
});

test('hexagon: three translation classes; triangle: three self-paired classes', () => {
  assert.deepEqual(pairClasses(proto('hexagon', 40)).map((c) => [c.rep, c.partner]), [['e0', 'e3'], ['e1', 'e4'], ['e2', 'e5']]);
  const tri = pairClasses(proto('triangle', 60));
  assert.equal(tri.length, 3);
  assert.ok(tri.every((c) => c.self && c.rep === c.partner));
});

test('every registered generator ships a consistent pairing (or none)', () => {
  for (const g of list()) {
    const ir = g.generate(defaults(g.params), [0, 0, 300, 300]);
    for (const [id, pt] of Object.entries(ir.prototiles)) assert.deepEqual(pairingProblems(pt), [], `${g.id}/${id}`);
  }
});

test('prototiles without pair metadata have no classes', () => {
  const ir = get('square').generate(defaults(get('square').params), [0, 0, 10, 10]);
  const bare = { ...ir.prototiles.sq, edges: ir.prototiles.sq.edges.map(({ pair, ...e }) => e) };
  assert.deepEqual(pairClasses(bare), []);
});

test('broken pairings are reported and pairClasses refuses them', () => {
  const sq = proto('square', 100);
  const edit = (n, pair) => ({ ...sq, edges: sq.edges.map((e, i) => (i === n ? { ...e, pair: { ...e.pair, ...pair } } : e)) });
  const shifted = edit(0, { transform: translate(0, 101) });
  assert.ok(pairingProblems(shifted).some((m) => /not inverses|does not map/.test(m)));
  assert.throws(() => pairClasses(shifted), /invalid edge pairing/);
  assert.ok(pairingProblems(edit(0, { edge: 'e9' })).some((m) => /does not exist/.test(m)));
  assert.ok(pairingProblems(edit(0, { edge: 'e1' })).some((m) => /does not pair back/.test(m)));
  const mirror = edit(0, { transform: multiply(translate(0, 100), [-1, 0, 0, 1, 0, 0]) });
  assert.ok(pairingProblems(mirror).some((m) => /preserve orientation/.test(m)));
});

test('edgeEnds returns the first and last point of the path', () => {
  assert.deepEqual(edgeEnds({ path: [['M', 1, 2], ['L', 5, 5], ['L', 3, 4]] }), [[1, 2], [3, 4]]);
  assert.ok(rotate(0)); // keeps the import honest if edge cases move here
});
