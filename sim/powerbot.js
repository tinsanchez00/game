// Bots that play with powers on (and off).
//
// A level sets how many turns the bot looks ahead (drawn per turn from
// `depths`, [[turns, probability], ...]), whether it counts cards, and how
// noisy its choices are (softmax over the evaluation, temperature in pips).
//   strong      3 turns ahead 80% of turns, 2 turns 20%; counts cards; no noise
//   average     3 turns ahead 65% of turns, 2 turns 35%; assumes a full deck
//               on every draw (no card counting); temperature 1.2
//   strong-v1   2 turns ahead; counts cards; no noise
//   average-v1  1 turn ahead; no card counting; temperature 1.5
// "2 turns ahead" = its own turn, then every card the opponent can draw and
// their best reply. An extra card drawn inside a turn (a campsite card, the
// Hanged Man's forward card) uses up one turn of look-ahead too, like the
// next turn would for a person thinking ahead.
//
// `cache: true` reuses the value of a turn-start position met again during a
// decision (same units, powers, decks, side to move and look-ahead left).
// Decisions are identical either way; it is off by default because such
// repeats are rare (each line of play leaves the decks in a different state)
// and the bookkeeping costs about as much as it saves.
//
// The bot answers bot.act(state) at every decision the engine offers:
//   turn start (before-draw timing, holding a power): draw or use the power
//   number card: a move, pass (no move), or use the power (after-draw timing)
//   joker: draft (which card to keep), use the power, or pass
//   campsite / Hanged Man cards: which move (limited to one unit, or backward)
//   "line" Lovers jump stage: which jump, or none

import {
  CARD_IDS, JOKER, canUsePower, currentMoves, draftOptions, getUnit,
  isNumberCard, loversJumps, powerUseChoices,
} from '../src/rules/index.js';
import { DEFAULT_WEIGHTS, WIN, endWaitTable, evaluate } from './bot.js';
import {
  apply, buildFast, cardModeOf, discardCounts, drawCounts, genMoves, lift, loversTarget, place,
  returnCard, takeCard, undo,
} from './fast.js';
import {
  HM, LOVERS, NO_TARGET, applyDraft, usable, applyPower, draftOdds, powerTargets, undoDraft, undoPower,
} from './fastpowers.js';

/** Value of holding each power, in progress points (pips). */
export const DEFAULT_POWER_VALUES = Object.freeze({
  'hanged-man': 3, lovers: 2, devil: 4, tower: 3, hermit: 2, dud: 0,
});

/** A turn's choice counts as sensible when within this many pips of the best. */
export const SENSIBLE_MARGIN = 1;

export const LEVELS = Object.freeze({
  strong: { depths: [[3, 0.8], [2, 0.2]], countCards: true, temperature: 0 },
  average: { depths: [[3, 0.65], [2, 0.35]], countCards: false, temperature: 1.2 },
  'strong-v1': { depths: [[2, 1]], countCards: true, temperature: 0 },
  'average-v1': { depths: [[1, 1]], countCards: false, temperature: 1.5 },
});

// Continuations after a move: END (the turn ends), the Hanged Man's forward
// card for unit index c >= 0, or a "line" Lovers jump for unit u (jumpFor(u)).
// JUMP_MOVER: a jump for the unit that makes the move.
const END = -2;
const JUMP_MOVER = -1000;
const jumpFor = (u) => -4 - u;

// --- search ------------------------------------------------------------------

/**
 * Cache key for a position at `tag` (a search point) with `depth` left.
 * Units of the same player and type are interchangeable, so each group is
 * listed by sorted position.
 */
function positionKey(fs, tag, depth, ctx) {
  let k = `${tag}|${depth}|${fs.current}|${fs.bonus}|${ctx.free}|${fs.held[0]}|${fs.held[1]}`;
  for (let p = 0; p < 2; p += 1) {
    for (let c = 0; c < 2; c += 1) {
      const xs = [];
      for (let i = 0; i < fs.n; i += 1) if (fs.owner[i] === p && fs.cmd[i] === c) xs.push(fs.pos[i]);
      xs.sort((a, b) => a - b);
      k += `|${xs.join('.')}`;
    }
  }
  return `${k}|${fs.pdCounts.join('.')}|${fs.counts[0].join('.')}|${fs.counts[1].join('.')}|${fs.totals[0]}|${fs.totals[1]}`;
}

/** Runs `compute` once per position key (when the decision has a cache). */
function cached(fs, tag, depth, ctx, compute) {
  if (!ctx.cache) return compute();
  const key = positionKey(fs, tag, depth, ctx);
  const hit = ctx.cache.get(key);
  if (hit !== undefined) {
    ctx.stats.hits += 1;
    return hit;
  }
  ctx.stats.misses += 1;
  const v = compute();
  ctx.cache.set(key, v);
  return v;
}

function leaf(fs, ctx) {
  const v = evaluate(fs, ctx.me, ctx.w, ctx.endOdds);
  if (Math.abs(v) >= WIN) return v;
  const held = (p) => (fs.held[p] >= 0 ? ctx.pv[fs.held[p]] : 0);
  return v + held(ctx.me) - held(1 - ctx.me);
}

const better = (ctx, q) => (q === ctx.me ? (a, b) => a > b : (a, b) => a < b);
const worst = (ctx, q) => (q === ctx.me ? -Infinity : Infinity);
const winFor = (q, ctx) => (q === ctx.me ? WIN : -WIN);

/**
 * Starts the next turn. An extra turn for q (tower rule) doesn't use up
 * depth, once per line; otherwise the next turn is one level deeper.
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

/** q's turn is over: hand over (or keep it for an earned extra turn). */
function endTurn(fs, q, depth, ctx) {
  const prevCurrent = fs.current;
  const prevBonus = fs.bonus;
  fs.current = fs.bonus > 0 ? q : 1 - q;
  fs.bonus = 0;
  const v = next(fs, q, depth, ctx);
  fs.current = prevCurrent;
  fs.bonus = prevBonus;
  return v;
}

function proceed(fs, q, cont, depth, ctx) {
  if (cont === END) return endTurn(fs, q, depth, ctx);
  if (cont >= 0) return forwardCard(fs, q, cont, depth, ctx);
  return loversJump(fs, q, -4 - cont, depth, ctx);
}

/** Moves unit i to path position t without captures; returns an undo record. */
function jumpUnit(fs, i, t) {
  const rec = { i, from: fs.pos[i] };
  lift(fs, i);
  place(fs, i, t);
  return rec;
}

function unjump(fs, rec) {
  lift(fs, rec.i);
  place(fs, rec.i, rec.from);
}

/** q's best "line" Lovers jump for `unit`, or none; then the turn ends. */
function loversJump(fs, q, unit, depth, ctx) {
  const isBetter = better(ctx, q);
  let best = endTurn(fs, q, depth, ctx);
  for (let i = 0; i < fs.n; i += 1) {
    if (fs.owner[i] !== q || (unit >= 0 && i !== unit)) continue;
    const t = loversTarget(fs, i);
    if (t < 0) continue;
    const rec = jumpUnit(fs, i, t);
    const v = endTurn(fs, q, depth, ctx);
    unjump(fs, rec);
    if (isBetter(v, best)) best = v;
  }
  return best;
}

/** Applies a move inside q's turn (the turn may continue). */
function play(fs, q, u, e, d, back) {
  const rec = apply(fs, u, e, d, back);
  rec.bonus = !rec.won && fs.current === q ? 1 : 0;
  fs.bonus += rec.bonus;
  fs.current = q;
  return rec;
}

function unplay(fs, rec) {
  fs.bonus -= rec.bonus;
  undo(fs, rec);
}

/** After a card move landed on rec.t: a campsite card, then `cont`. */
function afterLanding(fs, q, rec, cont, depth, ctx) {
  if (rec.won) return winFor(q, ctx);
  if (fs.camp[rec.t]) return campsite(fs, q, rec.u, cont, depth, ctx);
  return proceed(fs, q, cont, depth, ctx);
}

/**
 * q's best move with card d (backward for the Hanged Man, limited to unit
 * `only` when >= 0), or undefined when there is none. A backward move is
 * followed by the forward card for the unit that moved.
 */
function bestMove(fs, q, d, back, only, cont, depth, ctx) {
  const moves = genMoves(fs, q, d, back, only);
  if (moves.length === 0) return undefined;
  const isBetter = better(ctx, q);
  let best = worst(ctx, q);
  for (const [u, e] of moves) {
    const rec = play(fs, q, u, e, d, back);
    const v = afterLanding(fs, q, rec, back ? u : cont === JUMP_MOVER ? jumpFor(u) : cont, depth, ctx);
    unplay(fs, rec);
    if (isBetter(v, best)) best = v;
  }
  return best;
}

/** Value at the start of fs.current's turn, before any card is drawn. */
function turnStart(fs, depth, ctx) {
  if (depth <= 0) return leaf(fs, ctx);
  return cached(fs, 'T', depth, ctx, () => searchTurn(fs, depth, ctx));
}

function searchTurn(fs, depth, ctx) {
  const q = fs.current;
  const isBetter = better(ctx, q);
  let best = drawAndResolve(fs, depth, ctx);
  if (fs.powersOn && fs.beforeDraw && usable(fs.held[q])) {
    const k = fs.held[q];
    for (const t of powerTargets(fs, q, k)) {
      const v = afterPower(fs, q, k, t, -1, depth, ctx);
      if (isBetter(v, best)) best = v;
    }
  }
  return best;
}

/** Expected value over fs.current's turn card, each resolved at its best. */
function drawAndResolve(fs, depth, ctx) {
  const q = fs.current;
  const { counts, total } = drawCounts(fs, q);
  let value = 0;
  for (let k = 0; k <= fs.J; k += 1) {
    const cnt = counts[k];
    if (!cnt) continue;
    const refilled = takeCard(fs, q, k);
    const v = resolveCard(fs, q, k, depth, ctx);
    returnCard(fs, q, k, refilled);
    value += (cnt / total) * v;
  }
  return value;
}

/** Drafting: the drafter keeps the better of the top two (unknown) cards. */
function draftValue(fs, q, cont, depth, ctx) {
  const odds = draftOdds(fs, ctx.pv);
  if (odds.length === 0) return proceed(fs, q, cont, depth, ctx);
  let value = 0;
  for (const [k, pr] of odds) {
    const rec = applyDraft(fs, q, k);
    value += pr * proceed(fs, q, cont, depth, ctx);
    undoDraft(fs, rec);
  }
  return value;
}

/** A joker within a turn: draft (powers on), else nothing. */
function jokerValue(fs, q, cont, depth, ctx) {
  return fs.powersOn ? draftValue(fs, q, cont, depth, ctx) : proceed(fs, q, cont, depth, ctx);
}

/** q's best way to resolve its turn card k, powers included. */
function resolveCard(fs, q, k, depth, ctx) {
  const isBetter = better(ctx, q);
  let best;
  if (k < fs.J) {
    best = bestMove(fs, q, fs.values[k], false, -1, END, depth, ctx);
    if (best === undefined) best = endTurn(fs, q, depth, ctx);
  } else {
    best = jokerValue(fs, q, END, depth, ctx);
  }
  if (fs.powersOn && !fs.beforeDraw && usable(fs.held[q])) {
    const p = fs.held[q];
    // After draw, free powers can't be used on a Joker (it drafts) and need a
    // move for a number card (backward for the Hanged Man).
    const free = p === HM || (p === LOVERS && fs.loversLine);
    if (!free || (k < fs.J && genMoves(fs, q, fs.values[k], p === HM).length > 0)) {
      for (const t of powerTargets(fs, q, p)) {
        const v = afterPower(fs, q, p, t, k, depth, ctx);
        if (isBetter(v, best)) best = v;
      }
    }
  }
  return best;
}

/** The Hanged Man's backward card k; no backward move: the turn ends (a Joker drafts, no forward card). */
function hangedCard(fs, q, k, depth, ctx) {
  if (k === fs.J) return draftValue(fs, q, END, depth, ctx);
  const v = bestMove(fs, q, fs.values[k], true, -1, END, depth, ctx);
  return v === undefined ? endTurn(fs, q, depth, ctx) : v;
}

/**
 * The Hanged Man's forward card, moving unit `unit`. The extra
 * draw uses up a turn of look-ahead.
 */
function forwardCard(fs, q, unit, depth0, ctx) {
  const depth = depth0 - 1;
  if (depth <= 0) return leaf(fs, ctx);
  const { counts, total } = drawCounts(fs, q);
  let value = 0;
  for (let k = 0; k <= fs.J; k += 1) {
    const cnt = counts[k];
    if (!cnt) continue;
    const refilled = takeCard(fs, q, k);
    let v;
    if (k < fs.J) {
      v = bestMove(fs, q, fs.values[k], false, unit, END, depth, ctx);
      if (v === undefined) v = endTurn(fs, q, depth, ctx);
    } else {
      v = jokerValue(fs, q, END, depth, ctx);
    }
    returnCard(fs, q, k, refilled);
    value += (cnt / total) * v;
  }
  return value;
}

/**
 * A campsite card for `unit`: random from q's discard pile, then `cont`.
 * The extra draw uses up a turn of look-ahead.
 */
function campsite(fs, q, unit, cont, depth0, ctx) {
  const depth = depth0 - 1;
  if (depth <= 0) return leaf(fs, ctx);
  const { counts, total } = discardCounts(fs, q);
  let value = 0;
  for (let k = 0; k <= fs.J; k += 1) {
    const cnt = counts[k];
    if (!cnt) continue;
    let v;
    if (k < fs.J) {
      v = bestMove(fs, q, fs.values[k], false, unit, cont, depth, ctx);
      if (v === undefined) v = proceed(fs, q, cont, depth, ctx);
    } else {
      v = jokerValue(fs, q, cont, depth, ctx);
    }
    value += (cnt / total) * v;
  }
  return value;
}

/**
 * The "line" Lovers' card k: a normal move, then the mover's jump. (Before
 * draw: a Joker drafts as usual, and no move ends the turn.)
 */
function loversCard(fs, q, k, depth, ctx) {
  if (k === fs.J) return jokerValue(fs, q, END, depth, ctx);
  const v = bestMove(fs, q, fs.values[k], false, -1, JUMP_MOVER, depth, ctx);
  return v === undefined ? endTurn(fs, q, depth, ctx) : v;
}

/** q uses power p on target t; k is the drawn card slot, or -1 before drawing. */
function afterPower(fs, q, p, t, k, depth, ctx) {
  const rec = applyPower(fs, q, p, t);
  const free = p === HM ? hangedCard : p === LOVERS && fs.loversLine ? loversCard : null;
  let v;
  if (!free) {
    v = endTurn(fs, q, depth, ctx);
  } else if (k >= 0) {
    v = free(fs, q, k, depth, ctx);
  } else {
    const { counts, total } = drawCounts(fs, q);
    v = 0;
    for (let c = 0; c <= fs.J; c += 1) {
      const cnt = counts[c];
      if (!cnt) continue;
      const refilled = takeCard(fs, q, c);
      v += (cnt / total) * free(fs, q, c, depth, ctx);
      returnCard(fs, q, c, refilled);
    }
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

function rollDepth(depths, random) {
  if (depths.length === 1) return depths[0][0];
  let r = random();
  for (const [d, p] of depths) {
    r -= p;
    if (r < 0) return d;
  }
  return depths[depths.length - 1][0];
}

/**
 * @param {{ level?: string, depths?, depth?, countCards?, temperature?,
 *           weights?, powerValues?, cache?: boolean, random?: () => number }} options
 *   depth: a fixed look-ahead, shorthand for depths [[depth, 1]].
 */
export function powerBot(options = {}) {
  const levelName = options.level ?? 'strong';
  if (!LEVELS[levelName]) throw new Error(`powerBot: unknown level ${levelName}`);
  const level = { ...LEVELS[levelName], ...options };
  if (options.depth !== undefined) level.depths = [[options.depth, 1]];
  const w = { ...DEFAULT_WEIGHTS, ...(options.weights ?? {}) };
  const pvMap = { ...DEFAULT_POWER_VALUES, ...(options.powerValues ?? {}) };
  const pv = CARD_IDS.map((id) => pvMap[id] ?? 0);
  const random = options.random ?? Math.random;

  // One look-ahead per turn: decisions later in the same turn reuse it.
  let turnDepth = null;
  let startDraw = -1; // draw-pile size at a before-draw turn start, else -1
  function depthFor(state) {
    const me = state.current;
    const midTurn = state.hanged || state.campsite || state.lovers;
    const drawSize = state.moveDecks[me].draw.length;
    const sameTurn = startDraw >= 0 && state.drawn !== null
      && drawSize === (startDraw > 0 ? startDraw - 1 : state.config.moveDeck.length - 1);
    if ((midTurn || sameTurn) && turnDepth !== null) {
      if (!midTurn) startDraw = -1;
      return turnDepth;
    }
    turnDepth = rollDepth(level.depths, random);
    startDraw = state.drawn === null ? drawSize : -1;
    return turnDepth;
  }

  const useCache = options.cache === true;
  const stats = { hits: 0, misses: 0 };

  function setup(state) {
    const fs = buildFast(state);
    if (!level.countCards) {
      for (const p of [0, 1]) {
        fs.counts[p].set(fs.fullCounts);
        fs.totals[p] = fs.fullTotal;
      }
    }
    const cache = useCache ? new Map() : null;
    return { fs, ctx: { me: state.current, w, pv, endOdds: endWaitTable(fs), free: 1, cache, stats } };
  }

  /**
   * The options at this decision, each with its value. Options are listed
   * first and only searched when there is more than one to choose from.
   */
  function decide(state, depth) {
    const { fs, ctx } = setup(state);
    const me = state.current;
    const opts = []; // { action, value: () => number }
    const usePowerOptions = (k) => {
      const p = fs.held[me];
      for (const t of powerTargets(fs, me, p)) {
        opts.push({ action: { kind: 'power', args: engineTarget(fs, t) }, value: () => afterPower(fs, me, p, t, k, depth, ctx) });
      }
    };

    if (state.lovers?.stage === 'jump') {
      // "Line" Lovers: jump (one of the listed jumps) or stay; then the turn ends.
      opts.push({ action: { kind: 'loversJump', jump: null }, value: () => endTurn(fs, me, depth, ctx) });
      for (const j of loversJumps(state)) {
        const i = fs.ids.indexOf(j.unit);
        opts.push({
          action: { kind: 'loversJump', jump: j },
          value: () => {
            const rec = jumpUnit(fs, i, j.to);
            const v = endTurn(fs, me, depth, ctx);
            unjump(fs, rec);
            return v;
          },
        });
      }
    } else if (state.drawn === null) {
      // Before-draw timing: draw, or use the power instead.
      opts.push({ action: { kind: 'draw' }, value: () => drawAndResolve(fs, depth, ctx) });
      if (canUsePower(state)) usePowerOptions(-1);
    } else {
      // What follows this card: the Hanged Man's forward card after its
      // backward card (for the unit that moved; any unit after a joker), or
      // after a campsite card met during that backward step; else the turn ends.
      const { back, only } = cardModeOf(fs, state);
      const idx = (id) => (id ? fs.ids.indexOf(id) : -1);
      let cont = state.campsite && state.hanged?.stage === 'back' ? idx(state.hanged.unit) : END;
      // "Line" Lovers card move: the mover's jump follows (the campsite unit's, during its card).
      if (state.lovers) cont = state.campsite ? jumpFor(idx(state.campsite.unit)) : JUMP_MOVER;
      if (isNumberCard(state.drawn)) {
        const d = state.drawn;
        for (const m of genMoves(fs, me, d, back, only)) {
          opts.push({
            action: { kind: 'move', move: engineMove(fs, m) },
            value: () => {
              const rec = play(fs, me, m[0], m[1], d, back);
              const v = afterLanding(fs, me, rec, back ? m[0] : cont === JUMP_MOVER ? jumpFor(m[0]) : cont, depth, ctx);
              unplay(fs, rec);
              return v;
            },
          });
        }
        if (opts.length === 0) {
          // No move: a Hanged Man backward card with no move ends the turn.
          opts.push({ action: { kind: 'pass' }, value: () => (back ? endTurn(fs, me, depth, ctx) : proceed(fs, me, cont === JUMP_MOVER ? END : cont, depth, ctx)) });
        }
      } else {
        // Joker: draft one of the visible cards, or pass when drafting can't happen.
        const jokerCont = back ? END : cont;
        const choices = draftOptions(state);
        if (choices.length === 0) {
          opts.push({ action: { kind: 'passJoker' }, value: () => proceed(fs, me, jokerCont, depth, ctx) });
        }
        choices.forEach((id, index) => {
          if (choices.indexOf(id) !== index) return; // two identical cards are one choice
          opts.push({
            action: { kind: 'draft', index },
            value: () => {
              const rec = applyDraft(fs, me, CARD_IDS.indexOf(id));
              const v = proceed(fs, me, jokerCont, depth, ctx);
              undoDraft(fs, rec);
              return v;
            },
          });
        });
      }
      if (canUsePower(state)) usePowerOptions(slotOf(fs, state.drawn));
    }
    // A single option needs no search.
    if (opts.length === 1) return [{ action: opts[0].action, value: 0 }];
    return opts.map((o) => ({ action: o.action, value: o.value() }));
  }

  return {
    name: `power-${levelName}`,
    /** Look-ahead (turns) used for the latest decision. */
    lastDepth: null,
    /** Position-cache hits and misses so far. */
    stats,
    /** The latest decision: distinct options, and how many were within SENSIBLE_MARGIN of the best. */
    lastChoice: null,
    act(state) {
      this.lastDepth = depthFor(state);
      const options = decide(state, this.lastDepth);
      const top = Math.max(...options.map((o) => o.value));
      this.lastChoice = { options: options.length, sensible: options.filter((o) => o.value >= top - SENSIBLE_MARGIN).length };
      const choice = pick(options, level.temperature, random).action;
      check(state, choice);
      // A power used instead of drawing ends the turn (the Hanged Man goes on mid-turn).
      if (state.drawn === null && choice.kind !== 'draw') startDraw = -1;
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
  } else if (a.kind === 'loversJump') {
    if (a.jump && !loversJumps(state).some((j) => j.unit === a.jump.unit && j.to === a.jump.to)) {
      throw new Error(`powerBot: illegal Lovers jump ${JSON.stringify(a.jump)}`);
    }
  } else if (a.kind === 'power') {
    if (!powerUseChoices(state).some((c) => sameChoice(c, a.args))) {
      throw new Error(`powerBot: illegal power use ${JSON.stringify(a.args)}`);
    }
  }
}

export { NO_TARGET, getUnit };
