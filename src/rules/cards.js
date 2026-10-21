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

export function isNumberCard(card) {
  return Number.isInteger(card);
}
