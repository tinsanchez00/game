// All on-screen wording lives here so it can be changed in one place.
// Everything below is placeholder copy.

import { POWERS } from '../rules/index.js';

export const TEAM_NAMES = ['Gold', 'Obsidian'];

export const POWER_INFO = {
  [POWERS.HANGED_MAN]: { name: 'The Hanged Man', numeral: 'XII' },
  [POWERS.LOVERS]: { name: 'The Lovers', numeral: 'VI' },
  [POWERS.DEVIL]: { name: 'The Devil', numeral: 'XV' },
  [POWERS.TOWER]: { name: 'The Tower', numeral: 'XVI' },
  [POWERS.HERMIT]: { name: 'The Hermit', numeral: 'IX' },
};

export const OPTION_LABELS = {
  soldier: 'Soldier',
  commander: 'Commander',
  'commander+escort': 'Commander + escort',
};

// One-line summaries of each side's effect, for the side picker (placeholders).
const UPRIGHT_SHORT = {
  [POWERS.HANGED_MAN]: 'a unit back, then an extra turn',
  [POWERS.LOVERS]: 'a unit jumps to its nearest ally',
  [POWERS.DEVIL]: 'kill the units next to yours',
  [POWERS.TOWER]: 'step a unit off a tower, then your card',
  [POWERS.HERMIT]: 'move onto an ally, push it on',
};
const UPSIDE_SHORT = {
  [POWERS.HANGED_MAN]: 'an enemy unit back, then an extra turn',
  [POWERS.LOVERS]: 'an enemy unit jumps to its nearest ally',
  [POWERS.DEVIL]: 'pull every unit one cell in',
  [POWERS.TOWER]: 'destroy every unit on the towers',
  [POWERS.HERMIT]: 'use a number from your discard pile',
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const TEXT = {
  testMode: 'Test mode · both players on this phone',
  menu: 'Menu',
  fullscreen: 'Fullscreen, landscape',
  boardLabel: 'Game table',
  newGame: 'New game',
  restartPrompt: 'Restart?',
  yes: 'Yes',
  no: 'No',
  home: 'Home',
  ascended: (n, total) => `Ascended ${n}/${total}`,
  left: (n) => `${n} left`,
  drawn: 'Drawn',
  campCard: 'From discard',
  discard: 'Discard',
  discardEmpty: 'empty',
  jokerShort: 'J',
  discardLabel: (team, cards) => `${team}'s discard pile: ${cards || 'empty'}`,
  power: 'Power',
  noPower: 'No power',
  lane: (team) => `${team}'s lane`,
  joker: 'Joker',
  move: 'Move',
  cancel: 'Cancel',
  continue: 'Continue',
  draft: 'Draft a power',
  usePower: (power) => `Use ${power}`,
  usePowerInstead: (power) => `Use ${power} instead`,
  unleash: 'Unleash',
  stepForward: 'Step',
  // Picking a side for the held power (placeholders).
  side: {
    heading: (power) => `Use ${power}`,
    upright: 'Upright',
    uprightNote: (power) => `Free · ${UPRIGHT_SHORT[power] ?? ''}`.replace(/ · $/, ''),
    upsideDown: 'Upside down',
    upsideNote: (cost, power) => `${plural(cost, 'star')} · ${UPSIDE_SHORT[power] ?? ''}`,
    back: 'Back',
  },
  stepCard: 'Step',
  stars: (team, n) => `${team}: ${plural(n, 'star')}`,

  status: {
    handoff: (team) => `${team}'s turn — pass the phone`,
    startTurn: (team) => `Start ${team}'s turn`,
    draw: (team) => `${team}'s turn · tap your deck to draw`,
    // step: null (a normal card), 'back' / 'backEnemy' (The Hanged Man), 'campsite', 'hermit'
    move: (n, step) => ({
      back: `The Hanged Man · move a unit ${n} back`,
      backEnemy: `The Hanged Man · move an enemy unit ${n} back`,
      campsite: `Campsite · move that unit ${n} again`,
      hermit: `The Hermit · move a unit ${n} onto an ally`,
    })[step] ?? `Move a unit ${n} forward`,
    pickMove: 'Tap the glowing cell to move there',
    side: (power) => `Use ${power} upright or upside down`,
    stuck: (n, step) => ({
      back: `No valid backward move with ${n}`,
      backEnemy: `No enemy unit can move ${n} back`,
      campsite: `Campsite · that unit can't move ${n}`,
    })[step] ?? `No valid move with ${n}`,
    jokerPass: (step) => (step === 'campsite' ? 'Campsite · Joker, no move' : 'Joker · no move this turn'),
    joker: 'Joker · draft a power, or use yours instead',
    draft: (step) => ({
      back: 'The Hanged Man · your Joker drafts a power',
      backEnemy: 'The Hanged Man · your Joker drafts a power',
      campsite: 'Campsite · your Joker drafts a power',
    })[step] ?? 'Keep one power',
    loversPick: 'The Lovers · pick a unit to jump to its nearest ally',
    loversPickEnemy: 'The Lovers · pick an enemy unit to jump to its nearest ally',
    loversTarget: 'The Lovers · tap the ally to jump to',
    towerPick: 'The Tower · pick a unit on a tower to step forward',
    towerConfirm: 'The Tower · step forward, then play your card',
    devilPick: 'The Devil · pick one of your units',
    devilPickAny: 'The Devil · pick any unit in the middle lane',
    hermitPile: 'The Hermit · pick a number from your discard pile',
    devilConfirm: 'Marked units will die',
    chooseUnit: 'Which unit?',
    won: (team) => `${team} ascends!`,
  },

  event: {
    lost: (team, n) => `${team} lost ${plural(n, 'unit')}`,
    ascended: (team, n) => `${team} ascended ${plural(n, 'unit')}`,
    turnLost: (team) => `${team} lost the turn`,
    noMove: (team) => `${team} couldn't move`,
    drafted: (team, power) => `${team} drafted ${power}`,
    played: (team, power) => `${team} played ${power}`,
    flipped: (team, power) => `${team} played ${power} upside down`,
    extraTurn: (team) => `${team} takes an extra turn`,
  },
};

// Start and game-mode screens (placeholder copy).
const MENU_DECK = { 'hanged-man': 'Hanged Man', lovers: 'Lovers', devil: 'Devil', tower: 'Tower', hermit: 'Hermit' };

export const MENU = {
  gameName: '[Game name]',
  tagline: 'A race inspired by the Royal Game of Ur',
  quick: 'Quick game',
  mode: 'Game mode',
  continue: 'Continue last game',
  quickHint: 'Quick game: standard rules, 6 units each',
  // Placeholder wording: the board style switch at the bottom of the start screen.
  boardSwitch: (board) => (board === 'flat' ? 'Flat board · switch to 3D' : '3D board · switch to flat'),
  // Placeholder wording: how the phone is used.
  seatLabel: 'How you play',
  seat: { '3d': 'Pass the phone', table: 'Phone on the table' },
  back: 'Back',
  start: 'Start',
  customize: 'Customize',
  changed: 'changed',
  changedMark: 'changed',
  preset: {
    standard: { name: 'Standard' },
    short: { name: 'Short game' },
    noPowers: { name: 'No powers' },
    twoJokers: { name: 'Two Jokers' },
    urTowers: { name: 'Ur towers' },
  },
  field: {
    units: 'Units each',
    powers: 'Powers',
    deck: 'Powers in the deck',
    timing: 'Use a power',
    jokers: 'Jokers in each deck',
    commanderLock: 'Commander lock',
    escort: 'Escort',
    towersProtect: 'Towers protect',
    towerExtraTurn: 'Towers give another turn',
    exactAscend: 'Exact ascension',
  },
  value: {
    timing: { afterDraw: 'After draw', beforeDraw: 'Before draw' },
    deck: MENU_DECK,
  },
  /** One line describing a settings object. */
  summary: (s) => {
    const n = s.deck.length;
    const missing = Object.entries(MENU_DECK).filter(([id]) => !s.deck.includes(id)).map(([, name]) => `no ${name}`);
    const powers = !s.powers || n === 0 ? 'no powers' : n === 5 ? 'all five powers' : `${n} power${n === 1 ? '' : 's'}: ${missing.join(', ')}`;
    const parts = [`${s.units} units each`, powers, `${s.jokers} Joker${s.jokers === 1 ? '' : 's'}`];
    if (s.powers && s.timing !== 'afterDraw') parts.push('powers before draw');
    if (s.towerExtraTurn) parts.push('towers give another turn');
    if (!s.commanderLock) parts.push('no commander lock');
    if (!s.escort) parts.push('no escort');
    if (!s.towersProtect) parts.push('towers don\'t protect');
    if (!s.exactAscend) parts.push('any card can ascend');
    return parts.join(' · ');
  },
};
