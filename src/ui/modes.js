// Game modes for the "Game mode" screen: named presets of a small settings
// object, and its translation into a rules config. Pure: no DOM.
//
// settings = { units, powers, deck, timing, lovers, hanged, jokers,
//              commanderLock, escort, towersProtect, towerExtraTurn, exactAscend }
// deck: the powers in the power deck (ids, in POWER_IDS order).

import { DEFAULT_CONFIG, JOKER, POWER_IDS } from '../rules/index.js';

const D = DEFAULT_CONFIG;
const NUMBERS = D.moveDeck.filter((c) => c !== JOKER);

/** The standard rules as settings. */
export const STANDARD = Object.freeze({
  units: D.soldiers + D.commanders,
  powers: D.powers,
  deck: Object.freeze(POWER_IDS.filter((id) => D.powerDeck.includes(id))),
  timing: D.powerTiming,
  lovers: D.rules.loversLine ? 'jump' : 'pairing',
  hanged: D.rules.hangedTurn ? 'extra' : 'forward',
  jokers: D.moveDeck.length - NUMBERS.length,
  commanderLock: D.rules.commanderLock,
  escort: D.rules.escort,
  towersProtect: D.rules.towersProtect,
  towerExtraTurn: D.rules.towerExtraTurn,
  exactAscend: D.rules.exactAscend,
});

/** Presets in screen order: id -> settings changed from STANDARD. */
export const PRESETS = Object.freeze([
  { id: 'standard', changes: {} },
  { id: 'short', changes: { units: 5 } },
  { id: 'noPowers', changes: { powers: false } },
  { id: 'earlierPowers', changes: { lovers: 'pairing', hanged: 'forward' } },
  { id: 'twoJokers', changes: { jokers: 2 } },
  { id: 'urTowers', changes: { towerExtraTurn: true } },
]);

/**
 * Customizable settings in screen order. kind 'choice' lists its values;
 * 'switch' is on/off; 'multi' is any subset of its values. `when`: shown only
 * when it returns true for the current settings.
 */
export const FIELDS = Object.freeze([
  { key: 'units', kind: 'choice', values: [5, 6] },
  { key: 'powers', kind: 'switch' },
  { key: 'deck', kind: 'multi', values: [...POWER_IDS], when: (s) => s.powers },
  { key: 'timing', kind: 'choice', values: ['afterDraw', 'beforeDraw'] },
  { key: 'lovers', kind: 'choice', values: ['jump', 'pairing'] },
  { key: 'hanged', kind: 'choice', values: ['extra', 'forward'] },
  { key: 'jokers', kind: 'choice', values: [1, 2] },
  { key: 'commanderLock', kind: 'switch' },
  { key: 'escort', kind: 'switch' },
  { key: 'towersProtect', kind: 'switch' },
  { key: 'towerExtraTurn', kind: 'switch' },
  { key: 'exactAscend', kind: 'switch' },
]);

export function presetSettings(id) {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`unknown preset ${id}`);
  return { ...STANDARD, ...preset.changes };
}

const same = (a, b) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => x === b[i]) : a === b);

/** Keys whose value differs from the preset's. */
export function changedKeys(presetId, settings) {
  const base = presetSettings(presetId);
  return FIELDS.map((f) => f.key).filter((k) => !same(settings[k], base[k]));
}

/** A 'multi' setting with `value` switched on or off (kept in the field's order). */
export function toggleValue(key, current, raw) {
  const field = FIELDS.find((f) => f.key === key);
  if (field?.kind !== 'multi') throw new Error(`${key} is not a multi setting`);
  const value = field.values.find((v) => String(v) === String(raw));
  if (value === undefined) throw new Error(`bad value ${raw} for ${key}`);
  const on = new Set(current);
  if (on.has(value)) on.delete(value);
  else on.add(value);
  return field.values.filter((v) => on.has(v));
}

/** Reads a field value sent by the screen (a string) as its setting type. */
export function parseValue(key, raw) {
  const field = FIELDS.find((f) => f.key === key);
  if (!field) throw new Error(`unknown setting ${key}`);
  if (field.kind === 'switch') return raw === true || raw === 'true';
  const value = field.values.find((v) => String(v) === String(raw));
  if (value === undefined) throw new Error(`bad value ${raw} for ${key}`);
  return value;
}

/** Config overrides for createGame. */
export function toConfig(s) {
  return {
    soldiers: s.units - D.commanders,
    // No power left in the deck plays like powers off: a Joker means no move.
    powers: s.powers && s.deck.length > 0,
    powerDeck: s.deck.length > 0 ? [...s.deck] : [...D.powerDeck],
    powerTiming: s.timing,
    moveDeck: [...NUMBERS, ...Array(s.jokers).fill(JOKER)],
    rules: {
      commanderLock: s.commanderLock,
      escort: s.escort,
      towersProtect: s.towersProtect,
      towerExtraTurn: s.towerExtraTurn,
      exactAscend: s.exactAscend,
      loversLine: s.lovers === 'jump',
      hangedTurn: s.hanged === 'extra',
    },
  };
}
