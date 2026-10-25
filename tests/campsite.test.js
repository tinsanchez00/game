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

test('landing on the campsite: the same unit moves the same number again', () => {
  let g = drawing({ 'p0-s1': 3, 'p0-s2': 1 });
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 5);
  assert.equal(g.current, 0);
  assert.deepEqual(g.campsite, { unit: 'p0-s1' });
  assert.equal(g.drawn, 2, 'the landing move again');
  assert.deepEqual(g.moveDecks[0], { draw: [], discard: [2] }, 'the card stays in the discard pile');
  assert.deepEqual(currentMoves(g).map((m) => m.unit), ['p0-s1']);
  assert.ok(!canUsePower(g));
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 7);
  assert.equal(g.current, 1);
  assert.equal(g.campsite, null);
});

test('the campsite repeats the landing move\'s number, whatever is in the discard pile', () => {
  for (const discard of [[1, 1, 4], [JOKER, JOKER], []]) {
    for (let rng = 1; rng <= 20; rng += 1) {
      const g = playDrawnNumber(drawing({ 'p0-s1': 3 }, { discard, rng }), { unit: 'p0-s1' });
      assert.equal(g.drawn, 2);
      assert.equal(g.rng, rng, 'no random pick');
    }
  }
});

test('a repeat that lands on a campsite again repeats again', () => {
  const base = createGame({ seed: 1, firstPlayer: 0, config: { board: { campsites: [5, 7], towers: [14] } } });
  let g = drawCard({
    ...base,
    units: base.units.map((u) => (u.id === 'p0-s1' ? { ...u, pos: 3 } : u)),
    moveDecks: [{ draw: [2], discard: [] }, { draw: [1], discard: [] }],
  });
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 5);
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 7);
  assert.deepEqual(g.campsite, { unit: 'p0-s1' });
  assert.equal(g.drawn, 2);
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 9);
  assert.equal(g.current, 1);
});

test('a Hanged Man move backward onto the campsite repeats forward, then the extra turn', () => {
  let g = drawing({ 'p0-s1': 7 }, { deck: [2, 1], held: [POWERS.HANGED_MAN, null] });
  g = playDrawnNumber(usePower(g), { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 5);
  assert.deepEqual(g.campsite, { unit: 'p0-s1' });
  assert.equal(g.drawn, 2);
  assert.deepEqual(currentMoves(g), [{ unit: 'p0-s1' }]);
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 7, 'forward');
  assert.equal(g.current, 0, 'the extra turn follows');
  assert.equal(g.drawn, null);
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

test("after a Hanged Man move, the extra turn's move onto the campsite triggers it", () => {
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
