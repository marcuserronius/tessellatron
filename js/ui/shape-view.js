/**
 * Shape tab: the tile editor and its pointer handling (DOM; the markup comes from ui/tile-editor-svg.js).
 *   mountShapeView(root, { getState, setShape, setParams }) -> { update() }
 *     getState():            current store state
 *     setShape(shape, opts): store.set({ shape }, opts)  (opts = { step } or { merge }, see app/store.js)
 *     setParams(patch, opts): merge a param patch into state.params (used by "Make tiling editable")
 *   update() re-renders from the state; call it after any store change while the tab is visible.
 * The tiling mode (editor/modes.js) says how many tile shapes there are and which tiles are turned or flipped; the Shape tab offers it as two selects, "Tile shapes" (1, 2, 3) and "Tiles are" (the variant: turned / flipped), which together pick a mode; the line under it
 * lists which edges are the same curve (derived from the tiling, so it is always true). Which edges can be edited, and
 * which follow them, comes from the edge classes (editor/classes.js). The tile selector (A, B, ...) picks which shape is
 * shown, and an edge shared with a neighbouring tile changes both.
 * Pointer positions are mapped into the class's representative frame, so any member of an edge class can be dragged.
 * Interaction: press a point and drag to move it; press an edge to add a point there and keep dragging. Pressing a
 * point (or the ring just inside an edge's end, or the middle marker of a symmetric edge) SELECTS that node: its
 * handles appear (a straight segment shows its handle where a line has it; pulling it makes the segment a curve),
 * drag a handle to shape the curve (a smooth node keeps its two handles in line; hold Alt, or tick "Move handles one at a time" on a touch screen, to move one alone), and the
 * buttons under the editor make the node Smooth, make it a Corner (retract the handles) or Delete it; Delete or
 * Backspace delete the selected node too, Escape or pressing empty space deselect. The start and end of an edge are
 * pinned: selectable (for their handles) but neither movable nor deletable. A move that would make a polyline tile
 * cross itself is refused (the tile turns red until the pointer comes back to a valid spot; outlines with curves are
 * not checked yet). The view zooms out just enough to keep the selected node's handles visible and, during a drag,
 * never zooms back in. One drag is one undo step: first change `step`, rest `merge`.
 * The selection is kept as { pid, eid, node, count }: the edge class's representative, the node's number in the stored
 * path and how many nodes the path had when it was made. It survives re-rendering, tile switches and undo of moves; it
 * is dropped when the node count changes behind its back (undo of an insertion, loading a file), since the numbers
 * then mean different nodes.
 */
import { editorModel } from '../app/pipeline.js';
import { apply, invert } from '../core/affine.js';
import { slotKey } from '../editor/classes.js';
import { canEdit, editableParams, edgeFrame, fromLocal, crossingProblems, shapeNotes, EDITABLE } from '../editor/shape.js';
import { clampPoint, cornerNode, edgeValue, insertPoint, movePoint, nearestOnEdge, nodeAt, nodeCount, pointsOf, removePoint, setHandle, smoothNode, withMode } from '../editor/edit.js';
import { DEFAULT_MODE, describeEdges, modeFor, modesOf, shapeCounts, variantsOf } from '../editor/modes.js';
import { tileChoices, tileEditorSVG } from './tile-editor-svg.js';

export function mountShapeView(root, { getState, setShape, setParams }) {
  root.innerHTML = '<div class="mode-fields" hidden><label class="field">Tile shapes <select data-act="shapes"></select></label><label class="field">Tiles are <select data-act="variant"></select></label></div><p class="hint relations" hidden></p><p class="hint"></p><p class="hint note" hidden></p><div class="tile-tabs" hidden></div><div class="buttons"><button data-act="fix" hidden>Make tiling editable</button></div>'
    + '<div class="editor-host"></div><div class="buttons node-tools" hidden><button data-act="smooth">Smooth</button><button data-act="corner">Corner</button><button data-act="delete">Delete node</button><label class="toggle"><input type="checkbox" data-act="solo"> Move handles one at a time</label></div>'
    + '<div class="buttons"><button data-act="reset">Reset shape</button></div>';
  const hint = root.querySelector('.hint:not(.note):not(.relations)'), relations = root.querySelector('.relations'), modeField = root.querySelector('.mode-fields'), shapesSelect = root.querySelector('[data-act=shapes]'), variantSelect = root.querySelector('[data-act=variant]'), note = root.querySelector('.note'), tabs = root.querySelector('.tile-tabs'), host = root.querySelector('.editor-host');
  const fix = root.querySelector('[data-act=fix]'), reset = root.querySelector('[data-act=reset]'), tools = root.querySelector('.node-tools');
  const smoothBtn = tools.querySelector('[data-act=smooth]'), cornerBtn = tools.querySelector('[data-act=corner]'), deleteBtn = tools.querySelector('[data-act=delete]'), solo = tools.querySelector('[data-act=solo]');
  let ctx = null, drag = null, last = '', invalid = false, selected = null, tabsHTML = '', modesHTML = '', sel = null;

  /** The shared curve behind an edge element: where it is stored (the class representative) and how to reach it. */
  const resolve = (el) => {
    const info = ctx?.slots.get(`${el.dataset.pid}/${el.dataset.edge}`);
    return info && { ...info, at: { generator: getState().generator, pid: info.cls.rep.proto, eid: info.cls.rep.edge, kind: info.kind } };
  };
  const current = () => { const { shape, generator } = getState(); return shape?.generator === generator ? shape : null; };
  const accepts = (next) => crossingProblems(ctx.sample, next, ctx.classes).length === 0;
  /** The selected node as the editor sees it: { at, node } (node = nodeAt's description), or null if it no longer exists. */
  function selNode() {
    const c = sel && ctx?.classes.find((k) => k.rep.proto === sel.pid && k.rep.edge === sel.eid && k.kind !== 'locked');
    if (!c) return null;
    const at = { generator: getState().generator, pid: sel.pid, eid: sel.eid, kind: c.kind }, node = nodeAt(current(), at, sel.node);
    return node && { at, node };
  }
  const flag = (bad) => { invalid = bad; host.firstElementChild?.classList.toggle('invalid', bad); };

  /** Pointer position in the shown tile's prototile coordinates (the editor's viewBox units). */
  function toUser(e) {
    const svg = host.firstElementChild, [x, y, w, h] = svg.getAttribute('viewBox').split(' ').map(Number);
    const r = svg.getBoundingClientRect();
    return [x + ((e.clientX - r.left) / r.width) * w, y + ((e.clientY - r.top) / r.height) * h];
  }

  function update() {
    const st = getState(), { ok, reasons } = canEdit(st.generator, st.params), patch = editableParams(st.generator, st.params);
    hint.className = `hint${ok ? '' : ' warn'}`;
    hint.textContent = ok ? 'Drag a point to reshape; press an edge to add a point. Select a point to get its handles (Smooth makes a curve), Delete removes it. The dashed edge follows automatically.'
      : `${reasons.join('. ')}. The preview still shows the shape, but tiles may not fit.`;
    fix.hidden = !patch || !Object.keys(patch).length;
    reset.disabled = !current();
    if (!EDITABLE.includes(st.generator)) { ctx = null; sel = null; tools.hidden = true; host.replaceChildren(); last = ''; note.hidden = true; modeField.hidden = relations.hidden = true; return; }
    const { sample, classes } = editorModel(st), slots = new Map(), choices = tileChoices(sample);
    for (const c of classes) {
      if (c.kind === 'locked') continue;
      const frame = edgeFrame(sample.prototiles[c.rep.proto].edges.find((e) => e.id === c.rep.edge).path);
      for (const m of c.members) {
        if (c.kind === 'symmetric' && (m.proto !== c.rep.proto || m.edge !== c.rep.edge)) continue; // follows the representative
        slots.set(slotKey(m), { cls: c, kind: c.kind, frame, inv: invert(m.transform) });
      }
    }
    ctx = { sample, classes, slots };
    const modes = modesOf(st.generator), current0 = current(), modeNow = current0?.mode ?? DEFAULT_MODE;
    const counts = shapeCounts(st.generator), variants = variantsOf(st.generator), now = modes.find((m) => m.id === modeNow) ?? modes[0];
    const mhtml = counts.map((n) => `<option value="${n}">${n === 1 ? 'One shape' : n === 2 ? 'Two shapes' : n === 3 ? 'Three shapes' : `${n} shapes`}</option>`).join('')
      + '|' + variants.map(([id, label]) => `<option value="${id}">${label}</option>`).join('');
    if (mhtml !== modesHTML) {
      [shapesSelect.innerHTML, variantSelect.innerHTML] = (modesHTML = mhtml).split('|');
    }
    shapesSelect.value = String(now?.shapes ?? 1);
    variantSelect.value = now?.variant ?? '';
    variantSelect.parentElement.hidden = variants.length < 2;
    modeField.hidden = modes.length < 2;
    relations.hidden = false;
    relations.textContent = describeEdges(sample, classes, st.generator).join(' · ');
    if (!choices.some((c) => c.id === selected)) selected = choices[0]?.id ?? null;
    const html0 = choices.length > 1 ? choices.map((c) => `<button data-tile="${c.id}" aria-pressed="${c.id === selected}">Tile ${c.label}</button>`).join('') : '';
    if (html0 !== tabsHTML) { tabs.innerHTML = tabsHTML = html0; }
    tabs.hidden = !html0;
    if (ok && choices.length > 1) hint.textContent += ' Each tile has its own shape; an edge it shares with a neighbouring tile changes both.';
    if (ok && st.params.orientMode && st.params.orientMode !== 'none') hint.textContent += ' Tile turns come from the tiling mode here; the Orientation setting is ignored while shapes are applied.';
    const notes = shapeNotes(sample, current(), classes);
    note.hidden = !notes.length;
    note.textContent = notes.length ? `Ignored: ${notes.join('; ')}.` : '';
    let s = selNode();
    if (s) { // node numbers shift when nodes are added or removed behind our back (undo, redo, load): then the selection means nothing
      const count = nodeCount(current(), s.at);
      if (sel.count == null) sel.count = count; else if (sel.count !== count) { sel = null; s = null; }
    } else sel = null;
    tools.hidden = !s;
    if (s) { smoothBtn.disabled = deleteBtn.disabled = !s.node.interior; cornerBtn.disabled = !(s.node.in || s.node.out); }
    const html = tileEditorSVG({ sample, classes, shape: current(), tile: selected, invalid, selected: sel, minE: drag?.minE ?? 0 });
    if (html !== last) { host.innerHTML = last = html; }
    if (drag) drag.minE = Math.max(drag.minE ?? 0, -Number(host.firstElementChild.getAttribute('viewBox').split(' ')[0])); // while dragging the view only grows
  }

  host.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const el = e.target.closest?.('[data-edge]'), info = el && resolve(el);
    if (!info) { if (sel) { sel = null; update(); } return; } // empty space: deselect
    e.preventDefault();
    const rep = () => apply(info.inv, toUser(e)), node = Number(el.dataset.node), pick = (n) => { sel = { pid: info.at.pid, eid: info.at.eid, node: n, count: null }; };
    const cl = el.classList;
    if (cl.contains('ctl')) { pick(node); drag = { kind: 'handle', info, node, role: el.dataset.role, moved: false }; }
    else if (cl.contains('handle')) { pick(node); drag = { kind: 'point', info, index: Number(el.dataset.index), moved: false }; update(); }
    else if (cl.contains('end-pt') || cl.contains('fixed-pt')) { pick(node); update(); return; } // pinned: select only
    else {
      const hit = nearestOnEdge(info.frame, edgeValue(current(), info.at), rep(), info.kind), next = insertPoint(current(), info.at, hit.index, clampPoint(hit.point), hit.u);
      if (next === current() || !accepts(next)) return;
      pick(hit.index + 1); // before setShape: its update() then already shows the new node selected
      setShape(next, { step: true });
      drag = { kind: 'point', info, index: hit.index, moved: true };
    }
    host.setPointerCapture?.(e.pointerId);
  });

  host.addEventListener('pointermove', (e) => {
    if (!drag || !ctx) return;
    const { info } = drag, p = clampPoint(fromLocal(info.frame, apply(info.inv, toUser(e))));
    const old = drag.kind === 'handle' ? nodeAt(current(), info.at, drag.node)?.[drag.role] : pointsOf(current(), info.at)[drag.index];
    if (old && old[0] === p[0] && old[1] === p[1]) return;
    const next = drag.kind === 'handle' ? setHandle(current(), info.at, drag.node, drag.role, p, { lock: !(e.altKey || solo.checked) }) : movePoint(current(), info.at, drag.index, p);
    if (next === current()) return;
    if (!accepts(next)) { flag(true); return; }
    flag(false);
    setShape(next, drag.moved ? { merge: true } : { step: true });
    drag.moved = true;
  });

  const end = (e) => { if (drag) { host.releasePointerCapture?.(e.pointerId); drag = null; update(); } if (invalid) flag(false); };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);

  /** Run an edit of the selected node; refused (nothing happens) if it changes nothing or the tile would cross itself. */
  function editNode(op, { deselect = false } = {}) {
    const s = selNode();
    if (!s) return;
    const next = op(current(), s.at, sel.node);
    if (next === current() || !accepts(next)) return;
    if (deselect) sel = null;
    setShape(next, { step: true });
  }
  smoothBtn.addEventListener('click', () => editNode(smoothNode));
  cornerBtn.addEventListener('click', () => editNode(cornerNode));
  const remove = () => editNode((shape, at, node) => (selNode()?.node.interior ? removePoint(shape, at, node - 1) : shape), { deselect: true });
  deleteBtn.addEventListener('click', remove);
  document.addEventListener('keydown', (e) => {
    if (root.hidden || !sel || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.target?.closest?.('input:not([type=checkbox]), select, textarea, [contenteditable]')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); }
    else if (e.key === 'Escape') { sel = null; update(); }
  });

  const chooseMode = () => {
    const gen = getState().generator, id = modeFor(gen, Number(shapesSelect.value), variantSelect.value);
    if (id) setShape(withMode(current(), gen, id), { step: true });
  };
  shapesSelect.addEventListener('change', chooseMode);
  variantSelect.addEventListener('change', chooseMode);
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-tile]');
    if (b) { selected = b.dataset.tile; last = ''; update(); }
  });
  fix.addEventListener('click', () => { const st = getState(); setParams(editableParams(st.generator, st.params), { step: true }); });
  reset.addEventListener('click', () => setShape(null, { step: true }));
  update();
  return { update };
}
