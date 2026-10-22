// Runs a list of scenarios and writes their summaries as JSON.
//
// Usage: node sim/run.js <scenarios.mjs> <out.json> [--games N] [--depth D]
//                        [--weights '{"tower":2}'] [--only id1,id2]
//                        [--bot '{"kind":"power","level":"strong"}'] [--resume]
//
// <scenarios.mjs> default-exports [{ id, label, group?, meta?, bot?, config,
// measureChoices? }] (measureChoices: record how much choice each turn offered).
// Every scenario plays the same seeds (1..N) with the same bot on both sides:
// the scenario's own `bot`, else --bot, else a search bot of --depth.
// The output file is rewritten after every scenario; --resume skips the
// scenarios it already holds. Finished jobs of the scenario in progress are
// kept in <out.json>.partial.json, so --resume also continues a scenario
// that was interrupted.

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
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

const results = process.argv.includes('--resume') && existsSync(outPath)
  ? JSON.parse(readFileSync(outPath, 'utf8')).results
  : [];
const done = new Set(results.map((r) => r.id));
const started = Date.now();

function save() {
  writeFileSync(outPath, JSON.stringify({
    generated: new Date().toISOString(),
    gamesPerScenario: games,
    bot: defaultBot,
    seconds: Math.round((Date.now() - started) / 1000),
    results,
  }, null, 1));
}

/** Seeds per job: small for slow (deep) bots so both threads stay busy. */
function chunkSize(bot) {
  if (bot.kind !== 'power') return 50;
  if (bot.level === 'average-v1') return 50;
  if (bot.level === 'strong-v1') return 10;
  return 2;
}

const resume = process.argv.includes('--resume');
const partialPath = `${outPath}.partial.json`;

/** Finished jobs of scenario `id` from an interrupted run: { [jobIndex]: records }. */
function loadPartial(id, size) {
  if (!resume || !existsSync(partialPath)) return {};
  const p = JSON.parse(readFileSync(partialPath, 'utf8'));
  return p.id === id && p.size === size && p.games === games ? p.parts : {};
}

for (const sc of scenarios) {
  if (done.has(sc.id)) continue;
  const config = makeConfig(sc.config);
  const t0 = Date.now();
  const bot = sc.bot ?? defaultBot;
  const size = chunkSize(bot);
  const seedChunks = chunk(seedRange(1, games), size);
  const parts = loadPartial(sc.id, size);
  const todo = seedChunks.map((seeds, i) => ({ i, seeds })).filter(({ i }) => !parts[i]);
  if (todo.length < seedChunks.length) console.log(`${sc.id}: continuing, ${seedChunks.length - todo.length}/${seedChunks.length} jobs already done`);
  await runJobs(todo.map(({ seeds }) => ({
    type: 'games', config, bots: [bot, bot], seeds, maxTurns: 5000, measureChoices: Boolean(sc.measureChoices),
  })), {
    onResult: (k, result) => {
      parts[todo[k].i] = result;
      writeFileSync(partialPath, JSON.stringify({ id: sc.id, size, games, parts }));
    },
  });
  const records = seedChunks.flatMap((_, i) => parts[i]);
  const summary = summarize(records, { teamSize: teamSize(config) });
  results.push({ id: sc.id, label: sc.label, group: sc.group ?? null, meta: sc.meta ?? null, bot, config, summary });
  const t = summary.turns;
  console.log(`${sc.id.padEnd(22)} mean ${t.mean.toFixed(1).padStart(6)}  median ${String(t.median).padStart(5)}  `
    + `min ${String(t.min).padStart(4)}  max ${String(t.max).padStart(5)}  first ${(100 * summary.firstPlayerWins.rate).toFixed(1)}%  `
    + `${((Date.now() - t0) / 1000).toFixed(0)}s`);
  save();
  if (existsSync(partialPath)) unlinkSync(partialPath);
}

save();
console.log(`wrote ${outPath}`);
