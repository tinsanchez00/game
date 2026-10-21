// Turn flow: draw a card, then resolve it.
//
//   drawCard(state)                         -> state.drawn is set
//   number card: currentMoves(state), then playDrawnNumber(state, move | null)
//   joker:       draftOptions(state), then playDraft(state, keepIndex)
//            or  heldPowerChoices(state), then playHeldPower(state, args)
//            or, when neither is possible (always so with powers off),
//                passJoker(state)
//
// Playing the Hanged Man draws again at once and sets state.hangedDraw; that
// card is then resolved through the same functions (a number card moves a
// unit backward, a joker can only draft), after which the same player takes
// another turn.

import { JOKER, POWERS, isNumberCard } from './cards.js';
import { endTurn, legalMoves, playNumberCard } from './moves.js';
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

  return endTurn({ ...state, held, powerDeck });
}

export function heldPowerChoices(state) {
  assertJoker(state, 'heldPowerChoices');
  if (!state.config.powers || state.hangedDraw) return [];
  const power = state.held[state.current];
  if (!power) return [];
  return powerChoices(state, state.current, power);
}

export function canPlayHeldPower(state) {
  return heldPowerChoices(state).length > 0;
}

/** True when the drawn joker allows neither drafting nor playing a power. */
export function mustPassJoker(state) {
  assertJoker(state, 'mustPassJoker');
  return !canDraft(state) && !canPlayHeldPower(state);
}

/** Resolves a joker that can do nothing: the turn ends without a move. */
export function passJoker(state) {
  if (!mustPassJoker(state)) {
    throw new Error('passJoker: this joker can draft or play a power');
  }
  return endTurn(state);
}

export function playHeldPower(state, args = {}) {
  assertJoker(state, 'playHeldPower');
  if (!state.config.powers) throw new Error('playHeldPower: powers are turned off');
  if (state.hangedDraw) {
    throw new Error('playHeldPower: a joker drawn by the Hanged Man can only draft');
  }
  const player = state.current;
  const power = state.held[player];
  if (!power) throw new Error('playHeldPower: no power held');

  const after = applyPower(state, player, power, args);
  const held = [...after.held];
  held[player] = null;
  const played = { ...after, held, powerDeck: [...after.powerDeck, power] };

  if (power === POWERS.HANGED_MAN) {
    return drawCard({ ...played, drawn: null, hangedDraw: true });
  }
  return endTurn(played);
}
