// Game settings. A game's settings live in its state (state.config) so a saved
// or synced game always carries the variant it is played with.
//
// makeConfig(overrides) deep-merges `overrides` onto DEFAULT_CONFIG, checks
// the result and returns a frozen object. Every field is optional in the
// overrides; `board.towers`, `board.campsites` and the decks are replaced, not
// merged.

export const JOKER = 'joker';

/** When a held power can be used, instead of resolving or drawing a card. */
export const POWER_TIMINGS = Object.freeze({
  AFTER_DRAW: 'afterDraw', // draw, then use the power instead of the card (card is spent)
  BEFORE_DRAW: 'beforeDraw', // use the power instead of drawing
});

export const POWER_IDS = Object.freeze([
  'hanged-man', 'lovers', 'devil', 'tower', 'hermit',
]);

/** Test-only power card: drafted and held like a power, never usable. */
export const DUD = 'dud';

/** Every card id a power deck may hold. */
export const CARD_IDS = Object.freeze([...POWER_IDS, DUD]);

export const DEFAULT_CONFIG = deepFreeze({
  // false: a joker is a no-move card and the power deck is unused.
  powers: true,
  powerTiming: 'afterDraw', // see POWER_TIMINGS
  moveDeck: [1, 2, 2, 3, 3, 3, 4, JOKER],
  powerDeck: [...POWER_IDS],
  soldiers: 5,
  commanders: 1,
  maxPerCell: 2,
  board: {
    startLane: 3, // private cells before the shared lane
    middleLane: 9, // shared cells
    endLane: 2, // private cells after the shared lane
    towers: [7, 14], // path positions (1 = first cell of the path)
    campsites: [5], // path positions; landing with a card move draws from the discard pile
  },
  rules: {
    exactAscend: true, // false: any card that reaches past the last cell ascends
    commanderLock: true, // false: commanders may leave home while soldiers are home
    escort: true, // false: commanders always move alone
    towersProtect: true, // false: towers are plain cells for captures and the Hermit
    towerExtraTurn: false, // true: landing on a tower with a number card gives another turn
    hangedTurn: true, // false: the earlier Hanged Man (a forward card for the same unit instead of an extra turn)
    loversLine: true, // false: the earlier Lovers (pair a middle-lane unit with a lone ally there)
    upsideDown: true, // false: powers can only be used upright (stars are still counted)
  },
});

function deepFreeze(obj) {
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') deepFreeze(value);
  }
  return Object.freeze(obj);
}

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function merge(base, over) {
  if (over === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(over)) return over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (!(k in base)) throw new Error(`config: unknown setting "${k}"`);
    out[k] = merge(base[k], v);
  }
  return out;
}

const isInt = (n) => Number.isInteger(n);

function check(cond, message) {
  if (!cond) throw new Error(`config: ${message}`);
}

export function pathLengthOf(board) {
  return board.startLane + board.middleLane + board.endLane;
}

export function validateConfig(c) {
  check(typeof c.powers === 'boolean', 'powers must be true or false');
  check(Object.values(POWER_TIMINGS).includes(c.powerTiming),
    `powerTiming must be one of ${Object.values(POWER_TIMINGS).join(', ')}`);

  check(Array.isArray(c.moveDeck) && c.moveDeck.length > 0, 'moveDeck needs at least one card');
  for (const card of c.moveDeck) {
    check(card === JOKER || (isInt(card) && card >= 1), `moveDeck card ${JSON.stringify(card)} must be a positive integer or "${JOKER}"`);
  }

  check(Array.isArray(c.powerDeck), 'powerDeck must be a list');
  for (const p of c.powerDeck) {
    check(CARD_IDS.includes(p), `unknown power "${p}"`);
  }

  check(isInt(c.soldiers) && c.soldiers >= 0, 'soldiers must be 0 or more');
  check(isInt(c.commanders) && c.commanders >= 0, 'commanders must be 0 or more');
  check(c.soldiers + c.commanders >= 1, 'each team needs at least one unit');
  check(isInt(c.maxPerCell) && c.maxPerCell >= 1, 'maxPerCell must be 1 or more');

  const b = c.board;
  check(isInt(b.startLane) && b.startLane >= 1, 'board.startLane must be 1 or more');
  check(isInt(b.middleLane) && b.middleLane >= 1, 'board.middleLane must be 1 or more');
  check(isInt(b.endLane) && b.endLane >= 0, 'board.endLane must be 0 or more');
  const length = pathLengthOf(b);
  check(Array.isArray(b.towers), 'board.towers must be a list');
  check(new Set(b.towers).size === b.towers.length, 'board.towers has duplicates');
  for (const t of b.towers) {
    check(isInt(t) && t >= 1 && t <= length, `tower ${t} is outside the path (1-${length})`);
  }
  check(Array.isArray(b.campsites), 'board.campsites must be a list');
  check(new Set(b.campsites).size === b.campsites.length, 'board.campsites has duplicates');
  for (const t of b.campsites) {
    check(isInt(t) && t >= 1 && t <= length, `campsite ${t} is outside the path (1-${length})`);
    check(!b.towers.includes(t), `cell ${t} can't be both a tower and a campsite`);
  }

  for (const [k, v] of Object.entries(c.rules)) {
    check(typeof v === 'boolean', `rules.${k} must be true or false`);
  }
  return c;
}

/** Defaults merged with `overrides`, validated and frozen. */
export function makeConfig(overrides = {}) {
  if (Object.isFrozen(overrides) && overrides.board && overrides.rules && 'moveDeck' in overrides) {
    // Already a complete config (e.g. reused from another game).
    return validateConfig(overrides);
  }
  const merged = merge(structuredClone(DEFAULT_CONFIG), structuredClone(overrides));
  merged.board.towers = [...merged.board.towers].sort((a, b) => a - b);
  merged.board.campsites = [...merged.board.campsites].sort((a, b) => a - b);
  return deepFreeze(validateConfig(merged));
}
