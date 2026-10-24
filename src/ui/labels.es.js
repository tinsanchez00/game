// Spanish wording for everything on screen. Same shape as labels.en.js.
// Placeholder copy: the wording needs a native review before release.

import { POWERS } from '../rules/index.js';

const TEAM_NAMES = ['Oro', 'Obsidiana'];

const POWER_INFO = {
  [POWERS.HANGED_MAN]: { name: 'El Colgado', numeral: 'XII' },
  [POWERS.LOVERS]: { name: 'Los Enamorados', numeral: 'VI' },
  [POWERS.DEVIL]: { name: 'El Diablo', numeral: 'XV' },
  [POWERS.TOWER]: { name: 'La Torre', numeral: 'XVI' },
  [POWERS.HERMIT]: { name: 'El Ermitaño', numeral: 'IX' },
};

const OPTION_LABELS = {
  soldier: 'Soldado',
  commander: 'Comandante',
  'commander+escort': 'Comandante + escolta',
};

// One-line summaries of each side's effect, for the side picker (placeholders).
const UPRIGHT_SHORT = {
  [POWERS.HANGED_MAN]: 'una unidad atrás y luego un turno extra',
  [POWERS.LOVERS]: 'una unidad salta hasta su aliado más cercano',
  [POWERS.DEVIL]: 'elimina las unidades junto a las tuyas',
  [POWERS.TOWER]: 'saca una unidad de una torre y luego tu carta',
  [POWERS.HERMIT]: 'muévete sobre un aliado y lo empujas',
};
const UPSIDE_SHORT = {
  [POWERS.HANGED_MAN]: 'una unidad enemiga atrás y luego un turno extra',
  [POWERS.LOVERS]: 'una unidad enemiga salta hasta su aliado más cercano',
  [POWERS.DEVIL]: 'atrae cada unidad una casilla',
  [POWERS.TOWER]: 'destruye todas las unidades de las torres',
  [POWERS.HERMIT]: 'usa un número de tu pila de descarte',
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const TEXT = {
  pageTitle: 'Juego de tablero (título provisional)',
  language: 'Idioma',
  testMode: 'Modo prueba · ambos jugadores en este teléfono',
  menu: 'Menú',
  fullscreen: 'Pantalla completa, horizontal',
  boardLabel: 'Mesa de juego',
  board: 'Tablero',
  newGame: 'Nueva partida',
  restartPrompt: '¿Reiniciar?',
  yes: 'Sí',
  no: 'No',
  home: 'Inicio',
  ascended: (n, total) => `Ascendidas ${n}/${total}`,
  left: (n) => `${n} restantes`,
  drawn: 'Robada',
  drawCard: 'Robar una carta',
  campCard: 'Desde descarte',
  discard: 'Descarte',
  discardEmpty: 'vacío',
  jokerShort: 'C',
  jokerCard: 'COMODÍN',
  discardLabel: (team, cards) => `Pila de descarte de ${team}: ${cards || 'vacía'}`,
  power: 'Poder',
  noPower: 'Sin poder',
  lane: (team) => `Carril de ${team}`,
  middleLane: 'Carril central',
  cellLabel: (where, tower, campsite, what) => `${where}${tower ? ', torre' : ''}${campsite ? ', campamento' : ''}: ${what}`,
  emptyCell: 'vacía',
  unitName: { soldier: 'soldado', commander: 'comandante' },
  joker: 'Comodín',
  move: 'Mover',
  cancel: 'Cancelar',
  continue: 'Continuar',
  draft: 'Elige un poder',
  keep: (name) => `Guardar ${name}`,
  usePower: (power) => `Usar ${power}`,
  usePowerInstead: (power) => `Usar ${power} en su lugar`,
  unleash: 'Desatar',
  stepForward: 'Avanzar',
  // Picking a side for the held power (placeholders).
  side: {
    heading: (power) => `Usar ${power}`,
    upright: 'Normal',
    uprightNote: (power) => `Gratis · ${UPRIGHT_SHORT[power] ?? ''}`.replace(/ · $/, ''),
    upsideDown: 'Invertida',
    upsideNote: (cost, power) => `${plural(cost, 'estrella', 'estrellas')} · ${UPSIDE_SHORT[power] ?? ''}`,
    back: 'Atrás',
  },
  stepCard: 'Avanzar',
  stars: (team, n) => `${team}: ${plural(n, 'estrella', 'estrellas')}`,

  status: {
    handoff: (team) => `Turno de ${team}: pasa el teléfono`,
    startTurn: (team) => `Empieza el turno de ${team}`,
    draw: (team) => `Turno de ${team} · toca tu mazo para robar`,
    // step: null (a normal card), 'back' / 'backEnemy' (The Hanged Man), 'campsite', 'hermit'
    move: (n, step) => ({
      back: `El Colgado · mueve una unidad ${n} atrás`,
      backEnemy: `El Colgado · mueve una unidad enemiga ${n} atrás`,
      campsite: `Campamento · mueve esa unidad ${n} otra vez`,
      hermit: `El Ermitaño · mueve una unidad ${n} sobre un aliado`,
    })[step] ?? `Mueve una unidad ${n} hacia delante`,
    pickMove: 'Toca la casilla iluminada para moverte allí',
    side: (power) => `Usa ${power} normal o invertida`,
    stuck: (n, step) => ({
      back: `Ningún movimiento hacia atrás válido con ${n}`,
      backEnemy: `Ninguna unidad enemiga puede moverse ${n} atrás`,
      campsite: `Campamento · esa unidad no puede moverse ${n}`,
    })[step] ?? `Ningún movimiento válido con ${n}`,
    jokerPass: (step) => (step === 'campsite' ? 'Campamento · comodín, sin movimiento' : 'Comodín · sin movimiento este turno'),
    joker: 'Comodín · elige un poder o usa el tuyo',
    draft: (step) => ({
      back: 'El Colgado · tu comodín elige un poder',
      backEnemy: 'El Colgado · tu comodín elige un poder',
      campsite: 'Campamento · tu comodín elige un poder',
    })[step] ?? 'Guarda un poder',
    loversPick: 'Los Enamorados · elige una unidad para que salte hasta su aliado más cercano',
    loversPickEnemy: 'Los Enamorados · elige una unidad enemiga para que salte hasta su aliado más cercano',
    loversTarget: 'Los Enamorados · toca el aliado al que saltar',
    towerPick: 'La Torre · elige una unidad en una torre para avanzar',
    towerConfirm: 'La Torre · avanza y luego juega tu carta',
    devilPick: 'El Diablo · elige una de tus unidades',
    devilPickAny: 'El Diablo · elige cualquier unidad del carril central',
    hermitPile: 'El Ermitaño · elige un número de tu pila de descarte',
    devilConfirm: 'Las unidades marcadas morirán',
    chooseUnit: '¿Qué unidad?',
    won: (team) => `¡${team} asciende!`,
  },

  event: {
    lost: (team, n) => `${team} perdió ${plural(n, 'unidad', 'unidades')}`,
    ascended: (team, n) => `${team} ascendió ${plural(n, 'unidad', 'unidades')}`,
    turnLost: (team) => `${team} perdió el turno`,
    noMove: (team) => `${team} no pudo moverse`,
    drafted: (team, power) => `${team} eligió ${power}`,
    played: (team, power) => `${team} jugó ${power}`,
    flipped: (team, power) => `${team} jugó ${power} invertida`,
    extraTurn: (team) => `${team} tiene un turno extra`,
  },
};

// Start and game-mode screens (placeholder copy).
const MENU_DECK = { 'hanged-man': 'El Colgado', lovers: 'Los Enamorados', devil: 'El Diablo', tower: 'La Torre', hermit: 'El Ermitaño' };

const MENU = {
  gameName: '[Nombre del juego]',
  tagline: 'Una carrera inspirada en el Juego Real de Ur',
  quick: 'Partida rápida',
  mode: 'Modo de juego',
  continue: 'Continuar la última partida',
  quickHint: 'Partida rápida: reglas estándar, 6 unidades cada uno',
  // Placeholder wording: the board style switch at the bottom of the start screen.
  boardSwitch: (board) => (board === 'flat' ? 'Tablero plano · cambiar a 3D' : 'Tablero 3D · cambiar a plano'),
  // Placeholder wording: how the phone is used.
  seatLabel: 'Cómo juegas',
  seat: { '3d': 'Pasar el teléfono', table: 'Teléfono en la mesa' },
  // Names of the languages, each written in its own language.
  languageNames: { en: 'English', es: 'Español' },
  back: 'Atrás',
  start: 'Empezar',
  customize: 'Personalizar',
  changed: 'cambiado',
  changedMark: 'cambiado',
  preset: {
    standard: { name: 'Estándar' },
    short: { name: 'Partida corta' },
    noPowers: { name: 'Sin poderes' },
    twoJokers: { name: 'Dos comodines' },
    urTowers: { name: 'Torres de Ur' },
  },
  field: {
    units: 'Unidades cada uno',
    powers: 'Poderes',
    deck: 'Poderes en el mazo',
    timing: 'Usar un poder',
    jokers: 'Comodines en cada mazo',
    commanderLock: 'Bloqueo del comandante',
    escort: 'Escolta',
    towersProtect: 'Las torres protegen',
    towerExtraTurn: 'Las torres dan otro turno',
    exactAscend: 'Ascenso exacto',
  },
  value: {
    timing: { afterDraw: 'Después de robar', beforeDraw: 'Antes de robar' },
    deck: MENU_DECK,
  },
  /** One line describing a settings object. */
  summary: (s) => {
    const n = s.deck.length;
    const missing = Object.entries(MENU_DECK).filter(([id]) => !s.deck.includes(id)).map(([, name]) => `sin ${name}`);
    const powers = !s.powers || n === 0 ? 'sin poderes' : n === 5 ? 'los cinco poderes' : `${n} poder${n === 1 ? '' : 'es'}: ${missing.join(', ')}`;
    const parts = [`${s.units} unidades cada uno`, powers, `${plural(s.jokers, 'comodín', 'comodines')}`];
    if (s.powers && s.timing !== 'afterDraw') parts.push('poderes antes de robar');
    if (s.towerExtraTurn) parts.push('las torres dan otro turno');
    if (!s.commanderLock) parts.push('sin bloqueo del comandante');
    if (!s.escort) parts.push('sin escolta');
    if (!s.towersProtect) parts.push('las torres no protegen');
    if (!s.exactAscend) parts.push('cualquier carta puede ascender');
    return parts.join(' · ');
  },
};

export const ES = { TEAM_NAMES, POWER_INFO, OPTION_LABELS, TEXT, MENU };
