# ARCHITECTURE.md: Tiling Generator

Client-side web app (HTML, SVG, JS, CSS; no server) that generates periodic and aperiodic plane tilings, exports SVG, and will later support Escher-style edge shaping.

## Core model

A tiling is **prototiles + placements**, never a bag of polygons.

- **Prototile**: a shape defined once in local coordinates, with edges as first-class objects.
- **Placement**: a tile instance = prototile reference + affine transform.
- Rotation lives in the placement transform, never baked into vertex coordinates.
- Editing a prototile's edges (future) updates every instance automatically.

### IR (the contract between generators and everything else)

```js
{
  prototiles: {
    "sq": {
      edges: [ { id: "e0", path: [["M",0,0],["L",1,0]],
                 pair: { edge: "e2", transform: [a,b,c,d,e,f] } /* optional */ }, ... ],
      center: [0.5, 0.5]
    }
  },
  tiles: [
    { proto: "sq", transform: [a,b,c,d,e,f],
      orient: { rot: 1, flip: false },   // discrete orientation, separate from transform
      tags: { cls: "A" } }               // generator-supplied info for coloring
  ],
  meta: { generator: "square", params: {}, bounds: [x0,y0,x1,y1] }
}
```

- `pair` (edge gluing info) may be empty at first; reserve the slot for the shape editor.
- Paths are lists of segments `[letter, ...numbers]`: `M`, `L`, `C` (cubic Bézier: two control points, then the end point) and `Z`. The commands are defined once, in the `COMMANDS` registry in `core/path.js` (arity, end point, transform, reversal, flattening, SVG text); every path function and the renderer go through it, so adding a command (arcs, ...) means adding a registry entry and tests, not touching its callers. `pathPoints`/`pathEnds` return anchors only, which is all `editor/classes.js` needs.
- `orient` lets the editor know which edge maps to which after rotation or reflection.
- Mixed-prototile tilings (the Archimedean family) omit `pair`: their edges are shared between different prototiles, which same-prototile pairing cannot express yet. There `orient.rot` is an orientation-class index and the exact angle lives in `transform`.

## Rotation

- **Intrinsic orientation**: part of the tiling definition (e.g. alternating 90° squares, up/down triangles as rotations of one prototile). Generators emit it and record it in `orient`.
- **Orientation policies**: user options layered on top (global rotation, per-row/column increments, rotate about center vs. vertex).

## Layers and dependencies

Dependencies point downward only:

`ui → app → render / style / policies → generators → ir → core`

| Layer | Responsibility | DOM? |
|---|---|---|
| `core` | vectors, affine matrices, polygon/path/bbox utilities | no |
| `ir` | types (JSDoc), validation, helpers | no |
| `generators` | `generate(params, region) → IR` | no |
| `params` | declarative settings schema, defaults, serialization | no |
| `style` | colorings, strokes, fills (operates on IR + style config) | no |
| `policies` | orientation/transform post-processing | no |
| `render` | `(IR, style, viewport) → SVG string` | no |
| `editor` | edge shaping under symmetry constraints (`pairing.js`, `shape.js`; UI not yet) | no |
| `app` | state store, events, routing | no |
| `ui` | panels, schema-driven controls, canvas, export | yes |

Everything below `ui` is pure functions on plain data, testable in Node.

## Directory structure

```
index.html               single entry point (SPA, in-page views)
css/                     tokens.css, layout.css, panels.css
js/
  main.js
  core/                  vec.js affine.js polygon.js path.js bbox.js ring.js
  ir/                    schema.js validate.js helpers.js
  generators/
    registry.js
    periodic/            square.js triangle.js hexagon.js archimedean.js
    aperiodic/           penrose.js robinson.js tilesets.js p1.js hat.js hat-subst.js
  params/                schema.js presets.js serialize.js
  style/                 colorings.js strokes.js
  policies/              orientation.js
  render/                svg.js defs-use.js flatten.js
  editor/                modes.js classes.js pairing.js shape.js edit.js
  app/                   store.js (with undo/redo) pipeline.js events.js router.js
  ui/                    panels.js controls.js canvas.js export.js
scripts/                 bundle.js (standalone HTML build)
tests/                   Node-runnable tests
docs/                    (future) per-module contracts; ARCHITECTURE.md stays at the repo root
```

## Rules

**Modularity**
- Add a generator = one new file + one registry line. No UI or renderer changes.
- Keep files under ~300 lines. Each starts with a header comment stating its contract (inputs, outputs, invariants).
- No hidden globals. Immutable data in, new data out.
- Plain JS with JSDoc types.

**Generators**
- Signature: `generate(params, region) → IR`. `region` is the visible world-space bbox; emit only intersecting tiles.
- Periodic generators are built from **lattice + motif** (basis vectors + tiles in the fundamental cell). This extends to all 17 wallpaper groups and covers the squares (two rows per cell, so row shift is a pure lattice), triangles, hexagons and the Archimedean tilings. `latticeTiles` takes `rotation` (about the world origin) and `origin` (a world-space shift applied after rotating); `originParams` are the matching Offset X/Y params.
- Orientation policies (`policies/orientation.js`): `applyOrientation` adds discrete symmetric turns (geometry unchanged, edge labels move); `applyTwist` adds a continuous per-row/column/diagonal rotation about the tile centre or first vertex (geometry changes, so tiles stop fitting). Twist lives in `transform` only; `orient.rot` is untouched.
- Aperiodic generators use exact integer arithmetic in a number ring to avoid float drift at deep inflation levels (`core/ring.js`: ℤ[ζ₅], which contains φ and every 36° rotation). Floats appear only when converting to world coordinates.
- Penrose (`generators/aperiodic/`): one exact Robinson-triangle patch (`robinson.js`), regrouped per `tileSet`: P3 rhombs and P2 kites/darts in `tilesets.js`, P1 pentagons plus gap tiles in `p1.js`. The patch is pruned to the region plus a margin, and its depth is derived from the region but restricted to odd values with a seed turn (`canonicalDepth`), so the tiling is identical at any zoom or region (tested). Prototiles are mirror-symmetric, so `orient.flip` stays false; `orient.rot` is the axis direction in 36° steps (rotUnits 10).
- Hat (`aperiodic/hat.js`): a substitution tiling in hat space (hex-lattice coordinates, no ℤ[ζ₅] involvement). `hat-subst.js` builds a tree of supertiles (H, T, P, F metatiles) and `collectHats` walks it, pruning subtrees whose bounding circle misses the region. The supertile level is a fixed constant (9), never derived from the region, so resizing the canvas does not change the tiling.
- Hat precision. The supertile construction is floating point, and it cannot simply be moved into an integer ring: the supertile outlines are not on any lattice (from level 2 up their vertices are off the hex lattice, by ~1e-3 at level 9, and their edges grow by ~φ² per level). The hats themselves are on a lattice: every hat is the hat at scale 1/2, turned by a multiple of 60°, optionally reflected, and placed at `origin + u·e1 + v·e2` for integers `u, v` (`e1 = (1/2, 0)`, `e2 = (1/4, √3/4)` in hat space; `origin` is tracked exactly through the metatile recentring steps). `collectHats` snaps every hat to that integer placement (`snapPlacement`) and rebuilds its matrix from `(rot, flip, u, v)`, so equal placements are bit-identical and `orient.rot`/`orient.flip` are exact. The float construction lands within ~5e-10 of the lattice at level 9 (worst over all four seeds; the lattice spacing is 0.5), and a hat more than 1e-6 away throws instead of snapping somewhere wrong. The integers are returned by `collectHats` but are not yet exposed in the IR, and the IR transforms are still floats (as for every generator), so consumers that need exact vertex matching (edge welding, the Escher-style shape editor) still have to use a tolerance.
- Under consideration: an integer-exact hat substitution, with no float construction at all. It would be a combinatorial reformulation of `hat-subst.js`, not a port to a ring like Penrose's, because of the irrational outlines above. Probably worth doing before the spectre tile is added, so that tile starts from exact placements, and when the shape editor needs exact edge matching; until then the snap is the stopgap.
- The hat is the one generator that emits reflected tiles: `orient.flip = true` and a transform with negative determinant, on the same prototile.
- Each generator ships with presets and at least one Node test (tile count in a region; no gaps or overlaps for periodic ones).

**Edge editor** (`editor/`, pure; depends on `core` only)
- `modes.js`: a *tiling mode* says how many tile SHAPES a tiling has and how its tiles are turned, which together decide which edges are the same curve. Each tile gets a shape (A, B, ...) and a number of quarter turns from its lattice position (tags `i`, `j`); `retile(ir, mode)` re-points the tiles to one prototile per shape (the first keeps the id, later ones are `sq_b`, ...; copies with `tileClass: { of, index, label }`), turns their transforms about the tile centre (turns the generator already applied are undone first, so the Orientation setting never leaks in) and sets `orient.rot`. Squares have six modes: `single` (one shape, no turns: top = bottom, right = left), `pair` (shapes A and B in a checkerboard, no turns: A top = B bottom, A right = B left, and the reverse), `turn-cw` (one shape, quarter turns: right = bottom, left = top), `pair-turn-cw` (two shapes, quarter turns: A right = B bottom, A left = B top, and the reverse) and the mirror images `turn-ccw` / `pair-turn-ccw`. In the turned modes tile (i, j) turns `[[0,3],[1,2]][i mod 2][j mod 2]` quarters clockwise (negated for ccw): right and left neighbours are a quarter turn off, the ones above and below three quarters, so four tiles meet round a corner they all turn about. `describeEdges` states the relations of any tiling from its edge classes, so the text in the UI cannot disagree with the geometry (tests pin the wording above). The Shape tab shows a mode as two selects, "Tile shapes" (`shapeCounts`: 1, 2, 3) and "Tiles are" (`variantsOf`: turned or flipped, each mode's `variant`), and `modeFor(generator, shapes, variant)` turns the pair back into a mode id. Triangles have six modes (`single`, `single-flip`, `pair`, `pair-flip`, `triple`, `triple-flip`): one, two or three tile shapes, and a down triangle that is the up triangle either turned a half turn (rotated) or mirrored across a horizontal axis (flipped: `orient.flip = true`, a transform with negative determinant). `single` is the generator's own tiling, where one shape meets itself and every edge must be point-symmetric (three `symmetric` classes). `single-flip` pairs right with left as one free curve and leaves the bottom, the mirror line, straight (`locked`). `pair` and `pair-flip` give A (up) and B (down) three free classes, A right = B right, bottom = bottom, left = left when rotated and A right = B left, bottom = bottom, left = right when flipped; the two sets of tilings are the same, B is only drawn as a mirror image in the editor. `triple` and `triple-flip` give each ROW j the shape j mod 3 (up and down triangles of a row share it): rotated, every shape has its own point-symmetric left and right edge and the bottom is one curve shared by all three; flipped, every shape has right = left and the bottoms stay straight. The tables give mode functions of `(i, j, m)` (`m` = motif index, 0 = down) for the shape, the 120° turns (none in the triangle modes yet) and the flip; `GEOMETRY` per generator names the half turn that is part of a down triangle's geometry (`orient.rot` base 3, so `retile` does not undo it) and the prototile's mirror axis. A tile's transform is `upright * turn * flip`, and `retile` undoes flip then turn, so changing mode from an already re-tiled IR still works. Three shapes cannot be all free: nine edge slots make an odd class somewhere, so a class that spans shapes (shared by A, B and C) or a symmetric one is unavoidable.
- `classes.js` derives the *edge classes* from tile adjacency; an edge is identified by its shape and edge id (`tile.proto` is the shape). Two tile edges are glued when their world segments coincide, reversed; gluing edge a of tile A to edge b of tile B means `curve(b) = reverse(T curve(a))` with `T = inverse(B.transform) * A.transform`. Following glues from the lowest-numbered edge (the *representative*) gives each member edge a transform and a parity (reversed when the glue path is odd). A second route to the same edge is a constraint: same parity must agree (else the class is `locked`, straight only); differing parity means the curve must be point-symmetric about its middle (`symmetric`; any other turn locks it). Mirrored tiles (negative determinant) are supported: a mirrored tile and a proper one walk their shared edge in the same world direction, so a mirrored glue does not reverse the curve (the parity counts only the reversing glues). A route that returns through a mirror across the perpendicular through the edge's middle would need a mirror-symmetric curve (a bump, Heesch's I edge); that is not supported yet and the class is `locked`, as are mirrors across the edge line itself (the curve would have to lie on it). Also locked: interior edges with no glued neighbour (row shift, twist). `kind` is `free`, `symmetric` or `locked`. All six square modes give only free classes (two classes of two edges for one shape, four for two shapes); `symmetric` arises when one shape serves tiles in several orientations (the triangle modes `single` and `triple`).
- `pairing.js` is the static counterpart: validation of the generators' `pair` metadata for the canonical orientation (`pairingProblems`, `pairClasses`). The editor does not use it; tests check that it agrees with `classes.js` for the default orientation.
- `shape.js`: a shape is `{ generator, mode?, edges: { shapeId: { edgeId: <edge> } } }` keyed by the class representative (a shared edge is stored once, whichever tile it was edited from); `mode` (left out for `single`) selects the tiling, so the same edges mean different tilings in different modes (switching mode keeps the edits), in a normalized frame (`t` along the straight edge 0..1, `n` the outward offset, both in units of the edge length), so it survives changes of tile size. An `<edge>` is a PATH in that frame (commands from `core/path.js`; the editor allows `L` and `C`) starting at `M 0 0`: a free class stores the whole curve, ending at `(1, 0)`; a symmetric class stores only the first half, ending at the middle `(0.5, 0)`, and the curve is completed by that half turned about the middle and walked backwards (`expandEdge`), which makes it smooth through the middle whenever the half is. Older files (version 2) give an edge as a list of interior points `[[t, n], ...]`; every reader accepts both (`edgePath`), every edit writes paths. The map from the frame to the tile (`frameMatrix`) is a reflection, which any future arc command must answer by flipping its sweep. `applyShape(ir, shape, classes?)` returns the IR re-tiled for the shape's mode with new edge paths (curves are mapped, reversed and pinned like lines), so the renderer needs no change (it already draws any number of prototiles). While a shape applies, the Orientation setting is ignored (the mode decides the turns). When the shape changes nothing the raw IR comes back, orientation and all. Member endpoints are pinned to the exact corners. A shape is ignored for any other generator id.
- `canEdit` is a coarse gate (generator allow-list `EDITABLE`, no row shift, no twist); what can actually be edited comes from the classes. `shapeNotes` names edits that have no effect (derived or locked edge, unknown edge), `crossingProblems` finds outlines that cross themselves (`core/polygon.js` `selfIntersects`, on the anchors) in EVERY tile shape but skips outlines that contain a curve (not checked yet: the user keeps curves from crossing), since an edit also reshapes the neighbours that share the edge, `shapeProblems` is both. The UI refuses a move only on crossings, so stale edits never block editing.
- `edit.js`: pure operations on a shape (`insertPoint`, which splits a cubic without changing it, `movePoint`, which takes the control points beside the anchor along, `removePoint`, `resetEdge`, `nearestOnEdge`, which finds the segment and the parameter along the current curve and maps clicks on a symmetric edge's mirrored half back to the stored half; callers map pointer positions into the representative's frame first); each returns a new shape, or `null` when no edits are left (the app's "no shape").
- `app/pipeline.js` (`generateIR`, `editorModel`, `buildIR`, `buildSVG`) is the one place state becomes IR and SVG. `editorModel` is a patch of tiles around the origin, re-tiled for the mode, plus its classes, cached per generator, params and mode (not per edits); `state.shape`, when set, is applied after generation using those classes. A shape belongs to the generator it was made for and is ignored (but kept) while another generator is selected.
- UI: the sidebar has Generate | Shape tabs. The Shape tab starts with the tiling mode selector and a line listing which edges are the same curve (`describeEdges`). `ui/tile-editor-svg.js` is a pure model-to-SVG-string builder (tested in node): one upright reference tile of the chosen shape, the patch's other tiles ghosted around it as they really sit (turned or not, each with its own shape), edges by role. Every non-locked edge of the shown tile can be pressed or dragged: `ui/shape-view.js` (the thin DOM layer) maps the pointer through the edge class's transform into the representative's frame, so editing tile B's edge edits the curve stored under A. Nodes (the anchors of an edge, numbered along the stored path) can be selected: a selected node shows its handles (a straight segment shows its handle where a line has it, and pulling it makes the segment a cubic), and the buttons Smooth, Corner and Delete node (Delete/Backspace too) act on it. The start and end of an edge are pinned but selectable for their handles. The selection is `{ pid, eid, node, count }`, named by the class representative, and is dropped when the node count changes behind its back (undo of an insertion). The view zooms out, centred on the origin, just enough to keep the selected node's handles visible, and never zooms back in during a drag. The node and handle operations are pure (`nodeAt`, `setHandle`, `smoothNode`, `cornerNode` in `edit.js`; smooth is inferred from the path, not stored), so only pointer and key handling live in the DOM layer. With more than one shape a selector (Tile A, Tile B) picks the tile shown. One drag is one undo step (`{ step: true }` for its first change, `{ merge: true }` for the rest).
- Persistence: project files are version 3 (`shape` is written only for its own generator and sanitised on load, path edges checked segment by segment; v2 and v1 files still load, and older builds refuse v3). The URL hash does not carry the shape.

**Parameters**
- Each generator declares its settings as a schema (type, range, default, label, group).
- Presets: a generator may export `presets` (`{ id, name, params?, style? }`). Applying one resets params to defaults, layers the preset's params on top, and layers its style over the current style (`params/presets.js`).
- Project files: JSON `{ format: "tessellatron-project", version: 1, generator, params, style, view }` (`params/serialize.js`). Loading validates every value against the schemas (clamps numbers, falls back to defaults, drops unknown keys) and rejects files with a wrong format, newer version or unknown generator.
- URL-hash sharing (`toHash`/`fromHash` in `params/serialize.js`): `#g=<generator>&p.<id>=…&s.<id>=…&v.<id>=…`, non-default values only, validated like a project file.
- UI controls, presets, validation, and URL-hash sharing are all derived from the schema. Never hand-write per-generator controls.

**Rendering**
- Default output: prototile paths in `<defs>`, instances as `<use>` (compact; edits propagate). Path text comes from `pathToD` in `core/path.js`, so any registered command renders.
- "Flatten" export option: plain independent paths (for laser cutters and vector editors that dislike `<use>`).
- Exported SVG is standalone: `viewBox`, no scripts, no external dependencies. Precision and units configurable.

**State and UI**
- One state object (params, style, viewport) behind a small store with change events. This gives presets, undo/redo, and sharing nearly for free. The store keeps the undo history: edits within 400 ms of each other merge into one step, and `set(patch, { step: true })` forces a new step (generator change, preset, load).
- Debounced full regeneration on change; optimize only if needed.
- Single `index.html` with in-page views (Generate, Shape, Export, Presets). Do not split into separate pages.

**Build**
- Native ES modules, no build step. Browsers block modules on `file://`, so run a local server (`python -m http.server`). `npm run bundle` (`scripts/bundle.js`, no dependencies) writes `dist/tessellatron.html`: one standalone file with the CSS and all modules inlined, which does work from `file://`. It supports only the import/export forms the app uses and fails the build on anything else (default exports, bare specifiers, circular imports).

## Roadmap

1. **Foundation**: core math, IR, SVG renderer, square tiling end-to-end (generate → render → download).
2. **Params + UI**: schema, store, auto-generated controls (size, rotation, offsets, strokes, colors, gutters, region).
3. **Triangle and hexagon** via lattice + motif; orientation policies.
4. **Remaining Archimedean tilings**, presets, flatten export, project save/load (JSON).
5. **Edge pairing + shape editor prototype** (start with square tiles, translation-paired edges). Tiling modes, edge classes, shape model, pipeline, Shape tab and project persistence are done for squares (six modes) and triangles (six modes: one, two or three shapes, rotated or flipped); hexagons, more modes, mirror-symmetric edges and URL persistence are open (see TODO.md).
6. **Aperiodic**: substitution framework and Penrose P1/P2/P3 (done); then hat/spectre and others.

## Working with Claude on this codebase

Paste this file plus the contract header of any module being changed. Request work one module at a time, against the IR contract above.
