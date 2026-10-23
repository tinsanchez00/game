// DOM wiring: renders the model, turns taps into actions, keeps the current
// game in this browser so a refresh doesn't lose it. The 3D board is loaded
// on first use; without WebGL the flat board is shown instead.

import { interactions } from './controller.js';
import { initShell, updateShell, viewShell } from './shell.js';

const STORE_KEY = 'board-game-test-v5';
const BOARD_KEY = 'board-game-board-style-v1';

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (saved?.game?.config && saved.ui) return saved;
  } catch {
    // Unreadable or blocked storage: start fresh.
  }
  return null;
}

function save(key, value) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    // Storage unavailable: the game still works, it just won't survive a reload.
  }
}

function loadBoardStyle() {
  try {
    return localStorage.getItem(BOARD_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function startApp(root) {
  // Opens on the start screen; a saved game can be continued from there.
  let shell = initShell(load(), loadBoardStyle());

  // 3D board: null until loaded; `failed` when WebGL or the module is unavailable.
  const three = { view: null, loading: null, failed: false };

  const boardStyle = () => (three.failed ? 'flat' : shell.board);

  function loadThree() {
    three.loading ??= import('./board3d/mount.js')
      .then((mod) => {
        three.view = mod.createBoardView({ onTap: (key) => dispatch({ type: 'tap', key }) });
        if (!three.view) three.failed = true;
      })
      .catch((err) => {
        console.error(err);
        three.failed = true;
      });
    return three.loading;
  }

  function render({ animate = false } = {}) {
    root.innerHTML = viewShell({ ...shell, board: boardStyle() });
    const host = root.querySelector('[data-board3d]');
    if (!host || !shell.play) return;
    const play = shell.play;
    const draw = () => {
      if (three.failed) {
        if (shell.play === play) render();
        return;
      }
      if (!host.isConnected) return; // a newer render replaced this one
      three.view.attach(host);
      three.view.sync(play, interactions(play), { animate });
    };
    if (three.view || three.failed) draw();
    else loadThree().then(draw);
  }

  function dispatch(action) {
    const before = shell;
    try {
      shell = updateShell(shell, action);
    } catch (err) {
      console.error(err);
    }
    if (shell.play) save(STORE_KEY, shell.play);
    if (shell.board !== before.board) save(BOARD_KEY, shell.board);
    // Animate only moves within the same game on the game screen.
    const sameGame = before.screen === 'game' && shell.screen === 'game' && action.type !== 'new-confirm';
    render({ animate: sameGame });
  }

  root.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled || !root.contains(el)) return;
    const action = { type: el.dataset.action };
    if (el.dataset.key) action.key = el.dataset.key;
    if (el.dataset.index !== undefined) action.index = Number(el.dataset.index);
    if (el.dataset.value !== undefined) action.value = el.dataset.value;
    dispatch(action);
  });

  render();
  // Start loading the 3D board early so the first game opens without a wait.
  if (boardStyle() === '3d') loadThree();
}
