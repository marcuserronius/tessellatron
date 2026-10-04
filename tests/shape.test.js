import test from 'node:test';
import assert from 'node:assert/strict';
import * as square from '../js/generators/periodic/square.js';
import * as hexagon from '../js/generators/periodic/hexagon.js';
import { defaults } from '../js/params/schema.js';
import { apply } from '../js/core/affine.js';
import { pathPoints } from '../js/core/path.js';
import { signedArea } from '../js/core/polygon.js';
import { renderSVG } from '../js/render/svg.js';
import { styleParams } from '../js/style/colorings.js';
import { edgeClasses } from '../js/editor/classes.js';
import { retile } from '../js/editor/modes.js';
import * as triangle from '../js/generators/periodic/triangle.js';
import { transformPath, flattenPath } from '../js/core/path.js';
import {
  applyShape, shapeProblems, crossingProblems, canEdit, sanitizeShape, edgeFrame, toLocal, fromLocal, outlinePoints, LIMITS,
  edgeFromPoints, expandEdge, frameMatrix, hasEdits, outlinePath,
} from '../js/editor/shape.js';

const base = { ...defaults(square.params), size: 100 };
const gen = (p = {}, region = [0, 0, 500, 400]) => square.generate({ ...base, ...p }, region);
const shape = (e0, e1) => ({ generator: 'square', edges: { sq: { ...(e0 && { e0 }), ...(e1 && { e1 }) } } });
const BUMP = [[0.5, 0.2]];
const WIGGLE = [[0.2, 0.15], [0.45, -0.1], [0.7, 0.2]];
const SIDE = [[0.3, -0.2], [0.5, 0.1], [0.8, 0.25]];
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const same = (P, Q) => P.length === Q.length && P.every((p, i) => close(p[0], Q[i][0]) && close(p[1], Q[i][1]));

test('frame: e0 of the square runs left to right and its outward normal points up the screen', () => {
  const f = edgeFrame(gen().prototiles.sq.edges[0].path);
  assert.deepEqual(f.A, [-50, -50]); assert.deepEqual(f.B, [50, -50]); assert.equal(f.L, 100);
  assert.deepEqual(toLocal(f, [0.5, 0.25]), [0, -75]);
  assert.deepEqual(toLocal(f, [0, 0]), f.A);
  const e1 = edgeFrame(gen().prototiles.sq.edges[1].path);
  assert.deepEqual(toLocal(e1, [0.5, 0.25]), [75, 0]); // right edge bulges right
});

test('fromLocal inverts toLocal', () => {
  const f = edgeFrame(gen().prototiles.sq.edges[1].path);
  for (const p of [[0.3, 0.2], [-0.4, 1.1], [1.7, -0.6]]) {
    const q = fromLocal(f, toLocal(f, p));
    assert.ok(close(q[0], p[0]) && close(q[1], p[1]));
  }
});

test('a bump on the top edge becomes a matching dent on the bottom edge', () => {
  const sq = applyShape(gen(), shape(BUMP)).prototiles.sq;
  assert.deepEqual(pathPoints(sq.edges[0].path), [[-50, -50], [0, -70], [50, -50]]);
  assert.deepEqual(pathPoints(sq.edges[2].path), [[50, 50], [0, 30], [-50, 50]]);
  assert.deepEqual(sq.edges.map((e) => e.pair), gen().prototiles.sq.edges.map((e) => e.pair)); // pairing metadata untouched
});

test('the shaped outline stays closed, clockwise, and keeps the tile area', () => {
  const sq = applyShape(gen(), shape(WIGGLE, SIDE)).prototiles.sq;
  sq.edges.forEach((e, n) => assert.deepEqual(pathPoints(e.path).at(-1), pathPoints(sq.edges[(n + 1) % 4].path)[0]));
  assert.ok(close(signedArea(outlinePoints(sq)), 100 * 100, 1e-6));
  assert.equal(outlinePoints(sq).length, 4 + 2 * (WIGGLE.length + SIDE.length));
});

test('tiles fit: neighbouring edges coincide in world space, also with rotation and offset', () => {
  for (const extra of [{}, { rotation: 17, originX: 13, originY: -7 }]) {
    const ir = applyShape(gen(extra), shape(WIGGLE, SIDE));
    const at = (i, j) => ir.tiles.find((t) => t.tags.i === i && t.tags.j === j);
    const edge = (t, n) => pathPoints(ir.prototiles.sq.edges[n].path).map((p) => apply(t.transform, p));
    let checked = 0;
    for (const t of ir.tiles) {
      const below = at(t.tags.i, t.tags.j + 1), right = at(t.tags.i + 1, t.tags.j);
      if (below) { assert.ok(same(edge(t, 2), edge(below, 0).reverse())); checked++; }
      if (right) { assert.ok(same(edge(t, 1), edge(right, 3).reverse())); checked++; }
    }
    assert.ok(checked > 20);
  }
});

test('a shape made at one tile size scales with the tile', () => {
  const small = applyShape(gen({ size: 40 }), shape(WIGGLE, SIDE)).prototiles.sq;
  const big = applyShape(gen({ size: 100 }), shape(WIGGLE, SIDE)).prototiles.sq;
  small.edges.forEach((e, n) => pathPoints(e.path).forEach(([x, y], k) => {
    const [bx, by] = pathPoints(big.edges[n].path)[k];
    assert.ok(close(bx, x * 2.5, 1e-9) && close(by, y * 2.5, 1e-9));
  }));
});

test('identity cases: empty shape, other generator, applying twice', () => {
  const ir = gen();
  assert.equal(applyShape(ir, shape()), ir);
  assert.equal(applyShape(ir, null), ir);
  assert.equal(applyShape(ir, { generator: 'hexagon', edges: { sq: { e0: BUMP } } }), ir);
  assert.equal(applyShape(ir, { generator: 'square', edges: { nope: { e0: BUMP } } }), ir);
  const once = applyShape(ir, shape(WIGGLE, SIDE));
  assert.deepEqual(applyShape(once, shape(WIGGLE, SIDE)), once);
  assert.deepEqual(ir, gen()); // input not mutated
  const st = defaults(styleParams), view = { width: 500, height: 400 };
  assert.equal(renderSVG(applyShape(ir, shape()), st, view), renderSVG(ir, st, view));
});

test('rendering the shaped IR yields the extra vertices, flattened or as <use>', () => {
  const st = defaults(styleParams), view = { width: 500, height: 400 }, ir = applyShape(gen(), shape(WIGGLE, SIDE));
  const vertices = 4 + 2 * (WIGGLE.length + SIDE.length);
  const d = renderSVG(ir, st, view).match(/<path id="p-sq" d="([^"]+)"/)[1];
  assert.equal((d.match(/L/g) ?? []).length, vertices); // one L per segment; the last returns to the start corner, then Z
  assert.ok(d.startsWith('M-50 -50') && d.endsWith('Z'));
  assert.ok(renderSVG(ir, st, view, { flatten: true }).includes('<path d="M'));
});

test('shapeProblems: clean shape, derived edge, self-crossing outline, unknown prototile', () => {
  const ir = gen();
  assert.deepEqual(shapeProblems(ir, shape(WIGGLE, SIDE)), []);
  assert.deepEqual(shapeProblems(ir, null), []);
  assert.ok(shapeProblems(ir, { generator: 'square', edges: { sq: { e2: BUMP } } })[0].match(/derived from e0/));
  assert.ok(shapeProblems(ir, { generator: 'square', edges: { sq: { e9: BUMP } } })[0].match(/not an editable edge/));
  assert.ok(shapeProblems(ir, { generator: 'square', edges: { zz: { e0: BUMP } } })[0].match(/no such tile/));
  const loop = [[0.7, 0.2], [0.3, 0.2], [0.5, -0.3]];
  assert.deepEqual(shapeProblems(ir, shape(loop)), ['sq: the outline crosses itself']);
});

test('hexagon prototile: edits are derived, self-pair classes are reported rather than applied', () => {
  const hex = hexagon.generate(defaults(hexagon.params), [0, 0, 200, 200]);
  const s = { generator: 'hexagon', edges: { hex: { e0: BUMP } } };
  const shaped = applyShape(hex, s);
  assert.equal(pathPoints(shaped.prototiles.hex.edges[0].path).length, 3);
  assert.equal(pathPoints(shaped.prototiles.hex.edges[3].path).length, 3);
  assert.ok(close(signedArea(outlinePoints(shaped.prototiles.hex)), signedArea(outlinePoints(hex.prototiles.hex)), 1e-6));
});

test('canEdit gates on generator and on settings that stop tiles meeting edge to edge', () => {
  assert.deepEqual(canEdit('square', base), { ok: true, reasons: [] });
  assert.equal(canEdit('hexagon', {}).ok, false);
  assert.equal(canEdit('square', { ...base, rowShift: 0.5 }).ok, false);
  assert.equal(canEdit('square', { ...base, orientMode: 'checker' }).ok, true); // turned tiles are handled through edge classes
  assert.equal(canEdit('square', { ...base, twistMode: 'rows', twistStep: 5 }).ok, false);
  assert.equal(canEdit('square', { ...base, twistMode: 'rows', twistStep: 0 }).ok, true);
  assert.equal(canEdit('square', { ...base, rotation: 30, originX: 5 }).ok, true);
  assert.equal(canEdit('square', { ...base, rowShift: 0.5, twistMode: 'rows', twistStep: 3 }).reasons.length, 2);
});

test('sanitizeShape clamps, drops junk, caps points, and refuses odd keys', () => {
  assert.equal(sanitizeShape(null).shape, null);
  assert.equal(sanitizeShape({ edges: {} }).shape, null);
  const many = Array.from({ length: LIMITS.points + 5 }, (_, i) => [i / 100, 0.1]);
  const raw = JSON.parse(JSON.stringify({
    generator: 'square', extra: 1,
    edges: { sq: { e0: [[9, 9], [0.5, 1], 'x', [0.2, 0.1]], e1: many, e2: 'nope', 'bad key!': [] }, empty: { e0: [] } },
  }).replace('"empty"', '"__proto__"').replace('[0.5,1]', '[0.5,null]')); // JSON.parse makes __proto__ an own key
  const { shape: s, warnings } = sanitizeShape(raw);
  assert.deepEqual(s.edges.sq.e0, [[LIMITS.t[1], LIMITS.n[1]], [0.2, 0.1]]);
  assert.equal(s.edges.sq.e1.length, LIMITS.points);
  assert.deepEqual(Object.keys(s.edges), ['sq']);
  assert.ok(!('extra' in s) && !('e2' in s.edges.sq));
  assert.equal(warnings.length, 6);
  assert.equal(({}).e0, undefined); // nothing leaked onto Object.prototype
});

// ---- tiling modes: shapes and turns -------------------------------------------------------------------------------

/** Every glued pair of tile edges (matched by their world ends) must carry the same curve, reversed. */
function fitReport(shaped) {
  const q = (p) => p.map((v) => Math.round(v * 1e4)).join(','), world = new Map();
  shaped.tiles.forEach((t) => shaped.prototiles[t.proto].edges.forEach((e) => {
    const curve = pathPoints(e.path).map((p) => apply(t.transform, p));
    world.set(`${q(curve[0])}>${q(curve.at(-1))}`, curve);
  }));
  let checked = 0, worst = 0;
  for (const [k, w] of world) {
    const [a, b] = k.split('>'), o = world.get(`${b}>${a}`);
    if (!o) continue; // patch border
    const r = [...o].reverse(); checked++;
    worst = Math.max(worst, r.length === w.length ? Math.max(...w.map((p, i) => Math.hypot(p[0] - r[i][0], p[1] - r[i][1]))) : Infinity);
  }
  return { checked, worst };
}
const MODES = ['single', 'pair', 'turn-cw', 'turn-ccw', 'pair-turn-cw', 'pair-turn-ccw'];
const raw = (extra) => square.generate({ ...base, ...extra }, [-300, -300, 300, 300]);
const mk = (mode, edges) => ({ generator: 'square', ...(mode !== 'single' && { mode }), edges });
/** A gentle wiggle on the representative of every edge class, different for each, so every shape gets its own curves. */
const wiggleAll = (mode, ir = raw()) => {
  const edges = {};
  edgeClasses(retile(ir, mode)).forEach((c, i) => { (edges[c.rep.proto] ??= {})[c.rep.edge] = [[0.25, 0.1 + 0.03 * i], [0.55, -0.12 - 0.02 * i], [0.8, 0.08]]; });
  return mk(mode, edges);
};
const area = (proto) => signedArea(outlinePoints(proto));
const lens = (shaped, id) => shaped.prototiles[id].edges.map((e) => pathPoints(e.path).length);

test('every mode, any tiling rotation or generator orientation: tiles still meet exactly, outlines stay simple, areas add up', () => {
  for (const mode of MODES) for (const extra of [{}, { rotation: 17 }, { rotation: 133 }, { orientMode: 'cycle' }]) {
    const ir = raw(extra), s = wiggleAll(mode, ir), shaped = applyShape(ir, s);
    assert.deepEqual(shapeProblems(ir, s), [], `${mode} ${JSON.stringify(extra)}`);
    const { checked, worst } = fitReport(shaped);
    assert.ok(checked > 100 && worst < 1e-9, `${mode} ${JSON.stringify(extra)}: ${checked} edges, worst ${worst}`);
    for (const proto of Object.values(shaped.prototiles)) {
      const edges = proto.edges.map((e) => pathPoints(e.path));
      edges.forEach((P, n) => assert.deepEqual(P.at(-1), edges[(n + 1) % 4][0])); // closed
    }
    const n = Object.keys(shaped.prototiles).length;
    assert.ok(close(Object.values(shaped.prototiles).reduce((sum, p) => sum + area(p), 0), n * 100 * 100, 1e-6), `${mode}: areas add up`);
    assert.equal(n, mode.startsWith('pair') ? 2 : 1);
  }
});

test('mode 2: two shapes; bending A\'s top edge dents B\'s bottom edge, and what A gains B loses', () => {
  const shaped = applyShape(raw(), mk('pair', { sq: { e0: [[0.3, 0.2]] } }));
  assert.deepEqual(Object.keys(shaped.prototiles), ['sq', 'sq_b']);
  assert.deepEqual(lens(shaped, 'sq'), [3, 2, 2, 2]);
  assert.deepEqual(lens(shaped, 'sq_b'), [2, 2, 3, 2]);
  assert.ok(!close(area(shaped.prototiles.sq), area(shaped.prototiles.sq_b)));
  assert.ok(close(area(shaped.prototiles.sq) + area(shaped.prototiles.sq_b), 2 * 100 * 100, 1e-6));
  assert.ok(shaped.tiles.every((t) => t.proto === ((t.tags.i + t.tags.j) % 2 === 0 ? 'sq' : 'sq_b')));
  assert.ok(shaped.tiles.every((t) => t.orient.rot === 0)); // no turns
  assert.ok(fitReport(shaped).worst < 1e-9);
});

test('mode 3: ONE shape turned to meet itself: bending the right edge bends the bottom edge, the left edge the top', () => {
  const ir = raw(), right = applyShape(ir, mk('turn-cw', { sq: { e1: [[0.3, 0.2]] } }));
  assert.deepEqual(Object.keys(right.prototiles), ['sq']);
  assert.deepEqual(lens(right, 'sq'), [2, 3, 3, 2]); // right and bottom
  const left = applyShape(ir, mk('turn-cw', { sq: { e0: [[0.3, 0.2]] } }));
  assert.deepEqual(lens(left, 'sq'), [3, 2, 2, 3]);  // top and left
  const ccw = applyShape(ir, mk('turn-ccw', { sq: { e0: [[0.3, 0.2]] } }));
  assert.deepEqual(lens(ccw, 'sq'), [3, 3, 2, 2]);   // top and right
  for (const s of [right, left, ccw]) assert.ok(fitReport(s).worst < 1e-9 && close(area(s.prototiles.sq), 100 * 100, 1e-6));
  assert.ok(new Set(right.tiles.map((t) => t.orient.rot)).size === 4); // four orientations occur
});

test('mode 4: two shapes, quarter turns: A right = B bottom, A left = B top; every pair of neighbours still agrees', () => {
  const ir = raw(), shaped = applyShape(ir, mk('pair-turn-cw', { sq: { e1: [[0.3, 0.2]], e3: [[0.6, -0.15]] } }));
  assert.deepEqual(lens(shaped, 'sq'), [2, 3, 2, 3]);
  assert.deepEqual(lens(shaped, 'sq_b'), [3, 2, 3, 2]); // B's top and bottom
  assert.ok(fitReport(shaped).worst < 1e-9);
  const mirror = applyShape(ir, mk('pair-turn-ccw', { sq: { e1: [[0.3, 0.2]] } }));
  assert.deepEqual(lens(mirror, 'sq_b'), [3, 2, 2, 2]); // A right = B top
});

test('the Orientation setting is ignored once a shape applies, and an effect-free shape leaves the raw IR alone', () => {
  const s = wiggleAll('pair-turn-cw');
  const a = applyShape(raw({ orientMode: 'cycle' }), s), b = applyShape(raw(), s); // (meta.params still records the setting)
  assert.equal(JSON.stringify([a.tiles, a.prototiles]), JSON.stringify([b.tiles, b.prototiles])); // (JSON: -0 and 0 are the same turn)
  const ir = raw({ orientMode: 'checker' });
  assert.equal(applyShape(ir, mk('pair', {})), ir);
  assert.equal(applyShape(ir, { generator: 'hexagon', mode: 'pair', edges: { sq: { e0: BUMP } } }), ir);
  const split = applyShape(ir, mk('pair', { sq: { e0: BUMP } }));
  assert.deepEqual(applyShape(split, mk('pair', { sq: { e0: BUMP } })), split); // accepts an already re-tiled IR
});

test('the same edits mean different tilings in different modes', () => {
  const edges = { sq: { e0: BUMP } }, one = applyShape(raw(), mk('single', edges)), two = applyShape(raw(), mk('pair', edges)), turned = applyShape(raw(), mk('turn-cw', edges));
  assert.deepEqual([one, two, turned].map((x) => Object.keys(x.prototiles).length), [1, 2, 1]);
  assert.deepEqual(lens(one, 'sq'), [3, 2, 3, 2]);   // top and bottom
  assert.deepEqual(lens(turned, 'sq'), [3, 2, 2, 3]); // top and left
});

test('one shared shape for tiles in several orientations: a half-turn symmetric edge (a tiling with no modes, flattened)', () => {
  const tri = triangle.generate({ ...defaults(triangle.params), size: 100 }, [-300, -300, 300, 300]);
  const one = { ...tri, tiles: tri.tiles.map((t) => ({ ...t, orient: { rot: 0, flip: false } })) };
  const s = { generator: 'triangle', edges: { tri: { e0: [[0.2, 0.25], [0.35, -0.1]] } } }, shaped = applyShape(one, s);
  const P = pathPoints(shaped.prototiles.tri.edges[0].path);
  assert.equal(P.length, 7); // start, two edited points, the middle, two mirrored points, end
  P.forEach((p, k) => { const q = P[P.length - 1 - k]; const m = [(P[0][0] + P.at(-1)[0]) / 2, (P[0][1] + P.at(-1)[1]) / 2]; assert.ok(close(p[0] + q[0], 2 * m[0]) && close(p[1] + q[1], 2 * m[1])); });
  assert.ok(fitReport(shaped).worst < 1e-9);
  assert.deepEqual(shapeProblems(one, s), []);
});

test('shapeProblems under modes: edits keyed to a derived edge are named, a locked class refuses edits, crossings are caught for every tile', () => {
  const ir = raw();
  assert.deepEqual(shapeProblems(ir, mk('pair', { sq_b: { e2: BUMP } })), ['sq_b.e2: derived from sq.e0; edit sq.e0 instead']);
  assert.deepEqual(shapeProblems(ir, mk('pair', { zz: { e0: BUMP } })), ['zz: no such tile']);
  const brick = raw({ rowShift: 0.5 });
  assert.match(shapeProblems(brick, shape(BUMP))[0], /^sq\.e0: locked, .*no matching neighbour/);
  assert.equal(applyShape(brick, shape(BUMP)), brick); // locked classes are left alone
  assert.deepEqual(shapeProblems(brick, shape(null, [[0.5, 0.2]])), []); // the vertical edges still match
  const loop = [[0.7, 0.2], [0.3, 0.2], [0.5, -0.3]];
  assert.deepEqual(shapeProblems(ir, mk('pair', { sq: { e0: loop } })), ['sq: the outline crosses itself', 'sq_b: the outline crosses itself']);
});

test('an edit on one tile can ruin the NEIGHBOUR: the check covers every shape, not only the edited one', () => {
  // a tall spike on A's top edge is a fine bump for A, but the same curve is a dent through the whole of B
  const spike = mk('pair', { sq: { e0: [[0.4, 1.6], [0.6, 1.6]] } });
  assert.deepEqual(crossingProblems(raw(), spike), ['sq_b: the outline crosses itself']);
});

test('sanitizeShape keeps a valid non-default mode and drops junk modes', () => {
  assert.deepEqual(sanitizeShape({ generator: 'square', mode: 'pair', edges: {} }).shape, { generator: 'square', mode: 'pair', edges: {} });
  assert.deepEqual(sanitizeShape({ generator: 'square', mode: 'single', edges: {} }).shape, { generator: 'square', edges: {} });
  const bad = sanitizeShape({ generator: 'square', mode: '../x', edges: {} });
  assert.deepEqual(bad.shape, { generator: 'square', edges: {} });
  assert.deepEqual(bad.warnings, ['mode: ignored']);
});

// ---- edges stored as paths, with curves ----------------------------------------------------------------------------

/** Glued edges must carry the same CURVE: sample every edge (C segments included) in world space and compare. */
function curveFit(shaped, steps = 12) {
  const q = (p) => p.map((v) => Math.round(v * 1e4)).join(','), world = new Map();
  shaped.tiles.forEach((t) => shaped.prototiles[t.proto].edges.forEach((e) => {
    const curve = flattenPath(transformPath(e.path, t.transform), steps);
    world.set(`${q(curve[0])}>${q(curve.at(-1))}`, curve);
  }));
  let checked = 0, worst = 0;
  for (const [k, w] of world) {
    const [a, b] = k.split('>'), o = world.get(`${b}>${a}`);
    if (!o) continue;
    const r = [...o].reverse(); checked++;
    worst = Math.max(worst, r.length === w.length ? Math.max(...w.map((p, i) => Math.hypot(p[0] - r[i][0], p[1] - r[i][1]))) : Infinity);
  }
  return { checked, worst };
}
const areaOf = (proto) => signedArea(flattenPath(outlinePath(proto), 12));
const curveEdge = (i = 0) => [['M', 0, 0], ['C', 0.15, 0.3 + 0.03 * i, 0.35, 0.3, 0.5, 0.05], ['C', 0.65, -0.2, 0.85, -0.2 - 0.02 * i, 1, 0]];
const kinds = (proto) => proto.edges.map((e) => e.path.map((x) => x[0]).join(''));

test('frameMatrix is toLocal as an affine; it is a reflection (negative determinant)', () => {
  const f = edgeFrame(gen().prototiles.sq.edges[1].path), m = frameMatrix(f);
  for (const p of [[0, 0], [1, 0], [0.3, 0.2], [-0.4, 1.1]]) {
    const a = toLocal(f, p), b = [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
    assert.ok(close(a[0], b[0]) && close(a[1], b[1]));
  }
  assert.ok(m[0] * m[3] - m[1] * m[2] < 0);
});

test('an edge stored as a path gives the same tiles as the same points stored as a list (free and symmetric)', () => {
  const as = (v) => ({ generator: 'square', edges: { sq: { e0: v, e1: v === WIGGLE ? SIDE : edgeFromPoints(SIDE) } } });
  assert.deepEqual(applyShape(gen(), as(edgeFromPoints(WIGGLE))), applyShape(gen(), as(WIGGLE)));
  const tri = triangle.generate({ ...defaults(triangle.params), size: 100 }, [-300, -300, 300, 300]);
  const one = { ...tri, tiles: tri.tiles.map((t) => ({ ...t, orient: { rot: 0, flip: false } })) };
  const pts = [[0.2, 0.25], [0.35, -0.1]];
  assert.deepEqual(applyShape(one, { generator: 'triangle', edges: { tri: { e0: edgeFromPoints(pts, 'symmetric') } } }),
    applyShape(one, { generator: 'triangle', edges: { tri: { e0: pts } } }));
});

test('expandEdge completes a symmetric half by turning it about the middle and walking it backwards', () => {
  assert.deepEqual(expandEdge(edgeFromPoints([[0.2, 0.3]], 'symmetric'), 'symmetric'), edgeFromPoints([[0.2, 0.3], [0.5, 0], [0.8, -0.3]]));
  assert.equal(expandEdge(edgeFromPoints([[0.2, 0.3]]), 'free').length, 3);
  assert.equal(hasEdits(undefined), false); assert.equal(hasEdits([]), false); assert.equal(hasEdits([['M', 0, 0], ['L', 1, 0]]), false);
  assert.equal(hasEdits([['M', 0, 0], ['C', 0, 0, 1, 0, 1, 0]]), true); assert.equal(hasEdits(WIGGLE), true);
});

test('curved edges: cubics reach the prototile paths, both sides of a glue carry the same curve, in every mode', () => {
  for (const mode of MODES) for (const extra of [{}, { rotation: 17 }, { orientMode: 'cycle' }]) {
    const ir = raw(extra), edges = {};
    edgeClasses(retile(ir, mode)).forEach((c, i) => { (edges[c.rep.proto] ??= {})[c.rep.edge] = curveEdge(i); });
    const s = mk(mode, edges), shaped = applyShape(ir, s), label = `${mode} ${JSON.stringify(extra)}`;
    assert.deepEqual(shapeProblems(ir, s), [], label);
    const { checked, worst } = curveFit(shaped);
    assert.ok(checked > 100 && worst < 1e-9, `${label}: ${checked} edges, worst ${worst}`);
    for (const proto of Object.values(shaped.prototiles)) {
      assert.ok(proto.edges.every((e) => e.path.length === 3 && e.path[1][0] === 'C' && e.path[2][0] === 'C'), label); // every edge of the square is in a class here
      proto.edges.forEach((e, n) => assert.deepEqual(e.path.at(-1).slice(-2), proto.edges[(n + 1) % 4].path[0].slice(1))); // closed, ends pinned
    }
    const n = Object.keys(shaped.prototiles).length;
    assert.ok(close(Object.values(shaped.prototiles).reduce((sum, p) => sum + areaOf(p), 0), n * 100 * 100, 1e-6), `${label}: areas add up`);
  }
});

test('a cubic on the top edge becomes the matching cubic on the bottom edge (reversed, control points swapped)', () => {
  const sq = applyShape(gen(), shape([['M', 0, 0], ['C', 0.2, 0.4, 0.8, 0.4, 1, 0]])).prototiles.sq;
  assert.deepEqual(kinds(sq), ['MC', 'ML', 'MC', 'ML']);
  assert.deepEqual(sq.edges[0].path, [['M', -50, -50], ['C', -30, -90, 30, -90, 50, -50]]);
  assert.deepEqual(sq.edges[2].path, [['M', 50, 50], ['C', 30, 10, -30, 10, -50, 50]]);
});

test('a symmetric edge stored as a half cubic is completed smoothly and point-symmetrically', () => {
  const tri = triangle.generate({ ...defaults(triangle.params), size: 100 }, [-300, -300, 300, 300]);
  const one = { ...tri, tiles: tri.tiles.map((t) => ({ ...t, orient: { rot: 0, flip: false } })) };
  const s = { generator: 'triangle', edges: { tri: { e0: [['M', 0, 0], ['C', 0.1, 0.3, 0.3, 0.3, 0.5, 0]] } } }, shaped = applyShape(one, s);
  const path = shaped.prototiles.tri.edges[0].path;
  assert.deepEqual(path.map((x) => x[0]), ['M', 'C', 'C']);
  const mid = path[1].slice(5), c2 = path[1].slice(3, 5), c1 = path[2].slice(1, 3);
  assert.ok(close(c2[0] + c1[0], 2 * mid[0]) && close(c2[1] + c1[1], 2 * mid[1])); // control points either side of the middle are opposite: smooth
  const P = flattenPath(path, 10), A = P[0], B = P.at(-1), m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  P.forEach((p, k) => { const q = P[P.length - 1 - k]; assert.ok(close(p[0] + q[0], 2 * m[0]) && close(p[1] + q[1], 2 * m[1])); });
  assert.ok(curveFit(shaped).worst < 1e-9);
});

test('crossing checks are skipped for outlines with curves (TODO.md); polyline outlines are still checked', () => {
  const ir = gen();
  const lines = [['M', 0, 0], ['L', 0.7, 0.2], ['L', 0.3, 0.2], ['L', 0.5, -0.3], ['L', 1, 0]];
  const curved = [['M', 0, 0], ['L', 0.7, 0.2], ['L', 0.3, 0.2], ['C', 0.4, -0.1, 0.6, -0.1, 0.5, -0.3], ['L', 1, 0]]; // same anchors
  assert.deepEqual(crossingProblems(ir, shape(lines)), ['sq: the outline crosses itself']);
  assert.deepEqual(crossingProblems(ir, shape(curved)), []);
});

test('sanitizeShape on path edges: clamps, pins the start, snaps the end, refuses what it cannot keep', () => {
  const edges = (v) => sanitizeShape({ generator: 'square', edges: { sq: { e0: v } } });
  const ok = edges([['M', 0, 0], ['C', 0.1, 0.3, 0.4, 0.3, 0.5, 0.1], ['L', 1, 0]]);
  assert.deepEqual(ok.shape.edges.sq.e0[1], ['C', 0.1, 0.3, 0.4, 0.3, 0.5, 0.1]); assert.deepEqual(ok.warnings, []);
  assert.deepEqual(edges([['M', 0, 0], ['C', 99, -99, 0.4, 0.3, 0.5, 0.1], ['L', 1, 0]]).shape.edges.sq.e0[1].slice(1, 3), [LIMITS.t[1], LIMITS.n[0]]);
  const moved = edges([['M', 1e-7, 0], ['L', 0.5, 0.1], ['L', 1.0000001, 0]]);
  assert.deepEqual(moved.shape.edges.sq.e0, [['M', 0, 0], ['L', 0.5, 0.1], ['L', 1, 0]]); assert.equal(moved.warnings.length, 0); // within 1e-6: snapped quietly
  assert.match(edges([['M', 0.1, 0.1], ['L', 0.5, 0.1], ['L', 1, 0]]).warnings[0], /start moved/);
  const half = edges([['M', 0, 0], ['L', 0.3, 0.1], ['L', 0.5, 0]]);
  assert.deepEqual(half.shape.edges.sq.e0.at(-1), ['L', 0.5, 0]);                                    // a symmetric half is a valid ending too
  for (const [bad, why] of [
    [[['M', 0, 0], ['Q', 0.5, 0.5, 1, 0]], /command the editor does not support/],
    [[['M', 0, 0], ['Z']], /command the editor does not support/],
    [[['M', 0, 0], ['L', 0.5]], /invalid segment/],
    [[['M', 0, 0], ['L', 0.5, NaN], ['L', 1, 0]], /invalid segment/],
    [[['M', 0, 0], ['L', 0.7, 0.1]], /does not end/],
    [[['L', 0, 0], ['L', 1, 0]], /not a path/],
    [Array.from({ length: LIMITS.points + 3 }, (_, i) => (i ? ['L', i / 100, 0.1] : ['M', 0, 0])), /more than/],
  ]) {
    const r = edges(bad);
    assert.deepEqual(r.shape.edges, {}, String(why)); assert.match(r.warnings[0], why);
  }
  assert.deepEqual(edges([['M', 0, 0], ['L', 1, 0]]).shape.edges, {});                                // the plain line is no edit
  const mixed = sanitizeShape({ generator: 'square', edges: { sq: { e0: [[0.3, 0.2]], e1: [['M', 0, 0], ['L', 0.5, 0.1], ['L', 1, 0]] } } });
  assert.deepEqual(mixed.shape.edges.sq.e0, [[0.3, 0.2]]); assert.equal(mixed.shape.edges.sq.e1.length, 3); // lists stay lists
});

test('outlinePath keeps curves, closes with Z, and matches outlinePoints for polyline outlines', () => {
  const plain = gen().prototiles.sq, shaped = applyShape(gen(), shape([['M', 0, 0], ['C', 0.2, 0.4, 0.8, 0.4, 1, 0]])).prototiles.sq;
  assert.deepEqual(outlinePath(plain), [['M', -50, -50], ['L', 50, -50], ['L', 50, 50], ['L', -50, 50], ['Z']]);
  assert.deepEqual(outlinePath(shaped), [['M', -50, -50], ['C', -30, -90, 30, -90, 50, -50], ['L', 50, 50], ['C', 30, 10, -30, 10, -50, 50], ['Z']]); // top and bottom curved; the closing L of the left edge is Z's job
});
