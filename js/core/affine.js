/**
 * Affine transforms as [a,b,c,d,e,f], identical to SVG matrix(a b c d e f):
 *   x' = a*x + c*y + e ;  y' = b*x + d*y + f
 * Pure functions, no DOM.
 */
const snap = (v) => (Math.abs(v) < 1e-12 ? 0 : v);

export const identity = () => [1, 0, 0, 1, 0, 0];
export const translate = (x, y) => [1, 0, 0, 1, x, y];

/** Compose: result applies `n` first, then `m`. */
export const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

/** Rotation by `deg` degrees (about origin, or about [cx,cy]). */
export function rotate(deg, cx = 0, cy = 0) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const R = [c, s, -s, c, 0, 0].map(snap);
  return cx || cy ? multiply(translate(cx, cy), multiply(R, translate(-cx, -cy))) : R;
}

export const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export function invert(m) {
  const [a, b, c, d, e, f] = m, det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}
