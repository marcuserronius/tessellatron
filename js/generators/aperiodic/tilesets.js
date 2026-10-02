/**
 * Grouping Robinson triangles into Penrose tiles (pure, exact, no DOM).
 *
 * Both functions return abstract tiles { kind, verts: ring[] (cyclic order), rot } where rot is the
 * orientation in 36° steps of the tile's local +x axis in the pattern frame (see penrose.js).
 * Triangles whose partner is missing (region frontier) are dropped.
 *
 *  - rhombs(tris)     P3: two same-type triangles across their base. Acute pair = thin rhomb,
 *                     obtuse pair = thick rhomb. Axis = the shared base (thick: long diagonal between the
 *                     72° corners; thin: short diagonal between the 144° corners), pointing from the lower
 *                     to the higher vertex class; the two ends always differ by 2.
 *  - kitesDarts(tris) P2: refine(), then two same-type pieces across their axis leg with equal
 *                     apex: 'a' pair = kite, 'b' pair = dart. Axis points to the 72° tip.
 *
 * vertexClass(v, levels) -> 0..3 (4 never occurs): the vertex's class in a P3 patch, numbered so that the
 * four corners of every rhomb are a, a+1, a+1, a+2 (Penrose / de Bruijn index sum minus 1). Edges therefore
 * join classes one apart. A patch made with `levels` subdivisions has coordinates scaled by ψ^levels and
 * ψ ≡ 2 (mod 5), so the residue is first multiplied back by φ ≡ 3 per level; classes then do not depend on
 * the depth (for the canonical odd depths of robinson.js).
 */
import { key, residue, sub, toXY } from '../../core/ring.js';
import { refine } from './robinson.js';

export function vertexClass(v, levels) {
  let r = residue(v);
  for (let i = 0; i < levels; i++) r = (r * 3) % 5;
  return (r + 3) % 5;
}

/** Index (0..9) of the direction from vertex `from` to `to` in 36° steps; edges, legs and bases are always multiples. */
export function dirIndex(from, to) {
  const [x, y] = toXY(sub(to, from));
  return ((Math.round((Math.atan2(y, x) * 5) / Math.PI) % 10) + 10) % 10;
}

const edgeKey = (P, Q) => { const a = key(P), b = key(Q); return a < b ? `${a}|${b}` : `${b}|${a}`; };
function pairs(items, keyOf) {
  const m = new Map();
  for (const it of items) { const k = keyOf(it); if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
  return [...m.values()].filter((l) => l.length === 2);
}

export function rhombs(tris, levels) {
  const out = [];
  for (const [s, t] of pairs(tris, (x) => edgeKey(x.B, x.C))) {
    if (s.c !== t.c) continue;
    const [lo, hi] = [s.B, s.C].sort((p, q) => vertexClass(p, levels) - vertexClass(q, levels));
    out.push({ kind: s.c ? 'thick' : 'thin', verts: [s.A, s.B, t.A, s.C], rot: dirIndex(lo, hi) });
  }
  return out;
}

export function kitesDarts(tris) {
  const out = [];
  for (const [s, t] of pairs(refine(tris), (x) => edgeKey(x.ap, x.u))) {
    if (s.t !== t.t || key(s.ap) !== key(t.ap)) continue;
    out.push(s.t === 'a'
      ? { kind: 'kite', verts: [s.ap, s.v, s.u, t.v], rot: dirIndex(s.u, s.ap) }   // tail -> tip
      : { kind: 'dart', verts: [s.ap, s.v, s.u, t.v], rot: dirIndex(s.ap, s.u) }); // reflex -> tip
  }
  return out;
}
