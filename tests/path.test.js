import test from 'node:test';
import assert from 'node:assert/strict';
import { pathPoints, polylinePath, transformPath, reversePath } from '../js/core/path.js';
import { translate } from '../js/core/affine.js';

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

test('unsupported commands throw instead of being mangled', () => {
  assert.throws(() => reversePath([['M', 0, 0], ['C', 1, 1, 2, 2, 3, 3]]), /unsupported path command C/);
  assert.throws(() => reversePath([['M', 0, 0], ['L', 1, 1], ['Z']]), /unsupported path command Z/);
  assert.throws(() => pathPoints([['M', 0, 0], ['Q', 1, 1, 2, 2]]), /unsupported/);
});
