/** Generator registry. Add a generator: write a module, import+register it in ./index.js. */
const gens = new Map();
export const register = (g) => gens.set(g.id, g);
export const get = (id) => gens.get(id);
export const list = () => [...gens.values()];
