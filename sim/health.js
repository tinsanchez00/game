// Health check: plays a plan of settings, measures each setting with
// standard errors, and compares the measurements with an earlier run.
//
// Usage: node sim/health.js <plan.mjs> <out.json> [--games N | --quick]
//                           [--baseline <earlier out.json>] [--report <file.md>]
//
// <plan.mjs> exports:
//   settings: [{ id, label?, bot, config, measureChoices?, reference?, power? }]
//     reference: id of the setting whose mean game length `vsReference` is
//     measured against; power: the card whose `held`/`used`/`discarded`/
//     `discardShare` are measured (every non-dud card in the deck if absent).
//   metrics: { [key]: { label, margin, relative?, format?, group?, info? } }
//     key is a metric name below (per-card metrics as e.g. `held`); group is
//     a report section name, or a function of the setting (null: skip).
//   groups, snapshotGroups, cardLabels, fullGames, quickGames (optional):
//     report section order, sections whose current values are tabled, card
//     display names, default run sizes.
//   prefixGames (optional): also measure the first N seeds, so a short run
//     of N games compares with the same seeds of a long baseline.
//
// Every setting plays seeds 1..games. A difference is `meaningful` when it is
// at least 3 standard errors and at least `margin` (relative: a fraction of
// the baseline value); `real` when only the first holds.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DUD, RULES_VERSION, makeConfig, teamSize } from '../src/rules/index.js';
import { chunk, runJobs, seedRange } from './pool.js';

const Z = 3;

// ---- estimators ------------------------------------------------------------

const sumOf = (a) => a.reduce((s, x) => s + x, 0);

export function mean(values) {
  const n = values.length;
  if (!n) return null;
  const m = sumOf(values) / n;
  const sd = n > 1 ? Math.sqrt(sumOf(values.map((x) => (x - m) ** 2)) / (n - 1)) : 0;
  return { value: m, se: sd / Math.sqrt(n), n };
}

export function share(hits, n) {
  if (!n) return null;
  const p = hits / n;
  return { value: p, se: Math.sqrt((p * (1 - p)) / n), n };
}

/** Ratio of sums over games (numerators ys, denominators xs), linearised SE. */
export function ratio(ys, xs) {
  const n = ys.length;
  const X = sumOf(xs);
  if (!n || !X) return null;
  const r = sumOf(ys) / X;
  const xbar = X / n;
  const v = n > 1 ? sumOf(ys.map((y, i) => (y - r * xs[i]) ** 2)) / (n - 1) : 0;
  return { value: r, se: Math.sqrt(v / n) / xbar, n };
}

/** a / b - 1 for two independent means. */
function relChange(a, b) {
  if (!a || !b || !b.value) return null;
  const q = a.value / b.value;
  const se = q * Math.sqrt((a.se / a.value) ** 2 + (b.se / b.value) ** 2);
  return { value: q - 1, se, n: a.n };
}

// ---- measurements ----------------------------------------------------------

/** Cards measured for a setting: its `power`, or every non-dud card in the deck. */
function cardsOf(setting, records) {
  if (setting.power) return [setting.power];
  const deck = setting.config?.powerDeck;
  const ids = deck ?? Object.keys(records[0]?.powers ?? {});
  return setting.config?.powers === false ? [] : [...new Set(ids)].filter((id) => id !== DUD);
}

/** Measurements of one setting's game records: { [key]: { value, se, n } }. */
export function measure(records, setting = {}) {
  const done = records.filter((r) => r.finished);
  const out = {};
  const put = (key, m) => { if (m) out[key] = m; };
  out.games = { value: records.length, info: true };
  out.unfinished = { value: records.length - done.length, info: true };
  if (!done.length) return out;
  const size = done[0].teamSize;
  const two = (a) => a[0] + a[1];

  put('turns', mean(done.map((r) => r.turns)));
  out.longest = { value: Math.max(...done.map((r) => r.turns)), info: true };
  put('firstPlayer', share(done.filter((r) => r.winner === r.first).length, done.length));
  if (done[0].loserAscended !== undefined) {
    put('lopsided', share(done.filter((r) => r.loserAscended <= 1).length, done.length));
  }
  const half = done.filter((r) => r.leaderAtHalfWon !== null && r.leaderAtHalfWon !== undefined);
  put('comebacks', share(half.filter((r) => !r.leaderAtHalfWon).length, half.length));
  put('leadChanges', mean(done.map((r) => r.leadChanges)));
  put('homeTrips', mean(done.map((r) => (two(r.captured) + two(r.powerKills ?? [0, 0])) / (2 * size))));
  const cmd = done.map((r) => r.commanderOut.filter((t) => t !== null)).filter((a) => a.length);
  put('commanderFirstMove', mean(cmd.map((a) => sumOf(a) / a.length)));
  put('deadTurns', ratio(done.map((r) => two(r.wasted)), done.map((r) => r.turns)));

  if (done.every((r) => r.choiceTurns)) {
    const tot = done.map((r) => ['none', 'one', 'real'].reduce((s, k) => s + two(r.choiceTurns[k]), 0));
    for (const [key, k] of [['noChoice', 'none'], ['oneChoice', 'one'], ['realChoice', 'real']]) {
      put(key, ratio(done.map((r) => two(r.choiceTurns[k])), tot));
    }
  }

  for (const id of cardsOf(setting, done)) {
    if (!done[0].powers?.[id]) continue;
    const of = (f) => done.map((r) => f(r.powers[id]));
    put(`held:${id}`, ratio(of((x) => x.heldTurns ?? 0), done.map((r) => r.turns)));
    put(`used:${id}`, mean(of((x) => x.used)));
    put(`discarded:${id}`, mean(of((x) => x.discarded ?? 0)));
    put(`discardShare:${id}`, ratio(of((x) => x.discarded ?? 0), of((x) => (x.discarded ?? 0) + x.used)));
  }
  return out;
}

/** Adds `vsReference` to each setting that names a reference setting. */
export function addReferences(results, settings) {
  for (const s of settings) {
    if (!s.reference || !results[s.id] || !results[s.reference]) continue;
    put(results[s.id], 'vsReference', relChange(results[s.id].turns, results[s.reference].turns));
  }
  return results;
  function put(m, key, v) { if (v) m[key] = v; }
}

// ---- comparison ------------------------------------------------------------

const baseKey = (key) => key.split(':')[0];

/**
 * Differences between two runs' measurements ({ [settingId]: measurements }).
 * Returns rows { setting, key, group, base, now, diff, z, status }, status one
 * of 'meaningful', 'real', 'same' (within noise) or 'info'. A metric's
 * `group` may be a function of the plan setting; null leaves the row out.
 */
export function compare(base, now, metrics, settings = []) {
  const byId = Object.fromEntries(settings.map((s) => [s.id, s]));
  const rows = [];
  for (const [setting, cur] of Object.entries(now)) {
    const old = base[setting];
    if (!old) continue;
    for (const [key, m] of Object.entries(cur)) {
      const spec = metrics[baseKey(key)];
      const b = old[key];
      if (!spec || !b) continue;
      const group = typeof spec.group === 'function' ? spec.group(byId[setting] ?? { id: setting }) : (spec.group ?? '');
      if (group === null) continue;
      const diff = m.value - b.value;
      if (spec.info || m.info || b.info) {
        rows.push({ setting, key, group, base: b.value, now: m.value, diff, z: null, status: 'info' });
        continue;
      }
      const se = Math.sqrt(m.se ** 2 + b.se ** 2);
      const z = se ? diff / se : (diff ? Infinity : 0);
      const margin = spec.relative ? spec.margin * Math.abs(b.value) : spec.margin;
      const status = Math.abs(z) < Z ? 'same' : Math.abs(diff) >= margin ? 'meaningful' : 'real';
      rows.push({ setting, key, group, base: b.value, now: m.value, diff, z, status });
    }
  }
  return rows;
}

// ---- runner ----------------------------------------------------------------

function chunkSize(bot) {
  return bot.kind === 'power' && !bot.level?.endsWith('-v1') ? 2 : 50;
}

function commit() {
  try {
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const sha = execFileSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['-C', root, 'status', '--porcelain', '--', 'src', 'sim'], { encoding: 'utf8' }).trim();
    return dirty ? `${sha}+changes` : sha;
  } catch {
    return null;
  }
}

/** Plays every setting of `plan` for `games` seeds; returns the run's JSON. */
export async function runPlan(plan, { games, log = () => {} }) {
  const started = Date.now();
  const prefix = plan.prefixGames && plan.prefixGames < games ? plan.prefixGames : null;
  const results = {};
  const prefixResults = {};
  for (const s of plan.settings) {
    const t0 = Date.now();
    const config = makeConfig(s.config);
    const jobs = chunk(seedRange(1, games), chunkSize(s.bot)).map((seeds) => ({
      type: 'games', config, bots: [s.bot, s.bot], seeds, maxTurns: 5000, measureChoices: Boolean(s.measureChoices),
    }));
    const records = (await runJobs(jobs)).flat();
    results[s.id] = measure(records, s);
    if (prefix) prefixResults[s.id] = measure(records.filter((r) => r.seed <= prefix), s);
    log(`${s.id.padEnd(24)} ${((Date.now() - t0) / 1000).toFixed(0)}s  (team ${teamSize(config)})`);
  }
  addReferences(results, plan.settings);
  if (prefix) addReferences(prefixResults, plan.settings);
  return {
    generated: new Date().toISOString(),
    commit: commit(),
    rulesVersion: RULES_VERSION,
    games,
    seconds: Math.round((Date.now() - started) / 1000),
    settings: plan.settings.map((s) => s.id),
    results,
    ...(prefix ? { prefix: { games: prefix, results: prefixResults } } : {}),
  };
}

/** The baseline measurements to compare a run of `games` with. */
export function baselineFor(baseline, games) {
  if (baseline.games === games) return { games, results: baseline.results };
  if (baseline.prefix?.games === games) return baseline.prefix;
  return { games: baseline.games, results: baseline.results };
}

// ---- report ----------------------------------------------------------------

function fmt(spec, key, v) {
  if (v === null || v === undefined) return '–';
  const f = spec?.format;
  if (f === 'pct') return `${(100 * v).toFixed(1)}%`;
  if (f === 'signedPct') return `${v >= 0 ? '+' : ''}${(100 * v).toFixed(1)}%`;
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
}

function fmtDiff(spec, d) {
  const f = spec?.format;
  if (f === 'pct' || f === 'signedPct') return `${d >= 0 ? '+' : ''}${(100 * d).toFixed(1)} pts`;
  if (Number.isInteger(d)) return `${d >= 0 ? '+' : ''}${d}`;
  return `${d >= 0 ? '+' : ''}${Math.abs(d) >= 10 ? d.toFixed(1) : d.toFixed(2)}`;
}

/**
 * Table of one run's values for the metrics of `group`: a row per setting.
 * Per-card keys collapse to the metric name when a setting has one card.
 */
export function snapshot(results, plan, group) {
  const keys = Object.keys(plan.metrics).filter((k) => !plan.metrics[k].info);
  const cells = plan.settings.map((s) => {
    const values = {};
    for (const [key, v] of Object.entries(results[s.id] ?? {})) {
      const spec = plan.metrics[baseKey(key)];
      if (!spec || spec.info) continue;
      const g = typeof spec.group === 'function' ? spec.group(s) : (spec.group ?? '');
      if (g === group) (values[baseKey(key)] ??= []).push(v.value);
    }
    const row = Object.fromEntries(Object.entries(values).filter(([, v]) => v.length === 1).map(([k, v]) => [k, v[0]]));
    return { s, row };
  });
  const cols = keys.filter((k) => cells.some(({ row }) => row[k] !== undefined && row[k] !== null));
  if (!cols.length) return '';
  const head = `| Setting | ${cols.map((k) => plan.metrics[k].label).join(' | ')} |\n|---|${cols.map(() => '---:').join('|')}|`;
  const body = cells.map(({ s, row }) => `| ${s.label ?? s.id} | ${cols.map((k) => fmt(plan.metrics[k], k, row[k])).join(' | ')} |`);
  return [head, ...body].join('\n');
}

/** Markdown report of a comparison (`base` null: no baseline, values only). */
export function report(rows, { plan, run, base }) {
  const label = (key) => {
    const [k, card] = key.split(':');
    const l = plan.metrics[k]?.label ?? k;
    return card ? `${l} (${plan.cardLabels?.[card] ?? card})` : l;
  };
  const settingLabel = Object.fromEntries(plan.settings.map((s) => [s.id, s.label ?? s.id]));
  const order = Object.keys(plan.metrics);
  const groups = plan.groups ?? [...new Set(rows.map((r) => r.group))];
  const byOrder = (a, b) => order.indexOf(baseKey(a.key)) - order.indexOf(baseKey(b.key))
    || plan.settings.findIndex((s) => s.id === a.setting) - plan.settings.findIndex((s) => s.id === b.setting);
  const line = (r) => {
    const spec = plan.metrics[baseKey(r.key)];
    const pct = !spec.format && r.base ? ` (${r.diff >= 0 ? '+' : ''}${((100 * r.diff) / r.base).toFixed(0)}%)` : '';
    return `| ${settingLabel[r.setting]} | ${label(r.key)} | ${fmt(spec, r.key, r.base)} | ${fmt(spec, r.key, r.now)} | ${fmtDiff(spec, r.diff)}${pct} |`;
  };
  const head = '| Setting | Measure | Before | Now | Change |\n|---|---|---:|---:|---:|';
  const count = (g) => rows.filter((r) => r.group === g && r.status === 'meaningful').length;
  const out = [
    `# Health check, ${run.games} games per setting`,
    '',
    `Now: ${run.generated.slice(0, 10)}, code ${run.commit ?? '?'}, rules ${run.rulesVersion}.`,
  ];
  if (base) {
    out.push(`Before: ${base.generated?.slice(0, 10) ?? '?'}, code ${base.commit ?? '?'}, rules ${base.rulesVersion ?? '?'}; compared on ${base.compareGames} games per setting${base.compareGames === run.games ? ' (same seeds)' : ''}.`);
    out.push('', `Meaningful changes: ${groups.map((g) => `${g || 'measures'} ${count(g)}`).join(', ')}.`, '');
    for (const g of groups) {
      const mine = rows.filter((r) => r.group === g).sort(byOrder);
      const meaningful = mine.filter((r) => r.status === 'meaningful');
      const real = mine.filter((r) => r.status === 'real');
      const changedInfo = mine.filter((r) => r.status === 'info' && r.diff !== 0);
      out.push(`## ${g || 'Measures'}`, '');
      if (meaningful.length) out.push('**Meaningful changes**', '', head, ...meaningful.map(line), '');
      else out.push('No meaningful change.', '');
      if (real.length) out.push('Beyond noise but below the margin:', '', head, ...real.map(line), '');
      if (changedInfo.length) out.push('For information:', '', head, ...changedInfo.map(line), '');
    }
  } else {
    out.push('No baseline to compare with.', '');
  }
  for (const g of plan.snapshotGroups ?? []) {
    const t = snapshot(run.results, plan, g);
    if (t) out.push(`## ${g}: values now`, '', t, '');
  }
  return out.join('\n');
}

// ---- CLI -------------------------------------------------------------------

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  const [planPath, outPath] = process.argv.slice(2);
  if (!planPath || !outPath) {
    console.error('usage: node sim/health.js <plan.mjs> <out.json> [--games N | --quick] [--baseline <file>] [--report <file.md>]');
    process.exit(1);
  }
  const plan = await import(pathToFileURL(resolve(planPath)).href);
  const quick = process.argv.includes('--quick');
  const games = Number(arg('games', (quick ? plan.quickGames : plan.fullGames) ?? 1000));
  const run = await runPlan(plan, { games, log: (m) => console.log(m) });
  writeFileSync(outPath, JSON.stringify(run, null, 1));
  console.log(`wrote ${outPath} (${run.seconds}s)`);

  const basePath = arg('baseline', null);
  const baseline = basePath ? JSON.parse(readFileSync(basePath, 'utf8')) : null;
  const against = baseline ? baselineFor(baseline, games) : null;
  const rows = against ? compare(against.results, run.results, plan.metrics, plan.settings) : [];
  const text = report(rows, { plan, run, base: baseline && { ...baseline, compareGames: against.games } });
  const reportPath = arg('report', null);
  if (reportPath) writeFileSync(reportPath, text);
  console.log(`\n${text}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
