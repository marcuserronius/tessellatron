import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/app/store.js';

const make = () => { const clock = { t: 0 }; const s = createStore({ n: 0 }, { now: () => clock.t, mergeMs: 400, limit: 3 }); return { s, clock }; };

test('edits within the merge window form one undo step', () => {
  const { s, clock } = make();
  s.set({ n: 1 }); clock.t = 100; s.set({ n: 2 }); clock.t = 250; s.set({ n: 3 });
  assert.ok(s.undo());
  assert.equal(s.get().n, 0);
  assert.ok(!s.canUndo());
});

test('edits after a pause are separate steps; redo restores; a new edit clears redo', () => {
  const { s, clock } = make();
  s.set({ n: 1 }); clock.t = 1000; s.set({ n: 2 });
  s.undo(); assert.equal(s.get().n, 1);
  s.undo(); assert.equal(s.get().n, 0);
  s.redo(); assert.equal(s.get().n, 1);
  assert.ok(s.canRedo());
  clock.t = 2000; s.set({ n: 9 });
  assert.ok(!s.canRedo());
  assert.equal(s.redo(), false);
});

test('{ step: true } forces a new step; the first edit after undo starts a new step', () => {
  const { s, clock } = make();
  s.set({ n: 1 }); clock.t = 10; s.set({ n: 2 }, { step: true });
  s.undo(); assert.equal(s.get().n, 1);
  clock.t = 20; s.set({ n: 5 }); // within the window of the earlier edit, but after an undo
  s.undo(); assert.equal(s.get().n, 1);
});

test('history is capped at `limit`; subscribers are told about undo/redo', () => {
  const { s, clock } = make();
  for (let i = 1; i <= 6; i++) { clock.t = i * 1000; s.set({ n: i }); }
  let undone = 0, seen = [];
  s.subscribe((st) => seen.push(st.n));
  while (s.undo()) undone++;
  assert.equal(undone, 3);
  assert.equal(s.get().n, 3);
  s.redo();
  assert.deepEqual(seen, [5, 4, 3, 4]);
});

test('undo/redo on empty history are no-ops', () => {
  const { s } = make();
  assert.equal(s.undo(), false);
  assert.equal(s.redo(), false);
  assert.deepEqual(s.get(), { n: 0 });
});
