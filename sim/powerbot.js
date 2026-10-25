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
// their best reply. An extra card drawn inside a turn (a campsite card) uses
// up one turn of look-ahead too, like the next turn would for a person
// thinking ahead; so does the Hanged Man's extra turn.
//
// `cache: true` reuses the value of a turn-start position met again during a
// decision (same units, powers, stars, decks, side to move and look-ahead
// left). Decisions are identical either way; it is off by default because
// such repeats are rare and the bookkeeping costs about as much as it saves.
//
// The bot answers bot.act(state) at every decision the engine offers:
//   turn start (before-draw timing, holding a power): draw, or use the power
//     either way up
//   number card: a move, pass (no move), or use the power (after-draw timing)
//   joker: draft (which card to keep), use the power, or pass
//   campsite / Hanged Man / Hermit cards: which move

import {
  CARD_IDS, JOKER, canUsePower, canUsePowerUpsideDown, currentMoves, draftOptions, getUnit,
  isNumberCard, powerUpsideDownChoices, powerUseChoices,
} from '../src/rules/index.js';
import { DEFAULT_WEIGHTS, WIN, endWaitTable, evaluate } from './bot.js';
import {
  apply, buildFast, canPushAlone, cardModeOf, discardCounts, drawCounts, genMoves, hermitMoves,
  returnCard, takeCard, undo,
} from './fast.js';
import {
  HERMIT, HM, NO_TARGET, TOWER, applyDraft, applyPower, canFlip, draftOdds, powerTargets, undoDraft,
  undoPower, usable,
} from './fastpowers.js';

/** Value of holding each power, in progress points (pips). */
export const DEFAULT_POWER_VALUES = Object.freeze({
  'hanged-man': 3, lovers: 2, devil: 4, tower: 3, hermit: 2, dud: 0,
});

/**
 * Value of one star, in pips (bot tuning, not a rule): stars later turn a
 * held power upside down.
 */
export const DEFAULT_STAR_VALUE = 0.5;

/** A turn's choice counts as sensible when within this many pips of the best. */
export const SENSIBLE_MARGIN = 1;

export const LEVELS = Object.freeze({
  strong: { depths: [[3, 0.8], [2, 0.2]], countCards: true, temperature: 0 },
  average: { depths: [[3, 0.65], [2, 0.35]], countCards: false, temperature: 1.2 },
  'strong-v1': { depths: [[2, 1]], countCards: true, temperature: 0 },
  'average-v1': { depths: [[1, 1]], countCards: false, temperature: 1.5 },
});

// Continuations after a move: END (the turn ends) or EXTRA (the Hanged Man's
// extra turn for the mover's side).
const END = -2;
const EXTRA = -3;

// --- search ------------------------------------------------------------------

/**
 * Cache key for a position at `tag` (a search point) with `depth` left.
 * Units of the same player and type are interchangeable, so each group is
 * listed by sorted position.
 */
function positionKey(fs, tag, depth, ctx) {
  let k = `${tag}|${depth}|${fs.current}|${fs.bonus}|${ctx.free}|${fs.held[0]}|${fs.held[1]}|${fs.stars[0]}|${fs.stars[1]}`;
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
  return v + held(ctx.me) - held(1 - ctx.me) + ctx.sv * (fs.stars[ctx.me] - fs.stars[1 - ctx.me]);
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
  return cont === EXTRA ? extraTurn(fs, q, depth, ctx) : endTurn(fs, q, depth, ctx);
}

/** q plays again (Hanged Man extra turn); it uses up a turn of look-ahead. */
function extraTurn(fs, q, depth, ctx) {
  const prevCurrent = fs.current;
  const prevBonus = fs.bonus;
  fs.current = q;
  fs.bonus = 0;
  const v = turnStart(fs, depth - 1, ctx);
  fs.current = prevCurrent;
  fs.bonus = prevBonus;
  return v;
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
function afterLanding(fs, q, rec, d, cont, depth, ctx) {
  if (rec.won) return winFor(q, ctx);
  if (fs.camp[rec.t]) return campsite(fs, q, rec.u, d, cont, depth, ctx);
  return proceed(fs, q, cont, depth, ctx);
}

/**
 * q's best move with card d (backward for the Hanged Man, limited to unit
 * `only` when >= 0), or undefined when there is none. A backward move is
 * followed by the extra turn.
 */
function bestMove(fs, q, d, back, only, cont, depth, ctx) {
  const moves = genMoves(fs, q, d, back, only);
  if (moves.length === 0) return undefined;
  const isBetter = better(ctx, q);
  let best = worst(ctx, q);
  for (const [u, e] of moves) {
    const rec = play(fs, q, u, e, d, back);
    const v = afterLanding(fs, q, rec, d, back ? EXTRA : cont, depth, ctx);
    unplay(fs, rec);
    if (isBetter(v, best)) best = v;
  }
  return best;
}

/**
 * The upside-down Hanged Man: q moves one of the opponent's units back by d
 * (alone, no campsite), then q takes an extra turn. Undefined with no move.
 */
function bestEnemyBack(fs, q, d, depth, ctx) {
  const moves = genMoves(fs, 1 - q, d, true, -1, true);
  if (moves.length === 0) return undefined;
  const isBetter = better(ctx, q);
  let best = worst(ctx, q);
  for (const [u] of moves) {
    const v = enemyBackMove(fs, q, u, d, depth, ctx);
    if (isBetter(v, best)) best = v;
  }
  return best;
}

function enemyBackMove(fs, q, u, d, depth, ctx) {
  const rec = apply(fs, u, -1, d, true);
  fs.current = q;
  const v = extraTurn(fs, q, depth, ctx);
  undo(fs, rec);
  return v;
}

/** Value at the start of fs.current's turn, before any card is drawn. */
function turnStart(fs, depth, ctx) {
  if (depth <= 0) return leaf(fs, ctx);
  return cached(fs, 'T', depth, ctx, () => searchTurn(fs, depth, ctx));
}

/**
 * Power uses q may consider now, each way up: [{ upside, target }]. `k` is the
 * drawn card slot (after-draw timing) or -1 (before draw). Mirrors the
 * engine's canUsePower / canUsePowerUpsideDown.
 */
function powerUses(fs, q, k) {
  const p = fs.held[q];
  if (!fs.powersOn || !usable(p)) return [];
  const before = k < 0;
  const number = k >= 0 && k < fs.J;
  const out = [];
  for (const upside of [false, true]) {
    if (upside && !canFlip(fs, q, p)) continue;
    let ok = true;
    if (p === HM) {
      ok = before || (number && genMoves(fs, upside ? 1 - q : q, fs.values[k], true, -1, upside).length > 0);
    } else if (p === HERMIT && !upside) {
      ok = before || (number && hermitMoves(fs, q, fs.values[k]).length > 0);
    } else if (p === TOWER && !upside) {
      ok = before || number;
    }
    if (!ok) continue;
    const targets = powerTargets(fs, q, p, upside);
    // These need a real target: the Tower's step, the upside-down Hermit's card.
    if ((p === TOWER && !upside) || (p === HERMIT && upside)) {
      if (targets[0] === NO_TARGET) continue;
    }
    for (const target of targets) out.push({ upside, target });
  }
  return out;
}

function searchTurn(fs, depth, ctx) {
  const q = fs.current;
  const isBetter = better(ctx, q);
  let best = drawAndResolve(fs, depth, ctx);
  if (fs.beforeDraw) {
    for (const use of powerUses(fs, q, -1)) {
      const v = afterPower(fs, q, fs.held[q], use, -1, depth, ctx);
      if (isBetter(v, best)) best = v;
    }
  }
  return best;
}

/** Expected value over fs.current's turn card, each resolved at its best. */
function drawAndResolve(fs, depth, ctx, { powers = true } = {}) {
  const q = fs.current;
  const { counts, total } = drawCounts(fs, q);
  let value = 0;
  for (let k = 0; k <= fs.J; k += 1) {
    const cnt = counts[k];
    if (!cnt) continue;
    const refilled = takeCard(fs, q, k);
    const v = powers ? resolveCard(fs, q, k, depth, ctx) : plainCard(fs, q, k, depth, ctx);
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

/** Card k played as a normal card (no power use). */
function plainCard(fs, q, k, depth, ctx) {
  if (k === fs.J) return jokerValue(fs, q, END, depth, ctx);
  const v = bestMove(fs, q, fs.values[k], false, -1, END, depth, ctx);
  return v === undefined ? endTurn(fs, q, depth, ctx) : v;
}

/** q's best way to resolve its turn card k, powers included (after-draw timing). */
function resolveCard(fs, q, k, depth, ctx) {
  const isBetter = better(ctx, q);
  let best = plainCard(fs, q, k, depth, ctx);
  if (!fs.beforeDraw) {
    for (const use of powerUses(fs, q, k)) {
      const v = afterPower(fs, q, fs.held[q], use, k, depth, ctx);
      if (isBetter(v, best)) best = v;
    }
  }
  return best;
}

/** The Hanged Man's card k: back (own or enemy unit), then the extra turn; no move ends the turn. */
function hangedCard(fs, q, k, upside, depth, ctx) {
  if (k === fs.J) return draftValue(fs, q, END, depth, ctx);
  const d = fs.values[k];
  const v = upside ? bestEnemyBack(fs, q, d, depth, ctx) : bestMove(fs, q, d, true, -1, END, depth, ctx);
  return v === undefined ? endTurn(fs, q, depth, ctx) : v;
}

/**
 * A campsite landing: `unit` moves forward d again (when it can), then `cont`.
 * Each repeat uses up a turn of look-ahead, which bounds chains.
 */
function campsite(fs, q, unit, d, cont, depth0, ctx) {
  const depth = depth0 - 1;
  if (depth <= 0) return leaf(fs, ctx);
  const v = bestMove(fs, q, d, false, unit, cont, depth, ctx);
  return v === undefined ? proceed(fs, q, cont, depth, ctx) : v;
}

/**
 * The Hermit's move of unit u onto an ally with number d, then the push: that
 * ally moves d forward alone when it can (its landing may start a campsite
 * card); then the turn ends.
 */
function hermitMove(fs, q, u, d, depth, ctx) {
  const rec = play(fs, q, u, -1, d, false);
  let v;
  if (rec.won) {
    v = winFor(q, ctx);
  } else {
    let ally = -1;
    for (let i = 0; i < fs.n; i += 1) {
      if (i !== u && fs.owner[i] === q && fs.pos[i] === rec.t) {
        ally = i;
        break;
      }
    }
    if (ally >= 0 && canPushAlone(fs, ally, d)) {
      const push = play(fs, q, ally, -1, d, false);
      v = afterLanding(fs, q, push, d, END, depth, ctx);
      unplay(fs, push);
    } else {
      v = endTurn(fs, q, depth, ctx);
    }
  }
  unplay(fs, rec);
  return v;
}

/** The best Hermit move with number d; with none, `fallback()`. */
function hermitWith(fs, q, d, depth, ctx, fallback) {
  const moves = hermitMoves(fs, q, d);
  if (moves.length === 0) return fallback();
  const isBetter = better(ctx, q);
  let best = worst(ctx, q);
  for (const [u] of moves) {
    const v = hermitMove(fs, q, u, d, depth, ctx);
    if (isBetter(v, best)) best = v;
  }
  return best;
}

/**
 * The Hermit's card k (upright): the best move onto an ally, then the push.
 * (Before draw: a Joker drafts as usual, and a card with no move onto an ally
 * is a normal move.)
 */
function hermitCard(fs, q, k, depth, ctx) {
  if (k === fs.J) return jokerValue(fs, q, END, depth, ctx);
  return hermitWith(fs, q, fs.values[k], depth, ctx, () => plainCard(fs, q, k, depth, ctx));
}

/**
 * q uses held power p ({ upside, target }); k is the drawn card slot, or -1
 * before drawing.
 */
function afterPower(fs, q, p, { upside, target }, k, depth, ctx) {
  const rec = applyPower(fs, q, p, target, upside);
  let v;
  if (rec.won >= 0) {
    v = winFor(rec.won, ctx);
  } else if (p === HM) {
    v = k >= 0 ? hangedCard(fs, q, k, upside, depth, ctx) : expectDraw(fs, q, (c) => hangedCard(fs, q, c, upside, depth, ctx));
  } else if (p === HERMIT) {
    v = upside
      ? hermitWith(fs, q, target.card, depth, ctx, () => endTurn(fs, q, depth, ctx))
      : k >= 0 ? hermitCard(fs, q, k, depth, ctx) : expectDraw(fs, q, (c) => hermitCard(fs, q, c, depth, ctx));
  } else if (p === TOWER && !upside) {
    // After the step, the turn's card is played as usual.
    v = k >= 0 ? plainCard(fs, q, k, depth, ctx) : drawAndResolve(fs, depth, ctx, { powers: false });
  } else {
    v = endTurn(fs, q, depth, ctx);
  }
  undoPower(fs, rec);
  return v;
}

/** Expected value of `resolve(c)` over q's next draw. */
function expectDraw(fs, q, resolve) {
  const { counts, total } = drawCounts(fs, q);
  let v = 0;
  for (let c = 0; c <= fs.J; c += 1) {
    const cnt = counts[c];
    if (!cnt) continue;
    const refilled = takeCard(fs, q, c);
    v += (cnt / total) * resolve(c);
    returnCard(fs, q, c, refilled);
  }
  return v;
}

// --- root decisions -------------------------------------------------------------

function engineTarget(fs, t) {
  if (t.card !== undefined) return { card: t.card };
  if (t.to !== undefined) return { unit: fs.ids[t.u], to: t.to };
  if (t.u !== undefined) return { unit: fs.ids[t.u] };
  return {};
}

/** The fast target for an engine argument object. */
function fastTarget(fs, args) {
  if (args.card !== undefined) return { card: args.card };
  if (args.unit !== undefined) {
    const u = fs.ids.indexOf(args.unit);
    return args.to !== undefined ? { u, to: args.to } : { u };
  }
  return NO_TARGET;
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

/** Distinct engine choices: identical effects listed once (same unit type on the same cell). */
function distinctChoices(state, choices) {
  const seen = new Set();
  return choices.filter((c) => {
    const u = c.unit ? getUnit(state, c.unit) : null;
    const key = JSON.stringify([u?.player, u?.pos, u?.type, c.to, c.card]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * @param {{ level?: string, depths?, depth?, countCards?, temperature?,
 *           weights?, powerValues?, starValue?, cache?: boolean, random?: () => number }} options
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
  const sv = options.starValue ?? DEFAULT_STAR_VALUE;
  const random = options.random ?? Math.random;

  // One look-ahead per turn: decisions later in the same turn reuse it.
  let turnDepth = null;
  let startDraw = -1; // draw-pile size at a before-draw turn start, else -1
  function depthFor(state) {
    const me = state.current;
    const midTurn = state.hanged || state.campsite || state.hermit;
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
    return { fs, ctx: { me: state.current, w, pv, sv, endOdds: endWaitTable(fs), free: 1, cache, stats } };
  }

  /**
   * The options at this decision, each with its value. Options are listed
   * first and only searched when there is more than one to choose from.
   */
  function decide(state, depth) {
    const { fs, ctx } = setup(state);
    const me = state.current;
    const opts = []; // { action, value: () => number }
    const k = state.drawn === null ? -1 : slotOf(fs, state.drawn);
    const powerOptions = () => {
      const p = fs.held[me];
      const sides = [
        [false, canUsePower(state) ? powerUseChoices(state) : [], 'power'],
        [true, canUsePowerUpsideDown(state) ? powerUpsideDownChoices(state) : [], 'upsideDown'],
      ];
      for (const [upside, choices, kind] of sides) {
        for (const args of distinctChoices(state, choices)) {
          const use = { upside, target: fastTarget(fs, args) };
          opts.push({ action: { kind, args }, value: () => afterPower(fs, me, p, use, k, depth, ctx) });
        }
      }
    };

    if (state.drawn === null) {
      // Before-draw timing: draw, or use the power instead.
      opts.push({ action: { kind: 'draw' }, value: () => drawAndResolve(fs, depth, ctx) });
      powerOptions();
    } else {
      const { back, only, enemy } = cardModeOf(fs, state);
      // A campsite card met during a Hanged Man's backward move: the extra turn follows.
      const cont = state.hanged?.stage === 'back' ? EXTRA : END;
      if (isNumberCard(state.drawn) && enemy) {
        // The upside-down Hanged Man: one of the opponent's units moves back.
        const d = state.drawn;
        for (const m of genMoves(fs, 1 - me, d, true, -1, true)) {
          opts.push({ action: { kind: 'move', move: engineMove(fs, m) }, value: () => enemyBackMove(fs, me, m[0], d, depth, ctx) });
        }
        if (opts.length === 0) opts.push({ action: { kind: 'pass' }, value: () => endTurn(fs, me, depth, ctx) });
      } else if (isNumberCard(state.drawn) && state.hermit) {
        // The Hermit's card: a move onto an ally, then the push.
        const d = state.drawn;
        for (const m of hermitMoves(fs, me, d)) {
          opts.push({ action: { kind: 'move', move: engineMove(fs, m) }, value: () => hermitMove(fs, me, m[0], d, depth, ctx) });
        }
      } else if (isNumberCard(state.drawn)) {
        const d = state.drawn;
        for (const m of genMoves(fs, me, d, back, only)) {
          opts.push({
            action: { kind: 'move', move: engineMove(fs, m) },
            value: () => {
              const rec = play(fs, me, m[0], m[1], d, back);
              const v = afterLanding(fs, me, rec, d, back ? EXTRA : cont, depth, ctx);
              unplay(fs, rec);
              return v;
            },
          });
        }
        if (opts.length === 0) {
          // No move: a Hanged Man backward card with no move ends the turn.
          opts.push({ action: { kind: 'pass' }, value: () => (back ? endTurn(fs, me, depth, ctx) : proceed(fs, me, cont, depth, ctx)) });
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
      powerOptions();
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
      // A power used instead of drawing ends the turn (the free powers go on mid-turn).
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
  } else if (a.kind === 'power') {
    if (!powerUseChoices(state).some((c) => sameChoice(c, a.args))) {
      throw new Error(`powerBot: illegal power use ${JSON.stringify(a.args)}`);
    }
  } else if (a.kind === 'upsideDown') {
    if (!powerUpsideDownChoices(state).some((c) => sameChoice(c, a.args))) {
      throw new Error(`powerBot: illegal upside-down use ${JSON.stringify(a.args)}`);
    }
  }
}

export { NO_TARGET, getUnit };
