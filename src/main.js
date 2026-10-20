// Entry point: wires the game rules (src/rules) to the interface (src/ui).

import { startApp } from './ui/app.js';

startApp(document.getElementById('app'));
