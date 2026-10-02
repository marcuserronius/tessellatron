import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundleModules, inlineHtml, transform } from '../scripts/bundle.js';
import { renderSVG } from '../js/render/svg.js';
import { get } from '../js/generators/registry.js';
import { defaults } from '../js/params/schema.js';
import { styleParams } from '../js/style/colorings.js';
import '../js/generators/index.js';

const root = new URL('..', import.meta.url);
const disk = (p) => readFileSync(new URL(p, root), 'utf8');
const run = (code, out = {}) => { new Function('out', code)(out); return out; };
const fixture = (files) => (id) => { if (!(id in files)) throw new Error(`missing ${id}`); return files[id]; };

test('fixture: every supported import/export form works, across directories', () => {
  const out = run(bundleModules('app/main.js', fixture({
    'app/main.js': "import { a, b as renamed } from './lib/x.js';\nimport * as ns from './lib/y.js';\nimport './lib/side.js';\nimport { Thing } from './lib/y.js';\nout.value = [a, renamed, ns.f(2), new Thing().v, out.side];",
    'app/lib/x.js': "import { base } from '../shared.js';\nexport const a = base + 1;\nconst hidden = 5;\nexport { hidden as b };\nexport {};",
    'app/lib/y.js': "export function f(n) { return n * 10; }\nexport class Thing { v = 'cls'; }\nexport let counter = 1;",
    'app/lib/side.js': "out.side = 'ran';",
    'app/shared.js': "export const base = 100;",
  })));
  assert.deepEqual(out.value, [101, 5, 20, 'cls', 'ran']);
});

test('modules run once, dependencies first, each in a private scope', () => {
  const out = { log: [] };
  run(bundleModules('m.js', fixture({
    'm.js': "import './a.js';\nimport './b.js';\nout.log.push('m');",
    'a.js': "import './c.js';\nconst x = 1;\nout.log.push('a');",
    'b.js': "import './c.js';\nconst x = 2;\nout.log.push('b');",
    'c.js': "out.log.push('c');",
  })), out);
  assert.deepEqual(out.log, ['c', 'a', 'b', 'm']);
});

test('unsupported syntax fails the build instead of emitting a broken bundle', () => {
  const bad = (src, re) => assert.throws(() => bundleModules('m.js', fixture({ 'm.js': src })), re);
  bad("import x from './a.js';", /unsupported syntax/);
  bad("export default 1;", /unsupported syntax/);
  bad("export * from './a.js';", /unsupported syntax/);
  bad("export const { a } = o;", /unsupported syntax/);
  bad("import { a } from 'lodash';", /only relative imports/);
  assert.throws(() => bundleModules('a.js', fixture({ 'a.js': "import './b.js';", 'b.js': "import './a.js';" })), /circular import: a.js -> b.js -> a.js/);
});

test('real app: the whole bundle compiles and the transform leaves no import/export statements', () => {
  const code = bundleModules('js/main.js', disk);
  assert.doesNotThrow(() => new Function(code));
  assert.ok(!/^\s*(import|export)\s/m.test(code));
  assert.ok(transform('js/x.js', 'export const k = 1;').body.includes('Object.assign(exports, { k })'));
});

test('real app: bundled generators + renderer produce the same SVG as the ES modules', () => {
  const entry = [
    "import './generators/index.js';",
    "import { get } from './generators/registry.js';",
    "import { defaults, viewParams } from './params/schema.js';",
    "import { styleParams } from './style/colorings.js';",
    "import { renderSVG } from './render/svg.js';",
    "for (const id of ['square', 'hexagon', 'snub-hexagonal', 'truncated-trihexagonal']) {",
    "  const g = get(id);",
    "  out[id] = renderSVG(g.generate(defaults(g.params), [0, 0, 300, 200]), defaults(styleParams), { width: 300, height: 200 }, {});",
    "}",
  ].join('\n');
  const out = run(bundleModules('js/__entry.js', (id) => (id === 'js/__entry.js' ? entry : disk(id))));
  for (const id of ['square', 'hexagon', 'snub-hexagonal', 'truncated-trihexagonal']) {
    const g = get(id);
    assert.equal(out[id], renderSVG(g.generate(defaults(g.params), [0, 0, 300, 200]), defaults(styleParams), { width: 300, height: 200 }, {}), id);
  }
});

test('inlineHtml: stylesheet and module script are inlined; missing script is an error', () => {
  const html = inlineHtml(disk('index.html'), disk);
  assert.ok(!/rel="stylesheet"|type="module"|src="js\//.test(html));
  assert.ok(html.includes('<style>') && html.includes(disk('css/main.css').slice(0, 40)));
  const script = html.match(/<script>\n([\s\S]*)\n<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script));
  assert.throws(() => inlineHtml('<html></html>', disk), /no <script type="module"/);
});
