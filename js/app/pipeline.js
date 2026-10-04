/**
 * State -> IR -> SVG, shared by the preview, export, the shape editor and tests (pure, no DOM; generators must
 * already be registered, see generators/index.js).
 *   generateIR(state, region)  generator output only
 *   editorModel(state)         { sample, classes, mode }: a patch of tiles around the origin (about eight tile sizes
 *                              across), re-tiled for the shape's tiling mode (editor/modes.js: tile shapes and turns), and
 *                              its edge classes (editor/classes.js). They depend only on the generator, its params and the
 *                              shape's mode, never on the shape's edits, so the last result is cached.
 *   buildIR(state, region)     generateIR, with the edge shape applied when state.shape belongs to this generator
 *                              (the IR is then re-tiled for the shape's mode: one prototile per tile shape, tiles turned;
 *                              the Orientation setting no longer applies)
 *   buildSVG(state)            standalone SVG for the whole canvas ([0, 0, view.width, view.height])
 * state = { generator, params, style, view, shape? }.
 */
import { get } from '../generators/registry.js';
import { applyShape } from '../editor/shape.js';
import { edgeClasses } from '../editor/classes.js';
import { DEFAULT_MODE, retile } from '../editor/modes.js';
import { renderSVG } from '../render/svg.js';

export const generateIR = (state, region) => get(state.generator).generate(state.params, region);

let memo = { key: null, model: null };
export function editorModel(state) {
  const mode = state.shape?.generator === state.generator ? state.shape.mode ?? DEFAULT_MODE : DEFAULT_MODE;
  const key = JSON.stringify([state.generator, state.params, mode]);
  if (memo.key !== key) {
    const k = 4 * (state.params.size ?? 60), sample = retile(generateIR(state, [-k, -k, k, k]), mode);
    memo = { key, model: { sample, classes: edgeClasses(sample), mode } };
  }
  return memo.model;
}

export function buildIR(state, region) {
  const ir = generateIR(state, region);
  return state.shape?.generator === state.generator ? applyShape(ir, state.shape, editorModel(state).classes) : ir;
}

export function buildSVG(state) {
  const { style, view } = state;
  return renderSVG(buildIR(state, [0, 0, view.width, view.height]), style, view, { flatten: view.flatten, precision: view.precision });
}
