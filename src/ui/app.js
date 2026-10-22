// DOM wiring: renders the model, turns taps into actions, keeps the current
// game in this browser so a refresh doesn't lose it.

import { initShell, updateShell, viewShell } from './shell.js';

const STORE_KEY = 'board-game-test-v5';

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (saved?.game?.config && saved.ui) return saved;
  } catch {
    // Unreadable or blocked storage: start fresh.
  }
  return null;
}

function save(model) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(model));
  } catch {
    // Storage unavailable: the game still works, it just won't survive a reload.
  }
}

export function startApp(root) {
  // Opens on the start screen; a saved game can be continued from there.
  let shell = initShell(load());

  const render = () => {
    root.innerHTML = viewShell(shell);
  };

  root.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled || !root.contains(el)) return;
    const action = { type: el.dataset.action };
    if (el.dataset.key) action.key = el.dataset.key;
    if (el.dataset.index !== undefined) action.index = Number(el.dataset.index);
    if (el.dataset.value !== undefined) action.value = el.dataset.value;
    try {
      shell = updateShell(shell, action);
    } catch (err) {
      console.error(err);
    }
    if (shell.play) save(shell.play);
    render();
  });

  render();
}
