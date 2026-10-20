// Game logic only. No DOM access in this folder, so every rule can be tested
// with `npm test` and the visuals can change without touching the rules.

export const RULES_VERSION = '0.1.0';

export * from './board.js';
export * from './state.js';
export * from './moves.js';
