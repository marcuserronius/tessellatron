/** Minimal state store. set(patch) shallow-merges and notifies subscribers. */
export function createStore(init) {
  let state = init;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) { state = { ...state, ...patch }; subs.forEach((f) => f(state)); },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };
}
