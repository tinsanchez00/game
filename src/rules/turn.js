// Turn flow: draw a card, then resolve it.
//
//   drawCard(state)                         -> state.drawn is set
//   number card: currentMoves(state), then playDrawnNumber(state, move | null)
//   joker:       draftOptions(state), then playDraft(state, keepIndex)
//            or, when drafting isn't possible, passJoker(state)
//   any turn:    canUsePower / powerUseChoices / usePower(state, args) to use
//                the held power instead of the card (config.powerTiming
//                'afterDraw') or instead of drawing ('beforeDraw')
//
// A turn can hold several cards. After a card is resolved the same player
// may have to resolve another one (see continueTurn in moves.js):
//   - a campsite landing sets `drawn` to a card from the discard pile
//     (state.campsite), resolved the same way;
//   - the Hanged Man resolves its first card backward (hanged.stage 'back'),
//     then waits for drawCard: that card moves the same unit forward
//     (hanged.stage 'forward');
//   - the "line" Lovers (rules.loversLine) resolves the card as a normal move
//     (lovers.stage 'move'), then offers loversJumps / playLoversJump
//     (lovers.stage 'jump');
//   - the Hermit resolves the card as a move onto an ally (hermit.stage
//     'move'); the ally is then pushed by the same number (moves.js).
// The turn is over when state.current changes, or for an extra turn when
// drawn, hanged, campsite, lovers and hermit are all null again.

import { JOKER, POWERS, isNumberCard, upsideDownCost } from './cards.js';
import { DUD, POWER_TIMINGS } from './config.js';
import { continueTurn, drawTurnCard, endTurn, legalMoves, playNumberCard, resumeTurnCard } from './moves.js';
import { applyPower, powerChoices } from './powers.js';

function assertPlaying(state, fn) {
  if (state.winner !== null) throw new Error(`${fn}: the game is over`);
}

function assertJoker(state, fn) {
  assertPlaying(state, fn);
  if (state.drawn !== JOKER) throw new Error(`${fn}: no joker has been drawn`);
}

export function drawCard(state) {
  assertPlaying(state, 'drawCard');
  if (state.drawn !== null) throw new Error('drawCard: a card is already drawn');

  return drawTurnCard(state);
}

// --- number cards ----------------------------------------------------------

export function currentMoves(state) {
  if (!isNumberCard(state.drawn)) return [];
  return legalMoves(state, state.current, state.drawn);
}

export function playDrawnNumber(state, move = null) {
  assertPlaying(state, 'playDrawnNumber');
  if (!isNumberCard(state.drawn)) {
    throw new Error('playDrawnNumber: no number card has been drawn');
  }
  return playNumberCard(state, state.drawn, move);
}

// --- jokers ------------------------------------------------------------------

export function draftOptions(state) {
  assertJoker(state, 'draftOptions');
  if (!state.config.powers) return [];
  return state.powerDeck.slice(0, 2);
}

export function canDraft(state) {
  return draftOptions(state).length > 0;
}

/** Keeps draftOptions(state)[keepIndex]; the rest go to the bottom. */
export function playDraft(state, keepIndex) {
  assertJoker(state, 'playDraft');
  const options = draftOptions(state);
  if (!Number.isInteger(keepIndex) || keepIndex < 0 || keepIndex >= options.length) {
    throw new Error('playDraft: invalid choice');
  }
  const player = state.current;
  const kept = options[keepIndex];
  const unpicked = options.filter((_, i) => i !== keepIndex);
  const previous = state.held[player];

  const held = [...state.held];
  held[player] = kept;
  const powerDeck = [
    ...state.powerDeck.slice(options.length),
    ...(previous ? [previous] : []),
    ...unpicked,
  ];

  return continueTurn({ ...state, held, powerDeck });
}

/** True when the drawn joker can't draft (powers off, or an empty power deck). */
export function mustPassJoker(state) {
  assertJoker(state, 'mustPassJoker');
  return !canDraft(state);
}

/** Resolves a joker that can't draft: the turn ends without a move. */
export function passJoker(state) {
  if (!mustPassJoker(state)) {
    throw new Error('passJoker: this joker can draft');
  }
  return continueTurn(state);
}

// --- using a held power ---------------------------------------------------------
//
// A power drafted this turn is never usable this turn: powers are only used
// on a turn's own card (not during a Hanged Man use or a campsite card).

/** Powers that use the turn's card rather than spending it. */
function isFreePower(state, power) {
  return power === POWERS.HANGED_MAN || power === POWERS.HERMIT
    || (power === POWERS.LOVERS && state.config.rules.loversLine);
}

const HERMIT_MODE = Object.freeze({ backward: false, only: null, hermit: true });

/** True while a turn is part-way through a multi-card resolution (no power use). */
function turnBusy(state) {
  return Boolean(state.hanged || state.campsite || state.lovers || state.hermit || state.upsideDown);
}

/** Can the current player use their held power right now? */
export function canUsePower(state) {
  if (state.winner !== null || !state.config.powers) return false;
  const power = state.held[state.current];
  if (!power || power === DUD || turnBusy(state)) return false;
  if (state.config.powerTiming === POWER_TIMINGS.BEFORE_DRAW) return state.drawn === null;
  if (state.drawn === null) return false;
  // Free powers use the drawn card: a drawn Joker drafts instead.
  if (!isNumberCard(state.drawn) && isFreePower(state, power)) return false;
  // After draw, a free power needs a move for the drawn card (backward for the Hanged Man).
  if (power === POWERS.HANGED_MAN) {
    return legalMoves(state, state.current, state.drawn, undefined, { backward: true, only: null }).length > 0;
  }
  // The Hermit needs a move onto an ally.
  if (power === POWERS.HERMIT) return legalMoves(state, state.current, state.drawn, undefined, HERMIT_MODE).length > 0;
  if (isFreePower(state, power)) {
    return legalMoves(state, state.current, state.drawn, undefined, { backward: false, only: null }).length > 0;
  }
  return true;
}

/**
 * Valid argument objects for usePower: the power's targets, or [{}] when it
 * has none (it may still be used, to no effect). Empty when it can't be used.
 */
export function powerUseChoices(state) {
  if (!canUsePower(state)) return [];
  const choices = powerChoices(state, state.current, state.held[state.current]);
  return choices.length > 0 ? choices : [{}];
}

/**
 * Uses the held power instead of resolving the drawn card (after-draw timing;
 * the card stays spent) or instead of drawing (before-draw timing).
 * The Hanged Man is free: the turn's card is then resolved moving backward
 * (drawn first with the before-draw timing; if that card has no backward
 * move the turn ends), and a second card moves the same unit forward.
 * The "line" Lovers is free too: the card moves a unit as usual, then the
 * jump stage follows (moves.js). Either bonus (forward card, jump) needs the
 * turn's card to have moved a unit.
 */
export function usePower(state, args = {}) {
  if (!canUsePower(state)) throw new Error('usePower: no power can be used now');
  const player = state.current;
  const power = state.held[player];
  const after = applyPower(state, player, power, args);
  const held = [...after.held];
  held[player] = null;
  const used = { ...after, held, powerDeck: [...after.powerDeck, power] };

  if (power === POWERS.HANGED_MAN) {
    const backward = { ...used, hanged: { stage: 'back', unit: null } };
    return state.config.powerTiming === POWER_TIMINGS.BEFORE_DRAW ? drawCard(backward) : backward;
  }
  if (power === POWERS.HERMIT) {
    const s = state.config.powerTiming === POWER_TIMINGS.BEFORE_DRAW ? drawCard(used) : used;
    // A move onto an ally, then the push. (Before draw, a Joker then drafts as
    // usual and a card with no move onto an ally is played as a normal move.)
    if (isNumberCard(s.drawn) && legalMoves(s, player, s.drawn, undefined, HERMIT_MODE).length > 0) {
      return { ...s, hermit: { stage: 'move', steps: s.drawn } };
    }
    return s;
  }
  if (power === POWERS.LOVERS && state.config.rules.loversLine) {
    const s = state.config.powerTiming === POWER_TIMINGS.BEFORE_DRAW ? drawCard(used) : used;
    // The card is played as usual; the jump follows only a card move. (Before draw,
    // a Joker then drafts as usual and a card with no move ends the turn.)
    if (isNumberCard(s.drawn) && legalMoves(s, player, s.drawn).length > 0) {
      return { ...s, lovers: { stage: 'move' } };
    }
    return s;
  }
  return endTurn(used);
}

// --- using a held power upside down -------------------------------------------------
//
// Test effect, the same for every power: pay the cost, step one unit one cell
// forward (a normal card move: it may enter, capture, ascend, escort and
// trigger the campsite), then the turn's card is played as a normal move.
// With no possible step, the turn's card is played straight away.

/** Can the current player use their held power upside down right now? */
export function canUsePowerUpsideDown(state) {
  if (state.winner !== null || !state.config.powers || !state.config.rules.upsideDown) return false;
  const power = state.held[state.current];
  const cost = upsideDownCost(power);
  if (cost === null || turnBusy(state)) return false;
  if ((state.stars?.[state.current] ?? 0) < cost) return false;
  return state.config.powerTiming === POWER_TIMINGS.BEFORE_DRAW ? state.drawn === null : state.drawn !== null;
}

/**
 * Uses the held power upside down. Returns a state whose `drawn` is 1 with
 * upsideDown.stage 'step' (resolve it with currentMoves / playDrawnNumber),
 * or, when no unit can step, the turn's card ready to play.
 */
export function usePowerUpsideDown(state) {
  if (!canUsePowerUpsideDown(state)) throw new Error('usePowerUpsideDown: no power can be used upside down now');
  const player = state.current;
  const power = state.held[player];
  const held = [...state.held];
  held[player] = null;
  const stars = [...state.stars];
  stars[player] -= upsideDownCost(power);
  const card = state.config.powerTiming === POWER_TIMINGS.BEFORE_DRAW ? null : state.drawn;
  const step = {
    ...state, held, stars, powerDeck: [...state.powerDeck, power], drawn: 1, upsideDown: { stage: 'step', card },
  };
  return legalMoves(step, player, 1).length > 0 ? step : resumeTurnCard(step);
}
