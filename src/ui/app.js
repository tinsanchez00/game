// DOM wiring: renders the model, turns taps into actions, keeps the current
// game in this browser so a refresh doesn't lose it. The 3D board is loaded
// on first use; without WebGL the flat board is shown instead.

import { interactions } from './controller.js';
import { TEXT, languageFor } from './labels.js';
import { initShell, updateShell, viewShell } from './shell.js';

const STORE_KEY = 'board-game-test-v6';
const BOARD_KEY = 'board-game-board-style-v1';
const LANG_KEY = 'board-game-language-v1';

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

// A saved choice wins; otherwise the device's language (Spanish or English).
function loadLanguage() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved) return saved;
  } catch {
    // Storage unavailable: fall back to the device language.
  }
  return languageFor([...(navigator.languages ?? []), navigator.language]);
}

export function startApp(root) {
  // Opens on the start screen; a saved game can be continued from there.
  let shell = initShell(load(), loadBoardStyle(), loadLanguage());

  // 3D board: null until loaded; `failed` when WebGL or the module is unavailable.
  const three = { view: null, loading: null, failed: false };

  // 3-4 player games use the flat ring board (the 3D table has two sides only).
  const boardStyle = () => (three.failed || (shell.play?.game.config.players ?? 2) > 2 ? 'flat' : shell.board);

  function loadThree() {
    three.loading ??= import('./board3d/mount.js')
      .then((mod) => {
        three.view = mod.createBoardView({ onAction: dispatch });
        if (!three.view) three.failed = true;
      })
      .catch((err) => {
        console.error(err);
        three.failed = true;
      });
    return three.loading;
  }

  // Android, not fullscreen yet (e.g. the page was opened again): a small button to go back.
  const fullscreenOffered = () => boardStyle() !== 'flat' && /Android/i.test(navigator.userAgent)
    && document.fullscreenEnabled && !document.fullscreenElement;

  function addFullscreenButton() {
    if (!fullscreenOffered()) return;
    const bar = root.querySelector('.hud-top') ?? root.querySelector('.menu.start .topbar');
    if (!bar) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'icon-btn hud-fullscreen';
    b.dataset.action = 'fullscreen';
    b.setAttribute('aria-label', TEXT.fullscreen);
    b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"></path></svg>';
    bar.appendChild(b);
  }

  function render({ animate = false } = {}) {
    root.innerHTML = viewShell({ ...shell, board: boardStyle() });
    // viewShell has set the wording for this render, so the page title follows it.
    document.documentElement.lang = shell.lang;
    document.title = TEXT.pageTitle;
    addFullscreenButton();
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
      three.view.sync(play, interactions(play), { animate, table: shell.board === 'table' });
    };
    if (three.view || three.failed) draw();
    else loadThree().then(draw);
  }

  // Android: games go fullscreen and lock to landscape (3D board only).
  // Must run inside the tap that starts the game; browsers refuse otherwise.
  function enterGameScreen() {
    if (boardStyle() === 'flat' || !/Android/i.test(navigator.userAgent)) return;
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => {});
  }

  function dispatch(action) {
    if (action.type === 'fullscreen') {
      enterGameScreen();
      return;
    }
    if (['menu-quick', 'menu-start', 'menu-continue'].includes(action.type)) enterGameScreen();
    const before = shell;
    try {
      shell = updateShell(shell, action);
    } catch (err) {
      console.error(err);
    }
    if (shell.play) save(STORE_KEY, shell.play);
    if (shell.board !== before.board) save(BOARD_KEY, shell.board);
    if (shell.lang !== before.lang) save(LANG_KEY, shell.lang);
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

  // Show or hide the fullscreen button as the page enters or leaves fullscreen.
  document.addEventListener('fullscreenchange', () => render());

  render();
  // Start loading the 3D board early so the first game opens without a wait.
  if (boardStyle() !== 'flat') loadThree();
}
