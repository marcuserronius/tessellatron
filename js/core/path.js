/**
 * Path helpers (pure, no DOM). A Path is the IR's list of segments, each [letter, ...numbers]:
 *   ['M',x,y]  move (first segment only)      ['L',x,y]  line
 *   ['C',x1,y1,x2,y2,x,y]  cubic Bézier       ['Z']      close
 *
 * Commands live in the COMMANDS registry below, and every function here goes through it, so a new command (arcs,
 * quadratics, ...) is one more entry and nothing else in this file changes. Unknown commands, and commands with
 * the wrong number of arguments, throw instead of being mangled. An entry has:
 *   arity            number of arguments
 *   end(a)           the segment's end point [x,y] (leave out for Z: it has none)
 *   map(m, a)        the arguments after the affine m. m may include a reflection (negative determinant), which
 *                    an arc must answer by flipping its sweep; if a command cannot follow a given m exactly it
 *                    should throw (or fall back to its toCubic form), never return a wrong curve
 *   reverse(start,a) the arguments of the same segment walked backwards, i.e. from its end back to `start`
 *                    (leave out for commands that cannot be reversed: M, Z)
 *   flatten(start,a,steps)  points along the segment after `start`, ending at its end point
 *   toCubic(start,a) the same segment as cubic arguments (every segment command should provide it, so any path
 *                    can degrade to cubics when a transform is not exact for it)
 *   d(a, fmt)        SVG text for the arguments, when they are not a plain list of x y pairs (arcs)
 *
 * pathPoints(path)        -> [[x,y], ...]  the anchors (each segment's end point) in order; control points and Z skipped
 * pathEnds(path)          -> [[x,y] first, [x,y] last]
 * polylinePath(points)    -> Path          M at the first point, L at the rest
 * transformPath(path, m)  -> Path          every point mapped by the affine m (control points too)
 * reversePath(path)       -> Path          the same curve traversed backwards (starts with M, no Z allowed)
 * flattenPath(path, steps?) -> [[x,y],...] a polyline along the path (cubics sampled `steps` times, default 16)
 * toCubics(path)          -> Path          every L rewritten as the equal C
 * pathToD(path, precision?) -> string      SVG path data, numbers rounded to `precision` decimals (default 3)
 * splitCubic(p0,c1,c2,p1,u) -> { left, right }  de Casteljau: two cubics ([p0,c1,c2,p1] each) that together
 *                                          make the same curve, split at parameter u
 * cubicPoint(p0,c1,c2,p1,u) -> [x,y]       the point at parameter u
 */
import { apply } from './affine.js';

const pairs = (a) => { const P = []; for (let i = 0; i + 1 < a.length; i += 2) P.push([a[i], a[i + 1]]); return P; };
const mapPairs = (m, a) => pairs(a).flatMap((p) => apply(m, p));
const lerp = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
const endPair = (a) => [a[a.length - 2], a[a.length - 1]];

export function splitCubic(p0, c1, c2, p1, u) {
  const a = lerp(p0, c1, u), b = lerp(c1, c2, u), c = lerp(c2, p1, u), d = lerp(a, b, u), e = lerp(b, c, u), m = lerp(d, e, u);
  return { left: [p0, a, d, m], right: [m, e, c, p1] };
}
export const cubicPoint = (p0, c1, c2, p1, u) => splitCubic(p0, c1, c2, p1, u).left[3];

export const COMMANDS = {
  M: { arity: 2, end: endPair, map: mapPairs },
  L: {
    arity: 2, end: endPair, map: mapPairs,
    reverse: (start) => [...start],
    flatten: (start, a) => [endPair(a)],
    toCubic: (start, a) => [...lerp(start, endPair(a), 1 / 3), ...lerp(start, endPair(a), 2 / 3), ...endPair(a)],
  },
  C: {
    arity: 6, end: endPair, map: mapPairs,
    reverse: (start, a) => [a[2], a[3], a[0], a[1], start[0], start[1]],
    flatten: (start, a, steps) => {
      const [c1, c2, p1] = pairs(a);
      return Array.from({ length: steps }, (_, k) => (k === steps - 1 ? p1 : cubicPoint(start, c1, c2, p1, (k + 1) / steps)));
    },
    toCubic: (start, a) => [...a],
  },
  Z: { arity: 0, map: () => [] },
};

/** The registry entry for a segment, checked. */
function command(seg, who) {
  const k = Object.hasOwn(COMMANDS, seg[0]) ? COMMANDS[seg[0]] : null;
  if (!k) throw new Error(`${who}: unsupported path command ${seg[0]}`);
  if (seg.length - 1 !== k.arity) throw new Error(`${who}: ${seg[0]} takes ${k.arity} numbers, got ${seg.length - 1}`);
  return k;
}

export function pathPoints(path) {
  return path.flatMap((seg) => { const k = command(seg, 'pathPoints'); return k.end ? [k.end(seg.slice(1))] : []; });
}

export const polylinePath = (points) => points.map(([x, y], i) => [i ? 'L' : 'M', x, y]);

export function transformPath(path, m) {
  return path.map((seg) => [seg[0], ...command(seg, 'transformPath').map(m, seg.slice(1))]);
}

export function reversePath(path) {
  if (!path.length) return [];
  if (path[0][0] !== 'M') throw new Error('reversePath: a path must start with M');
  const segs = path.slice(1), P = [command(path[0], 'reversePath').end(path[0].slice(1))];
  for (const seg of segs) {
    const k = command(seg, 'reversePath');
    if (!k.reverse) throw new Error(`reversePath: unsupported path command ${seg[0]}`);
    P.push(k.end(seg.slice(1)));
  }
  const out = [['M', ...P[P.length - 1]]];
  for (let i = segs.length - 1; i >= 0; i--) out.push([segs[i][0], ...COMMANDS[segs[i][0]].reverse(P[i], segs[i].slice(1))]);
  return out;
}

export function pathEnds(path) {
  const P = pathPoints(path);
  return [P[0], P[P.length - 1]];
}

export function flattenPath(path, steps = 16) {
  const out = [];
  let cur = null;
  for (const seg of path) {
    const k = command(seg, 'flattenPath'), a = seg.slice(1);
    if (!k.end) continue; // Z: the closing edge is implied
    if (seg[0] === 'M') out.push(cur = k.end(a));
    else {
      if (!k.flatten) throw new Error(`flattenPath: unsupported path command ${seg[0]}`);
      out.push(...k.flatten(cur, a, steps));
      cur = k.end(a);
    }
  }
  return out;
}

export function toCubics(path) {
  let cur = null;
  return path.map((seg) => {
    const k = command(seg, 'toCubics'), a = seg.slice(1);
    const out = seg[0] === 'L' ? ['C', ...k.toCubic(cur, a)] : seg;
    if (k.end) cur = k.end(a);
    return out;
  });
}

export function pathToD(path, precision = 3) {
  const fmt = (n) => String(+n.toFixed(precision));
  return path.map((seg) => {
    const k = command(seg, 'pathToD'), a = seg.slice(1);
    return seg[0] + (k.d ? k.d(a, fmt) : pairs(a).map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(' '));
  }).join('');
}
