import test from 'node:test';
import assert from 'node:assert/strict';
import * as square from '../js/generators/periodic/square.js';
import * as hexagon from '../js/generators/periodic/hexagon.js';
import * as triangle from '../js/generators/periodic/triangle.js';
import { defaults } from '../js/params/schema.js';
import { tileEditorSVG, tileChoices } from '../js/ui/tile-editor-svg.js';
import { edgeClasses } from '../js/editor/classes.js';
import { retile } from '../js/editor/modes.js';
import { canEdit, editableParams } from '../js/editor/shape.js';

const model = (g, extra = {}, mode) => {
  const p = { ...defaults(g.params), size: 100, ...extra }, raw = g.generate(p, [-400, -400, 400, 400]), sample = mode ? retile(raw, mode) : raw;
  return { sample, classes: edgeClasses(sample) };
};
const svgOf = (g, shape, extra, opts) => tileEditorSVG({ ...model(g, extra, shape?.mode), shape, ...opts });
const count = (svg, re) => (svg.match(re) ?? []).length;
const shape = { generator: 'square', edges: { sq: { e0: [[0.3, 0.2], [0.7, 0.2]], e1: [[0.5, -0.2]] } } };

test('square editor: 8 ghost neighbours; every edge is editable, a later member of a class is dashed and has its own handles', () => {
  const svg = svgOf(square, shape);
  assert.equal(count(svg, /<path d="[^"]*" transform="matrix/g), 8);
  assert.equal(count(svg, /class="hit"/g), 4);
  assert.equal(count(svg, /class="edge rep"/g), 2);
  assert.equal(count(svg, /class="edge derived"/g), 2);
  assert.equal(count(svg, /class="handle"/g), 2 * 2 + 2 * 1); // top and bottom: 2 points each; right and left: 1 each
  assert.equal(count(svg, /class="derived-pt"/g), 0);
  assert.ok(svg.includes('data-pid="sq" data-edge="e0" data-index="1"') && svg.includes('data-edge="e3" data-index="0"'));
  assert.ok(!svg.includes('class="tile-editor invalid"'));
});

test('the bottom edge is the top edge seen the other way round: its handle indices run backwards', () => {
  const svg = svgOf(square, shape), idx = (edge) => [...svg.matchAll(new RegExp(`data-edge="${edge}" data-index="(\\d+)"`, 'g'))].map((m) => +m[1]);
  assert.deepEqual(idx('e0'), [0, 1]);
  assert.deepEqual(idx('e2'), [1, 0]);
});

test('with no shape there are no handles, but every edge stays pressable; invalid flag is reflected', () => {
  const svg = svgOf(square, null, {}, { invalid: true });
  assert.equal(count(svg, /class="handle"/g), 0);
  assert.equal(count(svg, /class="hit"/g), 4);
  assert.ok(svg.startsWith('<svg class="tile-editor invalid"'));
});

test('the viewBox is square and centred on the tile, with a margin for neighbours', () => {
  const [x, y, w, h] = svgOf(square, null).match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  assert.ok(w === h && x === y && Math.abs(x + w / 2) < 1e-9);
  assert.ok(w > 100 * Math.SQRT2 && w < 100 * 3);
});

test('shape edits show in the tile outline; a shape for another generator is ignored', () => {
  const plain = svgOf(square, null);
  assert.notEqual(svgOf(square, shape), plain);
  assert.equal(svgOf(square, { generator: 'hexagon', edges: shape.edges }), plain);
});

test('mode 2, two shapes: tiles A and B, each shown upright; a shared edge has handles on both sides', () => {
  const edit = { generator: 'square', mode: 'pair', edges: { sq: { e0: [[0.3, 0.2]] } } }; // A top = B bottom
  const m = model(square, {}, 'pair');
  assert.deepEqual(tileChoices(m.sample), [{ id: 'sq', label: 'A' }, { id: 'sq_b', label: 'B' }]);
  const a = tileEditorSVG({ ...m, shape: edit, tile: 'sq' }), b = tileEditorSVG({ ...m, shape: edit, tile: 'sq_b' });
  for (const svg of [a, b]) {
    assert.equal(count(svg, /class="hit"/g), 4);
    assert.equal(count(svg, /class="handle"/g), 1);
    assert.equal(count(svg, /<path d="[^"]*" transform="matrix/g), 8);
  }
  assert.ok(a.includes('data-pid="sq" data-edge="e0" data-index="0"'));
  assert.ok(b.includes('data-pid="sq_b" data-edge="e2" data-index="0"'));
  assert.notEqual(a, b);
  assert.equal(tileEditorSVG({ ...m, shape: edit, tile: 'nope' }), a); // unknown tile falls back to the first
});

test('mode 3, one shape turned to meet itself: editing the right edge shows on the bottom edge of the same tile; neighbours are turned', () => {
  const m = model(square, {}, 'turn-cw'), edit = { generator: 'square', mode: 'turn-cw', edges: { sq: { e1: [[0.3, 0.2]] } } };
  assert.deepEqual(tileChoices(m.sample), [{ id: 'sq', label: 'A' }]);
  const svg = tileEditorSVG({ ...m, shape: edit });
  assert.equal(count(svg, /class="handle"/g), 2);
  assert.ok(svg.includes('data-edge="e1" data-index="0"') && svg.includes('data-edge="e2" data-index="0"'));
  assert.equal(count(svg, /class="handle" data-pid="sq" data-edge="e0"/g) + count(svg, /class="handle" data-pid="sq" data-edge="e3"/g), 0);
  const turned = [...svg.matchAll(/transform="matrix\(([^)]*)\)"/g)].map((x) => x[1].split(' ').map(Number)).filter(([a, , , d]) => Math.abs(a) < 1e-9 && Math.abs(d) < 1e-9);
  assert.ok(turned.length >= 2, 'some neighbours are drawn quarter-turned');
});

test('mode 4, two shapes with quarter turns: A right = B bottom shows on both tiles; the mirror mode swaps the partner', () => {
  const cw = { generator: 'square', mode: 'pair-turn-cw', edges: { sq: { e1: [[0.3, 0.2]] } } };
  const m = model(square, {}, 'pair-turn-cw');
  assert.ok(tileEditorSVG({ ...m, shape: cw, tile: 'sq' }).includes('data-pid="sq" data-edge="e1" data-index="0"'));
  assert.ok(tileEditorSVG({ ...m, shape: cw, tile: 'sq_b' }).includes('data-pid="sq_b" data-edge="e2" data-index="0"'));
  const ccw = { ...cw, mode: 'pair-turn-ccw' }, mc = model(square, {}, 'pair-turn-ccw');
  assert.ok(tileEditorSVG({ ...mc, shape: ccw, tile: 'sq_b' }).includes('data-pid="sq_b" data-edge="e0" data-index="0"'));
});

test('locked edges have no targets: a row shift locks the horizontal edges, twist locks everything', () => {
  const brick = svgOf(square, null, { rowShift: 0.5 });
  assert.equal(count(brick, /class="hit"/g), 2);
  assert.equal(count(brick, /class="edge locked"/g), 2);
  const twisted = svgOf(square, null, { twistMode: 'rows', twistStep: 5 });
  assert.equal(count(twisted, /class="hit"/g), 0);
  assert.equal(count(twisted, /class="edge locked"/g), 4);
});

test('hexagon: six editable edges; triangle (no modes yet): up and down triangles share one shape with half-turn symmetric edges', () => {
  assert.equal(count(svgOf(hexagon, null, { size: 40 }), /class="hit"/g), 6);
  const m = model(triangle, { size: 60 });
  assert.deepEqual(tileChoices(m.sample).map((c) => c.id), ['tri']);
  const edit = { generator: 'triangle', edges: { tri: { e0: [[0.2, 0.2]] } } };
  const svg = tileEditorSVG({ ...m, shape: edit });
  assert.equal(count(svg, /class="hit"/g), 3);
  assert.equal(count(svg, /class="handle"/g), 1);
  assert.equal(count(svg, /class="fixed-pt"/g), 1);
});

test('a symmetric class (one shared shape forced onto triangles): first half draggable, fixed middle, mirrored half derived', () => {
  const p = { ...defaults(triangle.params), size: 100 }, tri = triangle.generate(p, [-400, -400, 400, 400]);
  const one = { ...tri, tiles: tri.tiles.map((t) => ({ ...t, orient: { rot: 0, flip: false } })) };
  const m = { sample: one, classes: edgeClasses(one) };
  const svg = tileEditorSVG({ ...m, shape: { generator: 'triangle', edges: { tri: { e0: [[0.2, 0.2], [0.35, -0.1]] } } } });
  assert.equal(count(svg, /class="hit"/g), 3);
  assert.equal(count(svg, /class="handle"/g), 2);
  assert.equal(count(svg, /class="fixed-pt"/g), 1);
  assert.equal(count(svg, /class="derived-pt"/g), 2);
});

test('editableParams is consistent with canEdit', () => {
  const p = defaults(square.params);
  for (const bad of [{}, { rowShift: 0.5 }, { twistMode: 'rows', twistStep: 4 }, { rowShift: 1, twistMode: 'diagonals', twistStep: -9 }]) {
    const params = { ...p, ...bad }, fix = editableParams('square', params);
    assert.equal(canEdit('square', { ...params, ...fix }).ok, true, JSON.stringify(bad));
    assert.equal(Object.keys(fix).length === 0, canEdit('square', params).ok);
  }
  assert.equal(editableParams('hexagon', {}), null);
});

test('a curved edge is drawn as the curve (C in the edge, hit target and tile outline), with handles on its anchors', () => {
  const curved = { generator: 'square', edges: { sq: { e0: [['M', 0, 0], ['C', 0.2, 0.4, 0.4, 0.4, 0.5, 0.2], ['L', 1, 0]] } } };
  const svg = svgOf(square, curved);
  assert.ok(/class="edge rep" d="M-50 -50C[^"]*L50 -50"/.test(svg));
  assert.ok(/class="hit" data-pid="sq" data-edge="e0" d="M-50 -50C/.test(svg));
  assert.ok(/class="tile" d="M-50 -50C[^"]*Z"/.test(svg));
  assert.equal(count(svg, /class="handle"/g), 1 + 1); // one anchor on the top edge, one on the bottom edge it is glued to
  assert.ok(!/NaN|undefined/.test(svg));
});

// ---- node selection, handles, zoom ------------------------------------------------------------------------------------

const ARCH = [['M', 0, 0], ['C', 0.1, 0.5, 0.4, 0.5, 0.5, 0.2], ['C', 0.6, -0.1, 0.9, -0.1, 1, 0]];
const arch = { generator: 'square', edges: { sq: { e0: ARCH } } };
const els = (svg, cls) => [...svg.matchAll(new RegExp(`<(?:circle|line)[^>]*class="${cls}(?: [^"]*)?"[^>]*>`, 'g'))].map((m) => Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])));
const SEL = { pid: 'sq', eid: 'e0', node: 1 };
const E = (svg) => Number(svg.match(/viewBox="(-?[\d.]+)/)[1]) * -1;

test('every editable edge has a selectable ring just inside each end; the interior nodes carry their node number', () => {
  const svg = svgOf(square, arch);
  const ends = els(svg, 'end-pt');
  assert.equal(ends.length, 8);                                             // 4 edges x 2 ends
  assert.deepEqual(ends.filter((e) => e['data-edge'] === 'e0').map((e) => e['data-node']), ['0', '2']);
  const first = ends.find((e) => e['data-edge'] === 'e0' && e['data-node'] === '0');
  assert.ok(Number(first.cx) > -50 && Number(first.cx) < -35 && Math.abs(Number(first.cy) + 50) < 40);   // inside the edge, near its start corner (-50,-50)
  assert.deepEqual(els(svg, 'handle').filter((h) => h['data-edge'] === 'e0').map((h) => [h['data-index'], h['data-node']]), [['0', '1']]);
});

test('nothing selected: no arms or handles; a selected node is marked and shows an arm and a handle on each side', () => {
  const none = svgOf(square, arch);
  assert.equal(els(none, 'arm').length + els(none, 'ctl').length, 0);
  const svg = tileEditorSVG({ ...model(square), shape: arch, selected: SEL });
  assert.deepEqual(els(svg, 'handle selected').map((h) => h['data-edge']).sort(), ['e0', 'e2']);   // the glued bottom edge shows the same node
  const top = els(svg, 'ctl').filter((c) => c['data-edge'] === 'e0');
  assert.deepEqual(top.map((c) => c['data-role']).sort(), ['in', 'out']);
  assert.deepEqual(top.map((c) => [c.cx, c.cy]).sort(), [['-10', '-100'], ['10', '-40']].sort());     // stored (0.4,0.5) and (0.6,-0.1) mapped into the tile
  assert.ok(top.every((c) => !c.class.includes('virtual')));
  assert.equal(els(svg, 'arm').length, 4);                                  // two per displayed member
});

test('a reversed member (the glued bottom edge) shows the same handles with their stored roles', () => {
  const svg = tileEditorSVG({ ...model(square), shape: arch, selected: SEL });
  const bottom = els(svg, 'ctl').filter((c) => c['data-edge'] === 'e2');
  assert.equal(bottom.length, 2);
  // the bottom edge is the top edge moved down a tile and walked backwards: stored 'in' (-10,-100) lands at (-10,0), 'out' (10,-40) at (10,60)
  const at = (role) => { const c = bottom.find((x) => x['data-role'] === role); return `${c.cx},${c.cy}`; };
  assert.equal(at('in'), '-10,0'); assert.equal(at('out'), '10,60');
  assert.ok(bottom.every((c) => c['data-node'] === '1'));
});

test('a node between plain lines shows virtual handles a third of the way along each segment; the ends show one', () => {
  const bump = { generator: 'square', edges: { sq: { e0: [['M', 0, 0], ['L', 0.5, 0.3], ['L', 1, 0]] } } };
  const mid = els(tileEditorSVG({ ...model(square), shape: bump, selected: SEL }), 'ctl').filter((c) => c['data-edge'] === 'e0');
  assert.equal(mid.length, 2); assert.ok(mid.every((c) => c.class.includes('virtual')));
  const start = els(tileEditorSVG({ ...model(square), shape: bump, selected: { ...SEL, node: 0 } }), 'ctl').filter((c) => c['data-edge'] === 'e0');
  assert.equal(start.length, 1); assert.equal(start[0]['data-role'], 'out');
  const end = els(tileEditorSVG({ ...model(square), shape: bump, selected: { ...SEL, node: 2 } }), 'ctl').filter((c) => c['data-edge'] === 'e0');
  assert.deepEqual(end.map((c) => c['data-role']), ['in']);
});

test('zoom: a handle outside the view widens it just enough; a smaller minE never zooms in; a handle inside changes nothing', () => {
  const plain = E(svgOf(square, arch)), shallow = { generator: 'square', edges: { sq: { e0: [['M', 0, 0], ['C', 0.1, 0.2, 0.4, 0.2, 0.5, 0.1], ['L', 1, 0]] } } };
  assert.equal(E(tileEditorSVG({ ...model(square), shape: shallow, selected: SEL })), plain);                   // handles inside the view: no change
  assert.ok(E(tileEditorSVG({ ...model(square), shape: arch, selected: SEL })) > plain);                         // the arch's handle sits at y = -100, past the default margin
  const far = { generator: 'square', edges: { sq: { e0: [['M', 0, 0], ['C', 0.1, 1.9, 0.4, 1.9, 0.5, 0.2], ['L', 1, 0]] } } };   // control point 1.9 edge-lengths out: y = -240
  const zoomed = E(tileEditorSVG({ ...model(square), shape: far, selected: SEL }));
  assert.ok(zoomed > plain && zoomed > 240 && zoomed < 240 * 1.1, `${plain} -> ${zoomed}`);
  const noSel = E(tileEditorSVG({ ...model(square), shape: far }));
  assert.equal(noSel, plain);                                                // nothing selected: back to the normal view
  assert.equal(E(tileEditorSVG({ ...model(square), shape: shallow, selected: SEL, minE: zoomed })), zoomed);
  assert.equal(E(tileEditorSVG({ ...model(square), shape: shallow, selected: SEL, minE: 1 })), plain);
});

test('symmetric edge: the middle node is selectable and shows its in handle only; the other half has no controls', () => {
  const tri = model(triangle), shapeT = { generator: 'triangle', edges: { tri: { e0: [['M', 0, 0], ['C', 0.1, 0.3, 0.3, 0.3, 0.5, 0]] } } };
  const svg = tileEditorSVG({ ...tri, shape: shapeT, selected: { pid: 'tri', eid: 'e0', node: 1 } });
  const fixed = els(svg, 'fixed-pt selected');
  assert.equal(fixed.length, 1); assert.equal(fixed[0]['data-node'], '1');
  const c = els(svg, 'ctl');
  assert.deepEqual(c.map((x) => x['data-role']), ['in']);
  assert.equal(els(svg, 'arm').length, 1);
  const first = els(tileEditorSVG({ ...tri, shape: shapeT, selected: { pid: 'tri', eid: 'e0', node: 0 } }), 'ctl');
  assert.deepEqual(first.map((x) => x['data-role']), ['out']);
});

test('a selection that no longer exists (a node number past the end, an unknown edge) draws nothing extra and does not throw', () => {
  for (const selected of [{ ...SEL, node: 9 }, { ...SEL, node: -1 }, { pid: 'zz', eid: 'e0', node: 0 }, { pid: 'sq', eid: 'e9', node: 0 }]) {
    const svg = tileEditorSVG({ ...model(square), shape: arch, selected });
    assert.equal(els(svg, 'ctl').length + els(svg, 'arm').length, 0); assert.ok(!/NaN|undefined/.test(svg));
  }
});
