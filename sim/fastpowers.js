// Power effects on the fast position copy (see fast.js), with undo.
// tests/sim.test.js checks them against src/rules/powers.js.

import { CARD_IDS, HOME, POWER_IDS } from '../src/rules/index.js';
import { lift, place } from './fast.js';

export const HM = POWER_IDS.indexOf('hanged-man');
export const LOVERS = POWER_IDS.indexOf('lovers');
export const DEVIL = POWER_IDS.indexOf('devil');
export const TOWER = POWER_IDS.indexOf('tower');
export const HERMIT = POWER_IDS.indexOf('hermit');
export const DUD = CARD_IDS.indexOf('dud');

/** Can a held card k be used (a power, not a dud or nothing)? */
export const usable = (k) => k >= 0 && k !== DUD;
export const NO_TARGET = Object.freeze([]);

const shared = (fs, q) => q >= fs.middleFirst && q <= fs.middleLast;

/** Units of both teams on shared cell q. */
function unitsAt(fs, q) {
  const c = fs.cellIdx[0][q];
  return fs.occ[0][c] + fs.occ[1][c];
}

/**
 * Distinct targets for power k used by player p: arrays of unit indexes
 * ([unit, partner] for the Lovers, [unit] for the Devil), or [NO_TARGET]
 * when the power takes no target or has none (it is then used to no effect).
 */
export function powerTargets(fs, p, k) {
  const out = [];
  const seen = new Set();
  if (k === LOVERS && fs.maxPerCell >= 2 && !fs.loversLine) {
    for (let u = 0; u < fs.n; u += 1) {
      if (fs.owner[u] !== p || !shared(fs, fs.pos[u])) continue;
      for (let t = 0; t < fs.n; t += 1) {
        if (fs.owner[t] !== p || !shared(fs, fs.pos[t]) || fs.pos[t] === fs.pos[u]) continue;
        if (unitsAt(fs, fs.pos[t]) !== 1) continue;
        const key = (fs.pos[u] * 64 + fs.pos[t]) * 2 + fs.cmd[u];
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([u, t]);
      }
    }
  } else if (k === DEVIL) {
    for (let u = 0; u < fs.n; u += 1) {
      if (fs.owner[u] !== p || !shared(fs, fs.pos[u])) continue;
      const key = fs.pos[u] * 2 + fs.cmd[u];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([u]);
    }
  }
  return out.length > 0 ? out : [NO_TARGET];
}

function move(fs, rec, i, t) {
  rec.moved.push(i, fs.pos[i]);
  lift(fs, i);
  place(fs, i, t);
}

/**
 * Applies held power k for player p with `target` (from powerTargets). The
 * power leaves p's hand for the bottom of the power deck. For the free powers
 * (Hanged Man, line Lovers, Hermit) nothing moves here: the caller resolves
 * the turn's card.
 * Returns an undo record.
 */
export function applyPower(fs, p, k, target) {
  const rec = { p, k, moved: [], prevHeld: fs.held[p] };
  if (k === LOVERS && target.length === 2 && !fs.loversLine) {
    move(fs, rec, target[0], fs.pos[target[1]]);
  } else if (k === DEVIL && target.length === 1) {
    const c = fs.pos[target[0]];
    for (let i = 0; i < fs.n; i += 1) {
      if (i === target[0] || !shared(fs, fs.pos[i])) continue;
      const q = fs.pos[i];
      const next = q === c ? c : q + Math.sign(c - q);
      move(fs, rec, i, next === c ? HOME : next);
    }
  } else if (k === TOWER) {
    for (let i = 0; i < fs.n; i += 1) {
      if (fs.pos[i] !== HOME && fs.pos[i] !== fs.A && fs.tower[fs.pos[i]]) move(fs, rec, i, HOME);
    }
  }
  // The Hermit, like the Hanged Man and the line Lovers, moves nothing here:
  // the caller resolves the card as a move onto an ally, then the push.
  fs.held[p] = -1;
  fs.pdCounts[k] += 1;
  fs.pdTotal += 1;
  return rec;
}

export function undoPower(fs, rec) {
  for (let j = rec.moved.length - 2; j >= 0; j -= 2) {
    const i = rec.moved[j];
    lift(fs, i);
    place(fs, i, rec.moved[j + 1]);
  }
  fs.held[rec.p] = rec.prevHeld;
  fs.pdCounts[rec.k] -= 1;
  fs.pdTotal -= 1;
}

/**
 * Chances of each power ending up kept when player p drafts: the better of
 * the top two cards by `value[k]`, drawn from the deck's composition.
 * Returns [[k, probability], ...]; empty if the deck is empty.
 */
export function draftOdds(fs, value) {
  const N = fs.pdTotal;
  if (N <= 0) return [];
  const c = fs.pdCounts;
  if (N === 1) return [[c.findIndex((x) => x > 0), 1]];
  const odds = new Float64Array(c.length);
  const pairs = N * (N - 1);
  for (let a = 0; a < c.length; a += 1) {
    if (!c[a]) continue;
    for (let b = 0; b < c.length; b += 1) {
      if (!c[b]) continue;
      const ways = a === b ? c[a] * (c[a] - 1) : c[a] * c[b];
      if (!ways) continue;
      odds[value[a] >= value[b] ? a : b] += ways / pairs;
    }
  }
  const out = [];
  odds.forEach((pr, k) => { if (pr > 0) out.push([k, pr]); });
  return out;
}

/** Keeps power k from the deck (p's old power goes to the bottom). */
export function applyDraft(fs, p, k) {
  const rec = { p, k, prevHeld: fs.held[p] };
  if (rec.prevHeld >= 0) {
    fs.pdCounts[rec.prevHeld] += 1;
    fs.pdTotal += 1;
  }
  fs.pdCounts[k] -= 1;
  fs.pdTotal -= 1;
  fs.held[p] = k;
  return rec;
}

export function undoDraft(fs, rec) {
  fs.held[rec.p] = rec.prevHeld;
  fs.pdCounts[rec.k] += 1;
  fs.pdTotal += 1;
  if (rec.prevHeld >= 0) {
    fs.pdCounts[rec.prevHeld] -= 1;
    fs.pdTotal -= 1;
  }
}
