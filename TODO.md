# TODO

Unimplemented items and known gaps. Milestone numbers refer to `ARCHITECTURE.md`.

## Generators
- [ ] Wallpaper-group (p1…p6m) motif presets built on `lattice.js`.
- [ ] Migrate `square.js` onto `latticeTiles` + `policies/orientation.js` (it still has its own loop and orientation logic; its row-shift is not a pure lattice).
- [ ] Aperiodic generators (milestone 6): substitution framework, Penrose, hat/spectre, cut-and-project, Truchet.
- [ ] Exact arithmetic (integer coordinates in a number ring) for aperiodic tilings.

## Orientation / rotation
- [ ] Continuous per-tile rotation policies (e.g. increment per row/column, rotate about vertex vs. centre). Currently only symmetric turns via `applyOrientation`.
- [ ] Mirror/flip support (`orient.flip` is always `false`).

## Editor (milestone 5)
- [ ] `js/editor/`: edit prototile edges under the symmetry constraints in each edge's `pair`.
- [ ] Curved edge paths: the renderer supports only `M`/`L`/`Z` (`pathD` in `render/svg.js`).
- [ ] Edge-pairing metadata for all future generators (squares, triangles, hexagons done). The Archimedean tilings have none: their edges are shared between different prototiles, so the IR needs inter-prototile pairing first.

## App / UX
- [ ] Pan and zoom in the preview (region is currently fixed to the canvas size).
- [ ] URL-hash state sharing.
- [ ] More presets (Archimedean tilings currently ship only colouring and mirror presets).
- [ ] Undo/redo.
- [ ] In-page views (Generate, Shape, Export, Presets).
- [ ] Lattice origin/offset parameter (lattices are anchored at the world origin).
- [ ] More colorings (graph coloring, gradients, per-prototile palettes).

## Tooling
- [ ] Renderer tests (SVG snapshot).
- [ ] UI tests for preset and project load/save wiring in `main.js` (the pure parts are covered in `tests/project.test.js`).
- [ ] Optional bundler script producing a single standalone HTML file.
- [ ] Keep `ARCHITECTURE.md` (repo root) updated as decisions change; move it into `docs/` if per-module contract docs are added.
