/**
 * Lattice + motif enumeration for periodic tilings (pure, no DOM).
 *
 * latticeTiles({ basis, motif, rotation, region, radius }) -> Tile[]
 *  - basis  [[ax,ay],[bx,by]]: lattice vectors in the unrotated local frame.
 *  - motif  tiles in the fundamental cell:
 *           { proto, offset:[x,y], angle:deg, rot:int, tags? }
 *           `offset` is the tile CENTRE relative to the cell origin; `rot` -> orient.rot.
 *  - rotation: whole-tiling rotation (deg) about the world origin.
 *  - region [x0,y0,x1,y1] and radius (prototile circumradius) bound what is emitted.
 * Tile centre = R * (i*a + j*b + offset); transform = translate(centre) * rotate(rotation+angle).
 * Prototiles must be centred on their local origin. tags always include {i, j, m (motif index)}.
 */
import { multiply, translate, rotate, apply, invert } from '../../core/affine.js';

export function latticeTiles({ basis: [[ax, ay], [bx, by]], motif, rotation = 0, region, radius }) {
  const [x0, y0, x1, y1] = region;
  const R = rotate(rotation), inv = invert(R), Binv = invert([ax, ay, bx, by, 0, 0]);
  const pad = radius + Math.max(...motif.map((m) => Math.hypot(...m.offset)));
  const ij = [[x0 - pad, y0 - pad], [x1 + pad, y0 - pad], [x1 + pad, y1 + pad], [x0 - pad, y1 + pad]]
    .map((q) => apply(Binv, apply(inv, q)));
  const is = ij.map((q) => q[0]), js = ij.map((q) => q[1]);
  const tiles = [];
  for (let j = Math.floor(Math.min(...js)) - 1; j <= Math.ceil(Math.max(...js)) + 1; j++) {
    for (let i = Math.floor(Math.min(...is)) - 1; i <= Math.ceil(Math.max(...is)) + 1; i++) {
      motif.forEach((m, k) => {
        const [cx, cy] = apply(R, [i * ax + j * bx + m.offset[0], i * ay + j * by + m.offset[1]]);
        if (cx < x0 - radius || cx > x1 + radius || cy < y0 - radius || cy > y1 + radius) return;
        tiles.push({
          proto: m.proto,
          transform: multiply(translate(cx, cy), rotate(rotation + m.angle)),
          orient: { rot: m.rot, flip: false },
          tags: { i, j, m: k, ...m.tags },
        });
      });
    }
  }
  return tiles;
}
