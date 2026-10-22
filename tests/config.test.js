import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/rules/index.js';
import { boardSlots, gridPosition } from '../src/ui/layout.js';
import { initModel, interactions, update } from '../src/ui/controller.js';

const { JOKER, HOME } = R;

/** A game with `config` overrides, player 0 to move, units placed by id. */
function game(config = {}, positions = {}, extra = {}) {
  const base = R.createGame({ seed: 9, firstPlayer: 0, config });
  return {
    ...base,
    ...extra,
    units: base.units.map((u) => (u.id in positions ? { ...u, pos: positions[u.id] } : u)),
  };
}
const pos = (s, id) => R.getUnit(s, id).pos;
const decks = (p0, p1 = [1]) => [{ draw: p0, discard: [] }, { draw: p1, discard: [] }];
const has = (moves, unit, escort) =>
  moves.some((m) => m.unit === unit && (m.escort ?? null) === (escort ?? null));

// --- the settings object ---------------------------------------------------

test('defaults match the rulebook', () => {
  const c = R.makeConfig();
  assert.deepEqual(c, R.DEFAULT_CONFIG);
  assert.equal(c.powers, true);
  assert.deepEqual([...c.moveDeck], [1, 2, 2, 3, 3, 3, 4, JOKER]);
  assert.equal(c.soldiers, 5);
  assert.equal(c.commanders, 1);
  assert.equal(c.maxPerCell, 2);
  assert.deepEqual({ ...c.board, towers: [...c.board.towers], campsites: [...c.board.campsites] },
    { startLane: 3, middleLane: 9, endLane: 2, towers: [7, 14], campsites: [5] });
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.board.towers) && Object.isFrozen(c.board.campsites));
});

test('overrides merge into the defaults; lists are replaced', () => {
  const c = R.makeConfig({ soldiers: 3, board: { middleLane: 10, towers: [10, 4] }, rules: { escort: false } });
  assert.equal(c.soldiers, 3);
  assert.equal(c.commanders, 1);
  assert.equal(c.board.startLane, 3);
  assert.equal(c.board.middleLane, 10);
  assert.deepEqual([...c.board.towers], [4, 10]);
  assert.deepEqual([...c.board.campsites], [5]);
  assert.deepEqual([...R.makeConfig({ board: { campsites: [9, 6] } }).board.campsites], [6, 9]);
  assert.equal(c.rules.escort, false);
  assert.equal(c.rules.exactAscend, true);
});

test('bad settings are rejected with a clear message', () => {
  assert.throws(() => R.makeConfig({ soldier: 3 }), /unknown setting "soldier"/);
  assert.throws(() => R.makeConfig({ moveDeck: [] }), /at least one card/);
  assert.throws(() => R.makeConfig({ moveDeck: [0, 2] }), /positive integer/);
  assert.throws(() => R.makeConfig({ soldiers: 0, commanders: 0 }), /at least one unit/);
  assert.throws(() => R.makeConfig({ board: { towers: [15] } }), /outside the path/);
  assert.throws(() => R.makeConfig({ powerDeck: ['the-fool'] }), /unknown power/);
  assert.throws(() => R.makeConfig({ rules: { escort: 'yes' } }), /true or false/);
  assert.throws(() => R.makeConfig({ maxPerCell: 0 }), /maxPerCell/);
  assert.throws(() => R.makeConfig({ board: { campsites: [15] } }), /outside the path/);
  assert.throws(() => R.makeConfig({ board: { campsites: [5, 5] } }), /duplicates/);
  assert.throws(() => R.makeConfig({ board: { campsites: [7] } }), /both a tower and a campsite/);
});

test('a game carries its settings', () => {
  const g = R.createGame({ seed: 1, config: { soldiers: 2 } });
  assert.equal(g.config.soldiers, 2);
  assert.equal(JSON.parse(JSON.stringify(g)).config.soldiers, 2);
});

// --- powers on/off ---------------------------------------------------------

test('with powers off a joker is a no-move card', () => {
  let g = game({ powers: false }, { 'p0-s1': 3 }, { moveDecks: decks([JOKER, 2]) });
  assert.deepEqual(g.powerDeck, []);
  g = R.drawCard(g);
  assert.equal(g.drawn, JOKER);
  assert.ok(R.mustPassJoker(g));
  assert.deepEqual(R.draftOptions(g), []);
  assert.throws(() => R.playDraft(g, 0));
  assert.ok(!R.canUsePower(g));
  const after = R.passJoker(g);
  assert.equal(after.current, 1);
  assert.equal(after.drawn, null);
  assert.equal(pos(after, 'p0-s1'), 3);
});

test('with powers on, passJoker is refused while drafting is possible', () => {
  const g = R.drawCard(game({}, {}, { moveDecks: decks([JOKER]) }));
  assert.ok(!R.mustPassJoker(g));
  assert.throws(() => R.passJoker(g));
});

// --- decks -------------------------------------------------------------------

test('custom move decks are dealt and reshuffled from the settings', () => {
  const g = R.createGame({ seed: 4, config: { moveDeck: [2, 2, 5] } });
  for (const p of [0, 1]) assert.deepEqual([...g.moveDecks[p].draw].sort(), [2, 2, 5]);
  let s = { ...g, moveDecks: decks([], []), current: 0 };
  s = R.drawCard(s);
  assert.deepEqual([...s.moveDecks[0].draw, ...s.moveDecks[0].discard].sort(), [2, 2, 5]);
});

test('custom power decks are used', () => {
  const g = R.createGame({ seed: 4, config: { powerDeck: ['tower', 'tower', 'hermit'] } });
  assert.deepEqual([...g.powerDeck].sort(), ['hermit', 'tower', 'tower']);
});

// --- units -------------------------------------------------------------------

test('team size follows soldiers and commanders', () => {
  const g = R.createGame({ seed: 2, config: { soldiers: 3, commanders: 2 } });
  const team = g.units.filter((u) => u.player === 0).map((u) => u.id);
  assert.deepEqual(team, ['p0-s1', 'p0-s2', 'p0-s3', 'p0-c1', 'p0-c2']);
});

test('every commander waits for the soldiers; with no soldiers they move at once', () => {
  const two = game({ commanders: 2, rules: { commanderLock: true } });
  assert.ok(!legalMovesFor(two).some((m) => m.unit.includes('-c')));
  const none = game({ soldiers: 0, commanders: 2 });
  assert.ok(has(legalMovesFor(none), 'p0-c1'));
  assert.ok(has(legalMovesFor(none), 'p0-c2'));
});
function legalMovesFor(s, steps = 2) {
  return R.legalMoves(s, 0, steps);
}

test('a team with no commander wins when its soldiers ascend', () => {
  const g = game({ soldiers: 2, commanders: 0 }, { 'p0-s1': 15, 'p0-s2': 14 });
  const after = R.applyMove(g, { unit: 'p0-s2' }, 1);
  assert.equal(after.winner, 0);
});

// --- stacking ----------------------------------------------------------------------

test('maxPerCell 1 forbids stacking and escorts', () => {
  const s = { 'p0-s1': 6, 'p0-s2': 1, 'p0-s3': 2, 'p0-s4': 3, 'p0-s5': 5 };
  const g = game({ maxPerCell: 1 }, { ...s, 'p0-c1': 8 });
  assert.ok(!has(R.legalMoves(g, 0, 2), 'p0-s1')); // 6 -> 8 is taken
  assert.ok(!R.legalMoves(g, 0, 2).some((m) => m.escort));
});

test('maxPerCell 3 allows three of a team on one cell', () => {
  const g = game({ maxPerCell: 3 }, { 'p0-s1': 3, 'p0-s2': 3 });
  assert.ok(has(R.legalMoves(g, 0, 3), 'p0-s3'));
});

// --- board shape -------------------------------------------------------------------

test('lane lengths set the path, the cell count and ascension', () => {
  const c = R.makeConfig({ board: { startLane: 3, middleLane: 10, endLane: 3, towers: [3, 9, 16] } });
  const geo = R.geometry(c);
  assert.equal(geo.pathLength, 16);
  assert.equal(geo.ascended, 17);
  assert.equal(geo.cellCount, 2 * (3 + 3) + 10);
  const ids = new Set();
  for (const p of [0, 1]) for (let x = 1; x <= 16; x += 1) ids.add(geo.cellId(p, x));
  assert.equal(ids.size, geo.cellCount);
  assert.ok(geo.isShared(4) && geo.isShared(13) && !geo.isShared(14));
  assert.ok(geo.isTower(9) && !geo.isTower(8));
});

test('units ascend one past the last cell of a custom path', () => {
  const g = game({ board: { middleLane: 6, towers: [] } }, { 'p0-s1': 11 });
  assert.equal(R.geometry(g.config).ascended, 12);
  assert.ok(has(R.legalMoves(g, 0, 1), 'p0-s1'));
  assert.equal(pos(R.applyMove(g, { unit: 'p0-s1' }, 1), 'p0-s1'), 12);
});

test('the screen grid follows the board shape', () => {
  const config = R.makeConfig({ board: { startLane: 3, middleLane: 6, endLane: 3, towers: [3] } });
  const geo = R.geometry(config);
  for (const viewer of [0, 1]) {
    const slots = boardSlots(viewer, config);
    assert.equal(slots.filter((s) => !s.gap).length, geo.cellCount);
    for (const player of [0, 1]) {
      for (let p = 1; p <= geo.pathLength; p += 1) {
        const { row, col } = gridPosition(player, p, viewer, config);
        const slot = slots.find((s) => s.row === row && s.col === col);
        assert.equal(slot.key, geo.cellId(player, p));
      }
    }
  }
});

// --- rule switches ------------------------------------------------------------------

test('exactAscend off: overshooting ascends', () => {
  const g = game({ rules: { exactAscend: false } }, { 'p0-s1': 13 });
  assert.ok(has(R.legalMoves(g, 0, 4), 'p0-s1'));
  assert.equal(pos(R.applyMove(g, { unit: 'p0-s1' }, 4), 'p0-s1'), 15);
});

test('commanderLock off: the commander moves with soldiers at home', () => {
  assert.ok(has(R.legalMoves(game({ rules: { commanderLock: false } }), 0, 2), 'p0-c1'));
});

test('escort off: commanders move alone', () => {
  const s = { 'p0-s1': 6, 'p0-s2': 1, 'p0-s3': 2, 'p0-s4': 3, 'p0-s5': 5 };
  const g = game({ rules: { escort: false } }, { ...s, 'p0-c1': 6 });
  assert.ok(has(R.legalMoves(g, 0, 2), 'p0-c1'));
  assert.ok(!R.legalMoves(g, 0, 2).some((m) => m.escort));
});

test('towersProtect off: units on towers can be captured', () => {
  const g = game({ rules: { towersProtect: false } }, { 'p0-s1': 5, 'p1-s1': 8 });
  const after = R.applyMove(g, { unit: 'p0-s1' }, 3);
  assert.equal(pos(after, 'p1-s1'), HOME);
});

test('towerExtraTurn on: landing on a tower gives another turn', () => {
  const g = game({ rules: { towerExtraTurn: true } }, { 'p0-s1': 4 });
  assert.equal(R.applyMove(g, { unit: 'p0-s1' }, 3).current, 0);
  assert.equal(R.applyMove(g, { unit: 'p0-s1' }, 2).current, 1);
});

// --- the screen with odd settings ----------------------------------------------------

test('the screen plays a full powers-off game on a custom board', () => {
  let rng = 77;
  const pick = (n) => {
    const r = R.nextRandom(rng);
    rng = r.rng;
    return Math.floor(r.value * n);
  };
  const config = {
    powers: false, soldiers: 3, commanders: 2, moveDeck: [1, 2, 3, JOKER],
    board: { startLane: 3, middleLane: 6, endLane: 3, towers: [3, 7] },
  };
  let m = initModel(R.createGame({ seed: 5, config }));
  const seen = new Set();
  for (let i = 0; m.game.winner === null; i += 1) {
    assert.ok(i < 20000, 'game did not finish');
    const ix = interactions(m);
    seen.add(ix.phase);
    let action;
    if (ix.phase === 'handoff') action = { type: 'handoff' };
    else if (ix.phase === 'draw') action = { type: 'draw' };
    else if (ix.phase === 'stuck' || ix.phase === 'jokerPass') action = { type: 'continue' };
    else if (ix.canConfirm) action = { type: 'confirm' };
    else if (ix.options.length) action = { type: 'option', value: ix.options[pick(ix.options.length)] };
    else action = { type: 'tap', key: ix.tappable[pick(ix.tappable.length)] };
    m = update(m, action);
  }
  assert.ok(seen.has('jokerPass'));
  assert.ok(!seen.has('joker') && !seen.has('draft'));
});
