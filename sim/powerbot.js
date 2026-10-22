// Bots that play with powers on (and off).
//
// Levels:
//   strong   looks two turns ahead (its own action, then every card the
//            opponent can draw and their best reply, powers included),
//            counts cards, and values held powers.
//   average  looks one turn ahead, assumes a full deck every draw (no card
//            counting), and picks among its options with some noise
//            (softmax over the evaluation, temperature in pips).
//
// The bot answers bot.act(state) at every decision the engine offers:
//   turn start (before-draw timing, holding a power): draw or use the power
//   number card: a move, pass (no move), or use the power (after-draw timing)
//   joker: draft (which card to keep), use the power, or pass
//   Hanged Man card: which backward move

import {
  JOKER, POWER_IDS, canUsePower, currentMoves, draftOptions, getUnit,
  isNumberCard, powerUseChoices,
} from '../src/rules/index.js';
import { DEFAULT_WEIGHTS, WIN, endWaitTable, evaluate } from './bot.js';
import {
  apply, buildFast, drawCounts, genMoves, returnCard, takeCard, undo,
} from './fast.js';
import {
  HM, NO_TARGET, applyDraft, applyPower, draftOdds, powerTargets, undoDraft, undoPower,
} from './fastpowers.js';

/** Value of holding each power, in progress points (pips). */
export const DEFAULT_POWER_VALUES = Object.freeze({
  'hanged-man': 3, lovers: 2, devil: 4, tower: 3, hermit: 2,
});

export const LEVELS = Object.freeze({
  strong: { depth: 2, countCards: true, temperature: 0 },
  average: { depth: 1, countCards: false, temperature: 1.5 },
});

// --- search ------------------------------------------------------------------

function leaf(fs, ctx) {
  const v = evaluate(fs, ctx.me, ctx.w, ctx.endOdds);
  if (Math.abs(v) >= WIN) return v;
  const held = (p) => (fs.held[p] >= 0 ? ctx.pv[fs.held[p]] : 0);
  return v + held(ctx.me) - held(1 - ctx.me);
}

const better = (ctx, q) => (q === ctx.me ? (a, b) => a > b : (a, b) => a < b);
const worst = (ctx, q) => (q === ctx.me ? -Infinity : Infinity);

/**
 * Continues after q's action. An extra turn for q (Hanged Man, tower rule)
 * doesn't use up depth, once per line; otherwise the next turn starts one
 * level deeper.
 */
function next(fs, q, depth, ctx) {
  if (fs.current === q && ctx.free > 0) {
    ctx.free -= 1;
    const v = turnStart(fs, depth, ctx);
    ctx.free += 1;
    return v;
  }
  return turnStart(fs, depth - 1, ctx);
}

function endTurn(fs, q, depth, ctx, extra) {
  const prev = fs.current;
  fs.current = extra ? q : 1 - q;
  const v = next(fs, q, depth, ctx);
  fs.current = prev;
  return v;
}

/** Value at the start of fs.current's turn, before any card is drawn. */
function turnStart(fs, depth, ctx) {
  if (depth <= 0) return leaf(fs, ctx);
  const q = fs.current;
  const isBetter = better(ctx, q);
  let best = drawAndResolve(fs, depth, ctx, false);
  if (fs.powersOn && fs.beforeDraw && fs.held[q] >= 0) {
    const k = fs.held[q];
    for (const t of powerTargets(fs, q, k)) {
      const v = afterPower(fs, q, k, t, -1, depth, ctx);
      if (isBetter(v, best)) best = v;
    }
  }
  return best;
}

/** Expected value over fs.current's next card, each resolved at its best. */
function drawAndResolve(fs, depth, ctx, back) {
  const q = fs.current;
  const { counts, total } = drawCounts(fs, q);
  let value = 0;
  for (let k = 0; k <= fs.J; k += 1) {
    const cnt = counts[k];
    if (!cnt) continue;
    const refilled = takeCard(fs, q, k);
    const v = back ? resolveBackward(fs, q, k, depth, ctx) : resolveCard(fs, q, k, depth, ctx);
    returnCard(fs, q, k, refilled);
    value += (cnt / total) * v;
  }
  return value;
}

function winFor(q, ctx) {
  return q === ctx.me ? WIN : -WIN;
}

function movesValue(fs, q, d, back, depth, ctx, consider) {
  const moves = genMoves(fs, q, d, back);
  for (const [u, e] of moves) {
    const rec = apply(fs, u, e, d, back);
    const v = rec.won ? winFor(q, ctx) : next(fs, q, depth, ctx);
    undo(fs, rec);
    consider(v);
  }
  return moves.length;
}

/** Drafting: the drafter keeps the better of the top two (unknown) cards. */
function draftValue(fs, q, depth, ctx, extra) {
  const odds = draftOdds(fs, ctx.pv);
  if (odds.length === 0) return endTurn(fs, q, depth, ctx, extra);
  let value = 0;
  for (const [k, pr] of odds) {
    const rec = applyDraft(fs, q, k);
    value += pr * endTurn(fs, q, depth, ctx, extra);
    undoDraft(fs, rec);
  }
  return value;
}

/** q's best way to resolve card slot k (forward), powers included. */
function resolveCard(fs, q, k, depth, ctx) {
  const isBetter = better(ctx, q);
  let best = worst(ctx, q);
  const consider = (v) => { if (isBetter(v, best)) best = v; };
  if (k < fs.J) {
    if (movesValue(fs, q, fs.values[k], false, depth, ctx, consider) === 0) {
      consider(endTurn(fs, q, depth, ctx, false));
    }
  } else if (fs.powersOn) {
    consider(draftValue(fs, q, depth, ctx, false));
  } else {
    consider(endTurn(fs, q, depth, ctx, false));
  }
  if (fs.powersOn && !fs.beforeDraw && fs.held[q] >= 0) {
    const p = fs.held[q];
    for (const t of powerTargets(fs, q, p)) consider(afterPower(fs, q, p, t, k, depth, ctx));
  }
  return best;
}

/** The Hanged Man's card: a backward move (or a draft), then another turn. */
function resolveBackward(fs, q, k, depth, ctx) {
  if (k === fs.J) return draftValue(fs, q, depth, ctx, true);
  const isBetter = better(ctx, q);
  let best = worst(ctx, q);
  const consider = (v) => { if (isBetter(v, best)) best = v; };
  if (movesValue(fs, q, fs.values[k], true, depth, ctx, consider) === 0) {
    consider(endTurn(fs, q, depth, ctx, true));
  }
  return best;
}

/** q uses power p on target t; k is the drawn card slot, or -1 before drawing. */
function afterPower(fs, q, p, t, k, depth, ctx) {
  const rec = applyPower(fs, q, p, t);
  let v;
  if (p === HM) {
    v = k >= 0 ? resolveBackward(fs, q, k, depth, ctx) : drawAndResolve(fs, depth, ctx, true);
  } else {
    v = endTurn(fs, q, depth, ctx, false);
  }
  undoPower(fs, rec);
  return v;
}

// --- root decisions -------------------------------------------------------------

function engineTarget(fs, t) {
  if (t.length === 2) return { unit: fs.ids[t[0]], target: fs.ids[t[1]] };
  if (t.length === 1) return { unit: fs.ids[t[0]] };
  return {};
}

function engineMove(fs, [u, e]) {
  return e >= 0 ? { unit: fs.ids[u], escort: fs.ids[e] } : { unit: fs.ids[u] };
}

function pick(options, temperature, random) {
  let best = options[0];
  for (const o of options) if (o.value > best.value) best = o;
  if (!temperature || options.length === 1 || Math.abs(best.value) >= WIN) return best;
  const weights = options.map((o) => Math.exp(Math.max(-50, (o.value - best.value) / temperature)));
  let r = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return options[i];
  }
  return best;
}

/**
 * @param {{ level?: 'strong'|'average', depth?, countCards?, temperature?,
 *           weights?, powerValues?, random?: () => number }} options
 */
export function powerBot(options = {}) {
  const level = { ...LEVELS[options.level ?? 'strong'], ...options };
  const w = { ...DEFAULT_WEIGHTS, ...(options.weights ?? {}) };
  const pvMap = { ...DEFAULT_POWER_VALUES, ...(options.powerValues ?? {}) };
  const pv = POWER_IDS.map((id) => pvMap[id]);
  const random = options.random ?? Math.random;

  function setup(state) {
    const fs = buildFast(state);
    if (!level.countCards) {
      for (const p of [0, 1]) {
        fs.counts[p].set(fs.fullCounts);
        fs.totals[p] = fs.fullTotal;
      }
    }
    return { fs, ctx: { me: state.current, w, pv, endOdds: endWaitTable(fs), free: 1 } };
  }

  function decide(state) {
    const { fs, ctx } = setup(state);
    const me = state.current;
    const depth = level.depth;
    const opts = [];
    const usePowerOptions = (k) => {
      const p = fs.held[me];
      for (const t of powerTargets(fs, me, p)) {
        opts.push({ action: { kind: 'power', args: engineTarget(fs, t) }, value: afterPower(fs, me, p, t, k, depth, ctx) });
      }
    };

    if (state.drawn === null) {
      // Before-draw timing: draw, or use the power instead.
      opts.push({ action: { kind: 'draw' }, value: drawAndResolve(fs, depth, ctx, false) });
      if (canUsePower(state)) usePowerOptions(-1);
      return opts;
    }

    const back = state.hanged?.stage === 'back' && !state.campsite;
    if (isNumberCard(state.drawn)) {
      const d = state.drawn;
      for (const m of genMoves(fs, me, d, back)) {
        const rec = apply(fs, m[0], m[1], d, back);
        const v = rec.won ? WIN : next(fs, me, depth, ctx);
        undo(fs, rec);
        opts.push({ action: { kind: 'move', move: engineMove(fs, m) }, value: v });
      }
      if (opts.length === 0) {
        opts.push({ action: { kind: 'pass' }, value: endTurn(fs, me, depth, ctx, back) });
      }
    } else {
      // Joker: draft one of the visible cards, or pass when drafting can't happen.
      const choices = draftOptions(state);
      if (choices.length === 0) {
        opts.push({ action: { kind: 'passJoker' }, value: endTurn(fs, me, depth, ctx, back) });
      }
      choices.forEach((id, index) => {
        const rec = applyDraft(fs, me, POWER_IDS.indexOf(id));
        opts.push({ action: { kind: 'draft', index }, value: endTurn(fs, me, depth, ctx, back) });
        undoDraft(fs, rec);
      });
    }
    if (canUsePower(state)) usePowerOptions(slotOf(fs, state.drawn));
    return opts;
  }

  return {
    name: `power-${options.level ?? 'strong'}`,
    act(state) {
      const options = decide(state);
      const choice = pick(options, level.temperature, random).action;
      check(state, choice);
      return choice;
    },
    /** Powers-off compatibility with sim/game.js. */
    choose(state) {
      const a = this.act(state);
      return a.kind === 'move' ? a.move : null;
    },
  };
}

function slotOf(fs, card) {
  return card === JOKER ? fs.J : fs.values.indexOf(card);
}

function sameChoice(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => a[k] === b[k]);
}

/** Guards against the fast copy drifting from the engine. */
function check(state, a) {
  if (a.kind === 'move') {
    const ok = currentMoves(state).some((m) => m.unit === a.move.unit && (m.escort ?? null) === (a.move.escort ?? null));
    if (!ok) throw new Error(`powerBot: illegal move ${JSON.stringify(a.move)}`);
  } else if (a.kind === 'power') {
    if (!powerUseChoices(state).some((c) => sameChoice(c, a.args))) {
      throw new Error(`powerBot: illegal power use ${JSON.stringify(a.args)}`);
    }
  }
}

export { NO_TARGET, getUnit };
