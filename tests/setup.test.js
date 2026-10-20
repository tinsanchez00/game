import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME, MOVE_DECK, RULES_VERSION, STARTING_POWER_DECK, createGame,
} from '../src/rules/index.js';

const sorted = (xs) => [...xs].map(String).sort();

test('rules module loads', () => {
  assert.equal(typeof RULES_VERSION, 'string');
});

test('a new game starts all twelve units at home', () => {
  const g = createGame({ seed: 7 });
  assert.equal(g.winner, null);
  assert.equal(g.units.length, 12);
  assert.ok(g.units.every((u) => u.pos === HOME));
  for (const player of [0, 1]) {
    const team = g.units.filter((u) => u.player === player);
    assert.equal(team.filter((u) => u.type === 'soldier').length, 5);
    assert.equal(team.filter((u) => u.type === 'commander').length, 1);
  }
});

test('the first player is random but fixed by the seed', () => {
  const firsts = new Set();
  for (let seed = 1; seed <= 50; seed += 1) {
    const a = createGame({ seed });
    const b = createGame({ seed });
    assert.equal(a.current, b.current);
    firsts.add(a.current);
  }
  assert.deepEqual([...firsts].sort(), [0, 1]);
});

test('firstPlayer can be fixed explicitly and is validated', () => {
  assert.equal(createGame({ seed: 3, firstPlayer: 1 }).current, 1);
  assert.throws(() => createGame({ firstPlayer: 2 }));
});

test('each player gets their own shuffled 9-card move deck', () => {
  const g = createGame({ seed: 11 });
  for (const player of [0, 1]) {
    assert.deepEqual(sorted(g.moveDecks[player].draw), sorted(MOVE_DECK));
    assert.deepEqual(g.moveDecks[player].discard, []);
  }
  const orders = new Set();
  for (let seed = 1; seed <= 20; seed += 1) {
    orders.add(createGame({ seed }).moveDecks[0].draw.join());
  }
  assert.ok(orders.size > 1);
});

test('the power deck holds the five starting powers and nobody holds one', () => {
  const g = createGame({ seed: 5 });
  assert.deepEqual(sorted(g.powerDeck), sorted(STARTING_POWER_DECK));
  assert.deepEqual(g.held, [null, null]);
});

test('same seed, same game', () => {
  assert.deepEqual(createGame({ seed: 42 }), createGame({ seed: 42 }));
});
