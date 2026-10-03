/**
 * Hat monotile substitution system (pure, no DOM).
 *
 * Contract:
 *   buildSupertile(level, seed) -> MetaTile      a level-`level` supertile of type seed ('H'|'T'|'P'|'F'),
 *                                                recentred so the centroid of its outline is the origin.
 *   collectHats(root, M0, wantBox) -> Hat[]      every hat inside `root` whose bounding circle meets the box.
 *   snapPlacement(M, origin) -> Placement        round a float placement onto the hat lattice (see below).
 *
 * Geometry lives in "hat space": hex-lattice coordinates where the hat's short edge is 1 and y points up.
 * A MetaTile is { shape: [[x,y]...], children: [{ T, geom }], r }: `shape` is its outline, each child is
 * a MetaTile or a leaf { leaf: true, label }, `T` places the child in its parent, and `r` bounds the
 * child's whole subtree by a circle about its local origin. Placement matrices are [A,B,C,D,E,F]
 * (x' = A x + B y + C, y' = D x + E y + F). Hats in a level-1 metatile are drawn at scale 1/2, and
 * every higher level only moves metatiles rigidly, so hat size never changes. `Hat` is
 * { M, label, rot, flip, u, v } with M mapping hat_outline to the frame of `root` and label in
 * H1|H|T|P|F: H1 is the single reflected hat of an H metatile, the others name the metatile the hat
 * came from. (rot, flip, u, v) is the same placement as exact integers, see below.
 *
 * Precision. The tree is built in floats, and the supertile outlines are NOT on any lattice: from
 * level 2 up their vertices are off the hex lattice (by ~1e-3 at level 9) and their edges grow by
 * ~phi^2 per level, so the construction cannot be moved into an integer ring as it stands. The hats
 * themselves are different: every leaf matrix is the hat at scale 1/2, turned by a multiple of 60
 * degrees (rot in 0-5), optionally reflected (flip), and moved to u*e1 + v*e2 for integers u, v,
 * where e1 = (1/2, 0) and e2 = (1/4, sqrt(3)/4) span the lattice the scaled hat's vertices lie on:
 * M = translate(origin + u*e1 + v*e2) * rotate(rot * 60deg) * [diag(1, -1) if flip] * scale(1/2),
 * so rot is the angle of M's first column either way. `origin` is where the lattice origin sits in
 * the root's frame: each metatile is recentred on its outline's centroid, which is generally not a
 * lattice point, so the lattice is shifted by an amount that buildSupertile tracks exactly in
 * MetaTile.origin (the root's, carried through each recentre) rather than inferred from the hats.
 * collectHats needs M0 to preserve the lattice (a translation or a 60-degree rotation); anything
 * else trips the tolerance check below. The float construction lands within ~3e-10 of that
 * placement at level 9 (lattice spacing 0.5, so rounding is wrong only past 0.25), and collectHats
 * snaps every hat to it: M is rebuilt from (rot, flip, u, v) and is bit-identical for equal
 * placements. A hat further than SNAP_TOLERANCE from the lattice throws rather than snapping to the
 * wrong place.
 *
 * What stays float: the bounding circles, the outlines and the supertile construction. An
 * integer-exact substitution (no float construction at all) is a possible later rewrite.
 *
 * The metatile outlines, the patch-construction rules and the supertile extraction are adapted from
 * hatviz (https://github.com/isohedral/hatviz) after Smith, Myers, Kaplan & Goodman-Strauss,
 * "An aperiodic monotile" (2023).
 *
 * hatviz is Copyright (c) 2023, Craig S. Kaplan, BSD 3-Clause License:
 * Redistribution and use in source and binary forms, with or without modification, are permitted
 * provided that the following conditions are met: (1) redistributions of source code must retain the
 * above copyright notice, this list of conditions and the following disclaimer; (2) redistributions
 * in binary form must reproduce the above copyright notice, this list of conditions and the
 * following disclaimer in the documentation and/or other materials provided with the distribution;
 * (3) neither the name of the copyright holder nor the names of its contributors may be used to
 * endorse or promote products derived from this software without specific prior written permission.
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 * FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
 * IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
 * OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
const HR3 = Math.sqrt(3) / 2;
const PI = Math.PI;

const hexPt = (x, y) => [x + 0.5 * y, HR3 * y];

/** The hat: 13 vertices, edges of length 1 and √3, in hat space. */
export const HAT_OUTLINE = [
  hexPt(0, 0), hexPt(-1, -1), hexPt(0, -2), hexPt(2, -2), hexPt(2, -1), hexPt(4, -2), hexPt(5, -1),
  hexPt(4, 0), hexPt(3, 0), hexPt(2, 2), hexPt(0, 3), hexPt(0, 2), hexPt(-1, 2),
];

// --- affine helpers, [A,B,C,D,E,F] convention ---
const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[3], a[0] * b[1] + a[1] * b[4], a[0] * b[2] + a[1] * b[5] + a[2],
  a[3] * b[0] + a[4] * b[3], a[3] * b[1] + a[4] * b[4], a[3] * b[2] + a[4] * b[5] + a[5],
];
const inv = (T) => {
  const det = T[0] * T[4] - T[1] * T[3];
  return [T[4] / det, -T[1] / det, (T[1] * T[5] - T[2] * T[4]) / det,
    -T[3] / det, T[0] / det, (T[2] * T[3] - T[0] * T[5]) / det];
};
const ttrans = (x, y) => [1, 0, x, 0, 1, y];
const trot = (a) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0];
const rotAbout = ([x, y], a) => mul(ttrans(x, y), mul(trot(a), ttrans(-x, -y)));
const transPt = (M, [x, y]) => [M[0] * x + M[1] * y + M[2], M[3] * x + M[4] * y + M[5]];
const padd = (p, q) => [p[0] + q[0], p[1] + q[1]];
const psub = (p, q) => [p[0] - q[0], p[1] - q[1]];
/** Matrix taking the unit interval to the segment p->q. */
const matchSeg = (p, q) => [q[0] - p[0], p[1] - q[1], p[0], q[1] - p[1], q[0] - p[0], p[1]];
/** Similarity taking segment p1->q1 to p2->q2. */
const matchTwo = (p1, q1, p2, q2) => mul(matchSeg(p2, q2), inv(matchSeg(p1, q1)));
function intersect(p1, q1, p2, q2) {
  const d = (q2[1] - p2[1]) * (q1[0] - p1[0]) - (q2[0] - p2[0]) * (q1[1] - p1[1]);
  const u = ((q2[0] - p2[0]) * (p1[1] - p2[1]) - (q2[1] - p2[1]) * (p1[0] - p2[0])) / d;
  return [p1[0] + u * (q1[0] - p1[0]), p1[1] + u * (q1[1] - p1[1])];
}

// --- metatiles ---
const leaf = (label) => ({ leaf: true, label, shape: null, r: Math.max(...HAT_OUTLINE.map((p) => Math.hypot(...p))) });
const HATS = { H1: leaf('H1'), H: leaf('H'), T: leaf('T'), P: leaf('P'), F: leaf('F') };

/** Radius of a circle about the node's local origin that bounds everything below it. */
function boundRadius(meta) {
  return Math.max(
    ...meta.shape.map((p) => Math.hypot(...p)),
    ...meta.children.map(({ T, geom }) => Math.hypot(T[2], T[5]) + Math.sqrt(Math.abs(T[0] * T[4] - T[1] * T[3])) * geom.r),
  );
}

function makeMeta(shape, label, children, origin) {
  const meta = { shape, label, children, origin, r: 0 };
  meta.r = boundRadius(meta);
  return meta;
}

/** Shift a metatile so its outline's vertex centroid is the origin; `origin` follows the shift (see header). */
function recentre({ shape, label, children }, origin) {
  const cx = shape.reduce((a, p) => a + p[0], 0) / shape.length, cy = shape.reduce((a, p) => a + p[1], 0) / shape.length;
  const M = ttrans(-cx, -cy);
  return makeMeta(shape.map((p) => [p[0] - cx, p[1] - cy]), label, children.map((c) => ({ T: mul(M, c.T), geom: c.geom })), [origin[0] - cx, origin[1] - cy]);
}

const hatChild = (a, b, c, d, geom) => ({ T: matchTwo(HAT_OUTLINE[a], HAT_OUTLINE[b], c, d), geom });

const initial = {
  H() {
    const o = [[0, 0], [4, 0], [4.5, HR3], [2.5, 5 * HR3], [1.5, 5 * HR3], [-0.5, HR3]];
    return makeMeta(o, 'H', [
      hatChild(5, 7, o[5], o[0], HATS.H), hatChild(9, 11, o[1], o[2], HATS.H), hatChild(5, 7, o[3], o[4], HATS.H),
      { T: mul(ttrans(2.5, HR3), mul([-0.5, -HR3, 0, HR3, -0.5, 0], [0.5, 0, 0, 0, -0.5, 0])), geom: HATS.H1 },
    ], [0, 0]);
  },
  T() {
    return makeMeta([[0, 0], [3, 0], [1.5, 3 * HR3]], 'T', [{ T: [0.5, 0, 0.5, 0, 0.5, HR3], geom: HATS.T }], [0, 0]);
  },
  P() {
    const o = [[0, 0], [4, 0], [3, 2 * HR3], [-1, 2 * HR3]];
    return makeMeta(o, 'P', [
      { T: [0.5, 0, 1.5, 0, 0.5, HR3], geom: HATS.P },
      { T: mul(ttrans(0, 2 * HR3), mul([0.5, HR3, 0, -HR3, 0.5, 0], [0.5, 0, 0, 0, 0.5, 0])), geom: HATS.P },
    ], [0, 0]);
  },
  F() {
    const o = [[0, 0], [3, 0], [3.5, HR3], [3, 2 * HR3], [-1, 2 * HR3]];
    return makeMeta(o, 'F', [
      { T: [0.5, 0, 1.5, 0, 0.5, HR3], geom: HATS.F },
      { T: mul(ttrans(0, 2 * HR3), mul([0.5, HR3, 0, -HR3, 0.5, 0], [0.5, 0, 0, 0, 0.5, 0])), geom: HATS.F },
    ], [0, 0]);
  },
};

/** Placement rules for the 29-metatile patch around one H: [from, edge, 'type', edge] or [a, ea, b, eb, 'type', edge]. */
const RULES = [
  ['H'],
  [0, 0, 'P', 2], [1, 0, 'H', 2], [2, 0, 'P', 2], [3, 0, 'H', 2], [4, 4, 'P', 2], [0, 4, 'F', 3], [2, 4, 'F', 3],
  [4, 1, 3, 2, 'F', 0], [8, 3, 'H', 0], [9, 2, 'P', 0], [10, 2, 'H', 0], [11, 4, 'P', 2], [12, 0, 'H', 2],
  [13, 0, 'F', 3], [14, 2, 'F', 1], [15, 3, 'H', 4], [8, 2, 'F', 1], [17, 3, 'H', 0], [18, 2, 'P', 0],
  [19, 2, 'H', 2], [20, 4, 'F', 3], [20, 0, 'P', 2], [22, 0, 'H', 2], [23, 4, 'F', 3], [23, 0, 'F', 3],
  [16, 0, 'P', 2], [9, 4, 0, 2, 'T', 2], [4, 0, 'F', 3],
];

function constructPatch(shapes) {
  const kids = [];
  const place = (g, P, Q, e) => kids.push({ T: matchTwo(g.shape[e], g.shape[(e + 1) % g.shape.length], P, Q), geom: g });
  for (const r of RULES) {
    if (r.length === 1) { kids.push({ T: [1, 0, 0, 0, 1, 0], geom: shapes[r[0]] }); continue; }
    if (r.length === 4) {
      const { T, geom } = kids[r[0]];
      place(shapes[r[2]], transPt(T, geom.shape[(r[1] + 1) % geom.shape.length]), transPt(T, geom.shape[r[1]]), r[3]);
    } else {
      const cp = kids[r[0]], cq = kids[r[2]];
      place(shapes[r[4]], transPt(cq.T, cq.geom.shape[r[3]]), transPt(cp.T, cp.geom.shape[r[1]]), r[5]);
    }
  }
  return kids;
}

/** Next level's H, T, P, F, each assembled from the previous level's metatiles in the patch. */
function constructMetatiles(kids, origin) {
  const ev = (n, i) => transPt(kids[n].T, kids[n].geom.shape[i]);
  const pick = (ns) => ns.map((n) => kids[n]);
  const bps1 = ev(8, 2), bps2 = ev(21, 2);
  const rbps = transPt(rotAbout(bps1, -2 * PI / 3), bps2);
  const p72 = ev(7, 2), p252 = ev(25, 2);
  const llc = intersect(bps1, rbps, ev(6, 2), p72);
  let w = psub(ev(6, 2), llc);

  const h = [llc, bps1];
  w = transPt(trot(-PI / 3), w);
  h.push(padd(h[1], w));
  h.push(ev(14, 2));
  w = transPt(trot(-PI / 3), w);
  h.push(psub(h[3], w));
  h.push(ev(6, 2));

  const p = [p72, padd(p72, psub(bps1, llc)), bps1, llc];
  const f = [bps2, ev(24, 2), ev(25, 0), p252, padd(p252, psub(llc, bps1))];
  const A = h[2], B = padd(h[1], psub(h[4], h[5])), C = transPt(rotAbout(B, -PI / 3), A);

  return {
    H: recentre({ shape: h, label: 'H', children: pick([0, 9, 16, 27, 26, 6, 1, 8, 10, 15]) }, origin),
    T: recentre({ shape: [B, C, A], label: 'T', children: pick([11]) }, origin),
    P: recentre({ shape: p, label: 'P', children: pick([7, 2, 3, 4, 28]) }, origin),
    F: recentre({ shape: f, label: 'F', children: pick([21, 20, 22, 23, 24, 25]) }, origin),
  };
}

/** Level-`level` (>= 1) supertile of type `seed`. Level 1 is the bare metatile of 1 to 4 hats. */
export function buildSupertile(level, seed = 'H') {
  let tiles = { H: initial.H(), T: initial.T(), P: initial.P(), F: initial.F() };
  for (let l = 1; l < level; l++) tiles = constructMetatiles(constructPatch(tiles), tiles.H.origin);
  return tiles[seed];
}

const COS = [1, 0.5, -0.5, -1, -0.5, 0.5];
const SIN = [0, HR3, HR3, 0, -HR3, -HR3];
/** Largest matrix-entry error (hat-space units; lattice spacing 0.5) a hat may have against its lattice placement. */
export const SNAP_TOLERANCE = 1e-6;

/**
 * Round a float hat placement (matrix, hat space -> frame of the root) onto the hat lattice whose
 * origin is `origin` in that frame. Returns { M, rot, flip, u, v } with M rebuilt from the integers.
 */
export function snapPlacement(M, origin = [0, 0]) {
  const flip = M[0] * M[4] - M[1] * M[3] < 0;
  const turn = Math.atan2(M[3], M[0]) / (PI / 3);
  const rot = ((Math.round(turn) % 6) + 6) % 6;
  const v = Math.round((4 * (M[5] - origin[1])) / Math.sqrt(3)) + 0; // + 0 turns -0 into 0
  const u = Math.round(2 * (M[2] - origin[0] - v / 4)) + 0;
  const exact = rebuild(rot, flip, u, v, origin);
  const err = Math.max(...exact.map((x, i) => Math.abs(x - M[i])));
  if (!(err <= SNAP_TOLERANCE)) throw new Error(`hat placement is ${err} from the hat lattice (tolerance ${SNAP_TOLERANCE})`);
  return { M: exact, rot, flip, u, v };
}

function rebuild(rot, flip, u, v, origin) {
  const c = COS[rot], s = SIN[rot], f = flip ? -1 : 1;
  return [c / 2, (-s * f) / 2, origin[0] + u / 2 + v / 4, s / 2, (c * f) / 2, origin[1] + (v * Math.sqrt(3)) / 4];
}

/**
 * All hats below `root` whose bounding circle meets wantBox [x0,y0,x1,y1] (given in the frame M0 maps
 * hat space into). Hats are returned with their full matrix into that frame.
 */
export function collectHats(root, M0, [x0, y0, x1, y1]) {
  const out = [];
  const origin = transPt(M0, root.origin);
  (function walk(node, M) {
    const c = transPt(M, [0, 0]), r = node.r * Math.sqrt(Math.abs(M[0] * M[4] - M[1] * M[3]));
    const dx = Math.max(x0 - c[0], 0, c[0] - x1), dy = Math.max(y0 - c[1], 0, c[1] - y1);
    if (dx * dx + dy * dy > r * r) return;
    if (node.leaf) { out.push({ ...snapPlacement(M, origin), label: node.label }); return; }
    for (const ch of node.children) walk(ch.geom, mul(M, ch.T));
  })(root, M0);
  return out;
}
