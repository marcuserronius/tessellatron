/** Builds form controls from a param schema. onChange(id, value) fires on every edit. */
export function buildControls(root, schema, values, onChange) {
  root.replaceChildren();
  const groups = new Map();
  for (const p of schema) {
    const g = p.group || 'Settings';
    if (!groups.has(g)) {
      const fs = document.createElement('fieldset');
      fs.innerHTML = `<legend>${g}</legend>`;
      groups.set(g, fs);
      root.append(fs);
    }
    groups.get(g).append(field(p, values[p.id], onChange));
  }
}

function field(p, value, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.append(Object.assign(document.createElement('span'), { textContent: p.label }));
  let input, read;
  if (p.type === 'select') {
    input = document.createElement('select');
    for (const [v, l] of p.options) input.add(new Option(l, v));
    input.value = value; read = () => input.value;
  } else {
    input = document.createElement('input');
    input.type = { number: 'number', color: 'color', boolean: 'checkbox' }[p.type];
    if (p.type === 'number') Object.assign(input, { min: p.min, max: p.max, step: p.step });
    if (p.type === 'boolean') { input.checked = value; read = () => input.checked; }
    else { input.value = value; read = () => (p.type === 'number' ? parseFloat(input.value) : input.value); }
  }
  input.addEventListener('input', () => { const v = read(); if (!(p.type === 'number' && Number.isNaN(v))) onChange(p.id, v); });
  wrap.append(input);
  return wrap;
}
