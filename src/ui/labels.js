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
  newGame: 'New game',
  restartPrompt: 'Restart?',
  yes: 'Yes',
  no: 'No',
  home: 'Home',
  ascended: (n, total) => `Ascended ${n}/${total}`,
  left: (n) => `${n} left`,
  drawn: 'Drawn',
  campCard: 'From discard',
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

  status: {
    handoff: (team) => `${team}'s turn — pass the phone`,
    startTurn: (team) => `Start ${team}'s turn`,
    draw: (team) => `${team}'s turn · tap your deck to draw`,
    // step: null (a normal card), 'back' / 'forward' (The Hanged Man), 'campsite'
    drawForward: 'The Hanged Man · tap your deck to draw the forward card',
    move: (n, step) => ({
      back: `The Hanged Man · move a unit ${n} back`,
      forward: `The Hanged Man · move ${n} forward`,
      campsite: `Campsite · move that unit ${n} again`,
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
  },
};
