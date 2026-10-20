// Game state is a plain, JSON-serializable object so it can be stored and
// synced as-is. Functions in src/rules never mutate a state; they return a
// new one.

import { HOME } from './board.js';

export const PLAYERS = Object.freeze([0, 1]);
export const SOLDIERS_PER_TEAM = 5;

export function otherPlayer(player) {
  return player === 0 ? 1 : 0;
}

function teamUnits(player) {
  const units = [];
  for (let i = 1; i <= SOLDIERS_PER_TEAM; i += 1) {
    units.push({ id: `p${player}-s${i}`, player, type: 'soldier', pos: HOME });
  }
  units.push({ id: `p${player}-c`, player, type: 'commander', pos: HOME });
  return units;
}

/**
 * @param {{ firstPlayer: 0 | 1 }} options
 */
export function createGame({ firstPlayer } = {}) {
  if (!PLAYERS.includes(firstPlayer)) {
    throw new Error('createGame: firstPlayer must be 0 or 1');
  }
  return {
    current: firstPlayer,
    winner: null,
    units: [...teamUnits(0), ...teamUnits(1)],
  };
}

export function getUnit(state, id) {
  return state.units.find((u) => u.id === id) ?? null;
}
