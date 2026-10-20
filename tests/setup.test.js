// Confirms the test runner and the rules module are wired up.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES_VERSION } from '../src/rules/index.js';

test('rules module loads', () => {
  assert.equal(typeof RULES_VERSION, 'string');
});
