// Summaries of many game records (see game.js).

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function describe(values) {
  const v = values.filter((x) => x !== null && x !== undefined);
  const n = v.length;
  if (n === 0) return { n: 0 };
  const sorted = [...v].sort((a, b) => a - b);
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const q = (x) => quantile(sorted, x);
  return {
    n, mean, sd, se: sd / Math.sqrt(n),
    min: sorted[0], p1: q(0.01), p5: q(0.05), p10: q(0.1), p25: q(0.25), median: q(0.5),
    p75: q(0.75), p90: q(0.9), p95: q(0.95), p99: q(0.99), max: sorted[n - 1],
  };
}

function rate(hits, n) {
  const p = n ? hits / n : 0;
  return { rate: p, ci95: n ? 1.96 * Math.sqrt((p * (1 - p)) / n) : 0, n };
}

function histogram(values, width) {
  const bins = new Map();
  for (const v of values) {
    const b = Math.floor(v / width) * width;
    bins.set(b, (bins.get(b) ?? 0) + 1);
  }
  return [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([from, count]) => ({ from, to: from + width, count }));
}

export function summarize(records, { teamSize, histWidth = 10 } = {}) {
  const done = records.filter((r) => r.finished);
  const turns = done.map((r) => r.turns);
  const byTurns = [...done].sort((a, b) => a.turns - b.turns);
  const loserLeft = new Array(teamSize + 1).fill(0);
  for (const r of done) loserLeft[r.loserLeft] += 1;
  const sum = (f) => done.reduce((a, r) => a + f(r), 0);
  const known = (f) => done.filter((r) => f(r) !== null);

  const half = known((r) => r.leaderAtHalfWon);
  const late = known((r) => r.leaderAt75Won);
  const cmd = done.flatMap((r) => r.commanderOut.filter((t) => t !== null));

  return {
    games: records.length,
    unfinished: records.length - done.length,
    turns: describe(turns),
    turnsPerPlayer: describe(done.map((r) => r.turns / 2)),
    histogram: histogram(turns, histWidth),
    firstPlayerWins: rate(done.filter((r) => r.winner === r.first).length, done.length),
    loserLeft: { mean: sum((r) => r.loserLeft) / done.length, counts: loserLeft },
    loserProgress: describe(done.map((r) => r.loserProgress)),
    loserHome: sum((r) => r.loserHome) / done.length,
    captures: describe(done.map((r) => r.captured[0] + r.captured[1])),
    multiCaptures: sum((r) => r.multiCaptures) / done.length,
    gamesWithoutCaptures: rate(done.filter((r) => r.captured[0] + r.captured[1] === 0).length, done.length),
    wastedShare: sum((r) => r.wasted[0] + r.wasted[1]) / sum((r) => r.turns),
    jokerShare: sum((r) => r.jokers[0] + r.jokers[1]) / sum((r) => r.turns),
    extraTurns: sum((r) => r.extraTurns[0] + r.extraTurns[1]) / done.length,
    campsiteCards: sum((r) => (r.campsiteCards ? r.campsiteCards[0] + r.campsiteCards[1] : 0)) / done.length,
    leadChanges: describe(done.map((r) => r.leadChanges)),
    winnerMaxDeficit: describe(done.map((r) => r.maxDeficit)),
    leaderAtHalfWins: rate(half.filter((r) => r.leaderAtHalfWon).length, half.length),
    leaderAt75Wins: rate(late.filter((r) => r.leaderAt75Won).length, late.length),
    commanderFirstMoveTurn: describe(cmd),
    ...powerSummary(done, teamSize),
    shortest: byTurns.slice(0, 3).map((r) => ({ seed: r.seed, turns: r.turns, loserLeft: r.loserLeft })),
    longest: byTurns.slice(-3).reverse().map((r) => ({ seed: r.seed, turns: r.turns, loserLeft: r.loserLeft })),
  };
}

/** Ascension gaps and per-power effects (fields present on game.js records). */
function powerSummary(done, teamSize) {
  if (!done.length || done[0].loserAscended === undefined) return {};
  const n = done.length;
  const sum = (f) => done.reduce((a, r) => a + f(r), 0);
  const loserAscended = new Array(teamSize).fill(0);
  for (const r of done) loserAscended[r.loserAscended] += 1;
  const usedMore = done.filter((r) => r.winnerUsedMore !== null && r.winnerUsedMore !== undefined);
  const perPower = {};
  for (const id of Object.keys(done[0].powers ?? {})) {
    const t = (f) => sum((r) => f(r.powers[id]));
    const used = t((x) => x.used);
    perPower[id] = {
      draftedPerGame: t((x) => x.drafted) / n,
      usedPerGame: used / n,
      noEffectShare: used ? t((x) => x.noEffect) / used : null,
      enemyKilledPerUse: used ? t((x) => x.enemyKilled) / used : null,
      ownKilledPerUse: used ? t((x) => x.ownKilled) / used : null,
      enemyProgressLostPerUse: used ? t((x) => x.enemyProgressLost) / used : null,
      ownProgressLostPerUse: used ? t((x) => x.ownProgressLost) / used : null,
      swingPerUse: used ? t((x) => x.swing) / used : null,
      heldShare: t((x) => x.heldTurns ?? 0) / sum((r) => r.turns),
      discardedPerGame: t((x) => x.discarded ?? 0) / n,
      // Of the times this power left a player's hand: share lost unused to a draft.
      discardShare: (() => {
        const lost = t((x) => x.discarded ?? 0);
        return lost + used ? lost / (lost + used) : null;
      })(),
    };
  }
  return {
    loserAscended: { mean: sum((r) => r.loserAscended) / n, counts: loserAscended },
    ascendedGap: describe(done.map((r) => teamSize - r.loserAscended)),
    blowouts: rate(done.filter((r) => r.loserAscended <= 1).length, n),
    shutouts: rate(done.filter((r) => r.loserAscended === 0).length, n),
    powerKills: describe(done.map((r) => r.powerKills[0] + r.powerKills[1])),
    powersUsed: describe(done.map((r) => r.powersUsed[0] + r.powersUsed[1])),
    choiceShares: choiceShares(done),
    winnerUsedMorePowers: rate(usedMore.filter((r) => r.winnerUsedMore).length, usedMore.length),
    perPower,
  };
}

/** Shares of turns with no choice, one sensible option, or a real choice. */
function choiceShares(done) {
  if (!done.length || !done.every((r) => r.choiceTurns)) return null;
  const tot = { none: 0, one: 0, real: 0 };
  for (const r of done) for (const k of Object.keys(tot)) tot[k] += r.choiceTurns[k][0] + r.choiceTurns[k][1];
  const n = tot.none + tot.one + tot.real;
  return n ? { none: tot.none / n, one: tot.one / n, real: tot.real / n, turns: n } : null;
}
