import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, viewParams } from '../js/params/schema.js';
import { styleParams } from '../js/style/colorings.js';
import { sanitize, serializeProject, parseProject } from '../js/params/serialize.js';
import { listPresets, applyPreset } from '../js/params/presets.js';
import '../js/generators/index.js';
import { get, list } from '../js/generators/registry.js';

const schemas = { generator: get, style: styleParams, view: viewParams };
const stateFor = (g) => ({ generator: g.id, params: defaults(g.params), style: defaults(styleParams), view: defaults(viewParams) });

test('registry lists the 3 regular, 8 Archimedean and the Penrose generators', () => assert.equal(list().length, 12));

test('every generator round-trips through save/load unchanged', () => {
  for (const g of list()) {
    const state = { ...stateFor(g), style: { ...defaults(styleParams), fill2: '#123abc', strokeWidth: 3 } };
    const { state: back, warnings } = parseProject(serializeProject(state), schemas);
    assert.deepEqual(back, state);
    assert.deepEqual(warnings, []);
  }
});

test('loading sanitises: clamps numbers, rejects bad types/options/colours, drops unknown keys', () => {
  const doc = JSON.parse(serializeProject(stateFor(get('square'))));
  Object.assign(doc.params, { size: 99999, rotation: 'ten', orientMode: 'bogus', extra: 1 });
  doc.style.fill1 = 'red'; doc.view.flatten = 'yes';
  const { state, warnings } = parseProject(JSON.stringify(doc), schemas);
  assert.equal(state.params.size, 400);
  assert.equal(state.params.rotation, 0);
  assert.equal(state.params.orientMode, 'none');
  assert.ok(!('extra' in state.params));
  assert.equal(state.style.fill1, defaults(styleParams).fill1);
  assert.equal(state.view.flatten, false);
  assert.equal(warnings.length, 5);
});

test('loading rejects unusable files with readable errors', () => {
  const ok = JSON.parse(serializeProject(stateFor(get('square'))));
  assert.throws(() => parseProject('{nope', schemas), /valid JSON/);
  assert.throws(() => parseProject('{"a":1}', schemas), /Tessellatron project/);
  assert.throws(() => parseProject(JSON.stringify({ ...ok, version: 99 }), schemas), /version/);
  assert.throws(() => parseProject(JSON.stringify({ ...ok, generator: 'nope' }), schemas), /Unknown generator/);
});

test('sanitize fills missing values with defaults', () => {
  assert.deepEqual(sanitize(viewParams, {}).values, defaults(viewParams));
});

test('presets: defaults reset params, preset params/style layer on top', () => {
  const g = get('square'), state = { ...stateFor(g), params: { ...defaults(g.params), size: 99 }, style: { ...defaults(styleParams), fill1: '#000000' } };
  const [reset, ...rest] = listPresets(g);
  assert.equal(reset.id, 'default');
  assert.deepEqual(applyPreset(g, reset, state).params, defaults(g.params));
  assert.equal(applyPreset(g, reset, state).style.fill1, '#000000');
  const brick = rest.find((p) => p.id === 'brick'), patch = applyPreset(g, brick, state);
  assert.equal(patch.params.rowShift, 0.5);
  assert.equal(patch.params.size, defaults(g.params).size);
});

test('every shipped preset only references real params and valid values', () => {
  for (const g of list()) for (const p of g.presets ?? []) {
    const merged = { ...defaults(g.params), ...p.params };
    assert.deepEqual(sanitize(g.params, merged).warnings, [], `${g.id}/${p.id}`);
    assert.deepEqual(sanitize(styleParams, { ...defaults(styleParams), ...p.style }).warnings, [], `${g.id}/${p.id} style`);
    for (const k of Object.keys(p.params ?? {})) assert.ok(g.params.some((q) => q.id === k), `${g.id}/${p.id}: unknown param ${k}`);
  }
});

import { toHash, fromHash } from '../js/params/serialize.js';

const nonDefaultState = (g) => {
  const flip = (schema) => Object.fromEntries(schema.map((p) => [p.id,
    p.type === 'boolean' ? !p.default : p.type === 'select' ? p.options.at(-1)[0] : p.type === 'color' ? '#0a0b0c'
      : p.type === 'number' ? Math.min(p.max, Math.max(p.min, p.default + p.step * 3)) : p.default]));
  return { generator: g.id, params: flip(g.params), style: flip(styleParams), view: flip(viewParams) };
};

test('URL hash: defaults encode to just the generator', () => {
  assert.equal(toHash(stateFor(get('square')), schemas), 'g=square');
});

test('URL hash: only non-default values are written; every generator round-trips', () => {
  for (const g of list()) {
    const state = nonDefaultState(g), h = toHash(state, schemas);
    assert.ok(h.startsWith(`g=${g.id}&`));
    const { state: back, warnings } = fromHash(`#${h}`, schemas);
    assert.deepEqual(back, state, g.id);
    assert.deepEqual(warnings, []);
  }
});

test('URL hash: bad values fall back to defaults with warnings; unknown generator throws', () => {
  const { state, warnings } = fromHash('g=square&p.size=abc&p.rowShift=9&s.fill1=red&v.flatten=maybe&p.nope=1', schemas);
  assert.equal(state.params.size, defaults(get('square').params).size);
  assert.equal(state.params.rowShift, 1);
  assert.equal(state.style.fill1, defaults(styleParams).fill1);
  assert.equal(state.view.flatten, false);
  assert.equal(warnings.length, 4);
  assert.throws(() => fromHash('g=nope', schemas), /Unknown generator/);
  assert.throws(() => fromHash('', schemas), /Unknown generator/);
});
