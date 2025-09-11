import test from 'node:test';
import assert from 'node:assert/strict';

import { getWaveFunctionValue, estimateMaxAngular2, estimateMaxPsi2 } from '../dist/math/wave.js';

const TWO_PI = 2 * Math.PI;

test('estimateMaxAngular2 l=0 m=0 equals 1/(4π)', () => {
  const expected = 1 / (4 * Math.PI);
  const est = estimateMaxAngular2(0, 0, 100);
  // For Y_00 the value is constant, so this should be very close.
  assert.ok(Math.abs(est - expected) < 1e-6, `got ${est}, expected ~${expected}`);
});

test('getWaveFunctionValue m=0 independent of phi', () => {
  const n = 2, l = 1, m = 0;
  const r = 2.5; // arbitrary radius
  const theta = Math.PI / 3;
  const phi1 = 0;
  const phi2 = Math.PI / 5;
  const psi1 = getWaveFunctionValue(n, l, m, r, theta, phi1);
  const psi2 = getWaveFunctionValue(n, l, m, r, theta, phi2);
  assert.ok(Number.isFinite(psi1) && Number.isFinite(psi2));
  assert.ok(Math.abs(psi1 - psi2) < 1e-9, `phi invariance violated: ${psi1} vs ${psi2}`);
});

test('estimateMaxPsi2 returns positive finite value', () => {
  const val = estimateMaxPsi2(1, 0, 0, 200);
  assert.ok(Number.isFinite(val) && val > 0);
});
