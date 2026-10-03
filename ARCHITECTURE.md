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
| `editor` (future) | edge shaping under symmetry constraints | no |
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
  editor/                (future)
  app/                   store.js (with undo/redo) events.js router.js
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

**Parameters**
- Each generator declares its settings as a schema (type, range, default, label, group).
- Presets: a generator may export `presets` (`{ id, name, params?, style? }`). Applying one resets params to defaults, layers the preset's params on top, and layers its style over the current style (`params/presets.js`).
- Project files: JSON `{ format: "tessellatron-project", version: 1, generator, params, style, view }` (`params/serialize.js`). Loading validates every value against the schemas (clamps numbers, falls back to defaults, drops unknown keys) and rejects files with a wrong format, newer version or unknown generator.
- URL-hash sharing (`toHash`/`fromHash` in `params/serialize.js`): `#g=<generator>&p.<id>=…&s.<id>=…&v.<id>=…`, non-default values only, validated like a project file.
- UI controls, presets, validation, and URL-hash sharing are all derived from the schema. Never hand-write per-generator controls.

**Rendering**
- Default output: prototile paths in `<defs>`, instances as `<use>` (compact; edits propagate).
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
5. **Edge pairing + shape editor prototype** (start with square tiles, translation-paired edges).
6. **Aperiodic**: substitution framework and Penrose P1/P2/P3 (done); then hat/spectre and others.

## Working with Claude on this codebase

Paste this file plus the contract header of any module being changed. Request work one module at a time, against the IR contract above.
