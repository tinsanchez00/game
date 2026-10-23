// World-space layout for the 3D table. Pure: no DOM and no three.js, so it
// can be tested. The world is fixed to player 0's side of the table (player
// 0's lane nearest +z); the camera turns around it for player 1.
//
// Units: 1 world unit = one cell. x runs along the lanes, z across them,
// y is up. The board's cells sit at y = TILE_TOP; the table under it at
// TABLE_Y. Each player's side of the table (beyond their lane) holds, from
// left to right: the discard fan, the home tray (at the path's first cell),
// the deck, drawn card and power card, and the ascended tray (at the last cell).

import * as R from '../../rules/index.js';
import { unitKey } from '../controller.js';
import { boardSlots, columnsFor, ROWS } from '../layout.js';

export const CELL = 1;
export const PITCH = 1.08; // cell size plus the gap between cells
export const TILE_TOP = 0.1; // height of a cell's surface
export const STACK_OFFSET = 0.21; // two units on a cell sit this far either side of its centre
export const BOARD_PAD = 0.34; // board base beyond the outer cells
export const BOARD_RIM = 0.08; // gold rim beyond the base
export const TABLE_Y = -0.28; // table surface
export const TRAY_TOP = TABLE_Y + 0.06; // where units stand in a tray

export const TRAY = { slot: 0.48, row: 0.42, pad: 0.2, depth: 1.0 };
export const CARD = { w: 0.9, d: 1.26 };
export const DECK = { w: 0.8, d: 1.12 };
export const MINI = { w: 0.36, d: 0.5, step: 0.17 };
export const LABEL = { w: 1.3, h: 0.24 };

const GAP = 0.3; // board edge to the trays and cards
const CARD_GAP = 0.2;

/** Where a player's things sit on the table (see the file comment). */
function sideLayout(player, g, byKey, edge, trayW) {
  const s = player === 0 ? 1 : -1;
  const homeX = byKey.get(g.cellId(player, 1)).x;
  const ascX = byKey.get(g.cellId(player, g.pathLength)).x;
  const trayZ = s * (edge + GAP + TRAY.depth / 2);
  const cardZ = s * (edge + GAP + CARD.d / 2);
  const labelZ = s * (edge + GAP + CARD.d + 0.24);

  // Cards fill the space between the two trays.
  const left = Math.min(homeX, ascX) + trayW / 2;
  const right = Math.max(homeX, ascX) - trayW / 2;
  const total = DECK.w + 2 * CARD.w + 2 * CARD_GAP;
  const start = (left + right) / 2 - total / 2;
  const deckX = start + DECK.w / 2;
  const drawnX = start + DECK.w + CARD_GAP + CARD.w / 2;
  const powerX = drawnX + CARD.w + CARD_GAP;
  // The discard fan ends just short of the home tray; newer cards lie to the right.
  const discardRight = Math.min(homeX, ascX) - trayW / 2 - 0.15;

  return {
    side: s,
    trays: {
      home: { key: `home:${player}`, x: homeX, z: trayZ, w: trayW, d: TRAY.depth },
      asc: { key: `asc:${player}`, x: ascX, z: trayZ, w: trayW, d: TRAY.depth },
    },
    deck: { x: deckX, z: s * (edge + GAP + DECK.d / 2) },
    drawn: { x: drawnX, z: cardZ },
    power: { x: powerX, z: cardZ },
    discard: { right: discardRight, z: cardZ },
    labels: {
      deck: { x: deckX, z: labelZ },
      drawn: { x: drawnX, z: labelZ },
      power: { x: powerX, z: labelZ },
      home: { x: homeX, z: labelZ },
      asc: { x: ascX, z: labelZ },
      discard: { x: discardRight - 0.7, z: labelZ },
    },
  };
}

/** Discard fan: x of card `i` (0 = oldest) of `n`. */
export function discardX(side, i, n) {
  return side.discard.right - MINI.w / 2 - (n - 1 - i) * MINI.step;
}

/**
 * { cols, rows, width, depth, cells, byKey, sides: [p0, p1], trays: Map key -> tray, table }
 * cells: [{ key, x, z, row, col, tower, campsite }]
 */
export function boardLayout3d(config = R.DEFAULT_CONFIG) {
  const g = R.geometry(config);
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
  const byKey = new Map(cells.map((c) => [c.key, c]));
  const width = cols * PITCH;
  const depth = ROWS * PITCH;
  const edge = depth / 2 + BOARD_PAD + BOARD_RIM;

  const trayCols = Math.max(3, Math.ceil(R.teamSize(config) / 2));
  const trayW = trayCols * TRAY.slot + TRAY.pad;
  const sides = [0, 1].map((p) => sideLayout(p, g, byKey, edge, trayW));
  const trays = new Map();
  for (const side of sides) for (const t of Object.values(side.trays)) trays.set(t.key, { ...t, cols: trayCols });

  const fanLeft = Math.min(...sides.map((s) => discardX(s, 0, config.moveDeck.length) - MINI.w / 2));
  const halfX = Math.max(width / 2 + BOARD_PAD + BOARD_RIM, -fanLeft) + 0.4;
  const halfZ = edge + GAP + CARD.d + 0.24 + LABEL.h / 2 + 0.3;

  return {
    cols,
    rows: ROWS,
    width,
    depth,
    cells,
    byKey,
    sides,
    trays,
    table: { halfX, halfZ },
  };
}

/** Units in a tray: soldiers first, then commanders, each by id. */
function trayOrder(a, b) {
  if (a.type !== b.type) return a.type === 'soldier' ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

/**
 * Where every unit stands: Map id -> { key, where, x, y, z, slot, size }.
 * where: 'cell' | 'home' | 'asc'. Two units on one cell sit side by side,
 * in a stable order (by id); units in a tray fill its slots in rows.
 */
export function unitPlacements(game, layout = boardLayout3d(game.config)) {
  const groups = new Map();
  for (const u of game.units) {
    const key = unitKey(game, u);
    const list = groups.get(key) ?? [];
    list.push(u);
    groups.set(key, list);
  }
  const out = new Map();
  for (const [key, units] of groups) {
    const cell = layout.byKey.get(key);
    if (cell) {
      units.sort((a, b) => (a.id < b.id ? -1 : 1));
      units.forEach((u, i) => {
        const offset = units.length === 1 ? 0 : (i - (units.length - 1) / 2) * 2 * STACK_OFFSET;
        out.set(u.id, { key, where: 'cell', x: cell.x + offset, y: TILE_TOP, z: cell.z, slot: i, size: units.length });
      });
      continue;
    }
    const tray = layout.trays.get(key);
    if (!tray) continue;
    units.sort(trayOrder);
    units.forEach((u, i) => {
      const col = i % tray.cols;
      const row = Math.floor(i / tray.cols);
      out.set(u.id, {
        key,
        where: key.startsWith('home:') ? 'home' : 'asc',
        x: tray.x + (col - (tray.cols - 1) / 2) * TRAY.slot,
        y: TRAY_TOP,
        z: tray.z + (row - 0.5) * TRAY.row,
        slot: i,
        size: units.length,
      });
    });
  }
  return out;
}
