// The app around a game: start screen, game-mode screen, and the game
// itself (controller.js / view.js). Pure model/update/view, no DOM.
//
// shell = {
//   screen,  'start' | 'mode' | 'game'
//   play,    the game model ({ game, ui }) or null
//   menu,    { preset, settings, open } for the game-mode screen
//   board,   '3d' (pass the phone) | 'table' (phone on the table) | 'flat'
//   lang,    'en' | 'es' (the wording on screen)
// }

import { createGame } from '../rules/index.js';
import { initModel, update as updateGame } from './controller.js';
import { LANGUAGES, MENU, TEXT, setLanguage } from './labels.js';
import { FIELDS, PRESETS, changedKeys, parseValue, presetSettings, toConfig, toggleValue } from './modes.js';
import { view as gameView } from './view.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

function freshMenu() {
  return { preset: 'standard', settings: presetSettings('standard'), open: false };
}

export const BOARD_STYLES = Object.freeze(['3d', 'table', 'flat']);

/** A shell on the start screen; `play` is a saved game to continue, if any. */
export function initShell(play = null, board = '3d', lang = 'en') {
  return {
    screen: 'start',
    play,
    menu: freshMenu(),
    board: BOARD_STYLES.includes(board) ? board : '3d',
    lang: LANGUAGES.includes(lang) ? lang : 'en',
  };
}

/**
 * `newGame(config)` makes the game for Quick game and Start (tests pass a
 * seeded one); defaults to a random game.
 */
export function updateShell(s, action, { newGame = (config) => createGame({ config }) } = {}) {
  const menu = (patch) => ({ ...s, menu: { ...s.menu, ...patch } });
  switch (action.type) {
    case 'menu-quick':
      return { ...s, screen: 'game', play: initModel(newGame({})) };
    case 'menu-continue':
      return s.play ? seated({ ...s, screen: 'game' }) : s;
    case 'menu-mode':
      return { ...s, screen: 'mode', menu: freshMenu() };
    case 'menu-back':
      return { ...s, screen: 'start' };
    case 'menu-board':
      // With a value: pick that style; without: the flat-board switch.
      if (s.screen !== 'start') return s;
      if (BOARD_STYLES.includes(action.value)) return { ...s, board: action.value };
      return { ...s, board: s.board === 'flat' ? '3d' : 'flat' };
    case 'menu-lang':
      // Unknown codes are ignored; the choice is saved by the app wiring.
      if (!LANGUAGES.includes(action.value)) return s;
      return { ...s, lang: action.value };
    case 'menu-preset':
      return menu({ preset: action.value, settings: presetSettings(action.value) });
    case 'menu-customize':
      return menu({ open: !s.menu.open });
    case 'menu-set': {
      const field = FIELDS.find((f) => f.key === action.key);
      const value = field?.kind === 'multi'
        ? toggleValue(action.key, s.menu.settings[action.key], action.value)
        : parseValue(action.key, action.value);
      return menu({ settings: { ...s.menu.settings, [action.key]: value } });
    }
    case 'menu-start':
      return { ...s, screen: 'game', play: initModel(newGame(toConfig(s.menu.settings))) };
    default:
      break;
  }
  if (s.screen !== 'game' || !s.play) return s;
  // Leaving a game (after its confirm, or from the win screen) goes back to the start screen.
  if (action.type === 'new-confirm') return { ...s, screen: 'start', play: updateGame(s.play, { type: 'new-cancel' }) };
  return seated({ ...s, play: updateGame(s.play, action) });
}

/** Phone on the table: no handing over, the view always belongs to the player whose turn it is. */
function seated(s) {
  const play = s.play;
  if (s.board !== 'table' || !play || play.game.winner !== null || play.ui.viewer === play.game.current) return s;
  return { ...s, play: { ...play, ui: { ...play.ui, viewer: play.game.current } } };
}

// --- views --------------------------------------------------------------------

const btn = (action, label, { primary = false, extra = '' } = {}) =>
  `<button type="button" class="btn big${primary ? ' primary' : ''}" data-action="${action}"${extra}>${esc(label)}</button>`;

function startView(s) {
  const cont = s.play && s.play.game.winner === null
    ? `<button type="button" class="link" data-action="menu-continue">${esc(MENU.continue)}</button>`
    : '';
  return `<div class="app menu start">
    <header class="topbar"><span class="mode">${esc(TEXT.testMode)}</span>${languageChoice(s.lang)}</header>
    <div class="title-block">
      ${crestIcon()}
      <h1 class="game-title">${esc(MENU.gameName)}</h1>
      <p class="tagline">${esc(MENU.tagline)}</p>
    </div>
    <div class="menu-buttons">
      ${btn('menu-quick', MENU.quick, { primary: true })}
      ${btn('menu-mode', MENU.mode)}
      ${cont}
    </div>
    ${s.board === 'flat' ? '' : seatChoice(s.board)}
    <div class="start-foot">
      <p class="hint">${esc(MENU.quickHint)}</p>
      <button type="button" class="link quiet" data-action="menu-board">${esc(MENU.boardSwitch(s.board))}</button>
    </div>
  </div>`;
}

/** Pass the phone, or set it on the table between the players. */
function seatChoice(board) {
  const opts = ['3d', 'table'].map((v) => {
    const on = v === board;
    return `<button type="button" class="seg-opt${on ? ' on' : ''}" aria-pressed="${on}" data-action="menu-board" data-value="${v}">${esc(MENU.seat[v])}</button>`;
  });
  return `<div class="seg seat" role="group" aria-label="${esc(MENU.seatLabel)}">${opts.join('')}</div>`;
}

/** English / Español switch. Each name is written in its own language. */
function languageChoice(lang) {
  const opts = LANGUAGES.map((code) => {
    const on = code === lang;
    return `<button type="button" class="seg-opt${on ? ' on' : ''}" aria-pressed="${on}" data-action="menu-lang" data-value="${code}">${esc(MENU.languageNames[code])}</button>`;
  });
  return `<div class="seg lang" role="group" aria-label="${esc(TEXT.language)}">${opts.join('')}</div>`;
}

function crestIcon() {
  return '<svg class="crest" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 6.5c-3.8 0-6.3 2.7-6.3 6.4V18c0 .8.6 1.5 1.4 1.5h2.3l.9-3.2h3.4l.9 3.2h2.3c.8 0 1.4-.7 1.4-1.5v-5.1c0-3.7-2.5-6.4-6.3-6.4Zm-3.1 6.2h6.2v2.2H8.9z"></path><path d="M6.6 9.3 6.2 3.4l3 2.6L12 2.2l2.8 3.8 3-2.6-.4 5.9C16.2 7.6 14.3 6.8 12 6.8s-4.2.8-5.4 2.5Z"></path></svg>';
}

function chevron(up) {
  return `<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="${up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}"></path></svg>`;
}

function fieldRow(field, value, changed) {
  const name = esc(MENU.field[field.key]);
  const dot = changed ? `<span class="changed" aria-label="${esc(MENU.changedMark)}"></span>` : '';
  let control;
  if (field.kind === 'multi') {
    // A row of chips, each on or off.
    const chips = field.values.map((v) => {
      const on = value.includes(v);
      return `<button type="button" class="chip small${on ? ' on' : ''}" aria-pressed="${on}" data-action="menu-set" data-key="${field.key}" data-value="${esc(v)}">${esc(MENU.value[field.key]?.[v] ?? v)}</button>`;
    });
    return `<div class="field multi"><span class="field-name">${name}${dot}</span><div class="chips" role="group" aria-label="${name}">${chips.join('')}</div></div>`;
  }
  if (field.kind === 'switch') {
    control = `<button type="button" class="switch${value ? ' on' : ''}" role="switch" aria-checked="${value}" aria-label="${name}" data-action="menu-set" data-key="${field.key}" data-value="${!value}"><span></span></button>`;
  } else {
    const opts = field.values.map((v) => {
      const on = v === value;
      return `<button type="button" class="seg-opt${on ? ' on' : ''}" aria-pressed="${on}" data-action="menu-set" data-key="${field.key}" data-value="${esc(v)}">${esc(MENU.value[field.key]?.[v] ?? v)}</button>`;
    });
    control = `<div class="seg" role="group" aria-label="${name}">${opts.join('')}</div>`;
  }
  return `<div class="field"><span class="field-name">${name}${dot}</span>${control}</div>`;
}

function modeView(s) {
  const { preset, settings, open } = s.menu;
  const changed = changedKeys(preset, settings);
  const chips = PRESETS.map((p) => {
    const on = p.id === preset;
    return `<button type="button" class="chip${on ? ' on' : ''}" aria-pressed="${on}" data-action="menu-preset" data-value="${p.id}">${esc(MENU.preset[p.id].name)}</button>`;
  }).join('');
  const title = `${MENU.preset[preset].name}${changed.length ? ` · ${MENU.changed}` : ''}`;
  const fields = open
    ? FIELDS.filter((f) => !f.when || f.when(settings)).map((f) => fieldRow(f, settings[f.key], changed.includes(f.key))).join('')
    : '';
  return `<div class="app menu mode-screen">
    <header class="menu-head">
      <button type="button" class="icon-btn" data-action="menu-back" aria-label="${esc(MENU.back)}">${chevronLeft()}</button>
      <h1 class="screen-title">${esc(MENU.mode)}</h1>
    </header>
    <div class="chips" role="group" aria-label="${esc(MENU.mode)}">${chips}</div>
    <div class="mode-summary">
      <span class="mode-name">${esc(title)}</span>
      <span class="mode-desc">${esc(MENU.summary(settings))}</span>
    </div>
    <section class="customize">
      <button type="button" class="customize-toggle" data-action="menu-customize" aria-expanded="${open}">${esc(MENU.customize)}${chevron(open)}</button>
      ${fields}
    </section>
    <div class="menu-buttons bottom">${btn('menu-start', MENU.start, { primary: true })}</div>
  </div>`;
}

function chevronLeft() {
  return '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>';
}

export function viewShell(s) {
  // Every screen below reads its wording from labels.js, so set it first.
  setLanguage(s.lang ?? 'en');
  if (s.screen === 'game' && s.play) {
    const flat = s.play.game.config.players > 2; // the 3D table has two sides only
    return gameView(s.play, { board: flat ? 'flat' : s.board ?? '3d' });
  }
  if (s.screen === 'mode') return modeView(s);
  return startView(s);
}
