import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME, JOKER, POWERS, DUD, canUsePower, canUsePowerUpsideDown, createGame, currentMoves, drawCard,
  draftOptions, playDraft, playDrawnNumber, upsideDownCost, usePower, usePowerUpsideDown,
} from '../src/rules/index.js';
import { gameWith, pos, soldiersOut } from './helpers.js';

// Default board: path 1-3 start lane, 4-12 middle lane, 13-14 end lane;
// towers 7 and 14, campsite 5; ascending is step 15.

/** Player 0 holds `held`, has `stars` stars and has drawn the first card of `deck`. */
function playing(positions, {
  deck = [3, 1, 2], discard = [], config, held = POWERS.TOWER, stars = [1, 0], draw = true,
} = {}) {
  const g = gameWith(positions, {
    config,
    moveDecks: [{ draw: deck, discard }, { draw: [1], discard: [] }],
    held: [held, null],
    powerDeck: [POWERS.DEVIL, POWERS.LOVERS],
    stars,
  });
  return draw ? drawCard(g) : g;
}

// --- stars -----------------------------------------------------------------

test('stars: each player starts with none', () => {
  assert.deepEqual(createGame({ seed: 3 }).stars, [0, 0]);
});

test('stars: a capture gives the victim one star per unit killed', () => {
  const g = playing({ 'p0-s1': 3, 'p1-s1': 6, 'p1-s2': 6 }, { stars: [0, 0], held: null });
  const after = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(after, 'p1-s1'), HOME);
  assert.deepEqual(after.stars, [0, 2]);
});

test('stars: units destroyed by your own power give you stars too', () => {
  // The Tower destroys both teams' units on towers (path cells 7 and 14).
  const g = playing({ 'p0-s1': 7, 'p0-s2': 14, 'p1-s1': 14 }, { stars: [0, 0] });
  const after = usePower(g);
  assert.deepEqual(after.stars, [2, 1]);
});

test('stars: units killed by the Devil give their owner stars', () => {
  // p0-s1 is the Devil at 8; p0-s2 at 9 and p1-s1 at 7 collide with it.
  const g = playing({ 'p0-s1': 8, 'p0-s2': 9, 'p1-s1': 7, 'p1-s2': 11 }, { stars: [0, 0], held: POWERS.DEVIL });
  const after = usePower(g, { unit: 'p0-s1' });
  assert.equal(pos(after, 'p0-s2'), HOME);
  assert.equal(pos(after, 'p1-s1'), HOME);
  assert.deepEqual(after.stars, [1, 1]);
});

test('stars: the Hanged Man moving a unit back past the first cell is not a death', () => {
  const g = playing({ 'p0-s1': 2 }, { stars: [0, 0], held: POWERS.HANGED_MAN });
  const after = playDrawnNumber(usePower(g), { unit: 'p0-s1' });
  assert.equal(pos(after, 'p0-s1'), HOME);
  assert.deepEqual(after.stars, [0, 0]);
});

test('stars: a Hanged Man backward capture gives the victim a star', () => {
  const g = playing({ 'p0-s1': 9, 'p1-s1': 6 }, { stars: [0, 0], held: POWERS.HANGED_MAN });
  const after = playDrawnNumber(usePower(g), { unit: 'p0-s1' });
  assert.equal(pos(after, 'p1-s1'), HOME);
  assert.deepEqual(after.stars, [0, 1]);
});

test('stars: no limit', () => {
  const g = playing({ 'p0-s1': 3, 'p1-s1': 6 }, { stars: [0, 41], held: null });
  assert.deepEqual(playDrawnNumber(g, { unit: 'p0-s1' }).stars, [0, 42]);
});

// --- using a power upside down ---------------------------------------------------

test('upside down: costs 1 star for every power (test effect)', () => {
  for (const p of Object.values(POWERS)) assert.equal(upsideDownCost(p), 1);
});

test('upside down: needs enough stars, a real power and the rule switch', () => {
  assert.ok(canUsePowerUpsideDown(playing({}, { stars: [1, 0] })));
  assert.ok(!canUsePowerUpsideDown(playing({}, { stars: [0, 5] })), 'no stars');
  assert.ok(!canUsePowerUpsideDown(playing({}, { held: null })), 'no power');
  assert.ok(!canUsePowerUpsideDown(playing({}, { held: DUD, config: { powerDeck: [DUD] } })), 'dud');
  assert.ok(!canUsePowerUpsideDown(playing({}, { config: { rules: { upsideDown: false } } })), 'switch off');
  assert.ok(!canUsePowerUpsideDown(playing({}, { draw: false })), 'after draw: draw first');
  assert.throws(() => usePowerUpsideDown(playing({}, { stars: [0, 0] })));
});

test('upside down: pays the star, the card goes to the bottom, then a one-cell step', () => {
  const g = usePowerUpsideDown(playing({ 'p0-s1': 4 }, { stars: [2, 0] }));
  assert.deepEqual(g.stars, [1, 0]);
  assert.equal(g.held[0], null);
  assert.deepEqual(g.powerDeck, [POWERS.DEVIL, POWERS.LOVERS, POWERS.TOWER]);
  assert.deepEqual(g.upsideDown, { stage: 'step', card: 3 });
  assert.equal(g.drawn, 1);
  // A fully normal one-cell move: units on the board, or entering onto cell 1.
  assert.deepEqual(currentMoves(g).map((m) => m.unit).sort(), ['p0-s1', 'p0-s2', 'p0-s3', 'p0-s4', 'p0-s5']);
  assert.ok(!canUsePower(g));
});

test('upside down: after the step the turn card is played as a normal move, by any unit', () => {
  let g = usePowerUpsideDown(playing({ 'p0-s1': 8 }));
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 9);
  assert.equal(g.current, 0);
  assert.equal(g.drawn, 3);
  assert.deepEqual(g.upsideDown, { stage: 'card' });
  assert.ok(currentMoves(g).some((m) => m.unit === 'p0-s1'));
  assert.ok(currentMoves(g).some((m) => m.unit === 'p0-s2'));
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 12);
  assert.equal(g.current, 1);
  assert.equal(g.upsideDown, null);
  assert.equal(g.drawn, null);
});

test('upside down: the turn card stays in the discard pile once; the step adds no card', () => {
  let g = usePowerUpsideDown(playing({ 'p0-s1': 8 }));
  g = playDrawnNumber(playDrawnNumber(g, { unit: 'p0-s1' }), { unit: 'p0-s1' });
  assert.deepEqual(g.moveDecks[0].discard, [3]);
});

test('upside down: the step can capture (the victim gains a star)', () => {
  let g = usePowerUpsideDown(playing({ 'p0-s1': 8, 'p1-s1': 9 }, { stars: [1, 0] }));
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p1-s1'), HOME);
  assert.deepEqual(g.stars, [0, 1]);
});

test('upside down: the step can ascend from the last cell; it can win the game', () => {
  const g = usePowerUpsideDown(playing({ 'p0-s1': 14 }));
  assert.equal(pos(playDrawnNumber(g, { unit: 'p0-s1' }), 'p0-s1'), 15);

  const all = { ...soldiersOut(0, [15, 15, 15, 15, 15]), 'p0-c1': 14 };
  const won = playDrawnNumber(usePowerUpsideDown(playing(all)), { unit: 'p0-c1' });
  assert.equal(won.winner, 0);
  assert.equal(won.upsideDown, null);
});

test('upside down: the commander may step with an escort', () => {
  const g = usePowerUpsideDown(playing({ ...soldiersOut(0, [8, 1, 2, 3, 6]), 'p0-c1': 8 }));
  assert.ok(currentMoves(g).some((m) => m.unit === 'p0-c1' && m.escort === 'p0-s1'));
});

test('upside down: a step onto the campsite resolves its card first, then the turn card', () => {
  // p0-s1 steps 4 -> 5 (campsite); the pick comes from the discard pile [2, 2, 3].
  let g = usePowerUpsideDown(playing({ 'p0-s1': 4 }, { discard: [2, 2] }));
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.ok(g.campsite);
  assert.equal(g.campsite.unit, 'p0-s1');
  const card = g.drawn;
  assert.ok([2, 3].includes(card));
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 5 + card);
  assert.equal(g.drawn, 3);
  assert.deepEqual(g.upsideDown, { stage: 'card' });
  assert.equal(g.current, 0);
});

test('upside down: a power drafted at the campsite during the step is not usable on the turn card', () => {
  let g = usePowerUpsideDown(playing({ 'p0-s1': 4 }, { discard: [JOKER], deck: [JOKER, 1] }));
  // Turn card is a Joker; the campsite pick can only be the Joker.
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(g.drawn, JOKER);
  assert.ok(g.campsite);
  g = playDraft(g, 0);
  assert.equal(g.held[0], POWERS.DEVIL);
  assert.equal(g.drawn, JOKER, 'now the turn card (a Joker)');
  assert.deepEqual(g.upsideDown, { stage: 'card' });
  assert.ok(!canUsePower(g));
  assert.ok(!canUsePowerUpsideDown(g));
});

test('upside down: on a drawn Joker, step, then the Joker drafts', () => {
  let g = usePowerUpsideDown(playing({ 'p0-s1': 8 }, { deck: [JOKER, 1] }));
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(g.drawn, JOKER);
  assert.deepEqual(draftOptions(g), [POWERS.DEVIL, POWERS.LOVERS]);
  g = playDraft(g, 1);
  assert.equal(g.held[0], POWERS.LOVERS);
  assert.equal(g.current, 1);
  assert.equal(g.upsideDown, null);
});

test('upside down: before draw, the step comes first, then the card is drawn', () => {
  const config = { powerTiming: 'beforeDraw' };
  let g = playing({ 'p0-s1': 8 }, { config, draw: false });
  assert.ok(canUsePowerUpsideDown(g));
  g = usePowerUpsideDown(g);
  assert.deepEqual(g.upsideDown, { stage: 'step', card: null });
  assert.equal(g.drawn, 1);
  assert.deepEqual(g.moveDecks[0].discard, []);
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(g.drawn, 3);
  assert.deepEqual(g.moveDecks[0].discard, [3]);
  assert.deepEqual(g.upsideDown, { stage: 'card' });
});

test('upside down: with no unit able to step, the star is spent and the card is played', () => {
  // Two soldiers on 6 can't step onto the enemy-held tower at 7; everyone else has ascended.
  const positions = { ...soldiersOut(0, [6, 6, 15, 15, 15]), 'p0-c1': 15, 'p1-s1': 7 };
  const g = usePowerUpsideDown(playing(positions));
  assert.deepEqual(g.stars, [0, 0]);
  assert.equal(g.drawn, 3);
  assert.deepEqual(g.upsideDown, { stage: 'card' });
  assert.deepEqual(currentMoves(g).map((m) => m.unit).sort(), ['p0-s1', 'p0-s2']);
});
