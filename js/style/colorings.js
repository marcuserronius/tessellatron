/** Style schema + per-tile fill selection. Operates on IR tiles; never touches geometry. */
export const styleParams = [
  { id: 'fillMode', label: 'Fill', type: 'select', default: 'classes', group: 'Style',
    options: [['none', 'None'], ['uniform', 'Uniform'], ['classes', 'Tile classes (up to 3 colors)'], ['orient', 'By orientation']] },
  { id: 'fill1', label: 'Color 1', type: 'color', default: '#e8d9b5', group: 'Style' },
  { id: 'fill2', label: 'Color 2', type: 'color', default: '#4a6fa5', group: 'Style' },
  { id: 'fill3', label: 'Color 3', type: 'color', default: '#c97b63', group: 'Style' },
  { id: 'stroke', label: 'Stroke color', type: 'color', default: '#222222', group: 'Style' },
  { id: 'strokeWidth', label: 'Stroke width', type: 'number', default: 1.5, min: 0, max: 20, step: 0.5, group: 'Style' },
  { id: 'background', label: 'Background', type: 'color', default: '#ffffff', group: 'Style' },
  { id: 'transparentBg', label: 'Transparent background', type: 'boolean', default: false, group: 'Style' },
];

/** Class index: generator-supplied tags.cls, else checkerboard parity from lattice indices. */
const classOf = (t) => (((t.tags.cls ?? t.tags.i + t.tags.j) % 3) + 3) % 3;

export function colorFor(tile, st) {
  switch (st.fillMode) {
    case 'uniform': return st.fill1;
    case 'classes': return [st.fill1, st.fill2, st.fill3][classOf(tile)];
    case 'orient': return `hsl(${tile.orient.rot * 60},55%,70%)`;
    default: return 'none';
  }
}
