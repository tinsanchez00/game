// Power effects. Each effect takes a state and returns new units (and flags);
// turn bookkeeping lives in turn.js.

import { HOME, geometry } from './board.js';
import { POWERS } from './cards.js';
import { isCommanderLocked, sendHome } from './moves.js';
import { getUnit } from './state.js';

function middleUnits(state, player = null) {
  const g = geometry(state.config);
  return state.units.filter(
    (u) => g.isShared(u.pos) && (player === null || u.player === player),
  );
}

// --- choices -------------------------------------------------------------

function loversChoices(state, player) {
  if (state.config.maxPerCell < 2) return [];
  const mine = middleUnits(state, player);
  const all = middleUnits(state);
  const locked = isCommanderLocked(state, player);
  const choices = [];
  for (const unit of mine) {
    if (unit.type === 'commander' && locked) continue;
    for (const partner of mine) {
      if (partner.pos === unit.pos) continue;
      if (all.filter((u) => u.pos === partner.pos).length !== 1) continue;
      choices.push({ unit: unit.id, target: partner.id });
    }
  }
  return choices;
}

function devilChoices(state, player) {
  return middleUnits(state, player).map((u) => ({ unit: u.id }));
}

/**
 * Every valid argument object for playing `power` as `player`.
 * An empty list means the power can't be played right now.
 */
export function powerChoices(state, player, power) {
  switch (power) {
    case POWERS.LOVERS:
      return loversChoices(state, player);
    case POWERS.DEVIL:
      return devilChoices(state, player);
    case POWERS.HANGED_MAN:
    case POWERS.TOWER:
    case POWERS.HERMIT:
      return [{}];
    default:
      throw new Error(`powerChoices: unknown power ${power}`);
  }
}

function sameChoice(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => a[k] === b[k]);
}

// --- effects -------------------------------------------------------------

function lovers(state, { unit, target }) {
  const pos = getUnit(state, target).pos;
  return {
    ...state,
    units: state.units.map((u) => (u.id === unit ? { ...u, pos } : u)),
  };
}

function devil(state, { unit }) {
  const g = geometry(state.config);
  const center = g.middleIndex(getUnit(state, unit).pos);
  const units = state.units.map((u) => {
    if (u.id === unit) return u;
    const i = g.middleIndex(u.pos);
    if (i === null) return u;
    if (i === center) return { ...u, pos: HOME };
    const next = i + Math.sign(center - i);
    if (next === center) return { ...u, pos: HOME };
    return { ...u, pos: g.posFromMiddleIndex(next) };
  });
  return { ...state, units };
}

function tower(state) {
  const g = geometry(state.config);
  return { ...state, units: sendHome(state.units, (u) => g.isTower(u.pos)) };
}

function hermit(state) {
  const g = geometry(state.config);
  const protect = state.config.rules.towersProtect;
  const victims = new Set();
  const byCell = new Map();
  for (const u of middleUnits(state)) {
    if (protect && g.isTower(u.pos)) continue;
    byCell.set(u.pos, [...(byCell.get(u.pos) ?? []), u]);
  }
  for (const stack of byCell.values()) {
    if (stack.length < 2) continue;
    const commander = stack.find((u) => u.type === 'commander');
    const victim = commander ?? [...stack].sort((a, b) => a.id.localeCompare(b.id)).at(-1);
    victims.add(victim.id);
  }
  return { ...state, units: sendHome(state.units, (u) => victims.has(u.id)) };
}

/**
 * Applies `power` for `player` with `args` (one of powerChoices). Returns the
 * new state; does not touch turn order, held powers or the power deck.
 * The Hanged Man changes no units here: its draw is handled in turn.js.
 */
export function applyPower(state, player, power, args = {}) {
  const valid = powerChoices(state, player, power);
  if (!valid.some((c) => sameChoice(c, args))) {
    throw new Error(`applyPower: invalid choice for ${power}`);
  }
  switch (power) {
    case POWERS.HANGED_MAN:
      return state;
    case POWERS.LOVERS:
      return lovers(state, args);
    case POWERS.DEVIL:
      return devil(state, args);
    case POWERS.TOWER:
      return tower(state);
    case POWERS.HERMIT:
      return hermit(state);
    default:
      throw new Error(`applyPower: unknown power ${power}`);
  }
}
