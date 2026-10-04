/**
 * Static edge pairing of a prototile (pure, no DOM; depends on core only): the generators' `pair` metadata in the
 * tiles' CANONICAL orientation. The shape editor itself uses editor/classes.js, which reads adjacency from actual
 * tiles and therefore also handles turned tiles; tests check that the two agree for the default orientation.
 *
 * Reads the `pair` metadata on a prototile's edges (ir/schema.js): edge e carries { edge: partnerId, transform T }
 * where T maps e, as a point set, onto its partner. Edges are traversed clockwise round their own tile, so the
 * mapped points run BACKWARDS along the partner: T(start(e)) = end(partner), T(end(e)) = start(partner).
 *
 * edgeEnds(edge)                -> [[x,y] start, [x,y] end]
 * pairingProblems(proto, eps)   -> string[]  consistency check; [] when the pairing is usable:
 *      partner exists and points back, the two transforms are inverses, T preserves orientation
 *      (mirror/glide pairings are not supported), and T maps the edge's ends onto the partner's, reversed.
 * pairClasses(proto)            -> [{ rep, partner, transform, self }]  one entry per class of paired edges,
 *      in edge order. `rep` is the lower-indexed edge (the one that is edited); `partner` is derived from it:
 *      partner.path = reversePath(transformPath(rep.path, transform)). A self-paired edge (e.g. the triangle's
 *      half-turn pairing) has partner === rep and self: true; it would need a symmetric shape, which is not
 *      handled yet. Edges without `pair` belong to no class (they are shared with other prototiles, so
 *      editing them alone would break the fit). Throws if pairingProblems() is not empty.
 */
import { apply, multiply } from '../core/affine.js';
import { pathEnds } from '../core/path.js';

export const edgeEnds = (edge) => pathEnds(edge.path);

const near = (p, q, eps) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= eps;
const isIdentity = (m, eps) => [1, 0, 0, 1, 0, 0].every((v, i) => Math.abs(m[i] - v) <= eps);

export function pairingProblems(proto, eps = 1e-9) {
  const out = [], byId = new Map(proto.edges.map((e) => [e.id, e]));
  for (const e of proto.edges) {
    if (!e.pair) continue;
    const q = byId.get(e.pair.edge), T = e.pair.transform;
    if (!q) { out.push(`${e.id}: partner ${e.pair.edge} does not exist`); continue; }
    if (!q.pair || q.pair.edge !== e.id) out.push(`${e.id}: ${q.id} does not pair back`);
    else if (!isIdentity(multiply(q.pair.transform, T), eps)) out.push(`${e.id}: its transform and ${q.id}'s are not inverses`);
    if (T[0] * T[3] - T[1] * T[2] <= 0) out.push(`${e.id}: transform must preserve orientation`);
    const [s, f] = edgeEnds(e), [qs, qf] = edgeEnds(q);
    if (!near(apply(T, s), qf, eps) || !near(apply(T, f), qs, eps)) out.push(`${e.id}: transform does not map the edge onto ${q.id}, reversed`);
  }
  return out;
}

export function pairClasses(proto) {
  const bad = pairingProblems(proto);
  if (bad.length) throw new Error(`invalid edge pairing: ${bad.join('; ')}`);
  const order = new Map(proto.edges.map((e, i) => [e.id, i]));
  return proto.edges
    .filter((e) => e.pair && order.get(e.pair.edge) >= order.get(e.id))
    .map((e) => ({ rep: e.id, partner: e.pair.edge, transform: e.pair.transform, self: e.pair.edge === e.id }));
}
