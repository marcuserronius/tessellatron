/**
 * Penrose tilings P1, P2 and P3 from ONE exact Robinson-triangle patch.
 * Contract: generate(params, region) -> TilingIR (see ir/schema.js).
 *  - The patch is the 5-fold "sun" patch centred on (originX, originY), rotated by `rotation` about it.
 *    Switching `tileSet` regroups the same triangulation (tilesets.js, p1.js) so the pattern, centre
 *    and edge length stay put. Depth and seed size are derived from the region, and pruned to it, so
 *    the tiling itself never depends on the region or the zoom.
 *  - Edge length `size`: P3 rhomb edge, P2 long edge (short edge = size/φ), P1 tile edge.
 *  - Prototiles are centred on their local origin and have mirror symmetry about local +x:
 *    thin/thick rhomb (axis = the diagonal joining the corners of vertex class a and a+2), kite/dart (axis points at the 72° tip),
 *    pentagon (vertex 0 on +x), diamond/boat/star (canonical edge-direction sequences in p1.js).
 *    orient.rot (0..9, rotUnits 10) is the axis direction in 36° steps in the pattern frame; the
 *    exact angle is rot*36 + rotation, in `transform`. No tile is ever mirrored (orient.flip = false).
 *  - Edges carry no `pair` yet: Penrose edges pair across different prototiles (matching rules).
 *  - tags: cls (0..2, colouring), kind, hueStep (36, for the orientation colouring).
 */
import { multiply, translate, rotate } from '../../core/affine.js';
import { ngon } from '../../core/polygon.js';
import { toXY } from '../../core/ring.js';
import { triangulate, canonicalDepth } from './robinson.js';
import { rhombs, kitesDarts } from './tilesets.js';
import { pentagonTiling, SHAPES } from './p1.js';

export const id = 'penrose';
export const name = 'Penrose';
export const params = [
  { id: 'tileSet', label: 'Tile set', type: 'select', default: 'p3', group: 'Tiling',
    options: [['p1', 'P1: pentagons, stars, boats, diamonds'], ['p2', 'P2: kites and darts'], ['p3', 'P3: rhombs']] },
  { id: 'size', label: 'Edge length', type: 'number', default: 50, min: 10, max: 300, step: 1, group: 'Tiling' },
  { id: 'rotation', label: 'Tiling rotation (°)', type: 'number', default: 0, min: -180, max: 180, step: 1, group: 'Tiling' },
  { id: 'originX', label: 'Centre X', type: 'number', default: 400, min: -4000, max: 8000, step: 1, group: 'Tiling' },
  { id: 'originY', label: 'Centre Y', type: 'number', default: 300, min: -4000, max: 8000, step: 1, group: 'Tiling' },
];

export const presets = [
  { id: 'p3', name: 'P3 rhombs', params: { tileSet: 'p3' } },
  { id: 'p2', name: 'P2 kites and darts', params: { tileSet: 'p2' } },
  { id: 'p1', name: 'P1 pentagons', params: { tileSet: 'p1' } },
];

const SETS = { p1: ['pent', 'diamond', 'boat', 'star'], p2: ['kite', 'dart'], p3: ['thin', 'thick'] };
const CLS = { thin: 0, thick: 1, kite: 0, dart: 1, pent: 0, diamond: 1, boat: 2, star: 2 };
const PHI = (1 + Math.sqrt(5)) / 2, PSI = 1 / PHI;
const rad = (d) => (d * Math.PI) / 180;
const c36 = Math.cos(rad(36)), s36 = Math.sin(rad(36));

/** Local outlines (increasing-angle order), before centring. u = edge length. */
function outline(kind, u) {
  switch (kind) {
    case 'thin': case 'thick': {
      const h = rad(kind === 'thin' ? 72 : 36), a = u * Math.cos(h), b = u * Math.sin(h); // h = half the angle at the axis ends
      return [[a, 0], [0, b], [-a, 0], [0, -b]];
    }
    case 'kite': return [[u, 0], [u * (1 - c36), u * s36], [0, 0], [u * (1 - c36), -u * s36]];
    case 'dart': { const v = u * PSI, c = Math.cos(rad(108)), s = Math.sin(rad(108)); return [[v, 0], [v * c, v * s], [0, 0], [v * c, -v * s]]; }
    case 'pent': return ngon(5, [0, 0], 0, u);
    default: { // diamond, boat, star: closed walk along the canonical edge directions
      const P = [[0, 0]];
      SHAPES[kind].slice(0, -1).forEach((d) => {
        const [x, y] = P[P.length - 1];
        P.push([x + u * Math.cos(rad(36 * d + 18)), y + u * Math.sin(rad(36 * d + 18))]);
      });
      return P;
    }
  }
}

function prototile(kind, u) {
  const P = outline(kind, u), mx = P.reduce((a, p) => a + p[0], 0) / P.length, my = P.reduce((a, p) => a + p[1], 0) / P.length;
  const Q = P.map(([x, y]) => [x - mx, y - my]);
  return { center: [0, 0], rotUnits: 10, edges: Q.map((a, i) => ({ id: `e${i}`, path: [['M', ...a], ['L', ...Q[(i + 1) % Q.length]]] })) };
}

const rectDist = ([x, y], [x0, y0, x1, y1]) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1));

export function generate(p, region) {
  const unit = p.tileSet === 'p1' ? p.size / (2 * Math.sin(rad(36))) : p.size; // P3 edge of the underlying patch
  const [ox, oy] = [p.originX, p.originY], margin = 4 * unit;
  const big = [region[0] - margin, region[1] - margin, region[2] + margin, region[3] + margin];
  const reach = Math.max(...[[big[0], big[1]], [big[2], big[1]], [big[0], big[3]], [big[2], big[3]]].map(([x, y]) => Math.hypot(x - ox, y - oy)));
  const levels = canonicalDepth(Math.min(45, Math.ceil(Math.log(reach / (0.95 * unit)) / Math.log(PHI))));
  const S = unit * PHI ** levels, cs = Math.cos(rad(p.rotation)), sn = Math.sin(rad(p.rotation));
  const world = (v) => { const [x, y] = toXY(v); return [ox + S * (cs * x - sn * y), oy + S * (sn * x + cs * y)]; };

  const tris = triangulate(levels, (t) => {
    const V = [t.A, t.B, t.C].map(world), c = [0, 1].map((k) => (V[0][k] + V[1][k] + V[2][k]) / 3);
    return rectDist(c, big) <= Math.max(...V.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1])));
  });
  const abstract = { p1: pentagonTiling, p2: kitesDarts, p3: rhombs }[p.tileSet](tris, levels);

  const tiles = [];
  for (const t of abstract) {
    const V = t.verts.map(world), c = [0, 1].map((k) => V.reduce((a, q) => a + q[k], 0) / V.length);
    if (rectDist(c, region) > Math.max(...V.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1])))) continue;
    tiles.push({
      proto: t.kind,
      transform: multiply(translate(c[0], c[1]), rotate(36 * t.rot + p.rotation)),
      orient: { rot: t.rot, flip: false },
      tags: { cls: CLS[t.kind], kind: t.kind, hueStep: 36 },
    });
  }
  return {
    prototiles: Object.fromEntries(SETS[p.tileSet].map((k) => [k, prototile(k, p.size)])),
    tiles,
    meta: { generator: id, params: p, bounds: region },
  };
}
