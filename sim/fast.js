// Mutable, allocation-free copy of a game position for bot search.
//
// Real games are always played through src/rules; this module only lets a
// bot try moves and undo them quickly. tests/sim.test.js checks that its
// move generation and move results match the engine on random positions.
// Supports number-card moves (forward, or backward) and, in fastpowers.js,
// the power effects. Not modelled yet: campsites and the Hanged Man's
// back-then-forward turn; settings that use them are rejected.

import { HOME, JOKER, POWER_IDS, geometry, otherPlayer } from '../src/rules/index.js';

/** Throws for settings the simulator can't play faithfully yet. */
export function assertSimSupported(config) {
  if (config.board.campsites.length > 0) {
    throw new Error('sim: campsites are not modelled yet (use board.campsites: [])');
  }
  if (config.powers && config.powerDeck.includes('hanged-man')) {
    throw new Error('sim: the Hanged Man is not modelled yet (leave it out of powerDeck)');
  }
}

export function buildFast(state) {
  const config = state.config;
  assertSimSupported(config);
  const g = geometry(config);
  const n = state.units.length;
  const A = g.ascended;

  const cellIdx = [new Int16Array(A + 1), new Int16Array(A + 1)];
  const tower = new Uint8Array(A + 1);
  for (let p = 0; p <= A; p += 1) {
    cellIdx[0][p] = g.cellIndex(0, p);
    cellIdx[1][p] = g.cellIndex(1, p);
    tower[p] = g.isTower(p) ? 1 : 0;
  }

  const values = [...new Set(config.moveDeck.filter((c) => c !== JOKER))].sort((a, b) => a - b);
  const valueIndex = new Map(values.map((v, i) => [v, i]));
  const J = values.length; // joker slot
  const fullCounts = new Int16Array(J + 1);
  for (const c of config.moveDeck) fullCounts[c === JOKER ? J : valueIndex.get(c)] += 1;

  const fs = {
    config,
    A,
    L: g.pathLength,
    endLane: g.endLane,
    n,
    ids: state.units.map((u) => u.id),
    pos: new Int16Array(n),
    owner: new Uint8Array(n),
    cmd: new Uint8Array(n),
    occ: [new Uint8Array(g.cellCount), new Uint8Array(g.cellCount)],
    soldiersHome: [0, 0],
    remaining: [0, 0],
    cellIdx,
    tower,
    maxPerCell: config.maxPerCell,
    exact: config.rules.exactAscend,
    lockRule: config.rules.commanderLock,
    escort: config.rules.escort,
    protect: config.rules.towersProtect,
    towerTurn: config.rules.towerExtraTurn,
    current: state.current,
    values,
    J,
    fullCounts,
    fullTotal: config.moveDeck.length,
    counts: [new Int16Array(J + 1), new Int16Array(J + 1)],
    totals: [0, 0],
    middleFirst: g.middleFirst,
    middleLast: g.middleLast,
    // Powers: held[p] is an index into POWER_IDS or -1; the power deck is
    // known by composition only.
    powersOn: config.powers,
    beforeDraw: config.powerTiming === 'beforeDraw',
    held: state.held.map((h) => (h ? POWER_IDS.indexOf(h) : -1)),
    pdCounts: new Int16Array(POWER_IDS.length),
    pdTotal: state.powerDeck.length,
  };
  for (const id of state.powerDeck) fs.pdCounts[POWER_IDS.indexOf(id)] += 1;

  state.units.forEach((u, i) => {
    fs.pos[i] = u.pos;
    fs.owner[i] = u.player;
    fs.cmd[i] = u.type === 'commander' ? 1 : 0;
    const c = cellIdx[u.player][u.pos];
    if (c >= 0) fs.occ[u.player][c] += 1;
    if (u.pos === HOME && u.type === 'soldier') fs.soldiersHome[u.player] += 1;
    if (u.pos !== A) fs.remaining[u.player] += 1;
  });
  for (const p of [0, 1]) {
    for (const c of state.moveDecks[p].draw) {
      fs.counts[p][c === JOKER ? J : valueIndex.get(c)] += 1;
    }
    fs.totals[p] = state.moveDecks[p].draw.length;
  }
  return fs;
}

export function isLocked(fs, p) {
  return fs.lockRule && fs.soldiersHome[p] > 0;
}

/** Destination for unit i moving d (backward when `back`), or -1 if it can't. */
function dest(fs, i, d, back = false) {
  const from = fs.pos[i];
  if (from === fs.A) return -1;
  if (back) return from === HOME ? -1 : Math.max(HOME, from - d);
  const t = from + d;
  if (t <= fs.A) return t;
  return fs.exact ? -1 : fs.A;
}

function canLand(fs, p, t, count) {
  if (t === fs.A || t === HOME) return true;
  const c = fs.cellIdx[p][t];
  if (fs.occ[1 - p][c] > 0 && fs.protect && fs.tower[t]) return false;
  return fs.occ[p][c] + count <= fs.maxPerCell;
}

/**
 * Distinct legal moves for player p with a card worth d, as [unit, escort]
 * pairs (escort -1 = none). Units of the same type on the same cell are
 * interchangeable, so only one of them is listed.
 */
export function genMoves(fs, p, d, back = false) {
  const out = [];
  const seen = new Set();
  const locked = isLocked(fs, p);
  for (let i = 0; i < fs.n; i += 1) {
    if (fs.owner[i] !== p) continue;
    if (fs.cmd[i] && locked) continue;
    const t = dest(fs, i, d, back);
    if (t < 0) continue;
    const from = fs.pos[i];
    const key = from * 4 + fs.cmd[i] * 2;
    if (!seen.has(key) && canLand(fs, p, t, 1)) {
      seen.add(key);
      out.push([i, -1]);
    }
    if (fs.escort && fs.cmd[i] && from !== HOME && from !== fs.A && !seen.has(key + 1) && canLand(fs, p, t, 2)) {
      for (let j = 0; j < fs.n; j += 1) {
        if (fs.owner[j] === p && !fs.cmd[j] && fs.pos[j] === from) {
          seen.add(key + 1);
          out.push([i, j]);
          break;
        }
      }
    }
  }
  return out;
}

export function lift(fs, i) {
  const p = fs.owner[i];
  const from = fs.pos[i];
  const c = fs.cellIdx[p][from];
  if (c >= 0) fs.occ[p][c] -= 1;
  if (from === HOME && !fs.cmd[i]) fs.soldiersHome[p] -= 1;
  if (from === fs.A) fs.remaining[p] += 1;
}

export function place(fs, i, t) {
  const p = fs.owner[i];
  fs.pos[i] = t;
  const c = fs.cellIdx[p][t];
  if (c >= 0) fs.occ[p][c] += 1;
  if (t === HOME && !fs.cmd[i]) fs.soldiersHome[p] += 1;
  if (t === fs.A) fs.remaining[p] -= 1;
}

/**
 * Applies move [u, e] for the side to move with a card worth d. Returns an
 * undo record; record.won is true when the mover has finished.
 */
export function apply(fs, u, e, d, back = false) {
  const p = fs.owner[u];
  const o = 1 - p;
  const from = fs.pos[u];
  const t = dest(fs, u, d, back);
  const captured = [];
  lift(fs, u);
  place(fs, u, t);
  if (e >= 0) {
    lift(fs, e);
    place(fs, e, t);
  }
  const c = fs.cellIdx[p][t];
  if (c >= 0 && fs.occ[o][c] > 0) {
    for (let i = 0; i < fs.n; i += 1) {
      if (fs.owner[i] === o && fs.cellIdx[o][fs.pos[i]] === c) {
        captured.push(i, fs.pos[i]);
        lift(fs, i);
        place(fs, i, HOME);
      }
    }
  }
  const prevCurrent = fs.current;
  // A backward (Hanged Man) move is followed by another turn, as is landing
  // on a tower with the extra-turn rule.
  fs.current = back || (fs.towerTurn && fs.tower[t]) ? p : o;
  return { u, e, from, captured, prevCurrent, won: fs.remaining[p] === 0 };
}

export function undo(fs, rec) {
  fs.current = rec.prevCurrent;
  for (let k = rec.captured.length - 2; k >= 0; k -= 2) {
    const i = rec.captured[k];
    lift(fs, i);
    place(fs, i, rec.captured[k + 1]);
  }
  if (rec.e >= 0) {
    lift(fs, rec.e);
    place(fs, rec.e, rec.from);
  }
  lift(fs, rec.u);
  place(fs, rec.u, rec.from);
}

/** Probability of each card slot for player p's next draw (index J = joker). */
export function drawCounts(fs, p) {
  return fs.totals[p] > 0
    ? { counts: fs.counts[p], total: fs.totals[p], full: false }
    : { counts: fs.fullCounts, total: fs.fullTotal, full: true };
}

/** Removes one card of slot k from p's pile (reshuffling first if empty). */
export function takeCard(fs, p, k) {
  const refill = fs.totals[p] === 0;
  if (refill) {
    fs.counts[p].set(fs.fullCounts);
    fs.totals[p] = fs.fullTotal;
  }
  fs.counts[p][k] -= 1;
  fs.totals[p] -= 1;
  return refill;
}

export function returnCard(fs, p, k, refilled) {
  fs.counts[p][k] += 1;
  fs.totals[p] += 1;
  if (refilled) {
    fs.counts[p].fill(0);
    fs.totals[p] = 0;
  }
}

export { otherPlayer };
