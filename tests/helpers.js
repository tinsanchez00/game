import { createGame } from '../src/rules/index.js';

/**
 * A new game with some units placed at given path positions.
 * @param {Record<string, number>} positions unit id -> path position
 * @param {object} options firstPlayer, seed, config (settings overrides), and
 *   any state fields to override
 */
export function gameWith(positions = {}, { firstPlayer = 0, seed = 1, config, ...overrides } = {}) {
  const state = createGame({ firstPlayer, seed, config });
  return {
    ...state,
    ...overrides,
    units: state.units.map((u) =>
      u.id in positions ? { ...u, pos: positions[u.id] } : u,
    ),
  };
}

export function pos(state, id) {
  return state.units.find((u) => u.id === id).pos;
}

/** Positions that put all five of a player's soldiers on the board. */
export function soldiersOut(player, cells = [1, 2, 3, 5, 6]) {
  return Object.fromEntries(cells.map((c, i) => [`p${player}-s${i + 1}`, c]));
}

/** Settings with the optional commander lock switched on. */
export const LOCK = Object.freeze({ rules: { commanderLock: true } });
