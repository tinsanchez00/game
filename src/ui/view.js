// Renders a model to an HTML string. Pure: no DOM access, so every screen
// state can be rendered in tests.

import * as R from '../rules/index.js';
import { interactions, unitKey } from './controller.js';
import { campsiteGlyph, heartIcon, lockIcon, towerGlyph, unitIcon } from './icons.js';
import { powerIconSvg } from './powerIcons.js';
import { boardSlots } from './layout.js';
import { OPTION_LABELS, POWER_INFO, TEAM_NAMES, TEXT } from './labels.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

const team = (p) => TEAM_NAMES[p];
const powerName = (id) => POWER_INFO[id]?.name ?? id;

function stateClasses(key, ix, victimKeys) {
  const cls = [];
  if (ix.tappable.includes(key)) cls.push('can');
  if (key === ix.selected) cls.push('sel');
  if (key === ix.dest || key === ix.push?.to || ix.targets.includes(key)) cls.push('dest');
  if (victimKeys.has(key)) cls.push('cap');
  return cls;
}

function interactive(cls) {
  return cls.includes('can') || cls.includes('dest');
}

// --- board ------------------------------------------------------------------

function unitsMarkup(units, victims) {
  const icons = units.map((u) => unitIcon(u, victims.has(u.id) ? 'doomed' : ''));
  if (icons.length < 2) return icons.join('');
  return `<span class="stack">${icons.join('')}</span>`;
}

function describeCell(slot, units) {
  const where = slot.row === 1 ? TEXT.middleLane : TEXT.lane(team(slot.player));
  const what = units.length
    ? units.map((u) => `${team(u.player)} ${TEXT.unitName[u.type] ?? u.type}`).join(', ')
    : TEXT.emptyCell;
  return TEXT.cellLabel(where, slot.tower, slot.campsite, what);
}

function cell(slot, g, ix, victims, victimKeys) {
  if (slot.gap) return '<div class="slot gap"></div>';
  const units = g.units.filter((u) => unitKey(g, u) === slot.key);
  const cls = ['slot', 'cell', ...(slot.tower ? ['tower'] : []), ...(slot.campsite ? ['campsite'] : []),
    ...stateClasses(slot.key, ix, victimKeys)];
  const inner = (slot.tower ? towerGlyph() : '') + (slot.campsite ? campsiteGlyph() : '') + unitsMarkup(units, victims);
  const label = esc(describeCell(slot, units));
  if (interactive(cls)) {
    return `<button type="button" class="${cls.join(' ')}" data-action="tap" data-key="${slot.key}" aria-label="${label}">${inner}</button>`;
  }
  return `<div class="${cls.join(' ')}" role="img" aria-label="${label}">${inner}</div>`;
}

/** Lovers jump lines: one along a lane from a unit to the ally it would join. */
function jumpLines(slots, columns, ix) {
  const at = (key) => slots.find((s) => s.key === key);
  const rows = Math.max(...slots.map((s) => s.row)) + 1;
  return ix.lines.map(({ from, to, on }) => {
    const a = at(from);
    const b = at(to);
    if (!a || !b || a.row !== b.row) return '';
    // From just inside the unit's cell to just inside the ally's, clear of both icons.
    const left = ((Math.min(a.col, b.col) + 0.85) / columns) * 100;
    const width = ((Math.abs(a.col - b.col) - 0.7) / columns) * 100;
    const top = ((a.row + 0.5) / rows) * 100;
    return `<div class="jump-line${on ? ' on' : ''}" style="left: ${left.toFixed(2)}%; width: ${width.toFixed(2)}%; top: ${top.toFixed(2)}%" aria-hidden="true">${heartIcon()}</div>`;
  }).join('');
}

function board(g, viewer, ix, victims, victimKeys) {
  const other = R.otherPlayer(viewer);
  const slots = boardSlots(viewer, g.config);
  const columns = slots.filter((s) => s.row === 0).length;
  const cells = slots.map((s) => cell(s, g, ix, victims, victimKeys)).join('') + jumpLines(slots, columns, ix);
  return `<section class="board-area" aria-label="${esc(TEXT.board)}">
    <span class="lane">${esc(TEXT.lane(team(other)))}</span>
    <div class="board-frame"><div class="board" style="grid-template-columns: repeat(${columns}, minmax(0, 1fr))">${cells}</div></div>
    <span class="lane">${esc(TEXT.lane(team(viewer)))}</span>
  </section>`;
}

// --- panels -----------------------------------------------------------------------

function counts(g, player) {
  const mine = g.units.filter((u) => u.player === player);
  return {
    home: mine.filter((u) => u.pos === R.HOME),
    ascended: mine.filter((u) => u.pos === R.geometry(g.config).ascended).length,
    total: mine.length,
    deck: g.moveDecks[player].draw.length,
  };
}

/** A player's discard pile, oldest first, face up for both players. */
function discardRow(g, player) {
  const cards = g.moveDecks[player].discard;
  const short = (c) => (c === R.JOKER ? TEXT.jokerShort : String(c));
  const spoken = cards.map((c) => (c === R.JOKER ? TEXT.joker : String(c))).join(', ');
  const minis = cards.length
    ? cards.map((c) => `<span class="mini">${esc(short(c))}</span>`).join('')
    : `<span class="lbl">${esc(TEXT.discardEmpty)}</span>`;
  return `<div class="discard" role="img" aria-label="${esc(TEXT.discardLabel(team(player), spoken))}">
    <span class="lbl">${esc(TEXT.discard)}</span>${minis}
  </div>`;
}

const STAR_PATH = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z';

/** A player's star count, on their power slot (when upside-down powers are on). */
function starBadge(g, player) {
  if (!g.config.powers || !g.config.rules.upsideDown) return '';
  const n = g.stars?.[player] ?? 0;
  return `<span class="star-badge" role="img" aria-label="${esc(TEXT.stars(team(player), n))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"></path></svg>${n}</span>`;
}

function opponentPanel(g, player) {
  const c = counts(g, player);
  // Every card is public: the other player's power is face up too.
  const power = g.held[player]
    ? `<div class="card face power">${powerCard(g.held[player])}</div>`
    : `<div class="card empty">${esc(TEXT.noPower)}</div>`;
  return `<section class="panel opponent" aria-label="${esc(team(player))}">
    <div class="panel-head">
      <h2 class="team">${esc(team(player))}</h2>
      <div class="stats"><span>${esc(TEXT.home)} ${c.home.length}</span><span>${esc(TEXT.ascended(c.ascended, c.total))}</span></div>
    </div>
    <div class="cards small">
      <div class="card-slot"><div class="card back deck"></div><span class="lbl">${esc(TEXT.left(c.deck))}</span></div>
      <div class="card-slot">${power}${starBadge(g, player)}<span class="lbl">${esc(TEXT.power)}</span></div>
    </div>
    ${discardRow(g, player)}
  </section>`;
}

function tray(key, content, ix, victimKeys, label) {
  const cls = ['tray', ...stateClasses(key, ix, victimKeys)];
  if (interactive(cls)) {
    return `<button type="button" class="${cls.join(' ')}" data-action="tap" data-key="${key}" aria-label="${esc(label)}">${content}</button>`;
  }
  return `<div class="${cls.join(' ')}">${content}</div>`;
}

function powerCard(id, extra = '') {
  const info = POWER_INFO[id] ?? { name: id, numeral: '' };
  return `<span class="numeral">${esc(info.numeral)}</span><span class="art">${powerIconSvg(id)}</span><span class="pname">${esc(info.name)}</span>${extra}`;
}

function drawnCard(g) {
  if (g.drawn === null) return '<div class="card empty"></div>';
  if (g.drawn === R.JOKER) {
    return `<div class="card face drawn"><span class="joker-word">${esc(TEXT.joker)}</span></div>`;
  }
  return `<div class="card face drawn"><span class="num">${g.drawn}</span></div>`;
}

function playerPanel(m, ix, victims, victimKeys) {
  const g = m.game;
  const p = m.ui.viewer;
  const c = counts(g, p);
  const homeKey = `home:${p}`;
  const locked = c.home.some((u) => u.type === 'commander') && R.isCommanderLocked(g, p);
  const homeIcons = c.home
    .slice()
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'soldier' ? -1 : 1))
    .map((u) => unitIcon(u, victims.has(u.id) ? 'doomed' : ''))
    .join('');
  const homeTray = tray(
    homeKey,
    `<span>${esc(TEXT.home)}</span>${homeIcons}${locked ? lockIcon() : ''}`,
    ix, victimKeys, `${TEXT.home}: ${c.home.length}`,
  );
  const ascTray = tray(`asc:${p}`, `<span>${esc(TEXT.ascended(c.ascended, c.total))}</span>`, ix, victimKeys, TEXT.ascended(c.ascended, c.total));

  const canDraw = ix.phase === 'draw';
  const deck = canDraw
    ? `<button type="button" class="card back deck deck-card can" data-action="draw" aria-label="${esc(TEXT.drawCard)}"></button>`
    : '<div class="card back deck deck-card"></div>';
  const held = g.held[p];
  const power = held
    ? `<div class="card face power${ix.canUsePower ? ' ready' : ''}">${powerCard(held)}</div>`
    : `<div class="card empty">${esc(TEXT.noPower)}</div>`;

  return `<section class="panel me" aria-label="${esc(team(p))}">
    <div class="panel-head">
      <h2 class="team">${esc(team(p))}</h2>
      <div class="stats">${ascTray}</div>
    </div>
    <div class="home-row">${homeTray}</div>
    ${discardRow(g, p)}
    <div class="cards big">
      <div class="card-slot">${deck}<span class="lbl">${esc(TEXT.left(c.deck))}</span></div>
      <div class="card-slot">${drawnCard(g)}<span class="lbl">${esc(g.campsite ? TEXT.campCard : g.upsideDown?.stage === 'step' ? TEXT.stepCard : TEXT.drawn)}</span></div>
      <div class="card-slot">${power}${starBadge(g, p)}<span class="lbl">${esc(TEXT.power)}</span></div>
    </div>
    ${actions(m, ix)}
  </section>`;
}

// --- action area ----------------------------------------------------------------------

const btn = (action, label, { primary = false, disabled = false, extra = '' } = {}) =>
  `<button type="button" class="btn${primary ? ' primary' : ''}" data-action="${action}"${extra}${disabled ? ' disabled' : ''}>${esc(label)}</button>`;

function optionChips(ix) {
  if (!ix.options.length) return '';
  const chips = ix.options.map((sig) => {
    const on = sig === ix.chosen;
    return `<button type="button" class="chip${on ? ' on' : ''}" data-action="option" data-value="${esc(sig)}" aria-pressed="${on}">${esc(OPTION_LABELS[sig] ?? sig)}</button>`;
  });
  return `<div class="buttons">${chips.join('')}</div>`;
}

function eventsText(m) {
  return m.ui.events.map((e) => {
    const t = team(e.player);
    if (e.type === 'lost') return TEXT.event.lost(t, e.count);
    if (e.type === 'ascended') return TEXT.event.ascended(t, e.count);
    if (e.type === 'turnLost') return TEXT.event.turnLost(t);
    if (e.type === 'noMove') return TEXT.event.noMove(t);
    if (e.type === 'drafted') return TEXT.event.drafted(t, powerName(e.power));
    if (e.type === 'played') return TEXT.event.played(t, powerName(e.power));
    if (e.type === 'flipped') return TEXT.event.flipped(t, powerName(e.power));
    if (e.type === 'extraTurn') return TEXT.event.extraTurn(t);
    return '';
  }).filter(Boolean).join(' · ');
}

function eventsLine(m) {
  const text = eventsText(m);
  return text ? `<p class="events">${esc(text)}</p>` : '';
}

/** Which part of a turn the drawn card belongs to (see labels.js). */
function stepOf(g) {
  if (g.campsite) return 'campsite';
  if (g.hermit) return 'hermit';
  if (g.hanged?.enemy) return 'backEnemy';
  return g.hanged?.stage ?? null;
}

/**
 * The status line and controls for the current phase: { status, controls }.
 * cards3d: the draft and the held power are tapped in the 3D view, not as buttons.
 */
function turnControls(m, ix, { cards3d = false } = {}) {
  const g = m.game;
  const S = TEXT.status;
  const step = stepOf(g);
  let status = '';
  let controls = '';

  switch (ix.phase) {
    case 'handoff':
      status = S.handoff(team(g.current));
      controls = `<div class="buttons">${btn('handoff', S.startTurn(team(g.current)), { primary: true })}</div>`;
      break;
    case 'draw':
      status = S.draw(team(g.current));
      break;
    case 'move':
      status = ix.selected && !ix.chosen ? S.chooseUnit
        : ix.chosen ? S.pickMove
          : S.move(g.drawn, step);
      controls = optionChips(ix)
        + (ix.canConfirm ? `<div class="buttons">${btn('confirm', TEXT.move, { primary: true })}${btn('cancel', TEXT.cancel)}</div>` : '');
      break;
    case 'stuck':
      status = S.stuck(g.drawn, step);
      controls = `<div class="buttons">${btn('continue', TEXT.continue, { primary: true })}</div>`;
      break;
    case 'jokerPass':
      status = S.jokerPass(step);
      controls = `<div class="buttons">${btn('continue', TEXT.continue, { primary: true })}</div>`;
      break;
    case 'joker':
      status = S.joker;
      controls = `<div class="buttons">${btn('joker-draft', TEXT.draft, { primary: true })}${cards3d ? '' : btn('use-power', TEXT.usePowerInstead(powerName(ix.power)))}</div>`;
      break;
    case 'draft': {
      status = S.draft(step);
      if (cards3d) break;
      const cards = R.draftOptions(g).map((id, i) =>
        `<button type="button" class="card face power choice" data-action="keep" data-index="${i}" aria-label="${esc(TEXT.keep(powerName(id)))}">${powerCard(id)}</button>`);
      controls = `<div class="draft">${cards.join('')}</div>`;
      break;
    }
    case 'side': {
      status = S.side(powerName(ix.power));
      const T = TEXT.side;
      const choice = (action, title, note, disabled) => `<button type="button" class="btn side-choice" data-action="${action}"${disabled ? ' disabled' : ''}><span class="side-title">${esc(title)}</span><span class="side-note">${esc(note)}</span></button>`;
      // In 3D the cards and their captions are tapped; only Back stays a button.
      controls = cards3d
        ? `<div class="buttons side-back">${btn('cancel', T.back)}</div>`
        : `<div class="buttons side-pick">${choice('side-upright', T.upright, T.uprightNote(ix.power), !ix.canUpright)}${choice('side-upside', T.upsideDown, T.upsideNote(ix.cost, ix.power), !ix.canUpsideDown)}${btn('cancel', T.back)}</div>`;
      break;
    }
    case R.POWERS.LOVERS:
      status = ix.options.length ? S.chooseUnit : m.ui.pick?.unit ? S.loversTarget : ix.upside ? S.loversPickEnemy : S.loversPick;
      controls = optionChips(ix) + `<div class="buttons">${btn('cancel', TEXT.cancel)}</div>`;
      break;
    case R.POWERS.TOWER:
      status = ix.options.length && !ix.canConfirm ? S.chooseUnit : ix.canConfirm ? S.towerConfirm : S.towerPick;
      controls = optionChips(ix)
        + `<div class="buttons">${ix.canConfirm ? btn('confirm', TEXT.stepForward, { primary: true }) : ''}${btn('cancel', TEXT.cancel)}</div>`;
      break;
    case R.POWERS.DEVIL:
      status = ix.options.length && !ix.canConfirm ? S.chooseUnit : ix.canConfirm ? S.devilConfirm : ix.upside ? S.devilPickAny : S.devilPick;
      controls = optionChips(ix)
        + `<div class="buttons">${ix.canConfirm ? btn('confirm', TEXT.unleash, { primary: true }) : ''}${btn('cancel', TEXT.cancel)}</div>`;
      break;
    case R.POWERS.HERMIT: {
      status = S.hermitPile;
      // In 3D the numbers rise like the draft; the flat board lists them as buttons.
      const nums = cards3d ? '' : `<div class="buttons">${ix.cards.map((n, i) => btn('keep', String(n), { primary: true, extra: ` data-index="${i}"` })).join('')}</div>`;
      controls = nums + `<div class="buttons">${btn('cancel', TEXT.cancel)}</div>`;
      break;
    }
    default:
      break;
  }

  // The held power can stand in for the card (after draw) or the draw itself.
  // In 3D the glowing power card itself is tapped instead.
  if (!cards3d && ix.canUsePower && ['draw', 'move', 'stuck', 'jokerPass'].includes(ix.phase)) {
    const label = ix.phase === 'draw' ? TEXT.usePower(powerName(ix.power)) : TEXT.usePowerInstead(powerName(ix.power));
    controls += `<div class="buttons">${btn('use-power', label)}</div>`;
  }

  return { status, controls };
}

function actions(m, ix) {
  const { status, controls } = turnControls(m, ix);
  return `<div class="actions" aria-live="polite">
    ${eventsLine(m)}
    ${status ? `<p class="status">${esc(status)}</p>` : ''}
    ${controls}
  </div>`;
}

// --- page ----------------------------------------------------------------------------

function topBar(m) {
  const right = m.ui.confirmNew
    ? `<span class="restart">${esc(TEXT.restartPrompt)} ${btn('new-confirm', TEXT.yes, { primary: true })}${btn('new-cancel', TEXT.no)}</span>`
    : btn('new', TEXT.newGame);
  return `<header class="topbar"><span class="mode">${esc(TEXT.testMode)}</span>${right}</header>`;
}

function winOverlay(g) {
  return `<div class="overlay" role="dialog" aria-modal="true" aria-label="${esc(TEXT.status.won(team(g.winner)))}">
    <div class="win-card">
      <h2>${esc(TEXT.status.won(team(g.winner)))}</h2>
      ${btn('new-confirm', TEXT.newGame, { primary: true })}
    </div>
  </div>`;
}

function menuIcon() {
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"></path></svg>';
}

/**
 * The 3D page: a full-screen stage the app fills with its canvas (board3d/),
 * and a flat overlay — menu button, status pill and the turn's buttons.
 */
function view3d(m, ix, { table = false } = {}) {
  const g = m.game;
  const { status, controls } = turnControls(m, ix, { cards3d: true });
  const events = eventsText(m);
  const open = m.ui.menuOpen === true;
  const restart = m.ui.confirmNew
    ? `<span class="restart">${esc(TEXT.restartPrompt)} ${btn('new-confirm', TEXT.yes, { primary: true })}${btn('new-cancel', TEXT.no)}</span>`
    : btn('new', TEXT.newGame);
  const menu = open
    ? `<div class="menu-pop" id="game-menu"><p class="menu-note">${esc(TEXT.testMode)}</p>${restart}</div>`
    : '';
  // Phone on the table: the overlay turns to face the player whose turn it is.
  const flipped = table && g.current === 1;
  return `<div class="app3d">
    <div class="stage" data-board3d role="img" aria-label="${esc(TEXT.boardLabel)}"></div>
    <div class="hud-layer${flipped ? ' flipped' : ''}">
    <header class="hud-top">
      <button type="button" class="icon-btn hud-menu" data-action="menu" aria-label="${esc(TEXT.menu)}" aria-expanded="${open}" aria-controls="game-menu">${menuIcon()}</button>
      <div class="pill" aria-live="polite">
        <span class="pill-line"><span class="pill-team">${esc(team(g.current))}</span>${status ? `<span class="pill-status">${esc(status)}</span>` : ''}</span>
        ${events ? `<span class="pill-events">${esc(events)}</span>` : ''}
      </div>
    </header>
    ${menu}
    <div class="hud-actions">${controls}</div>
    ${ix.phase === 'won' ? winOverlay(g) : ''}
    </div>
  </div>`;
}

/** `board`: 'flat' (HTML grid and panels) or '3d' (a full-screen 3D table). */
export function view(m, { board: style = 'flat' } = {}) {
  const g = m.game;
  const ix = interactions(m);
  if (style === '3d' || style === 'table') return view3d(m, ix, { table: style === 'table' });
  const victims = new Set(ix.victims);
  const victimKeys = new Set(ix.victims.map((id) => unitKey(g, R.getUnit(g, id))));
  return `<div class="app">
    ${topBar(m)}
    ${opponentPanel(g, R.otherPlayer(m.ui.viewer))}
    ${board(g, m.ui.viewer, ix, victims, victimKeys)}
    ${playerPanel(m, ix, victims, victimKeys)}
    ${ix.phase === 'won' ? winOverlay(g) : ''}
  </div>`;
}
