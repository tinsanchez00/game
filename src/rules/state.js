// Game state is a plain, JSON-serializable object so it can be stored and
// synced as-is. Functions in src/rules never mutate a state; they return a
// new one.
//
// {
//   config,              the settings this game is played with (config.js)
//   rng,                 uint32 generator state (see random.js)
//   current, winner,     player index (0 .. players-1); winner is null until decided
//   order,               turn order: player indexes, drawn at random at the start
//   units,               [{ id, player, type: 'soldier'|'commander', pos }]
//   moveDecks,           per player: { draw: [...], discard: [...] }, top first
//   powerDeck,           top first
//   held,                per player: power id or null
//   drawn,               the card being resolved, or null
//   hanged,              null, or { stage: 'back', unit, enemy } while a Hanged Man use resolves
//   campsite,            null, or { unit } when `drawn` repeats a campsite landing
//   hermit,              null, or { stage: 'move', steps } while a Hermit use resolves
//   stars,               per player: stars collected (one per unit that died)
//   bonusTurn,           true when a move this turn earned another turn
// }
//
// See moves.js for how `hanged`, `campsite` and `bonusTurn` drive a turn.

import { HOME } from './board.js';
import { DEFAULT_CONFIG, makeConfig } from './config.js';
import { nextRandom, randomSeed, shuffle } from './random.js';

export const PLAYERS = Object.freeze([0, 1]); // two-player games
export const SOLDIERS_PER_TEAM = DEFAULT_CONFIG.soldiers;

/** The other player of a two-player game. */
export function otherPlayer(player) {
  return player === 0 ? 1 : 0;
}

/** Player indexes of a game (or config): [0, 1] .. [0, 1, 2, 3]. */
export function playersOf(stateOrConfig) {
  const n = (stateOrConfig.config ?? stateOrConfig).players ?? 2;
  return Array.from({ length: n }, (_, i) => i);
}

/** Every player but `player`, in turn order after them. */
export function opponents(state, player = state.current) {
  const order = state.order ?? playersOf(state);
  const i = order.indexOf(player);
  return [...order.slice(i + 1), ...order.slice(0, i)];
}

/** The player whose turn comes after `player`. */
export function nextPlayer(state, player = state.current) {
  return opponents(state, player)[0];
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
 * @param {{ seed?: number, firstPlayer?: number, config?: object }} options
 *   seed: makes the game reproducible; random when omitted.
 *   firstPlayer: picked with the seeded generator when omitted. With 3-4
 *     players the whole turn order is drawn at random (firstPlayer then
 *     plays first, the others follow in index order).
 *   config: settings overrides (see config.js); defaults when omitted.
 */
export function createGame({ seed = randomSeed(), firstPlayer, config = {} } = {}) {
  const cfg = makeConfig(config);
  const players = playersOf(cfg);
  if (firstPlayer !== undefined && !players.includes(firstPlayer)) {
    throw new Error(`createGame: firstPlayer must be one of ${players.join(', ')}`);
  }
  let rng = seed >>> 0;

  let current = firstPlayer;
  let order;
  if (players.length === 2) {
    if (current === undefined) {
      const roll = nextRandom(rng);
      rng = roll.rng;
      current = roll.value < 0.5 ? 0 : 1;
    }
    order = [0, 1];
  } else if (current === undefined) {
    const s = shuffle(players, rng);
    rng = s.rng;
    order = s.items;
    current = order[0];
  } else {
    order = [current, ...players.filter((p) => p !== current)];
  }

  const moveDecks = [];
  for (const player of players) {
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
    order,
    winner: null,
    units: players.flatMap((p) => teamUnits(p, cfg)),
    moveDecks,
    powerDeck: powers.items,
    held: players.map(() => null),
    drawn: null,
    hanged: null,
    campsite: null,
    hermit: null,
    stars: players.map(() => 0),
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
  const stars = [...(state.stars ?? playersOf(state).map(() => 0))];
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
