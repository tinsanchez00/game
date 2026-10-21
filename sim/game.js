// Plays one game through the real rules engine with two bots and records
// what happened.
//
// Bots answer either act(state) (sim/powerbot.js: every decision, powers
// included) or choose(state) (sim/bot.js: number-card moves, powers off).

import {
  HOME, POWER_IDS, canUsePower, createGame, currentMoves, drawCard, geometry,
  isNumberCard, mustPassJoker, passJoker, playDraft, playDrawnNumber, teamSize, usePower,
} from '../src/rules/index.js';

function progress(state, p, A) {
  let s = 0;
  for (const u of state.units) if (u.player === p) s += u.pos === A ? A : u.pos;
  return s;
}

function blankPowerStats() {
  return Object.fromEntries(POWER_IDS.map((id) => [id, {
    drafted: 0, used: 0, noEffect: 0, enemyKilled: 0, ownKilled: 0,
    enemyProgressLost: 0, ownProgressLost: 0, swing: 0, usedBy: [0, 0],
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
export function playGame({ config, seed, bots, maxTurns = 5000 }) {
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
  const commanderOut = [null, null];
  const powers = blankPowerStats();
  const diffs = [];
  let turns = 0;
  let hangedStart = null; // state before a Hanged Man use, until its move resolves

  const act = (p, state) => (bots[p].act ? bots[p].act(state) : null);

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
    const startOfTurn = s.drawn === null && !s.hangedDraw;
    if (startOfTurn) {
      turns += 1;
      turnsBy[p] += 1;
    }

    let a = null;
    if (s.drawn === null) {
      if (canUsePower(s)) a = act(p, s);
      if (!a || a.kind === 'draw') {
        s = drawCard(s);
        if (!isNumberCard(s.drawn)) jokers[p] += 1;
        continue;
      }
    } else if (isNumberCard(s.drawn)) {
      if (currentMoves(s).length === 0 && !canUsePower(s)) {
        a = { kind: 'pass' };
      } else if (bots[p].act) {
        a = act(p, s);
      } else {
        a = { kind: 'move', move: bots[p].choose(s) };
      }
    } else {
      if (mustPassJoker(s) && !canUsePower(s)) a = { kind: 'passJoker' };
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
      if (id === 'hanged-man') hangedStart = before;
      else recordPowerEffect(p, id, before, s);
    } else if (a.kind === 'move') {
      s = playDrawnNumber(s, a.move);
      recordMove(p, before, s);
    } else if (a.kind === 'pass') {
      if (!before.hangedDraw) wasted[p] += 1;
      s = playDrawnNumber(s, null);
    } else if (a.kind === 'draft') {
      const kept = s.powerDeck[a.index];
      powers[kept].drafted += 1;
      s = playDraft(s, a.index);
    } else if (a.kind === 'passJoker') {
      if (!before.hangedDraw) wasted[p] += 1;
      s = passJoker(s);
    } else {
      throw new Error(`playGame: unknown action ${a.kind}`);
    }

    // A Hanged Man use is measured once its card has been resolved.
    if (hangedStart && !s.hangedDraw) {
      recordPowerEffect(p, 'hanged-man', hangedStart, s);
      hangedStart = null;
    }
    if (s.winner === null && s.current === p && s.drawn === null && !s.hangedDraw) extraTurns[p] += 1;
    if (s.drawn === null) diffs.push(progress(s, 0, A) - progress(s, 1, A));
  }

  const winner = s.winner;
  const record = {
    seed, first, winner, finished: winner !== null, turns, turnsBy,
    captured, captureMoves, multiCaptures, wasted, jokers, extraTurns,
    commanderOut, powerKills, powersUsed, powers, teamSize: size,
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
