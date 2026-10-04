import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSVG } from '../js/render/svg.js';
import { colorFor, styleParams } from '../js/style/colorings.js';
import { defaults } from '../js/params/schema.js';
import { list } from '../js/generators/registry.js';
import '../js/generators/index.js';

const st = { ...defaults(styleParams), fillMode: 'uniform', fill1: '#aaaaaa', stroke: '#000000', strokeWidth: 1, background: '#ffffff' };
const sq = { center: [0, 0], rotUnits: 4, edges: [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]
  .map(([a, b], n) => ({ id: `e${n}`, path: [['M', ...a], ['L', ...b]] })) };
const ir = { prototiles: { sq }, tiles: [{ proto: 'sq', transform: [1, 0, 0, 1, 5, 5], orient: { rot: 0, flip: false }, tags: {} }], meta: {} };
const head = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10" viewBox="0 0 10 10">';
const view = { width: 10, height: 10 };

test('snapshot: prototiles in <defs>, tiles as <use>', () => {
  assert.equal(renderSVG(ir, st, view),
    `${head}<rect width="100%" height="100%" fill="#ffffff"/><defs><path id="p-sq" d="M-1 -1L1 -1L1 1L-1 1L-1 -1Z"/></defs>`
    + '<g stroke="#000000" stroke-width="1" stroke-linejoin="round"><use xlink:href="#p-sq" transform="matrix(1 0 0 1 5 5)" fill="#aaaaaa"/></g></svg>');
});

test('snapshot: flatten writes one transformed <path> per tile and no <defs>/<use>', () => {
  assert.equal(renderSVG(ir, st, view, { flatten: true }),
    `${head}<rect width="100%" height="100%" fill="#ffffff"/>`
    + '<g stroke="#000000" stroke-width="1" stroke-linejoin="round"><path d="M4 4L6 4L6 6L4 6L4 4Z" fill="#aaaaaa"/></g></svg>');
});

test('curved edges: C segments reach the SVG, in <defs> untransformed and in flatten mode mapped (control points too)', () => {
  const bulge = { center: [0, 0], rotUnits: 4, edges: [
    { id: 'e0', path: [['M', -1, -1], ['C', -1, -3, 1, -3, 1, -1]] }, { id: 'e1', path: [['M', 1, -1], ['L', 1, 1]] },
    { id: 'e2', path: [['M', 1, 1], ['L', -1, 1]] }, { id: 'e3', path: [['M', -1, 1], ['L', -1, -1]] }] };
  const cir = { ...ir, prototiles: { sq: bulge } };
  assert.ok(renderSVG(cir, st, view).includes('<path id="p-sq" d="M-1 -1C-1 -3 1 -3 1 -1L1 1L-1 1L-1 -1Z"/>'));
  assert.ok(renderSVG(cir, st, view, { flatten: true }).includes('d="M4 4C4 2 6 2 6 4L6 6L4 6L4 4Z"'));
  assert.ok(!/NaN|undefined/.test(renderSVG(cir, st, view, { flatten: true })));
});

test('transparent background drops the <rect>; precision rounds numbers', () => {
  assert.ok(!renderSVG(ir, { ...st, transparentBg: true }, view).includes('<rect'));
  const third = { ...ir, tiles: [{ ...ir.tiles[0], transform: [1, 0, 0, 1, 1 / 3, 2 / 3] }] };
  assert.ok(renderSVG(third, st, view, { precision: 2 }).includes('matrix(1 0 0 1 0.33 0.67)'));
  assert.ok(renderSVG(third, st, view, { precision: 0 }).includes('matrix(1 0 0 1 0 1)'));
});

test('every generator renders in both modes and every fill mode with no NaN/undefined', () => {
  const modes = styleParams.find((p) => p.id === 'fillMode').options.map(([m]) => m);
  for (const g of list()) {
    const tiling = g.generate(defaults(g.params), [0, 0, 300, 200]);
    for (const fillMode of modes) for (const flatten of [false, true]) {
      const svg = renderSVG(tiling, { ...defaults(styleParams), fillMode }, { width: 300, height: 200 }, { flatten });
      assert.ok(!/NaN|undefined/.test(svg), `${g.id}/${fillMode}`);
      assert.equal((svg.match(flatten ? /<path /g : /<use /g) ?? []).length, tiling.tiles.length);
    }
  }
});

const tile = (x, y, extra = {}) => ({ proto: 'sq', transform: [1, 0, 0, 1, x, y], orient: { rot: 0, flip: false }, tags: {}, ...extra });
const colors = { ...st, fill1: '#000000', fill2: '#808080', fill3: '#ffffff' };

test('colorFor: none/uniform/classes/orient', () => {
  assert.equal(colorFor(tile(0, 0), { ...st, fillMode: 'none' }), 'none');
  assert.equal(colorFor(tile(0, 0), { ...st, fillMode: 'uniform' }), '#aaaaaa');
  const c = { ...colors, fillMode: 'classes' };
  assert.deepEqual([0, 1, 2, 3].map((cls) => colorFor(tile(0, 0, { tags: { cls } }), c)), ['#000000', '#808080', '#ffffff', '#000000']);
  assert.equal(colorFor(tile(0, 0, { tags: { i: 1, j: 0 } }), c), '#808080'); // parity fallback
  assert.equal(colorFor(tile(0, 0, { orient: { rot: 2, flip: false } }), { ...st, fillMode: 'orient' }), 'hsl(120,55%,70%)');
});

test('colorFor gradient: runs colour 1 -> 2 -> 3 across the view along the chosen direction', () => {
  const g = (x, y, angle) => colorFor(tile(x, y), { ...colors, fillMode: 'gradient', gradientAngle: angle }, { width: 100, height: 60 });
  assert.equal(g(0, 30, 0), '#000000');
  assert.equal(g(50, 30, 0), '#808080');
  assert.equal(g(100, 30, 0), '#ffffff');
  assert.equal(g(50, 0, 90), '#000000');
  assert.equal(g(50, 60, 90), '#ffffff');
  assert.equal(g(0, 0, 0), g(0, 60, 0)); // angle 0 ignores y
  assert.equal(g(-500, 0, 0), '#000000'); // clamped outside the view
  assert.equal(g(25, 30, 0), '#404040');
});
