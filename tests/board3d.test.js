import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/rules/index.js';
import { initModel, interactions, unitKey, update } from '../src/ui/controller.js';
import { boardLayout3d, STACK_OFFSET, TILE_TOP, unitPlacements } from '../src/ui/board3d/layout3d.js';
import { createBoardScene, TIMING } from '../src/ui/board3d/scene.js';
import { gameWith } from './helpers.js';

function sceneFor(model, size = [400, 300]) {
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

test('3D layout: one tile per board cell, player 0 nearest +z, shared lane in the middle', () => {
  const layout = boardLayout3d();
  const g = R.geometry(R.DEFAULT_CONFIG);
  assert.equal(layout.cells.length, g.cellCount);
  const spots = new Set(layout.cells.map((c) => `${c.x.toFixed(3)},${c.z.toFixed(3)}`));
  assert.equal(spots.size, layout.cells.length, 'no two cells overlap');
  for (let pos = 1; pos <= g.pathLength; pos += 1) {
    const c0 = layout.byKey.get(g.cellId(0, pos));
    const c1 = layout.byKey.get(g.cellId(1, pos));
    if (g.isShared(pos)) {
      assert.equal(c0, c1);
      assert.equal(c0.z, 0);
    } else {
      assert.ok(c0.z > 0 && c1.z < 0, `pos ${pos}: player 0 near, player 1 far`);
      assert.equal(c0.x, c1.x, 'the two private lanes mirror each other');
    }
  }
});

test('3D layout: two units on a cell stand side by side; home and ascended are off the board', () => {
  const game = gameWith({ 'p0-s1': 2, 'p0-s2': 2, 'p0-s3': 15 });
  const places = unitPlacements(game);
  const a = places.get('p0-s1');
  const b = places.get('p0-s2');
  assert.equal(a.key, b.key);
  assert.ok(Math.abs(Math.abs(a.x - b.x) - 2 * STACK_OFFSET) < 1e-9);
  assert.equal(places.get('p0-s3').onBoard, false);
  assert.equal(places.get('p0-s3').key, 'asc:0');
  assert.equal(places.get('p1-s1').key, 'home:1');
});

test('tapping the centre of any cell picks that cell, for either player', () => {
  for (const viewer of [0, 1]) {
    const model = initModel(gameWith({}, { firstPlayer: viewer }));
    const board = sceneFor(model);
    assert.equal(board.azimuth, viewer === 1 ? Math.PI : 0);
    for (const cell of board.layout.cells) {
      const p = board.cellScreen(cell.key);
      assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1, `${cell.key} is on screen`);
      assert.equal(board.pick(p.x, p.y), cell.key);
    }
    // The viewer's own lane is at the bottom of the screen.
    const g = R.geometry(R.DEFAULT_CONFIG);
    const mine = board.cellScreen(g.cellId(viewer, 1));
    const theirs = board.cellScreen(g.cellId(R.otherPlayer(viewer), 1));
    assert.ok(mine.y < theirs.y);
  }
});

test('tapping a piece picks the cell it stands on', () => {
  const model = initModel(gameWith({ 'p0-s1': 6 }));
  const board = sceneFor(model);
  const at = board.unitWorld('p0-s1');
  // Aim at the piece's head, which hides part of the cell behind it.
  const target = at.clone();
  target.y += 0.42;
  const p = target.project(board.camera);
  assert.equal(board.pick(p.x, p.y), unitKey(model.game, R.getUnit(model.game, 'p0-s1')));
});

test('a move hops between cells, then the captured unit leaves after the attacker lands', () => {
  let model = initModel(gameWith({ 'p0-s1': 6, 'p1-s1': 8 }, { drawn: 2 }));
  const board = sceneFor(model);
  const g = R.geometry(R.DEFAULT_CONFIG);
  const from = board.unitWorld('p0-s1');
  model = step(board, model, { type: 'tap', key: g.cellId(0, 6) }, 0);
  assert.equal(interactions(model).dest, g.cellId(0, 8));
  board.tick(0);
  model = step(board, model, { type: 'confirm' }, 1000);
  assert.equal(R.getUnit(model.game, 'p1-s1').pos, R.HOME);

  board.tick(1000 + TIMING.hopBase / 2);
  const mid = board.unitWorld('p0-s1');
  assert.ok(mid.y > TILE_TOP + 0.3, 'in the air halfway');
  assert.ok(mid.x !== from.x, 'on its way');
  assert.ok(board.unitWorld('p1-s1'), 'the victim is still there while the attacker hops');

  const hop = TIMING.hopBase + TIMING.hopPerCell; // two cells
  board.tick(1000 + hop + 1);
  const landed = board.unitWorld('p0-s1');
  const dest = board.layout.byKey.get(g.cellId(0, 8));
  assert.ok(Math.abs(landed.x - dest.x) < 1e-6 && Math.abs(landed.z - dest.z) < 1e-6);

  board.tick(1000 + hop + TIMING.capture + 2);
  assert.equal(board.unitWorld('p1-s1'), null, 'gone from the board');
});

test('selecting a unit zooms toward it; handing off turns the camera half a circle', () => {
  let model = initModel(gameWith({ 'p0-s1': 6 }, { drawn: 2 }));
  const board = sceneFor(model);
  const far = board.distance;
  const g = R.geometry(R.DEFAULT_CONFIG);
  model = step(board, model, { type: 'tap', key: g.cellId(0, 6) }, 0);
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
  assert.ok(Math.abs(Math.cos(board.azimuth) + 1) < 1e-9, 'now facing from player 1\'s side');
});

test('a scene can be thrown away and rebuilt for another board size', () => {
  const short = R.createGame({ seed: 3, config: { board: { startLane: 3, middleLane: 8, endLane: 2, towers: [7, 13], campsites: [5] } } });
  const board = sceneFor(initModel(short));
  assert.equal(board.layout.cells.length, R.geometry(short.config).cellCount);
  board.dispose();
});
