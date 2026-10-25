import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME, JOKER, POWERS, canUsePower, createGame, currentMoves, drawCard, playDraft, playDrawnNumber, powerUseChoices, usePower,
} from '../src/rules/index.js';
import { gameWith, pos } from './helpers.js';

// Default board: path 1-3 start lane, 4-12 middle lane, 13-14 end lane;
// towers 7 and 14, campsite 5; ascending is step 15.

/** Player 0 holds the Hermit and has just drawn the first card of `deck`. */
function playing(positions, { deck = [3, 1, 2], config, held = POWERS.HERMIT } = {}) {
  return drawCard(gameWith(positions, {
    config,
    moveDecks: [{ draw: deck, discard: [] }, { draw: [1], discard: [] }],
    held: [held, null],
    powerDeck: [POWERS.TOWER, POWERS.DEVIL],
  }));
}

test('Hermit: only usable when the card can move a unit onto an ally', () => {
  assert.ok(!canUsePower(playing({ 'p0-s1': 2 })), 'no move lands on an ally');
  const g = playing({ 'p0-s1': 6, 'p0-s2': 9 });
  assert.ok(canUsePower(g));
  assert.deepEqual(powerUseChoices(g), [{}]);
});

test('Hermit: the unit moves onto its ally, then the ally moves the same number; the turn ends', () => {
  const g = usePower(playing({ 'p0-s1': 6, 'p0-s2': 9 }));
  assert.equal(g.current, 0);
  assert.equal(g.drawn, 3);
  assert.deepEqual(g.hermit, { stage: 'move', steps: 3 });
  assert.equal(g.held[0], null);
  assert.deepEqual(g.powerDeck, [POWERS.TOWER, POWERS.DEVIL, POWERS.HERMIT]);
  // Only moves onto an ally: units entering from home (onto empty cell 3) don't count.
  assert.deepEqual(currentMoves(g), [{ unit: 'p0-s1' }]);
  const after = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(after, 'p0-s1'), 9);
  assert.equal(pos(after, 'p0-s2'), 12);
  assert.equal(after.current, 1);
  assert.equal(after.hermit, null);
});

test("Hermit: the ally's move captures as usual", () => {
  const g = usePower(playing({ 'p0-s1': 6, 'p0-s2': 9, 'p1-s1': 12 }));
  const after = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(after, 'p0-s2'), 12);
  assert.equal(pos(after, 'p1-s1'), HOME);
});

test("Hermit: if the ally can't move it stays (here: past ascension)", () => {
  const g = usePower(playing({ 'p0-s1': 10, 'p0-s2': 13 }));
  const after = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(after, 'p0-s1'), 13);
  assert.equal(pos(after, 'p0-s2'), 13);
  assert.equal(after.current, 1);
});

test('Hermit: no escort; the commander moves alone', () => {
  const g = usePower(playing({ 'p0-c1': 6, 'p0-s1': 6, 'p0-s2': 9, 'p0-s3': 1, 'p0-s4': 1, 'p0-s5': 2 }));
  const moves = currentMoves(g);
  assert.ok(moves.length > 0);
  assert.ok(moves.every((m) => !m.escort));
});

test("Hermit: the ally's landing doesn't trigger the campsite", () => {
  const g = usePower(playing({ 'p0-s1': 1, 'p0-s2': 3 }, { deck: [2, 1, 3] }));
  const after = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(after, 'p0-s2'), 5);
  assert.equal(after.campsite, null);
  assert.equal(after.hermit, null);
  assert.equal(after.current, 1, 'the turn ends');
});

test("Hermit: landing on an ally on the campsite doesn't draw the mover's own campsite card", () => {
  const g = usePower(playing({ 'p0-s1': 2, 'p0-s2': 5 }));
  const after = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(after, 'p0-s1'), 5);
  assert.equal(pos(after, 'p0-s2'), 8);
  assert.equal(after.campsite, null);
  assert.equal(after.current, 1);
});

test('Hermit: no chain — an ally pushed onto another ally stops there', () => {
  const g = usePower(playing({ 'p0-s1': 3, 'p0-s2': 6, 'p0-s3': 9 }));
  const after = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(after, 'p0-s2'), 9);
  assert.equal(pos(after, 'p0-s3'), 9);
  assert.equal(after.current, 1);
});

test('Hermit (after draw): not usable on a drawn Joker', () => {
  const g = playing({ 'p0-s1': 6, 'p0-s2': 9 }, { deck: [JOKER, 3] });
  assert.ok(!canUsePower(g));
});

test('Hermit (before draw): a Joker drafts as usual; a card with no move onto an ally is a normal move', () => {
  const before = { powerTiming: 'beforeDraw' };
  const base = (deck, positions) => gameWith(positions, {
    config: before,
    moveDecks: [{ draw: deck, discard: [] }, { draw: [1], discard: [] }],
    held: [POWERS.HERMIT, null],
    powerDeck: [POWERS.TOWER, POWERS.DEVIL],
  });
  const joker = usePower(base([JOKER, 3], { 'p0-s1': 6, 'p0-s2': 9 }));
  assert.equal(joker.drawn, JOKER);
  assert.equal(joker.hermit, null);
  assert.equal(playDraft(joker, 0).held[0], POWERS.TOWER);

  const plain = usePower(base([1, 3], { 'p0-s1': 6, 'p0-s2': 9 }));
  assert.equal(plain.drawn, 1);
  assert.equal(plain.hermit, null, 'no move onto an ally with a 1');
  assert.ok(currentMoves(plain).length > 0);

  const hermit = usePower(base([3, 1], { 'p0-s1': 6, 'p0-s2': 9 }));
  assert.deepEqual(hermit.hermit, { stage: 'move', steps: 3 });
});

test('Hermit: a whole default game still runs (smoke)', () => {
  assert.ok(createGame({ seed: 5 }));
});
