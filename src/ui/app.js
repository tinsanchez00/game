// DOM wiring: renders the model, turns taps into actions, keeps the current
// game in this browser so a refresh doesn't lose it.

import { createGame } from '../rules/index.js';
import { initModel, update } from './controller.js';
import { view } from './view.js';

const STORE_KEY = 'board-game-test-v3';

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
  let model = load() ?? initModel(createGame());

  const render = () => {
    root.innerHTML = view(model);
  };

  root.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled || !root.contains(el)) return;
    const action = { type: el.dataset.action };
    if (el.dataset.key) action.key = el.dataset.key;
    if (el.dataset.index !== undefined) action.index = Number(el.dataset.index);
    if (el.dataset.value !== undefined) action.value = el.dataset.value;
    try {
      model = update(model, action);
    } catch (err) {
      console.error(err);
    }
    save(model);
    render();
  });

  render();
}
