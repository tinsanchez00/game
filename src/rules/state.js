// Game state is a plain, JSON-serializable object so it can be stored and
// synced as-is. Functions in src/rules never mutate a state; they return a
// new one.
//
// {
//   config,              the settings this game is played with (config.js)
//   rng,                 uint32 generator state (see random.js)
//   current, winner,     player index (0 | 1); winner is null until decided
//   units,               [{ id, player, type: 'soldier'|'commander', pos }]
//   moveDecks,           per player: { draw: [...], discard: [...] }, top first
//   powerDeck,           top first
//   held,                per player: power id or null
//   drawn,               the card being resolved, or null
//   hanged,              null, or { stage: 'back', unit, enemy } while a Hanged Man use resolves
//   campsite,            null, or { unit } when `drawn` came from a campsite
//   hermit,              null, or { stage: 'move', steps } while a Hermit use resolves
//   stars,               per player: stars collected (one per unit that died)
//   bonusTurn,           true when a move this turn earned another turn
// }
//
// See moves.js for how `hanged`, `campsite` and `bonusTurn` drive a turn.

import { HOME } from './board.js';
import { DEFAULT_CONFIG, makeConfig } from './config.js';
import { nextRandom, randomSeed, shuffle } from './random.js';

export const PLAYERS = Object.freeze([0, 1]);
export const SOLDIERS_PER_TEAM = DEFAULT_CONFIG.soldiers;

export function otherPlayer(player) {
  return player === 0 ? 1 : 0;
}

function teamUnits(player, config) {
  const units = [];
  for (let i = 1; i <= config.soldiers; i += 1) {
    units.push({ id: `p${player}-s${i}`, player, type: 'soldier', pos: HOME });
  }
  for (let i = 1; i <= config.commanders; i += 1) {
    units.push({ id: `p${player}-c${i}`, player, type: 'commander', pos: HOME });
  }
  return units;
}

/**
 * @param {{ seed?: number, firstPlayer?: 0 | 1, config?: object }} options
 *   seed: makes the game reproducible; random when omitted.
 *   firstPlayer: picked with the seeded generator when omitted.
 *   config: settings overrides (see config.js); defaults when omitted.
 */
export function createGame({ seed = randomSeed(), firstPlayer, config = {} } = {}) {
  if (firstPlayer !== undefined && !PLAYERS.includes(firstPlayer)) {
    throw new Error('createGame: firstPlayer must be 0 or 1');
  }
  const cfg = makeConfig(config);
  let rng = seed >>> 0;

  let current = firstPlayer;
  if (current === undefined) {
    const roll = nextRandom(rng);
    rng = roll.rng;
    current = roll.value < 0.5 ? 0 : 1;
  }

  const moveDecks = [];
  for (const player of PLAYERS) {
    const s = shuffle(cfg.moveDeck, rng);
    rng = s.rng;
    moveDecks[player] = { draw: s.items, discard: [] };
  }
  const powers = shuffle(cfg.powers ? cfg.powerDeck : [], rng);
  rng = powers.rng;

  return {
    config: cfg,
    rng,
    current,
    winner: null,
    units: [...teamUnits(0, cfg), ...teamUnits(1, cfg)],
    moveDecks,
    powerDeck: powers.items,
    held: [null, null],
    drawn: null,
    hanged: null,
    campsite: null,
    hermit: null,
    stars: [0, 0],
    bonusTurn: false,
  };
}

export function getUnit(state, id) {
  return state.units.find((u) => u.id === id) ?? null;
}

/**
 * `state` with stars added for every unit that was on the board in
 * `before` and is home in `state` (a death), except the ids in `except`.
 */
export function countDeaths(before, state, except = []) {
  const was = new Map(before.units.map((u) => [u.id, u.pos]));
  const stars = [...(state.stars ?? [0, 0])];
  let any = false;
  for (const u of state.units) {
    if (u.pos === HOME && was.get(u.id) !== HOME && !except.includes(u.id)) {
      stars[u.player] += 1;
      any = true;
    }
  }
  return any ? { ...state, stars } : state;
}

export function teamSize(config) {
  return config.soldiers + config.commanders;
}
