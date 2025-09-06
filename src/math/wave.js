import { maxRadius } from '../config.js';

// Real-valued, simplified hydrogen-like wavefunction components
export function getWaveFunctionValue(n, l, m, r, theta, phi) {
  let radial_part = 0;
  let angular_part = 0;

  if (n <= l) return 0;
  const x = (2 * r) / n;
  const p = n - l - 1;
  const alpha = 2 * l + 1;
  let L = 1;
  if (p === 1) L = -x + (alpha + 1);
  else if (p === 2) L = 0.5 * (x * x - 2 * (alpha + 2) * x + (alpha + 1) * (alpha + 2));
  else if (p === 3) L = (1 / 6) * (-x * x * x + 3 * (alpha + 3) * x * x - 3 * (alpha + 2) * (alpha + 3) * x + (alpha + 1) * (alpha + 2) * (alpha + 3));
  radial_part = Math.pow(x, l) * L * Math.exp(-x / 2);

  if (l === 0) angular_part = 1;
  else if (l === 1) {
    if (m === 0) angular_part = Math.cos(theta);
    else if (m === 1) angular_part = Math.sin(theta) * Math.cos(phi);
    else angular_part = Math.sin(theta) * Math.sin(phi);
  } else if (l === 2) {
    const ct = Math.cos(theta), st = Math.sin(theta);
    if (m === 0) angular_part = 1.5 * ct * ct - 0.5;
    else if (m === 1) angular_part = -1.732 * st * ct * Math.cos(phi);
    else if (m === -1) angular_part = 1.732 * st * ct * Math.sin(phi);
    else if (m === 2) angular_part = 0.866 * st * st * Math.cos(2 * phi);
    else angular_part = 0.866 * st * st * Math.sin(2 * phi);
  }

  return radial_part * angular_part;
}

export function estimateMaxPsi2(n, l, m, samples = 1000) {
  let maxPsi2 = 0;
  for (let i = 0; i < samples; i++) {
    const r = Math.random() * maxRadius;
    const theta = Math.acos(2 * Math.random() - 1);
    const phi = Math.random() * 2 * Math.PI;
    const psi = getWaveFunctionValue(n, l, m, r, theta, phi);
    const psi2 = psi * psi;
    if (psi2 > maxPsi2) maxPsi2 = psi2;
  }
  return Math.max(maxPsi2, 1e-6);
}

export function estimateMaxAngular2(l, m, samples = 2000) {
  function angularVal(theta, phi) {
    if (l === 0) return 1.0;
    else if (l === 1) {
      if (m === 0) return Math.cos(theta);
      else if (m === 1) return Math.sin(theta) * Math.cos(phi);
      else return Math.sin(theta) * Math.sin(phi);
    } else if (l === 2) {
      const ct = Math.cos(theta), st = Math.sin(theta);
      if (m === 0) return 1.5 * ct * ct - 0.5;
      else if (m === 1) return -1.732 * st * ct * Math.cos(phi);
      else if (m === -1) return 1.732 * st * ct * Math.sin(phi);
      else if (m === 2) return 0.866 * st * st * Math.cos(2.0 * phi);
      else return 0.866 * st * st * Math.sin(2.0 * phi);
    }
    return 0.0;
  }
  let maxA2 = 0;
  for (let i = 0; i < samples; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = Math.acos(1 - 2 * u);
    const phi = 2 * Math.PI * v;
    const a = angularVal(theta, phi);
    maxA2 = Math.max(maxA2, a * a);
  }
  return Math.max(maxA2, 1e-6);
}

