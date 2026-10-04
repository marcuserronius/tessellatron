import test from 'node:test';
import assert from 'node:assert/strict';
import { selfIntersects, signedArea } from '../js/core/polygon.js';

const square = [[0, 0], [10, 0], [10, 10], [0, 10]];

test('simple polygons are not flagged (convex, concave, extra collinear vertices)', () => {
  assert.equal(selfIntersects(square), false);
  assert.equal(selfIntersects([[0, 0], [10, 0], [10, 10], [5, 3], [0, 10]]), false); // concave notch
  assert.equal(selfIntersects([[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]]), false); // vertex mid-edge
  assert.equal(selfIntersects([[0, 0], [10, 0], [10, 0], [10, 10], [0, 10]]), false); // repeated vertex
});

test('crossing edges (bow tie) are flagged', () => {
  assert.equal(selfIntersects([[0, 0], [10, 10], [10, 0], [0, 10]]), true);
});

test('touching counts: a vertex on another edge, or two edges sharing a vertex', () => {
  assert.equal(selfIntersects([[0, 0], [10, 0], [10, 10], [5, 0], [0, 10]]), true);   // T-junction on the bottom edge
  assert.equal(selfIntersects([[0, 0], [10, 0], [5, 5], [10, 10], [0, 10], [5, 5]]), true); // figure-eight pinch
});

test('an edge that folds back over its neighbour is flagged', () => {
  assert.equal(selfIntersects([[0, 0], [10, 0], [5, 0], [10, 10], [0, 10]]), true);
});

test('degenerate input (fewer than 3 distinct vertices) is flagged', () => {
  assert.equal(selfIntersects([[0, 0], [1, 1]]), true);
  assert.equal(selfIntersects([[0, 0], [0, 0], [1, 1]]), true);
});

test('signedArea sanity (clockwise on screen is positive)', () => {
  assert.equal(signedArea(square), 100);
});
