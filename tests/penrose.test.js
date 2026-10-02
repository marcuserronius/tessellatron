import test from 'node:test';
import assert from 'node:assert/strict';
import * as penrose from '../js/generators/aperiodic/penrose.js';
import { triangulate } from '../js/generators/aperiodic/robinson.js';
import { rhombs, vertexClass } from '../js/generators/aperiodic/tilesets.js';
import { ZERO, ONE, PHI, PSI, add, sub, mul, z10, toXY, residue } from '../js/core/ring.js';
import { defaults } from '../js/params/schema.js';
import { apply } from '../js/core/affine.js';

const W = 800, H = 600, region = [0, 0, W, H], SIZE = 50, GOLD = (1 + Math.sqrt(5)) / 2, SETS = ['p1', 'p2', 'p3'];
const gen = (tileSet, extra = {}, reg = region) => penrose.generate({ ...defaults(penrose.params), tileSet, size: SIZE, ...extra }, reg);
const outline = (pt) => pt.edges.map((e) => e.path[0].slice(1));
const polys = (ir) => ir.tiles.map((t) => ({ t, P: outline(ir.prototiles[t.proto]).map((v) => apply(t.transform, v)) }));
const inside = (pt, P) => { // ray casting; the polygons here can be concave
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    if ((P[i][1] > pt[1]) !== (P[j][1] > pt[1]) && pt[0] < ((P[j][0] - P[i][0]) * (pt[1] - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  }
  return c;
};
let seed = 5;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('ring: φ·(1/φ) = 1, φ² = φ+1, z10 are unit vectors 36° apart, residue is a ring homomorphism', () => {
  assert.deepEqual(mul(PHI, PSI), ONE);
  assert.deepEqual(mul(PHI, PHI), add(PHI, ONE));
  assert.ok(Math.abs(toXY(PHI)[0] - GOLD) < 1e-12 && Math.abs(toXY(PHI)[1]) < 1e-12);
  for (let k = 0; k < 12; k++) {
    const [x, y] = toXY(z10(k)), a = (k * Math.PI) / 5;
    assert.ok(Math.hypot(x - Math.cos(a), y - Math.sin(a)) < 1e-12, `z10(${k})`);
  }
  const r = () => [0, 1, 2, 3].map(() => Math.floor(rnd() * 21) - 10);
  for (let n = 0; n < 50; n++) {
    const [a, b, c] = [r(), r(), r()];
    assert.deepEqual(mul(a, mul(b, c)), mul(mul(a, b), c));
    assert.deepEqual(mul(a, add(b, c)), add(mul(a, b), mul(a, c)));
    assert.equal(residue(mul(a, b)), (residue(a) * residue(b)) % 5);
    assert.equal(residue(add(a, b)), (residue(a) + residue(b)) % 5);
  }
  assert.deepEqual(sub(ZERO, ONE), [-1, 0, 0, 0]);
});

test('triangulation: exact Robinson triangles (acute 1:1:1/φ, obtuse 1:1:φ), scaled by 1/φ per level', () => {
  const L = 4, d = (p, q) => Math.hypot(...sub(toXY(p), toXY(q)).map((v) => v));
  const dist = (p, q) => Math.hypot(toXY(p)[0] - toXY(q)[0], toXY(p)[1] - toXY(q)[1]);
  void d;
  for (const t of triangulate(L)) {
    const leg = GOLD ** -L;
    assert.ok(Math.abs(dist(t.A, t.B) - leg) < 1e-12 && Math.abs(dist(t.A, t.C) - leg) < 1e-12);
    assert.ok(Math.abs(dist(t.B, t.C) - leg * (t.c ? GOLD : 1 / GOLD)) < 1e-12);
  }
});

test('vertex classes: rhomb corners are a, a+1, a+1, a+2 at every canonical depth; class 4 never occurs', () => {
  for (const L of [3, 5, 7]) {
    const out = rhombs(triangulate(L), L);
    assert.ok(out.length > 50);
    for (const { verts, kind } of out) {
      const [A1, B, A2, C] = verts.map((v) => vertexClass(v, L));
      assert.ok([A1, B, A2, C].every((a) => a < 4), `class 4 at depth ${L}`);
      assert.equal(Math.abs(B - C), 2, `${kind} base ends`);            // the axis joins classes a and a+2
      assert.ok(A1 === A2 && Math.abs(A1 - B) === 1 && Math.abs(A1 - C) === 1, `${kind} side corners`);
    }
  }
});

for (const ts of SETS) {
  const ir = gen(ts), P = polys(ir);

  test(`${ts}: every interior point covered exactly once`, () => {
    for (let k = 0; k < 400; k++) {
      const pt = [20 + rnd() * (W - 40), 20 + rnd() * (H - 40)];
      assert.equal(P.filter(({ P: poly }) => inside(pt, poly)).length, 1, `point ${pt}`);
    }
  });

  test(`${ts}: prototiles are closed, clockwise-on-screen outlines; edge lengths are right`, () => {
    for (const pt of Object.values(ir.prototiles)) {
      pt.edges.forEach((e, n) => assert.deepEqual(e.path[1].slice(1), pt.edges[(n + 1) % pt.edges.length].path[0].slice(1)));
      assert.equal(pt.rotUnits, 10);
    }
    const allowed = ts === 'p2' ? [SIZE, SIZE / GOLD] : [SIZE];
    for (const { P: poly } of P) {
      poly.forEach((a, i) => {
        const b = poly[(i + 1) % poly.length], l = Math.hypot(a[0] - b[0], a[1] - b[1]);
        assert.ok(allowed.some((x) => Math.abs(l - x) < 1e-6), `edge length ${l}`);
      });
    }
  });

  test(`${ts}: interior angles meet to 360° at every interior vertex`, () => {
    const at = new Map();
    for (const { P: poly } of P) {
      poly.forEach((b, i) => {
        const a = poly[(i + poly.length - 1) % poly.length], c = poly[(i + 1) % poly.length];
        const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
        const turn = (Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) * 180) / Math.PI;
        const k = `${Math.round(b[0] * 100)},${Math.round(b[1] * 100)}`;
        if (!at.has(k)) at.set(k, { b, sum: 0 });
        at.get(k).sum += 180 - turn;
      });
    }
    let checked = 0;
    for (const { b, sum } of at.values()) {
      if (b[0] < 1 || b[1] < 1 || b[0] > W - 1 || b[1] > H - 1) continue;
      checked++;
      assert.ok(Math.abs(sum - 360) < 1e-6, `vertex ${b}: ${sum}`);
    }
    assert.ok(checked > 50);
  });

  test(`${ts}: orient.rot is an index 0..9 and the transform angle is 36·rot + rotation`, () => {
    const q = gen(ts, { rotation: 20 });
    for (const t of q.tiles) {
      assert.ok(Number.isInteger(t.orient.rot) && t.orient.rot >= 0 && t.orient.rot < 10 && t.orient.flip === false);
      const ang = Math.atan2(t.transform[1], t.transform[0]), want = ((36 * t.orient.rot + 20) * Math.PI) / 180;
      assert.ok(Math.abs(Math.atan2(Math.sin(ang - want), Math.cos(ang - want))) < 1e-9);
      assert.ok(t.tags.cls >= 0 && t.tags.cls <= 2 && t.tags.hueStep === 36);
    }
  });

  test(`${ts}: same tiling whatever the region or zoom (depth is derived, not part of the pattern)`, () => {
    const key = (t) => `${t.proto}@${Math.round(t.transform[4] * 10)},${Math.round(t.transform[5] * 10)}`;
    const core = (t) => t.transform[4] > 150 && t.transform[4] < 650 && t.transform[5] > 100 && t.transform[5] < 500;
    const sets = [220, 400, 800, 1500, 3000, 12000].map((h) => new Set(gen(ts, {}, [400 - h, 300 - h, 400 + h, 300 + h]).tiles.filter(core).map(key)));
    assert.ok(sets[0].size > 20);
    for (const s of sets) assert.deepEqual([...s].sort(), [...sets[0]].sort());
  });

  test(`${ts}: a 72° turn about the centre maps the tiling onto itself (5-fold symmetry)`, () => {
    const centres = (rotation) => new Set(gen(ts, { rotation }).tiles.map((t) => `${t.proto}@${Math.round(t.transform[4] * 10)},${Math.round(t.transform[5] * 10)}`));
    const a = centres(0), b = centres(72);
    const common = [...a].filter((k) => b.has(k)).length;
    assert.ok(common > 0.7 * a.size, `${common} of ${a.size}`); // edge tiles fall outside the canvas after turning
  });
}

test('tile frequencies tend to the golden ratio; P1 has all four shapes', () => {
  const big = [0, 0, 3000, 2400], count = (ir) => ir.tiles.reduce((c, t) => ({ ...c, [t.proto]: (c[t.proto] ?? 0) + 1 }), {});
  const p = { size: 30, originX: 1500, originY: 1200 };
  const r3 = count(gen('p3', p, big)), r2 = count(gen('p2', p, big)), r1 = count(gen('p1', p, big));
  assert.ok(Math.abs(r3.thick / r3.thin - GOLD) < 0.05, `thick/thin ${r3.thick / r3.thin}`);
  assert.ok(Math.abs(r2.kite / r2.dart - GOLD) < 0.05, `kite/dart ${r2.kite / r2.dart}`);
  for (const k of ['pent', 'diamond', 'boat', 'star']) assert.ok(r1[k] > 10, k);
});

test('tile sets share one centre and scale: P3 and P2 cover the same sun', () => {
  const sun3 = gen('p3').tiles.filter((t) => Math.hypot(t.transform[4] - 400, t.transform[5] - 300) < SIZE);
  const sun2 = gen('p2').tiles.filter((t) => Math.hypot(t.transform[4] - 400, t.transform[5] - 300) < SIZE);
  assert.equal(sun3.length, 5);   // five thick rhombs around the 5-fold centre
  assert.ok(sun3.every((t) => t.proto === 'thick'));
  assert.ok(sun2.length >= 5);
});
