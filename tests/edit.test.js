import test from 'node:test';
import assert from 'node:assert/strict';
import * as square from '../js/generators/periodic/square.js';
import { defaults } from '../js/params/schema.js';
import { edgeFrame, edgeFromPoints, edgePath, frameMatrix, shapeProblems, LIMITS } from '../js/editor/shape.js';
import { cubicPoint, pathPoints, transformPath } from '../js/core/path.js';
import {
  nodeAt, nodeCount, setHandle, smoothNode, cornerNode, edgeValue, pointsOf, setPoints, insertPoint, movePoint, removePoint, resetEdge, nearestOnEdge, clampPoint, withMode,
} from '../js/editor/edit.js';

const base = square.generate({ ...defaults(square.params), size: 100 }, [0, 0, 1, 1]);
const at = { generator: 'square', pid: 'sq', eid: 'e0' };
const frame = edgeFrame(base.prototiles.sq.edges[0].path);
const E = (pts, kind) => edgeFromPoints(pts, kind); // the stored form of an edge made of straight pieces

test('operations return new shapes and never mutate their input', () => {
  const a = insertPoint(null, at, 0, [0.5, 0.2]);
  assert.deepEqual(a, { generator: 'square', edges: { sq: { e0: E([[0.5, 0.2]]) } } });
  const frozen = JSON.stringify(a);
  const b = insertPoint(a, at, 1, [0.8, -0.1]), c = movePoint(b, at, 0, [0.4, 0.3]), d = removePoint(c, at, 1);
  assert.equal(JSON.stringify(a), frozen);
  assert.deepEqual(pointsOf(b, at), [[0.5, 0.2], [0.8, -0.1]]);
  assert.deepEqual(pointsOf(c, at), [[0.4, 0.3], [0.8, -0.1]]);
  assert.deepEqual(pointsOf(d, at), [[0.4, 0.3]]);
});

test('inserting keeps order; edits on several edges coexist; the last removal gives null', () => {
  let s = insertPoint(null, at, 0, [0.7, 0.1]);
  s = insertPoint(s, at, 0, [0.2, 0.1]);
  s = insertPoint(s, { ...at, eid: 'e1' }, 0, [0.5, 0.2]);
  assert.deepEqual(pointsOf(s, at), [[0.2, 0.1], [0.7, 0.1]]);
  assert.deepEqual(Object.keys(s.edges.sq), ['e0', 'e1']);
  assert.deepEqual(Object.keys(resetEdge(s, at).edges.sq), ['e1']);
  assert.equal(resetEdge(resetEdge(s, at), { ...at, eid: 'e1' }), null);
  assert.equal(removePoint(insertPoint(null, at, 0, [0.5, 0.2]), at, 0), null);
});

test('points are clamped to LIMITS; the point count is capped; a shape for another generator is replaced', () => {
  assert.deepEqual(pointsOf(setPoints(null, at, [[99, -99]]), at), [[LIMITS.t[1], LIMITS.n[0]]]);
  assert.deepEqual(clampPoint([0.5, 0.5]), [0.5, 0.5]);
  let s = null;
  for (let i = 0; i < LIMITS.points + 3; i++) s = insertPoint(s, at, i, [0.5, 0.1]);
  assert.equal(pointsOf(s, at).length, LIMITS.points);
  const other = { generator: 'hexagon', edges: { hex: { e0: [[0.5, 0.1]] } } };
  assert.deepEqual(pointsOf(other, at), []);
  assert.deepEqual(insertPoint(other, at, 0, [0.5, 0.2]), { generator: 'square', edges: { sq: { e0: E([[0.5, 0.2]]) } } });
});

test('nearestOnEdge: straight edge gives insert index 0; with points it picks the closest segment', () => {
  const straight = nearestOnEdge(frame, [], [10, -50]);
  assert.equal(straight.index, 0);
  assert.ok(Math.abs(straight.point[0] - 0.6) < 1e-12 && Math.abs(straight.point[1]) < 1e-12 && straight.distance === 0);
  const pts = [[0.3, 0.3], [0.7, 0.3]]; // path: A -> (0.3,.3) -> (0.7,.3) -> B
  assert.equal(nearestOnEdge(frame, pts, [-30, -80]).index, 0);
  assert.equal(nearestOnEdge(frame, pts, [0, -80]).index, 1); // on the middle segment (n = 0.3 -> y = -80)
  assert.equal(nearestOnEdge(frame, pts, [45, -55]).index, 2);
});

test('inserting at the clicked spot does not change the outline (the new point lies on the edge)', () => {
  const s0 = setPoints(null, at, [[0.3, 0.3], [0.7, 0.3]]);
  const hit = nearestOnEdge(frame, pointsOf(s0, at), [0, -80]);
  const s1 = insertPoint(s0, at, hit.index, hit.point);
  assert.deepEqual(shapeProblems(base, s1), []);
  assert.ok(Math.abs(pointsOf(s1, at)[1][1] - 0.3) < 1e-12);
});

test('nearestOnEdge on a symmetric edge maps clicks on the mirrored half back to the stored half', () => {
  const half = [[0.2, 0.3]]; // curve: A, (0.2,.3), middle (0.5,0), (0.8,-.3), B
  const on = (t, n) => { const [x, y] = [frame.A[0] + t * 100, frame.A[1] - n * 100]; return [x, y]; }; // e0 frame: x = -50 + 100 t, y = -50 - 100 n
  const first = nearestOnEdge(frame, half, on(0.35, 0.15), 'symmetric');
  assert.equal(first.index, 1); // between the stored point and the middle: append
  const mirrored = nearestOnEdge(frame, half, on(0.65, -0.15), 'symmetric');
  assert.equal(mirrored.index, 1);
  assert.ok(Math.abs(mirrored.point[0] - 0.35) < 1e-12 && Math.abs(mirrored.point[1] - 0.15) < 1e-12);
  assert.equal(nearestOnEdge(frame, half, on(0.1, 0.15), 'symmetric').index, 0);
  assert.equal(nearestOnEdge(frame, half, on(0.9, -0.15), 'symmetric').index, 0);
  assert.equal(nearestOnEdge(frame, [], on(0.8, 0), 'symmetric').index, 0); // only the middle exists: either side inserts at 0
});

test('modes: a shape keeps its mode through edits, and choosing a mode sticks even with no edits', () => {
  assert.equal(withMode(null, 'square', 'single'), null);                       // the default mode with nothing in it is "no shape"
  assert.deepEqual(withMode(null, 'square', 'pair'), { generator: 'square', mode: 'pair', edges: {} });
  const a = insertPoint(withMode(null, 'square', 'pair'), at, 0, [0.5, 0.2]);
  assert.deepEqual(a, { generator: 'square', mode: 'pair', edges: { sq: { e0: E([[0.5, 0.2]]) } } });
  assert.equal(movePoint(a, at, 0, [0.4, 0.2]).mode, 'pair');
  assert.deepEqual(removePoint(a, at, 0), { generator: 'square', mode: 'pair', edges: {} }); // last point gone, mode stays
  assert.deepEqual(withMode(a, 'square', 'turn-cw'), { generator: 'square', mode: 'turn-cw', edges: { sq: { e0: E([[0.5, 0.2]]) } } }); // edits carried over
  assert.deepEqual(withMode(a, 'square', 'single'), { generator: 'square', edges: { sq: { e0: E([[0.5, 0.2]]) } } });
  assert.equal(withMode(withMode(null, 'square', 'pair'), 'square', 'single'), null);
  assert.deepEqual(withMode({ generator: 'hexagon', mode: 'x', edges: { hex: {} } }, 'square', 'pair'), { generator: 'square', mode: 'pair', edges: {} }); // a foreign shape is dropped
});

// ---- curves ---------------------------------------------------------------------------------------------------------

const near = (a, b, eps = 1e-9) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) <= eps, `${a} != ${b}`);
const ARCH = [['M', 0, 0], ['C', 0.1, 0.5, 0.4, 0.5, 0.5, 0.2], ['C', 0.6, -0.1, 0.9, -0.1, 1, 0]];
const arch = { generator: 'square', edges: { sq: { e0: ARCH } } };

test('inserting on a cubic splits it: the curve does not change, and the new anchor lies on it', () => {
  const s = insertPoint(arch, at, 0, [0, 0], 0.4), P = edgeValue(s, at);
  assert.deepEqual(P.map((x) => x[0]), ['M', 'C', 'C', 'C']);
  near(pathPoints(P)[1], cubicPoint([0, 0], [0.1, 0.5], [0.4, 0.5], [0.5, 0.2], 0.4));
  assert.deepEqual(P.at(-1), ARCH.at(-1)); assert.deepEqual(P[3], ARCH[2]); // the untouched segment is the same
  // same curve: the two halves at v reproduce the original at 0.4 v and 0.4 + 0.6 v
  const [p0, a, b, m] = [[0, 0], P[1].slice(1, 3), P[1].slice(3, 5), P[1].slice(5)], [, c, d, e] = [m, P[2].slice(1, 3), P[2].slice(3, 5), P[2].slice(5)];
  for (const v of [0.25, 0.5, 0.9]) {
    near(cubicPoint(p0, a, b, m, v), cubicPoint([0, 0], [0.1, 0.5], [0.4, 0.5], [0.5, 0.2], 0.4 * v));
    near(cubicPoint(m, c, d, e, v), cubicPoint([0, 0], [0.1, 0.5], [0.4, 0.5], [0.5, 0.2], 0.4 + 0.6 * v));
  }
  // without u, the parameter is found from the clicked point
  const target = cubicPoint([0, 0], [0.1, 0.5], [0.4, 0.5], [0.5, 0.2], 0.7), found = pathPoints(edgeValue(insertPoint(arch, at, 0, target), at))[1];
  near(found, target, 0.01);
});

test('inserting on a line inside a path keeps the other segments, and the point cap holds for paths too', () => {
  const tail = { generator: 'square', edges: { sq: { e0: [['M', 0, 0], ['C', 0.1, 0.5, 0.4, 0.5, 0.5, 0.2], ['L', 1, 0]] } } };
  const s = insertPoint(tail, at, 1, [0.8, 0.1]);
  assert.deepEqual(edgeValue(s, at), [['M', 0, 0], ['C', 0.1, 0.5, 0.4, 0.5, 0.5, 0.2], ['L', 0.8, 0.1], ['L', 1, 0]]);
  let t = null;
  for (let i = 0; i < LIMITS.points + 3; i++) t = insertPoint(t, at, i, [0.5, 0.1]);
  assert.equal(pointsOf(t, at).length, LIMITS.points);
});

test('moving an anchor takes the control points beside it along; nothing else moves', () => {
  const s = movePoint(arch, at, 0, [0.6, 0.3]), P = edgeValue(s, at);
  assert.deepEqual(P[0], ['M', 0, 0]);
  assert.deepEqual(P[1].slice(0, 3), ['C', 0.1, 0.5]);                               // first control point of the first segment: not touched
  near(P[1].slice(3, 5), [0.4 + 0.1, 0.5 + 0.1]); assert.deepEqual(P[1].slice(5), [0.6, 0.3]);  // second control point shifted by (0.1, 0.1), end at the new anchor
  near(P[2].slice(1, 3), [0.7, 0.0]);                                                 // the next segment's first control point shifted too
  assert.deepEqual(P[2].slice(3), [0.9, -0.1, 1, 0]);
  assert.equal(movePoint(arch, at, 5, [0, 0]), arch);                                 // no such anchor: unchanged
});

test('removing an anchor joins its segments: two lines give a line, otherwise a cubic with the outer control points', () => {
  const lines = insertPoint(insertPoint(null, at, 0, [0.3, 0.2]), at, 1, [0.7, 0.1]);
  assert.deepEqual(edgeValue(removePoint(lines, at, 0), at), edgeFromPoints([[0.7, 0.1]]));
  const j = edgeValue(removePoint(arch, at, 0), at);
  assert.deepEqual(j, [['M', 0, 0], ['C', 0.1, 0.5, 0.9, -0.1, 1, 0]]);
  const mixed = edgeValue(removePoint({ ...arch, edges: { sq: { e0: [['M', 0, 0], ['L', 0.3, 0.1], ['C', 0.5, 0.4, 0.8, 0.4, 1, 0]] } } }, at, 0), at);
  assert.equal(mixed[1][0], 'C'); assert.deepEqual(mixed[1].slice(5), [1, 0]); near(mixed[1].slice(3, 5), [0.8, 0.4]);
  assert.equal(removePoint(arch, at, 9), arch);
});

test('an edge that becomes the plain line is dropped, and setPoints replaces curves by a polyline', () => {
  assert.equal(removePoint(removePoint(lines2(), at, 0), at, 0), null);
  const flat = setPoints(arch, at, [[0.5, 0.2]]);
  assert.deepEqual(edgeValue(flat, at), edgeFromPoints([[0.5, 0.2]]));
  assert.equal(resetEdge(arch, at), null);
  function lines2() { return setPoints(null, at, [[0.3, 0.2], [0.7, 0.1]]); }
});

test('symmetric edges store the first half: the stored path ends at the middle', () => {
  const sym = { ...at, kind: 'symmetric' };
  const s = insertPoint(null, sym, 0, [0.2, 0.3]);
  assert.deepEqual(edgeValue(s, sym), [['M', 0, 0], ['L', 0.2, 0.3], ['L', 0.5, 0]]);
  assert.deepEqual(pointsOf(s, sym), [[0.2, 0.3]]);
  assert.deepEqual(pointsOf(movePoint(s, sym, 0, [0.25, 0.1]), sym), [[0.25, 0.1]]);
  assert.equal(removePoint(s, sym, 0), null);
});

test('edgePath reads lists and paths; a path that does not match the class is re-read as a polyline through its anchors', () => {
  assert.deepEqual(edgePath([[0.3, 0.2]]), [['M', 0, 0], ['L', 0.3, 0.2], ['L', 1, 0]]);
  assert.deepEqual(edgePath([[0.3, 0.2]], 'symmetric'), [['M', 0, 0], ['L', 0.3, 0.2], ['L', 0.5, 0]]);
  assert.deepEqual(edgePath(undefined), [['M', 0, 0], ['L', 1, 0]]);
  assert.equal(edgePath(ARCH), ARCH);
  assert.deepEqual(edgePath(ARCH, 'symmetric'), [['M', 0, 0], ['L', 0.5, 0.2], ['L', 0.5, 0]]); // anchors kept, curves lost
});

test('nearestOnEdge on a curve: the segment, the parameter along it, and the point on the curve', () => {
  const world = (u) => transformPath([['M', ...cubicPoint([0, 0], [0.1, 0.5], [0.4, 0.5], [0.5, 0.2], u)]], frameMatrix(frame))[0].slice(1);
  const hit = nearestOnEdge(frame, ARCH, world(0.3));
  assert.equal(hit.index, 0); assert.ok(Math.abs(hit.u - 0.3) < 0.02, `u ${hit.u}`); assert.ok(hit.distance < 1);
  near(hit.point, cubicPoint([0, 0], [0.1, 0.5], [0.4, 0.5], [0.5, 0.2], 0.3), 0.01);
  const second = nearestOnEdge(frame, ARCH, [frame.A[0] + 90, frame.A[1] + 5]);
  assert.equal(second.index, 1);
  // on a symmetric half-curve the mirrored half maps back (index and u mirrored)
  const half = [['M', 0, 0], ['C', 0.1, 0.5, 0.3, 0.5, 0.5, 0]];
  const a = nearestOnEdge(frame, half, world(0.3), 'symmetric'), b = nearestOnEdge(frame, half, transformPath([['M', 1 - 0.0, -0]], frameMatrix(frame))[0].slice(1), 'symmetric');
  assert.equal(a.index, 0); assert.equal(b.index, 0);
});

// ---- nodes and handles ------------------------------------------------------------------------------------------------

const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const bump = setPoints(null, at, [[0.5, 0.3]]); // M, L(0.5,0.3), L(1,0): three nodes

test('nodeAt: anchors and handles of a line edge, an arch, and the ends; smooth is inferred from the path', () => {
  assert.equal(nodeCount(bump, at), 3); assert.equal(nodeCount(null, at), 2); assert.equal(nodeAt(bump, at, 3), null);
  assert.deepEqual(nodeAt(bump, at, 1), { anchor: [0.5, 0.3], in: null, out: null, smooth: false, interior: true });
  assert.equal(nodeAt(bump, at, 0).interior, false); assert.equal(nodeAt(bump, at, 2).interior, false);
  const n = nodeAt(arch, at, 1);                       // ARCH's middle node: (0.5,0.2) between control points (0.4,0.5) and (0.6,-0.1)
  assert.deepEqual([n.anchor, n.in, n.out], [[0.5, 0.2], [0.4, 0.5], [0.6, -0.1]]);
  assert.equal(n.smooth, true);                        // (0.4,.5)-(0.5,.2)-(0.6,-.1) lie on one line
  assert.deepEqual([nodeAt(arch, at, 0).in, nodeAt(arch, at, 0).out], [null, [0.1, 0.5]]);
  const kink = { generator: 'square', edges: { sq: { e0: [['M', 0, 0], ['C', 0.1, 0.5, 0.4, 0.5, 0.5, 0.2], ['C', 0.7, 0.3, 0.9, -0.1, 1, 0]] } } };
  assert.equal(nodeAt(kink, at, 1).smooth, false);
});

test('smoothNode on a plain corner node makes both neighbouring segments cubics with aligned handles, a third of the neighbour distance long', () => {
  const s = smoothNode(bump, at, 1), n = nodeAt(s, at, 1);
  assert.deepEqual(edgeValue(s, at).map((x) => x[0]), ['M', 'C', 'C']);
  assert.equal(n.smooth, true); assert.deepEqual(n.anchor, [0.5, 0.3]);
  assert.ok(Math.abs(len(n.in, n.anchor) - len([0, 0], n.anchor) / 3) < 1e-9 && Math.abs(len(n.out, n.anchor) - len([1, 0], n.anchor) / 3) < 1e-9);
  const T = sub([1, 0], [0, 0]); // the chord between the neighbours is horizontal, so the handles are too
  assert.ok(Math.abs(n.in[1] - 0.3) < 1e-9 && Math.abs(n.out[1] - 0.3) < 1e-9 && dot(sub(n.out, n.anchor), T) > 0);
  assert.equal(smoothNode(bump, at, 0), bump); assert.equal(smoothNode(bump, at, 2), bump); // ends cannot be made smooth
});

test('smoothNode keeps one existing handle and completes it; bisects when both exist', () => {
  const one = setHandle(bump, at, 1, 'out', [0.7, 0.5]), a = [0.5, 0.3];
  const s1 = nodeAt(smoothNode(one, at, 1), at, 1);
  assert.ok(s1.smooth && len(s1.out, a) - len([0.7, 0.5], a) < 1e-9 && Math.abs(len(s1.out, a) - len([0.7, 0.5], a)) < 1e-9);  // the out handle did not move
  assert.deepEqual(s1.out.map((v) => +v.toFixed(9)), [0.7, 0.5]);
  assert.ok(Math.abs(len(s1.in, a) - len([0, 0], a) / 3) < 1e-9);
  const both = setHandle(setHandle(bump, at, 1, 'out', [0.5, 0.6]), at, 1, 'in', [0.3, 0.3]); // out points up, in points left of the node: not smooth
  assert.equal(nodeAt(both, at, 1).smooth, false);
  const b = nodeAt(smoothNode(both, at, 1), at, 1);
  assert.ok(b.smooth); assert.ok(Math.abs(len(b.out, b.anchor) - 0.3) < 1e-9 && Math.abs(len(b.in, b.anchor) - 0.2) < 1e-9); // lengths kept
});

test('setHandle on a smooth node keeps it smooth (the other handle faces away, keeps its length); lock off breaks it', () => {
  const s = smoothNode(bump, at, 1), before = nodeAt(s, at, 1);
  const moved = setHandle(s, at, 1, 'out', [0.8, 0.6]), n = nodeAt(moved, at, 1);
  assert.deepEqual(n.out, [0.8, 0.6]); assert.equal(n.smooth, true);
  assert.ok(Math.abs(len(n.in, n.anchor) - len(before.in, before.anchor)) < 1e-9);
  const u = sub(n.out, n.anchor), v = sub(n.in, n.anchor);
  assert.ok(Math.abs(u[0] * v[1] - u[1] * v[0]) < 1e-9 && dot(u, v) < 0);
  const broken = nodeAt(setHandle(s, at, 1, 'out', [0.8, 0.6], { lock: false }), at, 1);
  assert.deepEqual(broken.in, before.in); assert.equal(broken.smooth, false);
});

test('setHandle on a node with line segments turns them into cubics; endpoints have handles too; bad requests change nothing', () => {
  const s = setHandle(bump, at, 0, 'out', [0.1, 0.4]);
  assert.deepEqual(edgeValue(s, at).map((x) => x[0]), ['M', 'C', 'L']);
  const c = edgeValue(s, at)[1];                                 // the line's own second control point (2/3 of the way) is kept
  assert.deepEqual([c[1], c[2]], [0.1, 0.4]); near([c[3], c[4]], [1 / 3, 0.2]); assert.deepEqual(c.slice(5), [0.5, 0.3]);
  const t = setHandle(bump, at, 2, 'in', [0.9, 0.2]);
  assert.deepEqual(nodeAt(t, at, 2).in, [0.9, 0.2]);
  assert.equal(setHandle(bump, at, 0, 'in', [0, 0]), bump);    // the start has no incoming segment
  assert.equal(setHandle(bump, at, 2, 'out', [0, 0]), bump);   // the end has no outgoing one
  assert.equal(setHandle(bump, at, 7, 'in', [0, 0]), bump);
  assert.equal(setHandle(bump, at, 1, 'sideways', [0, 0]), bump);
  assert.deepEqual(nodeAt(setHandle(bump, at, 1, 'in', [99, -99]), at, 1).in, [LIMITS.t[1], LIMITS.n[0]]); // clamped
});

test('cornerNode retracts handles; segments that become straight turn back into lines, the others stay cubics', () => {
  const s = smoothNode(bump, at, 1), c = cornerNode(s, at, 1);
  assert.deepEqual(edgeValue(c, at), edgeValue(bump, at));            // back to the plain polyline
  const keep = cornerNode(arch, at, 1), n = nodeAt(keep, at, 1);
  near(n.in, [0.5 - 0.5 / 3, 0.2 - 0.2 / 3]); near(n.out, [0.5 + 0.5 / 3, 0.2 - 0.2 / 3]); // retracted to a third of the way to each neighbour...
  assert.deepEqual(edgeValue(keep, at).map((x) => x[0]), ['M', 'C', 'C']); // ...but the far handles remain, so both stay cubics
  assert.equal(cornerNode(arch, at, 9), arch);
});

test('a cubic that lies on its chord is stored as a line, wherever the controls came from', () => {
  const s = setHandle(bump, at, 0, 'out', [0.5 / 3, 0.3 / 3]); // exactly where the line's own control point would be
  assert.deepEqual(edgeValue(s, at), edgeValue(bump, at));
  assert.equal(setHandle(null, at, 0, 'out', [1 / 3, 0]), null); // a straight edge stays straight
});

test('handles of a symmetric edge: the middle node has an in handle only, and the completed curve is smooth through it', () => {
  const sym = { ...at, kind: 'symmetric' };
  const s = setHandle(insertPoint(null, sym, 0, [0.25, 0.2]), sym, 2, 'in', [0.4, 0.3]);
  assert.equal(nodeCount(s, sym), 3); assert.deepEqual(nodeAt(s, sym, 2).in, [0.4, 0.3]); assert.equal(nodeAt(s, sym, 2).out, null);
  assert.equal(setHandle(s, sym, 2, 'out', [0.6, 0.3]), s);
});
