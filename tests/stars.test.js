import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME, POWERS, createGame, drawCard, playDrawnNumber, usePower, usePowerUpsideDown,
} from '../src/rules/index.js';
import { gameWith, pos } from './helpers.js';

// Default board: path 1-3 start lane, 4-12 middle lane, 13-14 end lane;
// towers 7 and 14, campsite 5; ascending is step 15.

/** Player 0 holds `held`, has `stars` stars and has drawn the first card of `deck`. */
function playing(positions, {
  deck = [3, 1, 2], discard = [], config, held = POWERS.TOWER, stars = [1, 0], draw = true,
} = {}) {
  const g = gameWith(positions, {
    config,
    moveDecks: [{ draw: deck, discard }, { draw: [1], discard: [] }],
    held: [held, null],
    powerDeck: [POWERS.DEVIL, POWERS.LOVERS],
    stars,
  });
  return draw ? drawCard(g) : g;
}

// --- stars -----------------------------------------------------------------

test('stars: each player starts with none', () => {
  assert.deepEqual(createGame({ seed: 3 }).stars, [0, 0]);
});

test('stars: a capture gives the victim one star per unit killed', () => {
  const g = playing({ 'p0-s1': 3, 'p1-s1': 6, 'p1-s2': 6 }, { stars: [0, 0], held: null });
  const after = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(after, 'p1-s1'), HOME);
  assert.deepEqual(after.stars, [0, 2]);
});

test('stars: units destroyed by your own power give you stars too', () => {
  // The upside-down Tower (2 stars) destroys both teams' units on towers (path cells 7 and 14).
  const g = playing({ 'p0-s1': 7, 'p0-s2': 14, 'p1-s1': 14 }, { stars: [2, 0] });
  const after = usePowerUpsideDown(g);
  assert.deepEqual(after.stars, [2, 1]);
});

test('stars: units killed by the Devil give their owner stars', () => {
  // p0-s1 is the Devil at 8; p0-s2 at 9 and p1-s1 at 7 collide with it.
  const g = playing({ 'p0-s1': 8, 'p0-s2': 9, 'p1-s1': 7, 'p1-s2': 11 }, { stars: [0, 0], held: POWERS.DEVIL });
  const after = usePower(g, { unit: 'p0-s1' });
  assert.equal(pos(after, 'p0-s2'), HOME);
  assert.equal(pos(after, 'p1-s1'), HOME);
  assert.deepEqual(after.stars, [1, 1]);
});

test('stars: the Hanged Man moving a unit back past the first cell is not a death', () => {
  const g = playing({ 'p0-s1': 2 }, { stars: [0, 0], held: POWERS.HANGED_MAN });
  const after = playDrawnNumber(usePower(g), { unit: 'p0-s1' });
  assert.equal(pos(after, 'p0-s1'), HOME);
  assert.deepEqual(after.stars, [0, 0]);
});

test('stars: a Hanged Man backward capture gives the victim a star', () => {
  const g = playing({ 'p0-s1': 9, 'p1-s1': 6 }, { stars: [0, 0], held: POWERS.HANGED_MAN });
  const after = playDrawnNumber(usePower(g), { unit: 'p0-s1' });
  assert.equal(pos(after, 'p1-s1'), HOME);
  assert.deepEqual(after.stars, [0, 1]);
});

test('stars: no limit', () => {
  const g = playing({ 'p0-s1': 3, 'p1-s1': 6 }, { stars: [0, 41], held: null });
  assert.deepEqual(playDrawnNumber(g, { unit: 'p0-s1' }).stars, [0, 42]);
});
