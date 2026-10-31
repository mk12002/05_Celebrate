import * as api from './api.js';
import { createController } from './controller.js';
import * as storage from './storage.js';

// Entry point: bind the controller to the real browser APIs.
createController({ api, storage }).init();
