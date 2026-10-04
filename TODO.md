# TODO

Unimplemented items and known gaps. Milestone numbers refer to `ARCHITECTURE.md`.

## Generators
- [ ] Wallpaper-group (p1…p6m) motif presets built on `lattice.js`.
- [x] Hat monotile (Einstein) via the H/T/P/F metatile substitution (`generators/aperiodic/hat.js`).
- [ ] Aperiodic generators (milestone 6): spectre, cut-and-project, Truchet. (Penrose P1/P2/P3 and the hat done: `generators/aperiodic/`.)
- [ ] Hat: option to draw the H/T/P/F metatile outlines; spectre as the chiral variant; a generic centre / pan beyond the fixed level-9 supertile.
- [ ] Hat: integer-exact substitution (a combinatorial rewrite of `hat-subst.js`; see ARCHITECTURE.md, Hat precision). Under consideration, probably before the spectre is added. Today the hats are snapped to their integer lattice placement at emission; the integers (`rot, flip, u, v`) are not yet in the IR, e.g. as a tag for exact vertex matching.
- [ ] Penrose: matching-rule decorations (P3 arrows, P2 curves, P1 markings) as edge classes, and the six decorated P1 tiles. Today the plain shapes are emitted and the tiling is only guaranteed legal by construction.
- [ ] Penrose: other 5-fold centres (the other parity gives a different 5-fold tiling), or a generic centre / phason shift so the pattern can be panned beyond the origin.
- [ ] Penrose: `tileSet` conversions P2 <-> P3 <-> P1 are by regrouping the same patch; a stored tiling would need the same ring coordinates (not floats) to convert exactly.

## Orientation / rotation
- [ ] Mirror/flip support in the orientation policies. `orient.flip` is `false` everywhere except the hat generator, which sets it for its reflected hats; `applyOrientation`/`applyTwist` do not know about it.

## Editor (milestone 5)
- [x] `editor/classes.js` (edge classes from tile adjacency: free, symmetric, locked), `editor/shape.js` (normalized edge shapes, `applyShape`, `shapeProblems`, `canEdit`, `sanitizeShape`), `editor/pairing.js` (static pair metadata check); `app/pipeline.js` applies `state.shape`. Square only (`EDITABLE` in `shape.js`).
- [x] Tiling modes (`editor/modes.js`): one shape / two shapes, with or without quarter turns (cw and ccw), six modes for squares; each shape independently editable, shared edges edited once, mode saved with the shape. Mode selector, tile selector (A, B) and a relations line in the Shape tab; any edge of the shown tile can be dragged.
- [ ] Modes for hexagons (one shape; turned versions with THREE shapes, the 3-colouring) and triangles (up and down as two shapes, or one shape with symmetric edges): add a mode table and edge names per generator in `modes.js`, and the generator to `EDITABLE`, plus a UI pass (hexagon ghost layout). `classes.js` already runs on every generator.
- [ ] More square modes if wanted: rows of alternating shapes, shapes by column, four shapes, half-turn modes, glides.
- [ ] The Orientation setting (Generate tab) is ignored while a shape applies; consider disabling it then, or deriving it from the mode.
- [ ] Switching mode keeps the edits (so the same curves reappear in the new tiling); consider keeping a shape per mode instead, and an "outline crosses itself" warning for edits that stop being valid after a switch.
- [ ] Shape in the URL hash: a refresh currently drops the shape unless the project was saved. Needs a compact encoding (e.g. `sh=sq/e0/0.3,0.2,0.7,-0.1;...`, rounded to 4 decimals); decide first whether the hash should grow that long.
- [ ] Shape view polish: touch/keyboard way to remove a point (double-click only today), zoom, snapping/grid, per-edge reset, numeric entry.
- [ ] Curved edge paths: the renderer supports only `M`/`L`/`Z` (`pathD` in `render/svg.js`), and `core/path.js` throws on anything else. Add `C` with reversal that swaps control points, then smooth handles.
- [ ] Mirrored glues (hat/reflection tilings): `classes.js` locks them; supporting them needs reflection-aware parity and symmetric (mirror) constraints.
- [ ] Non-edge-to-edge tilings (row shift, Archimedean, Penrose): classes lock unmatched edges. Brick bond still lets the vertical edges be edited (the `canEdit` gate says otherwise).
- [ ] `pair` metadata is now only a cross-check for `classes.js`; decide whether to keep requiring it from new generators.

## App / UX
- [ ] Pan and zoom in the preview (region is currently fixed to the canvas size). Needs a decision on whether export follows the viewport.
- [ ] More presets (Archimedean tilings currently ship only colouring and mirror presets).
- [ ] In-page views (Generate, Shape, Export, Presets).
- [ ] More colorings (graph coloring, per-prototile palettes). Gradient is done.

## Tooling
- [ ] UI tests for the wiring in `main.js` (presets, project load/save, undo/redo buttons and shortcuts, URL hash); the pure parts are covered in `tests/project.test.js`, `tests/store.test.js` and `tests/bundle.test.js`. A manual jsdom run of the bundled page (`npm run bundle`, then load `dist/tessellatron.html` with `runScripts: 'dangerously'`) exercised all of it; making that a test needs `jsdom` as a devDependency.
