// Renders a model to an HTML string. Pure: no DOM access, so every screen
// state can be rendered in tests.

import * as R from '../rules/index.js';
import { interactions, unitKey } from './controller.js';
import { campsiteMark, lockIcon, towerGlyph, unitIcon } from './icons.js';
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
  if (key === ix.dest || ix.targets.includes(key)) cls.push('dest');
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
  const where = slot.row === 1 ? 'Middle lane' : `${team(slot.player)}'s lane`;
  const what = units.length
    ? units.map((u) => `${team(u.player)} ${u.type}`).join(', ')
    : 'empty';
  return `${where}${slot.tower ? ', tower' : ''}${slot.campsite ? ', campsite' : ''}: ${what}`;
}

function cell(slot, g, ix, victims, victimKeys) {
  if (slot.gap) return '<div class="slot gap"></div>';
  const units = g.units.filter((u) => unitKey(g, u) === slot.key);
  const cls = ['slot', 'cell', ...(slot.tower ? ['tower'] : []), ...(slot.campsite ? ['campsite'] : []),
    ...stateClasses(slot.key, ix, victimKeys)];
  const inner = (slot.tower ? towerGlyph() : '') + (slot.campsite ? campsiteMark() : '') + unitsMarkup(units, victims);
  const label = esc(describeCell(slot, units));
  if (interactive(cls)) {
    return `<button type="button" class="${cls.join(' ')}" data-action="tap" data-key="${slot.key}" aria-label="${label}">${inner}</button>`;
  }
  return `<div class="${cls.join(' ')}" role="img" aria-label="${label}">${inner}</div>`;
}

function board(g, viewer, ix, victims, victimKeys) {
  const other = R.otherPlayer(viewer);
  const slots = boardSlots(viewer, g.config);
  const columns = slots.filter((s) => s.row === 0).length;
  const cells = slots.map((s) => cell(s, g, ix, victims, victimKeys)).join('');
  return `<section class="board-area" aria-label="Board">
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

function opponentPanel(g, player) {
  const c = counts(g, player);
  const power = g.held[player]
    ? '<div class="card back"></div>'
    : `<div class="card empty">${esc(TEXT.noPower)}</div>`;
  return `<section class="panel opponent" aria-label="${esc(team(player))}">
    <div class="panel-head">
      <h2 class="team">${esc(team(player))}</h2>
      <div class="stats"><span>${esc(TEXT.home)} ${c.home.length}</span><span>${esc(TEXT.ascended(c.ascended, c.total))}</span></div>
    </div>
    <div class="cards small">
      <div class="card-slot"><div class="card back deck"></div><span class="lbl">${esc(TEXT.left(c.deck))}</span></div>
      <div class="card-slot">${power}<span class="lbl">${esc(TEXT.power)}</span></div>
    </div>
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
  return `<span class="numeral">${esc(info.numeral)}</span><span class="art"></span><span class="pname">${esc(info.name)}</span>${extra}`;
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
    ? `<button type="button" class="card back deck deck-card can" data-action="draw" aria-label="Draw a card"></button>`
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
    <div class="cards big">
      <div class="card-slot">${deck}<span class="lbl">${esc(TEXT.left(c.deck))}</span></div>
      <div class="card-slot">${drawnCard(g)}<span class="lbl">${esc(g.campsite ? TEXT.campCard : TEXT.drawn)}</span></div>
      <div class="card-slot">${power}<span class="lbl">${esc(TEXT.power)}</span></div>
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

function eventsLine(m) {
  const lines = m.ui.events.map((e) => {
    const t = team(e.player);
    if (e.type === 'lost') return TEXT.event.lost(t, e.count);
    if (e.type === 'ascended') return TEXT.event.ascended(t, e.count);
    if (e.type === 'turnLost') return TEXT.event.turnLost(t);
    if (e.type === 'noMove') return TEXT.event.noMove(t);
    if (e.type === 'drafted') return TEXT.event.drafted(t, powerName(e.power));
    if (e.type === 'played') return TEXT.event.played(t, powerName(e.power));
    return '';
  }).filter(Boolean);
  return lines.length ? `<p class="events">${esc(lines.join(' · '))}</p>` : '';
}

/** Which part of a turn the drawn card belongs to (see labels.js). */
function stepOf(g) {
  if (g.campsite) return 'campsite';
  return g.hanged?.stage ?? null;
}

function actions(m, ix) {
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
      status = step === 'forward' ? S.drawForward : S.draw(team(g.current));
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
      controls = `<div class="buttons">${btn('joker-draft', TEXT.draft, { primary: true })}${btn('use-power', TEXT.usePowerInstead(powerName(ix.power)))}</div>`;
      break;
    case 'draft': {
      status = S.draft(step);
      const cards = R.draftOptions(g).map((id, i) =>
        `<button type="button" class="card face power choice" data-action="keep" data-index="${i}" aria-label="Keep ${esc(powerName(id))}">${powerCard(id)}</button>`);
      controls = `<div class="draft">${cards.join('')}</div>`;
      break;
    }
    case R.POWERS.LOVERS:
      status = ix.options.length ? S.chooseUnit : m.ui.pick?.unit ? S.loversTarget : S.loversPick;
      controls = optionChips(ix) + `<div class="buttons">${btn('cancel', TEXT.cancel)}</div>`;
      break;
    case R.POWERS.DEVIL:
      status = ix.options.length && !ix.canConfirm ? S.chooseUnit : ix.canConfirm ? S.devilConfirm : S.devilPick;
      controls = optionChips(ix)
        + `<div class="buttons">${ix.canConfirm ? btn('confirm', TEXT.unleash, { primary: true }) : ''}${btn('cancel', TEXT.cancel)}</div>`;
      break;
    default:
      break;
  }

  // The held power can stand in for the card (after draw) or the draw itself.
  if (ix.canUsePower && ['draw', 'move', 'stuck', 'jokerPass'].includes(ix.phase)) {
    const label = ix.phase === 'draw' ? TEXT.usePower(powerName(ix.power)) : TEXT.usePowerInstead(powerName(ix.power));
    controls += `<div class="buttons">${btn('use-power', label)}</div>`;
  }

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

export function view(m) {
  const g = m.game;
  const ix = interactions(m);
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
