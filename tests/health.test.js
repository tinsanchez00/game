import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addReferences, baselineFor, compare, mean, measure, ratio, report, share, snapshot } from '../sim/health.js';
import { runJob } from '../sim/worker.js';
import { makeConfig } from '../src/rules/index.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('estimators: mean, share and ratio with standard errors', () => {
  const m = mean([1, 2, 3, 4]);
  close(m.value, 2.5);
  close(m.se, Math.sqrt(5 / 3) / 2);
  const s = share(25, 100);
  close(s.value, 0.25);
  close(s.se, Math.sqrt(0.25 * 0.75 / 100));
  const r = ratio([1, 2, 3], [2, 4, 6]);
  close(r.value, 0.5);
  close(r.se, 0); // exact proportion in every game
  assert.equal(ratio([], []), null);
});

const BOT = { kind: 'power', level: 'average' };
const SETTING = {
  id: 'x', power: 'devil', reference: 'off', measureChoices: true,
  config: { soldiers: 2, powerDeck: ['devil', 'devil', 'dud'] },
};

function records(setting, seeds) {
  const config = makeConfig(setting.config);
  return runJob({ type: 'games', config, bots: [BOT, BOT], seeds, maxTurns: 5000, measureChoices: Boolean(setting.measureChoices) });
}

test('measure: one setting of real games', () => {
  const recs = records(SETTING, [1, 2, 3, 4]);
  const m = measure(recs, SETTING);
  assert.equal(m.games.value, 4);
  assert.equal(m.unfinished.value, 0);
  close(m.turns.value, recs.reduce((a, r) => a + r.turns, 0) / 4);
  assert.equal(m.longest.value, Math.max(...recs.map((r) => r.turns)));
  for (const k of ['firstPlayer', 'lopsided', 'leadChanges', 'homeTrips', 'deadTurns', 'noChoice', 'oneChoice', 'realChoice']) {
    assert.ok(m[k] && Number.isFinite(m[k].value) && Number.isFinite(m[k].se), k);
  }
  close(m.noChoice.value + m.oneChoice.value + m.realChoice.value, 1);
  assert.ok(m['held:devil'] && m['used:devil'] && m['discarded:devil']);
  assert.equal(m['held:dud'], undefined);
  assert.equal(Object.keys(m).some((k) => k.startsWith('held:') && k !== 'held:devil'), false);
});

test('measure: powers off has no card metrics, choices only when measured', () => {
  const off = { id: 'off', config: { soldiers: 2, powers: false } };
  const m = measure(records(off, [1, 2]), off);
  assert.equal(Object.keys(m).some((k) => k.includes(':')), false);
  assert.equal(m.noChoice, undefined);
});

test('addReferences: relative game length against the reference setting', () => {
  const res = { off: { turns: { value: 100, se: 2 } }, x: { turns: { value: 125, se: 3 } } };
  addReferences(res, [{ id: 'off' }, { id: 'x', reference: 'off' }]);
  close(res.x.vsReference.value, 0.25);
  assert.ok(res.x.vsReference.se > 0);
  assert.equal(res.off.vsReference, undefined);
});

test('compare: same, real and meaningful changes; info rows; groups', () => {
  const metrics = {
    turns: { margin: 0.05, relative: true, group: 'A' },
    lopsided: { margin: 0.02, group: (s) => (s.id === 'skip' ? null : 'B') },
    longest: { info: true, group: 'B' },
  };
  const base = {
    x: { turns: { value: 100, se: 1 }, lopsided: { value: 0.1, se: 0.002 }, longest: { value: 300, info: true } },
    skip: { lopsided: { value: 0.1, se: 0.01 } },
  };
  const now = {
    x: { turns: { value: 104, se: 0.5 }, lopsided: { value: 0.13, se: 0.002 }, longest: { value: 320, info: true } },
    skip: { lopsided: { value: 0.5, se: 0.01 } },
  };
  const rows = compare(base, now, metrics, [{ id: 'x' }, { id: 'skip' }]);
  const by = Object.fromEntries(rows.map((r) => [`${r.setting}.${r.key}`, r]));
  assert.equal(by['x.turns'].status, 'real'); // 3.6 SE, below the 5% margin
  assert.equal(by['x.lopsided'].status, 'meaningful');
  assert.equal(by['x.lopsided'].group, 'B');
  assert.equal(by['x.longest'].status, 'info');
  assert.equal(by['skip.lopsided'], undefined);
  // identical runs: nothing changes
  const same = compare(base, base, metrics, [{ id: 'x' }]);
  assert.ok(same.every((r) => r.status === 'same' || (r.status === 'info' && r.diff === 0)));
});

test('baselineFor: a short run uses the baseline prefix on the same seeds', () => {
  const b = { games: 1000, results: { a: 1 }, prefix: { games: 200, results: { a: 2 } } };
  assert.deepEqual(baselineFor(b, 1000), { games: 1000, results: { a: 1 } });
  assert.deepEqual(baselineFor(b, 200), { games: 200, results: { a: 2 } });
  assert.deepEqual(baselineFor(b, 50), { games: 1000, results: { a: 1 } });
});

test('report and snapshot render tables', () => {
  const plan = {
    settings: [{ id: 'x', label: 'X' }],
    metrics: { turns: { label: 'Turns', margin: 0.01, relative: true, group: 'G' } },
    groups: ['G'],
    snapshotGroups: ['G'],
  };
  const run = { games: 10, generated: '2026-01-02T00:00:00Z', commit: 'abc', rulesVersion: '0', results: { x: { turns: { value: 120, se: 1 } } } };
  const rows = compare({ x: { turns: { value: 100, se: 1 } } }, run.results, plan.metrics, plan.settings);
  const text = report(rows, { plan, run, base: { generated: '2026-01-01T00:00:00Z', commit: 'def', rulesVersion: '0', compareGames: 10 } });
  assert.match(text, /Meaningful changes: G 1/);
  assert.match(text, /\| X \| Turns \| 100 \| 120 \| \+20 \(\+20%\) \|/);
  assert.match(snapshot(run.results, plan, 'G'), /\| X \| 120 \|/);
  assert.match(report([], { plan, run, base: null }), /No baseline/);
});
