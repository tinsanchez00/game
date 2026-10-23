import { DEFAULT_CONFIG, JOKER } from './config.js';

export { JOKER };

export const MOVE_DECK = DEFAULT_CONFIG.moveDeck;

export const POWERS = Object.freeze({
  HANGED_MAN: 'hanged-man',
  LOVERS: 'lovers',
  DEVIL: 'devil',
  TOWER: 'tower',
  HERMIT: 'hermit',
});

export const STARTING_POWER_DECK = DEFAULT_CONFIG.powerDeck;

/** Star cost of each power's upside-down effect (one test effect for all, for now). */
const UPSIDE_DOWN_COSTS = Object.freeze({
  [POWERS.HANGED_MAN]: 1,
  [POWERS.LOVERS]: 1,
  [POWERS.DEVIL]: 1,
  [POWERS.TOWER]: 1,
  [POWERS.HERMIT]: 1,
});

/** Stars needed to use `power` upside down; null for a card with no upside-down side. */
export function upsideDownCost(power) {
  return UPSIDE_DOWN_COSTS[power] ?? null;
}

export function isNumberCard(card) {
  return Number.isInteger(card);
}
