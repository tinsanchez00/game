import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/rules/index.js';
import { initShell, updateShell, viewShell } from '../src/ui/shell.js';
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
  const early = R.makeConfig(toConfig(presetSettings('earlierPowers'))).rules;
  assert.equal(early.loversLine, false);
  assert.equal(early.hangedTurn, false);
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
  s = act(s, 'menu-set', { key: 'lovers', value: 'pairing' });
  s = act(s, 'menu-set', { key: 'escort', value: 'false' });
  assert.deepEqual(changedKeys('short', s.menu.settings), ['lovers', 'escort']);
  const html = viewShell(s);
  assert.match(html, /Short game · changed/);
  assert.match(html, /the Lovers: Pairing/);
  s = act(s, 'menu-start');
  assert.equal(s.screen, 'game');
  const c = s.play.game.config;
  assert.equal(c.soldiers, 4);
  assert.equal(c.rules.loversLine, false);
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
