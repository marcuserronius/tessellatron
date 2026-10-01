/** Param-schema helpers and app-level (non-generator) schemas. */
export const defaults = (schema) => Object.fromEntries(schema.map((p) => [p.id, p.default]));

export const viewParams = [
  { id: 'width', label: 'Width (px)', type: 'number', default: 800, min: 100, max: 4000, step: 10, group: 'Canvas' },
  { id: 'height', label: 'Height (px)', type: 'number', default: 600, min: 100, max: 4000, step: 10, group: 'Canvas' },
  { id: 'flatten', label: 'Flatten (no <use>)', type: 'boolean', default: false, group: 'Export' },
  { id: 'precision', label: 'Decimal places', type: 'number', default: 3, min: 0, max: 6, step: 1, group: 'Export' },
];
