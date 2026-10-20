// Seeded randomness (mulberry32). The generator state is a uint32 kept inside
// the game state, so a game replays identically from the same seed and both
// devices can agree on every shuffle.

export function nextRandom(rng) {
  const seed = (rng + 0x6d2b79f5) >>> 0;
  let r = Math.imul(seed ^ (seed >>> 15), seed | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, rng: seed };
}

/** Fisher–Yates shuffle. Returns a new array and the advanced rng. */
export function shuffle(items, rng) {
  const out = [...items];
  let state = rng;
  for (let i = out.length - 1; i > 0; i -= 1) {
    const step = nextRandom(state);
    state = step.rng;
    const j = Math.floor(step.value * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return { items: out, rng: state };
}

export function randomSeed() {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
