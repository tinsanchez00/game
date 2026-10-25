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
 * { row, col, gap, key, tower, campsite, player, pos } where key is the rules cellId,
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
        slots.push({ row, col, gap: true, key: null, tower: false, campsite: false, player: null, pos: null });
      } else {
        slots.push({
          row, col, gap: false, key: g.cellId(player, pos), tower: g.isTower(pos), campsite: g.isCampsite(pos), player, pos,
        });
      }
    }
  }
  return slots;
}

// --- the ring board (3-4 players) ----------------------------------------------

/**
 * Cells of a ring board as seen by `viewer` (their gate at the bottom),
 * in board units centred on the ring's middle (1 = one cell):
 * [{ key, x, y, rot, tower, campsite, owner, shared }] plus { size } = the
 * half-width of the area the cells need. Each player's start lane points
 * outward from their gate, their end lane inward toward the centre, where
 * units ascend. Pure: no DOM.
 */
export function ringSlots(viewer, config) {
  const g = geometry(config);
  const N = g.ring;
  const R = (N / (2 * Math.PI)) * 1.22;
  const at = (j, radius) => {
    const deg = 90 + ((j - g.gate(viewer)) * 360) / N;
    const a = (deg * Math.PI) / 180;
    return { x: radius * Math.cos(a), y: radius * Math.sin(a), rot: deg - 90 };
  };
  const cells = new Map();
  for (let p = 0; p < g.players; p += 1) {
    const gate = g.gate(p);
    for (let pos = 1; pos <= g.pathLength; pos += 1) {
      const key = g.cellId(p, pos);
      if (cells.has(key)) continue;
      let spot;
      if (pos < g.middleFirst) spot = at(gate, R + (g.middleFirst - pos));
      else if (pos <= g.middleLast) spot = at(gate + pos - g.middleFirst, R);
      else spot = at(gate + g.middleLane - 1, R - (pos - g.middleLast));
      const shared = g.isShared(pos);
      cells.set(key, {
        key,
        ...spot,
        tower: g.isTowerAt(p, pos),
        campsite: g.isCampsiteAt(p, pos),
        owner: shared ? null : p,
        shared,
      });
    }
  }
  return { cells: [...cells.values()], size: R + g.startLane + 0.6 };
}
