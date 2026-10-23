import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { currentBlock, stampBlock } from '../tools/stamp.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('index.html carries the current content hashes (run `npm run stamp` after changing a file)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(currentBlock(html), stampBlock(root));
});
