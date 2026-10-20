// Board geometry. Each player's units travel along their own numbered path:
//   0            home field (off the board)
//   1..13        cells on the board
//   14           ascended (off the board)
// Positions 5..11 map to the same physical cells for both players; the rest
// are private to each player.

export const HOME = 0;
export const PATH_LENGTH = 13;
export const ASCENDED = PATH_LENGTH + 1;

const START_LANE_LAST = 4;
const SHARED_LAST = 11;

export const TOWER_POSITIONS = Object.freeze([4, 8, 13]);

export function isOnBoard(pos) {
  return pos >= 1 && pos <= PATH_LENGTH;
}

export function isShared(pos) {
  return pos > START_LANE_LAST && pos <= SHARED_LAST;
}

export function isTower(pos) {
  return TOWER_POSITIONS.includes(pos);
}

/**
 * Physical cell id for a player's path position, or null when the position is
 * off the board. Shared cells get the same id for both players.
 */
export function cellId(player, pos) {
  if (!isOnBoard(pos)) return null;
  if (isShared(pos)) return `shared-${pos - START_LANE_LAST}`;
  return `p${player}-${pos}`;
}
