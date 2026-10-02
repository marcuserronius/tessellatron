/**
 * Exact arithmetic in the cyclotomic ring Z[ζ], ζ = e^(2πi/5) (pure, no DOM).
 * Contains φ = (1+√5)/2 and every 10th root of unity, so Penrose-type tilings can be built with
 * integer coordinates only (no drift at deep inflation levels).
 *
 * An element is [a,b,c,d] = a + bζ + cζ² + dζ³ (integers), reduced by ζ⁴ = -1-ζ-ζ²-ζ³.
 *  - add, sub, mul: exact. PHI = φ, PSI = 1/φ = φ-1 (so dividing by φ is a multiplication).
 *  - z10(k): e^(iπk/5), the unit vector at k·36°. ZERO, ONE.
 *  - toXY(x): [re, im] as floats (the only lossy step).
 *  - residue(x): a+b+c+d mod 5. ζ→1 is a ring homomorphism Z[ζ]→Z/5, so this is well defined
 *    and exact; Penrose rhomb vertices fall into four of its five classes (see tilesets/p1).
 *  - key(x): string usable as a Map/Set key (exact equality).
 */
const W = [0, 1, 2, 3].map((k) => [Math.cos((2 * Math.PI * k) / 5), Math.sin((2 * Math.PI * k) / 5)]);

export const ZERO = [0, 0, 0, 0];
export const ONE = [1, 0, 0, 0];
export const add = (x, y) => x.map((v, i) => v + y[i]);
export const sub = (x, y) => x.map((v, i) => v - y[i]);

export function mul(x, y) {
  const p = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) p[i + j] += x[i] * y[j];
  for (let k = 6; k >= 4; k--) { // ζ^k = -(ζ^(k-4) + ... + ζ^(k-1))
    const c = p[k];
    p[k] = 0;
    for (let t = 0; t < 4; t++) p[k - 4 + t] -= c;
  }
  return p.slice(0, 4);
}

const zpow = (k) => { const m = ((k % 5) + 5) % 5; return m < 4 ? [0, 1, 2, 3].map((i) => +(i === m)) : [-1, -1, -1, -1]; };
/** e^(iπk/5): ζ10 = -ζ³, so ζ10^k = (-1)^k ζ^(3k). */
export const z10 = (k) => { const m = ((k % 10) + 10) % 10, e = zpow(3 * m); return m % 2 ? e.map((v) => -v) : e; };

export const PHI = [0, 0, -1, -1];            // -(ζ² + ζ³) = 2cos(36°)
export const PSI = sub(PHI, ONE);             // 1/φ

export const toXY = ([a, b, c, d]) => [a + b * W[1][0] + c * W[2][0] + d * W[3][0], b * W[1][1] + c * W[2][1] + d * W[3][1]];
export const residue = (x) => (((x[0] + x[1] + x[2] + x[3]) % 5) + 5) % 5;
export const key = (x) => x.join(',');
