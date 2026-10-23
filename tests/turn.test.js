import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/rules/index.js';
import {
  JOKER, MOVE_DECK, POWERS,
  canUsePower, createGame, currentMoves, draftOptions, drawCard, playDraft,
  playDrawnNumber, powerUseChoices, usePower,
} from '../src/rules/index.js';
import { gameWith, pos } from './helpers.js';

const sorted = (xs) => [...xs].map(String).sort();

// --- drawing ---

test('drawing takes the top card of your own deck', () => {
  const g = gameWith({}, { firstPlayer: 1 });
  const top = g.moveDecks[1].draw[0];
  const after = drawCard(g);
  assert.equal(after.drawn, top);
  assert.equal(after.moveDecks[1].draw.length, 7);
  assert.deepEqual(after.moveDecks[1].discard, [top]);
  assert.deepEqual(after.moveDecks[0], g.moveDecks[0]);
});

test('you cannot draw twice in one turn', () => {
  assert.throws(() => drawCard(drawCard(gameWith())));
});

test('drawing from an empty deck reshuffles all 8 cards first', () => {
  const g = gameWith({}, {
    moveDecks: [{ draw: [], discard: [...MOVE_DECK] }, { draw: [1], discard: [] }],
  });
  const after = drawCard(g);
  const deck = after.moveDecks[0];
  assert.equal(deck.draw.length, 7);
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

// --- using a held power ---

const BEFORE = { powerTiming: 'beforeDraw' };

/** Player 0 to move, holding `power`, with decks and positions set. */
function holding(power, { config = {}, deck = [3, 2, JOKER], positions = {}, powerDeck = [POWERS.HERMIT, POWERS.DEVIL] } = {}) {
  const base = createGame({ seed: 1, firstPlayer: 0, config });
  const units = base.units.map((u) => (u.id in positions ? { ...u, pos: positions[u.id] } : u));
  return { ...base, units, held: [power, null], powerDeck, moveDecks: [{ draw: deck, discard: [] }, { draw: [1], discard: [] }] };
}

test('no held power: nothing to use', () => {
  const g = drawCard(holding(null));
  assert.ok(!canUsePower(g));
  assert.deepEqual(powerUseChoices(g), []);
  assert.throws(() => usePower(g));
});

test('after draw: the power replaces the drawn card, which stays spent', () => {
  const g = drawCard(holding(POWERS.TOWER, { positions: { 'p0-s1': 2 } }));
  assert.equal(g.drawn, 3);
  assert.ok(canUsePower(g));
  const after = usePower(g);
  assert.equal(after.held[0], null);
  assert.deepEqual(after.powerDeck, [POWERS.HERMIT, POWERS.DEVIL, POWERS.TOWER]);
  assert.deepEqual(after.moveDecks[0].discard, [3]);
  assert.equal(after.drawn, null);
  assert.equal(after.current, 1);
  assert.equal(pos(after, 'p0-s1'), 2);
});

test('after draw: the power can be used even when the card has a valid move', () => {
  const g = drawCard(holding(POWERS.TOWER));
  assert.ok(currentMoves(g).length > 0);
  assert.ok(canUsePower(g));
});

test('after draw: not before drawing', () => {
  assert.ok(!canUsePower(holding(POWERS.TOWER)));
});

test('a joker while holding a power: draft, or use the power instead', () => {
  const g = drawCard(holding(POWERS.TOWER, { deck: [JOKER] }));
  assert.ok(canUsePower(g));
  assert.ok(R.canDraft(g));
  const used = usePower(g);
  assert.equal(used.held[0], null);
  assert.equal(used.current, 1);
  const drafted = playDraft(g, 0);
  assert.equal(drafted.held[0], POWERS.HERMIT);
  assert.ok(drafted.powerDeck.includes(POWERS.TOWER));
});

test('a power drafted this turn is first usable next turn', () => {
  let g = playDraft(drawCard(holding(null, { deck: [JOKER, 2, 3], powerDeck: [POWERS.TOWER, POWERS.DEVIL] })), 0);
  assert.equal(g.current, 1);
  g = R.playDrawnNumber(drawCard(g), { unit: 'p1-s1' });
  g = drawCard(g);
  assert.equal(g.current, 0);
  assert.ok(canUsePower(g));
});

test('before draw: the power replaces drawing; the deck is untouched', () => {
  const g = holding(POWERS.TOWER, { config: BEFORE });
  assert.ok(canUsePower(g));
  const after = usePower(g);
  assert.deepEqual(after.moveDecks[0], g.moveDecks[0]);
  assert.equal(after.current, 1);
  assert.ok(!canUsePower(drawCard(holding(POWERS.TOWER, { config: BEFORE }))));
});

test('powerTiming is validated', () => {
  assert.throws(() => createGame({ config: { powerTiming: 'whenever' } }), /powerTiming/);
});

test('with powers off nothing can be used', () => {
  const g = drawCard(holding(POWERS.TOWER, { config: { powers: false } }));
  assert.ok(!canUsePower(g));
});
