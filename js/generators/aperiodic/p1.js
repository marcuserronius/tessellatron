/**
 * Penrose P1 from a Robinson triangulation (pure, exact, no DOM).
 *
 * Rule (found numerically and checked by the tests in tests/penrose.test.js): take the P3 vertices of the two
 * OUTER vertex classes, 0 and 3 (Penrose index sums 1 and 4), and put a regular pentagon of circumradius =
 * P3 edge on each: vertices at c + r·z10(rot + 2j), rot = 1 for class 0 and 0 for class 3, where
 * r = ψ^levels is the triangle leg of a patch made with `levels` subdivisions.
 * All pentagon corners are ring elements, so the P1 edges (length 2·sin36° times the P3 edge, along
 * odd multiples of 18°) are exact. What is left between the pentagons is tiled by exactly one
 * diamond, boat or star each; they are found as the faces of the pentagon outlines.
 *
 * pentagonTiling(tris, levels) -> abstract tiles { kind: 'pent'|'diamond'|'boat'|'star', verts, rot }.
 * For gap tiles rot k means the canonical SHAPES sequence turned by k·36°. Faces cut off by the
 * patch frontier fail to close or to match a shape and are dropped.
 * SHAPES: CCW edge directions of each gap tile; direction d points at 36·d + 18 degrees.
 */
import { add, mul, key, z10, ONE, PSI } from '../../core/ring.js';
import { vertexClass } from './tilesets.js';

export const SHAPES = {
  diamond: [0, 1, 5, 6],
  boat: [0, 1, 2, 6, 4, 8, 6],
  star: [0, 4, 2, 6, 4, 8, 6, 0, 8, 2],
};

function match(dirs, verts) {
  const n = dirs.length;
  for (const [kind, seq] of Object.entries(SHAPES)) {
    if (seq.length !== n) continue;
    for (let k = 0; k < 10; k++) {
      for (let s = 0; s < n; s++) {
        if (seq.every((d, i) => dirs[(s + i) % n] === (d + k) % 10)) {
          return { kind, rot: k, verts: seq.map((_, j) => verts[(s + j) % n]) };
        }
      }
    }
  }
  return null;
}

export function pentagonTiling(tris, levels) {
  let r = ONE;
  for (let i = 0; i < levels; i++) r = mul(r, PSI);
  const seen = new Map(), tiles = [], boundary = new Set(), edges = [];
  for (const t of tris) for (const v of [t.A, t.B, t.C]) seen.set(key(v), v);
  for (const v of seen.values()) {
    const k = vertexClass(v, levels);
    if (k !== 0 && k !== 3) continue;
    const rot = k === 0 ? 1 : 0;
    const P = [0, 1, 2, 3, 4].map((j) => add(v, mul(r, z10(rot + 2 * j))));
    tiles.push({ kind: 'pent', verts: P, rot });
    P.forEach((a, j) => {
      const b = P[(j + 1) % 5];
      boundary.add(`${key(a)}>${key(b)}`);
      edges.push({ a, b, d: (rot + 2 * j + 3) % 10 }); // CCW pentagon edge a->b points at 36(rot+2j+3)+18°
    });
  }
  // Half-edges with a gap on their left: the reverse of each pentagon edge that has no pentagon behind it.
  const out = new Map();
  for (const { a, b, d } of edges) {
    if (boundary.has(`${key(b)}>${key(a)}`)) continue;
    const from = key(b);
    if (!out.has(from)) out.set(from, []);
    out.get(from).push({ from: b, to: a, d: (d + 5) % 10, used: false });
  }
  for (const list of out.values()) {
    for (const h0 of list) {
      if (h0.used) continue;
      const face = [];
      let h = h0;
      for (;;) {
        h.used = true;
        face.push(h);
        // Keep the face on the left: next edge = smallest turn from the reversed incoming direction.
        let next = null, best = 99;
        for (const c of out.get(key(h.to)) ?? []) {
          const diff = ((((h.d + 5 - c.d) % 10) + 10) % 10) || 10;
          if (diff < best) { best = diff; next = c; }
        }
        if (!next || face.length > 10 || (next.used && next !== h0)) { face.length = 0; break; }
        if (next === h0) break;
        h = next;
      }
      const tile = face.length && match(face.map((e) => e.d), face.map((e) => e.from));
      if (tile) tiles.push(tile);
    }
  }
  return tiles;
}
