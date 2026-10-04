/**
 * Renderer: (IR, style, {width,height}, opts) -> standalone SVG string. Pure, no DOM.
 * Default: prototiles in <defs>, instances as <use>. opts.flatten writes independent <path>s.
 * Path support: whatever the command registry in core/path.js knows (M, L, C, Z); this file only asks it for SVG text.
 */
import { transformPath, pathToD } from '../core/path.js';
import { colorFor } from '../style/colorings.js';

const fmt = (n, p) => String(+n.toFixed(p));

const pathD = (path, m, p) => pathToD(m ? transformPath(path, m) : path, p);

/** Closed outline: concatenate edges, dropping each later edge's initial M. */
const outline = (pt) => [...pt.edges.flatMap((e, i) => (i ? e.path.slice(1) : e.path)), ['Z']];

export function renderSVG(ir, st, { width, height }, { flatten = false, precision = 3 } = {}) {
  const view = { width, height };
  const bg = st.transparentBg ? '' : `<rect width="100%" height="100%" fill="${st.background}"/>`;
  let defs = '', body;
  if (flatten) {
    body = ir.tiles.map((t) =>
      `<path d="${pathD(outline(ir.prototiles[t.proto]), t.transform, precision)}" fill="${colorFor(t, st, view)}"/>`);
  } else {
    defs = '<defs>' + Object.entries(ir.prototiles)
      .map(([id, pt]) => `<path id="p-${id}" d="${pathD(outline(pt), null, precision)}"/>`).join('') + '</defs>';
    body = ir.tiles.map((t) =>
      `<use xlink:href="#p-${t.proto}" transform="matrix(${t.transform.map((n) => fmt(n, precision)).join(' ')})" fill="${colorFor(t, st, view)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `${bg}${defs}<g stroke="${st.stroke}" stroke-width="${st.strokeWidth}" stroke-linejoin="round">${body.join('')}</g></svg>`;
}
