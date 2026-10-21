// Head-to-head matches: every seed is played twice with seats swapped, so
// both bots get the same deals and the same first-player luck.

import { playGame } from './game.js';

/**
 * @param {{ config, makeA: () => bot, makeB: () => bot, seeds: number[] }} options
 * @returns {{ games, winsA, rate, ci95 }}
 */
export function playMatch({ config, makeA, makeB, seeds }) {
  let winsA = 0;
  let games = 0;
  for (const seed of seeds) {
    for (const aSeat of [0, 1]) {
      const bots = [];
      bots[aSeat] = makeA();
      bots[1 - aSeat] = makeB();
      const r = playGame({ config, seed, bots });
      if (!r.finished) continue;
      games += 1;
      if (r.winner === aSeat) winsA += 1;
    }
  }
  const rate = winsA / games;
  const ci95 = 1.96 * Math.sqrt((rate * (1 - rate)) / games);
  return { games, winsA, rate, ci95 };
}
