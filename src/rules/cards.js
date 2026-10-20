export const JOKER = 'joker';

export const MOVE_DECK = Object.freeze([1, 2, 2, 3, 3, 3, 4, JOKER, JOKER]);

export const POWERS = Object.freeze({
  HANGED_MAN: 'hanged-man',
  LOVERS: 'lovers',
  DEVIL: 'devil',
  TOWER: 'tower',
  HERMIT: 'hermit',
});

export const STARTING_POWER_DECK = Object.freeze([
  POWERS.HANGED_MAN,
  POWERS.LOVERS,
  POWERS.DEVIL,
  POWERS.TOWER,
  POWERS.HERMIT,
]);

export function isNumberCard(card) {
  return Number.isInteger(card);
}
