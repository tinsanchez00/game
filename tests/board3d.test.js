import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/rules/index.js';
import { initModel, interactions, unitKey, update } from '../src/ui/controller.js';
import { boardLayout3d, CARD, DECK, STACK_OFFSET, TILE_TOP, TRAY_TOP, unitPlacements } from '../src/ui/board3d/layout3d.js';
import { allowed, toScreenAction } from '../src/ui/board3d/mount.js';
import { createBoardScene, TIMING } from '../src/ui/board3d/scene.js';
import { gameWith } from './helpers.js';
import { view } from '../src/ui/view.js';

const G = R.geometry(R.DEFAULT_CONFIG);

function sceneFor(model, size = [844, 390]) {
  const board = createBoardScene(model.game.config);
  board.resize(...size);
  board.sync(model, interactions(model), { animate: false, now: 0 });
  board.tick(0);
  return board;
}

/** Push a model through an action and keep the scene in step, starting at `now`. */
function step(board, model, action, now) {
  const next = update(model, action);
  board.sync(next, interactions(next), { animate: true, now });
  return next;
}

const pickAt = (board, target) => {
  const p = board.screenOf(target);
  return board.pick(p.x, p.y);
};

test('3D layout: one tile per board cell, player 0 nearest +z, shared lane in the middle', () => {
  const layout = boardLayout3d();
  assert.equal(layout.cells.length, G.cellCount);
  const spots = new Set(layout.cells.map((c) => `${c.x.toFixed(3)},${c.z.toFixed(3)}`));
  assert.equal(spots.size, layout.cells.length, 'no two cells overlap');
  for (let pos = 1; pos <= G.pathLength; pos += 1) {
    const c0 = layout.byKey.get(G.cellId(0, pos));
    const c1 = layout.byKey.get(G.cellId(1, pos));
    if (G.isShared(pos)) {
      assert.equal(c0, c1);
      assert.equal(c0.z, 0);
    } else {
      assert.ok(c0.z > 0 && c1.z < 0, `pos ${pos}: player 0 near, player 1 far`);
      assert.equal(c0.x, c1.x, 'the two private lanes mirror each other');
    }
  }
});

test('3D layout: home and ascended trays sit beyond the first and last cells; cards lie between them', () => {
  const layout = boardLayout3d();
  for (const p of [0, 1]) {
    const side = layout.sides[p];
    const first = layout.byKey.get(G.cellId(p, 1));
    const last = layout.byKey.get(G.cellId(p, G.pathLength));
    const home = layout.trays.get(`home:${p}`);
    const asc = layout.trays.get(`asc:${p}`);
    assert.equal(home.x, first.x);
    assert.equal(asc.x, last.x);
    assert.ok(Math.sign(home.z) === Math.sign(first.z) && Math.abs(home.z) > Math.abs(first.z) + 1, 'beyond the lane');
    const left = home.x + home.w / 2;
    const right = asc.x - asc.w / 2;
    assert.ok(side.deck.x - DECK.w / 2 >= left, 'deck clear of the home tray');
    assert.ok(side.power.x + CARD.w / 2 <= right, 'power clear of the ascended tray');
    assert.ok(side.drawn.x - CARD.w / 2 > side.deck.x + DECK.w / 2, 'drawn card right of the deck');
    assert.ok(side.discard.right < home.x - home.w / 2, 'discard fan left of the home tray');
  }
});

test('3D layout: two units on a cell stand side by side; home and ascended units fill their trays', () => {
  const game = gameWith({ 'p0-s1': 2, 'p0-s2': 2, 'p0-s3': 15, 'p0-s4': 15 });
  const places = unitPlacements(game);
  const a = places.get('p0-s1');
  const b = places.get('p0-s2');
  assert.equal(a.key, b.key);
  assert.equal(a.y, TILE_TOP);
  assert.ok(Math.abs(Math.abs(a.x - b.x) - 2 * STACK_OFFSET) < 1e-9);
  assert.equal(places.get('p0-s3').where, 'asc');
  assert.equal(places.get('p0-s3').y, TRAY_TOP);
  const home = [...places.values()].filter((p) => p.key === 'home:1');
  assert.equal(home.length, 6);
  assert.equal(new Set(home.map((p) => `${p.x},${p.z}`)).size, 6, 'each unit has its own spot');
  assert.equal(places.get('p1-c1').slot, 5, 'the commander after the soldiers');
});

test('tapping any cell or tray picks it, for either player; your own lane is at the bottom', () => {
  for (const viewer of [0, 1]) {
    const model = initModel(gameWith({}, { firstPlayer: viewer }));
    const board = sceneFor(model);
    assert.equal(board.azimuth, viewer === 1 ? Math.PI : 0);
    const keys = [...board.layout.cells.map((c) => c.key), ...board.layout.trays.keys()];
    for (const key of keys) {
      const p = board.screenOf(key);
      assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1, `${key} is on screen`);
      // Trays are full of pieces at the start: either the tray or one of its pieces answers.
      assert.deepEqual(board.pick(p.x, p.y), { type: 'tap', key });
    }
    const mine = board.screenOf(G.cellId(viewer, 1));
    const theirs = board.screenOf(G.cellId(R.otherPlayer(viewer), 1));
    assert.ok(mine.y < theirs.y);
  }
});

test('the whole table fits in portrait too', () => {
  const model = initModel(gameWith({}));
  const board = sceneFor(model, [390, 844]);
  for (const key of [...board.layout.cells.map((c) => c.key), ...board.layout.trays.keys()]) {
    const p = board.screenOf(key);
    assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1, `${key} is on screen`);
  }
});

test('tapping a piece picks the cell it stands on', () => {
  const model = initModel(gameWith({ 'p0-s1': 6 }));
  const board = sceneFor(model);
  const target = board.unitWorld('p0-s1');
  target.y += 0.42; // aim at the head, which hides part of the cell behind it
  const p = target.project(board.camera);
  assert.deepEqual(board.pick(p.x, p.y), { type: 'tap', key: unitKey(model.game, R.getUnit(model.game, 'p0-s1')) });
});

test('tapping your deck draws; the card flips over on its way to the drawn spot', () => {
  let model = initModel(gameWith({}));
  const board = sceneFor(model);
  const ix = interactions(model);
  const action = pickAt(board, board.parts.sides[0].top.front);
  assert.deepEqual(action, { type: 'draw', player: 0 });
  assert.ok(allowed(action, model, ix));
  assert.ok(!allowed(pickAt(board, board.parts.sides[1].top.front), model, ix), "not the other player's deck");

  model = step(board, model, { type: 'draw' }, 1000);
  const card = board.parts.sides[0].drawn;
  assert.ok(card.yaw.visible);
  board.tick(1000 + TIMING.draw / 2);
  assert.ok(card.flip.rotation.z > 0.1, 'still turning over');
  board.tick(1000 + TIMING.draw + 1);
  assert.equal(card.flip.rotation.z, 0, 'face up');
});

test('a move hops between cells; the captured unit hops back to its home tray after the attacker lands', () => {
  let model = initModel(gameWith({ 'p0-s1': 6, 'p1-s1': 8 }, { drawn: 2 }));
  const board = sceneFor(model);
  const from = board.unitWorld('p0-s1');
  model = step(board, model, { type: 'tap', key: G.cellId(0, 6) }, 0);
  assert.equal(interactions(model).dest, G.cellId(0, 8));
  board.tick(0);
  const victimAt = board.unitWorld('p1-s1');
  model = step(board, model, { type: 'confirm' }, 1000);
  assert.equal(R.getUnit(model.game, 'p1-s1').pos, R.HOME);

  const hop = TIMING.hopBase + TIMING.hopPerCell; // two cells
  board.tick(1000 + hop / 2);
  const mid = board.unitWorld('p0-s1');
  assert.ok(mid.y > TILE_TOP + 0.3, 'in the air halfway');
  assert.ok(mid.x !== from.x, 'on its way');
  assert.ok(board.unitWorld('p1-s1').distanceTo(victimAt) < 1e-6, 'the victim waits while the attacker hops');

  board.tick(1000 + hop + 1);
  const dest = board.layout.byKey.get(G.cellId(0, 8));
  const landed = board.unitWorld('p0-s1');
  assert.ok(Math.abs(landed.x - dest.x) < 1e-6 && Math.abs(landed.z - dest.z) < 1e-6);

  board.tick(1000 + hop + TIMING.capture + 2);
  const home = unitPlacements(model.game).get('p1-s1');
  const now = board.unitWorld('p1-s1');
  assert.ok(Math.abs(now.x - home.x) < 1e-6 && Math.abs(now.z - home.z) < 1e-6, 'back in the home tray');
});

test('selecting a unit zooms toward it; handing off turns the camera, and the cards turn to face the new player', () => {
  let model = initModel(gameWith({ 'p0-s1': 6 }, { drawn: 2 }));
  model.game.held[1] = R.POWERS.TOWER;
  const board = sceneFor(model);
  const far = board.distance;
  model = step(board, model, { type: 'tap', key: G.cellId(0, 6) }, 0);
  for (let t = 0; t <= 2000; t += 16) board.tick(t);
  assert.ok(board.distance < far * 0.9, 'closer while a unit is selected');

  model = step(board, model, { type: 'confirm' }, 3000);
  assert.equal(interactions(model).phase, 'handoff');
  model = step(board, model, { type: 'handoff' }, 4000);
  assert.equal(model.ui.viewer, 1);
  board.tick(4000 + TIMING.spin / 2);
  assert.ok(board.spinning);
  assert.ok(board.azimuth > 0.5 && board.azimuth < Math.PI - 0.5, 'halfway round');
  board.tick(4000 + TIMING.spin + 1);
  assert.ok(!board.spinning);
  assert.ok(Math.abs(Math.cos(board.azimuth) + 1) < 1e-9, "now facing from player 1's side");
  for (const side of board.parts.sides) {
    assert.equal(side.power.yaw.rotation.y, board.azimuth, 'cards face the player at the table');
  }
});

test('drafting: the two power cards rise in front of the camera; tapping one keeps it', () => {
  let model = initModel(gameWith({}, { drawn: R.JOKER }));
  assert.equal(interactions(model).phase, 'draft');
  const board = createBoardScene(model.game.config);
  board.resize(844, 390);
  board.sync(model, interactions(model), { animate: true, now: 0 });
  board.sync(model, interactions(model), { animate: true, now: 0 });
  board.tick(TIMING.rise + 1);
  const [a, b] = board.parts.draftCards;
  assert.ok(a.visible && b.visible);
  const pa = board.screenOf(a);
  const pb = board.screenOf(b);
  assert.ok(Math.abs(pa.y) < 0.3 && pa.x < 0 && pb.x > 0, 'side by side in the middle of the view');
  const action = board.pick(pb.x, pb.y);
  assert.deepEqual(action, { type: 'keep', index: 1 });
  assert.ok(allowed(action, model, interactions(model)));
  model = update(model, action);
  board.sync(model, interactions(model), { animate: true, now: 1000 });
  assert.ok(!a.visible && !b.visible);
});

test('a scene can be thrown away and rebuilt for another board size', () => {
  const short = R.createGame({ seed: 3, config: { soldiers: 4, board: { startLane: 3, middleLane: 8, endLane: 2, towers: [7, 13], campsites: [5] } } });
  const board = sceneFor(initModel(short));
  assert.equal(board.layout.cells.length, R.geometry(short.config).cellCount);
  board.dispose();
});

test("the lamp turns with the camera, so it always hangs over the viewer's side", () => {
  let model = initModel(gameWith({ 'p0-s1': 6 }, { drawn: 2 }));
  const board = sceneFor(model);
  const sun = board.scene.children.find((o) => o.isDirectionalLight);
  assert.ok(sun.position.z > 0, "over player 0's side");
  model = step(board, model, { type: 'tap', key: G.cellId(0, 6) }, 0);
  model = step(board, model, { type: 'confirm' }, 10);
  model = step(board, model, { type: 'handoff' }, 20);
  board.tick(20 + TIMING.spin + 1);
  assert.ok(sun.position.z < 0, "over player 1's side");
});

test('what you can act on glows: your deck when drawing, then a usable power', () => {
  let model = initModel(gameWith({ 'p0-s1': 6 }));
  model.game.held[0] = R.POWERS.TOWER;
  const board = sceneFor(model);
  board.tick(350); // the pulse is near its peak
  const side = board.parts.sides[0];
  assert.ok(side.deckHalo.material.opacity > 0.4, 'the deck glows while you can draw');
  assert.equal(board.parts.sides[1].deckHalo.material.opacity, 0, "the other player's does not");
  assert.equal(side.powerHalo.material.opacity, 0, 'with "after draw" timing the power waits for the card');

  model = step(board, model, { type: 'draw' }, 1000);
  assert.ok(interactions(model).canUsePower);
  board.tick(1000 + 350);
  assert.equal(side.deckHalo.material.opacity, 0, 'no more glow once drawn');
  assert.ok(side.powerHalo.material.opacity > 0.4, 'now the power you can use glows');
});

test('tapping your glowing power card uses it', () => {
  let model = initModel(gameWith({ 'p0-s1': 6 }));
  model.game.held[0] = R.POWERS.TOWER;
  model.game.held[1] = R.POWERS.HERMIT;
  const board = sceneFor(model);
  const mine = board.parts.sides[0].power.front;
  assert.deepEqual(pickAt(board, mine), { type: 'use-power', player: 0 });
  assert.ok(!allowed(pickAt(board, mine), model, interactions(model)), 'not before drawing ("after draw" timing)');
  model = step(board, model, { type: 'draw' }, 0);
  board.tick(TIMING.draw + 1);
  const ix = interactions(model);
  assert.ok(allowed(pickAt(board, mine), model, ix));
  assert.ok(!allowed(pickAt(board, board.parts.sides[1].power.front), model, ix), "not the other player's");
  const after = update(update(model, { type: 'use-power' }), { type: 'side-upright' });
  assert.equal(after.game.held[0], null, 'The Tower was used');
});

test('the move target shows what the move does: a ghost of the piece, coloured by the consequence', () => {
  const colourAt = (board, key) => board.parts.surfaces.get(key).halo.material.color.getHex();
  // Plain move: green. Capture: red.
  let model = initModel(gameWith({ 'p0-s1': 6, 'p1-s1': 8 }, { drawn: 2 }));
  let board = sceneFor(model);
  model = step(board, model, { type: 'tap', key: G.cellId(0, 6) }, 0);
  const capture = colourAt(board, G.cellId(0, 8));
  assert.ok(board.parts.ghost?.visible, 'a ghost piece stands on the target');
  const at = board.layout.byKey.get(G.cellId(0, 8));
  assert.ok(Math.abs(board.parts.ghost.position.x - at.x) < 1e-6);

  model = initModel(gameWith({ 'p0-s1': 6 }, { drawn: 2 }));
  board = sceneFor(model);
  model = step(board, model, { type: 'tap', key: G.cellId(0, 6) }, 0);
  const plain = colourAt(board, G.cellId(0, 8));
  assert.notEqual(plain, capture);

  // Onto a tower (path cell 7): another colour again.
  model = initModel(gameWith({ 'p0-s1': 5 }, { drawn: 2 }));
  board = sceneFor(model);
  model = step(board, model, { type: 'tap', key: G.cellId(0, 5) }, 0);
  const tower = colourAt(board, G.cellId(0, 7));
  assert.ok(new Set([plain, capture, tower]).size === 3, 'three different consequences, three colours');

  model = update(model, { type: 'cancel' });
  board.sync(model, interactions(model), { animate: true, now: 10 });
  assert.ok(!board.parts.ghost, 'no ghost once nothing is selected');
});

test('The Tower strikes the towers with lightning before the pieces there fall', () => {
  // A tower is path cell 7 (middle lane) and 14 (each end lane).
  let model = initModel(gameWith({ 'p1-s1': 7, 'p0-s1': 2 }, { drawn: 2 }));
  model.game.held[0] = R.POWERS.TOWER;
  const board = sceneFor(model);
  model = step(board, update(model, { type: 'use-power' }), { type: 'side-upright' }, 1000);
  assert.equal(R.getUnit(model.game, 'p1-s1').pos, R.HOME, 'the unit on the tower is gone');
  assert.ok(board.parts.effects.length >= 3, 'a strike on every tower');
  for (let t = 1000; t <= 4000; t += 50) board.tick(t);
  assert.equal(board.parts.effects.length, 0, 'effects clear up when done');
});

test('the selected piece looks different from its target: no fill, another colour', () => {
  let model = initModel(gameWith({ 'p0-s1': 6 }, { drawn: 2 }));
  const board = sceneFor(model);
  model = step(board, model, { type: 'tap', key: G.cellId(0, 6) }, 0);
  const sel = board.parts.surfaces.get(G.cellId(0, 6));
  const dest = board.parts.surfaces.get(G.cellId(0, 8));
  assert.equal(sel.fill.material.opacity, 0, 'the selection is not filled');
  assert.ok(dest.fill.material.opacity > 0, 'the target is');
  assert.notEqual(sel.halo.material.color.getHex(), dest.halo.material.color.getHex());
});

test('the target stands apart from the other selectable pieces: its own colour, the others quieter', () => {
  let model = initModel(gameWith({ 'p0-s1': 6, 'p0-s2': 2 }, { drawn: 2 }));
  const board = sceneFor(model);
  board.tick(350);
  const other = board.parts.surfaces.get(G.cellId(0, 2));
  const loud = other.halo.material.opacity;
  model = step(board, model, { type: 'tap', key: G.cellId(0, 6) }, 1000);
  board.tick(1350);
  const dest = board.parts.surfaces.get(G.cellId(0, 8));
  assert.notEqual(dest.halo.material.color.getHex(), other.halo.material.color.getHex(), 'target colour differs from selectable');
  assert.ok(other.halo.material.opacity < loud * 0.6, 'other selectable cells pulse more quietly');
});

test('phone on the table: the board never turns; the camera leans toward the current player; cards face their owners', () => {
  let model = initModel(gameWith({ 'p0-s1': 6 }, { drawn: 2 }));
  model.game.held[1] = R.POWERS.TOWER;
  const board = createBoardScene(model.game.config);
  board.resize(844, 390);
  board.sync(model, interactions(model), { animate: false, now: 0, table: true });
  board.tick(0);
  assert.equal(board.azimuth, 0);
  assert.deepEqual(board.camera.up.toArray(), [0, 0, -1], "screen up stays toward player 1's side");
  assert.ok(board.camera.position.z > 0, "leaning over player 0's edge");
  assert.equal(board.parts.sides[0].power.yaw.rotation.y, 0);
  assert.equal(board.parts.sides[1].power.yaw.rotation.y, Math.PI, "player 1's cards face player 1");

  // Player 0 moves; the turn passes straight to player 1 (the shell seats the viewer).
  model = update(model, { type: 'tap', key: G.cellId(0, 6) });
  model = update(model, { type: 'confirm' });
  model = { ...model, ui: { ...model.ui, viewer: model.game.current } };
  assert.equal(model.game.current, 1);
  board.sync(model, interactions(model), { animate: true, now: 1000, table: true });
  board.tick(1000 + TIMING.spin + 1);
  assert.equal(board.azimuth, 0, 'no spin');
  assert.ok(board.camera.position.z < 0, "now leaning over player 1's edge");
  assert.equal(board.parts.sides[1].power.yaw.rotation.y, Math.PI, 'cards still face their owners');
  // Every cell can still be tapped.
  for (const cell of board.layout.cells) assert.deepEqual(pickAt(board, cell.key), { type: 'tap', key: cell.key });
});

test('phone on the table: the draft cards turn to face the player drafting', () => {
  const model = initModel(gameWith({}, { firstPlayer: 1, drawn: R.JOKER }));
  const board = createBoardScene(model.game.config);
  board.resize(844, 390);
  board.sync(model, interactions(model), { animate: false, now: 0, table: true });
  board.tick(TIMING.rise + 1);
  const hud = board.parts.draftCards[0].parent;
  assert.equal(hud.rotation.z, Math.PI);
  const [a, b] = board.parts.draftCards;
  const pa = board.screenOf(a);
  assert.deepEqual(board.pick(pa.x, pa.y), { type: 'keep', index: 0 });
  assert.ok(board.screenOf(a).x > board.screenOf(b).x, "the first card is on the drafting player's left");
});

test('The Hermit: the move onto an ally shows where the ally will be pushed, and the push plays out', () => {
  let model = initModel(gameWith({ 'p0-s1': 6, 'p0-s2': 9 }, { drawn: 3 }));
  model.game.held[0] = R.POWERS.HERMIT;
  const board = sceneFor(model);
  model = step(board, update(model, { type: 'use-power' }), { type: 'side-upright' }, 0);
  assert.deepEqual(model.game.hermit, { stage: 'move', steps: 3 });
  assert.match(pageOf(model), /The Hermit · move a unit 3 onto an ally/);
  model = step(board, model, { type: 'tap', key: G.cellId(0, 6) }, 10);
  const ix = interactions(model);
  assert.equal(ix.dest, G.cellId(0, 9));
  assert.deepEqual(ix.push, { unit: 'p0-s2', from: G.cellId(0, 9), to: G.cellId(0, 12) });
  const pushCell = board.parts.surfaces.get(G.cellId(0, 12));
  assert.ok(pushCell.fill.material.opacity > 0.3, 'the push target is marked');
  assert.notEqual(pushCell.halo.material.color.getHex(), board.parts.surfaces.get(G.cellId(0, 9)).halo.material.color.getHex());
  model = step(board, model, { type: 'confirm' }, 20);
  assert.equal(R.getUnit(model.game, 'p0-s2').pos, 12);
  assert.ok(board.parts.effects.length >= 2, 'lantern rings where both land');
});

function pageOf(model) {
  return view(model);
}

test('picking a side: both sides of the held power rise, the second upside down; taps map to the sides', () => {
  let model = initModel(gameWith({ 'p0-s1': 8 }, {
    moveDecks: [{ draw: [3, 1], discard: [] }, { draw: [1], discard: [] }],
    held: [R.POWERS.TOWER, null],
    stars: [1, 0],
  }));
  model = update(model, { type: 'draw' });
  model = update(model, { type: 'use-power' });
  assert.equal(interactions(model).phase, 'side');
  const board = sceneFor(model);
  board.tick(TIMING.rise + 1);
  const [a, b] = board.parts.draftCards;
  assert.ok(a.visible && b.visible);
  assert.ok(Math.abs(b.rotation.z - a.rotation.z - Math.PI) < 1e-6, 'the second card is upside down');
  const pb = board.screenOf(b);
  const action = board.pick(pb.x, pb.y);
  assert.deepEqual(action, { type: 'keep', index: 1 });
  const ix = interactions(model);
  assert.ok(allowed(action, model, ix));
  assert.deepEqual(toScreenAction(action, ix), { type: 'side-upside' });
  model = update(model, toScreenAction(action, ix));
  assert.deepEqual(model.game.stars, [0, 0]);
  board.sync(model, interactions(model), { animate: true, now: 1000 });
  assert.ok(!a.visible && !b.visible);
});

test('a side that cannot be used is shown faded and ignores taps', () => {
  let model = initModel(gameWith({ 'p0-s1': 8 }, {
    moveDecks: [{ draw: [R.JOKER, 1], discard: [] }, { draw: [1], discard: [] }],
    held: [R.POWERS.LOVERS, null],
    stars: [1, 0],
  }));
  model = update(update(model, { type: 'draw' }), { type: 'use-power' });
  const board = sceneFor(model);
  board.tick(TIMING.rise + 1);
  const [a, b] = board.parts.draftCards;
  assert.ok(a.material.color.r < b.material.color.r, 'the unusable side is darkened');
  assert.ok(!allowed({ type: 'keep', index: 0 }, model, interactions(model)));
});

test('each side shows its stars on a badge by the power card', () => {
  const model = initModel(gameWith({}, { stars: [3, 1] }));
  const board = sceneFor(model);
  const [s0, s1] = board.parts.sides;
  assert.ok(s0.labels.stars.yaw.visible && s1.labels.stars.yaw.visible);
  const off = sceneFor(initModel(gameWith({}, { config: { rules: { upsideDown: false } } })));
  assert.ok(!off.parts.sides[0].labels.stars.yaw.visible);
});

test('without stars, the upside-down card still rises, faded, and ignores taps', () => {
  let model = initModel(gameWith({ 'p0-s1': 8 }, {
    moveDecks: [{ draw: [3, 1], discard: [] }, { draw: [1], discard: [] }],
    held: [R.POWERS.TOWER, null],
    stars: [0, 0],
  }));
  model = update(update(model, { type: 'draw' }), { type: 'use-power' });
  assert.equal(interactions(model).phase, 'side');
  const board = sceneFor(model);
  board.tick(TIMING.rise + 1);
  const [a, b] = board.parts.draftCards;
  assert.ok(a.visible && b.visible);
  assert.ok(b.material.color.r < a.material.color.r, 'the unusable side is darkened');
  assert.ok(!allowed({ type: 'keep', index: 1 }, model, interactions(model)));
  assert.ok(allowed({ type: 'keep', index: 0 }, model, interactions(model)));
});
