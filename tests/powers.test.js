import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME, JOKER, POWERS,
  canUsePower, canUsePowerUpsideDown, createGame, currentMoves, drawCard, loversTargets, playDraft, playDrawnNumber,
  powerUpsideDownChoices, powerUseChoices, upsideDownCost, usePower, usePowerUpsideDown,
} from '../src/rules/index.js';
import { gameWith, pos, soldiersOut } from './helpers.js';

// Default board: path 1-3 start lane, 4-12 middle lane, 13-14 end lane;
// towers on 7 and 14, campsite on 5; ascending is step 15.

/**
 * Player 0 holds `power` with `stars`, and has just drawn the first card of
 * `deck` (after-draw timing, so the power is usable now).
 */
function playing(power, positions = {}, { deck = [3, 1, 2], discard = [], stars = [9, 0], draw = true, ...extra } = {}) {
  const g = gameWith(positions, {
    moveDecks: [{ draw: deck, discard }, { draw: [1], discard: [] }],
    held: [power, null],
    powerDeck: [POWERS.DEVIL, POWERS.HERMIT],
    stars,
    ...extra,
  });
  return draw ? drawCard(g) : g;
}

const sorted = (xs) => [...xs].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

test('upside-down costs: Tower 2, Lovers 1, Devil 3, Hanged Man 4, Hermit 1', () => {
  assert.equal(upsideDownCost(POWERS.TOWER), 2);
  assert.equal(upsideDownCost(POWERS.LOVERS), 1);
  assert.equal(upsideDownCost(POWERS.DEVIL), 3);
  assert.equal(upsideDownCost(POWERS.HANGED_MAN), 4);
  assert.equal(upsideDownCost(POWERS.HERMIT), 1);
});

test('upside down needs enough stars; the cost is paid and the card goes to the bottom', () => {
  assert.ok(!canUsePowerUpsideDown(playing(POWERS.DEVIL, { 'p0-s1': 6 }, { stars: [2, 9] })));
  const g = usePowerUpsideDown(playing(POWERS.DEVIL, { 'p0-s1': 6 }, { stars: [5, 0] }), { unit: 'p0-s1' });
  assert.deepEqual(g.stars, [2, 0]);
  assert.equal(g.held[0], null);
  assert.deepEqual(g.powerDeck, [POWERS.DEVIL, POWERS.HERMIT, POWERS.DEVIL]);
});

// --- The Tower ---

test('Tower upright: any unit on a tower steps one cell forward, then the card is played as usual', () => {
  let g = playing(POWERS.TOWER, { 'p0-s1': 7, 'p1-s1': 14, 'p0-s2': 2 });
  assert.deepEqual(sorted(powerUseChoices(g)), sorted([{ unit: 'p0-s1' }, { unit: 'p1-s1' }]));
  g = usePower(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 8);
  assert.equal(g.current, 0);
  assert.equal(g.drawn, 3);
  assert.equal(g.held[0], null);
  assert.ok(!canUsePower(g));
  g = playDrawnNumber(g, { unit: 'p0-s2' });
  assert.equal(pos(g, 'p0-s2'), 5, 'the card moves any unit');
});

test("Tower upright: an enemy unit on its last tower steps into ascension; a step captures", () => {
  const up = usePower(playing(POWERS.TOWER, { 'p1-s1': 14 }), { unit: 'p1-s1' });
  assert.equal(pos(up, 'p1-s1'), 15);
  const cap = usePower(playing(POWERS.TOWER, { 'p1-s1': 7, 'p0-s1': 8 }, { stars: [0, 0] }), { unit: 'p1-s1' });
  assert.equal(pos(cap, 'p1-s1'), 8);
  assert.equal(pos(cap, 'p0-s1'), HOME);
  assert.deepEqual(cap.stars, [1, 0]);
});

test('Tower upright: stepping the last enemy unit into ascension ends the game for them', () => {
  const all = { ...soldiersOut(1, [15, 15, 15, 15, 15]), 'p1-c1': 14 };
  const g = usePower(playing(POWERS.TOWER, all), { unit: 'p1-c1' });
  assert.equal(g.winner, 1);
});

test('Tower upright: the step needs room and follows tower protection; no step: it cannot be used', () => {
  // p0-s1 on 7 can't step onto 8 (two allies there).
  const full = playing(POWERS.TOWER, { 'p0-s1': 7, 'p0-s2': 8, 'p0-s3': 8 });
  assert.ok(!canUsePower(full));
  assert.ok(!canUsePower(playing(POWERS.TOWER, { 'p0-s1': 5 })), 'nobody on a tower');
  assert.ok(!canUsePower(playing(POWERS.TOWER, { 'p0-s1': 7 }, { deck: [JOKER, 1] })), 'free power: not on a drawn Joker');
});

test('Tower upright: the step does not trigger the campsite', () => {
  const g = usePower(playing(POWERS.TOWER, { 'p0-s1': 14, 'p1-s1': 7 }, { config: { board: { campsites: [8] } } }), { unit: 'p1-s1' });
  assert.equal(pos(g, 'p1-s1'), 8);
  assert.equal(g.campsite, null);
  assert.equal(g.drawn, 3);
});

test('Tower upright, before draw: step first, then the card is drawn', () => {
  let g = playing(POWERS.TOWER, { 'p0-s1': 7 }, { draw: false, config: { powerTiming: 'beforeDraw' } });
  assert.ok(canUsePower(g));
  g = usePower(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 8);
  assert.equal(g.drawn, 3);
});

test('Tower upside down (2 stars): destroys every unit on every tower, both teams; the card is spent', () => {
  let g = playing(POWERS.TOWER, { 'p0-s1': 7, 'p0-s2': 14, 'p1-s1': 7, 'p1-s2': 14, 'p0-s4': 4 }, { stars: [2, 0], config: { rules: { towersProtect: false } } });
  g = usePowerUpsideDown(g);
  for (const id of ['p0-s1', 'p0-s2', 'p1-s1', 'p1-s2']) assert.equal(pos(g, id), HOME, id);
  assert.equal(pos(g, 'p0-s4'), 4);
  assert.deepEqual(g.stars, [2, 2], 'paid 2, gained 2; the opponent gained 2');
  assert.equal(g.current, 1);
});

test('Tower upside down can be used on a drawn Joker (the Joker is spent)', () => {
  const g = playing(POWERS.TOWER, { 'p0-s1': 7 }, { deck: [JOKER, 1], stars: [2, 0] });
  assert.ok(canUsePowerUpsideDown(g));
  assert.equal(usePowerUpsideDown(g).current, 1);
});

// --- The Lovers ---

test('Lovers: a unit sees the nearest unit each way along its whole path; it must be an ally', () => {
  const g = playing(POWERS.LOVERS, { 'p0-s1': 2, 'p0-s2': 6, 'p0-s3': 13 });
  assert.deepEqual(loversTargets(g, 'p0-s2'), [2], '2 is 4 behind, 13 is 7 ahead: the nearest');
  assert.deepEqual(loversTargets(g, 'p0-s1'), [6], 'across lanes');
  const blocked = playing(POWERS.LOVERS, { 'p0-s1': 2, 'p1-s1': 4, 'p0-s2': 6 });
  assert.deepEqual(loversTargets(blocked, 'p0-s2'), [], 'an enemy at 4 blocks the view back; nothing ahead');
  assert.deepEqual(loversTargets(blocked, 'p0-s1'), [], 'no jumping past an enemy');
  const tie = playing(POWERS.LOVERS, { 'p0-s1': 4, 'p0-s2': 6, 'p0-s3': 8 });
  assert.deepEqual(loversTargets(tie, 'p0-s2').sort((a, b) => a - b), [4, 8], 'equally near: either');
});

test("Lovers: a full ally cell can't be jumped onto, and the unit doesn't look past it", () => {
  const g = playing(POWERS.LOVERS, { 'p0-s1': 6, 'p0-s2': 8, 'p0-s3': 8, 'p0-s4': 10 });
  assert.deepEqual(loversTargets(g, 'p0-s1'), []);
});

test('Lovers upright: jump instead of the move; the card is spent; usable on a drawn Joker', () => {
  let g = playing(POWERS.LOVERS, { 'p0-s1': 2, 'p0-s2': 6 });
  assert.deepEqual(sorted(powerUseChoices(g)), sorted([{ unit: 'p0-s1', to: 6 }, { unit: 'p0-s2', to: 2 }]));
  g = usePower(g, { unit: 'p0-s1', to: 6 });
  assert.equal(pos(g, 'p0-s1'), 6);
  assert.equal(g.current, 1);
  assert.deepEqual(g.moveDecks[0].discard, [3]);
  const joker = playing(POWERS.LOVERS, { 'p0-s1': 2, 'p0-s2': 6 }, { deck: [JOKER, 1] });
  assert.ok(canUsePower(joker));
});

test('Lovers: a jump onto the campsite does not trigger it and never captures', () => {
  const g = usePower(playing(POWERS.LOVERS, { 'p0-s1': 9, 'p0-s2': 5 }), { unit: 'p0-s1', to: 5 });
  assert.equal(pos(g, 'p0-s1'), 5);
  assert.equal(g.campsite, null);
  assert.equal(g.current, 1);
});

test('Lovers upside down (1 star): an enemy unit jumps to its own nearest ally; your units block its sight', () => {
  let g = playing(POWERS.LOVERS, { 'p1-s1': 10, 'p1-s2': 4, 'p0-s1': 2 }, { stars: [1, 0] });
  assert.deepEqual(sorted(powerUpsideDownChoices(g)), sorted([{ unit: 'p1-s1', to: 4 }, { unit: 'p1-s2', to: 10 }]));
  g = usePowerUpsideDown(g, { unit: 'p1-s1', to: 4 });
  assert.equal(pos(g, 'p1-s1'), 4);
  assert.deepEqual(g.stars, [0, 0]);
  const blocked = playing(POWERS.LOVERS, { 'p1-s1': 10, 'p0-s1': 6, 'p1-s2': 4 }, { stars: [1, 0] });
  assert.deepEqual(powerUpsideDownChoices(blocked), [{}], 'no enemy can jump: usable to no effect');
});

// --- The Devil ---

test('Devil upright: units just before and after one of your units die, both teams; anywhere on the board', () => {
  let g = playing(POWERS.DEVIL, { 'p0-s1': 8, 'p0-s2': 9, 'p1-s1': 7, 'p1-s2': 10, 'p0-s3': 2 }, { stars: [0, 0] });
  g = usePower(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 8, 'the Devil unit survives');
  assert.equal(pos(g, 'p0-s2'), HOME);
  assert.equal(pos(g, 'p1-s1'), HOME, 'towers do not protect');
  assert.equal(pos(g, 'p1-s2'), 10, 'two cells away: untouched');
  assert.deepEqual(g.stars, [1, 1]);
  assert.equal(g.current, 1);

  const priv = usePower(playing(POWERS.DEVIL, { 'p0-s1': 2, 'p0-s2': 1, 'p0-s3': 3, 'p1-s1': 2 }), { unit: 'p0-s1' });
  assert.equal(pos(priv, 'p0-s2'), HOME);
  assert.equal(pos(priv, 'p0-s3'), HOME);
  assert.equal(pos(priv, 'p1-s1'), 2, "the other team's start lane is a different cell");
});

test("Devil upright: a unit sharing the Devil's cell dies; only your own units can be chosen", () => {
  const g = playing(POWERS.DEVIL, { 'p0-s1': 6, 'p0-s2': 6, 'p1-s1': 9 });
  assert.deepEqual(sorted(powerUseChoices(g)), sorted([{ unit: 'p0-s1' }, { unit: 'p0-s2' }]));
  assert.equal(pos(usePower(g, { unit: 'p0-s1' }), 'p0-s2'), HOME);
});

test('Devil upside down (3 stars): any middle-lane unit; every unit on the board moves one cell toward it', () => {
  let g = playing(POWERS.DEVIL, {
    'p1-s1': 8, // the Devil (an enemy unit)
    'p0-s1': 2, 'p0-s2': 7, 'p0-s3': 13, 'p1-s2': 10, 'p1-s3': 9, 'p0-s4': 8,
  }, { stars: [3, 0] });
  assert.ok(powerUpsideDownChoices(g).some((c) => c.unit === 'p1-s1'));
  assert.ok(!powerUpsideDownChoices(g).some((c) => c.unit === 'p0-s1'), 'only units in the middle lane');
  g = usePowerUpsideDown(g, { unit: 'p1-s1' });
  assert.equal(pos(g, 'p1-s1'), 8);
  assert.equal(pos(g, 'p0-s1'), 3, 'start lane: one cell forward');
  assert.equal(pos(g, 'p0-s2'), HOME, 'reaches it: dies');
  assert.equal(pos(g, 'p1-s3'), HOME, 'reaches it: dies');
  assert.equal(pos(g, 'p0-s4'), HOME, 'shared its cell: dies');
  assert.equal(pos(g, 'p1-s2'), 9);
  assert.equal(pos(g, 'p0-s3'), 12, 'end lane: one cell back');
  assert.deepEqual(g.stars, [2, 1]);
});

// --- The Hanged Man ---

test('Hanged Man upright: one of your units moves back by the card, then an extra turn', () => {
  let g = usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 11, 'p1-s1': 8 }, { stars: [0, 0] }));
  assert.deepEqual(g.hanged, { stage: 'back', unit: null, enemy: false });
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 8);
  assert.equal(pos(g, 'p1-s1'), HOME);
  assert.deepEqual(g.stars, [0, 1]);
  assert.equal(g.current, 0);
  assert.equal(g.hanged, null);
  assert.equal(g.drawn, null);
});

test('Hanged Man upright: no backward move after draw, or a drawn Joker: it cannot be used', () => {
  assert.ok(!canUsePower(playing(POWERS.HANGED_MAN, {})));
  assert.ok(!canUsePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 10 }, { deck: [JOKER, 2] })));
  assert.ok(!canUsePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 10, 'p1-s1': 7 })), "10 - 3 is the opponent's tower");
});

test('Hanged Man before draw: a Joker drafts and the turn ends, no extra turn', () => {
  let g = usePower(playing(POWERS.HANGED_MAN, { 'p0-s1': 10 }, { deck: [JOKER, 2], draw: false, config: { powerTiming: 'beforeDraw' } }));
  g = playDraft(g, 0);
  assert.equal(g.current, 1);
});

test('Hanged Man upside down (4 stars): an enemy unit moves back by the card, then you take an extra turn', () => {
  let g = playing(POWERS.HANGED_MAN, { 'p1-s1': 9, 'p0-s1': 6, 'p0-s2': 11, 'p1-s2': 10 }, { stars: [4, 0] });
  assert.ok(canUsePowerUpsideDown(g));
  g = usePowerUpsideDown(g);
  assert.deepEqual(g.stars, [0, 0]);
  assert.deepEqual(g.hanged, { stage: 'back', unit: null, enemy: true });
  // 10 - 3 = 7 is a tower held by... nobody: allowed; 9 - 3 = 6 holds your unit: a capture.
  assert.deepEqual(currentMoves(g).map((m) => m.unit).sort(), ['p1-s1', 'p1-s2'], "only the opponent's units on the board");
  g = playDrawnNumber(g, { unit: 'p1-s1' });
  assert.equal(pos(g, 'p1-s1'), 6);
  assert.equal(pos(g, 'p0-s1'), HOME, 'it captures your unit');
  assert.deepEqual(g.stars, [1, 0], 'your killed unit gives you a star');
  assert.equal(g.current, 0, 'extra turn for you');
});

test('Hanged Man upside down: past its first cell the enemy unit goes home (no star); no campsite', () => {
  const home = playDrawnNumber(usePowerUpsideDown(playing(POWERS.HANGED_MAN, { 'p1-s1': 2 }, { stars: [4, 0] })), { unit: 'p1-s1' });
  assert.equal(pos(home, 'p1-s1'), HOME);
  assert.deepEqual(home.stars, [0, 0]);
  const camp = playDrawnNumber(usePowerUpsideDown(playing(POWERS.HANGED_MAN, { 'p1-s1': 8 }, { stars: [4, 0], discard: [2] })), { unit: 'p1-s1' });
  assert.equal(pos(camp, 'p1-s1'), 5);
  assert.equal(camp.campsite, null);
  assert.equal(camp.current, 0);
});

test('Hanged Man upside down: no enemy unit can move back: it cannot be used', () => {
  assert.ok(!canUsePowerUpsideDown(playing(POWERS.HANGED_MAN, { 'p0-s1': 10 }, { stars: [4, 0] })));
});

// --- The Hermit (upright: see hermit.test.js) ---

test('Hermit upside down (1 star): a number from your discard pile stands in for the card', () => {
  // Discard [1, 4] plus the drawn 3. From 6: 1 -> 7 (no ally), 3 -> 9 (no ally), 4 -> 10 (ally).
  let g = playing(POWERS.HERMIT, { 'p0-s1': 6, 'p0-s2': 10 }, { discard: [1, 4, JOKER], stars: [1, 0] });
  assert.deepEqual(powerUpsideDownChoices(g), [{ card: 4 }]);
  g = usePowerUpsideDown(g, { card: 4 });
  assert.deepEqual(g.hermit, { stage: 'move', steps: 4 });
  assert.equal(g.drawn, 4);
  assert.deepEqual(currentMoves(g), [{ unit: 'p0-s1' }]);
  g = playDrawnNumber(g, { unit: 'p0-s1' });
  assert.equal(pos(g, 'p0-s1'), 10);
  assert.equal(pos(g, 'p0-s2'), 14, 'the ally copies the 4');
  assert.deepEqual(g.moveDecks[0].discard, [1, 4, JOKER, 3], 'the pile is unchanged');
  assert.equal(g.current, 1);
});

test('Hermit upside down works on a drawn Joker; not when no pile number reaches an ally', () => {
  const joker = playing(POWERS.HERMIT, { 'p0-s1': 6, 'p0-s2': 8 }, { deck: [JOKER, 1], discard: [2], stars: [1, 0] });
  assert.deepEqual(powerUpsideDownChoices(joker), [{ card: 2 }]);
  const none = playing(POWERS.HERMIT, { 'p0-s1': 6 }, { discard: [2], stars: [1, 0] });
  assert.ok(!canUsePowerUpsideDown(none));
});

// --- general ---

test('a power with nothing to hit can still be used to skip the drawn card', () => {
  const g = usePower(playing(POWERS.DEVIL, {}));
  assert.equal(g.current, 1);
  assert.deepEqual(g.moveDecks[0].discard, [3]);
});

test('a dud is drafted and held like a power but can never be used, either way up', () => {
  let g = drawCard(gameWith({ 'p0-s1': 3 }, {
    config: { powerDeck: ['dud', 'dud', 'devil'] },
    moveDecks: [{ draw: [JOKER, 2], discard: [] }, { draw: [1, 1], discard: [] }],
    powerDeck: ['dud', 'devil', 'dud'],
    stars: [9, 9],
  }));
  g = playDraft(g, 0);
  assert.equal(g.held[0], 'dud');
  g = playDrawnNumber(drawCard(g), { unit: 'p1-s1' }); // opponent's turn
  g = drawCard(g);
  assert.ok(!canUsePower(g));
  assert.ok(!canUsePowerUpsideDown(g));
  assert.deepEqual(powerUseChoices(g), []);
});

test('with upside-down powers switched off, no power can be used upside down', () => {
  assert.ok(!canUsePowerUpsideDown(playing(POWERS.DEVIL, { 'p0-s1': 6 }, { config: { rules: { upsideDown: false } } })));
});

test('every game starts with no stars', () => {
  assert.deepEqual(createGame({ seed: 4 }).stars, [0, 0]);
});
