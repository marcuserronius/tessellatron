/**
 * Orientation policy: extra per-tile turns that map the prototile onto itself.
 * Geometry is unchanged, but each tile's edge labels move, which is what Escher-style
 * edge editing needs. Turns are multiples of 360/order degrees.
 *  - order:    rotational symmetry order of the prototile (square 4, triangle 3, hexagon 6)
 *  - rotUnits: steps per full turn used by orient.rot (see Prototile.rotUnits in ir/schema.js)
 * Uses tile tags i, j (set by latticeTiles).
 */
import { multiply, rotate } from '../core/affine.js';

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
