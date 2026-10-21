// Maps rule positions to the on-screen board grid (3 rows).
// Row 0 is the other player's lane, row 1 the shared lane, row 2 the
// viewer's lane. Start lanes run right-to-left from the shared lane's start;
// end lanes sit at the far right. Pure: no DOM, so it can be tested.

import { DEFAULT_CONFIG, geometry } from '../rules/index.js';

export const ROWS = 3;

export function columnsFor(config = DEFAULT_CONFIG) {
  const g = geometry(config);
  return Math.max(g.middleLane, g.startLane + g.endLane);
}

/** Private-lane column for path position `pos`. */
function privateColumn(g, cols, pos) {
  if (pos <= g.startLane) return g.startLane - pos;
  return cols - (pos - g.middleLast);
}

/** Private-lane path position for a column, or null for a gap. */
function privatePosition(g, cols, col) {
  if (col < g.startLane) return g.startLane - col;
  if (col >= cols - g.endLane) return g.middleLast + (cols - col);
  return null;
}

/** Grid { row, col } of a unit of `player` at `pos`, seen by `viewer`. */
export function gridPosition(player, pos, viewer, config = DEFAULT_CONFIG) {
  const g = geometry(config);
  if (!g.isOnBoard(pos)) return null;
  const mid = g.middleIndex(pos);
  if (mid !== null) return { row: 1, col: mid - 1 };
  return { row: player === viewer ? 2 : 0, col: privateColumn(g, columnsFor(config), pos) };
}

/**
 * Every grid slot in row-major order:
 * { row, col, gap, key, tower, player, pos } where key is the rules cellId,
 * player/pos describe the cell from its owner's path (shared cells: viewer).
 */
export function boardSlots(viewer, config = DEFAULT_CONFIG) {
  const g = geometry(config);
  const cols = columnsFor(config);
  const other = viewer === 0 ? 1 : 0;
  const slots = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let player;
      let pos;
      if (row === 1) {
        player = viewer;
        pos = col < g.middleLane ? g.middleFirst + col : null;
      } else {
        player = row === 0 ? other : viewer;
        pos = privatePosition(g, cols, col);
      }
      if (pos === null) {
        slots.push({ row, col, gap: true, key: null, tower: false, player: null, pos: null });
      } else {
        slots.push({
          row, col, gap: false, key: g.cellId(player, pos), tower: g.isTower(pos), player, pos,
        });
      }
    }
  }
  return slots;
}
