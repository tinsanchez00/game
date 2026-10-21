// Worker thread entry: runs one job at a time for sim/pool.js.

import { parentPort } from 'node:worker_threads';
import { nextRandom } from '../src/rules/index.js';
import { greedyBot, randomBot, searchBot } from './bot.js';
import { powerBot } from './powerbot.js';
import { playGame } from './game.js';
import { playMatch } from './match.js';

export function makeBot(spec, seed = 1) {
  if (spec.kind === 'search') return searchBot({ depth: spec.depth ?? 2, weights: spec.weights });
  if (spec.kind === 'greedy') return greedyBot();
  if (spec.kind === 'power') {
    let s = ((spec.seed ?? 12345) ^ Math.imul(seed, 2654435761)) >>> 0;
    return powerBot({
      level: spec.level ?? 'strong',
      weights: spec.weights,
      powerValues: spec.powerValues,
      random: () => {
        const r = nextRandom(s);
        s = r.rng;
        return r.value;
      },
    });
  }
  if (spec.kind === 'random') {
    let s = (spec.seed ?? 0) ^ seed;
    return randomBot(() => {
      const r = nextRandom(s);
      s = r.rng;
      return r.value;
    });
  }
  throw new Error(`unknown bot ${spec.kind}`);
}

export function runJob(job) {
  if (job.type === 'match') {
    return playMatch({
      config: job.config,
      makeA: (seed) => makeBot(job.a, seed),
      makeB: (seed) => makeBot(job.b, seed + 7919),
      seeds: job.seeds,
    });
  }
  if (job.type === 'games') {
    return job.seeds.map((seed) => playGame({
      config: job.config,
      seed,
      bots: [makeBot(job.bots[0], seed), makeBot(job.bots[1], seed + 1)],
      maxTurns: job.maxTurns,
    }));
  }
  throw new Error(`unknown job ${job.type}`);
}

if (parentPort) {
  parentPort.on('message', ({ id, job }) => {
    try {
      parentPort.postMessage({ id, result: runJob(job) });
    } catch (err) {
      parentPort.postMessage({ id, error: String(err?.stack ?? err) });
    }
  });
}
