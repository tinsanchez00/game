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
  jump: 'Jump',
  stay: 'Stay',

  status: {
    handoff: (team) => `${team}'s turn — pass the phone`,
    startTurn: (team) => `Start ${team}'s turn`,
    draw: (team) => `${team}'s turn · tap your deck to draw`,
    // step: null (a normal card), 'back' / 'forward' (The Hanged Man), 'campsite', 'lovers'
    drawForward: 'The Hanged Man · tap your deck to draw the forward card',
    move: (n, step) => ({
      back: `The Hanged Man · move a unit ${n} back`,
      forward: `The Hanged Man · move ${n} forward`,
      campsite: `Campsite · move that unit ${n} again`,
      lovers: `The Lovers · move a unit ${n} forward`,
    })[step] ?? `Move a unit ${n} forward`,
    pickMove: 'Tap the glowing cell to move there',
    stuck: (n, step) => ({
      back: `No valid backward move with ${n}`,
      forward: `No valid forward move with ${n}`,
      campsite: `Campsite · that unit can't move ${n}`,
    })[step] ?? `No valid move with ${n}`,
    jokerPass: (step) => (step === 'campsite' ? 'Campsite · Joker, no move' : 'Joker · no move this turn'),
    joker: 'Joker · draft a power, or use yours instead',
    draft: (step) => ({
      back: 'The Hanged Man · your Joker drafts a power',
      forward: 'The Hanged Man · your Joker drafts a power',
      campsite: 'Campsite · your Joker drafts a power',
    })[step] ?? 'Keep one power',
    loversPick: 'The Lovers · pick a unit in the middle lane',
    loversTarget: 'The Lovers · pick the lone ally to join',
    loversJump: 'The Lovers · tap your ally to jump',
    loversPickJumper: 'The Lovers · pick the unit that jumps',
    devilPick: 'The Devil · pick one of your units in the middle lane',
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
    jumped: (team) => `${team} jumped to an ally`,
    extraTurn: (team) => `${team} takes an extra turn`,
  },
};

// Start and game-mode screens (placeholder copy).
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
    earlierPowers: { name: 'Earlier powers' },
    twoJokers: { name: 'Two Jokers' },
    urTowers: { name: 'Ur towers' },
  },
  field: {
    units: 'Units each',
    powers: 'Powers',
    timing: 'Use a power',
    lovers: 'The Lovers',
    hanged: 'The Hanged Man',
    jokers: 'Jokers in each deck',
    commanderLock: 'Commander lock',
    escort: 'Escort',
    towersProtect: 'Towers protect',
    towerExtraTurn: 'Towers give another turn',
    exactAscend: 'Exact ascension',
  },
  value: {
    timing: { afterDraw: 'After draw', beforeDraw: 'Before draw' },
    lovers: { jump: 'Jump', pairing: 'Pairing' },
    hanged: { extra: 'Extra turn', forward: 'Forward card' },
  },
  /** One line describing a settings object. */
  summary: (s) => {
    const parts = [`${s.units} units each`, s.powers ? 'all five powers' : 'no powers', `${s.jokers} Joker${s.jokers === 1 ? '' : 's'}`];
    if (s.powers && s.timing !== 'afterDraw') parts.push('powers before draw');
    if (s.powers && s.lovers !== 'jump') parts.push('the Lovers: Pairing');
    if (s.powers && s.hanged !== 'extra') parts.push('the Hanged Man: Forward card');
    if (s.towerExtraTurn) parts.push('towers give another turn');
    if (!s.commanderLock) parts.push('no commander lock');
    if (!s.escort) parts.push('no escort');
    if (!s.towersProtect) parts.push('towers don\'t protect');
    if (!s.exactAscend) parts.push('any card can ascend');
    return parts.join(' · ');
  },
};
