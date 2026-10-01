/**
 * Tiling IR: the contract between generators and everything else.
 * Types only (JSDoc); see docs/ARCHITECTURE.md.
 *
 * @typedef {[number,number,number,number,number,number]} Affine   SVG-style matrix
 * @typedef {Array<['M'|'L', number, number]|['Z']>} Path          Currently M/L/Z only
 *
 * @typedef {Object} Edge
 * @property {string} id
 * @property {Path} path                       Local coords, traversed clockwise around the tile
 * @property {{edge:string, transform:Affine}} [pair]
 *           Partner edge, and the transform mapping this edge (as a point set) onto it.
 *
 * @typedef {Object} Prototile
 * @property {Edge[]} edges                    Consecutive edges form a closed outline
 * @property {[number,number]} center
 * @property {number} rotUnits                 Steps per full turn used by Tile.orient.rot (square 4, triangle/hexagon 6)
 *
 * @typedef {Object} Tile
 * @property {string} proto                    Key into IR.prototiles
 * @property {Affine} transform                Local -> world
 * @property {{rot:number, flip:boolean}} orient  Discrete orientation (rot = quarter/sector index)
 * @property {Object} tags                     Generator-supplied info for colorings
 *
 * @typedef {Object} TilingIR
 * @property {Object<string,Prototile>} prototiles
 * @property {Tile[]} tiles
 * @property {{generator:string, params:Object, bounds:number[]}} meta
 *
 * @typedef {Object} ParamDef
 * @property {string} id
 * @property {string} label
 * @property {'number'|'select'|'color'|'boolean'} type
 * @property {*} default
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {Array<[string,string]>} [options]   [value,label] pairs for 'select'
 * @property {string} [group]
 *
 * @typedef {Object} Generator
 * @property {string} id
 * @property {string} name
 * @property {ParamDef[]} params
 * @property {(params:Object, region:[number,number,number,number]) => TilingIR} generate
 */
export {};
