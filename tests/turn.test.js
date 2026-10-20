import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JOKER, MOVE_DECK, POWERS,
  canPlayHeldPower, currentMoves, draftOptions, drawCard, playDraft,
  playDrawnNumber, playHeldPower,
} from '../src/rules/index.js';
import { gameWith, pos } from './helpers.js';

const sorted = (xs) => [...xs].map(String).sort();

// --- drawing ---

test('drawing takes the top card of your own deck', () => {
  const g = gameWith({}, { firstPlayer: 1 });
  const top = g.moveDecks[1].draw[0];
  const after = drawCard(g);
  assert.equal(after.drawn, top);
  assert.equal(after.moveDecks[1].draw.length, 8);
  assert.deepEqual(after.moveDecks[1].discard, [top]);
  assert.deepEqual(after.moveDecks[0], g.moveDecks[0]);
});

test('you cannot draw twice in one turn', () => {
  assert.throws(() => drawCard(drawCard(gameWith())));
});

test('drawing from an empty deck reshuffles all 9 cards first', () => {
  const g = gameWith({}, {
    moveDecks: [{ draw: [], discard: [...MOVE_DECK] }, { draw: [1], discard: [] }],
  });
  const after = drawCard(g);
  const deck = after.moveDecks[0];
  assert.equal(deck.draw.length, 8);
  assert.deepEqual(deck.discard, [after.drawn]);
  assert.deepEqual(sorted([...deck.draw, ...deck.discard]), sorted(MOVE_DECK));
  assert.notEqual(after.rng, g.rng);
});

// --- number cards ---

test('a drawn number card moves a unit and passes the turn', () => {
  const g = gameWith({}, { moveDecks: [{ draw: [2], discard: [] }, { draw: [1], discard: [] }] });
  const drawn = drawCard(g);
  assert.ok(currentMoves(drawn).length > 0);
  const after = playDrawnNumber(drawn, { unit: 'p0-s1' });
  assert.equal(pos(after, 'p0-s1'), 2);
  assert.equal(after.drawn, null);
  assert.equal(after.current, 1);
});

test('a number card cannot be played as a joker and vice versa', () => {
  const num = drawCard(gameWith({}, { moveDecks: [{ draw: [3], discard: [] }, { draw: [], discard: [] }] }));
  assert.throws(() => playDraft(num, 0));
  const jok = drawCard(gameWith({}, { moveDecks: [{ draw: [JOKER], discard: [] }, { draw: [], discard: [] }] }));
  assert.throws(() => playDrawnNumber(jok, { unit: 'p0-s1' }));
});

// --- jokers: draft ---

function jokerGame(extra = {}, positions = {}) {
  return drawCard(gameWith(positions, {
    moveDecks: [{ draw: [JOKER], discard: [] }, { draw: [JOKER], discard: [] }],
    powerDeck: [POWERS.TOWER, POWERS.HERMIT, POWERS.DEVIL, POWERS.LOVERS, POWERS.HANGED_MAN],
    ...extra,
  }));
}

test('drafting shows the top two power cards', () => {
  assert.deepEqual(draftOptions(jokerGame()), [POWERS.TOWER, POWERS.HERMIT]);
});

test('drafting keeps one; the other goes to the bottom; the turn passes', () => {
  const after = playDraft(jokerGame(), 1);
  assert.equal(after.held[0], POWERS.HERMIT);
  assert.deepEqual(after.powerDeck, [POWERS.DEVIL, POWERS.LOVERS, POWERS.HANGED_MAN, POWERS.TOWER]);
  assert.equal(after.current, 1);
  assert.equal(after.drawn, null);
});

test('drafting while holding a power sends the old one to the bottom', () => {
  const g = jokerGame({
    held: [POWERS.LOVERS, null],
    powerDeck: [POWERS.TOWER, POWERS.HERMIT, POWERS.DEVIL, POWERS.HANGED_MAN],
  });
  const after = playDraft(g, 0);
  assert.equal(after.held[0], POWERS.TOWER);
  assert.deepEqual(after.powerDeck, [POWERS.DEVIL, POWERS.HANGED_MAN, POWERS.LOVERS, POWERS.HERMIT]);
});

// --- jokers: play a held power ---

test('without a held power, only drafting is possible', () => {
  const g = jokerGame();
  assert.ok(!canPlayHeldPower(g));
  assert.throws(() => playHeldPower(g));
});

test('a played power goes to the bottom of the power deck and is no longer held', () => {
  const g = jokerGame({ held: [POWERS.TOWER, null], powerDeck: [POWERS.HERMIT] });
  const after = playHeldPower(g);
  assert.equal(after.held[0], null);
  assert.deepEqual(after.powerDeck, [POWERS.HERMIT, POWERS.TOWER]);
  assert.equal(after.current, 1);
});
