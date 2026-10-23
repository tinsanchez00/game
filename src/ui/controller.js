// Screen logic as a pure model/update pair: update(model, action) -> model.
// No DOM here, so whole games can be driven from tests.
//
// model = { game, ui }
// ui = {
//   viewer,      player whose side is shown at the bottom
//   pick,        current selection (see below) or null
//   joker,       null | 'draft' — choice made after drawing a joker
//   using,       true while picking targets for the held power
//   side,        true while choosing upright or upside down for the held power
//   confirmNew,  showing the "start a new game?" prompt
//   menuOpen,    the in-game menu is open (3D layout)
//   events,      what the last action did, for the status line
// }

import * as R from '../rules/index.js';

export function initModel(game = R.createGame()) {
  return { game, ui: freshUi(game.current) };
}

function freshUi(viewer, events = []) {
  return { viewer, pick: null, joker: null, using: false, side: false, confirmNew: false, menuOpen: false, events };
}

/** Where a unit is: a board cell id, or `home:<player>` / `asc:<player>`. */
export function unitKey(state, u) {
  const geo = R.geometry(state.config);
  if (u.pos === R.HOME) return `home:${u.player}`;
  if (u.pos === geo.ascended) return `asc:${u.player}`;
  return geo.cellId(u.player, u.pos);
}

// --- phases ---------------------------------------------------------------

export function phaseOf(m) {
  const g = m.game;
  if (g.winner !== null) return 'won';
  if (g.current !== m.ui.viewer) return 'handoff';
  if (g.lovers?.stage === 'jump') return 'loversJump';
  if (m.ui.side && (R.canUsePower(g) || R.canUsePowerUpsideDown(g))) return 'side';
  if (m.ui.using && R.canUsePower(g)) return g.held[g.current];
  if (g.drawn === null) return 'draw';
  if (R.isNumberCard(g.drawn)) return R.currentMoves(g).length > 0 ? 'move' : 'stuck';
  if (R.mustPassJoker(g)) return 'jokerPass';
  if (m.ui.joker === 'draft' || (!R.canUsePower(g) && !R.canUsePowerUpsideDown(g))) return 'draft';
  return 'joker';
}

// --- number-card moves ------------------------------------------------------

function signature(g, move) {
  const unit = R.getUnit(g, move.unit);
  return move.escort ? `${unit.type}+escort` : unit.type;
}

/** Map of source key -> distinct move options [{ sig, move }]. */
function moveSources(g) {
  const sources = new Map();
  for (const move of R.currentMoves(g)) {
    const key = unitKey(g, R.getUnit(g, move.unit));
    const sig = signature(g, move);
    const list = sources.get(key) ?? [];
    if (!list.some((o) => o.sig === sig)) list.push({ sig, move });
    sources.set(key, list);
  }
  return sources;
}

function changedToHome(before, after, exclude = new Set()) {
  return after.units
    .filter((u) => !exclude.has(u.id) && u.pos === R.HOME)
    .filter((u) => R.getUnit(before, u.id).pos !== R.HOME)
    .map((u) => u.id);
}

function previewMove(g, move) {
  const after = R.applyMove(g, move, g.drawn);
  const moving = new Set([move.unit, move.escort].filter(Boolean));
  const dest = unitKey(after, R.getUnit(after, move.unit));
  // The Hermit: the ally on the landing cell is pushed on; where it ends up.
  let push = null;
  if (g.hermit) {
    const ally = g.units.find((u) => u.player === g.current && !moving.has(u.id) && unitKey(g, u) === dest);
    const to = ally ? unitKey(after, R.getUnit(after, ally.id)) : null;
    if (ally && to !== dest) push = { unit: ally.id, from: dest, to };
  }
  return { dest, victims: changedToHome(g, after, moving), push };
}

// --- power targets ----------------------------------------------------------

/** Distinct-by-type candidates among `ids` at `key`: { soldier?: id, commander?: id }. */
function candidatesAt(g, ids, key) {
  const byType = {};
  for (const id of ids) {
    const u = R.getUnit(g, id);
    if (unitKey(g, u) === key && !(u.type in byType)) byType[u.type] = id;
  }
  return byType;
}

/** Distinct-by-type candidates among `ids`: { soldier?: id, commander?: id }. */
function candidatesOf(g, ids) {
  const byType = {};
  for (const id of ids) {
    const u = R.getUnit(g, id);
    if (!(u.type in byType)) byType[u.type] = id;
  }
  return byType;
}

function uniqueKeys(g, ids) {
  return [...new Set(ids.map((id) => unitKey(g, R.getUnit(g, id))))];
}

/** Power uses that name a unit (Lovers, Devil); empty when it has no target. */
function targetedUses(g) {
  return R.powerUseChoices(g).filter((c) => c.unit);
}

// --- "line" Lovers jumps ------------------------------------------------------

/** Distinct jumps: one per source cell and unit type, { unit, pos, from, to } (pos: path position; from/to: cell keys). */
function jumpOptions(g) {
  const out = [];
  for (const j of R.loversJumps(g)) {
    const u = R.getUnit(g, j.unit);
    const from = unitKey(g, u);
    const to = unitKey(g, { player: u.player, pos: j.to });
    if (!out.some((o) => o.from === from && R.getUnit(g, o.unit).type === u.type)) out.push({ unit: j.unit, pos: j.to, from, to });
  }
  return out;
}

/** The jump to make: the picked unit's, or the only one there is. */
function chosenJump(m) {
  const jumps = jumpOptions(m.game);
  if (m.ui.pick?.unit) return jumps.find((j) => j.unit === m.ui.pick.unit) ?? null;
  return jumps.length === 1 ? jumps[0] : null;
}

// --- what the screen should offer -------------------------------------------

/**
 * Everything the view needs to draw highlights and controls:
 * { phase, tappable, selected, dest, targets, victims, options, chosen, canConfirm,
 *   canUsePower, canUpright, canUpsideDown, cost, power, lines }
 * canUsePower: the held power can be tapped (upright and/or upside down);
 * canUpright / canUpsideDown: which sides can be used now; cost: the
 * upside-down star cost.
 * lines: [{ from, to, on }] cell keys of the Lovers jumps on offer (on: the chosen one).
 */
export function interactions(m) {
  const g = m.game;
  const phase = phaseOf(m);
  const pick = m.ui.pick;
  const out = {
    phase, tappable: [], selected: null, dest: null, targets: [], victims: [],
    options: [], chosen: null, canConfirm: false, lines: [], push: null,
    canUpright: R.canUsePower(g),
    canUpsideDown: R.canUsePowerUpsideDown(g),
    canUsePower: false,
    power: g.held[g.current],
    cost: R.upsideDownCost(g.held[g.current]),
  };
  out.canUsePower = !m.ui.using && !m.ui.side && (out.canUpright || out.canUpsideDown)
    && phase !== 'won' && phase !== 'handoff';

  if (phase === 'move') {
    const sources = moveSources(g);
    out.tappable = [...sources.keys()];
    if (pick && sources.has(pick.source)) {
      const opts = sources.get(pick.source);
      out.selected = pick.source;
      if (opts.length > 1) out.options = opts.map((o) => o.sig);
      const chosen = opts.find((o) => o.sig === pick.sig);
      if (chosen) {
        const p = previewMove(g, chosen.move);
        Object.assign(out, { chosen: chosen.sig, dest: p.dest, victims: p.victims, push: p.push, canConfirm: true });
        out.tappable = [...new Set([...out.tappable, p.dest])];
      }
    }
  }

  if (phase === R.POWERS.LOVERS) {
    const choices = targetedUses(g);
    if (pick?.unit) {
      const mine = choices.filter((c) => c.unit === pick.unit);
      out.selected = unitKey(g, R.getUnit(g, pick.unit));
      out.targets = uniqueKeys(g, mine.map((c) => c.target));
      out.tappable = [...out.targets, ...uniqueKeys(g, choices.map((c) => c.unit))];
    } else {
      out.tappable = uniqueKeys(g, choices.map((c) => c.unit));
      if (pick?.candidates) {
        out.selected = pick.source;
        out.options = Object.keys(pick.candidates);
      }
    }
  }

  if (phase === 'loversJump') {
    const jumps = jumpOptions(g);
    const chosen = chosenJump(m);
    const isChosen = (j) => chosen !== null && j.unit === chosen.unit;
    out.lines = jumps.map((j) => ({ from: j.from, to: j.to, on: isChosen(j) }));
    if (chosen) {
      Object.assign(out, { selected: chosen.from, dest: chosen.to, canConfirm: true });
    } else if (pick?.candidates) {
      out.selected = pick.source;
      out.options = Object.keys(pick.candidates);
    }
    out.tappable = [...new Set(jumps.flatMap((j) => (isChosen(j) ? [j.to] : [j.from, j.to])))];
  }

  if (phase === R.POWERS.DEVIL) {
    const ids = targetedUses(g).map((c) => c.unit);
    out.tappable = uniqueKeys(g, ids);
    if (pick?.candidates) {
      out.selected = pick.source;
      out.options = Object.keys(pick.candidates);
    }
    if (pick?.unit) {
      const after = R.usePower(g, { unit: pick.unit });
      out.selected = unitKey(g, R.getUnit(g, pick.unit));
      out.victims = changedToHome(g, after);
      out.chosen = R.getUnit(g, pick.unit).type;
      out.canConfirm = true;
    }
  }

  return out;
}

// --- events (what just happened) ----------------------------------------------

function describe(before, after, actor) {
  const events = [];
  const asc = R.geometry(after.config).ascended;
  for (const player of R.PLAYERS) {
    const lost = changedToHome(before, after).filter((id) => R.getUnit(after, id).player === player);
    if (lost.length) events.push({ type: 'lost', player, count: lost.length });
    const ascended = after.units.filter(
      (u) => u.player === player && u.pos === asc && R.getUnit(before, u.id).pos !== asc,
    );
    if (ascended.length) events.push({ type: 'ascended', player, count: ascended.length });
  }
  if (before.held[actor] !== after.held[actor] && after.held[actor]) {
    events.push({ type: 'drafted', player: actor, power: after.held[actor] });
  }
  // The same player starts a new turn (Hanged Man, or the tower extra-turn rule).
  const turnStart = (s) => s.drawn === null && !s.hanged && !s.campsite && !s.lovers && !s.hermit && !s.upsideDown;
  if (after.winner === null && after.current === actor && turnStart(after) && !turnStart(before)) {
    events.push({ type: 'extraTurn', player: actor });
  }
  return events;
}

function commit(m, next, extraEvents = []) {
  const events = [...extraEvents, ...describe(m.game, next, m.game.current)];
  return { game: next, ui: freshUi(m.ui.viewer, events) };
}

// --- update -----------------------------------------------------------------------

export function update(m, action) {
  const g = m.game;
  const phase = phaseOf(m);
  const ix = interactions(m);
  const ui = (patch) => ({ ...m, ui: { ...m.ui, ...patch } });

  switch (action.type) {
    case 'menu':
      return ui({ menuOpen: !m.ui.menuOpen, confirmNew: false });
    case 'new':
      return ui({ confirmNew: true });
    case 'new-cancel':
      return ui({ confirmNew: false });
    case 'new-confirm':
      return initModel(action.game ?? R.createGame());

    case 'handoff':
      return phase === 'handoff' ? { game: g, ui: freshUi(g.current) } : m;

    case 'draw':
      return phase === 'draw' ? { game: R.drawCard(g), ui: freshUi(m.ui.viewer) } : m;

    case 'continue': {
      // Only a turn's own card loses the turn; a Hanged Man, campsite or Lovers card just doesn't move.
      const midCard = g.hanged || g.campsite || g.lovers || g.hermit || g.upsideDown?.stage === 'step';
      const event = { type: midCard ? 'noMove' : 'turnLost', player: g.current };
      if (phase === 'jokerPass') return commit(m, R.passJoker(g), [event]);
      if (phase !== 'stuck') return m;
      return commit(m, R.playDrawnNumber(g, null), [event]);
    }

    case 'joker-draft':
      return phase === 'joker' ? ui({ joker: 'draft', pick: null }) : m;

    case 'use-power':
      if (!ix.canUsePower) return m;
      // A power that can go upside down: pick a side first.
      if (ix.canUpsideDown) return ui({ side: true, pick: null });
      return useUpright(m);

    case 'side-upright':
      return phase === 'side' && ix.canUpright ? useUpright({ ...m, ui: { ...m.ui, side: false } }) : m;

    case 'side-upside': {
      if (phase !== 'side' || !ix.canUpsideDown) return m;
      const power = g.held[g.current];
      return commit(m, R.usePowerUpsideDown(g), [{ type: 'flipped', player: g.current, power }]);
    }

    case 'stay':
      return phase === 'loversJump' ? commit(m, R.playLoversJump(g, null)) : m;

    case 'keep':
      if (phase !== 'draft') return m;
      return commit(m, R.playDraft(g, action.index));

    case 'cancel':
      if (phase === 'side') return ui({ side: false, pick: null });
      if (phase === R.POWERS.LOVERS || phase === R.POWERS.DEVIL) {
        return m.ui.pick ? ui({ pick: null }) : ui({ using: false, pick: null });
      }
      return ui({ pick: null });

    case 'option': {
      const sig = action.value;
      if (phase === 'move' && m.ui.pick) return ui({ pick: { ...m.ui.pick, sig } });
      if ((phase === R.POWERS.LOVERS || phase === R.POWERS.DEVIL || phase === 'loversJump') && m.ui.pick?.candidates?.[sig]) {
        return ui({ pick: { unit: m.ui.pick.candidates[sig] } });
      }
      return m;
    }

    case 'confirm':
      if (!ix.canConfirm) return m;
      if (phase === 'move') {
        const opt = moveSources(g).get(m.ui.pick.source).find((o) => o.sig === m.ui.pick.sig);
        return commit(m, R.playDrawnNumber(g, opt.move));
      }
      if (phase === 'loversJump') {
        const j = chosenJump(m);
        return commit(m, R.playLoversJump(g, { unit: j.unit, to: j.pos }), [{ type: 'jumped', player: g.current }]);
      }
      if (phase === R.POWERS.DEVIL) {
        return commit(m, R.usePower(g, { unit: m.ui.pick.unit }), [
          { type: 'played', player: g.current, power: R.POWERS.DEVIL },
        ]);
      }
      return m;

    case 'tap':
      return tap(m, action.key, phase, ix);

    default:
      return m;
  }
}

/** Uses the held power upright: pick its targets, or play it at once. */
function useUpright(m) {
  const g = m.game;
  const power = g.held[g.current];
  if (targetedUses(g).length > 0) return { ...m, ui: { ...m.ui, using: true, side: false, pick: null, joker: null } };
  return commit(m, R.usePower(g, {}), [{ type: 'played', player: g.current, power }]);
}

function tap(m, key, phase, ix) {
  const g = m.game;
  const setPick = (pick) => ({ ...m, ui: { ...m.ui, pick } });

  if (phase === 'move') {
    if (ix.canConfirm && key === ix.dest) return update(m, { type: 'confirm' });
    const opts = moveSources(g).get(key);
    if (!opts) return setPick(null);
    return setPick({ source: key, sig: opts.length === 1 ? opts[0].sig : null });
  }

  if (phase === R.POWERS.LOVERS) {
    const choices = targetedUses(g);
    if (m.ui.pick?.unit && ix.targets.includes(key)) {
      const choice = choices.find(
        (c) => c.unit === m.ui.pick.unit && unitKey(g, R.getUnit(g, c.target)) === key,
      );
      return commit(m, R.usePower(g, choice), [
        { type: 'played', player: g.current, power: R.POWERS.LOVERS },
      ]);
    }
    return pickCandidate(m, key, choices.map((c) => c.unit));
  }

  if (phase === R.POWERS.DEVIL) {
    return pickCandidate(m, key, targetedUses(g).map((c) => c.unit));
  }

  if (phase === 'loversJump') {
    if (ix.canConfirm && key === ix.dest) return update(m, { type: 'confirm' });
    const jumps = jumpOptions(g);
    // A unit's own cell first; else the ally's cell it would jump to.
    const fromHere = jumps.filter((j) => j.from === key);
    const ids = (fromHere.length ? fromHere : jumps.filter((j) => j.to === key)).map((j) => j.unit);
    return ids.length ? pickCandidate(m, key, ids, { byUnit: false }) : setPick(null);
  }

  return m;
}

function pickCandidate(m, key, ids, { byUnit = true } = {}) {
  // byUnit false: `key` may be the cell the units would reach rather than the one they stand on.
  const candidates = byUnit ? candidatesAt(m.game, [...new Set(ids)], key) : candidatesOf(m.game, [...new Set(ids)]);
  const types = Object.keys(candidates);
  let pick = null;
  if (types.length === 1) pick = { unit: candidates[types[0]] };
  if (types.length > 1) pick = { source: key, candidates };
  return { ...m, ui: { ...m.ui, pick } };
}
