import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JOKER, POWERS, canUsePower, drawCard, loversJumps, playDrawnNumber, playLoversJump,
  powerUseChoices, usePower,
} from '../src/rules/index.js';
import { gameWith, pos } from './helpers.js';

// rules.loversLine. Default board: path 1-3 start lane, 4-12 middle lane,
// 13-14 end lane; towers 7 and 14; campsite 5.
const LINE = { rules: { loversLine: true } };

/** Player 0 holds the Lovers and has just drawn the first card of `deck`. */
function playing(positions, { deck = [3, 1, 2], config = LINE } = {}) {
  return drawCard(gameWith(positions, {
    config,
    moveDecks: [{ draw: deck, discard: [] }, { draw: [1], discard: [] }],
    held: [POWERS.LOVERS, null],
    powerDeck: [POWERS.TOWER, POWERS.HERMIT],
  }));
}

test('line Lovers: always usable, no target; the card is then played as a normal move', () => {
  const g0 = playing({ 'p0-s1': 4, 'p0-s2': 10 });
  assert.ok(canUsePower(g0));
  assert.deepEqual(powerUseChoices(g0), [{}]);
  const g = usePower(g0, {});
  assert.equal(g.current, 0);
  assert.equal(g.drawn, 3);
  assert.deepEqual(g.lovers, { stage: 'move' });
  assert.equal(g.held[0], null);
  assert.deepEqual(g.powerDeck, [POWERS.TOWER, POWERS.HERMIT, POWERS.LOVERS]);
  assert.ok(!canUsePower(g));
});

test('line Lovers: after the move, the unit may jump onto the ally it sees ahead in its lane', () => {
  let g = usePower(playing({ 'p0-s1': 4, 'p0-s2': 10 }), {});
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 7);
  assert.deepEqual(g.lovers, { stage: 'jump', unit: 'p0-s1' });
  assert.deepEqual(loversJumps(g), [{ unit: 'p0-s1', to: 10 }]);
  const after = playLoversJump(g, { unit: 'p0-s1', to: 10 });
  assert.equal(pos(after, 'p0-s1'), 10);
  assert.equal(after.current, 1);
  assert.equal(after.lovers, null);
});

test('line Lovers: the jump is optional', () => {
  let g = usePower(playing({ 'p0-s1': 4, 'p0-s2': 10 }), {});
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  const after = playLoversJump(g, null);
  assert.equal(pos(after, 'p0-s1'), 7);
  assert.equal(after.current, 1);
  assert.equal(after.lovers, null);
});

test('line Lovers: no jump when the first unit ahead is an enemy; the turn ends', () => {
  let g = usePower(playing({ 'p0-s1': 4, 'p1-s1': 9, 'p0-s2': 10 }), {});
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(g.current, 1);
  assert.equal(g.lovers, null);
});

test('line Lovers: an ally already paired up has no room', () => {
  let g = usePower(playing({ 'p0-s1': 4, 'p0-s2': 10, 'p0-s3': 10 }), {});
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(g.current, 1);
});

test('line Lovers: lanes are separate and only allies ahead count', () => {
  // Ends on 3 (last start-lane cell): the ally on 5 is in the middle lane.
  let g = usePower(playing({ 'p0-s1': 1, 'p0-s2': 5 }, { deck: [2, 1] }), {});
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 3);
  assert.equal(g.current, 1);
  // Ends on 9: the ally on 6 is behind it.
  g = usePower(playing({ 'p0-s1': 8, 'p0-s2': 6 }, { deck: [1, 2] }), {});
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 9);
  assert.equal(g.current, 1);
});

test('line Lovers: a shown Joker is spent (no draft) and any unit that sees an ally may jump', () => {
  const g = usePower(playing({ 'p0-s1': 4, 'p0-s2': 10, 'p0-s3': 13, 'p0-s4': 14 }, { deck: [JOKER, 1] }), {});
  assert.equal(g.drawn, null);
  assert.equal(g.held[0], null);
  assert.deepEqual(g.powerDeck, [POWERS.TOWER, POWERS.HERMIT, POWERS.LOVERS]);
  assert.deepEqual(g.lovers, { stage: 'jump', unit: null });
  assert.deepEqual(loversJumps(g), [{ unit: 'p0-s1', to: 10 }, { unit: 'p0-s3', to: 14 }]);
  const after = playLoversJump(g, { unit: 'p0-s3', to: 14 });
  assert.equal(pos(after, 'p0-s3'), 14);
  assert.equal(after.current, 1);
});

test('line Lovers: a number card with no valid move works like a Joker', () => {
  // One soldier and the commander, both in the end lane: a 4 can't be played.
  const config = { ...LINE, soldiers: 1 };
  const g = usePower(playing({ 'p0-s1': 13, 'p0-c1': 14 }, { deck: [4, 1], config }), {});
  assert.deepEqual(g.lovers, { stage: 'jump', unit: null });
  assert.deepEqual(loversJumps(g), [{ unit: 'p0-s1', to: 14 }]);
});

test('line Lovers: no jump anywhere ends the turn at once', () => {
  const g = usePower(playing({}, { deck: [JOKER, 1] }), {});
  assert.equal(g.current, 1);
  assert.equal(g.lovers, null);
});

test('line Lovers: a campsite landing resolves its card first, then the jump', () => {
  // 2 + 3 lands on the campsite (5); the only discarded card is that 3: 5 -> 8.
  let g = usePower(playing({ 'p0-s1': 2, 'p0-s2': 10 }), {});
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 5);
  assert.deepEqual(g.campsite, { unit: 'p0-s1' });
  assert.equal(g.drawn, 3);
  assert.deepEqual(g.lovers, { stage: 'move' });
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 8);
  assert.deepEqual(loversJumps(g), [{ unit: 'p0-s1', to: 10 }]);
});

test('line Lovers: a jump onto the campsite does not trigger it', () => {
  let g = usePower(playing({ 'p0-s1': 3, 'p0-s2': 5 }, { deck: [1, 2] }), {});
  g = playDrawnNumber(g, { unit: 'p0-s1' }); // 3 -> 4, sees the ally on 5
  const after = playLoversJump(g, { unit: 'p0-s1', to: 5 });
  assert.equal(pos(after, 'p0-s1'), 5);
  assert.equal(after.campsite, null);
  assert.equal(after.current, 1);
});

test('line Lovers off (default): the Lovers keeps its pairing effect', () => {
  const g = playing({ 'p0-s1': 5, 'p0-s2': 10 }, { config: {} });
  assert.ok(powerUseChoices(g).some((c) => c.unit === 'p0-s1' && c.target === 'p0-s2'));
});
