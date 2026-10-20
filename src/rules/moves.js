// Move generation and resolution for number cards.
//
// A move is { unit: <unit id>, escort?: <unit id> }.

import { ASCENDED, HOME, cellId, isTower } from './board.js';
import { getUnit, otherPlayer } from './state.js';

export const MAX_UNITS_PER_CELL = 2;

export function unitsOnCell(state, cell) {
  if (cell === null) return [];
  return state.units.filter((u) => cellId(u.player, u.pos) === cell);
}

export function isCommanderLocked(state, player) {
  return state.units.some(
    (u) => u.player === player && u.type === 'soldier' && u.pos === HOME,
  );
}

function isBackward(state, player) {
  return Boolean(state.backward?.[player]);
}

/** Destination of `unit` moving `steps`, or null if it can't move at all. */
function destination(state, unit, steps) {
  if (unit.pos === ASCENDED) return null;
  if (!isBackward(state, unit.player)) return unit.pos + steps;
  if (unit.pos === HOME) return null;
  return Math.max(HOME, unit.pos - steps);
}

/** Can `count` units of `player` land on path position `target`? */
function canLand(state, player, target, count) {
  if (target === HOME || target === ASCENDED) return true;
  if (target > ASCENDED) return false;
  const occupants = unitsOnCell(state, cellId(player, target));
  const own = occupants.filter((u) => u.player === player).length;
  const enemy = occupants.length - own;
  if (enemy > 0 && isTower(target)) return false;
  return own + count <= MAX_UNITS_PER_CELL;
}

/** All valid moves for `player` with a number card worth `steps`. */
export function legalMoves(state, player, steps) {
  if (!Number.isInteger(steps) || steps < 1) {
    throw new Error('legalMoves: steps must be a positive integer');
  }
  const moves = [];
  for (const unit of state.units) {
    if (unit.player !== player) continue;
    if (unit.type === 'commander' && isCommanderLocked(state, player)) continue;
    const target = destination(state, unit, steps);
    if (target === null) continue;

    if (canLand(state, player, target, 1)) moves.push({ unit: unit.id });

    if (unit.type === 'commander' && unit.pos !== HOME && canLand(state, player, target, 2)) {
      const here = cellId(player, unit.pos);
      for (const other of state.units) {
        if (
          other.player === player &&
          other.type === 'soldier' &&
          cellId(player, other.pos) === here
        ) {
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
 * Applies a move that must be one of legalMoves(state, state.current, steps).
 * Returns the new state; the turn passes to the other player unless the game
 * is won.
 */
export function applyMove(state, move, steps) {
  if (state.winner !== null) throw new Error('applyMove: the game is over');
  const player = state.current;
  const legal = legalMoves(state, player, steps);
  if (!legal.some((m) => sameMove(m, move))) {
    throw new Error('applyMove: illegal move');
  }

  const movingIds = new Set([move.unit, move.escort].filter(Boolean));
  const target = destination(state, getUnit(state, move.unit), steps);
  const targetCell = cellId(player, target);

  let units = state.units.map((u) => (movingIds.has(u.id) ? { ...u, pos: target } : u));
  if (targetCell !== null) {
    units = sendHome(
      units,
      (u) => u.player !== player && cellId(u.player, u.pos) === targetCell,
    );
  }

  const won = units
    .filter((u) => u.player === player)
    .every((u) => u.pos === ASCENDED);

  const backward = [...(state.backward ?? [false, false])];
  backward[player] = false;

  return {
    ...state,
    units,
    backward,
    drawn: null,
    winner: won ? player : null,
    current: won ? state.current : otherPlayer(player),
  };
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
    return { ...state, drawn: null, current: otherPlayer(state.current) };
  }
  if (move === null) throw new Error('playNumberCard: a legal move must be made');
  return applyMove(state, move, steps);
}
