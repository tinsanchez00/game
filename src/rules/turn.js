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
//     (hanged.stage 'forward').
// The turn is over when state.current changes, or for an extra turn when
// drawn, hanged and campsite are all null again.

import { JOKER, POWERS, isNumberCard } from './cards.js';
import { POWER_TIMINGS } from './config.js';
import { continueTurn, endTurn, legalMoves, playNumberCard } from './moves.js';
import { applyPower, powerChoices } from './powers.js';
import { shuffle } from './random.js';

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

  const player = state.current;
  let { rng } = state;
  let { draw, discard } = state.moveDecks[player];
  if (draw.length === 0) {
    const s = shuffle(state.config.moveDeck, rng);
    rng = s.rng;
    draw = s.items;
    discard = [];
  }
  const [card, ...rest] = draw;
  const moveDecks = [...state.moveDecks];
  moveDecks[player] = { draw: rest, discard: [...discard, card] };

  return { ...state, rng, moveDecks, drawn: card };
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

/** Can the current player use their held power right now? */
export function canUsePower(state) {
  if (state.winner !== null || !state.config.powers) return false;
  if (!state.held[state.current] || state.hanged || state.campsite) return false;
  return state.config.powerTiming === POWER_TIMINGS.BEFORE_DRAW
    ? state.drawn === null
    : state.drawn !== null;
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
 * (drawn first with the before-draw timing), and a second card moves the
 * same unit forward.
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
  return endTurn(used);
}
