import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/rules/index.js';

// 3-4 players: a ring of 15 / 16 shared cells; each path is 2 start, 8 shared,
// 2 end cells (12), ascending on step 13; campsite on path cell 4, towers on
// path cells 6 and 12; teams of 5 (4 soldiers + 1 commander).

const game = (players, { firstPlayer = 0, positions = {}, ...overrides } = {}) => {
  const base = R.createGame({ seed: 3, firstPlayer, config: { players } });
  return {
    ...base,
    ...overrides,
    units: base.units.map((u) => (u.id in positions ? { ...u, pos: positions[u.id] } : u)),
  };
};

test('multiplayer defaults: ring board, short paths, teams of 5', () => {
  for (const [n, ring] of [[3, 15], [4, 16]]) {
    const c = R.makeConfig({ players: n });
    assert.equal(c.players, n);
    assert.equal(c.board.ring, ring);
    assert.deepEqual([c.board.startLane, c.board.middleLane, c.board.endLane], [2, 8, 2]);
    assert.deepEqual([...c.board.towers], [6, 12]);
    assert.deepEqual([...c.board.campsites], [4]);
    assert.equal(R.teamSize(c), 5);
  }
  // Two players keep the current board.
  assert.equal(R.makeConfig().board.ring, 0);
  assert.throws(() => R.makeConfig({ players: 5 }), /players/);
  assert.throws(() => R.makeConfig({ players: 3, board: { ring: 16 } }), /evenly/);
  assert.throws(() => R.makeConfig({ board: { ring: 9 } }), /only for 3 or 4/);
});

test('ring geometry: each player enters at their own gate and shares the ring with the others', () => {
  const g = R.geometry(R.makeConfig({ players: 4 }));
  assert.equal(g.cellCount, 4 * 4 + 16);
  assert.deepEqual([0, 1, 2, 3].map((p) => g.gate(p)), [0, 4, 8, 12]);
  // Player 0's 5th shared cell (path 7) is player 1's 1st (path 3).
  assert.equal(g.cellIndex(0, 7), g.cellIndex(1, 3));
  assert.equal(g.posOf(1, g.cellIndex(0, 7)), 3);
  // Player 3 wraps around the ring past cell 16 back to cell 1.
  assert.equal(g.cellId(3, 7), 'shared-1');
  // Private cells are each player's own.
  assert.notEqual(g.cellIndex(0, 1), g.cellIndex(1, 1));
  assert.equal(g.posOf(2, g.cellIndex(0, 1)), -1);
});

test('ring towers and campsites are physical cells: you pass other players\' ones too', () => {
  const g4 = R.geometry(R.makeConfig({ players: 4 }));
  const shared = (g) => Array.from({ length: g.middleLane }, (_, k) => g.middleFirst + k);
  const towers4 = shared(g4).filter((pos) => g4.isTowerAt(0, pos));
  const camps4 = shared(g4).filter((pos) => g4.isCampsiteAt(0, pos));
  assert.deepEqual(towers4, [6, 10], '4 players: two towers on the shared stretch');
  assert.deepEqual(camps4, [4, 8], '4 players: two campsites');
  assert.ok(g4.isTowerAt(0, 12), 'the last cell is a tower');
  const g3 = R.geometry(R.makeConfig({ players: 3 }));
  assert.deepEqual(shared(g3).filter((pos) => g3.isTowerAt(0, pos)), [6], '3 players: one tower');
  assert.deepEqual(shared(g3).filter((pos) => g3.isCampsiteAt(0, pos)), [4, 9], '3 players: two campsites');
});

test('setup: turn order drawn at random; a deck, a power slot and stars for every player', () => {
  const orders = new Set();
  for (let seed = 1; seed <= 40; seed += 1) {
    const s = R.createGame({ seed, config: { players: 4 } });
    assert.deepEqual([...s.order].sort(), [0, 1, 2, 3]);
    assert.equal(s.current, s.order[0]);
    orders.add(s.order.join(''));
    assert.equal(s.moveDecks.length, 4);
    assert.deepEqual(s.held, [null, null, null, null]);
    assert.deepEqual(s.stars, [0, 0, 0, 0]);
    assert.equal(s.units.length, 20);
  }
  assert.ok(orders.size > 10, 'many different orders');
});

test('the turn passes round in the drawn order', () => {
  let s = R.createGame({ seed: 9, config: { players: 3 } });
  const seen = [s.current];
  for (let i = 0; i < 5; i += 1) {
    s = R.drawCard(s);
    if (R.isNumberCard(s.drawn)) {
      const ms = R.currentMoves(s);
      s = R.playDrawnNumber(s, ms[0] ?? null);
    } else if (R.mustPassJoker(s)) s = R.passJoker(s);
    else s = R.playDraft(s, 0);
    while (s.campsite) s = R.playDrawnNumber(s, R.currentMoves(s)[0] ?? null);
    seen.push(s.current);
  }
  const { order } = s;
  seen.forEach((p, i) => assert.equal(p, order[i % 3]));
});

test('landing captures every opponent on the cell; each victim gets a star', () => {
  // Player 0 at path 4 moves 3 to path 7 = player 1's path 3 (4 players).
  const s0 = game(4, { positions: { 'p0-s1': 4, 'p1-s1': 3, 'p1-s2': 3 }, drawn: 3 });
  const s = R.playDrawnNumber(s0, { unit: 'p0-s1' });
  assert.equal(R.getUnit(s, 'p0-s1').pos, 7);
  assert.equal(R.getUnit(s, 'p1-s1').pos, R.HOME);
  assert.equal(R.getUnit(s, 'p1-s2').pos, R.HOME);
  assert.deepEqual(s.stars, [0, 2, 0, 0]);
});

test('a tower held by any opponent blocks landing', () => {
  // Path 6 of player 0 is a tower; player 3 reaches that cell at its path 10.
  const g = R.geometry(R.makeConfig({ players: 4 }));
  assert.equal(g.posOf(3, g.cellIndex(0, 6)), 10);
  const s = game(4, { positions: { 'p0-s1': 4, 'p3-s1': 10 }, drawn: 2 });
  assert.ok(!R.currentMoves(s).some((m) => m.unit === 'p0-s1'));
});

test('upside-down Hanged Man: any opponent\'s unit can be moved back', () => {
  const s0 = game(3, {
    positions: { 'p1-s1': 8, 'p2-s1': 8 },
    drawn: 2,
    held: [R.POWERS.HANGED_MAN, null, null],
    stars: [4, 0, 0],
  });
  assert.ok(R.canUsePowerUpsideDown(s0));
  const s = R.usePowerUpsideDown(s0, {});
  const movers = new Set(R.currentMoves(s).map((m) => R.getUnit(s, m.unit).player));
  assert.deepEqual([...movers].sort(), [1, 2]);
});

test('upside-down Devil on a ring: units whose path passes the cell are pulled; others stay', () => {
  // 4 players. Devil: player 0's unit on its path 6 (ring cell 4).
  const g = R.geometry(R.makeConfig({ players: 4 }));
  const cell = g.cellIndex(0, 6);
  assert.equal(g.posOf(1, cell), -1, "player 1 enters the ring after that cell");
  const s0 = game(4, {
    positions: { 'p0-s1': 6, 'p0-s2': 3, 'p1-s1': 4, 'p3-s1': 9 },
    drawn: 2,
    held: [R.POWERS.DEVIL, null, null, null],
    stars: [3, 0, 0, 0],
  });
  assert.equal(g.posOf(3, cell), 10, 'player 3 reaches it at path 10');
  const s = R.usePowerUpsideDown(s0, { unit: 'p0-s1' });
  assert.equal(R.getUnit(s, 'p0-s2').pos, 4, 'pulled one cell toward it');
  assert.equal(R.getUnit(s, 'p3-s1').pos, R.HOME, 'reached it: dies');
  assert.equal(R.getUnit(s, 'p1-s1').pos, 4, "player 1's unit isn't on a path through it");
  assert.equal(s.stars[3], 1);
});

test('the first player to ascend all their units wins', () => {
  const asc = R.geometry(R.makeConfig({ players: 3 })).ascended;
  const positions = { 'p2-s1': asc, 'p2-s2': asc, 'p2-s3': asc, 'p2-s4': asc, 'p2-c1': 12 };
  const s = R.playDrawnNumber(game(3, { firstPlayer: 2, positions, drawn: 1 }), { unit: 'p2-c1' });
  assert.equal(s.winner, 2);
});

test('random 3- and 4-player games with every power run to a winner', () => {
  let rnd = 7;
  const rand = () => { rnd = (rnd * 1103515245 + 12345) >>> 0; return rnd / 2 ** 32; };
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  for (const players of [3, 4]) {
    for (const timing of ['afterDraw', 'beforeDraw']) {
      for (let seed = 1; seed <= 15; seed += 1) {
        let s = R.createGame({ seed, config: { players, powerTiming: timing } });
        let steps = 0;
        for (; steps < 20000 && s.winner === null; steps += 1) {
          const opts = [];
          if (R.canUsePower(s)) for (const a of R.powerUseChoices(s)) opts.push(() => R.usePower(s, a));
          if (R.canUsePowerUpsideDown(s)) for (const a of R.powerUpsideDownChoices(s)) opts.push(() => R.usePowerUpsideDown(s, a));
          if (s.drawn === null) opts.push(() => R.drawCard(s));
          else if (R.isNumberCard(s.drawn)) {
            const ms = R.currentMoves(s);
            if (ms.length) for (const m of ms) opts.push(() => R.playDrawnNumber(s, m));
            else opts.push(() => R.playDrawnNumber(s, null));
          } else if (R.mustPassJoker(s)) opts.push(() => R.passJoker(s));
          else R.draftOptions(s).forEach((_, i) => opts.push(() => R.playDraft(s, i)));
          s = pick(opts)();
          // Never more than 2 of a team on a cell (except the upside-down Devil's pull).
          assert.equal(s.units.length, players * 5);
        }
        assert.notEqual(s.winner, null, `${players} players, ${timing}, seed ${seed}: finished in ${steps} steps`);
      }
    }
  }
});
