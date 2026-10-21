// Plays one game through the real rules engine with two bots and records
// what happened. Powers must be off.

import {
  HOME, createGame, currentMoves, drawCard, geometry, isNumberCard, passJoker,
  playDrawnNumber, teamSize,
} from '../src/rules/index.js';

function progress(state, p, A) {
  let s = 0;
  for (const u of state.units) if (u.player === p) s += u.pos === A ? A : u.pos;
  return s;
}

/**
 * @returns a record of the game (see fields below).
 */
export function playGame({ config, seed, bots, maxTurns = 5000 }) {
  let s = createGame({ seed, config });
  if (s.config.powers) throw new Error('playGame: simulations with powers are not supported yet');
  const A = geometry(s.config).ascended;
  const size = teamSize(s.config);
  const first = s.current;

  const turnsBy = [0, 0];
  const captured = [0, 0]; // enemy units sent home by each player
  const captureMoves = [0, 0];
  let multiCaptures = 0; // captures that sent 2+ units home at once
  const wasted = [0, 0]; // turns with no move (joker or no legal move)
  const jokers = [0, 0];
  const extraTurns = [0, 0];
  const commanderOut = [null, null]; // turn a commander first left home
  const diffs = []; // progress difference (player 0 minus 1) after each turn
  let turns = 0;

  while (s.winner === null && turns < maxTurns) {
    const p = s.current;
    turns += 1;
    turnsBy[p] += 1;
    s = drawCard(s);
    if (!isNumberCard(s.drawn)) {
      jokers[p] += 1;
      wasted[p] += 1;
      s = passJoker(s);
    } else if (currentMoves(s).length === 0) {
      wasted[p] += 1;
      s = playDrawnNumber(s, null);
    } else {
      const before = s;
      const move = bots[p].choose(s);
      s = playDrawnNumber(s, move);
      let sentHome = 0;
      for (let i = 0; i < s.units.length; i += 1) {
        const u = s.units[i];
        if (u.player !== p && u.pos === HOME && before.units[i].pos !== HOME) sentHome += 1;
        if (u.player === p && u.type === 'commander' && commanderOut[p] === null
          && before.units[i].pos === HOME && u.pos !== HOME) commanderOut[p] = turns;
      }
      if (sentHome > 0) {
        captured[p] += sentHome;
        captureMoves[p] += 1;
        if (sentHome > 1) multiCaptures += 1;
      }
      if (s.winner === null && s.current === p) extraTurns[p] += 1;
    }
    diffs.push(progress(s, 0, A) - progress(s, 1, A));
  }

  const winner = s.winner;
  const record = {
    seed,
    first,
    winner,
    finished: winner !== null,
    turns,
    turnsBy,
    captured,
    captureMoves,
    multiCaptures,
    wasted,
    jokers,
    extraTurns,
    commanderOut,
  };
  if (winner === null) return record;

  const loser = 1 - winner;
  const loserUnits = s.units.filter((u) => u.player === loser);
  record.loserLeft = loserUnits.filter((u) => u.pos !== A).length;
  record.loserHome = loserUnits.filter((u) => u.pos === HOME).length;
  record.loserProgress = progress(s, loser, A) / (size * A);

  // Lead changes and comebacks, by progress.
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
  record.maxDeficit = maxDeficit; // the winner's worst progress deficit
  record.leaderAtHalfWon = leaderAt(0.5) === 0 ? null : leaderAt(0.5) === sign;
  record.leaderAt75Won = leaderAt(0.75) === 0 ? null : leaderAt(0.75) === sign;
  return record;
}
