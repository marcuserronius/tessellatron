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
  core/                  vec.js affine.js polygon.js path.js bbox.js
  ir/                    schema.js validate.js helpers.js
  generators/
    registry.js
    periodic/            square.js triangle.js hexagon.js archimedean.js
    aperiodic/           (future) penrose.js hat.js
  params/                schema.js defaults.js serialize.js
  style/                 colorings.js strokes.js
  policies/              orientation.js
  render/                svg.js defs-use.js flatten.js
  editor/                (future)
  app/                   store.js events.js router.js
  ui/                    panels.js controls.js canvas.js export.js
tests/                   Node-runnable tests
docs/                    ARCHITECTURE.md + per-module contracts
```

## Rules

**Modularity**
- Add a generator = one new file + one registry line. No UI or renderer changes.
- Keep files under ~300 lines. Each starts with a header comment stating its contract (inputs, outputs, invariants).
- No hidden globals. Immutable data in, new data out.
- Plain JS with JSDoc types.

**Generators**
- Signature: `generate(params, region) → IR`. `region` is the visible world-space bbox; emit only intersecting tiles.
- Periodic generators are built from **lattice + motif** (basis vectors + tiles in the fundamental cell). This extends to all 17 wallpaper groups and covers the Archimedean tilings.
- Aperiodic generators (later): use exact integer arithmetic in a number ring (e.g. ℤ[φ]) to avoid float drift at deep inflation levels.
- Each generator ships with presets and at least one Node test (tile count in a region; no gaps or overlaps for periodic ones).

**Parameters**
- Each generator declares its settings as a schema (type, range, default, label, group).
- UI controls, presets, validation, and URL-hash sharing are all derived from the schema. Never hand-write per-generator controls.

**Rendering**
- Default output: prototile paths in `<defs>`, instances as `<use>` (compact; edits propagate).
- "Flatten" export option: plain independent paths (for laser cutters and vector editors that dislike `<use>`).
- Exported SVG is standalone: `viewBox`, no scripts, no external dependencies. Precision and units configurable.

**State and UI**
- One state object (params, style, viewport) behind a small store with change events. This gives presets, undo/redo, and sharing nearly for free.
- Debounced full regeneration on change; optimize only if needed.
- Single `index.html` with in-page views (Generate, Shape, Export, Presets). Do not split into separate pages.

**Build**
- Native ES modules, no build step. Browsers block modules on `file://`, so run a local server (`python -m http.server`). A bundler script that emits one standalone HTML file can come later.

## Roadmap

1. **Foundation**: core math, IR, SVG renderer, square tiling end-to-end (generate → render → download).
2. **Params + UI**: schema, store, auto-generated controls (size, rotation, offsets, strokes, colors, gutters, region).
3. **Triangle and hexagon** via lattice + motif; orientation policies.
4. **Remaining Archimedean tilings**, presets, flatten export, project save/load (JSON).
5. **Edge pairing + shape editor prototype** (start with square tiles, translation-paired edges).
6. **Aperiodic**: substitution framework, then Penrose, then others.

## Working with Claude on this codebase

Paste this file plus the contract header of any module being changed. Request work one module at a time, against the IR contract above.
