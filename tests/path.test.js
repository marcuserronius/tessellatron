import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, pathPoints, pathEnds, polylinePath, transformPath, reversePath, flattenPath, toCubics, pathToD, splitCubic, cubicPoint } from '../js/core/path.js';
import { translate, rotate, multiply } from '../js/core/affine.js';

const P = [['M', 0, 0], ['L', 1, 2], ['L', 3, 2]];

test('pathPoints / polylinePath round trip; Z is skipped', () => {
  assert.deepEqual(pathPoints(P), [[0, 0], [1, 2], [3, 2]]);
  assert.deepEqual(polylinePath(pathPoints(P)), P);
  assert.deepEqual(pathPoints([...P, ['Z']]), [[0, 0], [1, 2], [3, 2]]);
});

test('transformPath maps every point and leaves the input alone', () => {
  assert.deepEqual(transformPath(P, translate(10, 20)), [['M', 10, 20], ['L', 11, 22], ['L', 13, 22]]);
  assert.deepEqual(P[0], ['M', 0, 0]);
});

test('reversePath walks the same points backwards, starting with M', () => {
  assert.deepEqual(reversePath(P), [['M', 3, 2], ['L', 1, 2], ['L', 0, 0]]);
  assert.deepEqual(reversePath(reversePath(P)), P);
});

const near = (a, b, eps = 1e-9) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) <= eps, `${a} != ${b}`);
const seg = (path, i) => path[i].slice(1);
// a mixed path: line, cubic, line
const MIX = [['M', 0, 0], ['L', 1, 0], ['C', 2, 0, 3, 1, 3, 2], ['L', 4, 2]];

test('unknown commands and wrong argument counts throw instead of being mangled', () => {
  assert.throws(() => reversePath([['M', 0, 0], ['Q', 1, 1, 2, 2]]), /unsupported path command Q/);
  assert.throws(() => pathPoints([['M', 0, 0], ['A', 1, 1, 0, 0, 1, 2, 2]]), /unsupported path command A/);
  assert.throws(() => transformPath([['M', 0, 0], ['Q', 1, 1, 2, 2]], translate(1, 1)), /unsupported path command Q/);
  assert.throws(() => pathPoints([['M', 0, 0], ['L', 1]]), /L takes 2 numbers, got 1/);
  assert.throws(() => pathToD([['M', 0, 0], ['C', 1, 1, 2, 2]]), /C takes 6 numbers, got 4/);
  assert.throws(() => reversePath([['M', 0, 0], ['L', 1, 1], ['Z']]), /unsupported path command Z/);
  assert.throws(() => reversePath([['L', 0, 0], ['L', 1, 1]]), /must start with M/);
});

test('pathPoints / pathEnds give anchors only: control points and Z are skipped', () => {
  assert.deepEqual(pathPoints(MIX), [[0, 0], [1, 0], [3, 2], [4, 2]]);
  assert.deepEqual(pathPoints([...MIX, ['Z']]), [[0, 0], [1, 0], [3, 2], [4, 2]]);
  assert.deepEqual(pathEnds(MIX), [[0, 0], [4, 2]]);
});

test('transformPath maps control points as well as anchors', () => {
  assert.deepEqual(transformPath(MIX, translate(10, 20)), [['M', 10, 20], ['L', 11, 20], ['C', 12, 20, 13, 21, 13, 22], ['L', 14, 22]]);
  const q = transformPath([['M', 0, 0], ['C', 1, 0, 1, 1, 0, 1], ['Z']], rotate(90));
  assert.equal(q[1].length, 7);
  near(q[1].slice(1, 3), [0, 1]); near(q[1].slice(3, 5), [-1, 1]); near(q[1].slice(5, 7), [-1, 0]);
  assert.deepEqual(q[2], ['Z']);
  assert.deepEqual(MIX[2], ['C', 2, 0, 3, 1, 3, 2]); // input untouched
});

test('reversePath swaps a cubic\'s control points and is its own inverse', () => {
  assert.deepEqual(reversePath(MIX), [['M', 4, 2], ['L', 3, 2], ['C', 3, 1, 2, 0, 1, 0], ['L', 0, 0]]);
  assert.deepEqual(reversePath(reversePath(MIX)), MIX);
  assert.deepEqual(reversePath([['M', 5, 5]]), [['M', 5, 5]]);
});

test('a reversed cubic is the same curve walked the other way', () => {
  const C = [['M', 0, 0], ['C', 1, 3, 4, -2, 5, 1]], R = reversePath(C);
  const at = (path, u) => cubicPoint(path[0].slice(1), seg(path, 1).slice(0, 2), seg(path, 1).slice(2, 4), seg(path, 1).slice(4), u);
  for (const u of [0, 0.2, 0.5, 0.9, 1]) near(at(C, u), at(R, 1 - u));
});

test('transforming and reversing commute, for rotations and for reflections (negative determinant)', () => {
  const reflect = multiply(translate(7, 1), [-1, 0, 0, 1, 0, 0]), turn = multiply(translate(-2, 3), rotate(37));
  for (const m of [turn, reflect, multiply(reflect, turn)]) {
    const a = reversePath(transformPath(MIX, m)), b = transformPath(reversePath(MIX), m);
    a.forEach((s, i) => s.slice(1).forEach((v, k) => assert.ok(Math.abs(v - b[i][k + 1]) < 1e-9)));
  }
});

test('splitCubic: the two halves are the same curve, split where asked', () => {
  const P = [[0, 0], [1, 3], [4, -2], [5, 1]];
  for (const u of [0.25, 0.5, 0.8]) {
    const { left, right } = splitCubic(...P, u);
    near(left[0], P[0]); near(left[3], cubicPoint(...P, u)); near(right[0], left[3]); near(right[3], P[3]);
    for (const v of [0, 0.3, 0.7, 1]) {
      near(cubicPoint(...left, v), cubicPoint(...P, u * v));
      near(cubicPoint(...right, v), cubicPoint(...P, u + (1 - u) * v));
    }
  }
});

test('flattenPath: anchors are exact, a cubic is sampled `steps` times, a line adds one point', () => {
  const P = flattenPath(MIX, 8);
  assert.equal(P.length, 1 + 1 + 8 + 1);
  assert.deepEqual([P[0], P[1], P[9], P[10]], [[0, 0], [1, 0], [3, 2], [4, 2]]);
  near(P[1 + 4], cubicPoint([1, 0], [2, 0], [3, 1], [3, 2], 0.5));
  assert.equal(flattenPath([...MIX, ['Z']], 8).length, P.length); // Z adds nothing
  assert.equal(flattenPath([['M', 0, 0], ['C', 0, 1, 1, 1, 1, 0]], 1).length, 2);
});

test('toCubics rewrites lines as the equal cubics and leaves the rest alone', () => {
  const T = toCubics(MIX);
  assert.deepEqual(T.map((s) => s[0]), ['M', 'C', 'C', 'C']);
  assert.deepEqual(T[2], MIX[2]);
  near(T[1].slice(1, 3), [1 / 3, 0]); near(T[1].slice(3, 5), [2 / 3, 0]); assert.deepEqual(T[1].slice(5), [1, 0]);
  near(flattenPath(T, 4)[2], [0.5, 0]); // u = 0.5 on the first line's cubic is the line's midpoint
  assert.deepEqual(pathPoints(T), pathPoints(MIX));
});

test('pathToD: M/L keep the compact "M1 2L3 4" form; C lists six numbers; numbers are rounded; Z is bare', () => {
  assert.equal(pathToD(P), 'M0 0L1 2L3 2');
  assert.equal(pathToD([...MIX, ['Z']]), 'M0 0L1 0C2 0 3 1 3 2L4 2Z');
  assert.equal(pathToD([['M', 1 / 3, -1 / 3], ['C', 0.12345, 1 / 7, 2, 2, 1e-9, -1e-9]], 2), 'M0.33 -0.33C0.12 0.14 2 2 0 0');
});

test('the registry is the only place a command is defined: a new command works in every function', () => {
  COMMANDS.Q = { // quadratic, as a toy: arity 4, flat x y pairs
    arity: 4, end: (a) => [a[2], a[3]], map: COMMANDS.L.map,
    reverse: (start, a) => [a[0], a[1], start[0], start[1]],
    flatten: (start, a) => [[a[2], a[3]]],
  };
  COMMANDS.R = { arity: 1, end: (a) => [a[0], 0], map: (m, a) => [a[0] * m[0]], d: (a, fmt) => `[${fmt(a[0])}]` }; // custom text
  try {
    const Qp = [['M', 0, 0], ['Q', 1, 1, 2, 0]];
    assert.deepEqual(pathPoints(Qp), [[0, 0], [2, 0]]);
    assert.deepEqual(transformPath(Qp, translate(1, 1)), [['M', 1, 1], ['Q', 2, 2, 3, 1]]);
    assert.deepEqual(reversePath(Qp), [['M', 2, 0], ['Q', 1, 1, 0, 0]]);
    assert.deepEqual(flattenPath(Qp), [[0, 0], [2, 0]]);
    assert.equal(pathToD(Qp), 'M0 0Q1 1 2 0');
    assert.equal(pathToD([['M', 0, 0], ['R', 1.23456]], 2), 'M0 0R[1.23]');
    assert.throws(() => reversePath([['M', 0, 0], ['R', 1]]), /unsupported path command R/); // no `reverse` entry
    assert.throws(() => flattenPath([['M', 0, 0], ['R', 1]]), /flattenPath: unsupported path command R/); // no `flatten` entry
  } finally { delete COMMANDS.Q; delete COMMANDS.R; }
  assert.throws(() => pathPoints([['M', 0, 0], ['Q', 1, 1, 2, 0]]), /unsupported path command Q/);
});
