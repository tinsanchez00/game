// Move generation and resolution for number cards, single-unit power moves,
// and what follows a resolved card within a turn.
//
// A move is { unit: <unit id>, escort?: <unit id> }.
//
// Turn-continuation fields on the state (see state.js):
//   hanged     { stage: 'back', unit, enemy } while a Hanged Man use is
//              resolving: the card moves a unit backward (an opponent's unit
//              when `enemy`); once one has moved, an extra turn follows
//   campsite   { unit } when `drawn` was picked from the discard pile by a
//              campsite landing; it moves `unit` forward
//   hermit     { stage: 'move', steps } while the Hermit's card move is
//              resolving: only moves onto a cell holding an ally, without an
//              escort; on landing, that ally moves forward by `steps`
//   bonusTurn  set when a move earned another turn (rules.towerExtraTurn)

import { HOME, geometry } from './board.js';
import { nextRandom, shuffle as shuffleCards } from './random.js';
import { countDeaths, getUnit, nextPlayer, opponents } from './state.js';

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
  const occ = Array.from({ length: g.players }, () => new Uint8Array(g.cellCount));
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

/** Units of every team but `player`'s on physical cell `c`. */
export function othersOn(occ, player, c) {
  let n = 0;
  for (let q = 0; q < occ.length; q += 1) if (q !== player) n += occ[q][c];
  return n;
}

/** Can `count` units of `player` land on path position `target`? */
function canLand(state, g, occ, player, target, count) {
  if (target === HOME || target === g.ascended) return true;
  const c = g.cellIndex(player, target);
  const enemy = othersOn(occ, player, c);
  if (enemy > 0 && g.isTowerCell(c) && state.config.rules.towersProtect) return false;
  return occ[player][c] + count <= state.config.maxPerCell;
}

/** `units` with every other team's units on the cell `player` reaches at `target` sent home. */
function captureAt(g, units, player, target) {
  const cell = g.cellIndex(player, target);
  if (cell < 0) return units;
  return units.map((u) => (u.player !== player && g.cellIndex(u.player, u.pos) === cell ? { ...u, pos: HOME } : u));
}

/**
 * How the current card moves units: backward (Hanged Man), only one unit
 * (campsite card), onto an ally (Hermit), and whose units move (`players`:
 * every opponent's for the upside-down Hanged Man; `player` is the first of
 * them, which in a two-player game is the opponent).
 */
export function cardMode(state, player = state.current) {
  if (player !== state.current) return { backward: false, only: null };
  const { hanged, campsite, hermit } = state;
  if (campsite) return { backward: false, only: campsite.unit };
  if (hermit?.stage === 'move') return { backward: false, only: null, hermit: true };
  if (hanged?.stage === 'back') {
    if (!hanged.enemy) return { backward: true, only: null };
    const players = opponents(state);
    return { backward: true, only: null, alone: true, player: players[0], players };
  }
  return { backward: false, only: null };
}

/**
 * All valid moves for `player` with a number card worth `steps`.
 * mode: { backward, only (unit id or null), hermit (onto an ally, alone),
 * alone (no escort) }.
 */
export function legalMoves(state, player, steps, occ = occupancy(state), mode = cardMode(state, player)) {
  if (!Number.isInteger(steps) || steps < 1) {
    throw new Error('legalMoves: steps must be a positive integer');
  }
  const g = geometry(state.config);
  const { backward, only, hermit = false, alone = false } = mode;
  const locked = isCommanderLocked(state, player);
  const escort = state.config.rules.escort && !hermit && !alone; // the Hermit moves alone
  const moves = [];
  for (const unit of state.units) {
    if (unit.player !== player) continue;
    if (only !== null && unit.id !== only) continue;
    if (unit.type === 'commander' && locked && unit.pos === HOME) continue;
    const target = destination(state, g, unit, steps, backward);
    if (target === null) continue;
    // The Hermit: only onto a cell already holding one of the player's units.
    if (hermit && !(g.isOnBoard(target) && occ[player][g.cellIndex(player, target)] > 0)) continue;

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

/**
 * The moves the current card offers: the current player's, or the
 * opponents' units moving back for the upside-down Hanged Man.
 */
export function turnMoves(state, steps = state.drawn) {
  const mode = cardMode(state);
  const occ = occupancy(state);
  const players = mode.players ?? [state.current];
  return players.flatMap((p) => legalMoves(state, p, steps, occ, mode));
}

function sameMove(a, b) {
  return a.unit === b.unit && (a.escort ?? null) === (b.escort ?? null);
}

/** Returns `units` with every unit matching `predicate` moved to HOME. */
export function sendHome(units, predicate) {
  return units.map((u) => (predicate(u) ? { ...u, pos: HOME } : u));
}

/** Sets state.winner when a team has ascended every unit (null: no change). */
function decideWinner(state, order = [state.current, ...opponents(state)]) {
  const g = geometry(state.config);
  for (const p of order) {
    if (state.units.every((u) => u.player !== p || u.pos === g.ascended)) {
      return { ...state, drawn: null, hanged: null, campsite: null, hermit: null, bonusTurn: false, winner: p };
    }
  }
  return null;
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
    hermit: null,
    bonusTurn: false,
    current: keep ? state.current : nextPlayer(state),
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
 * card, gives the Hanged Man's extra turn, or ends the turn.
 */
export function continueTurn(state, landing = null) {
  // The Hermit: the ally the unit landed on is pushed (instead of a campsite card).
  if (state.hermit?.stage === 'move' && landing) return pushAlly(state, landing);
  const g = geometry(state.config);
  const done = { ...state, drawn: null, campsite: null };
  // An opponent's unit moved back by the Hanged Man doesn't use the campsite.
  if (landing && g.isCampsiteAt(done.current, landing.pos) && !done.hanged?.enemy) {
    const pick = pickFromDiscard(done);
    if (pick) return { ...done, rng: pick.rng, drawn: pick.card, campsite: { unit: landing.unit } };
  }
  // The Hanged Man's extra turn needs a unit that moved with the card.
  if (done.hanged?.stage === 'back' && done.hanged.unit !== null) return endTurn({ ...done, hanged: null }, true);
  return endTurn(done);
}

/** Draws the current player's next move card into `drawn` (reshuffling an empty deck). */
export function drawTurnCard(state) {
  const player = state.current;
  let { rng } = state;
  let { draw, discard } = state.moveDecks[player];
  if (draw.length === 0) {
    const s = shuffleCards(state.config.moveDeck, rng);
    rng = s.rng;
    draw = s.items;
    discard = [];
  }
  const [card, ...rest] = draw;
  const moveDecks = [...state.moveDecks];
  moveDecks[player] = { draw: rest, discard: [...discard, card] };
  return { ...state, rng, moveDecks, drawn: card };
}

// --- the Hermit's push ------------------------------------------------------------

/**
 * After the Hermit's card move landed `landing.unit` on an ally: that ally
 * moves forward by the same number, alone, as a normal card move (it may
 * capture and trigger the campsite). If it can't move, it stays.
 */
function pushAlly(state, landing) {
  const { steps } = state.hermit;
  const base = { ...state, drawn: null, campsite: null, hermit: null };
  const ally = base.units.find((u) => u.player === base.current && u.id !== landing.unit && u.pos === landing.pos);
  if (!ally) return endTurn(base);
  const valid = legalMoves(base, base.current, steps).some((m) => m.unit === ally.id && !m.escort);
  return valid ? applyLegalMove(base, { unit: ally.id }, steps) : endTurn(base);
}

// --- single-unit power moves -----------------------------------------------------------

/**
 * Where unit `unitId` would land stepping one cell forward on its own path
 * (normal move rules, alone), or null when it can't.
 */
export function stepTarget(state, unitId, occ = occupancy(state)) {
  const unit = getUnit(state, unitId);
  const ok = legalMoves(state, unit.player, 1, occ, { backward: false, only: unitId, alone: true })
    .some((m) => m.unit === unitId);
  return ok ? unit.pos + 1 : null;
}

/**
 * Moves `unitId` one cell forward on its own path (The Tower): it captures
 * the other teams' units there; it may ascend, and may decide the game.
 * The turn itself is untouched. Assumes stepTarget(state, unitId) !== null.
 */
export function stepUnit(state, unitId) {
  const g = geometry(state.config);
  const unit = getUnit(state, unitId);
  const target = unit.pos + 1;
  const units = captureAt(g, state.units, unit.player, target)
    .map((u) => (u.id === unitId ? { ...u, pos: target } : u));
  const next = countDeaths(state, { ...state, units }, [unitId]);
  return decideWinner(next, [unit.player, ...opponents(state, unit.player)]) ?? next;
}

// --- moves --------------------------------------------------------------------------

/**
 * Applies a move known to be one of turnMoves(state, steps), without checking
 * it again. Use applyMove for untrusted input.
 */
export function applyLegalMove(state, move, steps) {
  const g = geometry(state.config);
  const mode = cardMode(state);
  const { backward } = mode;
  const mover = getUnit(state, move.unit);
  const player = mover.player; // an opponent's, for the upside-down Hanged Man
  const target = destination(state, g, mover, steps, backward);

  const units = captureAt(g, state.units, player, target)
    .map((u) => (u.id === move.unit || u.id === move.escort ? { ...u, pos: target } : u));
  // Captured units give their owner stars (a mover sent home backward isn't a death).
  const { stars } = countDeaths(state, { ...state, units }, [move.unit, move.escort].filter(Boolean));

  const won = decideWinner({ ...state, units, stars }, [player]);
  if (won) return won;

  const towerTurn = state.config.rules.towerExtraTurn && !backward && g.isTowerAt(player, target);
  const next = { ...state, units, stars, bonusTurn: Boolean(state.bonusTurn) || towerTurn };
  if (backward) next.hanged = { ...state.hanged, stage: 'back', unit: move.unit };
  return continueTurn(next, { unit: move.unit, pos: target });
}

/**
 * Applies a move that must be one of turnMoves(state, steps).
 * Returns the new state: the turn continues (campsite card, Hermit push) or
 * passes to the other player, unless the game is won or an extra turn applies.
 */
export function applyMove(state, move, steps) {
  if (state.winner !== null) throw new Error('applyMove: the game is over');
  const legal = turnMoves(state, steps);
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
  const legal = turnMoves(state, steps);
  if (legal.length === 0) {
    if (move !== null) throw new Error('playNumberCard: no legal move exists');
    // A Hanged Man card with no backward move ends the turn (no extra turn).
    return cardMode(state).backward ? endTurn(state) : continueTurn(state);
  }
  if (move === null) throw new Error('playNumberCard: a legal move must be made');
  return applyMove(state, move, steps);
}
