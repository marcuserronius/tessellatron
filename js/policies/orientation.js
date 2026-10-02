/**
 * Orientation policy: extra per-tile turns that map the prototile onto itself.
 * Geometry is unchanged, but each tile's edge labels move, which is what Escher-style
 * edge editing needs. Turns are multiples of 360/order degrees.
 *  - order:    rotational symmetry order of the prototile (square 4, triangle 3, hexagon 6)
 *  - rotUnits: steps per full turn used by orient.rot (see Prototile.rotUnits in ir/schema.js)
 * Uses tile tags i, j (set by latticeTiles).
 *
 * Twist (applyTwist) is the other kind of policy: a continuous extra rotation per row, column or
 * diagonal (angle = index * step), about the tile centre or its first vertex. It changes geometry, so
 * tiles stop fitting; it lives in `transform` only and leaves orient.rot untouched.
 */
import { multiply, rotate, apply } from '../core/affine.js';

const mod = (a, n) => ((a % n) + n) % n;

export const orientParam = {
  id: 'orientMode', label: 'Tile orientation', type: 'select', default: 'none', group: 'Tiling',
  options: [['none', 'All the same'], ['checker', 'Alternate symmetric turns'],
            ['rows', 'Turn per row'], ['cycle', 'Cycle along diagonals']],
};

const index = {
  none: () => 0,
  checker: (i, j) => mod(i + j, 2),
  rows: (i, j, n) => mod(j, n),
  cycle: (i, j, n) => mod(i + j, n),
};

export function applyOrientation(tiles, mode, { order, rotUnits }) {
  const k = index[mode] ?? index.none, unit = rotUnits / order;
  return tiles.map((t) => {
    const q = k(t.tags.i, t.tags.j, order) * unit;
    if (!q) return t;
    return {
      ...t,
      transform: multiply(t.transform, rotate((q * 360) / rotUnits)),
      orient: { ...t.orient, rot: mod(t.orient.rot + q, rotUnits) },
    };
  });
}

export const twistParams = [
  { id: 'twistMode', label: 'Twist', type: 'select', default: 'none', group: 'Twist',
    options: [['none', 'None'], ['rows', 'Per row'], ['columns', 'Per column'], ['diagonals', 'Per diagonal']] },
  { id: 'twistStep', label: 'Step (°)', type: 'number', default: 5, min: -90, max: 90, step: 0.5, group: 'Twist' },
  { id: 'twistPivot', label: 'Rotate about', type: 'select', default: 'centre', group: 'Twist',
    options: [['centre', 'Tile centre'], ['vertex', 'First vertex']] },
];

const twistIndex = { rows: (i, j) => j, columns: (i) => i, diagonals: (i, j) => i + j };

/** tiles + params {twistMode, twistStep, twistPivot} + IR prototiles -> new tiles. Uses tags i, j. */
export function applyTwist(tiles, { twistMode = 'none', twistStep = 0, twistPivot = 'centre' } = {}, prototiles) {
  const k = twistIndex[twistMode];
  if (!k || !twistStep) return tiles;
  return tiles.map((t) => {
    const angle = k(t.tags.i, t.tags.j) * twistStep;
    if (!angle) return t;
    const proto = prototiles[t.proto];
    const [px, py] = apply(t.transform, twistPivot === 'vertex' ? proto.edges[0].path[0].slice(1) : proto.center);
    return { ...t, transform: multiply(rotate(angle, px, py), t.transform) };
  });
}
