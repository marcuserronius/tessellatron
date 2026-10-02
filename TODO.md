# TODO

Unimplemented items and known gaps. Milestone numbers refer to `ARCHITECTURE.md`.

## Generators
- [ ] Wallpaper-group (p1…p6m) motif presets built on `lattice.js`.
- [ ] Aperiodic generators (milestone 6): hat/spectre, cut-and-project, Truchet. (Penrose P1/P2/P3 done: `generators/aperiodic/`.)
- [ ] Penrose: matching-rule decorations (P3 arrows, P2 curves, P1 markings) as edge classes, and the six decorated P1 tiles. Today the plain shapes are emitted and the tiling is only guaranteed legal by construction.
- [ ] Penrose: other 5-fold centres (the other parity gives a different 5-fold tiling), or a generic centre / phason shift so the pattern can be panned beyond the origin.
- [ ] Penrose: `tileSet` conversions P2 <-> P3 <-> P1 are by regrouping the same patch; a stored tiling would need the same ring coordinates (not floats) to convert exactly.

## Orientation / rotation
- [ ] Mirror/flip support (`orient.flip` is always `false`).

## Editor (milestone 5)
- [ ] `js/editor/`: edit prototile edges under the symmetry constraints in each edge's `pair`.
- [ ] Curved edge paths: the renderer supports only `M`/`L`/`Z` (`pathD` in `render/svg.js`).
- [ ] Edge-pairing metadata for all future generators (squares, triangles, hexagons done). The Archimedean tilings and Penrose have none: their edges are shared between different prototiles, so the IR needs inter-prototile pairing (edge classes) first.

## App / UX
- [ ] Pan and zoom in the preview (region is currently fixed to the canvas size). Needs a decision on whether export follows the viewport.
- [ ] More presets (Archimedean tilings currently ship only colouring and mirror presets).
- [ ] In-page views (Generate, Shape, Export, Presets).
- [ ] More colorings (graph coloring, per-prototile palettes). Gradient is done.

## Tooling
- [ ] UI tests for the wiring in `main.js` (presets, project load/save, undo/redo buttons and shortcuts, URL hash); the pure parts are covered in `tests/project.test.js`, `tests/store.test.js` and `tests/bundle.test.js`. A manual jsdom run of the bundled page (`npm run bundle`, then load `dist/tessellatron.html` with `runScripts: 'dangerously'`) exercised all of it; making that a test needs `jsdom` as a devDependency.
