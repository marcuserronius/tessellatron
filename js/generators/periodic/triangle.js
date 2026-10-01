/**
 * Equilateral triangle tiling (lattice + motif: one up and one down triangle per cell).
 * One prototile "tri" (apex up, centroid at origin); down triangles are its 180° rotation
 * (orient.rot 3 in 60° units). Each edge pairs with ITSELF via a half-turn about its midpoint,
 * the symmetry relating neighbouring triangles (edges must be half-turn symmetric when edited).
 * Tags: cls = 0 (up) / 1 (down).
 */
import { rotate } from '../../core/affine.js';
import { latticeTiles } from './lattice.js';
import { orientParam, applyOrientation } from '../../policies/orientation.js';

export const id = 'triangle';
export const name = 'Triangle';
export const params = [
  { id: 'size', label: 'Side length', type: 'number', default: 60, min: 5, max: 400, step: 1, group: 'Tiling' },
  { id: 'rotation', label: 'Tiling rotation (°)', type: 'number', default: 0, min: -180, max: 180, step: 1, group: 'Tiling' },
  orientParam,
];

const K = Math.sqrt(3);

function prototile(s) {
  const R = s / K, r = R / 2, V = [[0, -R], [s / 2, r], [-s / 2, r]]; // clockwise on screen
  return {
    center: [0, 0], rotUnits: 6,
    edges: V.map((a, n) => {
      const b = V[(n + 1) % 3];
      return {
        id: `e${n}`, path: [['M', ...a], ['L', ...b]],
        pair: { edge: `e${n}`, transform: rotate(180, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2) },
      };
    }),
  };
}

export function generate(p, region) {
  const s = p.size, h = (s * K) / 2;
  const tiles = latticeTiles({
    basis: [[s, 0], [s / 2, h]],
    motif: [
      { proto: 'tri', offset: [s / 2, h / 3], angle: 180, rot: 3, tags: { cls: 1 } },
      { proto: 'tri', offset: [s, (2 * h) / 3], angle: 0, rot: 0, tags: { cls: 0 } },
    ],
    rotation: p.rotation, region, radius: s / K,
  });
  return {
    prototiles: { tri: prototile(s) },
    tiles: applyOrientation(tiles, p.orientMode, { order: 3, rotUnits: 6 }),
    meta: { generator: id, params: p, bounds: region },
  };
}
