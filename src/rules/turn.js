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
//   - the Hanged Man resolves its card backward (hanged.stage 'back'; the
//     opponent's units when upside down), then the same player takes an
//     extra turn;
//   - the Hermit resolves the card as a move onto an ally (hermit.stage
//     'move'); the ally is then pushed by the same number (moves.js).
// The turn is over when state.current changes, or for an extra turn when
// drawn, hanged, campsite and hermit are all null again.

import { JOKER, POWERS, isNumberCard, upsideDownCost } from './cards.js';
import { DUD, POWER_TIMINGS } from './config.js';
import { opponents, playersOf } from './state.js';
import { continueTurn, drawTurnCard, endTurn, legalMoves, occupancy, playNumberCard, turnMoves } from './moves.js';
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
  return turnMoves(state);
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
// A held power has two sides: upright (free) and upside down (costs stars,
// see upsideDownCost). Either is used instead of the turn's card (after-draw
// timing; the card is spent) or instead of drawing (before-draw timing).
// The free powers use the turn's card instead: the Hanged Man (back, then an
// extra turn), the Hermit (onto an ally, then the push) and the upright Tower
// (a unit on a tower steps forward, then the card is played as usual).
// A power drafted this turn is never usable this turn: powers are only used
// on a turn's own card (not during a Hanged Man use or a campsite card).

const HERMIT_MODE = Object.freeze({ backward: false, only: null, hermit: true });

/** True while a turn is part-way through a multi-card resolution (no power use). */
function turnBusy(state) {
  return Boolean(state.hanged || state.campsite || state.hermit);
}

/** Can the current player use their held power with this side up now? */
function canUseSide(state, upsideDown) {
  if (state.winner !== null || !state.config.powers) return false;
  const player = state.current;
  const power = state.held[player];
  if (!power || power === DUD || turnBusy(state)) return false;
  if (upsideDown) {
    const cost = upsideDownCost(power);
    if (!state.config.rules.upsideDown || cost === null || (state.stars?.[player] ?? 0) < cost) return false;
  }
  const before = state.config.powerTiming === POWER_TIMINGS.BEFORE_DRAW;
  if (before ? state.drawn !== null : state.drawn === null) return false;
  const card = state.drawn;
  switch (power) {
    case POWERS.HANGED_MAN: {
      if (before) return true;
      if (!isNumberCard(card)) return false;
      const movers = upsideDown ? opponents(state, player) : [player];
      const occ = occupancy(state);
      return movers.some((q) => legalMoves(state, q, card, occ, { backward: true, only: null, alone: upsideDown }).length > 0);
    }
    case POWERS.HERMIT:
      if (upsideDown) return powerChoices(state, player, power, { upsideDown }).length > 0;
      if (before) return true;
      return isNumberCard(card) && legalMoves(state, player, card, occupancy(state), HERMIT_MODE).length > 0;
    case POWERS.TOWER:
      if (upsideDown) return true;
      // Free: not on a drawn Joker; needs a unit on a tower that can step.
      return (before || isNumberCard(card)) && powerChoices(state, player, power).length > 0;
    default:
      return true;
  }
}

/** Can the current player use their held power upright right now? */
export function canUsePower(state) {
  return canUseSide(state, false);
}

/** Can the current player use their held power upside down right now (stars included)? */
export function canUsePowerUpsideDown(state) {
  return canUseSide(state, true);
}

function sideChoices(state, upsideDown) {
  if (!canUseSide(state, upsideDown)) return [];
  const choices = powerChoices(state, state.current, state.held[state.current], { upsideDown });
  return choices.length > 0 ? choices : [{}];
}

/**
 * Valid argument objects for usePower: the power's targets, or [{}] when it
 * has none (it may still be used, to no effect). Empty when it can't be used.
 */
export function powerUseChoices(state) {
  return sideChoices(state, false);
}

/** Valid argument objects for usePowerUpsideDown (see powerUseChoices). */
export function powerUpsideDownChoices(state) {
  return sideChoices(state, true);
}

function useSide(state, args, upsideDown) {
  const player = state.current;
  const power = state.held[player];
  const after = applyPower(state, player, power, args, { upsideDown });
  const held = [...after.held];
  held[player] = null;
  const stars = [...(after.stars ?? playersOf(state).map(() => 0))];
  if (upsideDown) stars[player] -= upsideDownCost(power);
  const used = { ...after, held, stars, powerDeck: [...after.powerDeck, power] };
  if (used.winner !== null) return used; // the Tower's step can end the game
  const before = state.config.powerTiming === POWER_TIMINGS.BEFORE_DRAW;

  switch (power) {
    case POWERS.HANGED_MAN: {
      const back = { ...used, hanged: { stage: 'back', unit: null, enemy: upsideDown } };
      return before ? drawCard(back) : back;
    }
    case POWERS.HERMIT: {
      if (upsideDown) {
        // A number from the discard pile stands in for the turn's card.
        return { ...used, drawn: args.card, hermit: { stage: 'move', steps: args.card } };
      }
      const s = before ? drawCard(used) : used;
      // A move onto an ally, then the push. (Before draw, a Joker then drafts as
      // usual and a card with no move onto an ally is played as a normal move.)
      if (isNumberCard(s.drawn) && legalMoves(s, player, s.drawn, undefined, HERMIT_MODE).length > 0) {
        return { ...s, hermit: { stage: 'move', steps: s.drawn } };
      }
      return s;
    }
    case POWERS.TOWER:
      // Upright: after the step, the turn's card is played as usual.
      if (!upsideDown) return before ? drawCard(used) : used;
      return endTurn(used);
    default:
      return endTurn(used);
  }
}

/** Uses the held power upright with `args` (one of powerUseChoices). */
export function usePower(state, args = {}) {
  if (!canUsePower(state)) throw new Error('usePower: no power can be used now');
  return useSide(state, args, false);
}

/** Uses the held power upside down with `args` (one of powerUpsideDownChoices), paying its stars. */
export function usePowerUpsideDown(state, args = {}) {
  if (!canUsePowerUpsideDown(state)) throw new Error('usePowerUpsideDown: no power can be used upside down now');
  return useSide(state, args, true);
}
