// Power effects on the fast position copy (see fast.js), with undo, both
// ways up. tests/sim.test.js checks them against src/rules/powers.js.
//
// A target is an object: {} (none), { u } (a unit index), { u, to } (the
// Lovers: a unit and the path position it jumps to) or { card } (the
// upside-down Hermit: a number from the discard pile).

import { CARD_IDS, HOME, POWER_IDS } from '../src/rules/index.js';
import { canStep, discardCounts, hermitMoves, lift, loversTargets, place } from './fast.js';

export const HM = POWER_IDS.indexOf('hanged-man');
export const LOVERS = POWER_IDS.indexOf('lovers');
export const DEVIL = POWER_IDS.indexOf('devil');
export const TOWER = POWER_IDS.indexOf('tower');
export const HERMIT = POWER_IDS.indexOf('hermit');
export const DUD = CARD_IDS.indexOf('dud');

/** Can a held card k be used (a power, not a dud or nothing)? */
export const usable = (k) => k >= 0 && k !== DUD;
export const NO_TARGET = Object.freeze({});

const onBoard = (fs, q) => q !== HOME && q !== fs.A;
const shared = (fs, q) => q >= fs.middleFirst && q <= fs.middleLast;

/** Can p use held card k upside down (cost known and affordable)? */
export const canFlip = (fs, p, k) => k >= 0 && fs.udCost[k] >= 0 && fs.stars[p] >= fs.udCost[k];

/**
 * Distinct targets for power k used by player p (upside down when `upside`),
 * or [NO_TARGET] when the power takes no target or has none (it is then used
 * to no effect).
 */
export function powerTargets(fs, p, k, upside = false) {
  const out = [];
  const seen = new Set();
  const once = (key, t) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };
  if (k === TOWER && !upside) {
    for (let i = 0; i < fs.n; i += 1) {
      const q = fs.pos[i];
      if (onBoard(fs, q) && fs.tower[q] && canStep(fs, i)) once(`${fs.owner[i]}:${q}:${fs.cmd[i]}`, { u: i });
    }
  } else if (k === LOVERS) {
    const side = upside ? 1 - p : p;
    for (let i = 0; i < fs.n; i += 1) {
      if (fs.owner[i] !== side) continue;
      for (const to of loversTargets(fs, i)) once(`${fs.pos[i]}:${fs.cmd[i]}:${to}`, { u: i, to });
    }
  } else if (k === DEVIL) {
    for (let i = 0; i < fs.n; i += 1) {
      const q = fs.pos[i];
      if (upside ? !shared(fs, q) : fs.owner[i] !== p || !onBoard(fs, q)) continue;
      once(`${fs.owner[i]}:${q}:${fs.cmd[i]}`, { u: i });
    }
  } else if (k === HERMIT && upside) {
    const { counts } = discardCounts(fs, p);
    for (let s = 0; s < fs.J; s += 1) {
      if (counts[s] > 0 && hermitMoves(fs, p, fs.values[s]).length > 0) out.push({ card: fs.values[s] });
    }
  }
  return out.length > 0 ? out : [NO_TARGET];
}

function move(fs, rec, i, t) {
  rec.moved.push(i, fs.pos[i]);
  if (t === HOME && fs.pos[i] !== HOME) fs.stars[fs.owner[i]] += 1; // a death
  lift(fs, i);
  place(fs, i, t);
}

/** The upright Tower's step: unit i moves one cell forward; it captures, and may decide the game. */
function step(fs, rec, i) {
  const p = fs.owner[i];
  const t = fs.pos[i] + 1;
  move(fs, rec, i, t);
  const c = t === fs.A ? -1 : fs.cellIdx[p][t];
  if (c >= 0 && fs.occ[1 - p][c] > 0) {
    for (let j = 0; j < fs.n; j += 1) {
      if (fs.owner[j] === 1 - p && fs.cellIdx[1 - p][fs.pos[j]] === c) move(fs, rec, j, HOME);
    }
  }
  if (fs.remaining[p] === 0) rec.won = p;
}

/**
 * Applies held power k for player p with `target` (from powerTargets), upside
 * down when `upside` (its stars are paid). The power leaves p's hand for the
 * bottom of the power deck. For the free powers (Hanged Man, Hermit, the
 * upright Tower after its step) the caller resolves the turn's card.
 * Returns an undo record; rec.won is the player whose last unit ascended, or -1.
 */
export function applyPower(fs, p, k, target, upside = false) {
  const rec = { p, k, moved: [], prevHeld: fs.held[p], paid: upside ? fs.udCost[k] : 0, won: -1 };
  fs.stars[p] -= rec.paid;
  if (k === TOWER) {
    if (upside) {
      for (let i = 0; i < fs.n; i += 1) if (onBoard(fs, fs.pos[i]) && fs.tower[fs.pos[i]]) move(fs, rec, i, HOME);
    } else if (target.u !== undefined) {
      step(fs, rec, target.u);
    }
  } else if (k === LOVERS && target.u !== undefined) {
    move(fs, rec, target.u, target.to);
  } else if (k === DEVIL && target.u !== undefined) {
    const d = target.u;
    const c = fs.pos[d];
    if (upside) {
      for (let i = 0; i < fs.n; i += 1) {
        const q = fs.pos[i];
        if (i === d || !onBoard(fs, q)) continue;
        const next = q === c ? c : q + Math.sign(c - q);
        move(fs, rec, i, next === c ? HOME : next);
      }
    } else {
      const owner = fs.owner[d];
      const cells = new Set([c - 1, c, c + 1].filter((q) => onBoard(fs, q) && q <= fs.L).map((q) => fs.cellIdx[owner][q]));
      for (let i = 0; i < fs.n; i += 1) {
        const q = fs.pos[i];
        if (i === d || !onBoard(fs, q)) continue;
        if (cells.has(fs.cellIdx[fs.owner[i]][q])) move(fs, rec, i, HOME);
      }
    }
  }
  fs.held[p] = -1;
  fs.pdCounts[k] += 1;
  fs.pdTotal += 1;
  return rec;
}

export function undoPower(fs, rec) {
  for (let j = rec.moved.length - 2; j >= 0; j -= 2) {
    const i = rec.moved[j];
    if (fs.pos[i] === HOME && rec.moved[j + 1] !== HOME) fs.stars[fs.owner[i]] -= 1;
    lift(fs, i);
    place(fs, i, rec.moved[j + 1]);
  }
  fs.stars[rec.p] += rec.paid;
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
