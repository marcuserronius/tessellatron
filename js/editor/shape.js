/**
 * Edge shapes and their application to a TilingIR (pure, no DOM; depends on core and editor/classes.js).
 *
 * A shape is user data kept apart from generator output:
 *   { generator: 'square', mode?: 'pair', edges: { sq: { e0: <edge>, e1: <edge> } } }
 *  - generator: id of the generator the shape was made for; applyShape ignores it for any other IR.
 *  - mode: the tiling mode (editor/modes.js: how many tile shapes, which are turned); left out for the default,
 *    'single'. It decides which tile each lattice position gets, so the same edges mean different tilings in
 *    different modes.
 *  - the first key of `edges` is a SHAPE id: 'sq' for tile A, 'sq_b' for tile B. Each shape has its own curves, and an
 *    edge shared with a neighbouring tile is edited once (it is one curve with several members: editor/classes.js),
 *    so changing one tile changes its neighbours.
 *  - an <edge> is a PATH in the edge's normalized frame (edgeFrame): t runs 0..1 from the edge's start to its end, n
 *    is the OUTWARD offset; both in units of the straight edge's length, so a shape survives changes of tile size.
 *    Its commands are those of core/path.js (editor allow-list SHAPE_COMMANDS: L and C). The path starts with
 *    ['M',0,0]; a `free` class stores the whole curve, ending at (1,0), a `symmetric` class (the curve is point-
 *    symmetric about the edge's middle) stores only the first half, ending at the middle (0.5,0), and the curve is
 *    completed by the half turned about the middle and walked backwards, so it is smooth through the middle whenever
 *    the half is. No entry, or a path that is just the straight line, is a straight edge. Only the representative
 *    edge of each edge class (editor/classes.js) is edited; the other members are derived from it, never stored, so
 *    tiles always fit.
 *  - Older files (project version 2) and hand-written shapes may give an edge as a LIST of its interior points
 *    [[t, n], ...] instead; that is the polyline through them. Every function here reads both forms (edgePath), and
 *    every edit writes the path form. A path whose end does not match its class (after a change of tiling mode) is
 *    re-read as a polyline through its anchors.
 *
 * applyShape(ir, shape, classes?)   -> TilingIR  the IR re-tiled for shape.mode (editor/modes.js: tile shapes and turns)
 *                               with new edge paths (curves stay curves: C segments are mapped, reversed and
 *                               pinned like any other); the renderer needs no change. Every function here accepts
 *                               a raw or an already re-tiled IR. `classes` must belong to the re-tiled IR (editorModel). Idempotent; returns `ir` itself when nothing applies.
 *                               `classes` defaults to edgeClasses(ir); callers that have a cached set pass it.
 * shapeProblems(ir, shape, classes?) -> string[]  everything wrong with a shape: shapeNotes (edits that have no effect:
 *                               unknown prototile or edge, locked class, derived edge) then crossingProblems (a shaped
 *                               outline that crosses itself, i.e. not a valid tile). [] means fine. The UI refuses a move
 *                               only on crossingProblems, so stale edits elsewhere never block editing. Crossings are
 *                               checked on the anchors only, so an outline with any curved segment is NOT checked yet
 *                               (TODO.md: flatten the curves first); the user keeps curves from crossing for now.
 * canEdit(generator, params)   -> { ok, reasons }  coarse gate: generator allow-list, no row shift, no twist.
 * editableParams(generator, params) -> param patch that makes canEdit pass ({} if it already does; null if the
 *                               generator is not editable).
 * sanitizeShape(raw)           -> { shape|null, warnings }  clamps and drops untrusted input (project files): point
 *                               lists are clamped, paths are checked segment by segment (known command, right number
 *                               of numbers, coordinates clamped, starts at (0,0), ends at (1,0) or the middle).
 * edgePath(value, kind?)       -> Path   an edge value in path form for the class kind ('free' | 'symmetric')
 * edgeFromPoints(points, kind?) -> Path  the polyline through interior points, in path form
 * straightEdge(kind?) / hasEdits(value) / isPointList(value) / interiorPoints(value, kind?)  small readers
 * expandEdge(path, kind)       -> Path   the whole curve (0,0)..(1,0): a symmetric half completed
 * frameMatrix(frame)           -> Affine  normalized (t,n) -> prototile coordinates. NOTE its determinant is
 *                               negative (the outward normal makes it a reflection); fine for L and C, but a command
 *                               such as an arc must answer a negative determinant by flipping its sweep
 * edgeFrame / toLocal / fromLocal / mirrorPoint  convert between [t,n] and prototile coordinates.
 * outlinePoints(proto)         -> [[x,y], ...]  the closed outline's vertices (anchors), without repeating the first.
 * outlinePath(proto)           -> Path   the closed outline as a path (curves kept), ending in Z
 */
import { COMMANDS, reversePath, transformPath, pathPoints, pathEnds, polylinePath } from '../core/path.js';
import { selfIntersects } from '../core/polygon.js';
import { edgeClasses, slotKey } from './classes.js';
import { DEFAULT_MODE, retile } from './modes.js';

/** Generators whose edge classes the editor handles (the machinery itself is generic). */
export const EDITABLE = ['square'];
export const LIMITS = { t: [-2, 3], n: [-2, 2], points: 64 };
/** Segment commands an edited edge may use (after its leading M); each must exist in core/path.js COMMANDS. */
export const SHAPE_COMMANDS = ['L', 'C'];

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

/** Normalized frame -> prototile coordinates, as an affine (x = A + t (B - A) + n (dy, -dx)); det < 0, a reflection. */
export const frameMatrix = ({ A, B }) => [B[0] - A[0], B[1] - A[1], B[1] - A[1], A[0] - B[0], A[0], A[1]];

const ROT180 = [-1, 0, 0, -1, 1, 0]; // the half turn about the edge's middle: (t, n) -> (1 - t, -n)
const endT = (kind) => (kind === 'symmetric' ? 0.5 : 1);
const near = (a, b) => Math.abs(a - b) <= 1e-9;

export const straightEdge = (kind = 'free') => [['M', 0, 0], ['L', endT(kind), 0]];
export const edgeFromPoints = (points, kind = 'free') => polylinePath([[0, 0], ...points, [endT(kind), 0]]);
export const isPointList = (v) => Array.isArray(v) && (!v.length || (Array.isArray(v[0]) && typeof v[0][0] === 'number'));
/** Does this edge value change the straight edge? (No entry, [], and the plain line all mean no.) */
export const hasEdits = (v) => Array.isArray(v) && (isPointList(v) ? v.length > 0 : !(v.length === 2 && v[1][0] === 'L' && v[1][2] === 0));

export function edgePath(value, kind = 'free') {
  if (!hasEdits(value)) return straightEdge(kind);
  if (isPointList(value)) return edgeFromPoints(value, kind);
  const [, B] = pathEnds(value);
  return near(B[0], endT(kind)) && near(B[1], 0) ? value : edgeFromPoints(pathPoints(value).slice(1, -1), kind);
}
export const interiorPoints = (value, kind = 'free') => pathPoints(edgePath(value, kind)).slice(1, -1);
export const expandEdge = (path, kind) => (kind === 'symmetric' ? [...path, ...reversePath(transformPath(path, ROT180)).slice(1)] : path);

export const outlinePoints = (proto) => proto.edges.flatMap((e) => pathPoints(e.path).slice(0, -1));
export function outlinePath(proto) {
  const path = proto.edges.flatMap((e, i) => (i ? e.path.slice(1) : e.path)), last = path.at(-1), [x, y] = path[0].slice(1);
  const closes = last[0] === 'L' && near(last[1], x) && near(last[2], y); // an L back to the start is what Z does
  return [...(closes ? path.slice(0, -1) : path), ['Z']];
}
const hasCurves = (proto) => proto.edges.some((e) => e.path.some(([c]) => c !== 'M' && c !== 'L'));

const own = (o, k) => Object.hasOwn(o, k);
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
const ID = /^[A-Za-z][\w-]*$/;

const clampArgs = (args) => args.map((v, i) => clamp(v, i % 2 ? LIMITS.n : LIMITS.t));

function cleanPoints(pts, label, warnings) {
  const clean = [];
  for (const p of pts) {
    if (Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) clean.push([clamp(p[0], LIMITS.t), clamp(p[1], LIMITS.n)]);
    else warnings.push(`${label}: dropped an invalid point`);
  }
  if (clean.length > LIMITS.points) { warnings.push(`${label}: truncated to ${LIMITS.points} points`); clean.length = LIMITS.points; }
  return clean;
}

/** A path edge: only known segment commands with the right number of numbers; null (with a warning) if it cannot be kept. */
function cleanPath(path, label, warnings) {
  const reject = (why) => { warnings.push(`${label}: ${why}`); return null; };
  if (!path.every(Array.isArray) || path[0]?.[0] !== 'M' || path.length < 2) return reject('not a path, ignored');
  if (path.length > LIMITS.points + 2) return reject(`more than ${LIMITS.points} points, ignored`);
  const out = [['M', 0, 0]];
  if (path[0].length !== 3 || Math.hypot(path[0][1], path[0][2]) > 1e-6) warnings.push(`${label}: start moved to the corner`);
  for (const seg of path.slice(1)) {
    const c = seg[0];
    if (!SHAPE_COMMANDS.includes(c) || !Object.hasOwn(COMMANDS, c)) return reject('uses a command the editor does not support, ignored');
    if (seg.length - 1 !== COMMANDS[c].arity || !seg.slice(1).every(Number.isFinite)) return reject('invalid segment, ignored');
    out.push([c, ...clampArgs(seg.slice(1))]);
  }
  const last = out.at(-1), end = last.slice(-2), target = [1, 0.5].find((t) => Math.abs(end[0] - t) <= 1e-6 && Math.abs(end[1]) <= 1e-6);
  if (target === undefined) return reject('does not end at the far corner or the middle, ignored');
  last.splice(-2, 2, target, 0);
  return out;
}

export function sanitizeShape(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.generator !== 'string') return { shape: null, warnings: ['not a shape object'] };
  const warnings = [], edges = {};
  for (const [pid, per] of Object.entries(raw.edges ?? {})) {
    if (!ID.test(pid) || !per || typeof per !== 'object') { warnings.push(`${pid}: ignored`); continue; }
    for (const [eid, value] of Object.entries(per)) {
      if (!ID.test(eid) || !Array.isArray(value)) { warnings.push(`${pid}.${eid}: ignored`); continue; }
      const clean = isPointList(value) ? cleanPoints(value, `${pid}.${eid}`, warnings) : cleanPath(value, `${pid}.${eid}`, warnings);
      if (clean && hasEdits(clean)) (own(edges, pid) ? edges[pid] : (edges[pid] = {}))[eid] = clean;
    }
  }
  const mode = typeof raw.mode === 'string' && ID.test(raw.mode) && raw.mode !== DEFAULT_MODE ? raw.mode : null;
  if (raw.mode !== undefined && raw.mode !== null && !mode && raw.mode !== DEFAULT_MODE) warnings.push('mode: ignored');
  return { shape: { generator: raw.generator, ...(mode && { mode }), edges }, warnings };
}

const editsOf = (shape, { proto, edge }) => (own(shape.edges ?? {}, proto) && own(shape.edges[proto], edge) ? shape.edges[proto][edge] : []);
const edgeOf = (ir, { proto, edge }) => ir.prototiles[proto].edges.find((e) => e.id === edge);

/** Put the exact corners back on a mapped curve: its first M and the end point of its last segment. */
const pinEnds = (path, A, B) => path.map((seg, i) => (i === 0 ? ['M', ...A] : i === path.length - 1 ? [...seg.slice(0, -2), ...B] : seg));

export function applyShape(rawIR, shape, classes) {
  if (!shape || shape.generator !== rawIR.meta.generator) return rawIR;
  const ir = retile(rawIR, shape.mode ?? DEFAULT_MODE), paths = new Map();
  for (const c of classes ?? edgeClasses(ir)) {
    const value = c.kind === 'locked' || !own(ir.prototiles, c.rep.proto) ? [] : editsOf(shape, c.rep);
    if (!hasEdits(value)) continue;
    const curve = transformPath(expandEdge(edgePath(value, c.kind), c.kind), frameMatrix(edgeFrame(edgeOf(ir, c.rep).path)));
    for (const m of c.members) {
      const mapped = transformPath(curve, m.transform), [A, B] = pathEnds(edgeOf(ir, m).path);
      paths.set(slotKey(m), pinEnds(m.reversed ? reversePath(mapped) : mapped, A, B));
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
      if (!hasEdits(pts)) continue;
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
    .filter(([, proto]) => !hasCurves(proto) && selfIntersects(outlinePoints(proto))) // TODO: curves are not checked yet (TODO.md)
    .map(([pid]) => `${pid}: the outline crosses itself`);
}

export const shapeProblems = (ir, shape, classes) => [...shapeNotes(ir, shape, classes), ...crossingProblems(ir, shape, classes)];
