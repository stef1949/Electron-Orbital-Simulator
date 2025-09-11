import test from 'node:test';
import assert from 'node:assert/strict';

import { modeLabel } from '../dist/config.js';

test('modeLabel: points', () => {
  assert.equal(modeLabel('points', true), 'Mode: Points');
});

test('modeLabel: gpu', () => {
  assert.equal(modeLabel('gpu', true), 'Mode: GPU (WebGL)');
});

test('modeLabel: webgpu supported', () => {
  assert.equal(modeLabel('webgpu', true), 'Mode: WebGPU');
});

test('modeLabel: webgpu unsupported', () => {
  assert.equal(modeLabel('webgpu', false), 'Mode: WebGPU (No Support)');
});
