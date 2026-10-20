// Turn flow: draw a card, then resolve it.
//
//   drawCard(state)                         -> state.drawn is set
//   number card: currentMoves(state), then playDrawnNumber(state, move | null)
//   joker:       draftOptions(state), then playDraft(state, keepIndex)
//            or  heldPowerChoices(state), then playHeldPower(state, args)

import { JOKER, MOVE_DECK, isNumberCard } from './cards.js';
import { legalMoves, playNumberCard } from './moves.js';
import { EXTRA_TURN_POWERS, applyPower, powerChoices } from './powers.js';
import { shuffle } from './random.js';
import { otherPlayer } from './state.js';

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
    const s = shuffle(MOVE_DECK, rng);
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
  return state.powerDeck.slice(0, 2);
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

  return { ...state, held, powerDeck, drawn: null, current: otherPlayer(player) };
}

export function heldPowerChoices(state) {
  assertJoker(state, 'heldPowerChoices');
  const power = state.held[state.current];
  if (!power) return [];
  return powerChoices(state, state.current, power);
}

export function canPlayHeldPower(state) {
  return heldPowerChoices(state).length > 0;
}

export function playHeldPower(state, args = {}) {
  assertJoker(state, 'playHeldPower');
  const player = state.current;
  const power = state.held[player];
  if (!power) throw new Error('playHeldPower: no power held');

  const after = applyPower(state, player, power, args);
  const held = [...after.held];
  held[player] = null;

  return {
    ...after,
    held,
    powerDeck: [...after.powerDeck, power],
    drawn: null,
    current: EXTRA_TURN_POWERS.includes(power) ? player : otherPlayer(player),
  };
}
