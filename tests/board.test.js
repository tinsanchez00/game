import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASCENDED, HOME, MIDDLE_LANE_LENGTH, PATH_LENGTH, TOWER_POSITIONS,
  cellId, isShared, isTower, middleIndex, posFromMiddleIndex,
} from '../src/rules/index.js';

test('path has 14 cells, home before and ascension after', () => {
  assert.equal(HOME, 0);
  assert.equal(PATH_LENGTH, 14);
  assert.equal(ASCENDED, 15);
});

test('board has 20 physical cells', () => {
  const cells = new Set();
  for (const player of [0, 1]) {
    for (let p = 1; p <= PATH_LENGTH; p += 1) cells.add(cellId(player, p));
  }
  assert.equal(cells.size, 20);
});

test('positions 5-12 are the shared 8-cell middle lane', () => {
  assert.equal(MIDDLE_LANE_LENGTH, 8);
  for (let p = 1; p <= PATH_LENGTH; p += 1) {
    const shared = p >= 5 && p <= 12;
    assert.equal(isShared(p), shared, `position ${p}`);
    assert.equal(cellId(0, p) === cellId(1, p), shared, `position ${p}`);
  }
});

test('middle-lane index round-trips with path position', () => {
  for (let i = 1; i <= 8; i += 1) assert.equal(middleIndex(posFromMiddleIndex(i)), i);
  assert.equal(middleIndex(4), null);
  assert.equal(middleIndex(13), null);
});

test('home and ascended are off the board', () => {
  assert.equal(cellId(0, HOME), null);
  assert.equal(cellId(1, ASCENDED), null);
});

test('towers sit at path positions 4, 8 and 14; 8 is the shared one', () => {
  assert.deepEqual([...TOWER_POSITIONS], [4, 8, 14]);
  assert.ok(isTower(8) && isShared(8));
  assert.equal(middleIndex(8), 4);
  assert.ok(!isTower(5));
});
