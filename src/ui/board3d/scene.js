// The 3D table as a three.js scene graph: board, trays, cards, pieces,
// highlights, Lovers lines, camera and animations. No renderer and no DOM
// listeners here (see mount.js), so it runs in Node for tests; textures that
// need a canvas are skipped there (plain colours instead).
//
// Shapes, sizes, materials, camera angle, zoom and timings below are
// placeholders until final ones are picked.

import * as THREE from '../../../vendor/three/three.module.js';
import * as R from '../../rules/index.js';
import { TEXT } from '../labels.js';
import {
  BOARD_PAD, BOARD_RIM, boardLayout3d, CARD, CELL, DECK, discardX, LABEL, MINI, TABLE_Y, TILE_TOP, unitPlacements,
} from './layout3d.js';
import * as TX from './textures.js';

// --- palette (Royal Tomb, from style.css) -------------------------------------------

const C = {
  lapisDeep: 0x142147,
  lapisNight: 0x0c1633,
  lapis: 0x23408f,
  lapisCard: 0x1d3b8c,
  gold: 0xd4af5a,
  goldDim: 0x9c7f3c,
  shell: 0xefe6cf,
  shellBright: 0xf8f1de,
  shellDim: 0xd6cbae,
  cellLine: 0xb89a55,
  carnelian: 0xc2533a,
  lovers: 0xc2453a,
  teamGold: 0xe2b84e,
  teamGoldRim: 0x3a2a08,
  teamObsidian: 0x241a14,
  teamObsidianRim: 0xd4af5a,
  ascTray: 0x1a2a57,
  room: 0x120d09, // the dark room around the table
  wood: 0x3a2416,
  boardWood: 0x5a3820,
  felt: 0x16245a,
};

// --- timings (ms) and camera (placeholders) -------------------------------------------

export const TIMING = {
  hopBase: 230, // a one-cell hop
  hopPerCell: 35, // added per extra cell
  enter: 300, // home tray -> board
  capture: 420, // board -> home tray (a short flash, then the hop)
  ascend: 440, // board -> ascended tray
  slide: 160, // moving within a cell or tray
  spin: 650, // camera turn on handoff
  draw: 320, // deck -> drawn card
  rise: 320, // draft cards rising into view
};

export const CAMERA = {
  fov: 32,
  tilt: THREE.MathUtils.degToRad(34), // away from straight down
  margin: 0.94, // fraction of the view the table may fill
  zoom: 0.8, // distance factor while a unit is selected
  focus: 0.5, // how far the view centre moves toward the selection
};

const HOP_HEIGHT = 0.55;
const LIFT = 0.12; // selected units rise this much
const DRAFT = { w: 1.3, h: 1.82, gap: 0.35, z: -6 }; // draft cards, in camera space

// --- small helpers ----------------------------------------------------------------------

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;

/** A flat rectangular frame lying on the xz plane: outer w x d, border t. */
function rectFrame(w, d, t) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -d / 2);
  shape.lineTo(w / 2, -d / 2);
  shape.lineTo(w / 2, d / 2);
  shape.lineTo(-w / 2, d / 2);
  shape.closePath();
  const hole = new THREE.Path();
  const iw = w / 2 - t;
  const id = d / 2 - t;
  hole.moveTo(-iw, -id);
  hole.lineTo(-iw, id);
  hole.lineTo(iw, id);
  hole.lineTo(iw, -id);
  hole.closePath();
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}

function setMap(mat, tex, fallback) {
  const had = Boolean(mat.map);
  mat.map = tex ?? null;
  mat.color.setHex(tex ? 0xffffff : fallback);
  if (had !== Boolean(tex)) mat.needsUpdate = true;
}

// --- pieces (basic placeholder shapes) ----------------------------------------------------

const SOLDIER_PROFILE = [[0, 0], [0.19, 0], [0.19, 0.05], [0.15, 0.08], [0.1, 0.2], [0.075, 0.3], [0.12, 0.33], [0.06, 0.36], [0, 0.36]];
const COMMANDER_PROFILE = [[0, 0], [0.2, 0], [0.2, 0.06], [0.16, 0.09], [0.105, 0.26], [0.085, 0.4], [0.135, 0.43], [0.07, 0.46], [0, 0.46]];

const profile = (points) => new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), 24);

const GEO = { soldier: null, commander: null };
const SHARED = new Set(); // piece geometries shared by every scene: never disposed

function geometries() {
  if (GEO.soldier) return GEO;
  GEO.soldier = {
    body: profile(SOLDIER_PROFILE),
    head: new THREE.SphereGeometry(0.1, 20, 14).translate(0, 0.44, 0),
    band: new THREE.TorusGeometry(0.175, 0.018, 8, 28).rotateX(Math.PI / 2).translate(0, 0.05, 0),
  };
  const crownPoints = [];
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    crownPoints.push(new THREE.ConeGeometry(0.03, 0.08, 8).translate(Math.cos(a) * 0.095, 0.73, Math.sin(a) * 0.095));
  }
  GEO.commander = {
    body: profile(COMMANDER_PROFILE),
    head: new THREE.SphereGeometry(0.11, 20, 14).translate(0, 0.56, 0),
    band: new THREE.TorusGeometry(0.185, 0.02, 8, 28).rotateX(Math.PI / 2).translate(0, 0.06, 0),
    crown: new THREE.CylinderGeometry(0.115, 0.1, 0.09, 16, 1, true).translate(0, 0.66, 0),
    points: crownPoints,
  };
  for (const g of [GEO.soldier, GEO.commander]) for (const v of Object.values(g)) for (const geo of [v].flat()) SHARED.add(geo);
  return GEO;
}

function makePiece(unit) {
  const g = geometries()[unit.type === 'commander' ? 'commander' : 'soldier'];
  // Gold: polished metal. Obsidian: black volcanic glass with a clear coat.
  const body = unit.player === 0
    ? new THREE.MeshPhysicalMaterial({ color: 0xd9ab45, metalness: 1, roughness: 0.28 })
    : new THREE.MeshPhysicalMaterial({ color: 0x0f0c0b, metalness: 0, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06 });
  const rim = new THREE.MeshPhysicalMaterial({
    color: unit.player === 0 ? 0x6b4a14 : 0xd4af5a,
    metalness: 1,
    roughness: unit.player === 0 ? 0.45 : 0.3,
  });
  const group = new THREE.Group();
  const add = (geo, mat) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(g.body, body);
  add(g.head, body);
  add(g.band, rim);
  if (g.crown) {
    add(g.crown, rim);
    for (const p of g.points) add(p, rim);
  }
  group.userData = { unitId: unit.id, mats: [body, rim] };
  return group;
}

function setGlow(mats, hex, intensity) {
  for (const m of mats) {
    m.emissive.setHex(hex);
    m.emissiveIntensity = intensity;
  }
}

// --- cards and labels ----------------------------------------------------------------------

/**
 * A card lying on the table: yaw (turns to face the viewer) > flip (rotation.z
 * turns it face down) > front (up), back (down) and a thin gold edge.
 */
function makeCard(w, d) {
  const yaw = new THREE.Group();
  const flip = new THREE.Group();
  yaw.add(flip);
  const frontMat = new THREE.MeshStandardMaterial({ color: C.shell, roughness: 0.88, emissive: C.gold, emissiveIntensity: 0 });
  const backMat = new THREE.MeshStandardMaterial({ color: C.lapisCard, roughness: 0.8, emissive: C.gold, emissiveIntensity: 0 });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), frontMat);
  front.position.y = 0.007;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2), backMat);
  back.position.y = -0.007;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.995, 0.012, d * 0.995), new THREE.MeshStandardMaterial({ color: C.gold, metalness: 0.6, roughness: 0.4 }));
  edge.castShadow = true;
  front.receiveShadow = true;
  flip.add(edge, front, back);
  return {
    yaw,
    flip,
    front,
    back,
    mats: [frontMat, backMat],
    setFront: (tex, fallback = C.shell) => setMap(frontMat, tex, fallback),
    setBack: (tex, fallback = C.lapisCard) => setMap(backMat, tex, fallback),
  };
}

function makeSlot(w, d) {
  const m = new THREE.Mesh(rectFrame(w, d, 0.03), new THREE.MeshBasicMaterial({ color: C.gold, transparent: true, opacity: 0.35, depthWrite: false }));
  m.position.y = 0.003;
  return m;
}

/** Flat text on the table that turns with the camera: { yaw, set(text) }. */
function makeLabel(style = 'label', w = LABEL.w, h = LABEL.h) {
  const yaw = new THREE.Group();
  const t = TX.textLabel(style);
  if (!t) return { yaw, set() {}, dispose() {} };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  mesh.position.y = 0.004;
  yaw.add(mesh);
  return { yaw, set: t.set, dispose: t.dispose };
}

// --- board, table and trays ----------------------------------------------------------------------

function buildTable(layout) {
  // Wider than any view, so its edges are never seen; the room's fog hides the far end.
  const size = Math.max(layout.table.halfX, layout.table.halfZ) * 7;
  const wood = TX.tableWood();
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: wood ? 0xffffff : C.wood, map: wood, roughness: 0.62, metalness: 0 }),
  );
  top.position.y = TABLE_Y;
  top.receiveShadow = true;
  return top;
}

function highlightLayers(w, d, y) {
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: C.shellBright, transparent: true, opacity: 0, depthWrite: false }),
  );
  fill.position.y = y + 0.004;
  const frame = new THREE.Mesh(
    rectFrame(w, d, Math.min(w, d) * 0.085),
    new THREE.MeshBasicMaterial({ color: C.gold, transparent: true, opacity: 0, depthWrite: false }),
  );
  frame.position.y = y + 0.006;
  return { fill, frame };
}

function buildBoard(layout, surfaces) {
  const group = new THREE.Group();
  const pad = BOARD_PAD;
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(layout.width + pad * 2 + BOARD_RIM * 2, 0.26, layout.depth + pad * 2 + BOARD_RIM * 2),
    new THREE.MeshStandardMaterial({ color: C.gold, metalness: 1, roughness: 0.35 }),
  );
  rim.position.y = -0.15;
  rim.castShadow = true;
  rim.receiveShadow = true;
  const wood = TX.boardWood();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(layout.width + pad * 2, 0.26, layout.depth + pad * 2),
    new THREE.MeshStandardMaterial({ color: wood ? 0xffffff : C.boardWood, map: wood, roughness: 0.55 }),
  );
  base.castShadow = true;
  base.position.y = -0.11;
  base.receiveShadow = true;
  group.add(rim, base);

  const tileGeo = new THREE.BoxGeometry(CELL * 0.94, TILE_TOP, CELL * 0.94).translate(0, TILE_TOP / 2, 0);
  const edgeGeo = new THREE.BoxGeometry(CELL, TILE_TOP * 0.8, CELL).translate(0, TILE_TOP * 0.4, 0);
  const glyphGeo = new THREE.PlaneGeometry(CELL * 0.94, CELL * 0.94).rotateX(-Math.PI / 2);
  const stoneGeo = new THREE.SphereGeometry(0.072, 12, 8).scale(1, 0.55, 1);
  const edgeMat = new THREE.MeshStandardMaterial({ color: C.cellLine, metalness: 0.4, roughness: 0.5 });
  const goldMat = new THREE.MeshStandardMaterial({ color: C.gold, metalness: 0.7, roughness: 0.38 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: C.goldDim, metalness: 0.2, roughness: 0.75 });
  const towerTex = TX.towerGlyph();
  const shellTex = TX.shellInlay();
  const lapisTex = TX.lapisInlay();
  const sandTex = TX.sandInlay();

  for (const cell of layout.cells) {
    const c = new THREE.Group();
    c.position.set(cell.x, 0, cell.z);
    const color = cell.tower ? C.lapis : cell.campsite ? C.shellDim : C.shell;
    const inlay = cell.tower ? lapisTex : cell.campsite ? sandTex : shellTex;
    const tileMat = new THREE.MeshStandardMaterial({
      color: inlay ? 0xffffff : color, map: inlay, roughness: cell.tower ? 0.3 : 0.6, metalness: 0, emissive: C.gold, emissiveIntensity: 0,
    });
    const edge = new THREE.Mesh(edgeGeo, cell.tower ? goldMat : edgeMat);
    const tile = new THREE.Mesh(tileGeo, tileMat);
    tile.receiveShadow = true;
    edge.receiveShadow = true;
    tile.userData.key = cell.key;
    c.add(edge, tile);
    if (cell.tower && towerTex) {
      const glyph = new THREE.Mesh(glyphGeo, new THREE.MeshBasicMaterial({ map: towerTex, transparent: true, opacity: 0.6, depthWrite: false }));
      glyph.position.y = TILE_TOP + 0.002;
      c.add(glyph);
    }
    if (cell.campsite) {
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        const stone = new THREE.Mesh(stoneGeo, stoneMat);
        stone.position.set(Math.cos(a) * 0.32, TILE_TOP + 0.01, Math.sin(a) * 0.32);
        stone.castShadow = true;
        c.add(stone);
      }
    }
    const { fill, frame } = highlightLayers(CELL * 0.94, CELL * 0.94, TILE_TOP);
    c.add(fill, frame);
    group.add(c);
    surfaces.set(cell.key, { tile, tileMat, fill, frame, tower: cell.tower });
  }
  return group;
}

function buildTrays(layout, surfaces, yawers) {
  const group = new THREE.Group();
  const locks = new Map();
  const lockTex = TX.lockGlyph();
  const wood = TX.boardWood();
  const feltTex = TX.felt();
  for (const t of layout.trays.values()) {
    const home = t.key.startsWith('home:');
    const g = new THREE.Group();
    g.position.set(t.x, TABLE_Y, t.z);
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(t.w + 0.12, 0.08, t.d + 0.12),
      new THREE.MeshStandardMaterial({ color: wood ? 0xffffff : C.boardWood, map: wood, roughness: 0.55 }),
    );
    rim.position.y = 0.04;
    rim.castShadow = true;
    rim.receiveShadow = true;
    const tileMat = new THREE.MeshStandardMaterial({
      color: feltTex ? (home ? 0xffffff : 0xc9b48a) : (home ? C.felt : C.ascTray), map: feltTex, roughness: 1, emissive: C.gold, emissiveIntensity: 0,
    });
    const tile = new THREE.Mesh(new THREE.BoxGeometry(t.w, 0.061, t.d), tileMat);
    tile.position.y = 0.031;
    tile.receiveShadow = true;
    tile.userData.key = t.key;
    const { fill, frame } = highlightLayers(t.w, t.d, 0.06);
    g.add(rim, tile, fill, frame);
    if (home) {
      const lock = new THREE.Group();
      lock.position.set(t.w / 2 - 0.16, 0.065, -t.d / 2 + 0.16);
      if (lockTex) {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(0.2, 0.2).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ map: lockTex, transparent: true, depthWrite: false }),
        );
        lock.add(m);
      }
      lock.visible = false;
      yawers.push(lock);
      g.add(lock);
      locks.set(t.key, lock);
    }
    group.add(g);
    surfaces.set(t.key, { tile, tileMat, fill, frame, tower: false });
  }
  return { group, locks };
}

// --- Lovers lines ----------------------------------------------------------------------------

function buildLine(a, b, on) {
  const group = new THREE.Group();
  const dir = Math.sign(b.x - a.x) || 1;
  const start = a.x + dir * 0.35 * CELL;
  const end = b.x - dir * 0.35 * CELL;
  const length = Math.abs(end - start);
  const opacity = on ? 1 : 0.6;
  const mat = new THREE.MeshBasicMaterial({ color: C.lovers, transparent: true, opacity, depthWrite: false });
  const dash = 0.14;
  const gap = 0.1;
  const count = Math.max(1, Math.floor((length + gap) / (dash + gap)));
  const used = count * dash + (count - 1) * gap;
  const dashGeo = new THREE.BoxGeometry(dash, 0.02, 0.05);
  for (let i = 0; i < count; i += 1) {
    const m = new THREE.Mesh(dashGeo, mat);
    m.position.set(Math.min(start, end) + (length - used) / 2 + i * (dash + gap) + dash / 2, TILE_TOP + 0.03, a.z);
    group.add(m);
  }
  const heartTex = TX.heartGlyph();
  if (heartTex) {
    const heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, opacity, depthTest: false }));
    heart.scale.set(0.38, 0.38, 1);
    heart.position.set((start + end) / 2, TILE_TOP + 0.3, a.z);
    heart.renderOrder = 10;
    group.add(heart);
  }
  return group;
}

// --- a player's cards ------------------------------------------------------------------------------

function buildSide(L, player, yawers) {
  const group = new THREE.Group();

  const deck = new THREE.Group();
  deck.position.set(L.deck.x, TABLE_Y, L.deck.z);
  const stack = new THREE.Mesh(
    new THREE.BoxGeometry(DECK.w * 0.97, 1, DECK.d * 0.97),
    new THREE.MeshStandardMaterial({ color: C.goldDim, metalness: 0.3, roughness: 0.6, emissive: C.gold, emissiveIntensity: 0 }),
  );
  stack.castShadow = true;
  const top = makeCard(DECK.w, DECK.d);
  top.setFront(TX.cardBack(), C.lapisCard);
  top.setBack(TX.cardBack(), C.lapisCard);
  top.flip.rotation.z = Math.PI;
  const deckSlot = makeSlot(DECK.w, DECK.d);
  deck.add(stack, top.yaw, deckSlot);
  for (const m of [stack, top.front, top.back]) m.userData = { action: 'draw', player };
  yawers.push(top.yaw);

  const place = (card, at) => {
    card.yaw.position.set(at.x, TABLE_Y + 0.01, at.z);
    yawers.push(card.yaw);
    group.add(card.yaw);
    return card;
  };
  const drawn = place(makeCard(CARD.w, CARD.d), L.drawn);
  const power = place(makeCard(CARD.w, CARD.d), L.power);
  const drawnSlot = makeSlot(CARD.w, CARD.d);
  drawnSlot.position.set(L.drawn.x, TABLE_Y + 0.003, L.drawn.z);
  const powerSlot = makeSlot(CARD.w, CARD.d);
  powerSlot.position.set(L.power.x, TABLE_Y + 0.003, L.power.z);
  group.add(deck, drawnSlot, powerSlot);

  const labels = {};
  for (const [name, at] of Object.entries(L.labels)) {
    const label = makeLabel(name === 'home' ? 'caps' : 'label');
    label.yaw.position.set(at.x, TABLE_Y, at.z);
    yawers.push(label.yaw);
    group.add(label.yaw);
    labels[name] = label;
  }

  const minis = [];
  const mini = (i) => {
    while (minis.length <= i) {
      const m = makeCard(MINI.w, MINI.d);
      yawers.push(m.yaw);
      group.add(m.yaw);
      minis.push(m);
    }
    return minis[i];
  };

  return { group, deck, stack, top, deckSlot, drawn, power, drawnSlot, powerSlot, labels, minis, mini, L, shownDrawn: null, drawAnim: null };
}

// --- the scene -------------------------------------------------------------------------------

/**
 * createBoardScene(config) -> {
 *   scene, camera, layout,
 *   sync(model, ix, { animate, now }),  bring the scene up to date with a game model
 *   tick(now) -> boolean,               advance animations; true while anything moves
 *   resize(width, height),
 *   pick(ndcX, ndcY) -> action | null,  what a tap at a point does: { type: 'tap', key },
 *                                       { type: 'draw', player } or { type: 'keep', index }
 *   screenOf(object3d | key) -> { x, y },  normalized device coords (tests)
 *   unitWorld(id) -> Vector3 | null,
 *   parts,                              cards and draft cards (tests)
 *   dispose(),
 * }
 */
export function createBoardScene(config) {
  const layout = boardLayout3d(config);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 120);
  scene.add(camera);

  // A warm lamp over the table, a dim fill, and a dark room (fog) around it.
  scene.background = new THREE.Color(C.room);
  scene.fog = new THREE.Fog(C.room, 20, 60);
  scene.environmentIntensity = 0.45;
  scene.add(new THREE.HemisphereLight(0xffe9cc, 0x1a120b, 0.55));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.8);
  sun.position.set(3, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const half = Math.max(layout.table.halfX, layout.table.halfZ) + 1;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 30 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const yawers = []; // objects that turn to face the viewer
  const surfaces = new Map(); // tappable surfaces by key: cells and trays
  scene.add(buildTable(layout));
  scene.add(buildBoard(layout, surfaces));
  const trays = buildTrays(layout, surfaces, yawers);
  scene.add(trays.group);
  const sides = layout.sides.map((L, p) => buildSide(L, p, yawers));
  for (const s of sides) scene.add(s.group);

  const linesGroup = new THREE.Group();
  scene.add(linesGroup);
  let linesSig = '';

  // Draft: two power cards rise in front of the camera over a dimmed table.
  const hud = new THREE.Group();
  camera.add(hud);
  const dim = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshBasicMaterial({ color: C.room, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false }),
  );
  dim.position.z = DRAFT.z - 0.5;
  dim.renderOrder = 20;
  dim.visible = false;
  hud.add(dim);
  const draftCards = [0, 1].map((index) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(DRAFT.w, DRAFT.h),
      new THREE.MeshBasicMaterial({ color: C.shell, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }),
    );
    m.renderOrder = 21;
    m.visible = false;
    m.userData.keep = index;
    hud.add(m);
    return m;
  });
  const draft = { shown: false, start: 0 };

  const pieces = new Map(); // id -> { obj, place, anim, lift }
  let viewer = null;
  let lastGame = null;
  let pulseKeys = new Set();
  let doomed = new Set();
  const glow = { deck: null, power: null }; // cards that breathe: the deck to draw from, a power ready to use

  // Camera state: azimuth turns around the table; view centre and zoom follow the selection.
  const cam = {
    azimuth: 0,
    spin: null,
    aspect: 1,
    fit: 20,
    target: new THREE.Vector3(),
    targetGoal: new THREE.Vector3(),
    zoom: 1,
    zoomGoal: 1,
  };

  function placeCamera() {
    const dist = cam.fit * cam.zoom;
    const s = Math.sin(CAMERA.tilt);
    camera.position.set(
      cam.target.x + Math.sin(cam.azimuth) * s * dist,
      cam.target.y + Math.cos(CAMERA.tilt) * dist,
      cam.target.z + Math.cos(cam.azimuth) * s * dist,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(cam.target);
    camera.updateMatrixWorld();
  }

  /** Smallest distance at which the whole table is inside the view. */
  function fitDistance() {
    const { halfX, halfZ } = layout.table;
    const corners = [];
    for (const x of [-halfX, halfX]) for (const z of [-halfZ, halfZ]) for (const y of [TABLE_Y, 0.8]) corners.push(new THREE.Vector3(x, y, z));
    const saved = { az: cam.azimuth, zoom: cam.zoom, target: cam.target.clone() };
    cam.azimuth = 0;
    cam.zoom = 1;
    cam.target.set(0, 0, 0);
    let lo = 2;
    let hi = 120;
    for (let i = 0; i < 32; i += 1) {
      cam.fit = (lo + hi) / 2;
      placeCamera();
      camera.updateProjectionMatrix();
      const fits = corners.every((c) => {
        const p = c.clone().project(camera);
        return Math.abs(p.x) <= CAMERA.margin && Math.abs(p.y) <= CAMERA.margin && p.z < 1;
      });
      if (fits) hi = cam.fit;
      else lo = cam.fit;
    }
    cam.azimuth = saved.az;
    cam.zoom = saved.zoom;
    cam.target.copy(saved.target);
    return hi;
  }

  function resize(width, height) {
    cam.aspect = Math.max(0.1, width / Math.max(1, height));
    camera.aspect = cam.aspect;
    camera.far = 200;
    camera.updateProjectionMatrix();
    cam.fit = fitDistance();
    scene.fog.near = cam.fit * 1.05;
    scene.fog.far = cam.fit * 2.4;
    placeCamera();
  }

  // --- units ---

  function ensurePiece(unit) {
    let p = pieces.get(unit.id);
    if (!p) {
      const obj = makePiece(unit);
      scene.add(obj);
      p = { obj, place: null, anim: null, lift: 0 };
      pieces.set(unit.id, p);
    }
    return p;
  }

  function snap(p) {
    p.anim = null;
    p.obj.scale.setScalar(1);
    p.obj.position.set(p.place.x, p.place.y + p.lift, p.place.z);
  }

  function cellsBetween(a, b) {
    const ca = layout.byKey.get(a.key);
    const cb = layout.byKey.get(b.key);
    if (!ca || !cb) return 1;
    return Math.max(1, Math.round(Math.abs(ca.col - cb.col) + Math.abs(ca.row - cb.row)));
  }

  function syncUnits(game, animate, now) {
    const places = unitPlacements(game, layout);
    let landing = 0; // when attackers land: captures wait for it
    const pending = [];
    for (const unit of game.units) {
      const p = ensurePiece(unit);
      const next = places.get(unit.id);
      const prev = p.place;
      p.place = next;
      if (!animate || !prev) {
        snap(p);
        continue;
      }
      if (prev.key === next.key) {
        if (prev.x !== next.x || prev.z !== next.z) p.anim = { kind: 'slide', from: p.obj.position.clone(), start: now, dur: TIMING.slide };
        continue;
      }
      const from = p.obj.position.clone();
      if (next.where === 'cell') {
        const dur = prev.where === 'cell' ? TIMING.hopBase + TIMING.hopPerCell * (cellsBetween(prev, next) - 1) : TIMING.enter;
        p.anim = { kind: 'hop', arc: prev.where === 'cell' ? HOP_HEIGHT : 0.7, from, start: now, dur };
        landing = Math.max(landing, dur);
      } else if (next.where === 'home' && prev.where === 'cell') {
        pending.push({ p, anim: { kind: 'capture', arc: 0.9, from, start: now, dur: TIMING.capture } });
      } else if (next.where === 'asc') {
        p.anim = { kind: 'ascend', arc: 1.0, from, start: now, dur: TIMING.ascend };
      } else {
        p.anim = { kind: 'slide', from, start: now, dur: TIMING.slide };
      }
    }
    // Captured units wait for the attacker to land.
    for (const { p, anim } of pending) {
      anim.start += landing;
      p.anim = anim;
    }
  }

  function stepUnit(p, now) {
    const a = p.anim;
    const obj = p.obj;
    const to = new THREE.Vector3(p.place.x, p.place.y + p.lift, p.place.z);
    if (!a) {
      obj.position.y += (to.y - obj.position.y) * 0.35;
      return Math.abs(to.y - obj.position.y) > 0.001;
    }
    const t = clamp01((now - a.start) / a.dur);
    if (a.kind === 'capture') {
      // A red flash where the unit stood, then the hop home.
      setGlow(obj.userData.mats, C.carnelian, 1.2 * (1 - t));
      const move = clamp01((t - 0.3) / 0.7);
      const e = easeInOut(move);
      obj.position.lerpVectors(a.from, to, e);
      obj.position.y += Math.sin(Math.PI * move) * a.arc;
    } else if (a.kind === 'slide') {
      obj.position.lerpVectors(a.from, to, easeOut(t));
    } else {
      const e = easeInOut(t);
      obj.position.lerpVectors(a.from, to, e);
      obj.position.y += Math.sin(Math.PI * t) * a.arc;
      if (a.kind === 'ascend') setGlow(obj.userData.mats, C.gold, 0.8 * Math.sin(Math.PI * t));
    }
    if (t >= 1) {
      if (a.kind === 'capture' || a.kind === 'ascend') setGlow(obj.userData.mats, C.carnelian, 0);
      snap(p);
      return false;
    }
    return true;
  }

  // --- highlights ---

  function syncHighlights(ix) {
    const victimIds = new Set(ix.victims ?? []);
    const victimKeys = new Set();
    for (const [id, p] of pieces) if (victimIds.has(id) && p.place) victimKeys.add(p.place.key);
    pulseKeys = new Set();
    const dests = new Set([ix.dest, ...(ix.targets ?? [])].filter(Boolean));
    for (const [key, c] of surfaces) {
      const can = ix.tappable.includes(key);
      const sel = key === ix.selected;
      const dest = dests.has(key);
      c.tileMat.emissiveIntensity = 0;
      c.fill.material.opacity = 0;
      c.frame.material.opacity = 0;
      if (dest) {
        c.fill.material.color.setHex(c.tower ? C.lapisCard : C.shellBright);
        c.fill.material.opacity = c.tower ? 0.5 : 0.55;
        c.tileMat.emissiveIntensity = 0.18;
      }
      if (sel) {
        c.fill.material.color.setHex(C.shellBright);
        c.fill.material.opacity = 0.35;
      }
      if (can || sel || dest) {
        c.frame.material.color.setHex(C.gold);
        c.frame.material.opacity = 1;
      }
      if (can && !sel && !dest) pulseKeys.add(key);
      if (victimKeys.has(key)) {
        c.frame.material.color.setHex(C.carnelian);
        c.frame.material.opacity = 1;
      }
    }
    doomed = victimIds;
    for (const [id, p] of pieces) {
      p.lift = p.place.key === ix.selected ? LIFT : 0;
      if (!p.anim || p.anim.kind === 'hop' || p.anim.kind === 'slide') setGlow(p.obj.userData.mats, C.carnelian, doomed.has(id) ? 0.5 : 0);
    }
  }

  function syncLines(ix) {
    const lines = ix.lines ?? [];
    const sig = JSON.stringify(lines);
    if (sig === linesSig) return;
    linesSig = sig;
    for (const child of [...linesGroup.children]) linesGroup.remove(child);
    for (const { from, to, on } of lines) {
      const a = layout.byKey.get(from);
      const b = layout.byKey.get(to);
      if (a && b && a.row === b.row) linesGroup.add(buildLine(a, b, on));
    }
  }

  // --- cards ---

  function syncCards(game, ix, viewerNow, animate, now) {
    glow.deck = null;
    glow.power = null;
    for (const s of sides) for (const m of [...s.top.mats, ...s.drawn.mats, ...s.power.mats, s.stack.material]) m.emissiveIntensity = 0;
    sides.forEach((s, p) => {
      const L = s.L;
      // Deck: a stack as tall as the cards left in it.
      const n = game.moveDecks[p].draw.length;
      const h = 0.02 + n * 0.014;
      s.stack.visible = n > 0;
      s.top.yaw.visible = n > 0;
      s.deckSlot.visible = n === 0;
      s.stack.scale.y = h;
      s.stack.position.y = h / 2;
      s.top.yaw.position.y = h + 0.008;
      s.labels.deck.set(TEXT.left(n));
      if (ix.phase === 'draw' && p === game.current && n >= 0) glow.deck = s;

      // Drawn card: the current player's card being resolved.
      const card = p === game.current ? game.drawn : null;
      s.drawn.yaw.visible = card !== null;
      s.drawnSlot.visible = card === null;
      if (card !== null) s.drawn.setFront(TX.cardFace(card === R.JOKER ? 'joker' : card));
      s.drawn.setBack(TX.cardBack(), C.lapisCard);
      if (animate && card !== null && s.shownDrawn === null) s.drawAnim = { start: now, from: new THREE.Vector3(L.deck.x, TABLE_Y + h + 0.01, L.deck.z) };
      if (card === null) s.drawAnim = null;
      s.shownDrawn = card;
      s.labels.drawn.set(card !== null && game.campsite ? TEXT.campCard : TEXT.drawn);

      // Power: face up for the viewer, a card back for the other player.
      const held = game.held[p];
      s.power.yaw.visible = Boolean(held);
      s.powerSlot.visible = !held;
      if (held) s.power.setFront(p === viewerNow ? TX.powerFace(held) : TX.cardBack(), p === viewerNow ? C.shell : C.lapisCard);
      s.power.setBack(TX.cardBack(), C.lapisCard);
      s.labels.power.set(held ? TEXT.power : TEXT.noPower);
      if (held && p === game.current && ix.canUsePower) glow.power = s;

      // Discard: a fan, oldest on the left; both players see both piles.
      const discard = game.moveDecks[p].discard;
      discard.forEach((c, i) => {
        const m = s.mini(i);
        m.yaw.visible = true;
        m.yaw.position.set(discardX(L, i, discard.length), TABLE_Y + 0.008 + i * 0.004, L.discard.z);
        m.setFront(TX.miniFace(c === R.JOKER ? TEXT.jokerShort : String(c)));
        m.setBack(TX.cardBack(), C.lapisCard);
      });
      for (let i = discard.length; i < s.minis.length; i += 1) s.minis[i].yaw.visible = false;
      s.labels.discard.set(discard.length ? TEXT.discard : `${TEXT.discard} · ${TEXT.discardEmpty}`);

      // Trays.
      const mine = game.units.filter((u) => u.player === p);
      const asc = mine.filter((u) => u.pos === R.geometry(game.config).ascended).length;
      s.labels.home.set(TEXT.home);
      s.labels.asc.set(TEXT.ascended(asc, mine.length));
      const lock = trays.locks.get(`home:${p}`);
      if (lock) lock.visible = mine.some((u) => u.type === 'commander' && u.pos === R.HOME) && R.isCommanderLocked(game, p);
    });
  }

  function stepCards(now) {
    let moving = false;
    for (const s of sides) {
      const a = s.drawAnim;
      if (!a) continue;
      const t = clamp01((now - a.start) / TIMING.draw);
      const e = easeInOut(t);
      const to = new THREE.Vector3(s.L.drawn.x, TABLE_Y + 0.01, s.L.drawn.z);
      s.drawn.yaw.position.lerpVectors(a.from, to, e);
      s.drawn.yaw.position.y += Math.sin(Math.PI * t) * 0.6;
      s.drawn.flip.rotation.z = Math.PI * (1 - e);
      if (t >= 1) {
        s.drawAnim = null;
        s.drawn.yaw.position.copy(to);
        s.drawn.flip.rotation.z = 0;
      } else moving = true;
    }
    return moving;
  }

  // --- draft ---

  function syncDraft(game, ix, animate, now) {
    const show = ix.phase === 'draft';
    if (show) {
      R.draftOptions(game).forEach((id, i) => {
        const mat = draftCards[i].material;
        setMap(mat, TX.powerFace(id), C.shell);
      });
      const count = R.draftOptions(game).length;
      draftCards.forEach((m, i) => { m.visible = i < count; });
      if (!draft.shown) draft.start = animate ? now : -Infinity;
    } else {
      for (const m of draftCards) m.visible = false;
    }
    dim.visible = show;
    draft.shown = show;
  }

  function stepDraft(now) {
    if (!draft.shown) return false;
    const t = clamp01((now - draft.start) / TIMING.rise);
    const e = easeOut(t);
    const visH = 2 * Math.abs(DRAFT.z) * Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2));
    const visW = visH * cam.aspect;
    const visible = draftCards.filter((m) => m.visible);
    const span = visible.length * DRAFT.w + (visible.length - 1) * DRAFT.gap;
    const scale = Math.min(1, (visW * 0.9) / span, (visH * 0.8) / DRAFT.h);
    visible.forEach((m, i) => {
      m.scale.setScalar(scale);
      m.position.set((i - (visible.length - 1) / 2) * (DRAFT.w + DRAFT.gap) * scale, lerp(-visH, 0, e), DRAFT.z);
      m.rotation.z = (1 - e) * (i === 0 ? 0.25 : -0.25);
      m.material.opacity = e;
    });
    dim.material.opacity = 0.55 * e;
    return t < 1;
  }

  // --- camera goals ---

  function posOf(key) {
    return layout.byKey.get(key) ?? layout.trays.get(key) ?? null;
  }

  function syncCamera(ix, viewerNow, animate, now) {
    const goal = viewerNow === 1 ? Math.PI : 0;
    if (viewer === null || !animate) {
      cam.azimuth = goal;
      cam.spin = null;
    } else if (viewerNow !== viewer) {
      // Always turn the same way round; azimuth keeps growing.
      const from = cam.azimuth;
      let to = from + Math.PI;
      if (Math.abs(Math.cos(to) - Math.cos(goal)) > 1e-6) to += Math.PI;
      cam.spin = { from, to, start: now };
    }
    viewer = viewerNow;

    const focus = [ix.selected, ix.dest].map(posOf).filter(Boolean);
    if (ix.selected && posOf(ix.selected)) {
      const fx = focus.reduce((s, c) => s + c.x, 0) / focus.length;
      const fz = focus.reduce((s, c) => s + c.z, 0) / focus.length;
      cam.targetGoal.set(fx * CAMERA.focus, 0, fz * CAMERA.focus);
      cam.zoomGoal = CAMERA.zoom;
    } else {
      cam.targetGoal.set(0, 0, 0);
      cam.zoomGoal = 1;
    }
    if (!animate) {
      cam.target.copy(cam.targetGoal);
      cam.zoom = cam.zoomGoal;
    }
    placeCamera();
  }

  function stepCamera(now) {
    let moving = false;
    if (cam.spin) {
      const t = clamp01((now - cam.spin.start) / TIMING.spin);
      cam.azimuth = lerp(cam.spin.from, cam.spin.to, easeInOut(t));
      if (t >= 1) cam.spin = null;
      else moving = true;
    }
    const k = 0.2;
    cam.target.lerp(cam.targetGoal, k);
    cam.zoom += (cam.zoomGoal - cam.zoom) * k;
    if (cam.target.distanceTo(cam.targetGoal) > 0.002 || Math.abs(cam.zoom - cam.zoomGoal) > 0.0005) moving = true;
    else {
      cam.target.copy(cam.targetGoal);
      cam.zoom = cam.zoomGoal;
    }
    placeCamera();
    for (const y of yawers) y.rotation.y = cam.azimuth;
    return moving;
  }

  // --- public ---

  function sync(model, ix, { animate = false, now = performance.now() } = {}) {
    const game = model.game;
    const anim = animate && lastGame !== null;
    syncUnits(game, anim, now);
    syncHighlights(ix);
    syncLines(ix);
    syncCards(game, ix, model.ui.viewer, anim, now);
    syncDraft(game, ix, anim, now);
    syncCamera(ix, model.ui.viewer, anim, now);
    for (const y of yawers) y.rotation.y = cam.azimuth;
    lastGame = game;
  }

  function tick(now = performance.now()) {
    let moving = stepCamera(now);
    for (const p of pieces.values()) if (stepUnit(p, now)) moving = true;
    if (stepCards(now)) moving = true;
    if (stepDraft(now)) moving = true;
    // Things you can tap breathe (gold glow), like the flat board.
    const pulse = 0.5 + 0.5 * Math.sin((now / 1600) * Math.PI * 2);
    for (const key of pulseKeys) {
      const c = surfaces.get(key);
      if (c) c.tileMat.emissiveIntensity = 0.06 + 0.22 * pulse;
    }
    if (glow.deck) {
      for (const m of glow.deck.top.mats) m.emissiveIntensity = 0.1 + 0.3 * pulse;
      glow.deck.stack.material.emissiveIntensity = 0.1 + 0.3 * pulse;
    }
    if (glow.power) for (const m of glow.power.power.mats) m.emissiveIntensity = 0.05 + 0.2 * pulse;
    for (const id of doomed) {
      const p = pieces.get(id);
      if (p && !p.anim) setGlow(p.obj.userData.mats, C.carnelian, 0.35 + 0.25 * pulse);
    }
    return moving || pulseKeys.size > 0 || doomed.size > 0 || Boolean(glow.deck || glow.power);
  }

  const raycaster = new THREE.Raycaster();

  function actionOf(object) {
    for (let o = object; o; o = o.parent) {
      const ud = o.userData ?? {};
      if (ud.keep !== undefined) return { type: 'keep', index: ud.keep };
      if (ud.action === 'draw') return { type: 'draw', player: ud.player };
      if (ud.key) return { type: 'tap', key: ud.key };
      if (ud.unitId) {
        const p = pieces.get(ud.unitId);
        return p?.place ? { type: 'tap', key: p.place.key } : null;
      }
    }
    return null;
  }

  function pick(x, y) {
    scene.updateMatrixWorld();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    if (draft.shown) {
      const hit = raycaster.intersectObjects(draftCards.filter((m) => m.visible), false)[0];
      return hit ? actionOf(hit.object) : null;
    }
    const targets = [
      ...[...surfaces.values()].map((c) => c.tile),
      ...[...pieces.values()].map((p) => p.obj),
      ...sides.flatMap((s) => [s.stack, s.top.front, s.top.back]).filter((m) => m.visible !== false),
    ];
    for (const hit of raycaster.intersectObjects(targets, true)) {
      if (!hit.object.visible) continue;
      const action = actionOf(hit.object);
      if (action) return action;
    }
    return null;
  }

  /** Normalized device coords of an object's centre, or of a cell / tray by key. */
  function screenOf(target) {
    scene.updateMatrixWorld();
    let v;
    if (typeof target === 'string') {
      const at = posOf(target);
      if (!at) return null;
      v = new THREE.Vector3(at.x, layout.byKey.has(target) ? TILE_TOP : TABLE_Y + 0.06, at.z);
    } else {
      v = new THREE.Vector3();
      target.getWorldPosition(v);
    }
    const p = v.project(camera);
    return { x: p.x, y: p.y };
  }

  function unitWorld(id) {
    const p = pieces.get(id);
    return p ? p.obj.position.clone() : null;
  }

  function dispose() {
    for (const s of sides) for (const l of Object.values(s.labels)) l.dispose();
    scene.traverse((o) => {
      if (o.geometry && !SHARED.has(o.geometry)) o.geometry.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) m.dispose?.(); // textures are shared (textures.js cache) and kept
    });
  }

  resize(1, 1);
  return {
    scene,
    camera,
    layout,
    sync,
    tick,
    resize,
    pick,
    screenOf,
    unitWorld,
    dispose,
    parts: { sides, draftCards },
    get azimuth() { return cam.azimuth; },
    get spinning() { return cam.spin !== null; },
    get distance() { return cam.fit * cam.zoom; },
  };
}
