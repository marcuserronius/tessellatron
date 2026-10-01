/**
 * Presets: named parameter sets a generator ships with (pure, no DOM).
 * A generator may export `presets: [{ id, name, params?, style? }]`.
 *  - params: partial generator params, applied over that generator's defaults.
 *  - style:  partial style, applied over the current style.
 * listPresets(gen)               -> [{ id, name, ... }] with a leading "Defaults" entry.
 * applyPreset(gen, preset, state) -> state patch { params, style } ready for store.set().
 */
import { defaults } from './schema.js';

export const listPresets = (gen) => [{ id: 'default', name: 'Defaults' }, ...(gen.presets ?? [])];

export const applyPreset = (gen, preset, state) => ({
  params: { ...defaults(gen.params), ...preset.params },
  style: { ...state.style, ...preset.style },
});
