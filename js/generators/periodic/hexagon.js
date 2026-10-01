/**
 * Regular hexagon tiling (pointy-top; one tile per cell). Prototile "hex" centred at origin,
 * edge n pairs with opposite edge n+3 by translation (same-tile frame, like the square).
 * Tags: cls = (i - j) mod 3, a proper 3-colouring.
 */
import { translate } from '../../core/affine.js';
import { latticeTiles } from './lattice.js';
import { orientParam, applyOrientation } from '../../policies/orientation.js';

export const id = 'hexagon';
export const name = 'Hexagon';
export const params = [
  { id: 'size', label: 'Side length', type: 'number', default: 40, min: 5, max: 300, step: 1, group: 'Tiling' },
  { id: 'rotation', label: 'Tiling rotation (°)', type: 'number', default: 0, min: -180, max: 180, step: 1, group: 'Tiling' },
  orientParam,
];

const K = Math.sqrt(3);
const mod = (a, n) => ((a % n) + n) % n;
const rad = (d) => (d * Math.PI) / 180;

function prototile(s) {
  const V = [0, 1, 2, 3, 4, 5].map((k) => [s * Math.cos(rad(-90 + 60 * k)), s * Math.sin(rad(-90 + 60 * k))]);
  return {
    center: [0, 0], rotUnits: 6,
    edges: V.map((a, n) => {
      const phi = rad(-60 + 60 * n); // outward normal of edge n
      return {
        id: `e${n}`, path: [['M', ...a], ['L', ...V[(n + 1) % 6]]],
        pair: { edge: `e${(n + 3) % 6}`, transform: translate(-K * s * Math.cos(phi), -K * s * Math.sin(phi)) },
      };
    }),
  };
}

export function generate(p, region) {
  const s = p.size;
  const tiles = latticeTiles({
    basis: [[K * s, 0], [(K * s) / 2, 1.5 * s]],
    motif: [{ proto: 'hex', offset: [0, 0], angle: 0, rot: 0 }],
    rotation: p.rotation, region, radius: s,
  }).map((t) => ({ ...t, tags: { ...t.tags, cls: mod(t.tags.i - t.tags.j, 3) } }));
  return {
    prototiles: { hex: prototile(s) },
    tiles: applyOrientation(tiles, p.orientMode, { order: 6, rotUnits: 6 }),
    meta: { generator: id, params: p, bounds: region },
  };
}
