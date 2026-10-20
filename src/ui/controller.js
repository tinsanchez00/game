// Screen logic as a pure model/update pair: update(model, action) -> model.
// No DOM here, so whole games can be driven from tests.
//
// model = { game, ui }
// ui = {
//   viewer,      player whose side is shown at the bottom
//   pick,        current selection (see below) or null
//   joker,       null | 'draft' | 'play' — choice made after drawing a joker
//   confirmNew,  showing the "start a new game?" prompt
//   events,      what the last action did, for the status line
// }

import * as R from '../rules/index.js';

export function initModel(game = R.createGame()) {
  return { game, ui: freshUi(game.current) };
}

function freshUi(viewer, events = []) {
  return { viewer, pick: null, joker: null, confirmNew: false, events };
}

/** Where a unit is: a board cell id, or `home:<player>` / `asc:<player>`. */
export function unitKey(u) {
  if (u.pos === R.HOME) return `home:${u.player}`;
  if (u.pos === R.ASCENDED) return `asc:${u.player}`;
  return R.cellId(u.player, u.pos);
}

// --- phases ---------------------------------------------------------------

export function phaseOf(m) {
  const g = m.game;
  if (g.winner !== null) return 'won';
  if (g.current !== m.ui.viewer) return 'handoff';
  if (g.drawn === null) return 'draw';
  if (R.isNumberCard(g.drawn)) return R.currentMoves(g).length > 0 ? 'move' : 'stuck';
  if (g.hangedDraw || m.ui.joker === 'draft') return 'draft';
  if (m.ui.joker === 'play') return g.held[g.current];
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
    const key = unitKey(R.getUnit(g, move.unit));
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
  return {
    dest: unitKey(R.getUnit(after, move.unit)),
    victims: changedToHome(g, after, moving),
  };
}

// --- power targets ----------------------------------------------------------

/** Distinct-by-type candidates among `ids` at `key`: { soldier?: id, commander?: id }. */
function candidatesAt(g, ids, key) {
  const byType = {};
  for (const id of ids) {
    const u = R.getUnit(g, id);
    if (unitKey(u) === key && !(u.type in byType)) byType[u.type] = id;
  }
  return byType;
}

function uniqueKeys(g, ids) {
  return [...new Set(ids.map((id) => unitKey(R.getUnit(g, id))))];
}

// --- what the screen should offer -------------------------------------------

/**
 * Everything the view needs to draw highlights and controls:
 * { phase, tappable, selected, dest, targets, victims, options, chosen, canConfirm }
 */
export function interactions(m) {
  const g = m.game;
  const phase = phaseOf(m);
  const pick = m.ui.pick;
  const out = {
    phase, tappable: [], selected: null, dest: null, targets: [], victims: [],
    options: [], chosen: null, canConfirm: false,
  };

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
        Object.assign(out, { chosen: chosen.sig, dest: p.dest, victims: p.victims, canConfirm: true });
        out.tappable = [...new Set([...out.tappable, p.dest])];
      }
    }
  }

  if (phase === R.POWERS.LOVERS) {
    const choices = R.heldPowerChoices(g);
    if (pick?.unit) {
      const mine = choices.filter((c) => c.unit === pick.unit);
      out.selected = unitKey(R.getUnit(g, pick.unit));
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

  if (phase === R.POWERS.DEVIL) {
    const ids = R.heldPowerChoices(g).map((c) => c.unit);
    out.tappable = uniqueKeys(g, ids);
    if (pick?.candidates) {
      out.selected = pick.source;
      out.options = Object.keys(pick.candidates);
    }
    if (pick?.unit) {
      const after = R.playHeldPower(g, { unit: pick.unit });
      out.selected = unitKey(R.getUnit(g, pick.unit));
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
  for (const player of R.PLAYERS) {
    const lost = changedToHome(before, after).filter((id) => R.getUnit(after, id).player === player);
    if (lost.length) events.push({ type: 'lost', player, count: lost.length });
    const ascended = after.units.filter(
      (u) => u.player === player && u.pos === R.ASCENDED && R.getUnit(before, u.id).pos !== R.ASCENDED,
    );
    if (ascended.length) events.push({ type: 'ascended', player, count: ascended.length });
  }
  if (before.held[actor] !== after.held[actor] && after.held[actor]) {
    events.push({ type: 'drafted', player: actor, power: after.held[actor] });
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

    case 'continue':
      if (phase !== 'stuck') return m;
      return commit(m, R.playDrawnNumber(g, null), [{ type: 'turnLost', player: g.current }]);

    case 'joker-draft':
      return phase === 'joker' ? ui({ joker: 'draft', pick: null }) : m;

    case 'joker-play': {
      if (phase !== 'joker' || !R.canPlayHeldPower(g)) return m;
      const power = g.held[g.current];
      if (power === R.POWERS.LOVERS || power === R.POWERS.DEVIL) {
        return ui({ joker: 'play', pick: null });
      }
      return commit(m, R.playHeldPower(g, {}), [{ type: 'played', player: g.current, power }]);
    }

    case 'keep':
      if (phase !== 'draft') return m;
      return commit(m, R.playDraft(g, action.index));

    case 'cancel':
      if (phase === R.POWERS.LOVERS || phase === R.POWERS.DEVIL) {
        return m.ui.pick ? ui({ pick: null }) : ui({ joker: null, pick: null });
      }
      return ui({ pick: null });

    case 'option': {
      const sig = action.value;
      if (phase === 'move' && m.ui.pick) return ui({ pick: { ...m.ui.pick, sig } });
      if ((phase === R.POWERS.LOVERS || phase === R.POWERS.DEVIL) && m.ui.pick?.candidates?.[sig]) {
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
      if (phase === R.POWERS.DEVIL) {
        return commit(m, R.playHeldPower(g, { unit: m.ui.pick.unit }), [
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
    const choices = R.heldPowerChoices(g);
    if (m.ui.pick?.unit && ix.targets.includes(key)) {
      const choice = choices.find(
        (c) => c.unit === m.ui.pick.unit && unitKey(R.getUnit(g, c.target)) === key,
      );
      return commit(m, R.playHeldPower(g, choice), [
        { type: 'played', player: g.current, power: R.POWERS.LOVERS },
      ]);
    }
    return pickCandidate(m, key, choices.map((c) => c.unit));
  }

  if (phase === R.POWERS.DEVIL) {
    return pickCandidate(m, key, R.heldPowerChoices(g).map((c) => c.unit));
  }

  return m;
}

function pickCandidate(m, key, ids) {
  const candidates = candidatesAt(m.game, [...new Set(ids)], key);
  const types = Object.keys(candidates);
  let pick = null;
  if (types.length === 1) pick = { unit: candidates[types[0]] };
  if (types.length > 1) pick = { source: key, candidates };
  return { ...m, ui: { ...m.ui, pick } };
}
