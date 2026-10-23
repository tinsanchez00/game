// Puts the 3D table on the page: one WebGL canvas that survives the app's
// re-renders (it is moved into each new host element), a render loop that
// only runs while something moves, and taps turned into the same actions the
// flat board sends ({ type: 'tap', key }, 'draw', 'use-power', { type: 'keep', index }).

import * as THREE from '../../../vendor/three/three.module.js';
import { RoomEnvironment } from '../../../vendor/three/RoomEnvironment.js';
import { createBoardScene } from './scene.js';
import { onTexturesRedrawn } from './textures.js';

const TAP_SLOP = 10; // px a finger may move and still count as a tap

export function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Whether a picked action applies right now (the same taps the flat board allows). */
export function allowed(action, model, ix) {
  if (!action) return false;
  if (action.type === 'draw') return ix.phase === 'draw' && action.player === model.game.current;
  if (action.type === 'use-power') return ix.canUsePower && action.player === model.game.current;
  if (action.type === 'keep') {
    if (ix.phase === 'side') return action.index === 0 ? ix.canUpright : ix.canUpsideDown;
    if (ix.phase === 'hermit') return action.index < (ix.cards?.length ?? 0);
    return ix.phase === 'draft';
  }
  if (action.type === 'tap') {
    const live = new Set([...ix.tappable, ...(ix.targets ?? []), ix.dest].filter(Boolean));
    return live.has(action.key);
  }
  return false;
}

/** A picked rising card means a side of the held power while one is being picked. */
export function toScreenAction(action, ix) {
  if (action.type === 'keep' && ix.phase === 'side') return { type: action.index === 0 ? 'side-upright' : 'side-upside' };
  return action;
}

/**
 * createBoardView({ onAction }) -> { attach(host), sync(model, ix, { animate }), dispose() } | null
 * Returns null when WebGL isn't available (the app then shows the flat board).
 */
export function createBoardView({ onAction }) {
  if (!webglAvailable()) return null;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const canvas = renderer.domElement;
  canvas.className = 'board3d-canvas';

  // Soft reflections for the metal and glossy pieces.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  let board = null;
  let configSig = '';
  let model = null;
  let ix = null;
  let host = null;
  let frame = 0;
  let observer = null;

  function loop(now) {
    frame = 0;
    if (!board || !host) return;
    const moving = board.tick(now);
    renderer.render(board.scene, board.camera);
    if (moving && !document.hidden) frame = requestAnimationFrame(loop);
  }

  function wake() {
    if (!frame) frame = requestAnimationFrame(loop);
  }

  function resize() {
    if (!host || !board) return;
    const { width, height } = host.getBoundingClientRect();
    if (width < 2 || height < 2) return;
    renderer.setSize(width, height, false);
    board.resize(width, height);
    wake();
  }

  function attach(next) {
    if (host === next) return;
    host = next;
    host.appendChild(canvas);
    observer?.disconnect();
    observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
  }

  function sync(nextModel, interactions, { animate = false, table = false } = {}) {
    const sig = JSON.stringify(nextModel.game.config);
    if (!board || sig !== configSig) {
      board?.dispose();
      board = createBoardScene(nextModel.game.config);
      board.scene.environment = envMap;
      configSig = sig;
      animate = false;
      resize();
    }
    model = nextModel;
    ix = interactions;
    board.sync(model, interactions, { animate: animate && !reducedMotion?.matches, now: performance.now(), table });
    wake();
  }

  // Taps: a press and release close together; drags and multi-touch are ignored.
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = e.isPrimary ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
  });
  canvas.addEventListener('pointercancel', () => {
    down = null;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || e.pointerId !== down.id || !board || !ix) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > TAP_SLOP) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    const action = board.pick(x, y);
    if (!allowed(action, model, ix)) return;
    if (action.type === 'draw' || action.type === 'use-power') onAction({ type: action.type });
    else onAction(toScreenAction(action, ix));
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) wake();
  });
  onTexturesRedrawn(wake);

  return {
    attach,
    sync,
    dispose() {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      board?.dispose();
      envMap.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
