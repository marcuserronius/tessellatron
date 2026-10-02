/**
 * Square tiling generator (lattice + motif, like the other periodic generators).
 * Contract: generate(params, region) -> TilingIR (see ir/schema.js).
 *  - region = [x0,y0,x1,y1] in world coords; emits tiles whose bounding circle touches it.
 *  - Prototile "sq" is a size x size square centred on the local origin.
 *  - One cell is two rows (basis [s,0] x [0,2s]) so alternate rows can shift by rowShift*size:
 *    the motif has a tile at (0,0) and one at (rowShift*s, s). Tags i, j are the column and the
 *    absolute ROW index (j = 2*cellRow + motifIndex), which is what the orientation policy expects.
 *  - Lattice is anchored at the world origin (plus `origin`) and rotated about it by `rotation`.
 */
import { translate } from '../../core/affine.js';
import { latticeTiles, originParams } from './lattice.js';
import { orientParam, applyOrientation, twistParams, applyTwist } from '../../policies/orientation.js';

export const id = 'square';
export const name = 'Square';
export const params = [
  { id: 'size', label: 'Tile size', type: 'number', default: 60, min: 5, max: 400, step: 1, group: 'Tiling' },
  { id: 'rotation', label: 'Tiling rotation (°)', type: 'number', default: 0, min: -180, max: 180, step: 1, group: 'Tiling' },
  { id: 'rowShift', label: 'Row shift (× size)', type: 'number', default: 0, min: 0, max: 1, step: 0.05, group: 'Tiling' },
  { ...orientParam, options: [['none', 'All the same'], ['checker', 'Checkerboard quarter-turn'],
                              ['rows', 'Rotate per row'], ['cycle', 'Rotate along diagonals']] },
  ...originParams,
  ...twistParams,
];

export const presets = [
  { id: 'brick', name: 'Brick bond', params: { rowShift: 0.5 } },
  { id: 'checker-turns', name: 'Checkerboard quarter-turns', params: { orientMode: 'checker' }, style: { fillMode: 'orient' } },
  { id: 'pinwheel', name: 'Diagonal pinwheel', params: { orientMode: 'cycle' }, style: { fillMode: 'orient' } },
];

function prototile(s) {
  const h = s / 2, P = [[-h, -h], [h, -h], [h, h], [-h, h]]; // clockwise on screen (y down)
  const partner = [[2, [0, s]], [3, [-s, 0]], [0, [0, -s]], [1, [s, 0]]]; // top<->bottom, right<->left
  return {
    center: [0, 0], rotUnits: 4,
    edges: P.map((a, n) => ({
      id: `e${n}`,
      path: [['M', ...a], ['L', ...P[(n + 1) % 4]]],
      pair: { edge: `e${partner[n][0]}`, transform: translate(...partner[n][1]) },
    })),
  };
}

export function generate(p, region) {
  const s = p.size;
  const tiles = latticeTiles({
    basis: [[s, 0], [0, 2 * s]],
    motif: [{ proto: 'sq', offset: [0, 0], angle: 0, rot: 0 }, { proto: 'sq', offset: [p.rowShift * s, s], angle: 0, rot: 0 }],
    rotation: p.rotation, origin: [p.originX, p.originY], region, radius: s * Math.SQRT1_2,
  }).map((t) => ({ ...t, tags: { ...t.tags, j: 2 * t.tags.j + t.tags.m } }));
  const prototiles = { sq: prototile(s) };
  return {
    prototiles,
    tiles: applyTwist(applyOrientation(tiles, p.orientMode, { order: 4, rotUnits: 4 }), p, prototiles),
    meta: { generator: id, params: p, bounds: region },
  };
}
