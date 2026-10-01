/** Style schema + per-tile fill selection. Operates on IR tiles; never touches geometry. */
export const styleParams = [
  { id: 'fillMode', label: 'Fill', type: 'select', default: 'checker', group: 'Style',
    options: [['none', 'None'], ['uniform', 'Uniform'], ['checker', 'Checkerboard'], ['orient', 'By orientation']] },
  { id: 'fill1', label: 'Color 1', type: 'color', default: '#e8d9b5', group: 'Style' },
  { id: 'fill2', label: 'Color 2', type: 'color', default: '#4a6fa5', group: 'Style' },
  { id: 'stroke', label: 'Stroke color', type: 'color', default: '#222222', group: 'Style' },
  { id: 'strokeWidth', label: 'Stroke width', type: 'number', default: 1.5, min: 0, max: 20, step: 0.5, group: 'Style' },
  { id: 'background', label: 'Background', type: 'color', default: '#ffffff', group: 'Style' },
  { id: 'transparentBg', label: 'Transparent background', type: 'boolean', default: false, group: 'Style' },
];

export function colorFor(tile, st) {
  switch (st.fillMode) {
    case 'uniform': return st.fill1;
    case 'checker': return (((tile.tags.i + tile.tags.j) % 2) + 2) % 2 ? st.fill2 : st.fill1;
    case 'orient': return `hsl(${tile.orient.rot * 90},55%,70%)`;
    default: return 'none';
  }
}
