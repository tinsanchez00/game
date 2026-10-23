// Plays one game through the real rules engine with two bots and records
// what happened.
//
// Bots answer either act(state) (sim/powerbot.js: every decision, powers
// included) or choose(state) (sim/bot.js: number-card moves, powers off).

import {
  CARD_IDS, HOME, canUsePower, canUsePowerUpsideDown, createGame, currentMoves, drawCard, geometry,
  isNumberCard, mustPassJoker, passJoker, playDraft, playDrawnNumber, playLoversJump, teamSize, usePower,
  usePowerUpsideDown,
} from '../src/rules/index.js';

function progress(state, p, A) {
  let s = 0;
  for (const u of state.units) if (u.player === p) s += u.pos === A ? A : u.pos;
  return s;
}

function blankPowerStats() {
  return Object.fromEntries(CARD_IDS.map((id) => [id, {
    drafted: 0, used: 0, noEffect: 0, enemyKilled: 0, ownKilled: 0,
    enemyProgressLost: 0, ownProgressLost: 0, swing: 0, usedBy: [0, 0],
    heldTurns: 0, // turns started holding this card
    discarded: 0, // held, then replaced unused by a different card at a Joker draft
    jumped: 0, // "line" Lovers uses that ended with a jump
    upsideDown: 0, // uses upside down (also counted in used)
  }]));
}

/** Units of each team sent home between two states, and the progress they had. */
function losses(before, after) {
  const out = [{ units: 0, progress: 0 }, { units: 0, progress: 0 }];
  after.units.forEach((u, i) => {
    const b = before.units[i];
    if (u.pos === HOME && b.pos !== HOME) {
      out[u.player].units += 1;
      out[u.player].progress += b.pos;
    }
  });
  return out;
}

function changed(before, after) {
  return after.units.some((u, i) => u.pos !== before.units[i].pos);
}

/**
 * @returns a record of the game (see fields below).
 */
export function playGame({ config, seed, bots, maxTurns = 5000, measureChoices = false }) {
  let s = createGame({ seed, config });
  const A = geometry(s.config).ascended;
  const size = teamSize(s.config);
  const first = s.current;

  const turnsBy = [0, 0];
  const captured = [0, 0]; // enemy units sent home by each player's moves
  const captureMoves = [0, 0];
  let multiCaptures = 0;
  const wasted = [0, 0]; // turns without a move or a power
  const jokers = [0, 0];
  const extraTurns = [0, 0];
  const powerKills = [0, 0]; // units each player lost to powers (either side's)
  const powersUsed = [0, 0];
  const upsideDownUsed = [0, 0];
  const starsSpent = [0, 0];
  const commanderOut = [null, null];
  const powers = blankPowerStats();
  const campsiteCards = [0, 0]; // cards picked from the discard pile by campsite landings
  const diffs = [];
  let turns = 0;
  let pending = null; // { id, before } for a free power (Hanged Man, "line" Lovers) until its turn resolves

  // How much choice each turn offered (act bots only): no choice (one option
  // at most), one sensible option, or a real choice between sensible options.
  const choiceTurns = { none: [0, 0], one: [0, 0], real: [0, 0] };
  let turnChoice = null; // { p, options, sensible } of the turn in progress
  const closeTurn = () => {
    if (!turnChoice) return;
    const kind = turnChoice.options <= 1 ? 'none' : turnChoice.sensible <= 1 ? 'one' : 'real';
    choiceTurns[kind][turnChoice.p] += 1;
    turnChoice = null;
  };
  const act = (p, state) => {
    if (!bots[p].act) return null;
    const a = bots[p].act(state);
    const c = bots[p].lastChoice;
    if (measureChoices && c && turnChoice) {
      turnChoice.options = Math.max(turnChoice.options, c.options);
      turnChoice.sensible = Math.max(turnChoice.sensible, c.sensible);
    }
    return a;
  };

  const recordMove = (p, before, after) => {
    const lost = losses(before, after);
    const sentHome = lost[1 - p].units;
    if (sentHome > 0) {
      captured[p] += sentHome;
      captureMoves[p] += 1;
      if (sentHome > 1) multiCaptures += 1;
    }
    after.units.forEach((u, i) => {
      if (u.player === p && u.type === 'commander' && commanderOut[p] === null
        && before.units[i].pos === HOME && u.pos !== HOME) commanderOut[p] = turns;
    });
  };

  const recordPowerEffect = (p, id, before, after) => {
    const st = powers[id];
    const lost = losses(before, after);
    st.enemyKilled += lost[1 - p].units;
    st.ownKilled += lost[p].units;
    st.enemyProgressLost += lost[1 - p].progress;
    st.ownProgressLost += lost[p].progress;
    powerKills[0] += lost[0].units;
    powerKills[1] += lost[1].units;
    const lead = (x) => progress(x, p, A) - progress(x, 1 - p, A);
    st.swing += lead(after) - lead(before);
    if (!changed(before, after)) st.noEffect += 1;
  };

  while (s.winner === null && turns < maxTurns) {
    const p = s.current;
    const startOfTurn = s.drawn === null && !s.hanged && !s.campsite && !s.lovers && !s.upsideDown;
    const canPower = canUsePower(s) || canUsePowerUpsideDown(s);
    if (startOfTurn) {
      turns += 1;
      turnsBy[p] += 1;
      closeTurn();
      if (measureChoices && bots[p].act) turnChoice = { p, options: 0, sensible: 0 };
      if (s.held[p]) powers[s.held[p]].heldTurns += 1;
    }

    let a = null;
    if (s.lovers?.stage === 'jump') {
      a = act(p, s);
    } else if (s.drawn === null) {
      if (canPower) a = act(p, s);
      if (!a || a.kind === 'draw') {
        s = drawCard(s);
        if (!isNumberCard(s.drawn)) jokers[p] += 1;
        continue;
      }
    } else if (isNumberCard(s.drawn)) {
      if (currentMoves(s).length === 0 && !canPower) {
        a = { kind: 'pass' };
      } else if (bots[p].act) {
        a = act(p, s);
      } else {
        a = { kind: 'move', move: bots[p].choose(s) };
      }
    } else {
      if (mustPassJoker(s) && !canPower) a = { kind: 'passJoker' };
      else a = act(p, s);
    }

    const before = s;
    if (a.kind === 'power') {
      const id = s.held[p];
      powers[id].used += 1;
      powers[id].usedBy[p] += 1;
      powersUsed[p] += 1;
      s = usePower(s, a.args);
      if (before.drawn === null && s.drawn !== null && !isNumberCard(s.drawn)) jokers[p] += 1;
      if (id === 'hanged-man' || (id === 'lovers' && s.config.rules.loversLine)) pending = { id, before };
      else recordPowerEffect(p, id, before, s);
    } else if (a.kind === 'upsideDown') {
      const id = s.held[p];
      powers[id].used += 1;
      powers[id].upsideDown += 1;
      powers[id].usedBy[p] += 1;
      powersUsed[p] += 1;
      upsideDownUsed[p] += 1;
      s = usePowerUpsideDown(s);
      starsSpent[p] += before.stars[p] - s.stars[p];
      if (before.drawn === null && s.drawn !== null && s.upsideDown?.stage === 'card' && !isNumberCard(s.drawn)) jokers[p] += 1;
    } else if (a.kind === 'move') {
      s = playDrawnNumber(s, a.move);
      recordMove(p, before, s);
    } else if (a.kind === 'loversJump') {
      if (a.jump) powers.lovers.jumped += 1;
      s = playLoversJump(s, a.jump);
    } else if (a.kind === 'pass') {
      if (!before.hanged && !before.campsite && !before.lovers && !before.upsideDown) wasted[p] += 1;
      s = playDrawnNumber(s, null);
    } else if (a.kind === 'draft') {
      const kept = s.powerDeck[a.index];
      powers[kept].drafted += 1;
      const old = s.held[p];
      if (old && old !== kept) powers[old].discarded += 1;
      s = playDraft(s, a.index);
    } else if (a.kind === 'passJoker') {
      if (!before.hanged && !before.campsite && !before.lovers && !before.upsideDown) wasted[p] += 1;
      s = passJoker(s);
    } else {
      throw new Error(`playGame: unknown action ${a.kind}`);
    }

    if (s.campsite && s.campsite !== before.campsite) campsiteCards[p] += 1;
    // Before draw, the turn's card is drawn once an upside-down step has resolved.
    if (before.upsideDown?.stage === 'step' && before.upsideDown.card === null
      && s.upsideDown?.stage === 'card' && !isNumberCard(s.drawn)) jokers[p] += 1;

    // A free power use is measured once its turn has been resolved.
    if (pending && !s.hanged && !s.lovers) {
      recordPowerEffect(p, pending.id, pending.before, s);
      pending = null;
    }
    if (s.winner === null && s.current === p && s.drawn === null && !s.hanged && !s.campsite && !s.lovers) extraTurns[p] += 1;
    if (s.drawn === null) diffs.push(progress(s, 0, A) - progress(s, 1, A));
  }

  closeTurn();
  const winner = s.winner;
  const record = {
    choiceTurns: measureChoices ? choiceTurns : null,
    seed, first, winner, finished: winner !== null, turns, turnsBy,
    captured, captureMoves, multiCaptures, wasted, jokers, extraTurns,
    commanderOut, powerKills, powersUsed, powers, campsiteCards, teamSize: size,
    upsideDownUsed, starsSpent, starsGained: [0, 1].map((p) => s.stars[p] + starsSpent[p]),
  };
  if (winner === null) return record;

  const loser = 1 - winner;
  const loserUnits = s.units.filter((u) => u.player === loser);
  record.loserAscended = loserUnits.filter((u) => u.pos === A).length;
  record.loserLeft = size - record.loserAscended;
  record.loserHome = loserUnits.filter((u) => u.pos === HOME).length;
  record.loserProgress = progress(s, loser, A) / (size * A);

  const sign = winner === 0 ? 1 : -1;
  let leadChanges = 0;
  let lastLeader = 0;
  let maxDeficit = 0;
  for (const d of diffs) {
    const leader = Math.sign(d);
    if (leader !== 0) {
      if (lastLeader !== 0 && leader !== lastLeader) leadChanges += 1;
      lastLeader = leader;
    }
    maxDeficit = Math.max(maxDeficit, -sign * d);
  }
  const leaderAt = (f) => Math.sign(diffs[Math.min(diffs.length - 1, Math.floor(diffs.length * f))]);
  record.leadChanges = leadChanges;
  record.maxDeficit = maxDeficit;
  record.leaderAtHalfWon = leaderAt(0.5) === 0 ? null : leaderAt(0.5) === sign;
  record.leaderAt75Won = leaderAt(0.75) === 0 ? null : leaderAt(0.75) === sign;
  record.winnerUsedMore = powersUsed[winner] === powersUsed[loser] ? null : powersUsed[winner] > powersUsed[loser];
  return record;
}
