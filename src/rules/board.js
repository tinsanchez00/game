// Board geometry, derived from a game's settings. Each player's units travel
// along their own numbered path:
//   0                    home field (off the board)
//   1 .. startLane       private start lane
//   next middleLane      shared lane: the same physical cells for both players,
//                        travelled in the same direction
//   next endLane         private end lane
//   pathLength + 1       ascended (off the board)
//
// geometry(config) is cached per config object.

import { DEFAULT_CONFIG, pathLengthOf } from './config.js';

export const HOME = 0;

const cache = new WeakMap();

export function geometry(config) {
  let g = cache.get(config);
  if (!g) {
    g = buildGeometry(config.board);
    cache.set(config, g);
  }
  return g;
}

function buildGeometry(board) {
  const { startLane, middleLane, endLane } = board;
  const pathLength = pathLengthOf(board);
  const ascended = pathLength + 1;
  const middleFirst = startLane + 1;
  const middleLast = startLane + middleLane;
  const towerSet = new Set(board.towers);
  const campsiteSet = new Set(board.campsites);

  // Physical cells: player 0 private, player 1 private, then shared.
  const privateCount = startLane + endLane;
  const cellCount = 2 * privateCount + middleLane;
  const cellIndexTable = [[], []];
  const cellIdTable = [[], []];
  const towerTable = [];
  const campsiteTable = [];
  for (let pos = 0; pos <= ascended; pos += 1) {
    towerTable[pos] = pos >= 1 && pos <= pathLength && towerSet.has(pos);
    campsiteTable[pos] = pos >= 1 && pos <= pathLength && campsiteSet.has(pos);
    for (const player of [0, 1]) {
      let index = -1;
      let id = null;
      if (pos >= middleFirst && pos <= middleLast) {
        index = 2 * privateCount + (pos - middleFirst);
        id = `shared-${pos - startLane}`;
      } else if (pos >= 1 && pos <= pathLength) {
        const k = pos < middleFirst ? pos - 1 : pos - middleLane - 1;
        index = player * privateCount + k;
        id = `p${player}-${pos}`;
      }
      cellIndexTable[player][pos] = index;
      cellIdTable[player][pos] = id;
    }
  }

  return Object.freeze({
    startLane,
    middleLane,
    endLane,
    pathLength,
    ascended,
    middleFirst,
    middleLast,
    cellCount,
    towers: Object.freeze([...board.towers]),
    campsites: Object.freeze([...board.campsites]),
    isOnBoard: (pos) => pos >= 1 && pos <= pathLength,
    isShared: (pos) => pos >= middleFirst && pos <= middleLast,
    isTower: (pos) => towerTable[pos] === true,
    isCampsite: (pos) => campsiteTable[pos] === true,
    /** 1-based index along the middle lane, or null outside it. */
    middleIndex: (pos) => (pos >= middleFirst && pos <= middleLast ? pos - startLane : null),
    /** Path position of a middle-lane index (same for both players). */
    posFromMiddleIndex: (index) => index + startLane,
    /** Integer id of the physical cell, or -1 when off the board. */
    cellIndex: (player, pos) => cellIndexTable[player][pos] ?? -1,
    /** String id of the physical cell, or null when off the board. */
    cellId: (player, pos) => cellIdTable[player][pos] ?? null,
  });
}

// --- the default board, for code and tests that don't carry a config ------

const D = geometry(DEFAULT_CONFIG);

export const PATH_LENGTH = D.pathLength;
export const ASCENDED = D.ascended;
export const MIDDLE_LANE_LENGTH = D.middleLane;
export const TOWER_POSITIONS = D.towers;
export const isOnBoard = D.isOnBoard;
export const isShared = D.isShared;
export const isTower = D.isTower;
export const CAMPSITE_POSITIONS = D.campsites;
export const isCampsite = D.isCampsite;
export const middleIndex = D.middleIndex;
export const posFromMiddleIndex = D.posFromMiddleIndex;
export const cellId = D.cellId;
