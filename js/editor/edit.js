/**
 * Pure editing operations on a shape (no DOM). A shape is { generator, mode?, edges: { protoId: { edgeId: <edge> } } }
 * (editor/shape.js; an <edge> is a path in the edge's normalized frame, older files give a list of points).
 * `at` names one edge: { generator, pid, eid, kind? } where kind is its edge class's kind ('free' by default, or
 * 'symmetric'; the kind decides where the stored path ends). Every operation returns a NEW shape and never mutates
 * its input; the result is null when no edits are left, which is how the app stores "no shape". An edge that becomes
 * the plain straight line is dropped. Operations clamp points to LIMITS but do not check the outline: the UI asks
 * shapeProblems() before accepting.
 *
 * "Points" are the edge's interior ANCHORS (segment end points); the start and end are fixed. Moving an anchor takes
 * the control points next to it along (handles keep their offsets); inserting on a cubic splits it, so the curve does
 * not change; removing an anchor joins its two segments (two lines give a line, otherwise a cubic that keeps the
 * outer control points).
 *
 * withMode(shape, generator, mode) -> shape|null  the same edits under another tiling mode (editor/modes.js); a shape
 *                                      keeps its mode even with no edits, so choosing a mode sticks
 * edgeValue(shape, at)              -> <edge>|undefined  what is stored for the edge (a path, a point list, or nothing)
 * pointsOf(shape, at)               -> [[t,n],...]  the edge's interior anchors ([] for a straight edge)
 * setPoints(shape, at, pts)         -> shape|null  replace the whole edge by the polyline through pts (drops any curves)
 * insertPoint(shape, at, index, p, u?) / movePoint(shape, at, index, p) / removePoint(shape, at, index) / resetEdge(shape, at)
 *                                      `index` of insertPoint is the SEGMENT to split (= where the new anchor lands in
 *                                      pointsOf); on a line the new anchor is p, on a cubic it is the curve point at
 *                                      parameter u (found from p when u is left out). movePoint/removePoint take an
 *                                      index into pointsOf.
 * Nodes: the edge's anchors numbered 0..n in path order, 0 the start and n the end (for a symmetric edge the middle
 * of the curve). A node has an `in` handle (the second control point of the segment arriving at it) and an `out`
 * handle (the first control point of the segment leaving it); a segment that is a plain line has none. A node is
 * SMOOTH when both handles exist and point in opposite directions along one line; that is inferred from the path,
 * not stored. Interior nodes are 1..n-1; the start and end are pinned but have handles.
 * nodeAt(shape, at, node)           -> { anchor, in, out, smooth, interior } | null  (in/out: [t,n] or null)
 * nodeCount(shape, at)              -> number of nodes
 * setHandle(shape, at, node, 'in'|'out', p, { lock = true })  move a handle (a line segment turns into the equal
 *                                      cubic first); when the node is smooth and lock is on, the other handle turns
 *                                      to face away and keeps its length (Alt-drag turns lock off)
 * smoothNode(shape, at, node)       -> make an interior node smooth: existing handles are aligned (kept if there is
 *                                      one, bisected if both), missing ones get a third of the neighbour distance
 * cornerNode(shape, at, node)       -> retract the node's handles to their neutral place, a third of the way along the
 *                                      segment, where a straight line has them; segments that become straight turn back into lines
 * A cubic that is really a straight line (controls on the chord, or both at the ends) is turned back into an L
 * whenever an edge is stored, so the stored form stays minimal.
 * nearestOnEdge(frame, edge, [x,y], kind) -> { index, u, point: [t,n], distance }  where on the edge's current curve
 *                                      (frame = edgeFrame of the straight edge, x/y in prototile coordinates; `edge` is
 *                                      an edge value) a click lands: `index` is the segment, `u` 0..1 along it, so
 *                                      insertPoint(shape, at, index, point, u) puts a node exactly there. For a
 *                                      `symmetric` edge only the first half is stored, so a click on the mirrored half
 *                                      is mapped back to the first half. Adding past LIMITS.points is a no-op.
 */
import { COMMANDS, cubicPoint, splitCubic, pathPoints, transformPath } from '../core/path.js';
import { LIMITS, edgePath, edgeFromPoints, expandEdge, frameMatrix, fromLocal, hasEdits, interiorPoints, mirrorPoint } from './shape.js';
import { DEFAULT_MODE } from './modes.js';

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
export const clampPoint = ([t, n]) => [clamp(t, LIMITS.t), clamp(n, LIMITS.n)];
const clampArgs = (args) => args.map((v, i) => clamp(v, i % 2 ? LIMITS.n : LIMITS.t));
const own = (o, k) => Object.hasOwn(o, k);
const STEPS = 24; // samples per curved segment when looking for the nearest point

export function edgeValue(shape, { generator, pid, eid }) {
  return shape?.generator === generator && own(shape.edges, pid) && own(shape.edges[pid], eid) ? shape.edges[pid][eid] : undefined;
}
export const pointsOf = (shape, at) => interiorPoints(edgeValue(shape, at), at.kind);

const keep = (generator, mode, edges) => {
  const m = mode && mode !== DEFAULT_MODE ? { mode } : {};
  return Object.keys(edges).length || m.mode ? { generator, ...m, edges } : null;
};
export const withMode = (shape, generator, mode) => keep(generator, mode, shape?.generator === generator ? shape.edges : {});

const EPS = 1e-9;
const dist2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const lerp2 = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];

/** A cubic whose controls lie on its chord (1/3 and 2/3 of the way, or both at the ends) is a line: write it as L. */
function simplifyPath(path) {
  const P = pathPoints(path);
  return path.map((seg, i) => {
    if (seg[0] !== 'C') return seg;
    const a = P[i - 1], b = P[i], c1 = [seg[1], seg[2]], c2 = [seg[3], seg[4]];
    const line = (dist2(c1, lerp2(a, b, 1 / 3)) <= EPS && dist2(c2, lerp2(a, b, 2 / 3)) <= EPS) || (dist2(c1, a) <= EPS && dist2(c2, b) <= EPS);
    return line ? ['L', ...b] : seg;
  });
}

/** Store `path` for the edge (or drop the edge when it is straight). */
function put(shape, { generator, pid, eid }, rawPath) {
  const path = simplifyPath(rawPath);
  const edges = { ...(shape?.generator === generator ? shape.edges : {}) };
  const per = { ...(own(edges, pid) ? edges[pid] : {}) };
  if (hasEdits(path)) per[eid] = path; else delete per[eid];
  if (Object.keys(per).length) edges[pid] = per; else delete edges[pid];
  return keep(generator, shape?.generator === generator ? shape.mode : undefined, edges);
}

export const setPoints = (shape, at, pts) => put(shape, at, edgeFromPoints(pts.map(clampPoint), at.kind));
export const resetEdge = (shape, at) => put(shape, at, edgeFromPoints([], at.kind));

const pairsOf = (a) => [[a[0], a[1]], [a[2], a[3]], [a[4], a[5]]];
const pathOf = (shape, at) => edgePath(edgeValue(shape, at), at.kind);
const cubicOf = (seg, start) => {
  const k = COMMANDS[seg[0]];
  if (!k?.toCubic) throw new Error(`cannot turn a ${seg[0]} segment into a cubic`);
  return k.toCubic(start, seg.slice(1));
};

/** Parameter on the cubic start-c1-c2-end whose point is nearest p. */
function nearestParam(start, c1, c2, end, p) {
  let best = 0.5, bd = Infinity;
  for (let k = 0; k <= 96; k++) {
    const q = cubicPoint(start, c1, c2, end, k / 96), d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bd) { bd = d; best = k / 96; }
  }
  return best;
}

export function insertPoint(shape, at, index, p, u) {
  const path = pathOf(shape, at);
  if (path.length - 2 >= LIMITS.points) return shape;
  const k = Math.min(Math.max(index, 0), path.length - 2) + 1, seg = path[k], start = pathPoints(path)[k - 1];
  let pieces;
  if (seg[0] === 'L') pieces = [['L', ...clampPoint(p)], seg];
  else if (seg[0] === 'C') {
    const [c1, c2, end] = pairsOf(seg.slice(1)), { left, right } = splitCubic(start, c1, c2, end, u ?? nearestParam(start, c1, c2, end, p));
    pieces = [['C', ...left[1], ...left[2], ...left[3]], ['C', ...right[1], ...right[2], ...right[3]]];
  } else throw new Error(`insertPoint: cannot split a ${seg[0]} segment`);
  return put(shape, at, [...path.slice(0, k), ...pieces, ...path.slice(k + 1)]);
}

export function movePoint(shape, at, index, p) {
  const path = pathOf(shape, at), k = index + 1;
  if (index < 0 || k > path.length - 2) return shape;
  const q = clampPoint(p), old = pathPoints(path)[k], d = [q[0] - old[0], q[1] - old[1]];
  // the segment ending at the anchor ends at q (a cubic's second control point goes along); the one starting there
  // has its first control point go along, so the handles keep their offsets from the anchor
  const arriving = (seg) => (seg[0] === 'C' ? ['C', seg[1], seg[2], ...clampArgs([seg[3] + d[0], seg[4] + d[1]]), ...q] : [seg[0], ...q]);
  const leaving = (seg) => (seg[0] === 'C' ? ['C', ...clampArgs([seg[1] + d[0], seg[2] + d[1]]), ...seg.slice(3)] : seg);
  return put(shape, at, path.map((seg, i) => (i === k ? arriving(seg) : i === k + 1 ? leaving(seg) : seg)));
}

export function removePoint(shape, at, index) {
  const path = pathOf(shape, at), k = index + 1;
  if (index < 0 || k > path.length - 2) return shape;
  const P = pathPoints(path), before = path[k], after = path[k + 1], end = P[k + 1];
  let merged;
  if (before[0] === 'L' && after[0] === 'L') merged = ['L', ...end];
  else {
    const a = cubicOf(before, P[k - 1]), b = cubicOf(after, P[k]);
    merged = ['C', a[0], a[1], b[2], b[3], ...end]; // keep the outer control points, drop the two at the removed anchor
  }
  return put(shape, at, [...path.slice(0, k), merged, ...path.slice(k + 2)]);
}

const isSmooth = (a, i, o) => {
  if (!i || !o) return false;
  const vi = [i[0] - a[0], i[1] - a[1]], vo = [o[0] - a[0], o[1] - a[1]], li = Math.hypot(...vi), lo = Math.hypot(...vo);
  if (li <= EPS || lo <= EPS) return false;
  return Math.abs((vi[0] * vo[1] - vi[1] * vo[0]) / (li * lo)) < 1e-6 && (vi[0] * vo[0] + vi[1] * vo[1]) < 0;
};

export const nodeCount = (shape, at) => pathOf(shape, at).length;

export function nodeAt(shape, at, node) {
  const path = pathOf(shape, at), P = pathPoints(path);
  if (!Number.isInteger(node) || node < 0 || node >= P.length) return null;
  const arriving = node >= 1 && path[node][0] === 'C' ? [path[node][3], path[node][4]] : null;
  const leaving = node + 1 < path.length && path[node + 1][0] === 'C' ? [path[node + 1][1], path[node + 1][2]] : null;
  return { anchor: P[node], in: arriving, out: leaving, smooth: isSmooth(P[node], arriving, leaving), interior: node >= 1 && node <= path.length - 2 };
}

/** Set the control point `role` ('in' | 'out') of `node` on a copy of the path, turning a line segment into a cubic first. */
function withControl(path, P, node, role, pt) {
  const i = role === 'in' ? node : node + 1, seg = path[i][0] === 'C' ? path[i] : ['C', ...cubicOf(path[i], P[i - 1])];
  path[i] = role === 'in' ? [...seg.slice(0, 3), ...clampPoint(pt), ...seg.slice(5)] : ['C', ...clampPoint(pt), ...seg.slice(3)];
}
const validHandle = (path, node, role) => (role === 'in' ? node >= 1 && node <= path.length - 1 : role === 'out' && node >= 0 && node <= path.length - 2);

export function setHandle(shape, at, node, role, p, { lock = true } = {}) {
  const path = pathOf(shape, at);
  if (!Number.isInteger(node) || !validHandle(path, node, role)) return shape;
  const P = pathPoints(path), before = nodeAt(shape, at, node), a = P[node], next = path.map((seg) => seg.slice());
  withControl(next, P, node, role, p);
  if (lock && before.smooth && before.interior) { // keep the line through the anchor: the other handle faces away, same length
    const other = role === 'in' ? 'out' : 'in', ov = before[other], len = dist2(ov, a), d = [clampPoint(p)[0] - a[0], clampPoint(p)[1] - a[1]], dl = Math.hypot(...d);
    if (dl > EPS) withControl(next, P, node, other, [a[0] - (d[0] / dl) * len, a[1] - (d[1] / dl) * len]);
  }
  return put(shape, at, next);
}

export function smoothNode(shape, at, node) {
  const path = pathOf(shape, at), info = nodeAt(shape, at, node);
  if (!info?.interior) return shape;
  const P = pathPoints(path), a = info.anchor, prev = P[node - 1], nxt = P[node + 1];
  const vin = info.in ? [info.in[0] - a[0], info.in[1] - a[1]] : [0, 0], vout = info.out ? [info.out[0] - a[0], info.out[1] - a[1]] : [0, 0];
  const lin = Math.hypot(...vin), lout = Math.hypot(...vout), unit = (v, l) => [v[0] / l, v[1] / l];
  const chord = [nxt[0] - prev[0], nxt[1] - prev[1]], cl = Math.hypot(...chord);
  let T = cl > EPS ? unit(chord, cl) : [1, 0]; // the direction the curve leaves the node in
  if (lin > EPS && lout > EPS) { // bisect the two existing handles (unless they point the same way: then the chord decides)
    const b = [unit(vout, lout)[0] - unit(vin, lin)[0], unit(vout, lout)[1] - unit(vin, lin)[1]], bl = Math.hypot(...b);
    if (bl > EPS) T = unit(b, bl);
  } else if (lin > EPS) T = unit([-vin[0], -vin[1]], lin);
  else if (lout > EPS) T = unit(vout, lout);
  const inLen = lin > EPS ? lin : dist2(a, prev) / 3, outLen = lout > EPS ? lout : dist2(nxt, a) / 3, next = path.map((seg) => seg.slice());
  withControl(next, P, node, 'in', [a[0] - T[0] * inLen, a[1] - T[1] * inLen]);
  withControl(next, P, node, 'out', [a[0] + T[0] * outLen, a[1] + T[1] * outLen]);
  return put(shape, at, next);
}

export function cornerNode(shape, at, node) {
  const path = pathOf(shape, at), info = nodeAt(shape, at, node);
  if (!info) return shape;
  const P = pathPoints(path), next = path.map((seg) => seg.slice());
  if (info.in) withControl(next, P, node, 'in', lerp2(info.anchor, P[node - 1], 1 / 3));
  if (info.out) withControl(next, P, node, 'out', lerp2(info.anchor, P[node + 1], 1 / 3));
  return put(shape, at, next);
}

export function nearestOnEdge(frame, edge, xy, kind = 'free') {
  const stored = edgePath(edge, kind), full = transformPath(expandEdge(stored, kind), frameMatrix(frame));
  let best = null, cur = full[0].slice(1);
  full.slice(1).forEach((seg, k) => {
    const K = COMMANDS[seg[0]], args = seg.slice(1), V = [cur, ...K.flatten(cur, args, STEPS)];
    for (let s = 0; s + 1 < V.length; s++) {
      const a = V[s], b = V[s + 1], dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
      const f = len2 ? Math.min(1, Math.max(0, ((xy[0] - a[0]) * dx + (xy[1] - a[1]) * dy) / len2)) : 0;
      const q = [a[0] + f * dx, a[1] + f * dy], distance = Math.hypot(xy[0] - q[0], xy[1] - q[1]);
      if (!best || distance < best.distance) best = { index: k, u: (s + f) / (V.length - 1), point: fromLocal(frame, q), distance };
    }
    cur = K.end(args);
  });
  const q = stored.length - 2; // segments 0..q lie in the stored half; the rest mirror them (segment k <-> 2q+1-k)
  return kind === 'symmetric' && best.index > q ? { ...best, index: 2 * q + 1 - best.index, u: 1 - best.u, point: mirrorPoint(best.point) } : best;
}
