// Runs simulation jobs across worker threads.

import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';

const WORKER_URL = new URL('./worker.js', import.meta.url);

/** Splits `seeds` into chunks of about `size`. */
export function chunk(seeds, size) {
  const out = [];
  for (let i = 0; i < seeds.length; i += size) out.push(seeds.slice(i, i + size));
  return out;
}

export function seedRange(from, count) {
  return Array.from({ length: count }, (_, i) => from + i);
}

/**
 * Runs `jobs` (see worker.js) and resolves with their results in order.
 * `onProgress(done, total)` is called after each job, and
 * `onResult(index, result)` with each job's result as soon as it arrives.
 */
export async function runJobs(jobs, { threads = availableParallelism(), onProgress, onResult } = {}) {
  const results = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(threads, jobs.length) }, () => new Worker(WORKER_URL));
  try {
    await Promise.all(workers.map((w) => new Promise((resolve, reject) => {
      const feed = () => {
        if (next >= jobs.length) return resolve();
        const id = next;
        next += 1;
        w.postMessage({ id, job: jobs[id] });
      };
      w.on('message', ({ id, result, error }) => {
        if (error) return reject(new Error(error));
        results[id] = result;
        onResult?.(id, result);
        done += 1;
        onProgress?.(done, jobs.length);
        feed();
      });
      w.on('error', reject);
      feed();
    })));
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
  return results;
}

/** Plays a paired match split over the pool; returns the combined result. */
export async function poolMatch({ config, a, b, seeds, chunkSize = 100, threads }) {
  const parts = await runJobs(
    chunk(seeds, chunkSize).map((s) => ({ type: 'match', config, a, b, seeds: s })),
    { threads },
  );
  const games = parts.reduce((n, r) => n + r.games, 0);
  const winsA = parts.reduce((n, r) => n + r.winsA, 0);
  const rate = winsA / games;
  return { games, winsA, rate, ci95: 1.96 * Math.sqrt((rate * (1 - rate)) / games) };
}
