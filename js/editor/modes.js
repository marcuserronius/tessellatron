/**
 * Tiling modes for the shape editor (pure, no DOM; depends on core only).
 *
 * A mode says how many different tile SHAPES a tiling has and how tiles are turned, which together decide which
 * edges are the same curve. Each tile gets a shape (A, B, ...) and a number of quarter turns from its position in
 * the lattice (tags i, j). Squares:
 *   single         one shape, no turns:  top = bottom, right = left
 *   pair           two shapes A, B in a checkerboard, no turns:  A top = B bottom, A right = B left, and the reverse
 *   turn-cw        one shape, quarter turns:  right = bottom, left = top   (a 4-fold centre at two opposite corners)
 *   turn-ccw       the mirror image of turn-cw:  right = top, left = bottom
 *   pair-turn-cw   two shapes in a checkerboard, quarter turns:  A right = B bottom, A left = B top, and the reverse
 *   pair-turn-ccw  the mirror image of pair-turn-cw
 * In the turned modes tile (i, j) is turned by  [[0,3],[1,2]][i mod 2][j mod 2]  quarter turns clockwise: its right
 * and left neighbours are turned one quarter relative to it, the ones above and below three quarters, so four tiles meet
 * round the corner they all turn about. The ccw modes negate every turn.
 *
 * modesOf(generator)         -> Mode[]       { id, label, shapes, shape(i,j), turn(i,j), order }  ([] when none)
 * getMode(generator, id)     -> Mode|null    unknown ids fall back to the generator's first mode
 * DEFAULT_MODE               'single'
 * retile(ir, modeId)         -> TilingIR     tiles re-assigned to shapes and turned as the mode says: one prototile per
 *                                            shape (the first keeps the prototile's id, later ones are 'sq_b', ...; each is
 *                                            a copy with `tileClass: { of, index, label }`), tile transforms turned about
 *                                            the tile centre (any turns the generator already applied are undone first),
 *                                            orient.rot set. meta.mode = the mode id. Returns `ir` itself when the
 *                                            generator has no modes, and is idempotent for the same mode.
 * describeEdges(ir, classes, generator) -> string[]  "top = bottom", "A right = B left", ... one line per edge class
 */
import { multiply, rotate } from '../core/affine.js';

export const DEFAULT_MODE = 'single';

const mod = (a, n) => ((a % n) + n) % n;
const cw = (i, j) => [[0, 3], [1, 2]][mod(i, 2)][mod(j, 2)];
const ccw = (i, j) => mod(4 - cw(i, j), 4);
const checker = (i, j) => mod(i + j, 2);
const none = () => 0;

const square = [
  { id: 'single', label: 'One shape', shapes: 1, shape: none, turn: none },
  { id: 'pair', label: 'Two shapes', shapes: 2, shape: checker, turn: none },
  { id: 'turn-cw', label: 'One shape, quarter turns (clockwise)', shapes: 1, shape: none, turn: cw },
  { id: 'turn-ccw', label: 'One shape, quarter turns (counterclockwise)', shapes: 1, shape: none, turn: ccw },
  { id: 'pair-turn-cw', label: 'Two shapes, quarter turns (clockwise)', shapes: 2, shape: checker, turn: cw },
  { id: 'pair-turn-ccw', label: 'Two shapes, quarter turns (counterclockwise)', shapes: 2, shape: checker, turn: ccw },
].map((m) => ({ ...m, order: 4 }));

const MODES = { square };
const EDGE_NAMES = { square: ['top', 'right', 'bottom', 'left'] };

export const modesOf = (generator) => MODES[generator] ?? [];
export const getMode = (generator, id) => modesOf(generator).find((m) => m.id === id) ?? modesOf(generator)[0] ?? null;

const shapeId = (proto, k) => (k === 0 ? proto : `${proto}_${String.fromCharCode(97 + k)}`);

export function retile(ir, modeId) {
  const mode = getMode(ir.meta.generator, modeId);
  if (!mode || ir.meta.mode === mode.id) return ir;
  const used = new Map();
  const tiles = ir.tiles.map((t) => {
    const proto = ir.prototiles[t.proto], k = mode.shape(t.tags.i, t.tags.j), turn = mode.turn(t.tags.i, t.tags.j);
    const id = shapeId(t.proto, k);
    if (!used.has(id)) used.set(id, { of: t.proto, index: k });
    const upright = t.orient.rot ? multiply(t.transform, rotate((-t.orient.rot * 360) / proto.rotUnits)) : t.transform;
    return {
      ...t, proto: id, transform: turn ? multiply(upright, rotate((turn * 360) / mode.order)) : upright,
      orient: { ...t.orient, rot: turn * (proto.rotUnits / mode.order) },
    };
  });
  const prototiles = {};
  for (const [id, { of, index }] of [...used].sort((a, b) => a[1].index - b[1].index || (a[0] < b[0] ? -1 : 1))) {
    prototiles[id] = { ...ir.prototiles[of], tileClass: { of, index, label: String.fromCharCode(65 + index) } };
  }
  return { ...ir, prototiles, tiles, meta: { ...ir.meta, mode: mode.id } };
}

export function describeEdges(ir, classes, generator) {
  const names = EDGE_NAMES[generator], shapes = Object.keys(ir.prototiles).length > 1;
  if (!names) return [];
  const edgeIndex = (id) => Number(id.slice(1));
  return classes.map((c) => {
    const parts = c.members.map((m) => `${shapes ? `${ir.prototiles[m.proto].tileClass?.label ?? 'A'} ` : ''}${names[edgeIndex(m.edge)] ?? m.edge}`);
    return c.kind === 'locked' ? `${parts[0]} (locked)` : parts.join(' = ');
  });
}
