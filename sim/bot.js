// Bots for simulations (powers off).
//
// searchBot: expectimax over the real card odds. Each player's remaining
// draw pile is known by composition (discards are public), never by order.
// depth 1: pick the move with the best evaluation right after it.
// depth 2: also consider every card the next player can draw and their best
//          reply to it (default).
// depth 3: one more draw-and-reply layer for the original player.
//
// The evaluation estimates who is ahead: progress of every unit, a bonus per
// ascended unit, the expected loss from captures available next turn, and a
// few positional terms; weights are in DEFAULT_WEIGHTS.

import { HOME, JOKER, currentMoves, getUnit } from '../src/rules/index.js';
import {
  apply, buildFast, drawCounts, genMoves, isLocked, returnCard, takeCard, undo,
} from './fast.js';

export const DEFAULT_WEIGHTS = Object.freeze({
  ascended: 2, // per ascended unit, on top of its progress
  endLane: 0, // per unit in the private end lane (out of reach)
  home: 0, // per unit still at home
  tower: 3, // per shared tower cell held
  endWait: 1.5, // per unit near the end, times the share of cards that overshoot
  locked: 0, // per commander stuck at home behind soldiers
  escortReady: 1, // per commander on the board sharing a cell with a soldier
  imminent: 1, // expected loss from the side to move's next capture
  remote: 0.4, // same, for the side to move's own exposed units
});

export const WIN = 1e6;

// --- evaluation ------------------------------------------------------------

/** Expected best capture value for `att` against `vic` on att's next draw. */
function expectedLoss(fs, att, vic) {
  const { counts, total } = drawCounts(fs, att);
  if (total === 0) return 0;
  const locked = isLocked(fs, att);
  let loss = 0;
  for (let k = 0; k < fs.J; k += 1) {
    const cnt = counts[k];
    if (cnt === 0) continue;
    const d = fs.values[k];
    let best = 0;
    for (let i = 0; i < fs.n; i += 1) {
      if (fs.owner[i] !== att) continue;
      if (fs.cmd[i] && locked) continue;
      const from = fs.pos[i];
      if (from === fs.A) continue;
      const t = from + d;
      if (t >= fs.A) continue;
      const c = fs.cellIdx[att][t];
      if (c < 0 || fs.occ[vic][c] === 0) continue;
      if (fs.protect && fs.tower[t]) continue;
      if (fs.occ[att][c] + 1 > fs.maxPerCell) continue;
      let gain = 0;
      for (let j = 0; j < fs.n; j += 1) {
        if (fs.owner[j] === vic && fs.cellIdx[vic][fs.pos[j]] === c) gain += fs.pos[j];
      }
      if (gain > best) best = gain;
    }
    loss += (cnt / total) * best;
  }
  return loss;
}

function sideScore(fs, p, w, endOdds) {
  let s = 0;
  const locked = isLocked(fs, p);
  for (let i = 0; i < fs.n; i += 1) {
    if (fs.owner[i] !== p) continue;
    const q = fs.pos[i];
    s += q;
    if (q === fs.A) {
      s += w.ascended;
    } else if (q === HOME) {
      s -= w.home;
      if (fs.cmd[i] && locked) s -= w.locked;
    } else {
      if (q > fs.L - fs.endLane) s += w.endLane;
      if (fs.protect && fs.tower[q] && fs.cellIdx[0][q] === fs.cellIdx[1][q]) s += w.tower;
      s -= w.endWait * endOdds[q];
      if (fs.cmd[i] && fs.escort && fs.occ[p][fs.cellIdx[p][q]] > 1) s += w.escortReady;
    }
  }
  return s;
}

/** Share of the deck that overshoots ascension from each cell (exact rule). */
export function endWaitTable(fs) {
  const t = new Float64Array(fs.A + 1);
  if (!fs.exact) return t;
  for (let q = 1; q < fs.A; q += 1) {
    let over = 0;
    for (let k = 0; k < fs.J; k += 1) if (fs.values[k] > fs.A - q) over += fs.fullCounts[k];
    t[q] = over / fs.fullTotal;
  }
  return t;
}

export function evaluate(fs, me, w, endOdds) {
  if (fs.remaining[me] === 0) return WIN;
  if (fs.remaining[1 - me] === 0) return -WIN;
  const stm = fs.current;
  const non = 1 - stm;
  const sStm = sideScore(fs, stm, w, endOdds) - w.remote * expectedLoss(fs, non, stm);
  const sNon = sideScore(fs, non, w, endOdds) - w.imminent * expectedLoss(fs, stm, non);
  return me === stm ? sStm - sNon : sNon - sStm;
}

// --- search --------------------------------------------------------------------

function chance(fs, me, depth, ctx) {
  if (depth === 0) return evaluate(fs, me, ctx.w, ctx.endOdds);
  const q = fs.current;
  const { counts, total } = drawCounts(fs, q);
  let value = 0;
  for (let k = 0; k <= fs.J; k += 1) {
    const cnt = counts[k];
    if (cnt === 0) continue;
    const prob = cnt / total;
    const refilled = takeCard(fs, q, k);
    let best;
    const moves = k === fs.J ? [] : genMoves(fs, q, fs.values[k]);
    if (moves.length === 0) {
      fs.current = 1 - q;
      best = chance(fs, me, depth - 1, ctx);
      fs.current = q;
    } else {
      best = q === me ? -Infinity : Infinity;
      for (const [u, e] of moves) {
        const rec = apply(fs, u, e, fs.values[k]);
        const v = rec.won ? (q === me ? WIN : -WIN) : chance(fs, me, depth - 1, ctx);
        undo(fs, rec);
        if (q === me ? v > best : v < best) best = v;
      }
    }
    returnCard(fs, q, k, refilled);
    value += prob * best;
  }
  return value;
}

function toEngineMove(fs, [u, e]) {
  return e >= 0 ? { unit: fs.ids[u], escort: fs.ids[e] } : { unit: fs.ids[u] };
}

/** Engine moves that are interchangeable with fast move [u, e]. */
function sameAs(state, fs, move, [u, e]) {
  const a = getUnit(state, move.unit);
  return a.pos === fs.pos[u] && (a.type === 'commander') === Boolean(fs.cmd[u])
    && Boolean(move.escort) === e >= 0;
}

export function searchBot({ depth = 2, weights = DEFAULT_WEIGHTS } = {}) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  return {
    name: `search-d${depth}`,
    choose(state) {
      if (state.hanged) throw new Error('searchBot: backward moves are not supported');
      const fs = buildFast(state);
      const ctx = { w, endOdds: endWaitTable(fs) };
      const d = state.drawn;
      const me = state.current;
      const moves = genMoves(fs, me, d);
      if (moves.length === 0) return null;
      if (moves.length === 1) return toEngineMove(fs, moves[0]);
      let best = -Infinity;
      let bestMove = moves[0];
      for (const m of moves) {
        const rec = apply(fs, m[0], m[1], d);
        const v = rec.won ? WIN : chance(fs, me, depth - 1, ctx);
        undo(fs, rec);
        if (v > best) {
          best = v;
          bestMove = m;
        }
      }
      const move = toEngineMove(fs, bestMove);
      // Sanity check against the engine's own list.
      if (!currentMoves(state).some((m) => sameAs(state, fs, m, bestMove))) {
        throw new Error('searchBot: chose a move the engine does not allow');
      }
      return move;
    },
  };
}

// --- simple bots for comparison ------------------------------------------------------

/** Uniformly random among distinct legal moves. */
export function randomBot(random) {
  return {
    name: 'random',
    choose(state) {
      const fs = buildFast(state);
      const moves = genMoves(fs, state.current, state.drawn);
      if (moves.length === 0) return null;
      return toEngineMove(fs, moves[Math.floor(random() * moves.length)]);
    },
  };
}

/** Prefers captures, then the most progress; ignores risk. */
export function greedyBot() {
  return {
    name: 'greedy',
    choose(state) {
      const fs = buildFast(state);
      const me = state.current;
      const moves = genMoves(fs, me, state.drawn);
      if (moves.length === 0) return null;
      let best = -Infinity;
      let bestMove = moves[0];
      for (const m of moves) {
        const rec = apply(fs, m[0], m[1], state.drawn);
        let v = 0;
        for (let i = 0; i < fs.n; i += 1) v += fs.owner[i] === me ? fs.pos[i] : -fs.pos[i];
        if (rec.won) v = WIN;
        undo(fs, rec);
        if (v > best) {
          best = v;
          bestMove = m;
        }
      }
      return toEngineMove(fs, bestMove);
    },
  };
}

export { JOKER };
