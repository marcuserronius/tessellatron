/**
 * Robinson-triangle triangulation of the plane (the common ancestor of Penrose P1, P2 and P3).
 * Pure, exact (coordinates are core/ring.js elements), no DOM.
 *
 * Triangle { c, A, B, C }: A is the apex, BC the base; c = 0 acute (apex 36°, legs 1, base 1/φ),
 * c = 1 obtuse (apex 108°, legs 1, base φ). The vertex ORDER is the chirality label: the P2 axis
 * leg is apex -> B (acute) / apex -> C (obtuse) after `refine`.
 *
 *  - seed(turn): wheel of ten acute triangles around the origin (leg 1), turned by `turn`·36° (exact).
 *    After one subdivision the centre is a legal 5-fold vertex, so every depth >= 1 is a valid patch.
 *    Even and odd depths give two DIFFERENT 5-fold tilings, and depths 4 apart differ by a 36° turn,
 *    so callers use odd depths only and pass turn = 1 when depth ≡ 3 (mod 4): patches of different
 *    depth are then the same tiling (see canonicalDepth).
 *  - subdivide(tris): one inflation step (acute -> 2 pieces, obtuse -> 3), legs scaled by 1/φ.
 *  - triangulate(levels, keep): seed (turned for depth ≡ 3 mod 4) then `levels` subdivisions, discarding children for which
 *    keep(tri) is false (region pruning; the caller adds a margin).
 *  - refine(tris): split every obtuse triangle once more into an acute and a smaller obtuse one,
 *    giving 'a' (legs 1, base 1/φ) and 'b' (legs 1/φ, base 1) pieces {t, ap, u, v}: apex, axis
 *    end, other end. Pairing 'a'+'a' / 'b'+'b' across the axis leg yields kites / darts.
 */
import { ZERO, add, sub, mul, PSI, z10 } from '../../core/ring.js';

export function seed(turn = 0) {
  const R = z10(turn);
  return Array.from({ length: 10 }, (_, i) => {
    let B = z10(i), C = z10(i + 1);
    if (i % 2 === 0) [B, C] = [C, B];
    return { c: 0, A: ZERO, B: mul(R, B), C: mul(R, C) };
  });
}

/** Smallest depth >= `levels` (and >= 1) that yields the canonical tiling: odd. */
export const canonicalDepth = (levels) => Math.max(1, levels) | 1;

const toward = (P, Q) => add(P, mul(sub(Q, P), PSI)); // P + (Q-P)/φ, exact

export function subdivide(tris) {
  const out = [];
  for (const { c, A, B, C } of tris) {
    if (c === 0) {
      const P = toward(A, B);
      out.push({ c: 0, A: C, B: P, C: B }, { c: 1, A: P, B: C, C: A });
    } else {
      const Q = toward(B, A), R = toward(B, C);
      out.push({ c: 1, A: R, B: C, C: A }, { c: 1, A: Q, B: R, C: B }, { c: 0, A: R, B: Q, C: A });
    }
  }
  return out;
}

export function triangulate(levels, keep = () => true) {
  let tris = seed(levels % 4 === 3 ? 1 : 0);
  for (let i = 0; i < levels; i++) tris = subdivide(tris).filter(keep);
  return tris;
}

export function refine(tris) {
  const out = [];
  for (const { c, A, B, C } of tris) {
    if (c === 0) out.push({ t: 'a', ap: A, u: B, v: C });
    else {
      const R = toward(B, C);
      out.push({ t: 'b', ap: R, u: C, v: A }, { t: 'a', ap: B, u: A, v: R });
    }
  }
  return out;
}
