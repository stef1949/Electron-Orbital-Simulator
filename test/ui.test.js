import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const orbitalButtons = [
  ['1s', 1, 0, 0],
  ['2s', 2, 0, 0],
  ['3s', 3, 0, 0],
  ['2p_x', 2, 1, 1],
  ['2p_y', 2, 1, -1],
  ['2p_z', 2, 1, 0],
  ['3p_x', 3, 1, 1],
  ['3p_y', 3, 1, -1],
  ['3p_z', 3, 1, 0],
  ['3d_z2', 3, 2, 0],
  ['3d_x2-y2', 3, 2, 2],
  ['3d_xy', 3, 2, -2],
  ['3d_xz', 3, 2, 1],
  ['3d_yz', 3, 2, -1],
  ['4s', 4, 0, 0],
  ['4p_x', 4, 1, 1],
  ['4p_y', 4, 1, -1],
  ['4p_z', 4, 1, 0],
  ['4d_z2', 4, 2, 0],
  ['4d_x2-y2', 4, 2, 2],
  ['4d_xy', 4, 2, -2],
  ['4d_xz', 4, 2, 1],
  ['4d_yz', 4, 2, -1],
];

test('index.html uses the module entrypoint only once', () => {
  assert.match(html, /<script type="module" src="\.\/src\/main\.js"><\/script>/);
  assert.doesNotMatch(html, /window\.onload\s*=/);
});

test('orbital buttons embed explicit quantum-number mappings', () => {
  for (const [orbital, n, l, m] of orbitalButtons) {
    const pattern = new RegExp(
      `<button[^>]*data-orbital="${orbital}"[^>]*data-n="${n}"[^>]*data-l="${l}"[^>]*data-m="${m}"`,
    );
    assert.match(html, pattern, `Missing or incorrect mapping for ${orbital}`);
  }
});

test('d-orbital labels use correct text', () => {
  assert.doesNotMatch(html, /3d₂²|4d₂²|3dₓ₂|4dₓ₂|3dᵧ₂|4dᵧ₂/);
  assert.match(html, /data-orbital="3d_z2"[\s\S]*?>3d<sub>z²<\/sub>/);
  assert.match(html, /data-orbital="3d_xz"[\s\S]*?>3d<sub>xz<\/sub>/);
  assert.match(html, /data-orbital="3d_yz"[\s\S]*?>3d<sub>yz<\/sub>/);
});
