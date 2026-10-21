import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME, JOKER, POWERS,
  canUsePower, createGame, currentMoves, draftOptions, drawCard, playDraft, playDrawnNumber,
  powerUseChoices, usePower,
} from '../src/rules/index.js';
import { gameWith, pos, soldiersOut } from './helpers.js';

/**
 * Player 0 holds `power` and has just drawn the first card of `deck`
 * (after-draw timing, so the power is usable now).
 */
function playing(power, positions = {}, { deck = [3, 1, 2], ...extra } = {}) {
  return drawCard(gameWith(positions, {
    moveDecks: [{ draw: deck, discard: [] }, { draw: [1], discard: [] }],
    held: [power, null],
    powerDeck: [POWERS.TOWER, POWERS.HERMIT],
    ...extra,
  }));
}

// --- The Hanged Man (free power) ---

test('Hanged Man: the drawn card is kept and will move backward', () => {
  const g = usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 9 }));
  assert.equal(g.current, 0);
  assert.equal(g.drawn, 3);
  assert.equal(g.hangedDraw, true);
  assert.equal(g.held[0], null);
  assert.deepEqual(g.powerDeck, [POWERS.TOWER, POWERS.HERMIT, POWERS.HANGED_MAN]);
  assert.ok(!canUsePower(g));
});

test('Hanged Man: the card moves a unit backward, then you go again', () => {
  const g = playDrawnNumber(usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 9 })), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 6);
  assert.equal(g.current, 0);
  assert.equal(g.drawn, null);
  assert.equal(g.hangedDraw, false);
});

test('Hanged Man: the extra turn moves forward again', () => {
  let g = playDrawnNumber(usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 9 })), { unit: 'p0-s1' });
  g = playDrawnNumber(drawCard(g), { unit: 'p0-s1' }); // draws 1
  assert.equal(pos(g, 'p0-s1'), 7);
  assert.equal(g.current, 1);
});

test('Hanged Man: a backward move can kill', () => {
  const g = playDrawnNumber(usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 9, 'p1-s1': 6 })), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 6);
  assert.equal(pos(g, 'p1-s1'), HOME);
});

test('Hanged Man: going back past the first cell sends the unit home', () => {
  const g = playDrawnNumber(usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 2 })), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), HOME);
});

test('Hanged Man: backward moves respect towers', () => {
  const g = usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 11, 'p1-s1': 8 }));
  assert.ok(!currentMoves(g).some((m) => m.unit === 'p0-s1'));
});

test('Hanged Man: you must move backward when you can', () => {
  assert.throws(() => playDrawnNumber(usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 9 })), null));
});

test('Hanged Man: with no backward move, nothing moves but you go again', () => {
  const g = usePower(playing(POWERS.HANGED_MAN, {})); // every unit at home
  assert.equal(currentMoves(g).length, 0);
  const after = playDrawnNumber(g, null);
  assert.equal(after.current, 0);
  assert.equal(after.hangedDraw, false);
});

test('Hanged Man on a joker: the joker still drafts, then you go again with the new power', () => {
  let g = usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 9 }, { deck: [JOKER, 2] }));
  assert.equal(g.drawn, JOKER);
  assert.deepEqual(draftOptions(g), [POWERS.TOWER, POWERS.HERMIT]);
  g = playDraft(g, 0);
  assert.equal(g.held[0], POWERS.TOWER);
  assert.equal(g.current, 0);
  assert.equal(pos(g, 'p0-s1'), 9);
  g = drawCard(g);
  assert.ok(canUsePower(g), 'the extra turn counts as a following turn');
});

test('Hanged Man before drawing: you draw after using it, and that card moves backward', () => {
  const base = createGame({ seed: 1, firstPlayer: 0, config: { powerTiming: 'beforeDraw' } });
  let g = {
    ...base,
    units: base.units.map((u) => (u.id === 'p0-s1' ? { ...u, pos: 9 } : u)),
    moveDecks: [{ draw: [3, 1], discard: [] }, { draw: [1], discard: [] }],
    held: [POWERS.HANGED_MAN, null],
  };
  assert.ok(canUsePower(g));
  g = usePower(g);
  assert.equal(g.drawn, 3);
  assert.equal(g.hangedDraw, true);
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 6);
  assert.equal(g.current, 0);
});

// --- The Lovers ---

test('Lovers: move your middle-lane unit onto a lone ally there', () => {
  const g = playing(POWERS.LOVERS, { 'p0-s1': 5, 'p0-s2': 11 });
  const after = usePower(g, { unit: 'p0-s1', target: 'p0-s2' });
  assert.equal(pos(after, 'p0-s1'), 11);
  assert.equal(after.current, 1);
});

test('Lovers works in either direction', () => {
  const g = playing(POWERS.LOVERS, { 'p0-s1': 5, 'p0-s2': 11 });
  const after = usePower(g, { unit: 'p0-s2', target: 'p0-s1' });
  assert.equal(pos(after, 'p0-s2'), 5);
});

test('Lovers: the ally must be alone, in the middle lane, and yours', () => {
  const g = playing(POWERS.LOVERS, {
    'p0-s1': 5,
    'p0-s2': 9, 'p0-s3': 9, // a pair, not alone
    'p0-s4': 2, // private lane
    'p1-s1': 11, // enemy
  });
  const targets = new Set(powerUseChoices(g).map((c) => c.target));
  assert.deepEqual([...targets], ['p0-s1']); // the only lone ally in the middle lane
  assert.throws(() => usePower(g, { unit: 'p0-s1', target: 'p0-s2' }));
  assert.throws(() => usePower(g, { unit: 'p0-s1', target: 'p0-s4' }));
  assert.throws(() => usePower(g, { unit: 'p0-s1', target: 'p1-s1' }));
});

test('Lovers with no valid pair can still be used, to no effect', () => {
  const g = playing(POWERS.LOVERS, { 'p0-s1': 5, 'p0-s4': 2 });
  assert.deepEqual(powerUseChoices(g), [{}]);
  const after = usePower(g, {});
  assert.equal(pos(after, 'p0-s1'), 5);
  assert.equal(after.current, 1);
  assert.equal(after.held[0], null);
});

test('Lovers: a locked commander cannot be moved', () => {
  const g = playing(POWERS.LOVERS, { 'p0-c1': 5, 'p0-s1': 11 }); // soldiers still home
  assert.ok(!powerUseChoices(g).some((c) => c.unit === 'p0-c1'));
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
  const after = usePower(g, { unit: 'p0-s1' });
  assert.equal(pos(after, 'p0-s1'), 8);
  assert.equal(pos(after, 'p0-s2'), HOME);
  assert.equal(pos(after, 'p1-s1'), HOME);
  assert.equal(pos(after, 'p1-s2'), 10);
  assert.equal(pos(after, 'p0-s3'), 6);
});

test("Devil: a unit sharing the Devil's cell dies", () => {
  const g = playing(POWERS.DEVIL, { 'p0-s1': 6, 'p0-s2': 6 });
  const after = usePower(g, { unit: 'p0-s1' });
  assert.equal(pos(after, 'p0-s1'), 6);
  assert.equal(pos(after, 'p0-s2'), HOME);
});

test('Devil: private lanes are untouched; towers do not protect', () => {
  const g = playing(POWERS.DEVIL, {
    'p0-s1': 11, 'p0-s2': 3, 'p1-s1': 13, 'p1-s2': 8, // p1-s2 on the middle tower
  });
  const after = usePower(g, { unit: 'p0-s1' });
  assert.equal(pos(after, 'p0-s2'), 3);
  assert.equal(pos(after, 'p1-s1'), 13);
  assert.equal(pos(after, 'p1-s2'), 9);
});

test('Devil: must be one of your units in the middle lane; with none it does nothing', () => {
  const g = playing(POWERS.DEVIL, { 'p0-s1': 3, 'p1-s1': 6 });
  assert.deepEqual(powerUseChoices(g), [{}]);
  assert.throws(() => usePower(g, { unit: 'p1-s1' }));
  assert.equal(pos(usePower(g, {}), 'p1-s1'), 6);
});

test('Devil: with a valid unit, a target must be picked', () => {
  const g = playing(POWERS.DEVIL, { 'p0-s1': 8 });
  assert.throws(() => usePower(g, {}));
});

// --- The Tower ---

test('Tower: destroys every unit on every tower, both teams', () => {
  const g = playing(POWERS.TOWER, {
    'p0-s1': 4, 'p0-s2': 8, 'p0-s3': 14, 'p1-s1': 4, 'p1-s2': 14, 'p0-s4': 5,
  });
  const after = usePower(g);
  for (const id of ['p0-s1', 'p0-s2', 'p0-s3', 'p1-s1', 'p1-s2']) {
    assert.equal(pos(after, id), HOME, id);
  }
  assert.equal(pos(after, 'p0-s4'), 5);
});

// --- The Hermit ---

test('Hermit: every middle-lane stack loses one unit, commander first', () => {
  const g = playing(POWERS.HERMIT, {
    ...soldiersOut(0, [6, 10, 10, 1, 2]),
    'p0-c1': 6,
    ...soldiersOut(1, [11, 11, 1, 2, 3]),
  });
  const after = usePower(g);
  assert.equal(pos(after, 'p0-c1'), HOME);
  assert.equal(pos(after, 'p0-s1'), 6);
  const atTen = ['p0-s2', 'p0-s3'].filter((id) => pos(after, id) === 10);
  assert.equal(atTen.length, 1);
  const atEleven = ['p1-s1', 'p1-s2'].filter((id) => pos(after, id) === 11);
  assert.equal(atEleven.length, 1);
});

test('Hermit: stacks on a tower and in private lanes are safe', () => {
  const g = playing(POWERS.HERMIT, { 'p0-s1': 8, 'p0-s2': 8, 'p0-s3': 2, 'p0-s4': 2 });
  const after = usePower(g);
  for (const id of ['p0-s1', 'p0-s2', 'p0-s3', 'p0-s4']) {
    assert.notEqual(pos(after, id), HOME, id);
  }
});

// --- no-effect use ---

test('a power with nothing to hit can still be used to skip the drawn card', () => {
  const g = playing(POWERS.TOWER, { 'p0-s1': 5 });
  const after = usePower(g);
  assert.equal(pos(after, 'p0-s1'), 5);
  assert.equal(after.current, 1);
  assert.deepEqual(after.moveDecks[0].discard, [3]);
});
