// Runs a list of scenarios and writes their summaries as JSON.
//
// Usage: node sim/run.js <scenarios.mjs> <out.json> [--games N] [--depth D]
//                        [--weights '{"tower":2}'] [--only id1,id2]
//                        [--bot '{"kind":"power","level":"strong"}']
//
// <scenarios.mjs> default-exports [{ id, label, group?, meta?, bot?, config }].
// Every scenario plays the same seeds (1..N) with the same bot on both sides:
// the scenario's own `bot`, else --bot, else a search bot of --depth.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeConfig, teamSize } from '../src/rules/index.js';
import { DEFAULT_WEIGHTS } from './bot.js';
import { chunk, runJobs, seedRange } from './pool.js';
import { summarize } from './stats.js';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const [scenarioPath, outPath] = process.argv.slice(2);
if (!scenarioPath || !outPath) {
  console.error('usage: node sim/run.js <scenarios.mjs> <out.json> [--games N] [--depth D]');
  process.exit(1);
}
const games = Number(arg('games', 2000));
const depth = Number(arg('depth', 2));
const weights = { ...DEFAULT_WEIGHTS, ...JSON.parse(arg('weights', '{}')) };
const only = arg('only', null)?.split(',');

const { default: all } = await import(pathToFileURL(resolve(scenarioPath)).href);
const scenarios = only ? all.filter((s) => only.includes(s.id)) : all;
const defaultBot = arg('bot', null) ? JSON.parse(arg('bot')) : { kind: 'search', depth, weights };

const results = [];
const started = Date.now();
for (const sc of scenarios) {
  const config = makeConfig(sc.config);
  const t0 = Date.now();
  const bot = sc.bot ?? defaultBot;
  const size = bot.kind === 'power' && bot.level !== 'average' ? 10 : 50;
  const parts = await runJobs(chunk(seedRange(1, games), size).map((seeds) => ({
    type: 'games', config, bots: [bot, bot], seeds, maxTurns: 5000,
  })));
  const records = parts.flat();
  const summary = summarize(records, { teamSize: teamSize(config) });
  results.push({ id: sc.id, label: sc.label, group: sc.group ?? null, meta: sc.meta ?? null, bot, config, summary });
  const t = summary.turns;
  console.log(`${sc.id.padEnd(22)} mean ${t.mean.toFixed(1).padStart(6)}  median ${String(t.median).padStart(5)}  `
    + `min ${String(t.min).padStart(4)}  max ${String(t.max).padStart(5)}  first ${(100 * summary.firstPlayerWins.rate).toFixed(1)}%  `
    + `${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

writeFileSync(outPath, JSON.stringify({
  generated: new Date().toISOString(),
  gamesPerScenario: games,
  bot: defaultBot,
  seconds: Math.round((Date.now() - started) / 1000),
  results,
}, null, 1));
console.log(`wrote ${outPath}`);
