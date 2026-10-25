// Board geometry, derived from a game's settings. Each player's units travel
// along their own numbered path:
//   0                    home field (off the board)
//   1 .. startLane       private start lane
//   next middleLane      shared cells, travelled in the same direction
//   next endLane         private end lane
//   pathLength + 1       ascended (off the board)
//
// Two players share one middle lane (the same cells, at the same path
// positions). With 3-4 players (board.ring > 0) the shared cells form a loop
// of `ring` cells; player p enters it at gate p * ring / players and travels
// middleLane cells of it, so the same physical cell sits at different path
// positions for different players. Towers and campsites are physical cells:
// a cell is special when it holds a special path position for any player.
//
// geometry(config) is cached per config object.

import { DEFAULT_CONFIG, pathLengthOf } from './config.js';

export const HOME = 0;

const cache = new WeakMap();

export function geometry(config) {
  let g = cache.get(config);
  if (!g) {
    g = buildGeometry(config.board, config.players ?? 2);
    cache.set(config, g);
  }
  return g;
}

function buildGeometry(board, players) {
  const { startLane, middleLane, endLane } = board;
  const ring = board.ring ?? 0;
  const pathLength = pathLengthOf(board);
  const ascended = pathLength + 1;
  const middleFirst = startLane + 1;
  const middleLast = startLane + middleLane;
  const towerSet = new Set(board.towers);
  const campsiteSet = new Set(board.campsites);
  const playerList = Array.from({ length: players }, (_, i) => i);

  // Physical cells: each player's private cells in turn, then the shared ones.
  const privateCount = startLane + endLane;
  const sharedCount = ring || middleLane;
  const sharedBase = players * privateCount;
  const cellCount = sharedBase + sharedCount;
  const gate = (player) => (ring ? (player * ring) / players : 0);
  const cellIndexTable = playerList.map(() => []);
  const cellIdTable = playerList.map(() => []);
  const posTable = playerList.map(() => new Int16Array(cellCount).fill(-1)); // cell -> path position
  const towerTable = [];
  const campsiteTable = [];
  const towerCell = new Uint8Array(cellCount);
  const campsiteCell = new Uint8Array(cellCount);
  for (let pos = 0; pos <= ascended; pos += 1) {
    towerTable[pos] = pos >= 1 && pos <= pathLength && towerSet.has(pos);
    campsiteTable[pos] = pos >= 1 && pos <= pathLength && campsiteSet.has(pos);
    for (const player of playerList) {
      let index = -1;
      let id = null;
      if (pos >= middleFirst && pos <= middleLast) {
        const k = pos - middleFirst;
        const shared = ring ? (gate(player) + k) % ring : k;
        index = sharedBase + shared;
        id = `shared-${shared + 1}`;
      } else if (pos >= 1 && pos <= pathLength) {
        const k = pos < middleFirst ? pos - 1 : pos - middleLane - 1;
        index = player * privateCount + k;
        id = `p${player}-${pos}`;
      }
      cellIndexTable[player][pos] = index;
      cellIdTable[player][pos] = id;
      if (index >= 0) {
        posTable[player][index] = pos;
        if (towerTable[pos]) towerCell[index] = 1;
        if (campsiteTable[pos]) campsiteCell[index] = 1;
      }
    }
  }
  const cellIndex = (player, pos) => cellIndexTable[player]?.[pos] ?? -1;

  return Object.freeze({
    players,
    ring,
    startLane,
    middleLane,
    endLane,
    pathLength,
    ascended,
    middleFirst,
    middleLast,
    cellCount,
    sharedBase,
    sharedCount,
    towers: Object.freeze([...board.towers]),
    campsites: Object.freeze([...board.campsites]),
    isOnBoard: (pos) => pos >= 1 && pos <= pathLength,
    isShared: (pos) => pos >= middleFirst && pos <= middleLast,
    /** A tower position on a player's path (two players: the same for both). */
    isTower: (pos) => towerTable[pos] === true,
    isCampsite: (pos) => campsiteTable[pos] === true,
    /** Is the cell `player` reaches at `pos` a tower (any player's)? */
    isTowerAt: (player, pos) => {
      const c = cellIndex(player, pos);
      return c >= 0 && towerCell[c] === 1;
    },
    isCampsiteAt: (player, pos) => {
      const c = cellIndex(player, pos);
      return c >= 0 && campsiteCell[c] === 1;
    },
    isTowerCell: (c) => towerCell[c] === 1,
    isCampsiteCell: (c) => campsiteCell[c] === 1,
    /** Gate (first shared cell, 0-based) of `player` on a ring; 0 otherwise. */
    gate,
    /** 1-based index along the middle lane, or null outside it (two players). */
    middleIndex: (pos) => (pos >= middleFirst && pos <= middleLast ? pos - startLane : null),
    /** Path position of a middle-lane index (two players: the same for both). */
    posFromMiddleIndex: (index) => index + startLane,
    /** Integer id of the physical cell, or -1 when off the board. */
    cellIndex,
    /** String id of the physical cell, or null when off the board. */
    cellId: (player, pos) => cellIdTable[player]?.[pos] ?? null,
    /** Path position where `player` reaches physical cell `c`, or -1 when it isn't on their path. */
    posOf: (player, c) => (c >= 0 ? posTable[player][c] : -1),
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
