import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASCENDED, HOME, applyMove, isCommanderLocked, legalMoves, playNumberCard,
} from '../src/rules/index.js';
import { LOCK, gameWith, pos, soldiersOut } from './helpers.js';

const has = (moves, unit, escort) =>
  moves.some((m) => m.unit === unit && (m.escort ?? null) === (escort ?? null));

// --- entering and basic movement ---

test('card N moves a unit from home onto path cell N', () => {
  const g = gameWith();
  const after = applyMove(g, { unit: 'p0-s1' }, 3);
  assert.equal(pos(after, 'p0-s1'), 3);
});

test('units move exactly N cells forward', () => {
  const g = gameWith({ 'p0-s1': 2 });
  const after = applyMove(g, { unit: 'p0-s1' }, 4);
  assert.equal(pos(after, 'p0-s1'), 6);
});

test('private lanes never collide', () => {
  const g = gameWith({ 'p0-s1': 2 }, { firstPlayer: 1 });
  const after = applyMove(g, { unit: 'p1-s1' }, 2);
  assert.equal(pos(after, 'p0-s1'), 2);
  assert.equal(pos(after, 'p1-s1'), 2);
});

// --- commander lock ---

test('commander is locked while any soldier is in the home field', () => {
  const g = gameWith({ ...soldiersOut(0, [1, 2, 3, 5]) }, { config: LOCK }); // s5 still home
  assert.ok(isCommanderLocked(g, 0));
  assert.ok(!has(legalMoves(g, 0, 2), 'p0-c1'));
});

test('by default the commander moves even with soldiers at home (no lock)', () => {
  const g = gameWith({ ...soldiersOut(0, [1, 2, 3, 5]) }); // s5 still home
  assert.ok(!isCommanderLocked(g, 0));
  assert.ok(has(legalMoves(g, 0, 2), 'p0-c1'));
});

test('commander can move once no soldiers are home', () => {
  const g = gameWith(soldiersOut(0));
  assert.ok(!isCommanderLocked(g, 0));
  assert.ok(has(legalMoves(g, 0, 4), 'p0-c1'));
});

test('a captured commander back home is not locked by that alone', () => {
  const g = gameWith({ ...soldiersOut(0), 'p0-c1': HOME });
  assert.ok(has(legalMoves(g, 0, 1), 'p0-c1'));
});

test('ascended soldiers do not lock the commander', () => {
  const g = gameWith(soldiersOut(0, [ASCENDED, ASCENDED, 1, 2, 3]));
  assert.ok(!isCommanderLocked(g, 0));
});

// --- stacking ---

test('a cell can hold two units of the same team', () => {
  const g = gameWith({ 'p0-s1': 3 });
  assert.ok(has(legalMoves(g, 0, 3), 'p0-s2'));
});

test('a move onto a cell already holding two of your units is invalid', () => {
  const g = gameWith({ 'p0-s1': 3, 'p0-s2': 3 });
  const moves = legalMoves(g, 0, 3);
  assert.ok(!has(moves, 'p0-s3'));
  assert.ok(!has(moves, 'p0-s4'));
});

// --- escort ---

test('commander can bring a soldier from its own cell along', () => {
  const g = gameWith({ ...soldiersOut(0, [6, 1, 2, 3, 5]), 'p0-c1': 6 });
  assert.ok(has(legalMoves(g, 0, 2), 'p0-c1', 'p0-s1'));
  const after = applyMove(g, { unit: 'p0-c1', escort: 'p0-s1' }, 2);
  assert.equal(pos(after, 'p0-c1'), 8);
  assert.equal(pos(after, 'p0-s1'), 8);
});

test('commander can also move without its escort', () => {
  const g = gameWith({ ...soldiersOut(0, [6, 1, 2, 3, 5]), 'p0-c1': 6 });
  const after = applyMove(g, { unit: 'p0-c1' }, 2);
  assert.equal(pos(after, 'p0-c1'), 8);
  assert.equal(pos(after, 'p0-s1'), 6);
});

test('soldiers on other cells cannot escort', () => {
  const g = gameWith({ ...soldiersOut(0, [7, 1, 2, 3, 5]), 'p0-c1': 6 });
  assert.ok(!legalMoves(g, 0, 2).some((m) => m.escort));
});

test('with one of your units at the destination, commander or soldier may go, not both', () => {
  const g = gameWith({ ...soldiersOut(0, [6, 9, 2, 3, 5]), 'p0-c1': 6 });
  const moves = legalMoves(g, 0, 3);
  assert.ok(has(moves, 'p0-c1'));
  assert.ok(has(moves, 'p0-s1'));
  assert.ok(!has(moves, 'p0-c1', 'p0-s1'));
});

// --- capturing ---

test('landing on enemy units removes all of them, commander included', () => {
  const g = gameWith({
    'p0-s1': 3,
    ...soldiersOut(1, [6, 1, 2, 3, 5]), 'p1-c1': 6,
  });
  const after = applyMove(g, { unit: 'p0-s1' }, 3);
  assert.equal(pos(after, 'p0-s1'), 6);
  assert.equal(pos(after, 'p1-s1'), HOME);
  assert.equal(pos(after, 'p1-c1'), HOME);
});

test('capturing a soldier locks the opponent commander again', () => {
  const g = gameWith({ 'p0-s1': 3, ...soldiersOut(1, [6, 1, 2, 3, 5]) }, { config: LOCK });
  assert.ok(!isCommanderLocked(g, 1));
  const after = applyMove(g, { unit: 'p0-s1' }, 3);
  assert.ok(isCommanderLocked(after, 1));
});

test('captures only affect the opponent', () => {
  const g = gameWith({ 'p0-s1': 3, 'p0-s2': 6 });
  const after = applyMove(g, { unit: 'p0-s1' }, 3);
  assert.equal(pos(after, 'p0-s2'), 6);
});

// --- towers ---

test('units on a tower cannot be captured: the opponent cannot land there', () => {
  const g = gameWith({ 'p0-s1': 4, 'p1-s1': 7 });
  assert.ok(!has(legalMoves(g, 0, 3), 'p0-s1'));
});

test('your own units can share a tower', () => {
  const g = gameWith({ 'p0-s1': 4, 'p0-s2': 7 });
  assert.ok(has(legalMoves(g, 0, 3), 'p0-s1'));
});

test('towers give no extra turn', () => {
  const g = gameWith({ 'p0-s1': 4 });
  const after = applyMove(g, { unit: 'p0-s1' }, 3);
  assert.equal(pos(after, 'p0-s1'), 7);
  assert.equal(after.current, 1);
});

// --- ascension and winning ---

test('a unit ascends only with the exact count', () => {
  const g = gameWith({ 'p0-s1': 14, 'p0-s2': 13 });
  assert.ok(has(legalMoves(g, 0, 1), 'p0-s1'));
  assert.ok(!has(legalMoves(g, 0, 2), 'p0-s1'));
  assert.ok(has(legalMoves(g, 0, 2), 'p0-s2'));
  const after = applyMove(g, { unit: 'p0-s1' }, 1);
  assert.equal(pos(after, 'p0-s1'), ASCENDED);
});

test('ascended units cannot move', () => {
  const g = gameWith({ 'p0-s1': ASCENDED });
  assert.ok(!has(legalMoves(g, 0, 1), 'p0-s1'));
});

test('an escorted soldier ascends with the commander', () => {
  const g = gameWith({ ...soldiersOut(0, [13, 1, 2, 3, 5]), 'p0-c1': 13 });
  const after = applyMove(g, { unit: 'p0-c1', escort: 'p0-s1' }, 2);
  assert.equal(pos(after, 'p0-c1'), ASCENDED);
  assert.equal(pos(after, 'p0-s1'), ASCENDED);
});

test('ascending all six units wins the game', () => {
  const g = gameWith({
    ...soldiersOut(0, [ASCENDED, ASCENDED, ASCENDED, ASCENDED, ASCENDED]),
    'p0-c1': 14,
  });
  const after = applyMove(g, { unit: 'p0-c1' }, 1);
  assert.equal(after.winner, 0);
  assert.throws(() => playNumberCard(after, 1, null));
});

// --- turns ---

test('the turn passes to the other player after a move', () => {
  const after = applyMove(gameWith(), { unit: 'p0-s1' }, 1);
  assert.equal(after.current, 1);
});

test('with no valid move the turn is lost', () => {
  const g = gameWith({
    ...soldiersOut(0, [ASCENDED, ASCENDED, ASCENDED, ASCENDED, ASCENDED]),
    'p0-c1': 14,
  });
  assert.equal(legalMoves(g, 0, 3).length, 0);
  const after = playNumberCard(g, 3, null);
  assert.equal(after.current, 1);
  assert.equal(pos(after, 'p0-c1'), 14);
  assert.throws(() => playNumberCard(g, 3, { unit: 'p0-c1' }));
});

test('you must move when a valid move exists', () => {
  assert.throws(() => playNumberCard(gameWith(), 2, null));
});

test('illegal moves are rejected', () => {
  const g = gameWith({}, { config: LOCK });
  assert.throws(() => applyMove(g, { unit: 'p0-c1' }, 2)); // locked
  assert.throws(() => applyMove(g, { unit: 'p1-s1' }, 2)); // not your turn
});
