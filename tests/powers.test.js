import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME, JOKER, POWERS,
  canUsePower, createGame, currentMoves, draftOptions, drawCard, playDraft, playDrawnNumber,
  powerUseChoices, usePower,
} from '../src/rules/index.js';
import { LOCK, gameWith, pos, soldiersOut } from './helpers.js';

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
// Default board: path 1-3 start lane, 4-12 middle lane, 13-14 end lane;
// towers on 7 and 14, campsite on 5.

test('Hanged Man: the drawn card is kept and will move backward', () => {
  const g = usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 11 }));
  assert.equal(g.current, 0);
  assert.equal(g.drawn, 3);
  assert.deepEqual(g.hanged, { stage: 'back', unit: null });
  assert.equal(g.held[0], null);
  assert.deepEqual(g.powerDeck, [POWERS.TOWER, POWERS.HERMIT, POWERS.HANGED_MAN]);
  assert.ok(!canUsePower(g));
});

test('Hanged Man: back by the card, then a new card moves the same unit forward, then the turn ends', () => {
  let g = usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 11, 'p0-s2': 2 }));
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 8);
  assert.equal(g.current, 0);
  assert.equal(g.drawn, null);
  assert.deepEqual(g.hanged, { stage: 'forward', unit: 'p0-s1' });
  assert.ok(!canUsePower(g));
  g = drawCard(g); // draws 1
  assert.deepEqual(currentMoves(g).map((m) => m.unit), ['p0-s1'], 'only the same unit moves forward');
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 9);
  assert.equal(g.current, 1, 'no extra turn');
  assert.equal(g.hanged, null);
});

test('Hanged Man: a backward move can kill', () => {
  const g = playDrawnNumber(usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 11, 'p1-s1': 8 })), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 8);
  assert.equal(pos(g, 'p1-s1'), HOME);
});

test('Hanged Man: going back past the first cell sends the unit home; the forward card enters it again', () => {
  let g = usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 2 }, { deck: [3, 2] }));
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), HOME);
  g = playDrawnNumber(drawCard(g), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 2);
  assert.equal(g.current, 1);
});

test('Hanged Man: backward moves respect towers', () => {
  const g = usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 10, 'p0-s2': 11, 'p1-s1': 7 }));
  assert.ok(!currentMoves(g).some((m) => m.unit === 'p0-s1'));
  assert.ok(currentMoves(g).some((m) => m.unit === 'p0-s2'));
});

test('Hanged Man: you must move backward when you can', () => {
  assert.throws(() => playDrawnNumber(usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 11 })), null));
});

test('Hanged Man (after draw): it cannot be used on a number card with no backward move', () => {
  const g = playing(POWERS.HANGED_MAN, {}); // every unit at home, drew a 3
  assert.ok(!canUsePower(g));
  assert.deepEqual(powerUseChoices(g), []);
  assert.throws(() => usePower(g));
  const blocked = playing(POWERS.HANGED_MAN, { 'p0-s1': 10, 'p1-s1': 7 }); // 10 - 3 is the opponent's tower
  assert.ok(!canUsePower(blocked));
  assert.ok(canUsePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 10 })));
});

test('Hanged Man (after draw): it can be used on a drawn joker wherever your units are', () => {
  assert.ok(canUsePower(playing(POWERS.HANGED_MAN, {}, { deck: [JOKER, 2] })));
});

test('Hanged Man (before draw): a card with no backward move spends it and ends the turn', () => {
  const base = createGame({ seed: 1, firstPlayer: 0, config: { powerTiming: 'beforeDraw' } });
  let g = {
    ...base,
    moveDecks: [{ draw: [3, 1], discard: [] }, { draw: [1], discard: [] }],
    held: [POWERS.HANGED_MAN, null],
  };
  assert.ok(canUsePower(g));
  g = usePower(g); // every unit at home: no backward move
  assert.equal(currentMoves(g).length, 0);
  g = playDrawnNumber(g, null);
  assert.equal(g.current, 1);
  assert.equal(g.held[0], null);
  assert.equal(g.hanged, null);
  assert.deepEqual(g.moveDecks[0].draw, [1], 'no forward card is drawn');
});

test('Hanged Man on a joker: draft, then the forward card is a normal move, then the turn ends', () => {
  let g = usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 10 }, { deck: [JOKER, 2] }));
  assert.equal(g.drawn, JOKER);
  assert.deepEqual(draftOptions(g), [POWERS.TOWER, POWERS.HERMIT]);
  g = playDraft(g, 0);
  assert.equal(g.held[0], POWERS.TOWER);
  assert.equal(g.current, 0);
  assert.deepEqual(g.hanged, { stage: 'forward', unit: null });
  g = drawCard(g);
  assert.ok(!canUsePower(g), 'the drafted power waits for your next turn');
  assert.ok(currentMoves(g).length > 1);
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 12);
  assert.equal(g.current, 1);
});

test('Hanged Man: a joker as the forward card drafts instead of moving', () => {
  let g = playDrawnNumber(usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 11 }, { deck: [3, JOKER] })), { unit: 'p0-s1' });
  g = drawCard(g);
  assert.equal(g.drawn, JOKER);
  g = playDraft(g, 1);
  assert.equal(g.held[0], POWERS.HERMIT);
  assert.equal(pos(g, 'p0-s1'), 8);
  assert.equal(g.current, 1);
});

test('Hanged Man: if the forward move is not valid, the unit stays', () => {
  let g = playDrawnNumber(usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 9, 'p1-s1': 7 }, { deck: [3, 1] })), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 6);
  g = drawCard(g); // 1 onto the tower the opponent holds
  assert.equal(currentMoves(g).length, 0);
  g = playDrawnNumber(g, null);
  assert.equal(pos(g, 'p0-s1'), 6);
  assert.equal(g.current, 1);
});

test('Hanged Man before drawing: you draw after using it; that card moves backward, the next forward', () => {
  const base = createGame({ seed: 1, firstPlayer: 0, config: { powerTiming: 'beforeDraw' } });
  let g = {
    ...base,
    units: base.units.map((u) => (u.id === 'p0-s1' ? { ...u, pos: 11 } : u)),
    moveDecks: [{ draw: [3, 1], discard: [] }, { draw: [1], discard: [] }],
    held: [POWERS.HANGED_MAN, null],
  };
  assert.ok(canUsePower(g));
  g = usePower(g);
  assert.equal(g.drawn, 3);
  assert.deepEqual(g.hanged, { stage: 'back', unit: null });
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 8);
  g = playDrawnNumber(drawCard(g), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 9);
  assert.equal(g.current, 1);
});

test('Hanged Man: the commander can bring its escort on both moves', () => {
  const units = { ...soldiersOut(0, [11, 1, 2, 3, 6]), 'p0-c1': 11 };
  let g = usePower(playing(POWERS.HANGED_MAN, units));
  g = playDrawnNumber(g, { unit: 'p0-c1', escort: 'p0-s1' });
  assert.equal(pos(g, 'p0-c1'), 8);
  assert.equal(pos(g, 'p0-s1'), 8);
  g = drawCard(g);
  assert.ok(currentMoves(g).some((m) => m.unit === 'p0-c1' && m.escort === 'p0-s1'));
  assert.ok(!currentMoves(g).some((m) => m.unit === 'p0-s1'));
  g = playDrawnNumber(g, { unit: 'p0-c1', escort: 'p0-s1' });
  assert.equal(pos(g, 'p0-c1'), 9);
  assert.equal(pos(g, 'p0-s1'), 9);
});

test('Hanged Man: a backward move onto the campsite triggers it before the forward card', () => {
  let g = usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 8 }, { deck: [3, 1] }));
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 5);
  assert.deepEqual(g.campsite, { unit: 'p0-s1' });
  assert.equal(g.drawn, 3, 'the only card in the discard pile');
  g = playDrawnNumber(g, { unit: 'p0-s1' }); // campsite card: forward 3
  assert.equal(pos(g, 'p0-s1'), 8);
  assert.deepEqual(g.hanged, { stage: 'forward', unit: 'p0-s1' });
  g = playDrawnNumber(drawCard(g), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 9);
  assert.equal(g.current, 1);
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

test('Lovers: a commander in the middle lane can be moved while soldiers are home', () => {
  const g = playing(POWERS.LOVERS, { 'p0-c1': 5, 'p0-s1': 11 }, { config: LOCK }); // soldiers still home
  assert.ok(powerUseChoices(g).some((c) => c.unit === 'p0-c1'));
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
    'p0-s1': 7, 'p0-s2': 14, 'p1-s1': 7, 'p1-s2': 14, 'p0-s4': 4,
  });
  const after = usePower(g);
  for (const id of ['p0-s1', 'p0-s2', 'p1-s1', 'p1-s2']) {
    assert.equal(pos(after, id), HOME, id);
  }
  assert.equal(pos(after, 'p0-s4'), 4);
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
  const g = playing(POWERS.HERMIT, { 'p0-s1': 7, 'p0-s2': 7, 'p0-s3': 2, 'p0-s4': 2 });
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

// --- dud cards (test-only) ---

test('a dud is drafted and held like a power but can never be used', () => {
  let g = drawCard(gameWith({ 'p0-s1': 3 }, {
    config: { powerDeck: ['dud', 'dud', 'devil'] },
    moveDecks: [{ draw: [JOKER, 2], discard: [] }, { draw: [1, 1], discard: [] }],
    powerDeck: ['dud', 'devil', 'dud'],
  }));
  g = playDraft(g, 0);
  assert.equal(g.held[0], 'dud');
  assert.deepEqual(g.powerDeck, ['dud', 'devil']);
  g = playDrawnNumber(drawCard(g), { unit: 'p1-s1' }); // opponent's turn
  g = drawCard(g);
  assert.ok(!canUsePower(g));
  assert.deepEqual(powerUseChoices(g), []);
});
