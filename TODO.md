# TODO

Unimplemented items and known gaps. Milestone numbers refer to `docs/ARCHITECTURE.md`.

## Generators
- [ ] Remaining Archimedean tilings (milestone 4): trihexagonal, rhombitrihexagonal, truncated square/hexagonal, snub square/hexagonal, elongated triangular, etc.
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
- [ ] Edge-pairing metadata for all future generators (squares, triangles, hexagons done).

## App / UX
- [ ] Pan and zoom in the preview (region is currently fixed to the canvas size).
- [ ] URL-hash state sharing.
- [ ] Project save/load (JSON).
- [ ] Presets.
- [ ] Undo/redo.
- [ ] In-page views (Generate, Shape, Export, Presets).
- [ ] Lattice origin/offset parameter (lattices are anchored at the world origin).
- [ ] More colorings (graph coloring, gradients, per-prototile palettes).

## Tooling
- [ ] Renderer tests (SVG snapshot).
- [ ] Optional bundler script producing a single standalone HTML file.
- [ ] Copy `ARCHITECTURE.md` into `docs/` and keep it updated as decisions change.
