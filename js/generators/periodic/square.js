/**
 * Square tiling generator.
 * Contract: generate(params, region) -> TilingIR (see ir/schema.js).
 *  - region = [x0,y0,x1,y1] in world coords; emits tiles whose bounding circle touches it.
 *  - Prototile "sq" is a size x size square centred on the local origin, so each tile's
 *    transform is just translate(center) * rotate(angle). Rotation index k lives in orient.rot.
 *  - Lattice is anchored at the world origin and rotated about it by `rotation`.
 */
import { multiply, translate, rotate, apply, invert } from '../../core/affine.js';

export const id = 'square';
export const name = 'Square';
export const params = [
  { id: 'size', label: 'Tile size', type: 'number', default: 60, min: 5, max: 400, step: 1, group: 'Tiling' },
  { id: 'rotation', label: 'Tiling rotation (°)', type: 'number', default: 0, min: -180, max: 180, step: 1, group: 'Tiling' },
  { id: 'rowShift', label: 'Row shift (× size)', type: 'number', default: 0, min: 0, max: 1, step: 0.05, group: 'Tiling' },
  { id: 'orientMode', label: 'Tile orientation', type: 'select', default: 'none', group: 'Tiling',
    options: [['none', 'All the same'], ['checker', 'Checkerboard quarter-turn'],
              ['rows', 'Rotate per row'], ['cycle', 'Rotate along diagonals']] },
];

export const presets = [
  { id: 'brick', name: 'Brick bond', params: { rowShift: 0.5 } },
  { id: 'checker-turns', name: 'Checkerboard quarter-turns', params: { orientMode: 'checker' }, style: { fillMode: 'orient' } },
  { id: 'pinwheel', name: 'Diagonal pinwheel', params: { orientMode: 'cycle' }, style: { fillMode: 'orient' } },
];

const mod = (a, n) => ((a % n) + n) % n;
const orientIndex = { none: () => 0, checker: (i, j) => mod(i + j, 2), rows: (i, j) => mod(j, 4), cycle: (i, j) => mod(i + j, 4) };

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
  const { size: s, rotation, rowShift, orientMode } = p;
  const margin = (s / 2) * Math.SQRT2;
  const [x0, y0, x1, y1] = region;
  const inv = invert(rotate(rotation));
  const local = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map((q) => apply(inv, q));
  const xs = local.map((q) => q[0]), ys = local.map((q) => q[1]);
  const lo = (v) => Math.floor((v - margin) / s) - 1, hi = (v) => Math.ceil((v + margin) / s) + 1;
  const R = rotate(rotation), tiles = [], k = orientIndex[orientMode] ?? orientIndex.none;

  for (let j = lo(Math.min(...ys)); j <= hi(Math.max(...ys)); j++) {
    const shift = mod(j, 2) * rowShift * s;
    for (let i = lo(Math.min(...xs)) - 1; i <= hi(Math.max(...xs)) + 1; i++) {
      const [cx, cy] = apply(R, [i * s + shift, j * s]);
      if (cx < x0 - margin || cx > x1 + margin || cy < y0 - margin || cy > y1 + margin) continue;
      const rot = k(i, j);
      tiles.push({
        proto: 'sq',
        transform: multiply(translate(cx, cy), rotate(rotation + rot * 90)),
        orient: { rot, flip: false },
        tags: { i, j },
      });
    }
  }
  return { prototiles: { sq: prototile(s) }, tiles, meta: { generator: id, params: p, bounds: region } };
}
