import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EN } from '../src/ui/labels.en.js';
import { ES } from '../src/ui/labels.es.js';
import { MENU, TEXT, languageFor, setLanguage } from '../src/ui/labels.js';
import { initShell, updateShell, viewShell } from '../src/ui/shell.js';

// The keys of a wording set, with the kind of each value: both languages must match.
function shape(obj, path = '') {
  return Object.keys(obj).sort().flatMap((k) => {
    const v = obj[k];
    const p = path ? `${path}.${k}` : k;
    if (v && typeof v === 'object') return shape(v, p);
    return [`${p}:${typeof v}`];
  });
}

test('Spanish has every key English has, with the same kinds of values', () => {
  assert.deepEqual(shape(ES), shape(EN));
});

test('setLanguage switches the wording and falls back to English', () => {
  try {
    setLanguage('es');
    assert.equal(TEXT.menu, 'Menú');
    assert.equal(TEXT.keep('X'), 'Guardar X');
    setLanguage('fr');
    assert.equal(TEXT.menu, 'Menu');
  } finally {
    setLanguage('en');
  }
});

test('the Menu language choice is kept in the shell and shown on the start screen', () => {
  try {
    let s = initShell();
    assert.equal(s.lang, 'en');
    assert.match(viewShell(s), /data-action="menu-lang" data-value="es"/);
    s = updateShell(s, { type: 'menu-lang', value: 'es' });
    assert.equal(s.lang, 'es');
    assert.match(viewShell(s), /Partida rápida/);
    assert.match(viewShell(s), /aria-pressed="true" data-action="menu-lang" data-value="es"/);
    assert.equal(updateShell(s, { type: 'menu-lang', value: 'xx' }).lang, 'es', 'unknown codes are ignored');
    assert.equal(initShell(null, '3d', 'es').lang, 'es');
    assert.equal(initShell(null, '3d', 'zz').lang, 'en');
  } finally {
    setLanguage('en');
  }
});

test('without a saved choice, the device language decides (Spanish or English)', () => {
  assert.equal(languageFor(['es-ES', 'en-US']), 'es');
  assert.equal(languageFor(['fr-FR', 'es']), 'es');
  assert.equal(languageFor(['EN-gb']), 'en');
  assert.equal(languageFor(['de-DE']), 'en', 'unsupported languages fall back to English');
  assert.equal(languageFor([]), 'en');
  assert.equal(languageFor([undefined]), 'en');
});

test('the mode screen summary is translated', () => {
  try {
    setLanguage('es');
    const settings = { units: 6, powers: true, deck: ['tower'], timing: 'afterDraw', jokers: 1,
      commanderLock: true, escort: true, towersProtect: true, towerExtraTurn: false, exactAscend: true };
    assert.match(MENU.summary(settings), /^6 unidades cada uno · 1 poder: sin El Colgado/);
  } finally {
    setLanguage('en');
  }
});
