/**
 * Project save/load (pure, no DOM): state <-> JSON text.
 * File shape: { format: "tessellatron-project", version: 1, generator, params, style, view }.
 * Loading never trusts the file: unknown keys are dropped; each value must match its schema entry
 * (type, select options, colour syntax) or falls back to the default; numbers are clamped to range.
 *
 * sanitize(schema, values)            -> { values, warnings }
 * serializeProject(state)             -> JSON string
 * parseProject(text, { generator, style, view })
 *    generator: id -> Generator | undefined;  style, view: param schemas.
 *    -> { state, warnings }; throws Error with a readable message if the file is unusable.
 */
import { defaults } from './schema.js';

export const FORMAT = 'tessellatron-project';
export const VERSION = 1;

function check(p, v) {
  switch (p.type) {
    case 'number': return typeof v === 'number' && Number.isFinite(v)
      ? { ok: true, value: Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v)) } : { ok: false };
    case 'boolean': return { ok: typeof v === 'boolean', value: v };
    case 'color': return { ok: typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v), value: v };
    case 'select': return { ok: (p.options ?? []).some(([o]) => o === v), value: v };
    default: return { ok: false };
  }
}

export function sanitize(schema, values = {}) {
  const out = defaults(schema), warnings = [];
  for (const p of schema) {
    if (!(p.id in values)) continue;
    const r = check(p, values[p.id]);
    if (!r.ok) warnings.push(`${p.id}: invalid value, using default`);
    else {
      if (r.value !== values[p.id]) warnings.push(`${p.id}: ${values[p.id]} clamped to ${r.value}`);
      out[p.id] = r.value;
    }
  }
  return { values: out, warnings };
}

export const serializeProject = ({ generator, params, style, view }) =>
  JSON.stringify({ format: FORMAT, version: VERSION, generator, params, style, view }, null, 2);

export function parseProject(text, schemas) {
  let doc;
  try { doc = JSON.parse(text); } catch { throw new Error('Not a valid JSON file.'); }
  if (!doc || doc.format !== FORMAT) throw new Error('Not a Tessellatron project file.');
  if (!Number.isInteger(doc.version) || doc.version > VERSION) throw new Error(`Unsupported project version: ${doc.version}.`);
  const gen = schemas.generator(doc.generator);
  if (!gen) throw new Error(`Unknown generator: ${doc.generator}.`);
  const warnings = [];
  const section = (name, schema) => {
    const r = sanitize(schema, doc[name] ?? {});
    warnings.push(...r.warnings.map((w) => `${name}.${w}`));
    return r.values;
  };
  return {
    state: { generator: gen.id, params: section('params', gen.params), style: section('style', schemas.style), view: section('view', schemas.view) },
    warnings,
  };
}
