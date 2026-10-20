// Board geometry. Each player's units travel along their own numbered path:
//   0            home field (off the board)
//   1..14        cells on the board
//   15           ascended (off the board)
// Positions 5..12 (the middle lane) map to the same physical cells for both
// players, in the same direction; the rest are private to each player.

export const HOME = 0;
export const PATH_LENGTH = 14;
export const ASCENDED = PATH_LENGTH + 1;

const START_LANE_LAST = 4;
const MIDDLE_LANE_LAST = 12;
export const MIDDLE_LANE_LENGTH = MIDDLE_LANE_LAST - START_LANE_LAST;

export const TOWER_POSITIONS = Object.freeze([4, 8, 14]);

export function isOnBoard(pos) {
  return pos >= 1 && pos <= PATH_LENGTH;
}

export function isShared(pos) {
  return pos > START_LANE_LAST && pos <= MIDDLE_LANE_LAST;
}

export function isTower(pos) {
  return TOWER_POSITIONS.includes(pos);
}

/** 1-based index along the middle lane, or null outside it. */
export function middleIndex(pos) {
  return isShared(pos) ? pos - START_LANE_LAST : null;
}

/** Path position of a middle-lane index (same for both players). */
export function posFromMiddleIndex(index) {
  return index + START_LANE_LAST;
}

/**
 * Physical cell id for a player's path position, or null when the position is
 * off the board. Shared cells get the same id for both players.
 */
export function cellId(player, pos) {
  if (!isOnBoard(pos)) return null;
  if (isShared(pos)) return `shared-${middleIndex(pos)}`;
  return `p${player}-${pos}`;
}
