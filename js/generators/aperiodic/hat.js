/**
 * Einstein tiling: the "hat" aperiodic monotile (Smith, Myers, Kaplan & Goodman-Strauss, 2023).
 * Contract: generate(params, region) -> TilingIR (see ir/schema.js).
 *  - One prototile "hat" (13 edges of length size, √3·size or 2·size, where params.size is the short edge), centred on the
 *    vertex centroid of its outline, edges clockwise on screen. Each hat is a rigid placement of it;
 *    the 1-in-7 or so "reflected" hats (one per H metatile) are mirror images, with orient.flip = true.
 *  - The tiling is the hat substitution system (./hat-subst.js): a fixed level-9 supertile of type
 *    params.seed, centred on the world origin, then rotated about the origin by `rotation` and
 *    shifted by (originX, originY). The level is fixed, not chosen from the region, so resizing the
 *    canvas never changes the tiling. Level 9 reaches 3000+ hat-space units from the origin, further
 *    than any canvas, size and offset the param ranges allow.
 *  - region = [x0,y0,x1,y1] in world coords: emits the hats whose bounding box meets it.
 *  - orient.rot = the hat's rotation in 60° steps (0-5) relative to the seed supertile, counter-clockwise
 *    on screen, before the user's `rotation`. Reflected hats have the same rot convention. rot and flip
 *    come from the integer lattice placement hat-subst.js snaps every hat to, not from rounding floats,
 *    so at rotation 0 the tiles' linear parts take only 12 distinct values (6 rotations x 2 reflections).
 *  - tags: cls 0 reflected hat, 1 hat of an H metatile, 2 hat of a T, P or F metatile; label = H1|H|T|P|F
 *    (the metatile the hat sits in, H1 being the reflected one).
 *  - Edges carry no `pair`: hat edges pair with several different partners in different places.
 */
import { multiply, translate, rotate, invert, apply } from '../../core/affine.js';
import { signedArea } from '../../core/polygon.js';
import { originParams } from '../periodic/lattice.js';
import { buildSupertile, collectHats, HAT_OUTLINE } from './hat-subst.js';

export const id = 'hat';
export const name = 'Hat monotile (Einstein)';
export const params = [
  { id: 'size', label: 'Short edge length', type: 'number', default: 12, min: 5, max: 200, step: 1, group: 'Tiling' },
  { id: 'rotation', label: 'Tiling rotation (°)', type: 'number', default: 0, min: -180, max: 180, step: 1, group: 'Tiling' },
  { id: 'seed', label: 'Seed supertile', type: 'select', default: 'H', group: 'Tiling',
    options: [['H', 'H (hexagon)'], ['T', 'T (triangle)'], ['P', 'P (parallelogram)'], ['F', 'F (pentagon)']] },
  ...originParams,
];

export const presets = [
  { id: 'reflected', name: 'Highlight reflected hats', style: { fillMode: 'classes' } },
  { id: 'by-orientation', name: 'Colour by orientation', style: { fillMode: 'orient' } },
  { id: 'outline', name: 'Outline only', style: { fillMode: 'none' } },
];

const LEVEL = 9;
const CLS = { H1: 0, H: 1, T: 2, P: 2, F: 2 };
const cx = HAT_OUTLINE.reduce((a, p) => a + p[0], 0) / HAT_OUTLINE.length;
const cy = HAT_OUTLINE.reduce((a, p) => a + p[1], 0) / HAT_OUTLINE.length;

/** The hat's outline in local screen coords (y down), centred on its vertex centroid, clockwise. */
function prototile(s) {
  let V = HAT_OUTLINE.map(([x, y]) => [s * (x - cx), -s * (y - cy)]);
  if (signedArea(V) < 0) V = V.reverse();
  return {
    center: [0, 0], rotUnits: 6,
    edges: V.map((a, k) => ({ id: `e${k}`, path: [['M', ...a], ['L', ...V[(k + 1) % V.length]]] })),
  };
}

export function generate(p, region) {
  const s = p.size;
  // hat space (y up, short edge 1/2 once a hat's own 1/2 scale is applied) -> world
  const toWorld = multiply(translate(p.originX, p.originY), multiply(rotate(p.rotation), [2 * s, 0, 0, -2 * s, 0, 0]));
  const [x0, y0, x1, y1] = region;
  const back = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map((q) => apply(invert(toWorld), q));
  const box = [0, 1].flatMap((k) => [Math.min(...back.map((q) => q[k])), Math.max(...back.map((q) => q[k]))]);
  const wantBox = [box[0], box[2], box[1], box[3]];

  const local = invert([s, 0, 0, -s, -s * cx, s * cy]); // hat space -> prototile local coords, inverted
  const tiles = [];
  for (const { M, label, rot, flip } of collectHats(buildSupertile(LEVEL, p.seed), [1, 0, 0, 0, 1, 0], wantBox)) {
    const hatToWorld = multiply(toWorld, [M[0], M[3], M[1], M[4], M[2], M[5]]);
    const pts = HAT_OUTLINE.map((v) => apply(hatToWorld, v));
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    if (Math.max(...xs) < x0 || Math.min(...xs) > x1 || Math.max(...ys) < y0 || Math.min(...ys) > y1) continue;
    tiles.push({
      proto: 'hat',
      transform: multiply(hatToWorld, local),
      orient: { rot, flip },
      tags: { cls: CLS[label], label },
    });
  }
  return { prototiles: { hat: prototile(s) }, tiles, meta: { generator: id, params: p, bounds: region } };
}
