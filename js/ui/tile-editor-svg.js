/**
 * Markup for the shape editor's tile view (pure: model -> SVG string, no DOM, so it can be tested in node).
 *   tileEditorSVG({ sample, classes, shape, tile?, invalid?, selected?, minE? }) -> string
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
 *   derived-pt / fixed-pt   hollow markers for points that follow (derived) or are fixed (middle of a symmetric edge;
 *               pressing it selects that node, whose in handle can be dragged)
 *   end-pt      selects the start or end of an editable edge (pinned corners): a small ring just inside the edge's end,
 *               so the two edges that meet at a corner each have their own
 *   arm / ctl   for the selected node only: a line from the anchor to each handle, and the handle (data-node = stored
 *               node number, data-role = 'in' | 'out' in the STORED curve, so it is swapped for a reversed member).
 *               A segment that is a plain line shows its handle where a straight line has it (class ctl virtual);
 *               pulling it turns the segment into a curve
 * The view zooms out, centred on the origin, just enough to keep the selected node's handles inside it.
 */
import { apply, invert, multiply } from '../core/affine.js';
import { pathPoints, pathToD } from '../core/path.js';
import { applyShape, edgeFrame, outlinePath, outlinePoints } from '../editor/shape.js';
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

const lerp = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];

/** The handles of display node `d` of a (display-order) path: [{ side: 'arrive' | 'leave', anchor, pos, virtual }]. */
function handlesOf(path, P, d, skipLeave) {
  const out = [], show = (side, seg, anchor, other, ctl) => {
    const real = seg[0] === 'C' && Math.hypot(ctl[0] - anchor[0], ctl[1] - anchor[1]) > 1e-9;
    out.push({ side, anchor, pos: real ? ctl : lerp(anchor, other, 1 / 3), virtual: !real });
  };
  if (d >= 1) show('arrive', path[d], P[d], P[d - 1], [path[d][3], path[d][4]]);
  if (d + 1 < path.length && !skipLeave) show('leave', path[d + 1], P[d], P[d + 1], [path[d + 1][1], path[d + 1][2]]);
  return out;
}

export function tileEditorSVG({ sample, classes, shape, tile, invalid = false, px = EDITOR_PX, selected = null, minE = 0 }) {
  const choices = tileChoices(sample), pid = choices.some((c) => c.id === tile) ? tile : choices[0]?.id, ref = pid && referenceTile(sample, pid);
  if (!ref) return '';
  const shaped = applyShape(sample, shape, classes), base = sample.prototiles[pid], sp = shaped.prototiles[pid];
  const side = edgeFrame(base.edges[0].path).L, outline = outlinePoints(base);

  const role = new Map();
  for (const c of classes) for (const m of c.members) role.set(`${m.proto}/${m.edge}`, { c, m });
  // pass 1: what each edge of the shown tile is, and where the selected node's handles are (they can decide the zoom)
  const items = base.edges.map((e, i) => {
    const hit = role.get(`${pid}/${e.id}`), path = sp.edges[i].path, P = pathPoints(path);
    const item = { e, path, P, d: pathToD(path), hit };
    if (!hit || hit.c.kind === 'locked') return { ...item, mode: 'locked' };
    const { c, m } = hit, isRep = c.rep.proto === pid && c.rep.edge === e.id;
    if (c.kind === 'symmetric' && !isRep) return { ...item, mode: 'follows', c, m, isRep };
    const q = c.kind === 'symmetric' ? pointsOf(shape, { generator: sample.meta.generator, pid: c.rep.proto, eid: c.rep.edge, kind: c.kind }).length : null;
    const last = c.kind === 'symmetric' ? q + 1 : P.length - 1, flip = (n) => (m.reversed && q === null ? P.length - 1 - n : n); // display node <-> stored node
    const it = { ...item, mode: 'edit', c, m, isRep, q, last, flip, nodes: [] };
    if (selected && c.rep.proto === selected.pid && c.rep.edge === selected.eid) {
      const d = flip(selected.node);
      if (d >= 0 && d <= last) it.sel = { d, handles: handlesOf(path, P, d, q !== null && d === last) };
    }
    return it;
  });
  const need = Math.max(0, ...items.flatMap((it) => it.sel?.handles ?? []).flatMap((h) => h.pos.map(Math.abs)));
  const E = Math.max(Math.max(...outline.flat().map(Math.abs)) + MARGIN * side, minE, need / (1 - (4 * HANDLE_PX) / px)); // room for the handle and a radius to spare
  const u = (2 * E) / px, r = HANDLE_PX * u, reach = E + Math.max(...outline.map(dist));
  const outlineD = (proto) => pathToD(outlinePath(shaped.prototiles[proto]));

  const inv = invert(ref.transform);
  let ghosts = '';
  for (const t of sample.tiles) {
    if (t === ref) continue;
    const G = multiply(inv, t.transform);
    if (dist(apply(G, shaped.prototiles[t.proto].center)) <= reach) ghosts += `<path d="${outlineD(t.proto)}" transform="matrix(${G.map(f).join(' ')})"/>`;
  }

  // pass 2: the markup
  let edges = '', hits = '', handles = '', markers = '', arms = '', ctls = '';
  for (const it of items) {
    const { e, P, d } = it;
    if (it.mode === 'locked') { edges += `<path class="edge locked" d="${d}"/>`; continue; }
    const { c, m, isRep } = it, inner = P.slice(1, -1);
    if (it.mode === 'follows') { // follows the representative; not editable from here
      edges += `<path class="edge derived" d="${d}"/>`;
      inner.forEach(([x, y]) => { markers += `<circle class="derived-pt" cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.6)}"/>`; });
      continue;
    }
    const attrs = `data-pid="${esc(pid)}" data-edge="${esc(e.id)}"`, { q, last, flip } = it, symmetric = c.kind === 'symmetric';
    const isSel = (dn) => it.sel?.d === dn, cls = (name, dn) => `class="${name}${isSel(dn) ? ' selected' : ''}"`;
    edges += `<path class="edge ${isRep ? 'rep' : 'derived'}" d="${d}"/>`;
    hits += `<path class="hit" ${attrs} d="${d}"/>`;
    const stored = (dn) => flip(dn); // flip is its own inverse
    inner.forEach(([x, y], k) => {
      const at = `cx="${f(x)}" cy="${f(y)}"`, dn = k + 1;
      if (!symmetric) handles += `<circle ${cls('handle', dn)} ${attrs} data-index="${m.reversed ? inner.length - 1 - k : k}" data-node="${stored(dn)}" ${at} r="${f(r)}"/>`;
      else if (k < q) handles += `<circle ${cls('handle', dn)} ${attrs} data-index="${k}" data-node="${dn}" ${at} r="${f(r)}"/>`;
      else if (k === q) markers += `<circle ${cls('fixed-pt', dn)} ${attrs} data-node="${dn}" ${at} r="${f(r * 0.6)}"/>`;
      else markers += `<circle class="derived-pt" ${at} r="${f(r * 0.6)}"/>`;
    });
    for (const dn of [0, ...(symmetric ? [] : [P.length - 1])]) { // the ends: a ring just inside the edge, so the two edges meeting at a corner stay apart
      const a = P[dn], b = P[dn === 0 ? 1 : dn - 1], gap = Math.hypot(b[0] - a[0], b[1] - a[1]), [x, y] = lerp(a, b, gap ? Math.min(2.6 * r, 0.45 * gap) / gap : 0);
      markers += `<circle ${cls('end-pt', dn)} ${attrs} data-node="${stored(dn)}" cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.7)}"/>`;
    }
    for (const h of it.sel?.handles ?? []) {
      const roleStored = (h.side === 'arrive') !== (m.reversed && !symmetric) ? 'in' : 'out';
      arms += `<line class="arm" x1="${f(h.anchor[0])}" y1="${f(h.anchor[1])}" x2="${f(h.pos[0])}" y2="${f(h.pos[1])}"/>`;
      ctls += `<circle class="ctl${h.virtual ? ' virtual' : ''}" ${attrs} data-node="${stored(it.sel.d)}" data-role="${roleStored}" cx="${f(h.pos[0])}" cy="${f(h.pos[1])}" r="${f(r * 0.85)}"/>`;
    }
  }
  return `<svg class="tile-editor${invalid ? ' invalid' : ''}" xmlns="http://www.w3.org/2000/svg" viewBox="${f(-E)} ${f(-E)} ${f(2 * E)} ${f(2 * E)}">`
    + `<g class="ghosts">${ghosts}</g><path class="tile" d="${outlineD(pid)}"/><path class="base" d="${poly(outline, true)}"/>`
    + `<g class="edges">${edges}</g><g class="hits">${hits}</g><g class="arms">${arms}</g><g class="markers">${markers}</g><g class="handles">${handles}</g><g class="ctls">${ctls}</g></svg>`;
}
