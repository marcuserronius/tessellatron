/**
 * The eight Archimedean (semi-regular) tilings, built from one table of cells.
 * Contract: exports `generators`, an array of Generators (see ir/schema.js), plus `makeGenerator`.
 *
 * A cell spec gives, for unit side length: lattice `basis` and `polys`, the vertex lists of the
 * regular polygons in one fundamental cell. Everything else is derived from the vertices:
 *  - Prototiles are one regular n-gon per distinct n (key `n3`, `n4`, ...), centred on the origin,
 *    vertex 0 at -90°, side = params.size. Placement angle = direction of the polygon's first vertex.
 *  - orient.rot is an orientation-class index: tiles of one prototile whose placements differ by a
 *    non-symmetric turn get different rot (the exact angle lives in the transform). Not a step count.
 *  - tags: cls = rank of n among the tiling's distinct n (0..2, drives "Tile classes" colouring), n.
 *  - Edges carry no `pair` yet: edges here are shared between different prototiles, which the
 *    same-prototile pairing of the IR cannot express (see TODO.md, Editor).
 * Chiral tilings (snubs) take a `mirror` param that reflects the whole tiling.
 */
import { latticeTiles, originParams } from './lattice.js';
import { ngon, circumradius, centroid, signedArea } from '../../core/polygon.js';

const K = Math.sqrt(3);
const rad = (d) => (d * Math.PI) / 180;
const polar = (r, deg) => [r * Math.cos(rad(deg)), r * Math.sin(rad(deg))];
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const unit = (p) => { const l = Math.hypot(...p); return [p[0] / l, p[1] / l]; };
const turn = (p, deg) => { const c = Math.cos(rad(deg)), s = Math.sin(rad(deg)); return [c * p[0] - s * p[1], s * p[0] + c * p[1]]; };
const mod = (a, n) => ((a % n) + n) % n;
/** Cell triangles on a triangular lattice sit at (a+b)/3 and 2(a+b)/3. */
const third = ([a, b], k) => [(k * (a[0] + b[0])) / 3, (k * (a[1] + b[1])) / 3];
const half = (v) => [v[0] / 2, v[1] / 2];

/** Triangular-lattice cell: one big polygon at the origin, `d` = centre spacing. */
const tri = (d) => [[d, 0], [d / 2, (d * K) / 2]];

const specs = [
  { id: 'trihexagonal', name: 'Trihexagonal', config: '3.6.3.6',
    cell: () => ({ basis: [[2, 0], [1, K]],
      polys: [ngon(6, [0, 0], 0), ngon(3, [1, 1 / K], -90), ngon(3, [2, 2 / K], 90)] }) },

  { id: 'truncated-hexagonal', name: 'Truncated hexagonal', config: '3.12.12',
    cell: () => { const d = 2 + K, B = tri(d);
      return { basis: B, polys: [ngon(12, [0, 0], 15), ngon(3, third(B, 1), 30), ngon(3, third(B, 2), 90)] }; } },

  { id: 'rhombitrihexagonal', name: 'Rhombitrihexagonal', config: '3.4.6.4',
    cell: () => { const d = 1 + K, B = tri(d), [a, b] = B;
      return { basis: B, polys: [ngon(6, [0, 0], 30),
        ngon(4, half(a), 45), ngon(4, half(b), 105), ngon(4, half(add(a, b)), 165),
        ngon(3, third(B, 1), 90), ngon(3, third(B, 2), -90)] }; } },

  { id: 'truncated-trihexagonal', name: 'Truncated trihexagonal', config: '4.6.12',
    cell: () => { const d = 3 + K, B = tri(d), [a, b] = B;
      return { basis: B, polys: [ngon(12, [0, 0], 15),
        ngon(6, third(B, 1), 0), ngon(6, third(B, 2), 0),
        ngon(4, half(a), 45), ngon(4, half(b), 105), ngon(4, half(add(a, b)), 165)] }; } },

  { id: 'truncated-square', name: 'Truncated square', config: '4.8.8',
    cell: () => { const d = 1 + Math.SQRT2; // octagons share edges along the axes
      return { basis: [[d, 0], [0, d]], polys: [ngon(8, [0, 0], 22.5), ngon(4, [d / 2, d / 2], 0)] }; } },

  { id: 'elongated-triangular', name: 'Elongated triangular', config: '3.3.3.4.4',
    cell: () => { const h = K / 2;
      return { basis: [[1, 0], [0.5, 1 + h]],
        polys: [ngon(4, [0.5, 0.5], 45), ngon(3, [0.5, 1 + h / 3], 90), ngon(3, [1, 1 + (2 * h) / 3], -90)] }; } },

  // Squares at ±15°, four triangles filling the two rhombic gaps per cell (gap 2 = gap 1 turned 90°).
  { id: 'snub-square', name: 'Snub square', config: '3.3.4.3.4', chiral: true,
    cell: () => { const p = (1 + K) / Math.SQRT2;
      const A = ngon(4, [0, 0], 60), A2 = ngon(4, [p, 0], 60), B = ngon(4, [p / 2, p / 2], 30);
      const T1 = [A[0], A2[1], A[3]], T2 = [A2[1], A2[2], A[3]];
      return { basis: [[p, 0], [0, p]],
        polys: [A, B, T1, T2, T1.map((v) => turn(v, 90)), T2.map((v) => turn(v, 90))] }; } },

  // Hexagon H, a triangle T_k on each edge (apex A_k at radius √3), and two "free" triangles.
  // X_k = 2*H_k. The neighbouring hexagon touches A_0 along A_0->X_1 and fixes the lattice.
  { id: 'snub-hexagonal', name: 'Snub hexagonal', config: '3.3.3.3.6', chiral: true,
    cell: () => { const k6 = [0, 1, 2, 3, 4, 5];
      const H = k6.map((k) => polar(1, 60 * k)), A = k6.map((k) => polar(K, 30 + 60 * k)), X = k6.map((k) => polar(2, 60 * k));
      const u1 = unit(sub(X[1], A[0])), u0 = unit(sub(X[0], A[0]));
      const c = add(A[0], turn(u1, Math.sign(u1[0] * u0[1] - u1[1] * u0[0]) * 60));
      return { basis: [c, turn(c, 60)],
        polys: [H, ...k6.map((k) => [H[k], H[(k + 1) % 6], A[k]]), [H[0], X[0], A[0]], [H[1], X[1], A[1]]] }; } },
];

const reflect = ([x, y]) => [x, -y];

/** Polygons -> motif entries + prototile sizes. Orientation classes are assigned per prototile. */
function motifOf(polys, s) {
  const ns = [...new Set(polys.map((P) => P.length))].sort((a, b) => a - b);
  const classes = new Map();
  const motif = polys.map((P0) => {
    const P = signedArea(P0) < 0 ? [P0[0], ...P0.slice(1).reverse()] : P0, n = P.length, c = centroid(P);
    const angle = (Math.atan2(P[0][1] - c[1], P[0][0] - c[0]) * 180) / Math.PI + 90;
    const key = `${n}:${mod(Math.round(angle * 1e4) / 1e4, 360 / n).toFixed(3)}`;
    if (!classes.has(key)) classes.set(key, [...classes.keys()].filter((k) => k.startsWith(`${n}:`)).length);
    return { proto: `n${n}`, offset: [c[0] * s, c[1] * s], angle, rot: classes.get(key), tags: { cls: ns.indexOf(n), n } };
  });
  return { motif, ns };
}

function prototile(n, s) {
  const V = ngon(n, [0, 0], -90, s);
  return { center: [0, 0], rotUnits: n,
    edges: V.map((a, k) => ({ id: `e${k}`, path: [['M', ...a], ['L', ...V[(k + 1) % n]]] })) };
}

const common = [
  { id: 'by-shape', name: 'Colour by shape', style: { fillMode: 'classes' } },
  { id: 'by-orientation', name: 'Colour by orientation', style: { fillMode: 'orient' } },
  { id: 'outline', name: 'Outline only', style: { fillMode: 'none' } },
];

export function makeGenerator(spec) {
  const params = [
    { id: 'size', label: 'Side length', type: 'number', default: 36, min: 5, max: 200, step: 1, group: 'Tiling' },
    { id: 'rotation', label: 'Tiling rotation (°)', type: 'number', default: 0, min: -180, max: 180, step: 1, group: 'Tiling' },
    ...(spec.chiral ? [{ id: 'mirror', label: 'Mirror image', type: 'boolean', default: false, group: 'Tiling' }] : []),
    ...originParams,
  ];
  const presets = spec.chiral ? [...common, { id: 'mirror', name: 'Mirror image', params: { mirror: true } }] : common;

  function generate(p, region) {
    const s = p.size, { basis, polys } = spec.cell();
    const f = p.mirror ? reflect : (v) => v;
    const { motif, ns } = motifOf(polys.map((P) => P.map(f)), s);
    const tiles = latticeTiles({
      basis: basis.map((v) => f(v).map((x) => x * s)), motif,
      rotation: p.rotation, origin: [p.originX, p.originY], region, radius: circumradius(ns[ns.length - 1], s),
    });
    return {
      prototiles: Object.fromEntries(ns.map((n) => [`n${n}`, prototile(n, s)])),
      tiles, meta: { generator: spec.id, params: p, bounds: region },
    };
  }
  return { id: spec.id, name: `${spec.name} (${spec.config})`, config: spec.config, params, presets, generate };
}

export const generators = specs.map(makeGenerator);
