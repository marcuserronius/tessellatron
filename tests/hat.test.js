import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from '../js/generators/registry.js';
import '../js/generators/index.js';
import { buildSupertile, collectHats, snapPlacement, SNAP_TOLERANCE } from '../js/generators/aperiodic/hat-subst.js';
import { defaults, viewParams } from '../js/params/schema.js';
import { styleParams } from '../js/style/colorings.js';
import { renderSVG } from '../js/render/svg.js';
import { apply } from '../js/core/affine.js';
import { signedArea } from '../js/core/polygon.js';

const g = get('hat');
const gen = (over = {}, region = [0, 0, 600, 450]) => g.generate({ ...defaults(g.params), ...over }, region);
const outline = (ir) => ir.prototiles.hat.edges.map((e) => e.path[0].slice(1));
const poly = (ir, t) => outline(ir).map((v) => apply(t.transform, v));
const det = (m) => m[0] * m[3] - m[1] * m[2];

/** Ray-casting point-in-polygon (hats are concave). */
function inside(P, [x, y]) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    if ((P[i][1] > y) !== (P[j][1] > y) && x < ((P[j][0] - P[i][0]) * (y - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  }
  return c;
}

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** Every sampled point must lie in exactly one hat (no gaps, no overlaps). */
function assertExactCover(ir, points, reach) {
  const polys = ir.tiles.map((t) => ({ c: [t.transform[4], t.transform[5]], P: poly(ir, t) }));
  for (const pt of points) {
    const hits = polys.filter(({ c, P }) => Math.hypot(c[0] - pt[0], c[1] - pt[1]) < reach && inside(P, pt)).length;
    assert.equal(hits, 1, `point ${pt}`);
  }
}

test('registered, with the expected params and presets', () => {
  assert.equal(g.id, 'hat');
  assert.ok(g.params.some((p) => p.id === 'seed' && p.type === 'select'));
  assert.ok(g.presets.length >= 3);
});

test('prototile: 13 closed clockwise edges, area 8√3 · size², sides size, √3·size and 2·size', () => {
  const s = 17, ir = gen({ size: s }), { edges } = ir.prototiles.hat, V = outline(ir);
  assert.equal(edges.length, 13);
  edges.forEach((e, n) => assert.deepEqual(e.path[1].slice(1), edges[(n + 1) % 13].path[0].slice(1)));
  assert.ok(Math.abs(signedArea(V) - 8 * Math.sqrt(3) * s * s) < 1e-6);
  V.forEach((a, n) => {
    const b = V[(n + 1) % 13], len = Math.hypot(b[0] - a[0], b[1] - a[1]) / s;
    assert.ok([1, Math.sqrt(3), 2].some((w) => Math.abs(len - w) < 1e-9), `edge ${n}: ${len}`);
  });
});

test('substitution: hats per level follow 4, 25, 169, 1156, 7921 (squares of 2, 5, 13, 34, 89)', () => {
  const all = [-1e9, -1e9, 1e9, 1e9], I = [1, 0, 0, 0, 1, 0];
  [4, 25, 169, 1156, 7921].forEach((n, k) => assert.equal(collectHats(buildSupertile(k + 1, 'H'), I, all).length, n));
});

test('snap: every hat is an exact lattice placement, for every seed and level', () => {
  const I = [1, 0, 0, 0, 1, 0], all = [-1e9, -1e9, 1e9, 1e9];
  for (const seedType of ['H', 'T', 'P', 'F']) {
    for (const level of [1, 2, 3, 4, 5]) {
      const root = buildSupertile(level, seedType);
      assert.ok(root.origin.every(Number.isFinite));
      for (const h of collectHats(root, I, all)) {
        assert.ok(Number.isInteger(h.u) && Number.isInteger(h.v) && h.rot >= 0 && h.rot < 6 && Number.isInteger(h.rot));
        assert.equal(h.flip, h.M[0] * h.M[4] - h.M[1] * h.M[3] < 0);
        // snapping an already-snapped matrix changes nothing, bit for bit
        const again = snapPlacement(h.M, root.origin);
        assert.deepEqual(again.M, h.M);
        assert.deepEqual([again.rot, again.flip, again.u, again.v], [h.rot, h.flip, h.u, h.v]);
      }
    }
  }
});

test('snap: distinct hats never share a placement, and a deep level snaps within tolerance', () => {
  const I = [1, 0, 0, 0, 1, 0];
  for (const seedType of ['H', 'F']) {
    const hats = collectHats(buildSupertile(9, seedType), I, [-250, -250, 250, 250]);
    assert.ok(hats.length > 1000);
    assert.equal(new Set(hats.map((h) => `${h.rot},${h.flip},${h.u},${h.v}`)).size, hats.length);
  }
});

test('snap: rejects placements that are not on the hat lattice instead of rounding them', () => {
  assert.throws(() => snapPlacement([0.5, 0, 0.3, 0, 0.5, 0]), /hat lattice/);                       // offset 0.3
  const a = (10 * Math.PI) / 180;
  assert.throws(() => snapPlacement([0.5 * Math.cos(a), -0.5 * Math.sin(a), 0, 0.5 * Math.sin(a), 0.5 * Math.cos(a), 0]), /hat lattice/); // 10° turn
  assert.throws(() => snapPlacement([1, 0, 0, 0, 1, 0]), /hat lattice/);                              // wrong scale
  const ok = snapPlacement([0.5, 0, 0.75, 0, 0.5, 0.25 * Math.sqrt(3) + SNAP_TOLERANCE / 10]); // just inside the tolerance
  assert.deepEqual([ok.rot, ok.flip, ok.u, ok.v], [0, false, 1, 1]);
  assert.equal(ok.M[5], 0.25 * Math.sqrt(3), 'the matrix is rebuilt exactly, not passed through');
});

test('snap: at rotation 0 the tiles use exactly 12 linear parts (6 rotations x 2 reflections)', () => {
  for (const seedType of ['H', 'T', 'P', 'F']) {
    const ir = gen({ seed: seedType, size: 10 }, [0, 0, 1200, 900]);
    assert.ok(ir.tiles.length > 500);
    assert.equal(new Set(ir.tiles.map((t) => t.transform.slice(0, 4).join())).size, 12);
  }
});

for (const seedType of ['H', 'T', 'P', 'F']) {
  for (const rotation of [0, 23, -140]) {
    test(`seed ${seedType}, rotation ${rotation}: every interior point covered exactly once`, () => {
      const size = 14, ir = gen({ seed: seedType, rotation, size }, [0, 0, 600, 450]);
      assert.ok(ir.tiles.length > 80);
      const pts = Array.from({ length: 300 }, () => [60 + rnd() * 480, 60 + rnd() * 330]);
      assertExactCover(ir, pts, 8 * size);
    });
  }
}

test('tiles are rigid placements: |det| = 1, flip iff det < 0, rot in 0..5, tags set', () => {
  const ir = gen({ rotation: 31, size: 9 }, [0, 0, 700, 500]);
  let flipped = 0;
  for (const t of ir.tiles) {
    assert.ok(Math.abs(Math.abs(det(t.transform)) - 1) < 1e-9);
    assert.equal(t.orient.flip, det(t.transform) < 0);
    assert.ok(Number.isInteger(t.orient.rot) && t.orient.rot >= 0 && t.orient.rot < 6);
    assert.ok(['H1', 'H', 'T', 'P', 'F'].includes(t.tags.label));
    assert.equal(t.tags.cls === 0, t.orient.flip, 'cls 0 is exactly the reflected hats');
    if (t.orient.flip) flipped++;
  }
  assert.ok(flipped / ir.tiles.length > 0.08 && flipped / ir.tiles.length < 0.2, `reflected fraction ${flipped / ir.tiles.length}`);
});

test('tiling does not depend on the region: a sub-region gets a subset of the same placements', () => {
  const key = (t) => t.transform.map((v) => v.toFixed(6)).join();
  for (const rotation of [0, 29]) {
    const big = new Set(gen({ rotation }, [0, 0, 900, 700]).tiles.map(key));
    const small = gen({ rotation }, [200, 150, 500, 400]).tiles;
    assert.ok(small.length > 20);
    small.forEach((t) => assert.ok(big.has(key(t))));
  }
});

test('origin offset: same placements as the unshifted tiling over the shifted region, translated', () => {
  const o = [37, -23], region = [0, 0, 500, 400];
  for (const rotation of [0, 17]) {
    const a = gen({ rotation, originX: o[0], originY: o[1] }, region);
    const b = gen({ rotation }, [region[0] - o[0], region[1] - o[1], region[2] - o[0], region[3] - o[1]]);
    const key = (t, dx = 0, dy = 0) => [...t.transform.slice(0, 4), t.transform[4] + dx, t.transform[5] + dy].map((v) => v.toFixed(5)).join();
    // the final world-space filter depends on the region, so compare the tiles inside both
    const inA = new Set(a.tiles.map((t) => key(t)));
    const inB = new Set(b.tiles.map((t) => key(t, o[0], o[1])));
    const common = [...inA].filter((k) => inB.has(k));
    assert.ok(common.length > 0.7 * Math.min(inA.size, inB.size), `rotation ${rotation}`);
  }
});

test('different seed supertiles give different tilings', () => {
  const key = (ir) => new Set(ir.tiles.map((t) => t.transform.map((v) => v.toFixed(4)).join()));
  const [h, p] = [key(gen({ seed: 'H' })), key(gen({ seed: 'P' }))];
  assert.ok([...h].filter((k) => !p.has(k)).length > 10);
});

test('extreme params stay inside the supertile: max canvas, min size, max offsets, still an exact cover', () => {
  for (const [originX, originY, rotation, seedType] of [[1000, 1000, 0, 'H'], [-1000, -1000, 45, 'T'], [1000, -1000, -77, 'F'], [-1000, 1000, 120, 'P']]) {
    const ir = gen({ size: 5, originX, originY, rotation, seed: seedType }, [0, 0, 4000, 4000]);
    assert.ok(ir.tiles.length > 30000);
    const pts = [[3990, 3990], [10, 3990], [3990, 10], [10, 10], ...Array.from({ length: 30 }, () => [20 + rnd() * 3960, 20 + rnd() * 3960])];
    assertExactCover(ir, pts, 60);
  }
});

test('renders to SVG: one path per hat when flattened, <use> otherwise, all numbers finite', () => {
  const ir = gen({ size: 20 }, [0, 0, 400, 300]), st = defaults(styleParams), view = { width: 400, height: 300 };
  const flat = renderSVG(ir, st, view, { flatten: true }), uses = renderSVG(ir, st, view);
  assert.equal((flat.match(/<path /g) ?? []).length, ir.tiles.length);
  assert.equal((uses.match(/<use /g) ?? []).length, ir.tiles.length);
  assert.ok(!/NaN|Infinity/.test(flat + uses));
  assert.equal(defaults(viewParams).width, 800);
});
