#!/usr/bin/env node
/**
 * Zero-dependency bundler: index.html + css + ES modules -> one standalone HTML file.
 *   npm run bundle [outfile]        (default: dist/tessellatron.html)
 *
 * Each module becomes a function; imports become destructuring of `__req(id)`, exports are assigned
 * to the module's exports object once its body has run. Supported syntax (all the app uses):
 *   import { a, b as c } from './x.js' | import * as ns from './x.js' | import './x.js'
 *   export const|let|var|function|class name ... | export { a, b as c }
 * Imports run where they appear (ES hoists them), so keep them at the top of each module.
 * Anything else (default exports, bare specifiers, `export ... from`, circular imports) throws,
 * so an unsupported construct fails the build instead of producing a broken file.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const Q = `(['"])([^'"\\n]+)\\`;
const NAMED = new RegExp(`^import\\s*\\{([^}]*)\\}\\s*from\\s*${Q}2\\s*;?[ \\t]*$`, 'gm');
const NS = new RegExp(`^import\\s*\\*\\s*as\\s+([\\w$]+)\\s+from\\s*${Q}2\\s*;?[ \\t]*$`, 'gm');
const SIDE = new RegExp(`^import\\s*${Q}1\\s*;?[ \\t]*$`, 'gm');
const EXPORT_DECL = /^export\s+((?:async\s+)?(?:function\*?|class|const|let|var))\s+([\w$]+)/gm;
const EXPORT_LIST = /^export\s*\{([^}]*)\}\s*;?[ \t]*$/gm;

const resolveSpec = (from, spec) => {
  if (!/^\.\.?\//.test(spec)) throw new Error(`${from}: only relative imports are supported (${spec})`);
  return posix.normalize(posix.join(posix.dirname(from), spec));
};
const pairs = (list, sep) => list.split(',').map((s) => s.trim()).filter(Boolean)
  .map((s) => { const [a, b = a] = s.split(/\s+as\s+/); return sep ? `${a}: ${b}` : [a, b]; });

/** One module's source -> { body, deps }. */
export function transform(id, src) {
  const deps = [], names = [];
  const dep = (spec) => { const d = resolveSpec(id, spec); deps.push(d); return JSON.stringify(d); };
  let body = src
    .replace(NAMED, (_, list, __, spec) => `const { ${pairs(list, true).join(', ')} } = __req(${dep(spec)});`)
    .replace(NS, (_, name, __, spec) => `const ${name} = __req(${dep(spec)});`)
    .replace(SIDE, (_, __, spec) => `__req(${dep(spec)});`)
    .replace(EXPORT_DECL, (_, kind, name) => { names.push([name, name]); return `${kind} ${name}`; })
    .replace(EXPORT_LIST, (_, list) => { names.push(...pairs(list)); return ''; });
  const left = body.match(/^\s*(import|export)\b.*$/m);
  if (left) throw new Error(`${id}: unsupported syntax: ${left[0].trim()}`);
  body += `\nObject.assign(exports, { ${names.map(([local, out]) => (local === out ? out : `${out}: ${local}`)).join(', ')} });`;
  return { body, deps };
}

/** Entry module id + read(id) -> one script string (an IIFE). Dependencies are emitted first. */
export function bundleModules(entry, read) {
  const out = [], state = new Map();
  const visit = (id, chain) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') throw new Error(`circular import: ${[...chain, id].join(' -> ')}`);
    state.set(id, 'visiting');
    const { body, deps } = transform(id, read(id));
    deps.forEach((d) => visit(d, [...chain, id]));
    out.push(`__defs[${JSON.stringify(id)}] = function (exports, __req) {\n${body}\n};`);
    state.set(id, 'done');
  };
  visit(entry, []);
  return `(function () {\n'use strict';\nconst __defs = {}, __mods = {};\n`
    + `function __req(id) { if (!__mods[id]) { const m = (__mods[id] = {}); __defs[id](m, __req); } return __mods[id]; }\n`
    + `${out.join('\n')}\n__req(${JSON.stringify(entry)});\n})();`;
}

/** index.html text -> same page with its stylesheet and module script inlined. */
export function inlineHtml(html, read) {
  let scripts = 0;
  const out = html
    .replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g, (_, href) => `<style>\n${read(href).replace(/<\/style/gi, '<\\/style')}\n</style>`)
    .replace(/<script\s+type="module"\s+src="([^"]+)"\s*><\/script>/g, (_, src) => {
      scripts++;
      return `<script>\n${bundleModules(src, read).replace(/<\/script/gi, '<\\/script')}\n</script>`;
    });
  if (!scripts) throw new Error('index.html has no <script type="module" src="..."> to inline');
  return out;
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const read = (p) => readFileSync(join(root, p), 'utf8');
  const file = resolve(process.argv[2] ?? join(root, 'dist', 'tessellatron.html'));
  const html = inlineHtml(read('index.html'), read);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  console.log(`wrote ${file} (${(html.length / 1024).toFixed(1)} KB)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
