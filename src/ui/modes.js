// Game modes for the "Game mode" screen: named presets of a small settings
// object, and its translation into a rules config. Pure: no DOM.
//
// settings = { units, powers, timing, lovers, hanged, jokers,
//              commanderLock, escort, towersProtect, towerExtraTurn, exactAscend }

import { DEFAULT_CONFIG, JOKER } from '../rules/index.js';

const D = DEFAULT_CONFIG;
const NUMBERS = D.moveDeck.filter((c) => c !== JOKER);

/** The standard rules as settings. */
export const STANDARD = Object.freeze({
  units: D.soldiers + D.commanders,
  powers: D.powers,
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
 * 'switch' is on/off.
 */
export const FIELDS = Object.freeze([
  { key: 'units', kind: 'choice', values: [5, 6] },
  { key: 'powers', kind: 'switch' },
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

/** Keys whose value differs from the preset's. */
export function changedKeys(presetId, settings) {
  const base = presetSettings(presetId);
  return FIELDS.map((f) => f.key).filter((k) => settings[k] !== base[k]);
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
    powers: s.powers,
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
