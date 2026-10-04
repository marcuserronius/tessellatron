/**
 * Edge shapes and their application to a TilingIR (pure, no DOM; depends on core and editor/classes.js).
 *
 * A shape is user data kept apart from generator output:
 *   { generator: 'square', mode?: 'pair', edges: { sq: { e0: [[t, n], ...], e1: [...] } } }
 *  - generator: id of the generator the shape was made for; applyShape ignores it for any other IR.
 *  - mode: the tiling mode (editor/modes.js: how many tile shapes, which are turned); left out for the default,
 *    'single'. It decides which tile each lattice position gets, so the same edges mean different tilings in
 *    different modes.
 *  - the first key of `edges` is a SHAPE id: 'sq' for tile A, 'sq_b' for tile B. Each shape has its own curves, and an
 *    edge shared with a neighbouring tile is edited once (it is one curve with several members: editor/classes.js),
 *    so changing one tile changes its neighbours.
 *  - edges[protoId][edgeId]: points of that edge in its normalized frame (edgeFrame): t runs 0..1 from the edge's
 *    start to its end, n is the OUTWARD offset; both in units of the straight edge's length, so a shape survives
 *    changes of tile size. No points = a straight edge.
 *  - Only the representative edge of each edge class (editor/classes.js) is edited; the other members are derived
 *    from it, never stored, so tiles always fit. In a `free` class the points are all the interior points of the
 *    curve. In a `symmetric` class the curve is point-symmetric about the edge's middle, so only the FIRST HALF is
 *    stored: the curve is  start, p1..pk, middle (0.5, 0), mirror(pk)..mirror(p1), end  with mirror = (1-t, -n).
 *
 * applyShape(ir, shape, classes?)   -> TilingIR  the IR re-tiled for shape.mode (editor/modes.js: tile shapes and turns)
 *                               with new edge paths (polylines); the renderer needs no change. Every function here accepts
 *                               a raw or an already re-tiled IR. `classes` must belong to the re-tiled IR (editorModel). Idempotent; returns `ir` itself when nothing applies.
 *                               `classes` defaults to edgeClasses(ir); callers that have a cached set pass it.
 * shapeProblems(ir, shape, classes?) -> string[]  everything wrong with a shape: shapeNotes (edits that have no effect:
 *                               unknown prototile or edge, locked class, derived edge) then crossingProblems (a shaped
 *                               outline that crosses itself, i.e. not a valid tile). [] means fine. The UI refuses a move
 *                               only on crossingProblems, so stale edits elsewhere never block editing.
 * canEdit(generator, params)   -> { ok, reasons }  coarse gate: generator allow-list, no row shift, no twist.
 * editableParams(generator, params) -> param patch that makes canEdit pass ({} if it already does; null if the
 *                               generator is not editable).
 * sanitizeShape(raw)           -> { shape|null, warnings }  clamps and drops untrusted input (project files).
 * expandPoints(points, kind)   the full interior point list of a curve (adds the middle and the mirror half).
 * edgeFrame / toLocal / fromLocal / mirrorPoint  convert between [t,n] and prototile coordinates.
 * outlinePoints(proto)         -> [[x,y], ...]  the closed outline's vertices, without repeating the first.
 */
import { reversePath, transformPath, pathPoints, pathEnds, polylinePath } from '../core/path.js';
import { selfIntersects } from '../core/polygon.js';
import { edgeClasses, slotKey } from './classes.js';
import { DEFAULT_MODE, retile } from './modes.js';

/** Generators whose edge classes the editor handles (the machinery itself is generic). */
export const EDITABLE = ['square'];
export const LIMITS = { t: [-2, 3], n: [-2, 2], points: 64 };

export function canEdit(generator, params = {}) {
  const reasons = [];
  if (!EDITABLE.includes(generator)) reasons.push(`Edge editing is not available for the ${generator} generator yet`);
  else {
    if (params.rowShift) reasons.push('Row shift must be 0 (shifted rows break the edge matching)');
    if ((params.twistMode ?? 'none') !== 'none' && params.twistStep) reasons.push('Twist must be None');
  }
  return { ok: !reasons.length, reasons };
}

/** The param changes canEdit() asks for, as a patch. */
export function editableParams(generator, params = {}) {
  if (!EDITABLE.includes(generator)) return null;
  const fix = {};
  if (params.rowShift) fix.rowShift = 0;
  if ((params.twistMode ?? 'none') !== 'none' && params.twistStep) fix.twistMode = 'none';
  return fix;
}

/** Frame of a (straight) edge path: start A, end B, length L, unit direction d, outward unit normal. */
export function edgeFrame(path) {
  const [A, B] = pathEnds(path);
  const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
  return { A, B, L, d: [dx / L, dy / L], normal: [dy / L, -dx / L] }; // clockwise on screen (y down): outward = (dy, -dx)
}
export const toLocal = ({ A, B, L, normal }, [t, n]) => [A[0] + t * (B[0] - A[0]) + n * L * normal[0], A[1] + t * (B[1] - A[1]) + n * L * normal[1]];
export const fromLocal = ({ A, L, d, normal }, [x, y]) => {
  const vx = x - A[0], vy = y - A[1];
  return [(vx * d[0] + vy * d[1]) / L, (vx * normal[0] + vy * normal[1]) / L];
};
export const mirrorPoint = ([t, n]) => [1 - t, -n];
export const expandPoints = (pts, kind) => (kind === 'symmetric' ? [...pts, [0.5, 0], ...pts.map(mirrorPoint).reverse()] : pts);

export const outlinePoints = (proto) => proto.edges.flatMap((e) => pathPoints(e.path).slice(0, -1));

const own = (o, k) => Object.hasOwn(o, k);
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
const ID = /^[A-Za-z][\w-]*$/;

export function sanitizeShape(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.generator !== 'string') return { shape: null, warnings: ['not a shape object'] };
  const warnings = [], edges = {};
  for (const [pid, per] of Object.entries(raw.edges ?? {})) {
    if (!ID.test(pid) || !per || typeof per !== 'object') { warnings.push(`${pid}: ignored`); continue; }
    for (const [eid, pts] of Object.entries(per)) {
      if (!ID.test(eid) || !Array.isArray(pts)) { warnings.push(`${pid}.${eid}: ignored`); continue; }
      const clean = [];
      for (const p of pts) {
        if (Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) clean.push([clamp(p[0], LIMITS.t), clamp(p[1], LIMITS.n)]);
        else warnings.push(`${pid}.${eid}: dropped an invalid point`);
      }
      if (clean.length > LIMITS.points) { warnings.push(`${pid}.${eid}: truncated to ${LIMITS.points} points`); clean.length = LIMITS.points; }
      if (clean.length) (own(edges, pid) ? edges[pid] : (edges[pid] = {}))[eid] = clean;
    }
  }
  const mode = typeof raw.mode === 'string' && ID.test(raw.mode) && raw.mode !== DEFAULT_MODE ? raw.mode : null;
  if (raw.mode !== undefined && raw.mode !== null && !mode && raw.mode !== DEFAULT_MODE) warnings.push('mode: ignored');
  return { shape: { generator: raw.generator, ...(mode && { mode }), edges }, warnings };
}

const editsOf = (shape, { proto, edge }) => (own(shape.edges ?? {}, proto) && own(shape.edges[proto], edge) ? shape.edges[proto][edge] : []);
const edgeOf = (ir, { proto, edge }) => ir.prototiles[proto].edges.find((e) => e.id === edge);

export function applyShape(rawIR, shape, classes) {
  if (!shape || shape.generator !== rawIR.meta.generator) return rawIR;
  const ir = retile(rawIR, shape.mode ?? DEFAULT_MODE), paths = new Map();
  for (const c of classes ?? edgeClasses(ir)) {
    const pts = c.kind === 'locked' || !own(ir.prototiles, c.rep.proto) ? [] : editsOf(shape, c.rep);
    if (!pts.length) continue;
    const frame = edgeFrame(edgeOf(ir, c.rep).path);
    const curve = polylinePath([frame.A, ...expandPoints(pts, c.kind).map((p) => toLocal(frame, p)), frame.B]);
    for (const m of c.members) {
      const mapped = pathPoints(transformPath(curve, m.transform));
      if (m.reversed) mapped.reverse();
      [mapped[0], mapped[mapped.length - 1]] = pathEnds(edgeOf(ir, m).path); // pin to the exact corners
      paths.set(slotKey(m), polylinePath(mapped));
    }
  }
  if (!paths.size) return rawIR;
  const prototiles = {};
  for (const [pid, proto] of Object.entries(ir.prototiles)) {
    prototiles[pid] = proto.edges.some((e) => paths.has(`${pid}/${e.id}`))
      ? { ...proto, edges: proto.edges.map((e) => (paths.has(`${pid}/${e.id}`) ? { ...e, path: paths.get(`${pid}/${e.id}`) } : e)) } : proto;
  }
  return { ...ir, prototiles };
}

/** Messages about edits that have no effect: unknown prototile or edge, locked class, derived (non-representative) edge. */
export function shapeNotes(rawIR, shape, classes) {
  const out = [];
  if (!shape || shape.generator !== rawIR.meta.generator) return out;
  const ir = retile(rawIR, shape.mode ?? DEFAULT_MODE);
  classes ??= edgeClasses(ir);
  for (const [pid, edits] of Object.entries(shape.edges ?? {})) {
    if (!own(ir.prototiles, pid)) { out.push(`${pid}: no such tile`); continue; }
    for (const [eid, pts] of Object.entries(edits)) {
      if (!pts?.length) continue;
      const c = classes.find((k) => k.members.some((m) => m.proto === pid && m.edge === eid));
      if (!c) out.push(`${pid}.${eid}: not an editable edge`);
      else if (c.kind === 'locked') out.push(`${pid}.${eid}: locked, ${c.reason}`);
      else if (c.rep.proto !== pid || c.rep.edge !== eid) {
        const rep = c.rep.proto === pid ? c.rep.edge : `${c.rep.proto}.${c.rep.edge}`;
        out.push(`${pid}.${eid}: derived from ${rep}; edit ${rep} instead`);
      }
    }
  }
  return out;
}

/** Tile classes whose shaped outline crosses itself: the shape is not a valid tile. */
export function crossingProblems(ir, shape, classes) {
  if (!shape || shape.generator !== ir.meta.generator) return [];
  const shaped = applyShape(ir, shape, classes); // every tile class is checked: an edit also changes its neighbours' outlines
  return Object.entries(shaped.prototiles)
    .filter(([, proto]) => selfIntersects(outlinePoints(proto)))
    .map(([pid]) => `${pid}: the outline crosses itself`);
}

export const shapeProblems = (ir, shape, classes) => [...shapeNotes(ir, shape, classes), ...crossingProblems(ir, shape, classes)];
