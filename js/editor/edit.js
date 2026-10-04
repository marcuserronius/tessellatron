/**
 * Pure editing operations on a shape (no DOM). A shape is { generator, edges: { protoId: { edgeId: [[t,n],...] } } }
 * (editor/shape.js). `at` names one edge: { generator, pid, eid }. Every operation returns a NEW shape and
 * never mutates its input; the result is null when no edits are left, which is how the app stores "no shape".
 * Operations clamp points to LIMITS but do not check the outline: the UI asks shapeProblems() before accepting.
 *
 * withMode(shape, generator, mode) -> shape|null  the same edits under another tiling mode (editor/modes.js); a shape
 *                                      keeps its mode even with no edits, so choosing a mode sticks
 * pointsOf(shape, at)               -> [[t,n],...]  the edge's interior points ([] for a straight edge)
 * setPoints / insertPoint(index) / movePoint(index) / removePoint(index) / resetEdge  (shape, at, ...) -> shape|null
 * nearestOnEdge(frame, pts, [x,y], kind)  -> { index, point: [t,n], distance }  where on the edge's current polyline
 *                                      (frame = edgeFrame of the straight edge, x/y in prototile coordinates) a click
 *                                      lands; `index` is where to insert a new point. For a `symmetric` edge (see
 *                                      editor/shape.js) only the first half is stored, so a click on the mirrored half is
 *                                      mapped back to the first half. Adding past LIMITS.points is a no-op.
 */
import { toLocal, fromLocal, expandPoints, mirrorPoint, LIMITS } from './shape.js';
import { DEFAULT_MODE } from './modes.js';

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
export const clampPoint = ([t, n]) => [clamp(t, LIMITS.t), clamp(n, LIMITS.n)];
const own = (o, k) => Object.hasOwn(o, k);

export function pointsOf(shape, { generator, pid, eid }) {
  if (shape?.generator !== generator || !own(shape.edges, pid) || !own(shape.edges[pid], eid)) return [];
  return shape.edges[pid][eid];
}

const keep = (generator, mode, edges) => {
  const m = mode && mode !== DEFAULT_MODE ? { mode } : {};
  return Object.keys(edges).length || m.mode ? { generator, ...m, edges } : null;
};
export const withMode = (shape, generator, mode) => keep(generator, mode, shape?.generator === generator ? shape.edges : {});

export function setPoints(shape, at, pts) {
  const { generator, pid, eid } = at;
  const edges = { ...(shape?.generator === generator ? shape.edges : {}) };
  const per = { ...(own(edges, pid) ? edges[pid] : {}) };
  if (pts.length) per[eid] = pts.map(clampPoint); else delete per[eid];
  if (Object.keys(per).length) edges[pid] = per; else delete edges[pid];
  return keep(generator, shape?.generator === generator ? shape.mode : undefined, edges);
}

export function insertPoint(shape, at, index, p) {
  const pts = pointsOf(shape, at);
  if (pts.length >= LIMITS.points) return shape;
  return setPoints(shape, at, [...pts.slice(0, index), p, ...pts.slice(index)]);
}
export const movePoint = (shape, at, index, p) => setPoints(shape, at, pointsOf(shape, at).map((q, i) => (i === index ? p : q)));
export const removePoint = (shape, at, index) => setPoints(shape, at, pointsOf(shape, at).filter((_, i) => i !== index));
export const resetEdge = (shape, at) => setPoints(shape, at, []);

export function nearestOnEdge(frame, pts, xy, kind = 'free') {
  const V = [frame.A, ...expandPoints(pts, kind).map((p) => toLocal(frame, p)), frame.B];
  let best = null;
  for (let k = 0; k + 1 < V.length; k++) {
    const a = V[k], b = V[k + 1], dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
    const u = len2 ? Math.min(1, Math.max(0, ((xy[0] - a[0]) * dx + (xy[1] - a[1]) * dy) / len2)) : 0;
    const q = [a[0] + u * dx, a[1] + u * dy], distance = Math.hypot(xy[0] - q[0], xy[1] - q[1]);
    if (!best || distance < best.distance) best = { index: k, point: fromLocal(frame, q), distance };
  }
  const q = pts.length; // segments 0..q lie in the stored half; the rest mirror them (segment k <-> 2q+1-k)
  return kind === 'symmetric' && best.index > q ? { ...best, index: 2 * q + 1 - best.index, point: mirrorPoint(best.point) } : best;
}
