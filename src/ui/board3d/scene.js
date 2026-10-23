// The 3D board as a three.js scene graph: board, pieces, highlights, Lovers
// lines, camera and animations. No renderer and no DOM listeners here
// (see mount.js), so it runs in Node for tests; textures that need a canvas
// are skipped there.
//
// Shapes, sizes, materials, camera angle, zoom and timings below are
// placeholders until final ones are picked.

import * as THREE from '../../../vendor/three/three.module.js';
import { boardLayout3d, CELL, TILE_TOP, unitPlacements } from './layout3d.js';

// --- palette (Royal Tomb, from style.css) -------------------------------------------

const C = {
  lapisNight: 0x0c1633,
  lapis: 0x23408f,
  lapisCard: 0x1d3b8c,
  gold: 0xd4af5a,
  goldDim: 0x9c7f3c,
  shell: 0xefe6cf,
  shellBright: 0xf8f1de,
  shellDim: 0xd6cbae,
  cellLine: 0xb89a55,
  campRim: 0x5e4a1e,
  carnelian: 0xc2533a,
  lovers: 0xc2453a,
  teamGold: 0xe2b84e,
  teamGoldRim: 0x3a2a08,
  teamObsidian: 0x241a14,
  teamObsidianRim: 0xd4af5a,
};

// --- timings (ms) and camera (placeholders) -------------------------------------------

export const TIMING = {
  hopBase: 230, // a one-cell hop
  hopPerCell: 35, // added per extra cell
  enter: 260, // home -> board
  capture: 300, // board -> home
  ascend: 420, // board -> ascended
  slide: 160, // moving within a cell (stack order)
  spin: 650, // camera turn on handoff
};

export const CAMERA = {
  fov: 32,
  tilt: THREE.MathUtils.degToRad(34), // away from straight down
  margin: 0.94, // fraction of the view the board may fill
  zoom: 0.8, // distance factor while a unit is selected
  focus: 0.5, // how far the view centre moves toward the selection
};

const HOP_HEIGHT = 0.55;
const LIFT = 0.12; // selected units rise this much

// --- small helpers ----------------------------------------------------------------------

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;

function hasCanvas() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function glyphTexture(draw, size = 128) {
  if (!hasCanvas()) return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const TOWER_PATH = 'M6 21V9h12v12M6 9V4h2.5v2.2h2.2V4h2.6v2.2h2.2V4H18v5M10 21v-4.5h4V21';
const HEART_PATH = 'M12 20.5s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.4c0 5.5-7.5 10.1-7.5 10.1Z';

function towerTexture() {
  return glyphTexture((ctx, size) => {
    ctx.scale(size / 24, size / 24);
    ctx.translate(12, 12);
    ctx.scale(0.66, 0.66);
    ctx.translate(-12, -12);
    ctx.strokeStyle = '#D4AF5A';
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(TOWER_PATH));
  });
}

function heartTexture() {
  return glyphTexture((ctx, size) => {
    ctx.scale(size / 24, size / 24);
    const p = new Path2D(HEART_PATH);
    ctx.fillStyle = '#C2453A';
    ctx.fill(p);
    ctx.strokeStyle = '#F8F1DE';
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.stroke(p);
  });
}

// --- pieces (basic placeholder shapes) ----------------------------------------------------

const SOLDIER_PROFILE = [[0, 0], [0.19, 0], [0.19, 0.05], [0.15, 0.08], [0.1, 0.2], [0.075, 0.3], [0.12, 0.33], [0.06, 0.36], [0, 0.36]];
const COMMANDER_PROFILE = [[0, 0], [0.2, 0], [0.2, 0.06], [0.16, 0.09], [0.105, 0.26], [0.085, 0.4], [0.135, 0.43], [0.07, 0.46], [0, 0.46]];

function profile(points) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), 24);
}

const GEO = {
  soldier: null,
  commander: null,
};
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

function teamMaterials(player) {
  const body = player === 0
    ? new THREE.MeshStandardMaterial({ color: C.teamGold, metalness: 0.75, roughness: 0.32 })
    : new THREE.MeshStandardMaterial({ color: C.teamObsidian, metalness: 0.2, roughness: 0.18 });
  const rim = new THREE.MeshStandardMaterial({
    color: player === 0 ? C.teamGoldRim : C.teamObsidianRim,
    metalness: player === 0 ? 0.3 : 0.8,
    roughness: 0.35,
  });
  return { body, rim };
}

function makePiece(unit) {
  const g = geometries()[unit.type === 'commander' ? 'commander' : 'soldier'];
  const mats = teamMaterials(unit.player);
  const group = new THREE.Group();
  const add = (geo, mat) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  add(g.body, mats.body);
  add(g.head, mats.body);
  add(g.band, mats.rim);
  if (g.crown) {
    add(g.crown, mats.rim);
    for (const p of g.points) add(p, mats.rim);
  }
  group.userData = { unitId: unit.id, mats };
  return group;
}

// --- board ---------------------------------------------------------------------------------

/** A flat square frame; `inner` and `outer` are half side lengths. */
function squareFrame(inner, outer) {
  // A 4-segment ring is a diamond; turned 45° it is a square of half side r / √2.
  return new THREE.RingGeometry(inner * Math.SQRT2, outer * Math.SQRT2, 4, 1)
    .rotateZ(Math.PI / 4)
    .rotateX(-Math.PI / 2);
}

function buildBoard(layout) {
  const group = new THREE.Group();
  const pad = 0.34;

  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(layout.width + pad * 2 + 0.16, 0.26, layout.depth + pad * 2 + 0.16),
    new THREE.MeshStandardMaterial({ color: C.gold, metalness: 0.7, roughness: 0.38 }),
  );
  rim.position.y = -0.15;
  rim.receiveShadow = true;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(layout.width + pad * 2, 0.26, layout.depth + pad * 2),
    new THREE.MeshStandardMaterial({ color: C.lapisNight, metalness: 0.1, roughness: 0.8 }),
  );
  base.position.y = -0.11;
  base.receiveShadow = true;
  group.add(rim, base);

  const tileGeo = new THREE.BoxGeometry(CELL * 0.94, TILE_TOP, CELL * 0.94).translate(0, TILE_TOP / 2, 0);
  const edgeGeo = new THREE.BoxGeometry(CELL, TILE_TOP * 0.8, CELL).translate(0, TILE_TOP * 0.4, 0);
  const frameGeo = squareFrame(0.39, 0.47);
  const fillGeo = new THREE.PlaneGeometry(CELL * 0.94, CELL * 0.94).rotateX(-Math.PI / 2);
  const glyphGeo = new THREE.PlaneGeometry(CELL * 0.94, CELL * 0.94).rotateX(-Math.PI / 2);
  const stoneGeo = new THREE.SphereGeometry(0.072, 12, 8).scale(1, 0.55, 1);
  const edgeMat = new THREE.MeshStandardMaterial({ color: C.cellLine, metalness: 0.4, roughness: 0.5 });
  const towerTex = towerTexture();
  const stoneMat = new THREE.MeshStandardMaterial({ color: C.goldDim, metalness: 0.2, roughness: 0.75 });

  const cells = new Map();
  for (const cell of layout.cells) {
    const c = new THREE.Group();
    c.position.set(cell.x, 0, cell.z);
    const color = cell.tower ? C.lapis : cell.campsite ? C.shellDim : C.shell;
    const tileMat = new THREE.MeshStandardMaterial({
      color, roughness: cell.tower ? 0.45 : 0.85, metalness: cell.tower ? 0.15 : 0,
      emissive: C.gold, emissiveIntensity: 0,
    });
    const edge = new THREE.Mesh(edgeGeo, cell.tower ? new THREE.MeshStandardMaterial({ color: C.gold, metalness: 0.7, roughness: 0.38 }) : edgeMat);
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

    const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: C.shellBright, transparent: true, opacity: 0, depthWrite: false }));
    fill.position.y = TILE_TOP + 0.004;
    const frame = new THREE.Mesh(frameGeo, new THREE.MeshBasicMaterial({ color: C.gold, transparent: true, opacity: 0, depthWrite: false }));
    frame.position.y = TILE_TOP + 0.006;
    c.add(fill, frame);

    group.add(c);
    cells.set(cell.key, { group: c, tile, tileMat, fill, frame, base: color, tower: cell.tower });
  }
  return { group, cells };
}

// --- Lovers lines ----------------------------------------------------------------------------

function buildLine(a, b, on, heartTex) {
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
    const x = Math.min(start, end) + (length - used) / 2 + i * (dash + gap) + dash / 2;
    m.position.set(x, TILE_TOP + 0.03, a.z);
    group.add(m);
  }
  const mid = (start + end) / 2;
  if (heartTex) {
    const heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, opacity, depthTest: false }));
    heart.scale.set(0.38, 0.38, 1);
    heart.position.set(mid, TILE_TOP + 0.3, a.z);
    heart.renderOrder = 10;
    group.add(heart);
  }
  return group;
}

// --- the scene -------------------------------------------------------------------------------

/**
 * createBoardScene(config) -> {
 *   scene, camera,
 *   sync(model, ix, { animate }),   bring the scene up to date with a game model
 *   tick(now) -> boolean,           advance animations; true while anything moves
 *   resize(width, height),
 *   pick(ndcX, ndcY) -> key | null, the cell under a point (normalized device coords)
 *   cellScreen(key) -> { x, y },    a cell centre in normalized device coords (tests)
 *   unitWorld(id) -> Vector3 | null,
 *   dispose(),
 * }
 */
export function createBoardScene(config) {
  const layout = boardLayout3d(config);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 100);

  scene.add(new THREE.HemisphereLight(0xf8f1de, 0x0c1633, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
  sun.position.set(3.5, 9, 4.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const half = Math.max(layout.width, layout.depth) / 2 + 1;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 25 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const board = buildBoard(layout);
  scene.add(board.group);

  const heartTex = heartTexture();
  const linesGroup = new THREE.Group();
  scene.add(linesGroup);
  let linesSig = '';

  const pieces = new Map(); // id -> { obj, place, anim, lift }
  let viewer = null;
  let lastGame = null;
  let pulseKeys = new Set();
  let doomed = new Set();

  // Camera state: azimuth turns around the board; view centre and zoom follow the selection.
  const cam = {
    azimuth: 0,
    spin: null, // { from, to, start }
    aspect: 1,
    fit: 20, // distance that fits the whole board, for the current aspect
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

  /** Smallest distance at which every board corner is inside the view. */
  function fitDistance(azimuth) {
    const w = layout.width / 2 + 0.5;
    const d = layout.depth / 2 + 0.5;
    const corners = [];
    for (const x of [-w, w]) for (const z of [-d, d]) for (const y of [-0.3, 0.8]) corners.push(new THREE.Vector3(x, y, z));
    const saved = { az: cam.azimuth, zoom: cam.zoom, target: cam.target.clone() };
    cam.azimuth = azimuth;
    cam.zoom = 1;
    cam.target.set(0, 0, 0);
    let lo = 2;
    let hi = 80;
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
    camera.updateProjectionMatrix();
    cam.fit = fitDistance(0);
    placeCamera();
  }

  // --- units ---

  function ensurePiece(unit) {
    let p = pieces.get(unit.id);
    if (!p) {
      const obj = makePiece(unit);
      obj.visible = false;
      scene.add(obj);
      p = { obj, place: null, anim: null, lift: 0, liftGoal: 0 };
      pieces.set(unit.id, p);
    }
    return p;
  }

  function startAnim(p, anim) {
    p.anim = anim;
  }

  function snap(p, place) {
    p.anim = null;
    p.obj.visible = place.onBoard;
    p.obj.scale.setScalar(1);
    if (place.onBoard) p.obj.position.set(place.x, TILE_TOP + p.lift, place.z);
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
        snap(p, next);
        continue;
      }
      const from = p.obj.position.clone();
      if (prev.onBoard && next.onBoard) {
        if (prev.key === next.key) {
          if (prev.x !== next.x || prev.z !== next.z) startAnim(p, { kind: 'slide', from, to: next, start: now, dur: TIMING.slide });
          continue;
        }
        const dur = TIMING.hopBase + TIMING.hopPerCell * (cellsBetween(prev, next) - 1);
        startAnim(p, { kind: 'hop', from, to: next, start: now, dur });
        landing = Math.max(landing, dur);
      } else if (!prev.onBoard && next.onBoard) {
        p.obj.visible = true;
        startAnim(p, { kind: 'enter', from: new THREE.Vector3(next.x, TILE_TOP + 1.6, next.z), to: next, start: now, dur: TIMING.enter });
        landing = Math.max(landing, TIMING.enter);
      } else if (prev.onBoard && !next.onBoard) {
        const ascending = next.key.startsWith('asc:');
        pending.push({ p, anim: { kind: ascending ? 'ascend' : 'capture', from, to: next, start: now, dur: ascending ? TIMING.ascend : TIMING.capture } });
      } else {
        snap(p, next);
      }
    }
    for (const { p, anim } of pending) {
      // Captures wait for the attacker to land; ascending starts straight away.
      if (anim.kind === 'capture') anim.start += landing;
      startAnim(p, anim);
    }
  }

  function stepUnit(p, now) {
    const a = p.anim;
    const obj = p.obj;
    if (!a) {
      if (p.place?.onBoard) {
        const y = TILE_TOP + p.lift;
        obj.position.y += (y - obj.position.y) * 0.35;
        return Math.abs(y - obj.position.y) > 0.001;
      }
      return false;
    }
    const t = clamp01((now - a.start) / a.dur);
    const rest = TILE_TOP + p.lift;
    switch (a.kind) {
      case 'hop': {
        const e = easeInOut(t);
        obj.position.set(lerp(a.from.x, a.to.x, e), lerp(a.from.y, rest, e) + Math.sin(Math.PI * t) * HOP_HEIGHT, lerp(a.from.z, a.to.z, e));
        break;
      }
      case 'slide': {
        const e = easeOut(t);
        obj.position.set(lerp(a.from.x, a.to.x, e), rest, lerp(a.from.z, a.to.z, e));
        break;
      }
      case 'enter': {
        const e = easeOut(t);
        obj.visible = true;
        obj.position.set(a.to.x, lerp(a.from.y, rest, e), a.to.z);
        obj.scale.setScalar(lerp(0.4, 1, e));
        break;
      }
      case 'capture': {
        if (t <= 0) break;
        const e = easeInOut(t);
        obj.position.y = a.from.y - e * 0.25;
        obj.scale.setScalar(Math.max(0.001, 1 - e));
        for (const m of [obj.userData.mats.body, obj.userData.mats.rim]) {
          m.emissive.setHex(C.carnelian);
          m.emissiveIntensity = 1.2 * (1 - e);
        }
        break;
      }
      case 'ascend': {
        const e = easeOut(t);
        obj.position.y = a.from.y + e * 1.4;
        obj.scale.setScalar(Math.max(0.001, 1 - e * 0.6));
        for (const m of [obj.userData.mats.body, obj.userData.mats.rim]) {
          m.emissive.setHex(C.gold);
          m.emissiveIntensity = 0.8 * e;
        }
        break;
      }
      default:
        break;
    }
    if (t >= 1) {
      p.anim = null;
      if (a.kind === 'capture' || a.kind === 'ascend') {
        for (const m of [obj.userData.mats.body, obj.userData.mats.rim]) m.emissiveIntensity = 0;
      }
      snap(p, p.place);
      return false;
    }
    return true;
  }

  // --- highlights ---

  function syncHighlights(game, ix) {
    const victimIds = new Set(ix.victims ?? []);
    const victimKeys = new Set();
    for (const [id, p] of pieces) if (victimIds.has(id) && p.place) victimKeys.add(p.place.key);
    pulseKeys = new Set();
    const dests = new Set([ix.dest, ...(ix.targets ?? [])].filter(Boolean));
    for (const [key, c] of board.cells) {
      const can = ix.tappable.includes(key);
      const sel = key === ix.selected;
      const dest = dests.has(key);
      const cap = victimKeys.has(key);
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
      if (cap) {
        c.frame.material.color.setHex(C.carnelian);
        c.frame.material.opacity = 1;
      }
    }
    doomed = victimIds;
    for (const [id, p] of pieces) {
      const lifted = p.place?.onBoard && p.place.key === ix.selected;
      p.lift = lifted ? LIFT : 0;
      if (!p.anim || p.anim.kind === 'hop' || p.anim.kind === 'slide' || p.anim.kind === 'enter') {
        for (const m of [p.obj.userData.mats.body, p.obj.userData.mats.rim]) {
          m.emissive.setHex(C.carnelian);
          m.emissiveIntensity = doomed.has(id) ? 0.5 : 0;
        }
      }
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
      if (a && b && a.row === b.row) linesGroup.add(buildLine(a, b, on, heartTex));
    }
  }

  // --- camera goals ---

  function syncCamera(game, ix, viewerNow, animate, now) {
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

    const focusKeys = [ix.selected, ix.dest].filter((k) => k && layout.byKey.has(k));
    if (focusKeys.length && ix.selected && layout.byKey.has(ix.selected)) {
      const pts = focusKeys.map((k) => layout.byKey.get(k));
      const fx = pts.reduce((s, c) => s + c.x, 0) / pts.length;
      const fz = pts.reduce((s, c) => s + c.z, 0) / pts.length;
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
    return moving;
  }

  // --- public ---

  function sync(model, ix, { animate = false, now = performance.now() } = {}) {
    const game = model.game;
    const anim = animate && lastGame !== null;
    syncUnits(game, anim, now);
    syncHighlights(game, ix);
    syncLines(ix);
    syncCamera(game, ix, model.ui.viewer, anim, now);
    lastGame = game;
  }

  function tick(now = performance.now()) {
    let moving = stepCamera(now);
    for (const p of pieces.values()) if (stepUnit(p, now)) moving = true;
    // Tappable cells breathe (gold glow), like the flat board.
    const pulse = 0.5 + 0.5 * Math.sin(now / 1600 * Math.PI * 2);
    for (const key of pulseKeys) {
      const c = board.cells.get(key);
      if (c) c.tileMat.emissiveIntensity = 0.06 + 0.22 * pulse;
    }
    const glow = 0.35 + 0.25 * pulse;
    for (const id of doomed) {
      const p = pieces.get(id);
      if (p && !p.anim) for (const m of [p.obj.userData.mats.body, p.obj.userData.mats.rim]) m.emissiveIntensity = glow;
    }
    return moving || pulseKeys.size > 0 || doomed.size > 0;
  }

  const raycaster = new THREE.Raycaster();
  const pickables = () => [
    ...[...board.cells.values()].map((c) => c.tile),
    ...[...pieces.values()].filter((p) => p.obj.visible).map((p) => p.obj),
  ];

  function keyOf(object) {
    for (let o = object; o; o = o.parent) {
      if (o.userData?.key) return o.userData.key;
      if (o.userData?.unitId) {
        const p = pieces.get(o.userData.unitId);
        return p?.place?.onBoard ? p.place.key : null;
      }
    }
    return null;
  }

  function pick(x, y) {
    scene.updateMatrixWorld();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    for (const hit of raycaster.intersectObjects(pickables(), true)) {
      const key = keyOf(hit.object);
      if (key) return key;
    }
    return null;
  }

  function cellScreen(key) {
    const c = layout.byKey.get(key);
    if (!c) return null;
    const p = new THREE.Vector3(c.x, TILE_TOP, c.z).project(camera);
    return { x: p.x, y: p.y };
  }

  function unitWorld(id) {
    const p = pieces.get(id);
    return p && p.obj.visible ? p.obj.position.clone() : null;
  }

  function dispose() {
    scene.traverse((o) => {
      if (o.geometry && !SHARED.has(o.geometry)) o.geometry.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        m.map?.dispose?.();
        m.dispose?.();
      }
    });
  }

  resize(1, 1);
  return { scene, camera, sync, tick, resize, pick, cellScreen, unitWorld, layout, dispose, get azimuth() { return cam.azimuth; }, get spinning() { return cam.spin !== null; }, get distance() { return cam.fit * cam.zoom; } };
}
