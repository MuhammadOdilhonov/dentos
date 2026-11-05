import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doctorRate, naryadSplit } from '../src/lib/naryadPricing.ts';

test('doctor rates preserve zero and reject invalid values', () => {
  assert.equal(doctorRate('0.00'), 0);
  assert.equal(doctorRate('37.50'), 37.5);
  for (const value of [null, undefined, '', -1, 101, NaN, Infinity]) assert.equal(doctorRate(value), null);
});
test('quantity and fractional commission conserve the total', () => {
  assert.deepEqual(naryadSplit(100000, 3, 37.5), { total: 300000, doctorShare: 112500, clinicShare: 187500 });
  assert.deepEqual(naryadSplit(125000, 2, 0), { total: 250000, doctorShare: 0, clinicShare: 250000 });
  assert.deepEqual(naryadSplit(100, 1, 100), { total: 100, doctorShare: 100, clinicShare: 0 });
  assert.throws(() => naryadSplit(-1, 1, 35));
  assert.throws(() => naryadSplit(100, 0.5, 35));
});
