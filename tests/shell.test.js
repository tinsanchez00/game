import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/rules/index.js';
import { initShell, updateShell, viewShell } from '../src/ui/shell.js';
import { interactions } from '../src/ui/controller.js';
import { PRESETS, STANDARD, changedKeys, presetSettings, toConfig } from '../src/ui/modes.js';

const newGame = (config) => R.createGame({ seed: 7, config });
const act = (s, type, extra = {}) => updateShell(s, { type, ...extra }, { newGame });

test('standard settings give exactly the default rules', () => {
  assert.deepEqual(R.makeConfig(toConfig(STANDARD)), R.DEFAULT_CONFIG);
});

test('every preset builds a valid config; each changes what it says', () => {
  for (const p of PRESETS) assert.ok(R.makeConfig(toConfig(presetSettings(p.id))));
  assert.equal(R.makeConfig(toConfig(presetSettings('short'))).soldiers, 4);
  assert.equal(R.makeConfig(toConfig(presetSettings('noPowers'))).powers, false);
  assert.equal(R.makeConfig(toConfig(presetSettings('twoJokers'))).moveDeck.filter((c) => c === R.JOKER).length, 2);
  assert.equal(R.makeConfig(toConfig(presetSettings('urTowers'))).rules.towerExtraTurn, true);
});

test('the app opens on the start screen; Quick game starts the standard rules', () => {
  let s = initShell();
  assert.equal(s.screen, 'start');
  const html = viewShell(s);
  assert.match(html, /data-action="menu-quick"/);
  assert.match(html, /data-action="menu-mode"/);
  assert.doesNotMatch(html, /menu-continue/, 'nothing to continue yet');
  s = act(s, 'menu-quick');
  assert.equal(s.screen, 'game');
  assert.deepEqual(s.play.game.config, R.DEFAULT_CONFIG);
  assert.match(viewShell(s), /data-board3d/, 'the 3D board by default');
  assert.doesNotMatch(viewShell(s), /class="board"/);
});

test('the start screen switches between the 3D and the flat board', () => {
  let s = initShell();
  assert.equal(s.board, '3d');
  assert.match(viewShell(s), /data-action="menu-board"/);
  s = act(s, 'menu-board');
  assert.equal(s.board, 'flat');
  s = act(s, 'menu-quick');
  assert.match(viewShell(s), /class="board"/);
  assert.doesNotMatch(viewShell(s), /data-board3d/);
  assert.equal(act(s, 'menu-board').board, 'flat', 'only from the start screen');
  assert.equal(initShell(null, 'flat').board, 'flat');
  assert.equal(initShell(null, 'nonsense').board, '3d');
});

test('game mode: pick a preset, customize it, start with those settings', () => {
  let s = act(initShell(), 'menu-mode');
  assert.equal(s.screen, 'mode');
  assert.doesNotMatch(viewShell(s), /class="field"/, 'Customize starts closed');
  s = act(s, 'menu-preset', { value: 'short' });
  s = act(s, 'menu-customize');
  assert.match(viewShell(s), /class="field"/);
  s = act(s, 'menu-set', { key: 'jokers', value: '2' });
  s = act(s, 'menu-set', { key: 'escort', value: 'false' });
  assert.deepEqual(changedKeys('short', s.menu.settings), ['jokers', 'escort']);
  const html = viewShell(s);
  assert.match(html, /Short game · changed/);
  assert.match(html, /2 Jokers/);
  s = act(s, 'menu-start');
  assert.equal(s.screen, 'game');
  const c = s.play.game.config;
  assert.equal(c.soldiers, 4);
  assert.equal(c.moveDeck.filter((x) => x === R.JOKER).length, 2);
  assert.equal(c.rules.escort, false);
});

test('choosing another preset drops changes; Back returns to the start screen', () => {
  let s = act(initShell(), 'menu-mode');
  s = act(s, 'menu-set', { key: 'units', value: '5' });
  s = act(s, 'menu-preset', { value: 'standard' });
  assert.deepEqual(changedKeys('standard', s.menu.settings), []);
  assert.equal(act(s, 'menu-back').screen, 'start');
});

test('leaving a game goes to the start screen, where it can be continued', () => {
  let s = act(initShell(), 'menu-quick');
  s = act(s, 'new');
  s = act(s, 'new-confirm');
  assert.equal(s.screen, 'start');
  assert.match(viewShell(s), /data-action="menu-continue"/);
  s = act(s, 'menu-continue');
  assert.equal(s.screen, 'game');
  assert.equal(s.play.ui.confirmNew, false, 'the restart prompt is closed');
});

test('3D game screen: menu button, status pill and turn buttons over the table', () => {
  let s = act(initShell(), 'menu-quick');
  let html = viewShell(s);
  assert.match(html, /data-board3d/);
  assert.match(html, /class="pill"/);
  assert.match(html, /data-action="menu"/);
  assert.doesNotMatch(html, /class="panel/, 'no flat panels: cards are on the table');
  assert.doesNotMatch(html, /id="game-menu"/, 'menu starts closed');
  s = act(s, 'menu');
  html = viewShell(s);
  assert.match(html, /id="game-menu"/);
  assert.match(html, /data-action="new"/);
  s = act(s, 'new');
  assert.match(viewShell(s), /data-action="new-confirm"/);
  s = act(s, 'menu');
  assert.doesNotMatch(viewShell(s), /id="game-menu"/);
});

test('3D game screen: the draft is picked on the table, not with buttons', () => {
  const game = R.createGame({ seed: 7 });
  let s = updateShell(initShell(), { type: 'menu-quick' }, { newGame: () => ({ ...game, drawn: R.JOKER }) });
  assert.match(viewShell(s), /Keep one power/);
  assert.doesNotMatch(viewShell(s), /data-action="keep"/);
  s = act(s, 'menu-back');
  s = { ...s, board: 'flat', screen: 'game' };
  assert.match(viewShell(s), /data-action="keep"/, 'the flat board still offers buttons');
});

test('3D game screen: no "Use … instead" buttons; the power card is tapped instead', () => {
  const game = R.createGame({ seed: 7 });
  let s = updateShell(initShell(), { type: 'menu-quick' }, { newGame: () => ({ ...game, drawn: 2, held: [R.POWERS.DEVIL, R.POWERS.DEVIL] }) });
  s = { ...s, play: { ...s.play, ui: { ...s.play.ui, viewer: s.play.game.current } } };
  assert.doesNotMatch(viewShell(s), /data-action="use-power"/);
  assert.match(viewShell({ ...s, board: 'flat' }), /data-action="use-power"/);
});

test('start screen: pass the phone or phone on the table; table mode never asks to pass the phone', () => {
  let s = initShell();
  assert.match(viewShell(s), /data-value="table"/);
  s = act(s, 'menu-board', { value: 'table' });
  assert.equal(s.board, 'table');
  s = act(s, 'menu-quick');
  // Play until the turn changes hands; the view follows the current player with no handoff step.
  for (let i = 0; i < 40 && s.play.game.current === s.play.ui.viewer; i += 1) {
    const ix = interactions(s.play);
    if (ix.phase === 'draw') s = act(s, 'draw');
    else if (ix.phase === 'move') {
      s = act(s, 'tap', { key: ix.tappable[0] });
      const after = interactions(s.play);
      if (after.options.length) s = act(s, 'option', { value: after.options[0] });
      s = act(s, 'confirm');
    } else if (ix.phase === 'draft') s = act(s, 'keep', { index: 0 });
    else if (ix.phase === 'joker') s = act(s, 'joker-draft');
    else s = act(s, 'continue');
    if (interactions(s.play).phase === 'handoff') break;
  }
  assert.notEqual(interactions(s.play).phase, 'handoff');
  assert.equal(s.play.ui.viewer, s.play.game.current);
  const flipped = /class="hud-layer flipped"/.test(viewShell(s));
  assert.equal(flipped, s.play.game.current === 1, 'the overlay faces the player whose turn it is');
});

test('every card is public: the other player\'s power is face up on the flat board', () => {
  const game = R.createGame({ seed: 7 });
  const other = R.otherPlayer(game.current);
  const held = [null, null];
  held[other] = R.POWERS.HERMIT;
  let s = updateShell(initShell(null, 'flat'), { type: 'menu-quick' }, { newGame: () => ({ ...game, held }) });
  assert.match(viewShell(s), /The Hermit/);
});

test('game mode: choose which powers are in the deck', () => {
  let s = act(act(initShell(), 'menu-mode'), 'menu-customize');
  let html = viewShell(s);
  assert.match(html, /Powers in the deck/);
  assert.equal((html.match(/data-key="deck"/g) ?? []).length, 5);
  s = act(s, 'menu-set', { key: 'deck', value: 'devil' });
  s = act(s, 'menu-set', { key: 'deck', value: 'tower' });
  assert.deepEqual(s.menu.settings.deck, ['hanged-man', 'lovers', 'hermit']);
  assert.deepEqual(changedKeys('standard', s.menu.settings), ['deck']);
  assert.match(viewShell(s), /3 powers: no Devil, no Tower/);
  s = act(s, 'menu-set', { key: 'deck', value: 'tower' });
  assert.deepEqual(s.menu.settings.deck, ['hanged-man', 'lovers', 'tower', 'hermit'], 'kept in order');
  let started = act(s, 'menu-start');
  assert.deepEqual([...started.play.game.config.powerDeck].sort(), ['hanged-man', 'hermit', 'lovers', 'tower']);
  assert.equal(started.play.game.powerDeck.length, 4);

  // Powers off hides the row; an empty deck plays like powers off.
  assert.doesNotMatch(viewShell(act(s, 'menu-set', { key: 'powers', value: 'false' })), /Powers in the deck/);
  for (const id of ['hanged-man', 'lovers', 'tower', 'hermit']) s = act(s, 'menu-set', { key: 'deck', value: id });
  assert.deepEqual(s.menu.settings.deck, []);
  started = act(s, 'menu-start');
  assert.equal(started.play.game.config.powers, false);
});

test('3 and 4 players: presets with teams of 5 start a ring game on the flat board', () => {
  for (const [preset, n] of [['threePlayers', 3], ['fourPlayers', 4]]) {
    let s = act(act(initShell(), 'menu-mode'), 'menu-preset', { value: preset });
    assert.match(viewShell(s), new RegExp(`${n} players`));
    s = act(s, 'menu-start');
    const g = s.play.game;
    assert.equal(g.config.players, n);
    assert.equal(g.config.board.ring, n === 4 ? 16 : 15);
    assert.equal(R.teamSize(g.config), 5);
    const html = viewShell(s);
    assert.match(html, /class="ring-frame"/, 'the ring board, even with the 3D board chosen');
    assert.doesNotMatch(html, /data-board3d/);
    assert.equal((html.match(/class="panel opponent"/g) ?? []).length, n - 1, 'a panel for every opponent');
    const cells = (html.match(/ring-cell/g) ?? []).length;
    assert.equal(cells, R.geometry(g.config).cellCount, 'every cell drawn once');
  }
});

test('ring board: the cells you can move from are tappable, and a move goes through', () => {
  let s = act(act(act(initShell(), 'menu-mode'), 'menu-preset', { value: 'fourPlayers' }), 'menu-start');
  if (interactions(s.play).phase === 'handoff') s = act(s, 'handoff');
  // Draw until a number card with a move comes up.
  for (let i = 0; i < 20; i += 1) {
    const ix = interactions(s.play);
    if (ix.phase === 'move') break;
    if (ix.phase === 'draw') s = act(s, 'draw');
    else if (ix.phase === 'handoff') s = act(s, 'handoff');
    else if (ix.phase === 'draft') s = act(s, 'keep', { index: 0 });
    else s = act(s, 'continue');
  }
  const ix = interactions(s.play);
  assert.equal(ix.phase, 'move');
  const key = ix.tappable[0];
  assert.match(viewShell(s), new RegExp(`data-action="tap" data-key="${key}"`));
  const mover = s.play.game.current;
  s = act(s, 'tap', { key });
  const after = interactions(s.play);
  if (after.options.length) s = act(s, 'option', { value: after.options[0] });
  s = act(s, 'confirm');
  assert.ok(s.play.game.current !== mover || s.play.game.campsite || s.play.game.bonusTurn !== undefined);
});
