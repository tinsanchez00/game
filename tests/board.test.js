import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASCENDED, CAMPSITE_POSITIONS, HOME, MIDDLE_LANE_LENGTH, PATH_LENGTH, TOWER_POSITIONS,
  cellId, isCampsite, isShared, isTower, middleIndex, posFromMiddleIndex,
} from '../src/rules/index.js';

test('path has 14 cells, home before and ascension after', () => {
  assert.equal(HOME, 0);
  assert.equal(PATH_LENGTH, 14);
  assert.equal(ASCENDED, 15);
});

test('board has 19 physical cells', () => {
  const cells = new Set();
  for (const player of [0, 1]) {
    for (let p = 1; p <= PATH_LENGTH; p += 1) cells.add(cellId(player, p));
  }
  assert.equal(cells.size, 19);
});

test('positions 4-12 are the shared 9-cell middle lane', () => {
  assert.equal(MIDDLE_LANE_LENGTH, 9);
  for (let p = 1; p <= PATH_LENGTH; p += 1) {
    const shared = p >= 4 && p <= 12;
    assert.equal(isShared(p), shared, `position ${p}`);
    assert.equal(cellId(0, p) === cellId(1, p), shared, `position ${p}`);
  }
});

test('middle-lane index round-trips with path position', () => {
  for (let i = 1; i <= 9; i += 1) assert.equal(middleIndex(posFromMiddleIndex(i)), i);
  assert.equal(middleIndex(3), null);
  assert.equal(middleIndex(13), null);
});

test('home and ascended are off the board', () => {
  assert.equal(cellId(0, HOME), null);
  assert.equal(cellId(1, ASCENDED), null);
});

test('towers sit at path positions 7 and 14; 7 is the 4th middle-lane cell', () => {
  assert.deepEqual([...TOWER_POSITIONS], [7, 14]);
  assert.ok(isTower(7) && isShared(7));
  assert.equal(middleIndex(7), 4);
  assert.ok(!isTower(4) && !isTower(5));
});

test('the campsite is path position 5, the 2nd middle-lane cell', () => {
  assert.deepEqual([...CAMPSITE_POSITIONS], [5]);
  assert.ok(isCampsite(5) && isShared(5));
  assert.equal(middleIndex(5), 2);
  assert.ok(!isCampsite(7) && !isCampsite(HOME));
});
