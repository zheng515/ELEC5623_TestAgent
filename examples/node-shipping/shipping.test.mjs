import test from 'node:test';
import assert from 'node:assert/strict';
import { fee } from './shipping.mjs';

test('test_above_threshold', () => {
  assert.equal(fee(20000), 0);
});
