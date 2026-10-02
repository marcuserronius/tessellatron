import { register } from './registry.js';
import * as square from './periodic/square.js';
import * as triangle from './periodic/triangle.js';
import * as hexagon from './periodic/hexagon.js';
import { generators as archimedean } from './periodic/archimedean.js';
import * as penrose from './aperiodic/penrose.js';

[square, triangle, hexagon, ...archimedean, penrose].forEach(register);
