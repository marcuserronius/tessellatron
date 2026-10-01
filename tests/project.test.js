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

test('registry lists the 3 regular and 8 Archimedean tilings', () => assert.equal(list().length, 11));

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
