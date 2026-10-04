/**
 * Shape tab: the tile editor and its pointer handling (DOM; the markup comes from ui/tile-editor-svg.js).
 *   mountShapeView(root, { getState, setShape, setParams }) -> { update() }
 *     getState():            current store state
 *     setShape(shape, opts): store.set({ shape }, opts)  (opts = { step } or { merge }, see app/store.js)
 *     setParams(patch, opts): merge a param patch into state.params (used by "Make tiling editable")
 *   update() re-renders from the state; call it after any store change while the tab is visible.
 * The tiling mode (editor/modes.js) says how many tile shapes there are and which tiles are turned; the line under it
 * lists which edges are the same curve (derived from the tiling, so it is always true). Which edges can be edited, and
 * which follow them, comes from the edge classes (editor/classes.js). The tile selector (A, B, ...) picks which shape is
 * shown, and an edge shared with a neighbouring tile changes both.
 * Pointer positions are mapped into the class's representative frame, so any member of an edge class can be dragged.
 * Interaction: press a handle and drag to move it; press an edited edge to add a point there and keep dragging;
 * double-click a handle to remove it. A move that would make the tile cross itself is refused (the tile turns
 * red until the pointer comes back to a valid spot). One drag is one undo step: first change `step`, rest `merge`.
 */
import { editorModel } from '../app/pipeline.js';
import { apply, invert } from '../core/affine.js';
import { slotKey } from '../editor/classes.js';
import { canEdit, editableParams, edgeFrame, fromLocal, crossingProblems, shapeNotes, EDITABLE } from '../editor/shape.js';
import { clampPoint, insertPoint, movePoint, nearestOnEdge, pointsOf, removePoint, withMode } from '../editor/edit.js';
import { DEFAULT_MODE, describeEdges, modesOf } from '../editor/modes.js';
import { tileChoices, tileEditorSVG } from './tile-editor-svg.js';

export function mountShapeView(root, { getState, setShape, setParams }) {
  root.innerHTML = '<label class="field" hidden>Tiling <select data-act="mode"></select></label><p class="hint relations" hidden></p><p class="hint"></p><p class="hint note" hidden></p><div class="tile-tabs" hidden></div><div class="buttons"><button data-act="fix" hidden>Make tiling editable</button></div>'
    + '<div class="editor-host"></div><div class="buttons"><button data-act="reset">Reset shape</button></div>';
  const hint = root.querySelector('.hint:not(.note):not(.relations)'), relations = root.querySelector('.relations'), modeField = root.querySelector('.field'), modeSelect = root.querySelector('[data-act=mode]'), note = root.querySelector('.note'), tabs = root.querySelector('.tile-tabs'), host = root.querySelector('.editor-host');
  const fix = root.querySelector('[data-act=fix]'), reset = root.querySelector('[data-act=reset]');
  let ctx = null, drag = null, last = '', invalid = false, selected = null, tabsHTML = '', modesHTML = '';

  /** The shared curve behind an edge element: where it is stored (the class representative) and how to reach it. */
  const resolve = (el) => {
    const info = ctx?.slots.get(`${el.dataset.pid}/${el.dataset.edge}`);
    return info && { ...info, at: { generator: getState().generator, pid: info.cls.rep.proto, eid: info.cls.rep.edge } };
  };
  const current = () => { const { shape, generator } = getState(); return shape?.generator === generator ? shape : null; };
  const accepts = (next) => crossingProblems(ctx.sample, next, ctx.classes).length === 0;
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
    hint.textContent = ok ? 'Drag a handle to reshape; press an edge to add a point; double-click a point to remove it. The dashed edge follows automatically.'
      : `${reasons.join('. ')}. The preview still shows the shape, but tiles may not fit.`;
    fix.hidden = !patch || !Object.keys(patch).length;
    reset.disabled = !current();
    if (!EDITABLE.includes(st.generator)) { ctx = null; host.replaceChildren(); last = ''; note.hidden = true; modeField.hidden = relations.hidden = true; return; }
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
    const mhtml = modes.map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
    if (mhtml !== modesHTML) { modeSelect.innerHTML = modesHTML = mhtml; }
    modeSelect.value = modeNow;
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
    const html = tileEditorSVG({ sample, classes, shape: current(), tile: selected, invalid });
    if (html !== last) { host.innerHTML = last = html; }
  }

  host.addEventListener('pointerdown', (e) => {
    const el = e.target.closest?.('[data-edge]'), info = el && resolve(el);
    if (!info || e.button > 0) return;
    e.preventDefault();
    const rep = () => apply(info.inv, toUser(e)); // pointer in the representative's frame
    if (el.classList.contains('handle')) drag = { info, index: Number(el.dataset.index), moved: false };
    else {
      const hit = nearestOnEdge(info.frame, pointsOf(current(), info.at), rep(), info.kind), next = insertPoint(current(), info.at, hit.index, clampPoint(hit.point));
      if (next === current() || !accepts(next)) return;
      setShape(next, { step: true });
      drag = { info, index: hit.index, moved: true };
    }
    host.setPointerCapture?.(e.pointerId);
  });

  host.addEventListener('pointermove', (e) => {
    if (!drag || !ctx) return;
    const { info } = drag, p = clampPoint(fromLocal(info.frame, apply(info.inv, toUser(e)))), old = pointsOf(current(), info.at)[drag.index];
    if (old && old[0] === p[0] && old[1] === p[1]) return;
    const next = movePoint(current(), info.at, drag.index, p);
    if (!accepts(next)) { flag(true); return; }
    flag(false);
    setShape(next, drag.moved ? { merge: true } : { step: true });
    drag.moved = true;
  });

  const end = (e) => { if (drag) { host.releasePointerCapture?.(e.pointerId); drag = null; } if (invalid) flag(false); };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);

  host.addEventListener('dblclick', (e) => {
    const el = e.target.closest?.('.handle'), info = el && resolve(el);
    if (!info) return;
    const next = removePoint(current(), info.at, Number(el.dataset.index));
    if (accepts(next)) setShape(next, { step: true });
  });

  modeSelect.addEventListener('change', () => setShape(withMode(current(), getState().generator, modeSelect.value), { step: true }));
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-tile]');
    if (b) { selected = b.dataset.tile; last = ''; update(); }
  });
  fix.addEventListener('click', () => { const st = getState(); setParams(editableParams(st.generator, st.params), { step: true }); });
  reset.addEventListener('click', () => setShape(null, { step: true }));
  update();
  return { update };
}
