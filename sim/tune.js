// Coordinate search over evaluation weights by paired self-play.
// Usage: node sim/tune.js [rounds] [seedsPerMatch] [configJson]
// Prints the best weights found; each candidate must beat the current best
// by more than its 95% margin to be kept.

import { DEFAULT_WEIGHTS } from './bot.js';
import { poolMatch, seedRange } from './pool.js';

const rounds = Number(process.argv[2] ?? 2);
const seedsPerMatch = Number(process.argv[3] ?? 2000);
const config = JSON.parse(process.argv[4] ?? '{"powers":false}');

const STEPS = {
  ascended: 2, endLane: 1.5, home: 1, tower: 1.5, endWait: 1.5,
  locked: 2, escortReady: 1, imminent: 0.3, remote: 0.2,
};

let best = { ...DEFAULT_WEIGHTS };
let seedBase = 100000;

for (let round = 1; round <= rounds; round += 1) {
  let improved = false;
  for (const [key, step] of Object.entries(STEPS)) {
    for (const dir of [1, -1]) {
      const candidate = { ...best, [key]: Math.round((best[key] + dir * step) * 100) / 100 };
      const r = await poolMatch({
        config,
        a: { kind: 'search', depth: 2, weights: candidate },
        b: { kind: 'search', depth: 2, weights: best },
        seeds: seedRange(seedBase, seedsPerMatch),
      });
      seedBase += seedsPerMatch;
      const edge = r.rate - 0.5;
      const keep = edge > r.ci95;
      console.log(`round ${round} ${key}=${candidate[key]}: ${(100 * r.rate).toFixed(1)}% ±${(100 * r.ci95).toFixed(1)}${keep ? '  kept' : ''}`);
      if (keep) {
        best = candidate;
        improved = true;
        break;
      }
    }
  }
  console.log(`after round ${round}:`, JSON.stringify(best));
  if (!improved) break;
}
console.log('BEST', JSON.stringify(best));
