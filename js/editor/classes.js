/**
 * Edge classes derived from tile adjacency (pure, no DOM; depends on core only).
 *
 * Which edges of a tiling must carry the same curve depends on how tiles are placed, not just on the prototile:
 * once tiles are turned (orient.rot) the top edge of one tile meets the left edge of the next. So the classes are
 * read off an actual patch of tiles. `tile.proto` is the tile's SHAPE (editor/modes.js assigns shapes and turns):
 * an edge is identified by its shape and edge id, and "proto" below means that shape id. Tiles of one shape that sit
 * in different orientations share the shape, which is what makes e.g. a quarter-turn tiling's edges equal. Two tile edges are GLUED when their world segments coincide, reversed. Gluing
 * edge a of tile A to edge b of tile B means  curve(b) = reverse(T curve(a)),  T = inverse(B.transform) * A.transform
 * (a map between prototile frames). Following glues from the lowest-numbered edge of a connected set (the
 * representative) gives every member edge a transform X and a parity: member = X(rep), reversed when the glue
 * path has odd length. A second route to the same edge is a constraint on the representative curve:
 *   same parity   -> X1 = X2 is needed; if not, the edge is `locked` (it can only stay straight);
 *   differing parity -> the curve must equal its own reverse under S = inverse(X1) * X2, which is only possible for
 *                   a half-turn about the edge midpoint: the class is `symmetric` (the curve is point-symmetric);
 *                   any other S locks the class.
 * Mirrored tiles (negative determinant: a flipped tile) are supported. Two tiles of the same handedness walk their
 * shared edge in opposite world directions and a mirrored one with a proper one in the SAME direction, so a mirrored
 * glue does not reverse the curve (the parity above counts only the reversing glues). Where a route comes back to an
 * edge with differing parity through a mirror across the perpendicular through the edge's middle, the curve would have to
 * be mirror-symmetric (a bump); that is not supported yet and the class is `locked`. Also locked: an interior edge
 * with no glued neighbour (the tiling is not edge-to-edge, e.g. a row shift or a twist).
 *
 * edgeClasses(ir) -> Class[]   ordered by representative
 *   Class = { rep: {proto, edge}, kind: 'free'|'symmetric'|'locked', reason?: string,
 *             members: [{ proto, edge, transform, reversed }] }     (rep first, transform = identity, reversed = false)
 *   A member's curve is  reversed ? reverse(transform(repCurve)) : transform(repCurve), with its ends pinned to the
 *   member's own straight edge. Only edges that occur on tiles of `ir` are classified.
 * `ir.meta.bounds` (the generation region) tells which edges lie far enough inside the patch to need a neighbour;
 * without it every edge does.
 * slotKey({proto, edge}) -> "proto/edge"
 */
import { apply, invert, multiply } from '../core/affine.js';
import { pathPoints } from '../core/path.js';

export const slotKey = ({ proto, edge }) => `${proto}/${edge}`;
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const det = (m) => m[0] * m[3] - m[1] * m[2];
const sameMap = (m, n, eps) => [0, 1, 2, 3].every((i) => Math.abs(m[i] - n[i]) <= 1e-9) && dist([m[4], m[5]], [n[4], n[5]]) <= eps;

export function edgeClasses(ir) {
  const protoIds = Object.keys(ir.prototiles), orderOf = new Map(), ends = new Map();
  let scale = 0;
  protoIds.forEach((pid, pi) => ir.prototiles[pid].edges.forEach((e, ei) => {
    const P = pathPoints(e.path), k = `${pid}/${e.id}`;
    orderOf.set(k, pi * 1e4 + ei); ends.set(k, [P[0], P[P.length - 1]]);
    scale = Math.max(scale, dist(P[0], P[P.length - 1]));
  }));
  const eps = 1e-6 * (scale || 1), cell = Math.max(scale * 1e-3, 1e-9);
  const b = ir.meta?.bounds;
  const interior = (m) => !b || (m[0] >= b[0] && m[0] <= b[2] && m[1] >= b[1] && m[1] <= b[3]);

  // world segments of every tile edge, hashed by midpoint
  const entries = [], grid = new Map(), cellKey = (i, j) => `${i},${j}`;
  ir.tiles.forEach((t, ti) => ir.prototiles[t.proto].edges.forEach((e) => {
    const slot = `${t.proto}/${e.id}`, [s0, f0] = ends.get(slot), s = apply(t.transform, s0), f = apply(t.transform, f0);
    const mid = [(s[0] + f[0]) / 2, (s[1] + f[1]) / 2], entry = { ti, slot, s, f, mid, matched: false };
    entries.push(entry);
    const ck = cellKey(Math.floor(mid[0] / cell), Math.floor(mid[1] / cell));
    if (!grid.has(ck)) grid.set(ck, []);
    grid.get(ck).push(entry);
  }));

  // glue relations between slots, and slots that have an interior edge with no neighbour
  const mirrored = ir.tiles.map((t) => det(t.transform) < 0), relations = new Map(), unmatched = new Set();
  for (const a of entries) {
    const ci = Math.floor(a.mid[0] / cell), cj = Math.floor(a.mid[1] / cell);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      for (const o of grid.get(cellKey(ci + di, cj + dj)) ?? []) {
        if (o.ti === a.ti) continue;
        // two tiles of the same handedness walk their shared edge in opposite world directions, a mirrored one and a
        // proper one in the same direction
        const flipped = mirrored[a.ti] !== mirrored[o.ti];
        if (flipped ? dist(a.s, o.s) > eps || dist(a.f, o.f) > eps : dist(a.s, o.f) > eps || dist(a.f, o.s) > eps) continue;
        a.matched = true;
        const T = multiply(invert(ir.tiles[o.ti].transform), ir.tiles[a.ti].transform);
        if (!relations.has(a.slot)) relations.set(a.slot, []);
        relations.get(a.slot).push({ to: o.slot, T, reverses: !flipped });
      }
    }
  }
  for (const a of entries) if (!a.matched && interior(a.mid)) unmatched.add(a.slot);

  const slots = [...new Set(entries.map((e) => e.slot))].sort((x, y) => orderOf.get(x) - orderOf.get(y));
  const seen = new Set(), classes = [];
  for (const root of slots) {
    if (seen.has(root)) continue;
    const info = new Map([[root, { X: [1, 0, 0, 1, 0, 0], rev: false }]]), queue = [root], problems = [];
    let symmetric = false;
    seen.add(root);
    const [A, B] = ends.get(root);
    for (let qi = 0; qi < queue.length; qi++) {
      const a = queue[qi], ia = info.get(a);
      if (unmatched.has(a)) problems.push('an edge of this class meets no matching neighbour (the tiling is not edge-to-edge)');
      for (const { to, T, reverses } of relations.get(a) ?? []) {
        const X2 = multiply(T, ia.X), rev2 = ia.rev !== reverses, known = info.get(to);
        if (!known) { info.set(to, { X: X2, rev: rev2 }); seen.add(to); queue.push(to); continue; }
        const S = multiply(invert(known.X), X2), swaps = dist(apply(S, A), B) <= eps && dist(apply(S, B), A) <= eps;
        if (known.rev === rev2) {
          if (!sameMap(S, [1, 0, 0, 1, 0, 0], eps)) problems.push('the neighbours around this edge disagree about its shape');
        } else if (swaps && det(S) > 0) symmetric = true;
        else if (swaps) problems.push('this edge would have to be mirror-symmetric about its middle (not supported yet)');
        else problems.push('this edge would have to match itself under a map that is not a half-turn about its middle');
      }
    }
    const [proto, edge] = root.split('/');
    const members = [...info].sort((x, y) => orderOf.get(x[0]) - orderOf.get(y[0]))
      .map(([k, { X, rev }]) => { const [p, e] = k.split('/'); return { proto: p, edge: e, transform: X, reversed: rev }; });
    classes.push({ rep: { proto, edge }, kind: problems.length ? 'locked' : symmetric ? 'symmetric' : 'free', ...(problems.length && { reason: problems[0] }), members });
  }
  return classes;
}
