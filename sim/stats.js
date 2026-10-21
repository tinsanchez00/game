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
    leadChanges: describe(done.map((r) => r.leadChanges)),
    winnerMaxDeficit: describe(done.map((r) => r.maxDeficit)),
    leaderAtHalfWins: rate(half.filter((r) => r.leaderAtHalfWon).length, half.length),
    leaderAt75Wins: rate(late.filter((r) => r.leaderAt75Won).length, late.length),
    commanderFirstMoveTurn: describe(cmd),
    shortest: byTurns.slice(0, 3).map((r) => ({ seed: r.seed, turns: r.turns, loserLeft: r.loserLeft })),
    longest: byTurns.slice(-3).reverse().map((r) => ({ seed: r.seed, turns: r.turns, loserLeft: r.loserLeft })),
  };
}
