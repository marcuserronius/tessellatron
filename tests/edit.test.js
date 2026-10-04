import test from 'node:test';
import assert from 'node:assert/strict';
import * as square from '../js/generators/periodic/square.js';
import { defaults } from '../js/params/schema.js';
import { edgeFrame, shapeProblems, LIMITS } from '../js/editor/shape.js';
import {
  pointsOf, setPoints, insertPoint, movePoint, removePoint, resetEdge, nearestOnEdge, clampPoint, withMode,
} from '../js/editor/edit.js';

const base = square.generate({ ...defaults(square.params), size: 100 }, [0, 0, 1, 1]);
const at = { generator: 'square', pid: 'sq', eid: 'e0' };
const frame = edgeFrame(base.prototiles.sq.edges[0].path);

test('operations return new shapes and never mutate their input', () => {
  const a = insertPoint(null, at, 0, [0.5, 0.2]);
  assert.deepEqual(a, { generator: 'square', edges: { sq: { e0: [[0.5, 0.2]] } } });
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
  assert.deepEqual(insertPoint(other, at, 0, [0.5, 0.2]), { generator: 'square', edges: { sq: { e0: [[0.5, 0.2]] } } });
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
  assert.deepEqual(a, { generator: 'square', mode: 'pair', edges: { sq: { e0: [[0.5, 0.2]] } } });
  assert.equal(movePoint(a, at, 0, [0.4, 0.2]).mode, 'pair');
  assert.deepEqual(removePoint(a, at, 0), { generator: 'square', mode: 'pair', edges: {} }); // last point gone, mode stays
  assert.deepEqual(withMode(a, 'square', 'turn-cw'), { generator: 'square', mode: 'turn-cw', edges: { sq: { e0: [[0.5, 0.2]] } } }); // edits carried over
  assert.deepEqual(withMode(a, 'square', 'single'), { generator: 'square', edges: { sq: { e0: [[0.5, 0.2]] } } });
  assert.equal(withMode(withMode(null, 'square', 'pair'), 'square', 'single'), null);
  assert.deepEqual(withMode({ generator: 'hexagon', mode: 'x', edges: { hex: {} } }, 'square', 'pair'), { generator: 'square', mode: 'pair', edges: {} }); // a foreign shape is dropped
});
