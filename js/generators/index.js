import { register } from './registry.js';
import * as square from './periodic/square.js';
import * as triangle from './periodic/triangle.js';
import * as hexagon from './periodic/hexagon.js';

[square, triangle, hexagon].forEach(register);
