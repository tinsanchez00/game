import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME, JOKER, POWERS,
  canPlayHeldPower, currentMoves, draftOptions, drawCard, heldPowerChoices,
  playDraft, playDrawnNumber, playHeldPower,
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

/** Player 0 plays the Hanged Man; their deck then yields `next`. */
function hanged(positions, next = [3], extra = {}) {
  return playHeldPower(playing(POWERS.HANGED_MAN, positions, {
    moveDecks: [{ draw: [JOKER, ...next, 1], discard: [] }, { draw: [1], discard: [] }],
    ...extra,
  }));
}

test('Hanged Man: playing it immediately draws a card', () => {
  const g = hanged({ 'p0-s1': 9 });
  assert.equal(g.current, 0);
  assert.equal(g.drawn, 3);
  assert.equal(g.hangedDraw, true);
  assert.equal(g.held[0], null);
  assert.deepEqual(g.powerDeck, [POWERS.HANGED_MAN]);
});

test('Hanged Man: a number card moves a unit backward, then you go again', () => {
  const g = playDrawnNumber(hanged({ 'p0-s1': 9 }), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 6);
  assert.equal(g.current, 0);
  assert.equal(g.drawn, null);
  assert.equal(g.hangedDraw, false);
});

test('Hanged Man: the extra turn moves forward again', () => {
  let g = playDrawnNumber(hanged({ 'p0-s1': 9 }), { unit: 'p0-s1' });
  g = playDrawnNumber(drawCard(g), { unit: 'p0-s1' }); // draws 1
  assert.equal(pos(g, 'p0-s1'), 7);
  assert.equal(g.current, 1);
});

test('Hanged Man: a backward move can kill', () => {
  const g = playDrawnNumber(hanged({ 'p0-s1': 9, 'p1-s1': 6 }), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 6);
  assert.equal(pos(g, 'p1-s1'), HOME);
});

test('Hanged Man: going back past the first cell sends the unit home', () => {
  const g = playDrawnNumber(hanged({ 'p0-s1': 2 }), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), HOME);
});

test('Hanged Man: backward moves respect towers', () => {
  const g = hanged({ 'p0-s1': 11, 'p1-s1': 8 });
  assert.ok(!currentMoves(g).some((m) => m.unit === 'p0-s1'));
});

test('Hanged Man: you must move backward when you can', () => {
  assert.throws(() => playDrawnNumber(hanged({ 'p0-s1': 9 }), null));
});

test('Hanged Man: with no backward move, nothing moves but you go again', () => {
  const g = hanged({}); // every unit at home
  assert.equal(currentMoves(g).length, 0);
  const after = playDrawnNumber(g, null);
  assert.equal(after.current, 0);
  assert.equal(after.hangedDraw, false);
});

test('Hanged Man: a joker means no backward move; you draft, then go again', () => {
  const g = hanged({ 'p0-s1': 9 }, [JOKER], {
    powerDeck: [POWERS.TOWER, POWERS.HERMIT],
  });
  assert.equal(g.drawn, JOKER);
  assert.ok(!canPlayHeldPower(g));
  assert.throws(() => playHeldPower(g));
  assert.deepEqual(draftOptions(g), [POWERS.TOWER, POWERS.HERMIT]);
  const after = playDraft(g, 0);
  assert.equal(after.held[0], POWERS.TOWER);
  assert.equal(after.current, 0);
  assert.equal(after.hangedDraw, false);
  assert.equal(pos(after, 'p0-s1'), 9);
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
