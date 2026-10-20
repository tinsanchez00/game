import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME, JOKER, POWERS,
  canPlayHeldPower, drawCard, heldPowerChoices, legalMoves, playDrawnNumber,
  playHeldPower, playNumberCard,
} from '../src/rules/index.js';
import { gameWith, pos, soldiersOut } from './helpers.js';

/** A game where player 0 has just drawn a joker while holding `power`. */
function playing(power, positions = {}, extra = {}) {
  return drawCard(gameWith(positions, {
    moveDecks: [{ draw: [JOKER, 3, 2], discard: [] }, { draw: [1], discard: [] }],
    held: [power, null],
    powerDeck: [],
    ...extra,
  }));
}

// --- The Hanged Man ---

test('Hanged Man grants another turn', () => {
  const after = playHeldPower(playing(POWERS.HANGED_MAN, { 'p0-s1': 6 }));
  assert.equal(after.current, 0);
  assert.equal(after.drawn, null);
});

test('Hanged Man: the next unit moved goes backward', () => {
  let g = playHeldPower(playing(POWERS.HANGED_MAN, { 'p0-s1': 9 }));
  g = drawCard(g); // 3
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 6);
  assert.equal(g.current, 1);
});

test('Hanged Man: only one move goes backward', () => {
  let g = playHeldPower(playing(POWERS.HANGED_MAN, { 'p0-s1': 9 }));
  g = playDrawnNumber(drawCard(g), { unit: 'p0-s1' });
  assert.equal(g.backward[0], false);
});

test('Hanged Man: a backward move can kill', () => {
  let g = playHeldPower(playing(POWERS.HANGED_MAN, { 'p0-s1': 9, 'p1-s1': 6 }));
  g = playDrawnNumber(drawCard(g), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 6);
  assert.equal(pos(g, 'p1-s1'), HOME);
});

test('Hanged Man: going back past the first cell sends the unit home', () => {
  let g = playHeldPower(playing(POWERS.HANGED_MAN, { 'p0-s1': 2 }));
  g = playDrawnNumber(drawCard(g), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), HOME);
});

test('Hanged Man: units at home cannot move backward', () => {
  const g = playHeldPower(playing(POWERS.HANGED_MAN, {}));
  assert.equal(legalMoves(g, 0, 3).length, 0);
});

test('Hanged Man: a lost turn keeps the effect waiting', () => {
  let g = playHeldPower(playing(POWERS.HANGED_MAN, {}));
  g = playNumberCard(g, 3, null);
  assert.equal(g.backward[0], true);
});

test('Hanged Man: backward moves respect towers', () => {
  const g = playHeldPower(playing(POWERS.HANGED_MAN, { 'p0-s1': 11, 'p1-s1': 8 }));
  assert.ok(!legalMoves(g, 0, 3).some((m) => m.unit === 'p0-s1'));
});

// --- The Lovers ---

test('Lovers: move your middle-lane unit onto a lone ally there', () => {
  const g = playing(POWERS.LOVERS, { 'p0-s1': 5, 'p0-s2': 11 });
  const after = playHeldPower(g, { unit: 'p0-s1', target: 'p0-s2' });
  assert.equal(pos(after, 'p0-s1'), 11);
  assert.equal(after.current, 1);
});

test('Lovers works in either direction', () => {
  const g = playing(POWERS.LOVERS, { 'p0-s1': 5, 'p0-s2': 11 });
  const after = playHeldPower(g, { unit: 'p0-s2', target: 'p0-s1' });
  assert.equal(pos(after, 'p0-s2'), 5);
});

test('Lovers: the ally must be alone, in the middle lane, and yours', () => {
  const g = playing(POWERS.LOVERS, {
    'p0-s1': 5,
    'p0-s2': 9, 'p0-s3': 9, // a pair, not alone
    'p0-s4': 2, // private lane
    'p1-s1': 11, // enemy
  });
  const targets = new Set(heldPowerChoices(g).map((c) => c.target));
  assert.deepEqual([...targets], ['p0-s1']); // the only lone ally in the middle lane
  assert.throws(() => playHeldPower(g, { unit: 'p0-s1', target: 'p0-s2' }));
  assert.throws(() => playHeldPower(g, { unit: 'p0-s1', target: 'p0-s4' }));
  assert.throws(() => playHeldPower(g, { unit: 'p0-s1', target: 'p1-s1' }));
});

test('Lovers cannot be played without a valid pair', () => {
  const g = playing(POWERS.LOVERS, { 'p0-s1': 5, 'p0-s4': 2 });
  assert.equal(heldPowerChoices(g).length, 0);
  assert.ok(!canPlayHeldPower(g));
});

test('Lovers: a locked commander cannot be moved', () => {
  const g = playing(POWERS.LOVERS, { 'p0-c': 5, 'p0-s1': 11 }); // soldiers still home
  assert.ok(!heldPowerChoices(g).some((c) => c.unit === 'p0-c'));
});

// --- The Devil ---

test('Devil: middle-lane units move one cell toward it; colliders die', () => {
  const g = playing(POWERS.DEVIL, {
    'p0-s1': 8, // the Devil (middle index 4)
    'p0-s2': 7, // adjacent ally -> dies
    'p1-s1': 9, // adjacent enemy -> dies
    'p1-s2': 11, // two away -> moves to 10
    'p0-s3': 5, // three away -> moves to 6
  });
  const after = playHeldPower(g, { unit: 'p0-s1' });
  assert.equal(pos(after, 'p0-s1'), 8);
  assert.equal(pos(after, 'p0-s2'), HOME);
  assert.equal(pos(after, 'p1-s1'), HOME);
  assert.equal(pos(after, 'p1-s2'), 10);
  assert.equal(pos(after, 'p0-s3'), 6);
});

test("Devil: a unit sharing the Devil's cell dies", () => {
  const g = playing(POWERS.DEVIL, { 'p0-s1': 6, 'p0-s2': 6 });
  const after = playHeldPower(g, { unit: 'p0-s1' });
  assert.equal(pos(after, 'p0-s1'), 6);
  assert.equal(pos(after, 'p0-s2'), HOME);
});

test('Devil: private lanes are untouched; towers do not protect', () => {
  const g = playing(POWERS.DEVIL, {
    'p0-s1': 11, 'p0-s2': 3, 'p1-s1': 13, 'p1-s2': 8, // p1-s2 on the middle tower
  });
  const after = playHeldPower(g, { unit: 'p0-s1' });
  assert.equal(pos(after, 'p0-s2'), 3);
  assert.equal(pos(after, 'p1-s1'), 13);
  assert.equal(pos(after, 'p1-s2'), 9);
});

test('Devil: must be one of your units in the middle lane', () => {
  const g = playing(POWERS.DEVIL, { 'p0-s1': 3, 'p1-s1': 6 });
  assert.equal(heldPowerChoices(g).length, 0);
  assert.throws(() => playHeldPower(g, { unit: 'p1-s1' }));
});

// --- The Tower ---

test('Tower: destroys every unit on every tower, both teams', () => {
  const g = playing(POWERS.TOWER, {
    'p0-s1': 4, 'p0-s2': 8, 'p0-s3': 14, 'p1-s1': 4, 'p1-s2': 14, 'p0-s4': 5,
  });
  const after = playHeldPower(g);
  for (const id of ['p0-s1', 'p0-s2', 'p0-s3', 'p1-s1', 'p1-s2']) {
    assert.equal(pos(after, id), HOME, id);
  }
  assert.equal(pos(after, 'p0-s4'), 5);
});

// --- The Hermit ---

test('Hermit: every middle-lane stack loses one unit, commander first', () => {
  const g = playing(POWERS.HERMIT, {
    ...soldiersOut(0, [6, 10, 10, 1, 2]),
    'p0-c': 6,
    ...soldiersOut(1, [11, 11, 1, 2, 3]),
  });
  const after = playHeldPower(g);
  assert.equal(pos(after, 'p0-c'), HOME);
  assert.equal(pos(after, 'p0-s1'), 6);
  const atTen = ['p0-s2', 'p0-s3'].filter((id) => pos(after, id) === 10);
  assert.equal(atTen.length, 1);
  const atEleven = ['p1-s1', 'p1-s2'].filter((id) => pos(after, id) === 11);
  assert.equal(atEleven.length, 1);
});

test('Hermit: stacks on a tower and in private lanes are safe', () => {
  const g = playing(POWERS.HERMIT, { 'p0-s1': 8, 'p0-s2': 8, 'p0-s3': 2, 'p0-s4': 2 });
  const after = playHeldPower(g);
  for (const id of ['p0-s1', 'p0-s2', 'p0-s3', 'p0-s4']) {
    assert.notEqual(pos(after, id), HOME, id);
  }
});
