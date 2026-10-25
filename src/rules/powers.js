// Power effects. Each effect takes a state and returns new units (and stars);
// turn bookkeeping lives in turn.js.
//
// Every power has two sides: upright and upside down (`upsideDown: true`).

import { HOME, geometry } from './board.js';
import { POWERS } from './cards.js';
import { legalMoves, occupancy, othersOn, sendHome, stepTarget, stepUnit } from './moves.js';
import { countDeaths, getUnit, opponents } from './state.js';

function onBoard(state, u) {
  return geometry(state.config).isOnBoard(u.pos);
}

// --- The Lovers: what a unit sees --------------------------------------------------

/**
 * Path positions unit `unitId` can jump to: the nearest ally it sees in each
 * direction along its own path (the first unit met must be its own team's,
 * and that cell must have room), keeping only the nearest (both when tied).
 */
export function loversTargets(state, unitId, occ = occupancy(state)) {
  const g = geometry(state.config);
  const unit = getUnit(state, unitId);
  if (!g.isOnBoard(unit.pos)) return [];
  const me = unit.player;
  const found = [];
  for (const dir of [1, -1]) {
    for (let q = unit.pos + dir; q >= 1 && q <= g.pathLength; q += dir) {
      const c = g.cellIndex(me, q);
      const mine = occ[me][c];
      const theirs = othersOn(occ, me, c);
      if (mine + theirs === 0) continue;
      if (theirs === 0 && mine < state.config.maxPerCell) found.push(q);
      break;
    }
  }
  if (found.length === 0) return [];
  const dist = (q) => Math.abs(q - unit.pos);
  const best = Math.min(...found.map(dist));
  return found.filter((q) => dist(q) === best);
}

// --- choices -------------------------------------------------------------

function towerChoices(state) {
  const g = geometry(state.config);
  const occ = occupancy(state);
  return state.units
    .filter((u) => g.isOnBoard(u.pos) && g.isTowerAt(u.player, u.pos) && stepTarget(state, u.id, occ) !== null)
    .map((u) => ({ unit: u.id }));
}

/** Lovers jumps for the units of `players` (a list). */
function loversChoices(state, players) {
  const occ = occupancy(state);
  const out = [];
  for (const u of state.units) {
    if (!players.includes(u.player)) continue;
    for (const to of loversTargets(state, u.id, occ)) out.push({ unit: u.id, to });
  }
  return out;
}

/** Number cards in `player`'s discard pile with a Hermit move onto an ally, as [{ card }]. */
function hermitPileChoices(state, player) {
  const numbers = [...new Set(state.moveDecks[player].discard.filter((c) => Number.isInteger(c)))].sort((a, b) => a - b);
  const occ = occupancy(state);
  const mode = { backward: false, only: null, hermit: true };
  return numbers.filter((n) => legalMoves(state, player, n, occ, mode).length > 0).map((card) => ({ card }));
}

/**
 * Every valid argument object for playing `power` as `player` (upside down
 * when `upsideDown`). An empty list means the power has no target right now.
 */
export function powerChoices(state, player, power, { upsideDown = false } = {}) {
  const g = geometry(state.config);
  switch (power) {
    case POWERS.TOWER:
      return upsideDown ? [{}] : towerChoices(state);
    case POWERS.LOVERS:
      return loversChoices(state, upsideDown ? opponents(state, player) : [player]);
    case POWERS.DEVIL:
      return upsideDown
        ? state.units.filter((u) => g.isShared(u.pos)).map((u) => ({ unit: u.id }))
        : state.units.filter((u) => u.player === player && onBoard(state, u)).map((u) => ({ unit: u.id }));
    case POWERS.HANGED_MAN:
      return [{}];
    case POWERS.HERMIT:
      return upsideDown ? hermitPileChoices(state, player) : [{}];
    default:
      throw new Error(`powerChoices: unknown power ${power}`);
  }
}

function sameChoice(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => a[k] === b[k]);
}

// --- effects -------------------------------------------------------------

function jump(state, { unit, to }) {
  return { ...state, units: state.units.map((u) => (u.id === unit ? { ...u, pos: to } : u)) };
}

/** Upright Devil: units on the cells just before and after `unit` (and on its own cell) die. */
function devilUpright(state, { unit }) {
  const g = geometry(state.config);
  const devil = getUnit(state, unit);
  const cells = new Set(
    [devil.pos - 1, devil.pos, devil.pos + 1]
      .filter((q) => g.isOnBoard(q))
      .map((q) => g.cellIndex(devil.player, q)),
  );
  const units = sendHome(state.units, (u) => u.id !== unit && onBoard(state, u) && cells.has(g.cellIndex(u.player, u.pos)));
  return countDeaths(state, { ...state, units });
}

/**
 * Upside-down Devil (a unit on a shared cell): every unit on the board moves
 * one cell toward it along its own path; reaching it, or sharing its cell,
 * kills. On a ring, a unit whose path doesn't pass the Devil's cell stays.
 */
function devilUpsideDown(state, { unit }) {
  const g = geometry(state.config);
  const devil = getUnit(state, unit);
  const cell = g.cellIndex(devil.player, devil.pos);
  const units = state.units.map((u) => {
    if (u.id === unit || !g.isOnBoard(u.pos)) return u;
    const c = g.posOf(u.player, cell); // where the Devil's cell is on this unit's path
    if (c < 0) return u;
    if (u.pos === c) return { ...u, pos: HOME };
    const next = u.pos + Math.sign(c - u.pos);
    return next === c ? { ...u, pos: HOME } : { ...u, pos: next };
  });
  return countDeaths(state, { ...state, units });
}

function towerDestroy(state) {
  const g = geometry(state.config);
  const units = sendHome(state.units, (u) => g.isOnBoard(u.pos) && g.isTowerAt(u.player, u.pos));
  return countDeaths(state, { ...state, units });
}

/**
 * Applies `power` for `player` with `args` (one of powerChoices). Returns the
 * new state; does not touch turn order, held powers, stars spent or the
 * power deck. With no valid target, `args` must be {} and nothing happens.
 * The Hanged Man and the Hermit change no units here: turn.js resolves the
 * turn's card for them.
 */
export function applyPower(state, player, power, args = {}, { upsideDown = false } = {}) {
  const valid = powerChoices(state, player, power, { upsideDown });
  const allowed = valid.length > 0 ? valid : [{}]; // nothing to target: no effect
  if (!allowed.some((c) => sameChoice(c, args))) {
    throw new Error(`applyPower: invalid choice for ${power}`);
  }
  switch (power) {
    case POWERS.TOWER:
      if (upsideDown) return towerDestroy(state);
      return args.unit ? stepUnit(state, args.unit) : state;
    case POWERS.LOVERS:
      return args.unit ? jump(state, args) : state;
    case POWERS.DEVIL:
      if (!args.unit) return state;
      return upsideDown ? devilUpsideDown(state, args) : devilUpright(state, args);
    case POWERS.HANGED_MAN:
    case POWERS.HERMIT:
      return state;
    default:
      throw new Error(`applyPower: unknown power ${power}`);
  }
}
