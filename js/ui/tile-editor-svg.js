/**
 * Markup for the shape editor's tile view (pure: model -> SVG string, no DOM, so it can be tested in node).
 *   tileEditorSVG({ sample, classes, shape, tile?, invalid? }) -> string
 *     sample, classes: editorModel(state) (app/pipeline.js): a patch of unshaped tiles, split into tile classes, and
 *     its edge classes;  shape: state.shape or null;  tile: which tile class to show (default: the first);
 *     invalid: draw the tile in the "rejected" state.
 *   tileChoices(sample) -> [{ id, label }]   the tile classes present ('A', 'B', ...), for the tile selector.
 * One reference tile of the chosen class is drawn upright in its own (prototile) frame, centred on the origin: the
 * tile nearest the patch centre. The viewBox is in prototile coordinates, so a pointer position maps to an edge point
 * with plain arithmetic. Contents, back to front:
 *   ghosts      the surrounding tiles of the patch, shaped, as they sit next to the reference tile (turned if the
 *               tiling turns them; other tile classes have their own shapes), which shows how the shapes fit
 *   tile        the shaped outline;  base: the straight outline, dashed
 *   edge rep / derived / locked   each edge by its role: the first member of its edge class (solid), a later member
 *               (dashed; it follows the first and is edited the same way), or an edge that must stay straight
 *   hit         wide transparent target over each editable edge: press to add a point (data-pid, data-edge = this
 *               tile's edge; the controller finds the shared curve through the edge classes)
 *   handle      draggable points of each editable edge. data-index is the index into the STORED points of the class's
 *               representative curve (so it is reversed for a member whose glue is odd). In a symmetric class only the
 *               representative's first half is draggable; its other edges are derived markers
 *   derived-pt / fixed-pt   hollow markers for points that follow (derived) or are fixed (middle of a symmetric edge)
 */
import { apply, invert, multiply } from '../core/affine.js';
import { pathPoints } from '../core/path.js';
import { applyShape, edgeFrame, outlinePoints } from '../editor/shape.js';
import { pointsOf } from '../editor/edit.js';

export const EDITOR_PX = 420, MARGIN = 0.4, HANDLE_PX = 6;
const f = (n) => String(+n.toFixed(3));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const poly = (pts, close) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('') + (close ? 'Z' : '');
const dist = (p) => Math.hypot(p[0], p[1]);

/** The tile classes that occur in the patch, in order, with their letters. */
export const tileChoices = (sample) => {
  const used = new Set(sample.tiles.map((t) => t.proto));
  return Object.entries(sample.prototiles).filter(([id]) => used.has(id)).map(([id, p]) => ({ id, label: p.tileClass?.label ?? 'A' }));
};

/** Tile of that class nearest the patch centre. */
function referenceTile(sample, pid) {
  const centre = (t) => dist(apply(t.transform, sample.prototiles[pid].center));
  return sample.tiles.filter((t) => t.proto === pid).sort((a, b) => centre(a) - centre(b))[0];
}

export function tileEditorSVG({ sample, classes, shape, tile, invalid = false, px = EDITOR_PX }) {
  const choices = tileChoices(sample), pid = choices.some((c) => c.id === tile) ? tile : choices[0]?.id, ref = pid && referenceTile(sample, pid);
  if (!ref) return '';
  const shaped = applyShape(sample, shape, classes), base = sample.prototiles[pid], sp = shaped.prototiles[pid];
  const side = edgeFrame(base.edges[0].path).L, outline = outlinePoints(base);
  const E = Math.max(...outline.flat().map(Math.abs)) + MARGIN * side, u = (2 * E) / px, r = HANDLE_PX * u;
  const reach = E + Math.max(...outline.map(dist));
  const outlineD = (proto) => poly(outlinePoints(shaped.prototiles[proto]), true);

  const inv = invert(ref.transform);
  let ghosts = '';
  for (const t of sample.tiles) {
    if (t === ref) continue;
    const G = multiply(inv, t.transform);
    if (dist(apply(G, shaped.prototiles[t.proto].center)) <= reach) ghosts += `<path d="${outlineD(t.proto)}" transform="matrix(${G.map(f).join(' ')})"/>`;
  }

  const role = new Map();
  for (const c of classes) for (const m of c.members) role.set(`${m.proto}/${m.edge}`, { c, m });
  let edges = '', hits = '', handles = '', markers = '';
  base.edges.forEach((e, i) => {
    const hit = role.get(`${pid}/${e.id}`), pts = pathPoints(sp.edges[i].path);
    if (!hit || hit.c.kind === 'locked') { edges += `<path class="edge locked" d="${poly(pts)}"/>`; return; }
    const { c, m } = hit, isRep = c.rep.proto === pid && c.rep.edge === e.id, inner = pts.slice(1, -1);
    if (c.kind === 'symmetric' && !isRep) { // follows the representative; not editable from here
      edges += `<path class="edge derived" d="${poly(pts)}"/>`;
      inner.forEach(([x, y]) => { markers += `<circle class="derived-pt" cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.6)}"/>`; });
      return;
    }
    const attrs = `data-pid="${esc(pid)}" data-edge="${esc(e.id)}"`;
    const q = pointsOf(shape, { generator: sample.meta.generator, pid: c.rep.proto, eid: c.rep.edge }).length;
    edges += `<path class="edge ${isRep ? 'rep' : 'derived'}" d="${poly(pts)}"/>`;
    hits += `<path class="hit" ${attrs} d="${poly(pts)}"/>`;
    inner.forEach(([x, y], k) => {
      const at = `cx="${f(x)}" cy="${f(y)}"`;
      if (c.kind === 'free') handles += `<circle class="handle" ${attrs} data-index="${m.reversed ? inner.length - 1 - k : k}" ${at} r="${f(r)}"/>`;
      else if (k < q) handles += `<circle class="handle" ${attrs} data-index="${k}" ${at} r="${f(r)}"/>`;
      else if (k === q) markers += `<circle class="fixed-pt" ${at} r="${f(r * 0.6)}"/>`;
      else markers += `<circle class="derived-pt" ${at} r="${f(r * 0.6)}"/>`;
    });
  });
  return `<svg class="tile-editor${invalid ? ' invalid' : ''}" xmlns="http://www.w3.org/2000/svg" viewBox="${f(-E)} ${f(-E)} ${f(2 * E)} ${f(2 * E)}">`
    + `<g class="ghosts">${ghosts}</g><path class="tile" d="${outlineD(pid)}"/><path class="base" d="${poly(outline, true)}"/>`
    + `<g class="edges">${edges}</g><g class="hits">${hits}</g><g class="markers">${markers}</g><g class="handles">${handles}</g></svg>`;
}
