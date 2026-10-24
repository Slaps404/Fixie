import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parts } from '../src/parts.ts';

test('lookup is case/space-insensitive', () => {
  const r = parts.lookup('wed 4815 ew', 'no heat');
  assert.ok(r);
  assert.equal(r.part.partNumber, 'WP3392519');
  assert.match(r.appliance, /dryer/i);
});

test('lookup tolerates a transposed model (edit distance 2)', () => {
  assert.equal(parts.lookup('WED4851EW', 'blowing cold air')?.part.partNumber, 'WP3392519');
  assert.equal(parts.lookup('XYZ1234', 'no heat'), null);
});

test('byFault finds the NOx sensor', () => {
  assert.equal(parts.byFault('spn 3226 fmi 4')?.part.partNumber, 'NOX-5WK97401');
});

test('isIdentical normalizes and accepts WP prefix variants', () => {
  const part = parts.lookup('WED4815EW', 'no heat')!.part;
  assert.equal(parts.isIdentical('3392519', part), true);
  assert.equal(parts.isIdentical('wp-3392519', part), true);
  assert.equal(parts.isIdentical('AP6008325', part), true);
  assert.equal(parts.isIdentical('WP339251', part), false);
  assert.equal(parts.isIdentical(undefined, part), false);
});
