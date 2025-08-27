import * as THREE from 'three';
import type { OrbitalData } from '../types';

export const MAX_RADIUS = 30;

/**
 * Estimate maximum |psi|^2 via random sampling for rejection sampling normalization
 */
export function estimateMaxPsi2(n: number, l: number, m: number, samples = 1000): number {
  let maxPsi2 = 0;
  for (let i = 0; i < samples; i++) {
    const r = Math.random() * MAX_RADIUS;
    const theta = Math.acos(2 * Math.random() - 1);
    const phi = Math.random() * 2 * Math.PI;
    const psi = getWaveFunctionValue(n, l, m, r, theta, phi);
    const psi2 = psi * psi;
    if (psi2 > maxPsi2) maxPsi2 = psi2;
  }
  // Prevent division by zero
  return maxPsi2 > 0 ? maxPsi2 : 1e-6;
}

/**
 * Calculates the wave function value (which can be positive or negative)
 * Note: This is a simplified, real-valued version for visualization.
 */
export function getWaveFunctionValue(n: number, l: number, m: number, r: number, theta: number, phi: number): number {
  let radial_part = 0;
  let angular_part = 0;

  // Radial part R(r) - hydrogenic-like using associated Laguerre polynomials (unnormalized)
  // Uses x = 2r/n and L^{alpha}_p where p = n-l-1, alpha = 2l+1
  if (n <= l) {
    radial_part = 0;
  } else {
    const x = 2 * r / n;
    const p = n - l - 1;
    const alpha = 2 * l + 1;
    let L = 1;
    // Associated Laguerre polynomials for p = 0..3 (covers n <= 4)
    if (p === 0) {
      L = 1;
    } else if (p === 1) {
      // L^{alpha}_1(x) = -x + alpha + 1
      L = -x + (alpha + 1);
    } else if (p === 2) {
      // L^{alpha}_2(x) = 1/2 (x^2 - 2(alpha+2)x + (alpha+1)(alpha+2))
      L = 0.5 * (x * x - 2 * (alpha + 2) * x + (alpha + 1) * (alpha + 2));
    } else if (p === 3) {
      // L^{alpha}_3(x) = 1/6 (-x^3 + 3(alpha+3)x^2 - 3(alpha+2)(alpha+3)x + (alpha+1)(alpha+2)(alpha+3))
      L = (1 / 6) * (-x * x * x + 3 * (alpha + 3) * x * x - 3 * (alpha + 2) * (alpha + 3) * x + (alpha + 1) * (alpha + 2) * (alpha + 3));
    } else {
      // For larger p fallback to a simple exponential times polynomial approximation
      L = 1;
    }
    radial_part = Math.pow(x, l) * L * Math.exp(-x / 2);
  }

  // Angular part Y(theta, phi) - Real-valued Spherical Harmonics
  if (l === 0) { // s-orbital
    angular_part = 1;
  } else if (l === 1) { // p-orbitals
    if (m === 0) { // p_z
      angular_part = Math.cos(theta);
    } else if (m === 1) { // p_x
      angular_part = Math.sin(theta) * Math.cos(phi);
    } else if (m === -1) { // p_y
      angular_part = Math.sin(theta) * Math.sin(phi);
    }
  } else if (l === 2) { // d-orbitals
    if (m === 0) { // d_z2
      angular_part = (3 * Math.cos(theta) * Math.cos(theta) - 1);
    } else if (m === 1) { // d_xz
      angular_part = Math.sin(theta) * Math.cos(theta) * Math.cos(phi);
    } else if (m === -1) { // d_yz
      angular_part = Math.sin(theta) * Math.cos(theta) * Math.sin(phi);
    } else if (m === 2) { // d_x2-y2
      angular_part = Math.sin(theta) * Math.sin(theta) * Math.cos(2 * phi);
    } else if (m === -2) { // d_xy
      angular_part = Math.sin(theta) * Math.sin(theta) * Math.sin(2 * phi);
    }
  }
  
  return radial_part * angular_part;
}

/**
 * Precompute radial LUT (1D) for R_nl(r) to avoid expensive per-sample exp/polynomial
 */
export function createRadialLUT(n: number, l: number, size = 1024): THREE.DataTexture {
  const arr = new Float32Array(size * 4); // RGBA but we only fill R channel
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    const r = t * MAX_RADIUS;
    // compute radial part similarly to getWaveFunctionValue but only radial
    let radial_part = 0;
    if (n <= l) {
      radial_part = 0;
    } else {
      const x = 2 * r / n;
      const p = n - l - 1;
      const alpha = 2 * l + 1;
      let L = 1;
      if (p === 0) {
        L = 1;
      } else if (p === 1) {
        L = -x + (alpha + 1);
      } else if (p === 2) {
        L = 0.5 * (x * x - 2 * (alpha + 2) * x + (alpha + 1) * (alpha + 2));
      } else if (p === 3) {
        L = (1 / 6) * (-x * x * x + 3 * (alpha + 3) * x * x - 3 * (alpha + 2) * (alpha + 3) * x + (alpha + 1) * (alpha + 2) * (alpha + 3));
      } else {
        L = 1;
      }
      radial_part = Math.pow(x, l) * L * Math.exp(-x / 2);
    }
    arr[i * 4 + 0] = radial_part;
    arr[i * 4 + 1] = 0;
    arr[i * 4 + 2] = 0;
    arr[i * 4 + 3] = 1;
  }
  const tex = new THREE.DataTexture(arr, size, 1, THREE.RGBAFormat, THREE.FloatType);
  tex.needsUpdate = true;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}