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
