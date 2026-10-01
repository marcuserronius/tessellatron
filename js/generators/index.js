import { register } from './registry.js';
import * as square from './periodic/square.js';

[square].forEach(register);
