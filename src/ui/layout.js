// Maps rule positions to the on-screen board grid (8 columns x 3 rows).
// Row 0 is the other player's lane, row 1 the shared lane, row 2 the
// viewer's lane. Pure: no DOM, so it can be tested with node --test.

import { PATH_LENGTH, cellId, isTower, middleIndex } from '../rules/index.js';

export const COLUMNS = 8;
export const ROWS = 3;

const GAP_COLUMNS = new Set([4, 5]);

/** Private-lane column for path position `pos` (1..4, 13, 14). */
function privateColumn(pos) {
  if (pos <= 4) return 4 - pos;
  return pos === 13 ? 7 : 6;
}

/** Private-lane path position for a column, or null for a gap. */
function privatePosition(col) {
  if (GAP_COLUMNS.has(col)) return null;
  if (col <= 3) return 4 - col;
  return col === 7 ? 13 : 14;
}

/** Grid { row, col } of a unit of `player` at `pos`, seen by `viewer`. */
export function gridPosition(player, pos, viewer) {
  if (pos < 1 || pos > PATH_LENGTH) return null;
  const mid = middleIndex(pos);
  if (mid !== null) return { row: 1, col: mid - 1 };
  return { row: player === viewer ? 2 : 0, col: privateColumn(pos) };
}

/**
 * Every grid slot in row-major order:
 * { row, col, gap, key, tower, player, pos } where key is the rules cellId,
 * player/pos describe the cell from its owner's path (shared cells: viewer).
 */
export function boardSlots(viewer) {
  const other = viewer === 0 ? 1 : 0;
  const slots = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLUMNS; col += 1) {
      let player;
      let pos;
      if (row === 1) {
        player = viewer;
        pos = col + 5;
      } else {
        player = row === 0 ? other : viewer;
        pos = privatePosition(col);
      }
      if (pos === null) {
        slots.push({ row, col, gap: true, key: null, tower: false, player: null, pos: null });
      } else {
        slots.push({
          row, col, gap: false, key: cellId(player, pos), tower: isTower(pos), player, pos,
        });
      }
    }
  }
  return slots;
}
