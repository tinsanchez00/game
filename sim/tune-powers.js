// Coordinate search over the strong power bot's held-power values by paired
// self-play. Usage: node sim/tune-powers.js [rounds] [seedsPerMatch] [configJson]

import { POWER_IDS } from '../src/rules/index.js';
import { DEFAULT_POWER_VALUES } from './powerbot.js';
import { poolMatch, seedRange } from './pool.js';

const rounds = Number(process.argv[2] ?? 1);
const seedsPerMatch = Number(process.argv[3] ?? 1000);
const config = JSON.parse(process.argv[4] ?? '{}');
const STEP = 2;

let best = { ...DEFAULT_POWER_VALUES };
let seedBase = 700000;
for (let round = 1; round <= rounds; round += 1) {
  let improved = false;
  for (const id of POWER_IDS) {
    for (const dir of [1, -1]) {
      const candidate = { ...best, [id]: Math.max(0, best[id] + dir * STEP) };
      if (candidate[id] === best[id]) continue;
      const r = await poolMatch({
        config,
        a: { kind: 'power', level: 'strong', powerValues: candidate },
        b: { kind: 'power', level: 'strong', powerValues: best },
        seeds: seedRange(seedBase, seedsPerMatch),
        chunkSize: 25,
      });
      seedBase += seedsPerMatch;
      const keep = r.rate - 0.5 > r.ci95;
      console.log(`round ${round} ${id}=${candidate[id]}: ${(100 * r.rate).toFixed(1)}% ±${(100 * r.ci95).toFixed(1)}${keep ? '  kept' : ''}`);
      if (keep) { best = candidate; improved = true; break; }
    }
  }
  console.log(`after round ${round}:`, JSON.stringify(best));
  if (!improved) break;
}
console.log('BEST', JSON.stringify(best));
