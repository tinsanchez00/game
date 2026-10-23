import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/rules/index.js';
import { initModel, interactions, unitKey, update } from '../src/ui/controller.js';
import { boardSlots, gridPosition } from '../src/ui/layout.js';
import { view } from '../src/ui/view.js';

// --- layout ---------------------------------------------------------------

test('the board grid has 19 cells and 8 gaps for either viewer', () => {
  for (const viewer of [0, 1]) {
    const slots = boardSlots(viewer);
    assert.equal(slots.length, 27);
    const cells = slots.filter((s) => !s.gap);
    assert.equal(cells.length, 19);
    assert.equal(new Set(cells.map((s) => s.key)).size, 19);
    assert.equal(cells.filter((s) => s.tower).length, 3);
    assert.deepEqual(cells.filter((s) => s.campsite).map((s) => s.key), ['shared-2']);
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
        assert.equal(slot.campsite, R.isCampsite(pos));
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

function botAction(m, pick, used) {
  const ix = interactions(m);
  const any = (xs) => xs[pick(xs.length)];
  // Use a held power now and then, whenever the screen offers it.
  if (ix.canUsePower && ix.phase !== 'joker' && pick(4) === 0) {
    used.add(m.game.held[m.game.current]);
    return { type: 'use-power' };
  }
  switch (ix.phase) {
    case 'handoff': return { type: 'handoff' };
    case 'draw': return { type: 'draw' };
    case 'stuck': return { type: 'continue' };
    case 'jokerPass': return { type: 'continue' };
    case 'joker':
      if (pick(2) === 0) {
        used.add(m.game.held[m.game.current]);
        return { type: 'use-power' };
      }
      return { type: 'joker-draft' };
    case 'draft': return { type: 'keep', index: pick(R.draftOptions(m.game).length) };
    case 'side': {
      const sides = [...(ix.canUpright ? ['side-upright'] : []), ...(ix.canUpsideDown ? ['side-upside'] : [])];
      if (pick(6) === 0) return { type: 'cancel' };
      // Mostly upright, so the upright powers' screens still come up.
      const type = sides.length > 1 ? (pick(4) === 0 ? 'side-upside' : 'side-upright') : sides[0];
      if (type === 'side-upside') used.add('upside down');
      return { type };
    }
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
    case 'loversJump':
      if (ix.canConfirm) return pick(3) === 0 ? { type: 'stay' } : { type: 'confirm' };
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
  const used = new Set();
  for (let seed = 1; seed <= 30; seed += 1) {
    const pick = makeRandom(seed * 7919);
    // Every third game uses the earlier, pairing Lovers.
    // Every third game uses the earlier, pairing Lovers; every fourth the forward-card Hanged Man.
    const config = { powerTiming: seed % 2 ? 'afterDraw' : 'beforeDraw', rules: { loversLine: seed % 3 !== 0, hangedTurn: seed % 4 !== 0 } };
    let m = initModel(R.createGame({ seed, config }));
    let steps = 0;
    while (m.game.winner === null) {
      steps += 1;
      assert.ok(steps < 40000, `seed ${seed}: game did not finish`);
      const html = view(m);
      assert.ok(html.includes('class="board"'));
      const action = botAction(m, pick, used);
      seen.add(interactions(m).phase);
      if (m.game.campsite) seen.add('campsite card');
      if (m.game.hanged?.stage === 'forward') seen.add('hanged forward');
      if (m.game.upsideDown?.stage === 'step') seen.add('upside-down step');
      const next = update(m, action);
      assert.notEqual(next, m, `seed ${seed}: action ${JSON.stringify(action)} did nothing`);
      m = next;
      checkInvariants(m.game);
    }
    assert.ok(view(m).includes('overlay'));
    assert.ok(m.game.units.filter((u) => u.player === m.game.winner).every((u) => u.pos === R.ASCENDED));
  }
  for (const phase of ['handoff', 'draw', 'move', 'stuck', 'joker', 'draft', 'side', 'lovers', 'loversJump', 'devil', 'campsite card', 'hanged forward', 'upside-down step']) {
    assert.ok(seen.has(phase), `phase ${phase} never came up`);
  }
  for (const power of Object.values(R.POWERS)) assert.ok(used.has(power), `${power} never used`);
  assert.ok(used.has('upside down'), 'no power used upside down');
});

// --- specific screens ---------------------------------------------------------------

/** Taps the held power and picks its upright side. */
const useUpright = (m) => update(update(m, { type: 'use-power' }), { type: 'side-upright' });

function modelWith(positions, { config, ...extra } = {}) {
  const base = R.createGame({ seed: 3, firstPlayer: 0, config });
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
  assert.equal(ix.dest, 'shared-3');
  assert.deepEqual(ix.victims, ['p1-s1']);
  assert.ok(view(m).includes('cap'));
  m = update(m, { type: 'tap', key: 'shared-3' });
  assert.equal(R.getUnit(m.game, 'p1-s1').pos, R.HOME);
  assert.equal(interactions(m).phase, 'handoff');
});

test('a commander with an escort offers both options', () => {
  const soldiers = { 'p0-s1': 6, 'p0-s2': 1, 'p0-s3': 2, 'p0-s4': 3, 'p0-s5': 5 };
  let m = modelWith({ ...soldiers, 'p0-c1': 6 }, {
    moveDecks: [{ draw: [2], discard: [] }, { draw: [1], discard: [] }],
  });
  m = update(m, { type: 'draw' });
  m = update(m, { type: 'tap', key: 'shared-3' });
  const ix = interactions(m);
  assert.deepEqual(ix.options.sort(), ['commander', 'commander+escort', 'soldier']);
  m = update(m, { type: 'option', value: 'commander+escort' });
  m = update(m, { type: 'confirm' });
  assert.equal(R.getUnit(m.game, 'p0-c1').pos, 8);
  assert.equal(R.getUnit(m.game, 'p0-s1').pos, 8);
});

test('The Devil marks the units it would kill before you confirm', () => {
  let m = modelWith({ 'p0-s1': 8, 'p1-s1': 9, 'p1-s2': 11 }, {
    moveDecks: [{ draw: [3], discard: [] }, { draw: [1], discard: [] }],
    held: [R.POWERS.DEVIL, null],
  });
  m = update(m, { type: 'draw' });
  assert.ok(view(m).includes('data-action="use-power"'));
  m = useUpright(m);
  m = update(m, { type: 'tap', key: 'shared-5' });
  assert.deepEqual(interactions(m).victims, ['p1-s1']);
  assert.ok(view(m).includes('doomed'));
  m = update(m, { type: 'confirm' });
  assert.equal(R.getUnit(m.game, 'p1-s1').pos, R.HOME);
  assert.equal(R.getUnit(m.game, 'p1-s2').pos, 10);
});

test('after draw: the screen offers the held power on a number card and on a joker', () => {
  let m = modelWith({ 'p0-s1': 3 }, {
    moveDecks: [{ draw: [2], discard: [] }, { draw: [1], discard: [] }],
    held: [R.POWERS.TOWER, null],
  });
  assert.ok(!interactions(m).canUsePower, 'not before drawing');
  m = update(m, { type: 'draw' });
  assert.equal(interactions(m).phase, 'move');
  assert.ok(interactions(m).canUsePower);
  m = useUpright(m);
  assert.equal(m.game.current, 1);
  assert.equal(m.game.held[0], null);

  let j = modelWith({}, {
    moveDecks: [{ draw: [R.JOKER], discard: [] }, { draw: [1], discard: [] }],
    held: [R.POWERS.TOWER, null],
  });
  j = update(j, { type: 'draw' });
  assert.equal(interactions(j).phase, 'joker');
  assert.ok(view(j).includes('Use The Tower instead'));
});

test('before draw: the held power is offered instead of drawing', () => {
  const base = R.createGame({ seed: 3, firstPlayer: 0, config: { powerTiming: 'beforeDraw' } });
  let m = initModel({ ...base, held: [R.POWERS.TOWER, null] });
  assert.equal(interactions(m).phase, 'draw');
  assert.ok(interactions(m).canUsePower);
  assert.ok(view(m).includes('Use The Tower'));
  m = update(m, { type: 'draw' });
  assert.ok(!interactions(m).canUsePower);
});

test('The Hanged Man: back with the drawn card, then an extra turn', () => {
  let m = modelWith({ 'p0-s1': 11, 'p0-s2': 1 }, {
    moveDecks: [{ draw: [3, 1], discard: [] }, { draw: [1], discard: [] }],
    held: [R.POWERS.HANGED_MAN, null],
  });
  m = update(m, { type: 'draw' });
  m = useUpright(m);
  assert.ok(view(m).includes('move a unit 3 back'));
  m = update(m, { type: 'tap', key: 'shared-8' });
  m = update(m, { type: 'confirm' });
  assert.equal(R.getUnit(m.game, 'p0-s1').pos, 8);
  assert.equal(interactions(m).phase, 'draw');
  assert.equal(m.game.current, 0);
  assert.match(view(m), /extra turn/);
  m = update(m, { type: 'draw' });
  assert.ok(interactions(m).tappable.length > 1, 'any unit can move');
});

test('The Hanged Man (forward-card version): back with the drawn card, then the forward card moves the same unit', () => {
  let m = modelWith({ 'p0-s1': 11, 'p0-s2': 1 }, {
    config: { rules: { hangedTurn: false } },
    moveDecks: [{ draw: [3, 1], discard: [] }, { draw: [1], discard: [] }],
    held: [R.POWERS.HANGED_MAN, null],
  });
  m = update(m, { type: 'draw' });
  m = useUpright(m);
  assert.equal(interactions(m).phase, 'move');
  assert.ok(view(m).includes('move a unit 3 back'));
  m = update(m, { type: 'tap', key: 'shared-8' });
  m = update(m, { type: 'confirm' });
  assert.equal(R.getUnit(m.game, 'p0-s1').pos, 8);
  assert.equal(interactions(m).phase, 'draw');
  assert.ok(view(m).includes('draw the forward card'));
  m = update(m, { type: 'draw' });
  assert.deepEqual(interactions(m).tappable, ['shared-5'], 'only that unit');
  m = update(m, { type: 'tap', key: 'shared-5' });
  m = update(m, { type: 'confirm' });
  assert.equal(R.getUnit(m.game, 'p0-s1').pos, 9);
  assert.equal(interactions(m).phase, 'handoff');
});

test('landing on the campsite shows the card from your discard pile and moves that unit again', () => {
  let m = modelWith({ 'p0-s1': 3, 'p0-s2': 1 }, {
    moveDecks: [{ draw: [2], discard: [] }, { draw: [1], discard: [] }],
  });
  assert.ok(view(m).includes('campsite'));
  m = update(m, { type: 'draw' });
  m = update(m, { type: 'tap', key: 'p0-3' });
  m = update(m, { type: 'confirm' });
  assert.equal(R.getUnit(m.game, 'p0-s1').pos, 5);
  assert.equal(interactions(m).phase, 'move');
  assert.deepEqual(interactions(m).tappable, ['shared-2']);
  const html = view(m);
  assert.ok(html.includes('Campsite · move that unit 2 again'));
  assert.ok(html.includes('From discard'));
  m = update(m, { type: 'tap', key: 'shared-2' });
  m = update(m, { type: 'confirm' });
  assert.equal(R.getUnit(m.game, 'p0-s1').pos, 7);
  assert.equal(interactions(m).phase, 'handoff');
});

test("both players' discard piles are shown face up, outside the board", () => {
  let m = modelWith({ 'p0-s1': 3 }, {
    moveDecks: [{ draw: [2], discard: [1, R.JOKER] }, { draw: [4], discard: [3] }],
  });
  m = update(m, { type: 'draw' });
  const html = view(m);
  assert.ok(html.includes('Gold&#39;s discard pile: 1, Joker, 2'));
  assert.ok(html.includes('Obsidian&#39;s discard pile: 3'));
  const board = html.slice(html.indexOf('class="board"'), html.indexOf('</section>', html.indexOf('class="board"')));
  assert.ok(!board.includes('discard'), 'not on the board');
});

// --- the Lovers jump ------------------------------------------------------------------

/** Gold holds the Lovers, has drawn the first card of `deck` and used the power. */
function loversModel(positions, deck = [3, 1]) {
  let m = modelWith(positions, {
    held: [R.POWERS.LOVERS, null],
    moveDecks: [{ draw: deck, discard: [] }, { draw: [1], discard: [] }],
  });
  m = update(m, { type: 'draw' });
  return useUpright(m);
}

test('the Lovers: the card moves as usual, then a line, Jump and Stay offer the jump', () => {
  let m = loversModel({ 'p0-s1': 4, 'p0-s2': 10 });
  assert.equal(interactions(m).phase, 'move');
  assert.match(view(m), /The Lovers · move a unit 3 forward/);
  m = update(m, { type: 'tap', key: unitKey(m.game, R.getUnit(m.game, 'p0-s1')) });
  m = update(m, { type: 'confirm' });
  const ix = interactions(m);
  assert.equal(ix.phase, 'loversJump');
  assert.equal(ix.lines.length, 1);
  assert.ok(ix.canConfirm);
  assert.equal(ix.dest, R.cellId(0, 10));
  const html = view(m);
  assert.match(html, /class="jump-line on"/);
  assert.match(html, /data-action="confirm"[^>]*>Jump</);
  assert.match(html, /data-action="stay"[^>]*>Stay</);
  const jumped = update(m, { type: 'confirm' });
  assert.equal(R.getUnit(jumped.game, 'p0-s1').pos, 10);
  assert.equal(interactions(jumped).phase, 'handoff');
  const tapped = update(m, { type: 'tap', key: ix.dest });
  assert.equal(R.getUnit(tapped.game, 'p0-s1').pos, 10);
  const stayed = update(m, { type: 'stay' });
  assert.equal(R.getUnit(stayed.game, 'p0-s1').pos, 7);
  assert.equal(interactions(stayed).phase, 'handoff');
});

// --- upright or upside down ----------------------------------------------------------

/** Player 0 holds `held` with `stars`, and has drawn a 3. */
function holding(held, stars, positions = { 'p0-s1': 8, 'p1-s1': 9 }) {
  const m = modelWith(positions, {
    moveDecks: [{ draw: [3, 1], discard: [] }, { draw: [1], discard: [] }],
    held: [held, null],
    stars,
  });
  return update(m, { type: 'draw' });
}

test('with stars, tapping the power offers both sides; Back closes it', () => {
  let m = holding(R.POWERS.TOWER, [1, 0]);
  assert.ok(interactions(m).canUsePower);
  m = update(m, { type: 'use-power' });
  const ix = interactions(m);
  assert.equal(ix.phase, 'side');
  assert.ok(ix.canUpright && ix.canUpsideDown);
  assert.equal(ix.cost, 1);
  assert.ok(!ix.canUsePower, 'the power card is not tappable again while choosing');
  assert.match(view(m), /data-action="side-upright"/);
  assert.match(view(m, { board: '3d' }), /data-action="side-upside"/);
  m = update(m, { type: 'cancel' });
  assert.equal(interactions(m).phase, 'move');
  assert.equal(m.game.held[0], R.POWERS.TOWER);
});

test('upside down: pays the star, then the one-cell step, then the turn card', () => {
  let m = update(holding(R.POWERS.TOWER, [1, 0]), { type: 'use-power' });
  m = update(m, { type: 'side-upside' });
  assert.deepEqual(m.game.stars, [0, 0]);
  assert.equal(m.game.held[0], null);
  assert.equal(interactions(m).phase, 'move');
  assert.match(view(m), /Gold played The Tower upside down/);
  assert.match(view(m), /Upside down · step a unit 1 cell forward/);
  m = update(m, { type: 'tap', key: unitKey(m.game, R.getUnit(m.game, 'p0-s1')) });
  m = update(m, { type: 'confirm' });
  assert.equal(R.getUnit(m.game, 'p0-s1').pos, 9);
  assert.deepEqual(m.game.stars, [0, 1], 'the captured unit gave its owner a star');
  assert.equal(m.game.drawn, 3);
  assert.equal(interactions(m).phase, 'move');
});

test('upright from the side choice works as before (targets for the Devil)', () => {
  let m = update(holding(R.POWERS.DEVIL, [2, 0]), { type: 'use-power' });
  m = update(m, { type: 'side-upright' });
  assert.equal(interactions(m).phase, R.POWERS.DEVIL);
  assert.deepEqual(m.game.stars, [2, 0]);
});

test('without stars both sides still show; only upright can be picked', () => {
  let m = update(holding(R.POWERS.TOWER, [0, 3]), { type: 'use-power' });
  const ix = interactions(m);
  assert.equal(ix.phase, 'side');
  assert.ok(ix.canUpright && !ix.canUpsideDown);
  assert.match(view(m), /data-action="side-upside" disabled/);
  assert.equal(update(m, { type: 'side-upside' }), m);
  m = update(m, { type: 'side-upright' });
  assert.equal(m.game.held[0], null);
  assert.equal(m.game.current, 1);
});

test('with upside-down powers switched off, a tap uses the power upright at once', () => {
  const base = modelWith({ 'p0-s1': 8 }, {
    config: { rules: { upsideDown: false } },
    moveDecks: [{ draw: [3, 1], discard: [] }, { draw: [1], discard: [] }],
    held: [R.POWERS.TOWER, null],
  });
  const m = update(update(base, { type: 'draw' }), { type: 'use-power' });
  assert.equal(m.game.held[0], null);
  assert.equal(m.game.current, 1);
});

test('a drawn Joker with a free power: only the upside-down side is on offer', () => {
  let m = modelWith({ 'p0-s1': 8 }, {
    moveDecks: [{ draw: [R.JOKER, 1], discard: [] }, { draw: [1], discard: [] }],
    held: [R.POWERS.LOVERS, null],
    stars: [1, 0],
  });
  m = update(m, { type: 'draw' });
  assert.equal(interactions(m).phase, 'joker');
  m = update(m, { type: 'use-power' });
  const ix = interactions(m);
  assert.equal(ix.phase, 'side');
  assert.ok(!ix.canUpright && ix.canUpsideDown);
  assert.equal(update(m, { type: 'side-upright' }), m);
});

test('each power slot shows its player\'s stars', () => {
  const m = holding(R.POWERS.TOWER, [2, 5]);
  const html = view(m);
  assert.match(html, /aria-label="Gold: 2 stars"/);
  assert.match(html, /aria-label="Obsidian: 5 stars"/);
  const off = modelWith({}, { config: { rules: { upsideDown: false } } });
  assert.doesNotMatch(view(off), /star-badge/);
});
