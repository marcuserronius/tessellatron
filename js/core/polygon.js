/**
 * Polygon helpers (pure, no DOM). Points are [x, y]; y points down (screen coordinates), so
 * "increasing angle" is clockwise on screen. Regular polygons are always listed in that order.
 */
const rad = (d) => (d * Math.PI) / 180;

/** Circumradius of a regular n-gon with side s. */
export const circumradius = (n, s = 1) => s / (2 * Math.sin(Math.PI / n));

/** Vertices of a regular n-gon (side s, centre c); vertex 0 sits at `startDeg` from the centre. */
export function ngon(n, [cx, cy] = [0, 0], startDeg = -90, s = 1) {
  const R = circumradius(n, s);
  return Array.from({ length: n }, (_, k) => {
    const a = rad(startDeg + (360 * k) / n);
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  });
}

export const centroid = (P) => [P.reduce((a, p) => a + p[0], 0) / P.length, P.reduce((a, p) => a + p[1], 0) / P.length];

/** Shoelace area; positive when the vertices run in increasing-angle order (clockwise on screen). */
export const signedArea = (P) => P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0);

const side = (a, b, p) => ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
const within = (a, b, p, e) => p[0] >= Math.min(a[0], b[0]) - e && p[0] <= Math.max(a[0], b[0]) + e
  && p[1] >= Math.min(a[1], b[1]) - e && p[1] <= Math.max(a[1], b[1]) + e;
const opposite = (u, v, e) => (u > e && v < -e) || (u < -e && v > e);

/** Do segments ab and cd share a point (crossing, T-junction, endpoint contact or collinear overlap)? */
function segmentsMeet(a, b, c, d, e) {
  const s1 = side(a, b, c), s2 = side(a, b, d), s3 = side(c, d, a), s4 = side(c, d, b);
  if (opposite(s1, s2, e) && opposite(s3, s4, e)) return true;
  return (Math.abs(s1) <= e && within(a, b, c, e)) || (Math.abs(s2) <= e && within(a, b, d, e))
    || (Math.abs(s3) <= e && within(c, d, a, e)) || (Math.abs(s4) <= e && within(c, d, b, e));
}

/**
 * True if the closed polygon P (last vertex joins the first) is NOT simple: two non-adjacent edges meet
 * (touching counts), two adjacent edges fold back over each other, or fewer than 3 distinct vertices remain.
 * Repeated consecutive vertices are ignored. `eps` is a distance tolerance. O(n^2).
 */
export function selfIntersects(P, eps = 1e-9) {
  const Q = P.filter((p, i) => Math.hypot(p[0] - P[(i + 1) % P.length][0], p[1] - P[(i + 1) % P.length][1]) > eps);
  const n = Q.length;
  if (n < 3) return true;
  for (let i = 0; i < n; i++) {
    const a = Q[i], b = Q[(i + 1) % n], c = Q[(i + 2) % n];
    if (Math.abs(side(a, b, c)) <= eps && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0) return true; // fold-back
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the wrap
      if (segmentsMeet(a, b, Q[j], Q[(j + 1) % n], eps)) return true;
    }
  }
  return false;
}
