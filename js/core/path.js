/**
 * Path helpers (pure, no DOM). A Path is the IR's list of ['M',x,y] / ['L',x,y] / ['Z'] segments.
 * Only M and L are handled; curved commands arrive together with the renderer's support for them
 * (see TODO.md), and these helpers throw on anything else rather than mangle it.
 *
 * pathPoints(path)        -> [[x,y], ...]  vertices in order (Z skipped)
 * pathEnds(path)          -> [[x,y] first, [x,y] last]
 * polylinePath(points)    -> Path          M at the first point, L at the rest
 * transformPath(path, m)  -> Path          every point mapped by the affine m
 * reversePath(path)       -> Path          the same curve traversed backwards (no Z allowed)
 */
import { apply } from './affine.js';

const known = (path, who, allowed) => {
  for (const [c] of path) if (!allowed.includes(c)) throw new Error(`${who}: unsupported path command ${c}`);
};

export function pathPoints(path) {
  known(path, 'pathPoints', ['M', 'L', 'Z']);
  return path.filter(([c]) => c !== 'Z').map(([, x, y]) => [x, y]);
}

export const polylinePath = (points) => points.map(([x, y], i) => [i ? 'L' : 'M', x, y]);

export function transformPath(path, m) {
  known(path, 'transformPath', ['M', 'L', 'Z']);
  return path.map(([c, ...v]) => (c === 'Z' ? ['Z'] : [c, ...apply(m, v)]));
}

export function reversePath(path) {
  known(path, 'reversePath', ['M', 'L']);
  return polylinePath(pathPoints(path).reverse());
}

export function pathEnds(path) {
  const P = pathPoints(path);
  return [P[0], P[P.length - 1]];
}
