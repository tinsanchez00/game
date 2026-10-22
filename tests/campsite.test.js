import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME, JOKER, POWERS,
  canUsePower, createGame, currentMoves, draftOptions, drawCard, mustPassJoker, passJoker,
  playDraft, playDrawnNumber, usePower,
} from '../src/rules/index.js';
import { gameWith, pos, soldiersOut } from './helpers.js';

// Default board: the campsite is path cell 5 (2nd middle-lane cell); towers
// on 7 and 14.

/** Player 0 draws the first card of `deck` with `discard` already played. */
function drawing(positions, { deck = [2], discard = [], rng = 1, ...extra } = {}) {
  return drawCard(gameWith(positions, {
    rng,
    moveDecks: [{ draw: deck, discard }, { draw: [1], discard: [] }],
    powerDeck: [POWERS.TOWER, POWERS.HERMIT],
    ...extra,
  }));
}

test('landing on the campsite: a card from your discard pile moves the same unit again', () => {
  let g = drawing({ 'p0-s1': 3, 'p0-s2': 1 });
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 5);
  assert.equal(g.current, 0);
  assert.deepEqual(g.campsite, { unit: 'p0-s1' });
  assert.equal(g.drawn, 2, "this turn's card is in the discard pile");
  assert.deepEqual(g.moveDecks[0], { draw: [], discard: [2] }, 'the card stays in the discard pile');
  assert.deepEqual(currentMoves(g).map((m) => m.unit), ['p0-s1']);
  assert.ok(!canUsePower(g));
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 7);
  assert.equal(g.current, 1);
  assert.equal(g.campsite, null);
});

test('the campsite card is picked at random from the whole discard pile', () => {
  const seen = new Map();
  for (let rng = 1; rng <= 400; rng += 1) {
    const g = playDrawnNumber(drawing({ 'p0-s1': 3 }, { discard: [1, 1, 4], rng }), { unit: 'p0-s1' });
    seen.set(g.drawn, (seen.get(g.drawn) ?? 0) + 1);
  }
  assert.deepEqual([...seen.keys()].sort(), [1, 2, 4]);
  assert.ok(seen.get(1) > seen.get(4), 'two 1s are twice as likely as one 4');
});

test('the campsite move must be made when it is valid', () => {
  const g = playDrawnNumber(drawing({ 'p0-s1': 3 }), { unit: 'p0-s1' });
  assert.throws(() => playDrawnNumber(g, null));
});

test('if the campsite move is not valid, the unit stays', () => {
  let g = playDrawnNumber(drawing({ 'p0-s1': 3, 'p1-s1': 7 }), { unit: 'p0-s1' });
  assert.equal(currentMoves(g).length, 0, 'the opponent holds the tower two cells ahead');
  g = playDrawnNumber(g, null);
  assert.equal(pos(g, 'p0-s1'), 5);
  assert.equal(g.current, 1);
});

/** A seed whose campsite pick is a joker from a pile of jokers and one 2. */
function jokerPick(positions, extra = {}) {
  for (let rng = 1; rng < 100; rng += 1) {
    const g = playDrawnNumber(drawing(positions, { discard: [JOKER, JOKER, JOKER], rng, ...extra }), { unit: 'p0-s1' });
    if (g.drawn === JOKER) return g;
  }
  throw new Error('no seed picked a joker');
}

test('a joker from the campsite drafts a power instead; the unit stays', () => {
  let g = jokerPick({ 'p0-s1': 3 });
  assert.deepEqual(draftOptions(g), [POWERS.TOWER, POWERS.HERMIT]);
  g = playDraft(g, 0);
  assert.equal(g.held[0], POWERS.TOWER);
  assert.equal(pos(g, 'p0-s1'), 5);
  assert.equal(g.current, 1);
});

test('with powers off, a joker from the campsite does nothing', () => {
  const base = createGame({ seed: 1, firstPlayer: 0, config: { powers: false } });
  for (let rng = 1; rng < 100; rng += 1) {
    let g = drawCard({
      ...base,
      rng,
      units: base.units.map((u) => (u.id === 'p0-s1' ? { ...u, pos: 3 } : u)),
      moveDecks: [{ draw: [2], discard: [JOKER, JOKER, JOKER] }, { draw: [1], discard: [] }],
    });
    g = playDrawnNumber(g, { unit: 'p0-s1' });
    if (g.drawn !== JOKER) continue;
    assert.ok(mustPassJoker(g));
    g = passJoker(g);
    assert.equal(pos(g, 'p0-s1'), 5);
    assert.equal(g.current, 1);
    return;
  }
  assert.fail('no seed picked a joker');
});

test('a capture on the campsite happens before the unit moves on', () => {
  let g = playDrawnNumber(drawing({ 'p0-s1': 3, 'p1-s1': 5 }), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p1-s1'), HOME);
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 7);
});

test('a commander landing with its escort moves again and may bring it along', () => {
  const units = { ...soldiersOut(0, [3, 1, 2, 6, 8]), 'p0-c1': 3 };
  let g = playDrawnNumber(drawing(units), { unit: 'p0-c1', escort: 'p0-s1' });
  assert.equal(pos(g, 'p0-c1'), 5);
  const moves = currentMoves(g);
  assert.ok(moves.some((m) => m.unit === 'p0-c1' && m.escort === 'p0-s1'));
  assert.ok(moves.some((m) => m.unit === 'p0-c1' && !m.escort));
  assert.ok(!moves.some((m) => m.unit === 'p0-s1'));
  g = playDrawnNumber(g, { unit: 'p0-c1', escort: 'p0-s1' });
  assert.equal(pos(g, 'p0-c1'), 7);
  assert.equal(pos(g, 'p0-s1'), 7);
});

test('a Hanged Man forward move onto the campsite triggers it', () => {
  let g = drawing({ 'p0-s1': 6 }, { deck: [3, 2], held: [POWERS.HANGED_MAN, null] });
  g = playDrawnNumber(usePower(g), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 3);
  g = playDrawnNumber(drawCard(g), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 5);
  assert.deepEqual(g.campsite, { unit: 'p0-s1' });
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.ok(pos(g, 'p0-s1') > 5);
  assert.equal(g.current, 1);
});

test('powers that move a unit onto the campsite do not trigger it', () => {
  const lovers = usePower(drawing({ 'p0-s1': 10, 'p0-s2': 5 }, { held: [POWERS.LOVERS, null], config: { rules: { loversLine: false } } }), { unit: 'p0-s1', target: 'p0-s2' });
  assert.equal(pos(lovers, 'p0-s1'), 5);
  assert.equal(lovers.current, 1);
  assert.equal(lovers.campsite, null);

  const devil = usePower(drawing({ 'p0-s1': 4, 'p0-s2': 6 }, { held: [POWERS.DEVIL, null] }), { unit: 'p0-s1' });
  assert.equal(pos(devil, 'p0-s2'), 5);
  assert.equal(devil.current, 1);
  assert.equal(devil.campsite, null);
});

test('a campsite move onto a tower gives the extra turn when that setting is on', () => {
  const base = createGame({ seed: 1, firstPlayer: 0, config: { rules: { towerExtraTurn: true } } });
  let g = drawCard({
    ...base,
    units: base.units.map((u) => (u.id === 'p0-s1' ? { ...u, pos: 3 } : u)),
    moveDecks: [{ draw: [2, 1], discard: [] }, { draw: [1], discard: [] }],
  });
  g = playDrawnNumber(playDrawnNumber(g, { unit: 'p0-s1' }), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 7);
  assert.equal(g.current, 0);
  assert.equal(g.drawn, null);
  assert.equal(g.bonusTurn, false);
});

test('without campsites on the board, landing there ends the turn', () => {
  const base = createGame({ seed: 1, firstPlayer: 0, config: { board: { campsites: [] } } });
  let g = drawCard({
    ...base,
    units: base.units.map((u) => (u.id === 'p0-s1' ? { ...u, pos: 3 } : u)),
    moveDecks: [{ draw: [2], discard: [] }, { draw: [1], discard: [] }],
  });
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 5);
  assert.equal(g.current, 1);
});
