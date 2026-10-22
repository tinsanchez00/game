import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/rules/index.js';
import { apply, buildFast, cardModeOf, discardCounts, genMoves, undo } from '../sim/fast.js';
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

// The powers-off search bot (sim/bot.js) doesn't model campsites, so its
// settings leave them out; the power bot plays the full rules.
const noCamp = (c = {}) => ({ ...c, board: { campsites: [], ...(c.board ?? {}) } });

const CONFIGS = [
  { powers: false },
  { powers: false, maxPerCell: 1, commanders: 0, soldiers: 7 },
  { powers: false, maxPerCell: 3, commanders: 2, soldiers: 3 },
  { powers: false, rules: { exactAscend: false, towersProtect: false, escort: false } },
  { powers: false, rules: { towerExtraTurn: true, commanderLock: false } },
  { powers: false, moveDeck: [1, 2, 5, 6, R.JOKER], board: { startLane: 3, middleLane: 10, endLane: 3, towers: [3, 9, 16] } },
].map(noCamp);

/** A random reachable-looking position: units scattered, stack limits kept. */
function randomPosition(config, random) {
  let s = R.createGame({ seed: Math.floor(random() * 1e9), config, firstPlayer: random() < 0.5 ? 0 : 1 });
  // Play random legal moves through the engine to reach a valid position.
  const steps = Math.floor(random() * 60);
  const bot = randomBot(random);
  for (let i = 0; i < steps && s.winner === null; i += 1) {
    if (s.drawn === null) s = R.drawCard(s); // a campsite card is already drawn
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
  const a = playGame({ config: noCamp({ powers: false }), seed: 7, bots: [searchBot(), searchBot()] });
  const b = playGame({ config: noCamp({ powers: false }), seed: 7, bots: [searchBot(), searchBot()] });
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
    if (playGame({ config: noCamp({ powers: false }), seed, bots }).winner === me) wins += 1;
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
    const s0 = randomPosition(noCamp({ powers: false }), random);
    if (s0.winner !== null) continue;
    const s = { ...s0, hanged: { stage: 'back', unit: null } };
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
        assert.equal(after.current, s.current, 'the forward card follows');
        undo(fs, rec);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 300);
});

test('fast moves limited to one unit, and backward, match the engine (campsites on)', () => {
  const random = rng(654);
  let checked = 0;
  for (let n = 0; n < 300; n += 1) {
    const s0 = randomPosition({ powers: false }, random);
    if (s0.winner !== null || s0.drawn !== null) continue;
    const mine = s0.units.filter((u) => u.player === s0.current);
    const unit = mine[Math.floor(random() * mine.length)].id;
    const states = [
      { ...s0, campsite: { unit } },
      { ...s0, hanged: { stage: 'forward', unit } },
      { ...s0, hanged: { stage: 'forward', unit: null } },
      { ...s0, hanged: { stage: 'back', unit: null } },
    ];
    for (const s of states) {
      const fs = buildFast(s);
      const { back, only } = cardModeOf(fs, s);
      for (const d of fs.values) {
        const engine = new Set(R.legalMoves(s, s.current, d).map((m) => key(s, m)));
        const fast = new Set(genMoves(fs, s.current, d, back, only).map(([u, e]) =>
          key(s, e >= 0 ? { unit: fs.ids[u], escort: fs.ids[e] } : { unit: fs.ids[u] })));
        assert.deepEqual([...fast].sort(), [...engine].sort());
        checked += 1;
      }
    }
  }
  assert.ok(checked > 1000, `checked ${checked}`);
});

test("the fast discard pile matches the engine's", () => {
  const random = rng(987);
  for (let n = 0; n < 200; n += 1) {
    const s = randomPosition({ powers: false }, random);
    const fs = buildFast(s);
    for (const p of [0, 1]) {
      const { counts, total } = discardCounts(fs, p);
      const pile = s.moveDecks[p].discard;
      const want = pile.length ? pile : s.config.moveDeck;
      assert.equal(total, want.length);
      for (let k = 0; k <= fs.J; k += 1) {
        const card = k === fs.J ? R.JOKER : fs.values[k];
        assert.equal(counts[k], want.filter((c) => c === card).length);
      }
    }
  }
});

test('power bots play full games at every level and timing, using every power and the campsite', () => {
  const used = new Set();
  let campsiteCards = 0;
  for (const level of ['strong', 'average', 'strong-v1', 'average-v1']) {
    for (const powerTiming of ['afterDraw', 'beforeDraw']) {
      const seeds = level.endsWith('v1') ? [1, 2, 3] : [1];
      for (const seed of seeds) {
        const r = playGame({
          config: { powerTiming, soldiers: 4 },
          seed,
          bots: [powerBot({ level, random: rng(seed) }), powerBot({ level, random: rng(seed + 9) })],
        });
        assert.ok(r.finished, `${level} ${powerTiming} ${seed}`);
        for (const [id, st] of Object.entries(r.powers)) if (st.used) used.add(id);
        campsiteCards += r.campsiteCards[0] + r.campsiteCards[1];
        assert.equal(r.loserAscended + r.loserLeft, 5);
      }
    }
  }
  assert.deepEqual([...used].sort(), [...R.POWER_IDS].sort());
  assert.ok(campsiteCards > 0);
});

test('the mixed look-ahead draws one depth per turn, at the level odds', () => {
  for (const [level, share] of [['average', 0.65], ['strong', 0.8]]) {
    const bot = powerBot({ level, random: rng(level.length) });
    const perTurn = [];
    for (let seed = 1; seed <= 400 && perTurn.length < 400; seed += 1) {
      // One decision per position is enough to sample turn starts; a
      // campsite card on top must reuse the same depth.
      const s0 = R.createGame({ seed, firstPlayer: 0, config: { powers: false } });
      let s = R.drawCard({ ...s0, units: s0.units.map((u) => (u.id === 'p0-s1' ? { ...u, pos: 3 } : u)),
        moveDecks: [{ draw: [2], discard: [] }, { draw: [1], discard: [] }] });
      bot.act(s);
      const first = bot.lastDepth;
      s = R.playDrawnNumber(s, { unit: 'p0-s1' }); // lands on the campsite
      assert.ok(s.campsite);
      bot.act(s);
      assert.equal(bot.lastDepth, first, 'same turn, same depth');
      perTurn.push(first);
    }
    const deep = perTurn.filter((d) => d === 3).length / perTurn.length;
    assert.ok(perTurn.every((d) => d === 2 || d === 3));
    assert.ok(Math.abs(deep - share) < 0.08, `${level}: ${deep}`);
  }
});

test('the position cache never changes a decision', () => {
  for (const [level, config] of [['strong', { soldiers: 4 }], ['average', { soldiers: 3, powerDeck: Array(5).fill('hanged-man') }]]) {
    for (const seed of [1, 2]) {
      const play = (cache) => playGame({
        config, seed, bots: [powerBot({ level, cache, random: rng(seed) }), powerBot({ level, cache, random: rng(seed + 5) })],
      });
      const bots = [powerBot({ level, cache: true, random: rng(seed) }), powerBot({ level, cache: true, random: rng(seed + 5) })];
      const withCache = playGame({ config, seed, bots });
      assert.deepEqual(withCache, play(false), `${level} ${seed}`);
      assert.ok(bots[0].stats.hits + bots[1].stats.hits > 0, 'the cache was used');
    }
  }
});

test('the strong power bot beats the average one (first-batch levels)', () => {
  let wins = 0;
  const games = 40;
  for (let seed = 1; seed <= games; seed += 1) {
    const me = seed % 2;
    const bots = [];
    bots[me] = powerBot({ level: 'strong-v1' });
    bots[1 - me] = powerBot({ level: 'average-v1', random: rng(seed) });
    if (playGame({ config: { soldiers: 4 }, seed, bots }).winner === me) wins += 1;
  }
  assert.ok(wins >= 24, `won ${wins}/${games}`);
});

test('power games are reproducible from the seed', () => {
  const run = () => playGame({ config: { soldiers: 4 }, seed: 11, bots: [powerBot({ level: 'average-v1', random: rng(5) }), powerBot({ level: 'strong-v1' })] });
  assert.deepEqual(run(), run());
});

test('the powers-off search bot refuses campsites', () => {
  const bots = [searchBot(), searchBot()];
  assert.throws(() => playGame({ config: { powers: false }, seed: 1, bots }), /campsites/);
});

test('two identical draft cards are offered as one choice', () => {
  const base = R.createGame({ seed: 2, firstPlayer: 0, config: { powerDeck: ['dud', 'dud', 'devil'] } });
  const s = R.drawCard({ ...base, moveDecks: [{ draw: [R.JOKER], discard: [] }, { draw: [1], discard: [] }], powerDeck: ['dud', 'dud', 'devil'] });
  const bot = powerBot({ level: 'average', random: rng(1) });
  const a = bot.act(s);
  assert.equal(a.kind, 'draft');
  assert.equal(bot.lastChoice.options, 1);
});

test('turn choices are recorded only when asked, one class per bot turn', () => {
  const bots = () => [powerBot({ level: 'average', random: rng(4) }), powerBot({ level: 'average', random: rng(5) })];
  const off = playGame({ config: { soldiers: 2 }, seed: 3, bots: bots() });
  assert.equal(off.choiceTurns, null);
  const on = playGame({ config: { soldiers: 2 }, seed: 3, bots: bots(), measureChoices: true });
  const n = (k) => on.choiceTurns[k][0] + on.choiceTurns[k][1];
  assert.equal(n('none') + n('one') + n('real'), on.turns);
  assert.equal(on.turns, off.turns, 'measuring changes nothing in the game');
});
