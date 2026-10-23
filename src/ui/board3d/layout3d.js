// World-space layout for the 3D board. Pure: no DOM and no three.js, so it can
// be tested. The world is fixed to player 0's side of the table (player 0's
// lane nearest +z); the camera turns around it for player 1.
//
// Units: 1 world unit = one cell. x runs along the lanes, z across them,
// y is up. The board's top surface is at y = 0.

import * as R from '../../rules/index.js';
import { unitKey } from '../controller.js';
import { boardSlots, columnsFor, ROWS } from '../layout.js';

export const CELL = 1;
export const PITCH = 1.08; // cell size plus the gap between cells
export const TILE_TOP = 0.1; // height of a cell's surface
export const STACK_OFFSET = 0.21; // two units on a cell sit this far either side of its centre

/** { cols, rows, width, depth, cells: [{ key, x, z, row, col, tower, campsite }], byKey } */
export function boardLayout3d(config = R.DEFAULT_CONFIG) {
  const cols = columnsFor(config);
  const cells = boardSlots(0, config)
    .filter((s) => !s.gap)
    .map((s) => ({
      key: s.key,
      row: s.row,
      col: s.col,
      x: (s.col - (cols - 1) / 2) * PITCH,
      z: (s.row - (ROWS - 1) / 2) * PITCH,
      tower: s.tower,
      campsite: s.campsite,
    }));
  return {
    cols,
    rows: ROWS,
    width: cols * PITCH,
    depth: ROWS * PITCH,
    cells,
    byKey: new Map(cells.map((c) => [c.key, c])),
  };
}

/**
 * Where every unit stands: Map id -> { key, onBoard, x, z, slot, size }.
 * Off the board (home or ascended) only `key` is meaningful.
 * Two units on one cell sit side by side, in a stable order (by id).
 */
export function unitPlacements(game, layout = boardLayout3d(game.config)) {
  const byCell = new Map();
  const out = new Map();
  for (const u of game.units) {
    const key = unitKey(game, u);
    const cell = layout.byKey.get(key);
    if (!cell) {
      out.set(u.id, { key, onBoard: false, x: 0, z: 0, slot: 0, size: 0 });
      continue;
    }
    const list = byCell.get(key) ?? [];
    list.push(u.id);
    byCell.set(key, list);
  }
  for (const [key, ids] of byCell) {
    const cell = layout.byKey.get(key);
    ids.sort();
    ids.forEach((id, i) => {
      const offset = ids.length === 1 ? 0 : (i - (ids.length - 1) / 2) * 2 * STACK_OFFSET;
      out.set(id, { key, onBoard: true, x: cell.x + offset, z: cell.z, slot: i, size: ids.length });
    });
  }
  return out;
}
