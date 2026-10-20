import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASCENDED, HOME, PATH_LENGTH, TOWER_POSITIONS,
  cellId, isShared, isTower, createGame,
} from '../src/rules/index.js';

test('path has 13 cells, home before and ascension after', () => {
  assert.equal(HOME, 0);
  assert.equal(PATH_LENGTH, 13);
  assert.equal(ASCENDED, 14);
});

test('board has 19 physical cells', () => {
  const cells = new Set();
  for (const player of [0, 1]) {
    for (let p = 1; p <= PATH_LENGTH; p += 1) cells.add(cellId(player, p));
  }
  assert.equal(cells.size, 19);
});

test('positions 5-11 are shared, the rest are private', () => {
  for (let p = 1; p <= PATH_LENGTH; p += 1) {
    const shared = p >= 5 && p <= 11;
    assert.equal(isShared(p), shared, `position ${p}`);
    assert.equal(cellId(0, p) === cellId(1, p), shared, `position ${p}`);
  }
});

test('home and ascended are off the board', () => {
  assert.equal(cellId(0, HOME), null);
  assert.equal(cellId(1, ASCENDED), null);
});

test('towers sit at path positions 4, 8 and 13; 8 is the shared one', () => {
  assert.deepEqual([...TOWER_POSITIONS], [4, 8, 13]);
  assert.ok(isTower(8) && isShared(8));
  assert.equal(cellId(0, 8), 'shared-4');
  assert.ok(!isTower(5));
});

test('a new game needs a first player and starts everyone at home', () => {
  assert.throws(() => createGame());
  const g = createGame({ firstPlayer: 1 });
  assert.equal(g.current, 1);
  assert.equal(g.winner, null);
  assert.equal(g.units.length, 12);
  assert.ok(g.units.every((u) => u.pos === HOME));
  for (const player of [0, 1]) {
    const team = g.units.filter((u) => u.player === player);
    assert.equal(team.filter((u) => u.type === 'soldier').length, 5);
    assert.equal(team.filter((u) => u.type === 'commander').length, 1);
  }
});
