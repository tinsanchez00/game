import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/rules/index.js';
import { apply, buildFast, genMoves, undo } from '../sim/fast.js';
import { applyPower, powerTargets, undoPower } from '../sim/fastpowers.js';
import { powerBot } from '../sim/powerbot.js';
import { greedyBot, randomBot, searchBot } from '../sim/bot.js';
import { playGame } from '../sim/game.js';

function rng(seed) {
  let s = seed;
  return () => {
    const r = R.nextRandom(s);
    s = r.rng;
    return r.value;
  };
}

const CONFIGS = [
  { powers: false },
  { powers: false, maxPerCell: 1, commanders: 0, soldiers: 7 },
  { powers: false, maxPerCell: 3, commanders: 2, soldiers: 3 },
  { powers: false, rules: { exactAscend: false, towersProtect: false, escort: false } },
  { powers: false, rules: { towerExtraTurn: true, commanderLock: false } },
  { powers: false, moveDeck: [1, 2, 5, 6, R.JOKER], board: { startLane: 3, middleLane: 10, endLane: 3, towers: [3, 9, 16] } },
];

/** A random reachable-looking position: units scattered, stack limits kept. */
function randomPosition(config, random) {
  let s = R.createGame({ seed: Math.floor(random() * 1e9), config, firstPlayer: random() < 0.5 ? 0 : 1 });
  // Play random legal moves through the engine to reach a valid position.
  const steps = Math.floor(random() * 60);
  const bot = randomBot(random);
  for (let i = 0; i < steps && s.winner === null; i += 1) {
    s = R.drawCard(s);
    if (!R.isNumberCard(s.drawn)) s = R.passJoker(s);
    else if (R.currentMoves(s).length === 0) s = R.playDrawnNumber(s, null);
    else s = R.playDrawnNumber(s, bot.choose(s));
  }
  return s;
}

const key = (s, m) => {
  const u = R.getUnit(s, m.unit);
  return `${u.pos}:${u.type}:${m.escort ? 1 : 0}`;
};

test('fast move generation matches the engine on random positions', () => {
  const random = rng(123);
  let checked = 0;
  for (const config of CONFIGS) {
    for (let n = 0; n < 150; n += 1) {
      const s = randomPosition(config, random);
      if (s.winner !== null) continue;
      const fs = buildFast(s);
      for (const d of fs.values) {
        const engine = new Set(R.legalMoves(s, s.current, d).map((m) => key(s, m)));
        const fast = new Set(genMoves(fs, s.current, d).map(([u, e]) =>
          key(s, e >= 0 ? { unit: fs.ids[u], escort: fs.ids[e] } : { unit: fs.ids[u] })));
        assert.deepEqual([...fast].sort(), [...engine].sort(), JSON.stringify({ config, d }));
        checked += 1;
      }
    }
  }
  assert.ok(checked > 1000);
});

test('fast moves produce the same position as the engine, and undo restores it', () => {
  const random = rng(456);
  for (const config of CONFIGS) {
    for (let n = 0; n < 100; n += 1) {
      const s = randomPosition(config, random);
      if (s.winner !== null) continue;
      const fs = buildFast(s);
      const snapshot = JSON.stringify([...fs.pos, ...fs.occ[0], ...fs.occ[1], ...fs.soldiersHome, ...fs.remaining, fs.current]);
      for (const d of fs.values) {
        for (const [u, e] of genMoves(fs, s.current, d)) {
          const move = e >= 0 ? { unit: fs.ids[u], escort: fs.ids[e] } : { unit: fs.ids[u] };
          const after = R.applyMove(s, move, d);
          const rec = apply(fs, u, e, d);
          assert.deepEqual([...fs.pos], after.units.map((x) => x.pos));
          assert.equal(rec.won, after.winner === s.current);
          if (!rec.won) assert.equal(fs.current, after.current);
          undo(fs, rec);
          const now = JSON.stringify([...fs.pos, ...fs.occ[0], ...fs.occ[1], ...fs.soldiersHome, ...fs.remaining, fs.current]);
          assert.equal(now, snapshot);
        }
      }
    }
  }
});

test('bots finish games under every test setting', () => {
  for (const config of CONFIGS) {
    for (const seed of [1, 2]) {
      const r = playGame({ config, seed, bots: [searchBot(), greedyBot()] });
      assert.ok(r.finished, JSON.stringify(config));
      assert.ok(r.turns > 0 && r.loserLeft >= 1);
    }
  }
});

test('games are reproducible from the seed', () => {
  const a = playGame({ config: { powers: false }, seed: 7, bots: [searchBot(), searchBot()] });
  const b = playGame({ config: { powers: false }, seed: 7, bots: [searchBot(), searchBot()] });
  assert.deepEqual(a, b);
});

test('the search bot beats a random bot', () => {
  let wins = 0;
  const games = 40;
  for (let seed = 1; seed <= games; seed += 1) {
    const me = seed % 2;
    const bots = [];
    bots[me] = searchBot();
    bots[1 - me] = randomBot(rng(seed));
    if (playGame({ config: { powers: false }, seed, bots }).winner === me) wins += 1;
  }
  assert.ok(wins >= 34, `won ${wins}/${games}`);
});

// --- powers -----------------------------------------------------------------

const POWER_CONFIGS = [
  {},
  { powerTiming: 'beforeDraw' },
  { soldiers: 4, rules: { towersProtect: false } },
  { maxPerCell: 3, commanders: 2, soldiers: 3 },
];

const targetKey = (s, args) => JSON.stringify(Object.keys(args).sort().map((k) => {
  const u = R.getUnit(s, args[k]);
  return [k, u.pos, u.type];
}));

test('fast power targets and effects match the engine on random positions', () => {
  const random = rng(789);
  let checked = 0;
  for (const config of POWER_CONFIGS) {
    for (let n = 0; n < 120; n += 1) {
      const s0 = randomPosition({ ...config, powers: false }, random);
      if (s0.winner !== null) continue;
      const s = { ...s0, config: R.makeConfig({ ...config, powers: true }) };
      for (const id of R.POWER_IDS) {
        const fs = buildFast(s);
        const k = R.POWER_IDS.indexOf(id);
        fs.held[s.current] = k;
        const engineChoices = R.powerChoices(s, s.current, id);
        const fastTargets = powerTargets(fs, s.current, k);
        const toArgs = (t) => (t.length === 2 ? { unit: fs.ids[t[0]], target: fs.ids[t[1]] }
          : t.length === 1 ? { unit: fs.ids[t[0]] } : {});
        const want = new Set((engineChoices.length ? engineChoices : [{}]).map((c) => targetKey(s, c)));
        const got = new Set(fastTargets.map((t) => targetKey(s, toArgs(t))));
        assert.deepEqual([...got].sort(), [...want].sort(), `${id} targets`);
        for (const t of fastTargets) {
          const before = [...fs.pos];
          const after = R.applyPower(s, s.current, id, toArgs(t));
          const rec = applyPower(fs, s.current, k, t);
          assert.deepEqual([...fs.pos], after.units.map((u) => u.pos), `${id} effect`);
          undoPower(fs, rec);
          assert.deepEqual([...fs.pos], before);
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked > 1000, `checked ${checked}`);
});

test('fast backward moves match the engine', () => {
  const random = rng(321);
  let checked = 0;
  for (let n = 0; n < 300; n += 1) {
    const s0 = randomPosition({ powers: false }, random);
    if (s0.winner !== null) continue;
    const s = { ...s0, hangedDraw: true };
    const fs = buildFast(s);
    for (const d of fs.values) {
      const engine = new Set(R.legalMoves(s, s.current, d).map((m) => key(s, m)));
      const fast = genMoves(fs, s.current, d, true);
      assert.deepEqual(new Set(fast.map(([u, e]) => key(s, e >= 0 ? { unit: fs.ids[u], escort: fs.ids[e] } : { unit: fs.ids[u] }))), engine);
      for (const [u, e] of fast) {
        const move = e >= 0 ? { unit: fs.ids[u], escort: fs.ids[e] } : { unit: fs.ids[u] };
        const after = R.applyMove(s, move, d);
        const rec = apply(fs, u, e, d, true);
        assert.deepEqual([...fs.pos], after.units.map((x) => x.pos));
        assert.equal(fs.current, after.current);
        undo(fs, rec);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 300);
});

test('power bots finish games at both levels and both timings, using every power', () => {
  const used = new Set();
  for (const level of ['strong', 'average']) {
    for (const powerTiming of ['afterDraw', 'beforeDraw']) {
      for (const seed of [1, 2, 3]) {
        const r = playGame({
          config: { powerTiming, soldiers: 4 },
          seed,
          bots: [powerBot({ level, random: rng(seed) }), powerBot({ level, random: rng(seed + 9) })],
        });
        assert.ok(r.finished, `${level} ${powerTiming} ${seed}`);
        for (const [id, st] of Object.entries(r.powers)) if (st.used) used.add(id);
        assert.equal(r.loserAscended + r.loserLeft, 5);
      }
    }
  }
  assert.equal(used.size, R.POWER_IDS.length, [...used].join());
});

test('the strong power bot beats the average one', () => {
  let wins = 0;
  const games = 40;
  for (let seed = 1; seed <= games; seed += 1) {
    const me = seed % 2;
    const bots = [];
    bots[me] = powerBot({ level: 'strong' });
    bots[1 - me] = powerBot({ level: 'average', random: rng(seed) });
    if (playGame({ config: { soldiers: 4 }, seed, bots }).winner === me) wins += 1;
  }
  assert.ok(wins >= 24, `won ${wins}/${games}`);
});

test('power games are reproducible from the seed', () => {
  const run = () => playGame({ config: {}, seed: 11, bots: [powerBot({ level: 'average', random: rng(5) }), powerBot({ level: 'strong' })] });
  assert.deepEqual(run(), run());
});
