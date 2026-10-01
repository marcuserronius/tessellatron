/**
 * Renderer: (IR, style, {width,height}, opts) -> standalone SVG string. Pure, no DOM.
 * Default: prototiles in <defs>, instances as <use>. opts.flatten writes independent <path>s.
 * Path support: M, L, Z only (extend `pathD` when curved edges arrive).
 */
import { apply } from '../core/affine.js';
import { colorFor } from '../style/colorings.js';

const fmt = (n, p) => String(+n.toFixed(p));

function pathD(path, m, p) {
  return path.map(([c, ...v]) => {
    if (c === 'Z') return 'Z';
    const [x, y] = m ? apply(m, v) : v;
    return `${c}${fmt(x, p)} ${fmt(y, p)}`;
  }).join('');
}

/** Closed outline: concatenate edges, dropping each later edge's initial M. */
const outline = (pt) => [...pt.edges.flatMap((e, i) => (i ? e.path.slice(1) : e.path)), ['Z']];

export function renderSVG(ir, st, { width, height }, { flatten = false, precision = 3 } = {}) {
  const bg = st.transparentBg ? '' : `<rect width="100%" height="100%" fill="${st.background}"/>`;
  let defs = '', body;
  if (flatten) {
    body = ir.tiles.map((t) =>
      `<path d="${pathD(outline(ir.prototiles[t.proto]), t.transform, precision)}" fill="${colorFor(t, st)}"/>`);
  } else {
    defs = '<defs>' + Object.entries(ir.prototiles)
      .map(([id, pt]) => `<path id="p-${id}" d="${pathD(outline(pt), null, precision)}"/>`).join('') + '</defs>';
    body = ir.tiles.map((t) =>
      `<use xlink:href="#p-${t.proto}" transform="matrix(${t.transform.map((n) => fmt(n, precision)).join(' ')})" fill="${colorFor(t, st)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `${bg}${defs}<g stroke="${st.stroke}" stroke-width="${st.strokeWidth}" stroke-linejoin="round">${body.join('')}</g></svg>`;
}
