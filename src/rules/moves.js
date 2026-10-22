// Move generation and resolution for number cards, and what follows a
// resolved card within a turn.
//
// A move is { unit: <unit id>, escort?: <unit id> }.
//
// Turn-continuation fields on the state (see state.js):
//   hanged     { stage: 'back' | 'forward', unit } while a Hanged Man use is
//              resolving: 'back' moves backward, then 'forward' draws a card
//              that moves `unit` (any unit when null)
//   campsite   { unit } when `drawn` was picked from the discard pile by a
//              campsite landing; it moves `unit` forward
//   bonusTurn  set when a move earned another turn (rules.towerExtraTurn)

import { HOME, geometry } from './board.js';
import { nextRandom } from './random.js';
import { getUnit, otherPlayer } from './state.js';

export const MAX_UNITS_PER_CELL = 2; // default; games use state.config.maxPerCell

/** Units on the physical cell with string id `cell` (null: none). */
export function unitsOnCell(state, cell) {
  if (cell === null) return [];
  const g = geometry(state.config);
  return state.units.filter((u) => g.cellId(u.player, u.pos) === cell);
}

/** Per-player unit counts indexed by physical cell index. */
export function occupancy(state) {
  const g = geometry(state.config);
  const occ = [new Uint8Array(g.cellCount), new Uint8Array(g.cellCount)];
  for (const u of state.units) {
    const c = g.cellIndex(u.player, u.pos);
    if (c >= 0) occ[u.player][c] += 1;
  }
  return occ;
}

/**
 * True while a soldier of `player` is in the home field. The lock only keeps
 * a commander from leaving the home field.
 */
export function isCommanderLocked(state, player) {
  if (!state.config.rules.commanderLock) return false;
  return state.units.some(
    (u) => u.player === player && u.type === 'soldier' && u.pos === HOME,
  );
}

/** Destination of `unit` moving `steps`, or null if it can't move at all. */
function destination(state, g, unit, steps, backward) {
  if (unit.pos === g.ascended) return null;
  if (backward) {
    if (unit.pos === HOME) return null;
    return Math.max(HOME, unit.pos - steps);
  }
  const target = unit.pos + steps;
  if (target <= g.ascended) return target;
  return state.config.rules.exactAscend ? null : g.ascended;
}

/** Can `count` units of `player` land on path position `target`? */
function canLand(state, g, occ, player, target, count) {
  if (target === HOME || target === g.ascended) return true;
  const c = g.cellIndex(player, target);
  const enemy = occ[otherPlayer(player)][c];
  if (enemy > 0 && g.isTower(target) && state.config.rules.towersProtect) return false;
  return occ[player][c] + count <= state.config.maxPerCell;
}

/**
 * How the current card moves `player`'s units: backward (Hanged Man, back
 * stage) and/or only one unit (Hanged Man forward stage, campsite card).
 */
export function cardMode(state, player = state.current) {
  if (player !== state.current) return { backward: false, only: null };
  const { hanged, campsite } = state;
  if (campsite) return { backward: false, only: campsite.unit };
  if (hanged?.stage === 'back') return { backward: true, only: null };
  if (hanged?.stage === 'forward') return { backward: false, only: hanged.unit };
  return { backward: false, only: null };
}

/** All valid moves for `player` with a number card worth `steps`. */
export function legalMoves(state, player, steps, occ = occupancy(state), mode = cardMode(state, player)) {
  if (!Number.isInteger(steps) || steps < 1) {
    throw new Error('legalMoves: steps must be a positive integer');
  }
  const g = geometry(state.config);
  const { backward, only } = mode;
  const locked = isCommanderLocked(state, player);
  const escort = state.config.rules.escort;
  const moves = [];
  for (const unit of state.units) {
    if (unit.player !== player) continue;
    if (only !== null && unit.id !== only) continue;
    if (unit.type === 'commander' && locked && unit.pos === HOME) continue;
    const target = destination(state, g, unit, steps, backward);
    if (target === null) continue;

    if (canLand(state, g, occ, player, target, 1)) moves.push({ unit: unit.id });

    if (escort && unit.type === 'commander' && g.isOnBoard(unit.pos)
      && canLand(state, g, occ, player, target, 2)) {
      for (const other of state.units) {
        if (other.player === player && other.type === 'soldier' && other.pos === unit.pos) {
          moves.push({ unit: unit.id, escort: other.id });
        }
      }
    }
  }
  return moves;
}

function sameMove(a, b) {
  return a.unit === b.unit && (a.escort ?? null) === (b.escort ?? null);
}

/** Returns `units` with every unit matching `predicate` moved to HOME. */
export function sendHome(units, predicate) {
  return units.map((u) => (predicate(u) ? { ...u, pos: HOME } : u));
}

/**
 * Clears the drawn card and hands the turn over, unless `extraTurn` is set or
 * a move this turn earned one (state.bonusTurn), which keeps the same player.
 */
export function endTurn(state, extraTurn = false) {
  const keep = extraTurn || Boolean(state.bonusTurn);
  return {
    ...state,
    drawn: null,
    hanged: null,
    campsite: null,
    bonusTurn: false,
    current: keep ? state.current : otherPlayer(state.current),
  };
}

/**
 * A random card from the current player's discard pile, picked with the
 * game's generator; the card stays in the pile. Null when the pile is empty.
 */
function pickFromDiscard(state) {
  const { discard } = state.moveDecks[state.current];
  if (discard.length === 0) return null;
  const r = nextRandom(state.rng);
  return { rng: r.rng, card: discard[Math.floor(r.value * discard.length)] };
}

/**
 * Called once the drawn card has been resolved (a move, a pass or a draft).
 * `landing` is { unit, pos } after a card move, else null. Starts a campsite
 * card, moves a Hanged Man use to its forward stage, or ends the turn.
 */
export function continueTurn(state, landing = null) {
  const g = geometry(state.config);
  const done = { ...state, drawn: null, campsite: null };
  if (landing && g.isCampsite(landing.pos)) {
    const pick = pickFromDiscard(done);
    if (pick) return { ...done, rng: pick.rng, drawn: pick.card, campsite: { unit: landing.unit } };
  }
  if (done.hanged?.stage === 'back') {
    return { ...done, hanged: { stage: 'forward', unit: done.hanged.unit } };
  }
  return endTurn(done);
}

/**
 * Applies a move known to be in legalMoves(state, state.current, steps),
 * without checking it again. Use applyMove for untrusted input.
 */
export function applyLegalMove(state, move, steps) {
  const g = geometry(state.config);
  const player = state.current;
  const { backward } = cardMode(state, player);
  const mover = getUnit(state, move.unit);
  const target = destination(state, g, mover, steps, backward);
  const targetCell = g.cellIndex(player, target);
  const enemy = otherPlayer(player);

  const units = state.units.map((u) => {
    if (u.id === move.unit || u.id === move.escort) return { ...u, pos: target };
    if (targetCell >= 0 && u.player === enemy && g.cellIndex(enemy, u.pos) === targetCell) {
      return { ...u, pos: HOME };
    }
    return u;
  });

  let won = true;
  for (const u of units) {
    if (u.player === player && u.pos !== g.ascended) {
      won = false;
      break;
    }
  }
  if (won) {
    return { ...state, units, drawn: null, hanged: null, campsite: null, bonusTurn: false, winner: player };
  }

  const towerTurn = state.config.rules.towerExtraTurn && !backward && g.isTower(target);
  const next = { ...state, units, bonusTurn: Boolean(state.bonusTurn) || towerTurn };
  if (backward) next.hanged = { stage: 'back', unit: move.unit };
  return continueTurn(next, { unit: move.unit, pos: target });
}

/**
 * Applies a move that must be one of legalMoves(state, state.current, steps).
 * Returns the new state: the turn continues (campsite card, Hanged Man
 * forward stage) or passes to the other player, unless the game is won or an
 * extra turn applies.
 */
export function applyMove(state, move, steps) {
  if (state.winner !== null) throw new Error('applyMove: the game is over');
  const legal = legalMoves(state, state.current, steps);
  if (!legal.some((m) => sameMove(m, move))) {
    throw new Error('applyMove: illegal move');
  }
  return applyLegalMove(state, move, steps);
}

/**
 * Plays a number card worth `steps` for the current player. Pass `move` when
 * at least one legal move exists (moving is mandatory); pass null when none
 * exists, which forfeits the turn.
 */
export function playNumberCard(state, steps, move = null) {
  if (state.winner !== null) throw new Error('playNumberCard: the game is over');
  const legal = legalMoves(state, state.current, steps);
  if (legal.length === 0) {
    if (move !== null) throw new Error('playNumberCard: no legal move exists');
    // A Hanged Man card with no backward move ends the turn (no forward card).
    return cardMode(state).backward ? endTurn(state) : continueTurn(state);
  }
  if (move === null) throw new Error('playNumberCard: a legal move must be made');
  return applyMove(state, move, steps);
}
