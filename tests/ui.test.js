import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/rules/index.js';
import { initModel, interactions, unitKey, update } from '../src/ui/controller.js';
import { boardSlots, gridPosition } from '../src/ui/layout.js';
import { view } from '../src/ui/view.js';

// --- layout ---------------------------------------------------------------

test('the board grid has 20 cells and 4 gaps for either viewer', () => {
  for (const viewer of [0, 1]) {
    const slots = boardSlots(viewer);
    assert.equal(slots.length, 24);
    const cells = slots.filter((s) => !s.gap);
    assert.equal(cells.length, 20);
    assert.equal(new Set(cells.map((s) => s.key)).size, 20);
    assert.equal(cells.filter((s) => s.tower).length, 5);
  }
});

test('every path position lands on the grid slot with the matching cell', () => {
  for (const viewer of [0, 1]) {
    const slots = boardSlots(viewer);
    for (const player of [0, 1]) {
      for (let pos = 1; pos <= R.PATH_LENGTH; pos += 1) {
        const { row, col } = gridPosition(player, pos, viewer);
        const slot = slots.find((s) => s.row === row && s.col === col);
        assert.equal(slot.key, R.cellId(player, pos), `viewer ${viewer} player ${player} pos ${pos}`);
        assert.equal(slot.tower, R.isTower(pos));
      }
    }
  }
});

test("the viewer's lane is the bottom row", () => {
  assert.equal(gridPosition(0, 1, 0).row, 2);
  assert.equal(gridPosition(0, 1, 1).row, 0);
  assert.equal(gridPosition(1, 6, 0).row, 1);
});

// --- whole games through the screen logic -------------------------------------

function makeRandom(seed) {
  let rng = seed;
  return (n) => {
    const r = R.nextRandom(rng);
    rng = r.rng;
    return Math.floor(r.value * n);
  };
}

function botAction(m, pick) {
  const ix = interactions(m);
  const any = (xs) => xs[pick(xs.length)];
  switch (ix.phase) {
    case 'handoff': return { type: 'handoff' };
    case 'draw': return { type: 'draw' };
    case 'stuck': return { type: 'continue' };
    case 'joker':
      return R.canPlayHeldPower(m.game) && pick(2) === 0 ? { type: 'joker-play' } : { type: 'joker-draft' };
    case 'draft': return { type: 'keep', index: pick(R.draftOptions(m.game).length) };
    case 'move':
      if (ix.canConfirm) return { type: 'confirm' };
      if (ix.options.length) return { type: 'option', value: any(ix.options) };
      return { type: 'tap', key: any(ix.tappable) };
    case R.POWERS.LOVERS:
      if (m.ui.pick?.unit) return { type: 'tap', key: any(ix.targets) };
      if (ix.options.length) return { type: 'option', value: any(ix.options) };
      return { type: 'tap', key: any(ix.tappable) };
    case R.POWERS.DEVIL:
      if (ix.canConfirm) return { type: 'confirm' };
      if (ix.options.length) return { type: 'option', value: any(ix.options) };
      return { type: 'tap', key: any(ix.tappable) };
    default:
      throw new Error(`bot: unexpected phase ${ix.phase}`);
  }
}

function checkInvariants(g) {
  assert.equal(g.units.length, 12);
  const byCell = new Map();
  for (const u of g.units) {
    const key = R.cellId(u.player, u.pos);
    if (key) byCell.set(key, [...(byCell.get(key) ?? []), u]);
  }
  for (const [key, units] of byCell) {
    const teams = new Set(units.map((u) => u.player));
    assert.ok(teams.size === 1, `two teams share ${key}`);
    assert.ok(units.length <= 2, `more than two units on ${key}`);
  }
}

test('bots can play complete games through the screen without errors', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 25; seed += 1) {
    const pick = makeRandom(seed * 7919);
    let m = initModel(R.createGame({ seed }));
    let steps = 0;
    while (m.game.winner === null) {
      steps += 1;
      assert.ok(steps < 40000, `seed ${seed}: game did not finish`);
      const html = view(m);
      assert.ok(html.includes('class="board"'));
      const action = botAction(m, pick);
      seen.add(interactions(m).phase);
      const next = update(m, action);
      assert.notEqual(next, m, `seed ${seed}: action ${JSON.stringify(action)} did nothing`);
      m = next;
      checkInvariants(m.game);
    }
    assert.ok(view(m).includes('overlay'));
    assert.ok(m.game.units.filter((u) => u.player === m.game.winner).every((u) => u.pos === R.ASCENDED));
  }
  for (const phase of ['handoff', 'draw', 'move', 'stuck', 'joker', 'draft', 'lovers', 'devil']) {
    assert.ok(seen.has(phase), `phase ${phase} never came up`);
  }
});

// --- specific screens ---------------------------------------------------------------

function modelWith(positions, extra) {
  const base = R.createGame({ seed: 3, firstPlayer: 0 });
  const game = {
    ...base,
    ...extra,
    units: base.units.map((u) => (u.id in positions ? { ...u, pos: positions[u.id] } : u)),
  };
  return initModel(game);
}

test('selecting a unit previews its destination and any capture', () => {
  let m = modelWith({ 'p0-s1': 3, 'p1-s1': 6 }, {
    moveDecks: [{ draw: [3], discard: [] }, { draw: [1], discard: [] }],
  });
  m = update(m, { type: 'draw' });
  m = update(m, { type: 'tap', key: unitKey(m.game, R.getUnit(m.game, 'p0-s1')) });
  const ix = interactions(m);
  assert.equal(ix.dest, 'shared-2');
  assert.deepEqual(ix.victims, ['p1-s1']);
  assert.ok(view(m).includes('cap'));
  m = update(m, { type: 'tap', key: 'shared-2' });
  assert.equal(R.getUnit(m.game, 'p1-s1').pos, R.HOME);
  assert.equal(interactions(m).phase, 'handoff');
});

test('a commander with an escort offers both options', () => {
  const soldiers = { 'p0-s1': 6, 'p0-s2': 1, 'p0-s3': 2, 'p0-s4': 3, 'p0-s5': 5 };
  let m = modelWith({ ...soldiers, 'p0-c1': 6 }, {
    moveDecks: [{ draw: [2], discard: [] }, { draw: [1], discard: [] }],
  });
  m = update(m, { type: 'draw' });
  m = update(m, { type: 'tap', key: 'shared-2' });
  const ix = interactions(m);
  assert.deepEqual(ix.options.sort(), ['commander', 'commander+escort', 'soldier']);
  m = update(m, { type: 'option', value: 'commander+escort' });
  m = update(m, { type: 'confirm' });
  assert.equal(R.getUnit(m.game, 'p0-c1').pos, 8);
  assert.equal(R.getUnit(m.game, 'p0-s1').pos, 8);
});

test('The Devil marks the units it would kill before you confirm', () => {
  let m = modelWith({ 'p0-s1': 8, 'p1-s1': 9, 'p1-s2': 11 }, {
    moveDecks: [{ draw: [R.JOKER], discard: [] }, { draw: [1], discard: [] }],
    held: [R.POWERS.DEVIL, null],
  });
  m = update(m, { type: 'draw' });
  m = update(m, { type: 'joker-play' });
  m = update(m, { type: 'tap', key: 'shared-4' });
  assert.deepEqual(interactions(m).victims, ['p1-s1']);
  assert.ok(view(m).includes('doomed'));
  m = update(m, { type: 'confirm' });
  assert.equal(R.getUnit(m.game, 'p1-s1').pos, R.HOME);
  assert.equal(R.getUnit(m.game, 'p1-s2').pos, 10);
});
