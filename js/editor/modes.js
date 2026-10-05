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
 * Triangles (up and down tiles; each of the three edges can be told apart, named right, bottom, left on the upright
 * apex-up tile) have six modes, one shape count x (rotated | flipped). A DOWN triangle is the up triangle turned half a
 * turn (rotated) or mirrored across a horizontal axis (flipped: orient.flip, a transform with negative determinant):
 *   single       one shape, down = half-turn:  every edge is point-symmetric (an S curve), three classes
 *   single-flip  one shape, down = mirror image:  right = left (free); the bottom is the mirror line and stays straight
 *   pair         two shapes, A up and B down, half-turn:  A right = B right, A bottom = B bottom, A left = B left
 *   pair-flip    two shapes, B the mirror image:  A right = B left, A bottom = B bottom, A left = B right
 *   triple       three shapes, one per row (row j gets shape j mod 3), half-turn:  each shape has its own right and left
 *                (point-symmetric); the bottom is shared by all three
 *   triple-flip  three shapes by row, down tiles mirrored:  per shape right = left; the bottoms stay straight
 * In the turned modes tile (i, j) is turned by  [[0,3],[1,2]][i mod 2][j mod 2]  quarter turns clockwise: its right
 * and left neighbours are turned one quarter relative to it, the ones above and below three quarters, so four tiles meet
 * round the corner they all turn about. The ccw modes negate every turn.
 *
 * modesOf(generator)         -> Mode[]       { id, label, shapes, shape(i,j,m), turn(i,j,m), flip?(i,j,m), order }  ([] when none;
 *                                            m is the motif index, tags.m: for triangles 0 = down, 1 = up)
 * shapeCounts(generator) / variantsOf(generator) / modeFor(generator, shapes, variant) -> the two choices the Shape tab
 *                                            offers (tile shapes, turned/flipped) and the mode id they pick
 * getMode(generator, id)     -> Mode|null    unknown ids fall back to the generator's first mode
 * DEFAULT_MODE               'single'
 * retile(ir, modeId)         -> TilingIR     tiles re-assigned to shapes and turned as the mode says: one prototile per
 *                                            shape (the first keeps the prototile's id, later ones are 'sq_b', ...; each is
 *                                            a copy with `tileClass: { of, index, label }`), tile transforms turned about
 *                                            the tile centre (any turns the generator already applied are undone first, but not the
 *                                            half-turn of a down triangle, which is its geometry), flipped tiles mirrored about
 *                                            the prototile's axis (transform = upright * turn * flip, orient.flip set), orient.rot set. meta.mode = the mode id. Returns `ir` itself when the
 *                                            generator has no modes, and is idempotent for the same mode.
 * describeEdges(ir, classes, generator) -> string[]  "top = bottom", "A right = B left", ... one line per edge class
 *                                            ("right (half-turn symmetric)" for a class whose curve is point-symmetric,
 *                                            "bottom (locked)" for one that has to stay straight)
 */
import { multiply, rotate } from '../core/affine.js';

export const DEFAULT_MODE = 'single';

const mod = (a, n) => ((a % n) + n) % n;
const cw = (i, j) => [[0, 3], [1, 2]][mod(i, 2)][mod(j, 2)];
const ccw = (i, j) => mod(4 - cw(i, j), 4);
const checker = (i, j) => mod(i + j, 2);
const none = () => 0;

const square = [
  { id: 'single', label: 'One shape', shapes: 1, variant: 'none', shape: none, turn: none },
  { id: 'pair', label: 'Two shapes', shapes: 2, variant: 'none', shape: checker, turn: none },
  { id: 'turn-cw', label: 'One shape, quarter turns (clockwise)', shapes: 1, variant: 'cw', shape: none, turn: cw },
  { id: 'turn-ccw', label: 'One shape, quarter turns (counterclockwise)', shapes: 1, variant: 'ccw', shape: none, turn: ccw },
  { id: 'pair-turn-cw', label: 'Two shapes, quarter turns (clockwise)', shapes: 2, variant: 'cw', shape: checker, turn: cw },
  { id: 'pair-turn-ccw', label: 'Two shapes, quarter turns (counterclockwise)', shapes: 2, variant: 'ccw', shape: checker, turn: ccw },
].map((m) => ({ ...m, order: 4 }));

const down = (i, j, m) => (m === 0 ? 1 : 0); // triangles: the motif with index 0 is the down triangle
const row3 = (i, j) => mod(j, 3);
const triangle = [
  { id: 'single', label: 'One shape, rotated (half-turn)', variant: 'rotated', shapes: 1, shape: none, turn: none },
  { id: 'single-flip', variant: 'flipped', label: 'One shape, flipped (mirror)', shapes: 1, shape: none, turn: none, flip: down },
  { id: 'pair', label: 'Two shapes (up, down), rotated', variant: 'rotated', shapes: 2, shape: down, turn: none },
  { id: 'pair-flip', variant: 'flipped', label: 'Two shapes (up, down), flipped', shapes: 2, shape: down, turn: none, flip: down },
  { id: 'triple', variant: 'rotated', label: 'Three shapes (by row), rotated', shapes: 3, shape: row3, turn: none },
  { id: 'triple-flip', variant: 'flipped', label: 'Three shapes (by row), flipped', shapes: 3, shape: row3, turn: none, flip: down },
].map((m) => ({ ...m, order: 3 }));

const MODES = { square, triangle };
const EDGE_NAMES = { square: ['top', 'right', 'bottom', 'left'], triangle: ['right', 'bottom', 'left'] };
/** Per generator: the rotation (in orient.rot units) that is part of a tile's geometry rather than an orientation
 *  policy, and the map of the prototile onto itself that a flipped tile gets. */
const GEOMETRY = {
  triangle: { base: (t) => (t.tags.cls ? 3 : 0), mirror: [-1, 0, 0, 1, 0, 0] }, // the down triangle is the up one turned 180°; mirror: x -> -x (the apex axis)
};

const VARIANTS = {
  square: [['none', 'No turns'], ['cw', 'Quarter turns (clockwise)'], ['ccw', 'Quarter turns (counterclockwise)']],
  triangle: [['rotated', 'Rotated (down = half-turn)'], ['flipped', 'Flipped (down = mirror image)']],
};

export const modesOf = (generator) => MODES[generator] ?? [];
/** The tile counts a generator's modes offer, e.g. [1, 2, 3]. */
export const shapeCounts = (generator) => [...new Set(modesOf(generator).map((m) => m.shapes))];
/** The variants (how tiles are turned or flipped) as [id, label] pairs. */
export const variantsOf = (generator) => VARIANTS[generator] ?? [];
/** The mode with this many shapes and this variant; falls back to the same count, then the first mode. */
export const modeFor = (generator, shapes, variant) => {
  const all = modesOf(generator);
  return (all.find((m) => m.shapes === shapes && m.variant === variant) ?? all.find((m) => m.shapes === shapes) ?? all[0])?.id;
};
export const getMode = (generator, id) => modesOf(generator).find((m) => m.id === id) ?? modesOf(generator)[0] ?? null;

const shapeId = (proto, k) => (k === 0 ? proto : `${proto}_${String.fromCharCode(97 + k)}`);

export function retile(ir, modeId) {
  const mode = getMode(ir.meta.generator, modeId);
  if (!mode || ir.meta.mode === mode.id) return ir;
  const used = new Map(), geo = GEOMETRY[ir.meta.generator];
  const tiles = ir.tiles.map((t) => {
    const { i, j, m } = t.tags, proto = ir.prototiles[t.proto], k = mode.shape(i, j, m), turn = mode.turn(i, j, m), flip = !!mode.flip?.(i, j, m);
    const id = shapeId(t.proto, k), base = geo?.base(t) ?? 0;
    if (!used.has(id)) used.set(id, { of: t.proto, index: k });
    let upright = t.transform; // undo what an earlier mode (or the generator's orientation policy) did: flip first, then the turn
    if (t.orient.flip && geo) upright = multiply(upright, geo.mirror);
    if (t.orient.rot !== base) upright = multiply(upright, rotate((-(t.orient.rot - base) * 360) / proto.rotUnits));
    let transform = turn ? multiply(upright, rotate((turn * 360) / mode.order)) : upright;
    if (flip) transform = multiply(transform, geo.mirror);
    return { ...t, proto: id, transform, orient: { ...t.orient, rot: mod(base + turn * (proto.rotUnits / mode.order), proto.rotUnits), flip } };
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
    if (c.kind === 'locked') return `${parts.join(' = ')} (locked)`;
    return c.kind === 'symmetric' ? `${parts.join(' = ')} (half-turn symmetric)` : parts.join(' = ');
  });
}
