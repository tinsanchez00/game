// Puts the 3D board on the page: one WebGL canvas that survives the app's
// re-renders (it is moved into each new host element), a render loop that
// only runs while something moves, and taps turned into the same
// { type: 'tap', key } actions the flat board sends.

import * as THREE from '../../../vendor/three/three.module.js';
import { createBoardScene } from './scene.js';

const TAP_SLOP = 10; // px a finger may move and still count as a tap

export function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * createBoardView({ onTap }) -> { attach(host), sync(model, ix, { animate }), dispose() } | null
 * Returns null when WebGL isn't available (the app then shows the flat board).
 */
export function createBoardView({ onTap }) {
  if (!webglAvailable()) return null;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'board3d-canvas';

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  let board = null;
  let configSig = '';
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

  function sync(model, interactions, { animate = false } = {}) {
    const sig = JSON.stringify(model.game.config);
    if (!board || sig !== configSig) {
      board?.dispose();
      board = createBoardScene(model.game.config);
      configSig = sig;
      animate = false;
      resize();
    }
    ix = interactions;
    board.sync(model, interactions, { animate: animate && !reducedMotion?.matches, now: performance.now() });
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
    const key = board.pick(x, y);
    // Same as the flat board: only highlighted cells respond.
    const live = new Set([...ix.tappable, ...(ix.targets ?? []), ix.dest].filter(Boolean));
    if (key && live.has(key)) onTap(key);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) wake();
  });

  return {
    attach,
    sync,
    dispose() {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      board?.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
