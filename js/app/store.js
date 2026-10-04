/**
 * Minimal state store with undo/redo. set(patch) shallow-merges and notifies subscribers.
 * History: each set() records the previous state, except that edits arriving within `mergeMs` of the
 * previous edit join its undo step (so typing or dragging a value is one step). Pass { step: true }
 * to force a new step (generator change, preset, project load). Pass { merge: true } to join the previous
 * edit's step however long ago it was (the moves of a pointer drag: the first uses `step`, the rest `merge`);
 * it still opens a step when there is nothing to join (first edit, or first edit after an undo/redo).
 * A new edit clears the redo stack.
 * `now` is injectable for tests.
 */
export function createStore(init, { limit = 100, mergeMs = 400, now = () => Date.now() } = {}) {
  let state = init, last = -Infinity;
  const past = [], future = [], subs = new Set();
  const emit = () => subs.forEach((f) => f(state));
  const jump = (from, to) => {
    if (!from.length) return false;
    to.push(state);
    state = from.pop();
    last = -Infinity; // the next edit starts a fresh step
    emit();
    return true;
  };
  return {
    get: () => state,
    set(patch, { step = false, merge = false } = {}) {
      const t = now();
      const joins = last > -Infinity && (merge || t - last <= mergeMs);
      if (step || !joins) { past.push(state); if (past.length > limit) past.shift(); }
      last = t;
      future.length = 0;
      state = { ...state, ...patch };
      emit();
    },
    undo: () => jump(past, future),
    redo: () => jump(future, past),
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };
}
