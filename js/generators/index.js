import { register } from './registry.js';
import * as square from './periodic/square.js';
import * as triangle from './periodic/triangle.js';
import * as hexagon from './periodic/hexagon.js';
import { generators as archimedean } from './periodic/archimedean.js';

[square, triangle, hexagon, ...archimedean].forEach(register);
