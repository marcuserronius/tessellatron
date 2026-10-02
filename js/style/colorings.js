/** Style schema + per-tile fill selection. Operates on IR tiles; never touches geometry. */
export const styleParams = [
  { id: 'fillMode', label: 'Fill', type: 'select', default: 'classes', group: 'Style',
    options: [['none', 'None'], ['uniform', 'Uniform'], ['classes', 'Tile classes (up to 3 colors)'], ['orient', 'By orientation'],
                ['gradient', 'Gradient (colors 1 → 2 → 3)']] },
  { id: 'gradientAngle', label: 'Gradient direction (°)', type: 'number', default: 0, min: -180, max: 180, step: 5, group: 'Style' },
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

const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');

/** Colour by tile-centre position along `gradientAngle` (0 = left to right, 90 = top to bottom) across the view. */
function gradient(tile, st, { width, height } = { width: 1, height: 1 }) {
  const a = (st.gradientAngle * Math.PI) / 180, d = (x, y) => x * Math.cos(a) + y * Math.sin(a);
  const ends = [d(0, 0), d(width, 0), d(0, height), d(width, height)], lo = Math.min(...ends), hi = Math.max(...ends);
  const t = hi > lo ? Math.min(1, Math.max(0, (d(tile.transform[4], tile.transform[5]) - lo) / (hi - lo))) : 0;
  return t < 0.5 ? mix(st.fill1, st.fill2, 2 * t) : mix(st.fill2, st.fill3, 2 * t - 1);
}

export function colorFor(tile, st, view) {
  switch (st.fillMode) {
    case 'uniform': return st.fill1;
    case 'classes': return [st.fill1, st.fill2, st.fill3][classOf(tile)];
    case 'orient': return `hsl(${tile.orient.rot * (tile.tags.hueStep ?? 60)},55%,70%)`;
    case 'gradient': return gradient(tile, st, view);
    default: return 'none';
  }
}
