import { describe, it, expect } from 'vitest';
import { getWaveFunctionValue, estimateMaxPsi2, createRadialLUT, MAX_RADIUS } from '../../src/orbitals/math';

describe('Orbital Math Functions', () => {
  describe('getWaveFunctionValue', () => {
    it('should return valid values for 1s orbital', () => {
      const psi = getWaveFunctionValue(1, 0, 0, 1, Math.PI/2, 0);
      expect(psi).toBeTypeOf('number');
      expect(isFinite(psi)).toBe(true);
    });

    it('should return 0 for invalid quantum numbers (n <= l)', () => {
      const psi = getWaveFunctionValue(1, 1, 0, 1, Math.PI/2, 0);
      expect(psi).toBe(0);
    });

    it('should handle 2p orbitals correctly', () => {
      // Test p_z orbital (m=0)
      const psi_z = getWaveFunctionValue(2, 1, 0, 1, 0, 0); // theta=0 => cos(theta)=1
      expect(psi_z).toBeGreaterThan(0);

      // Test p_x orbital (m=1) 
      const psi_x = getWaveFunctionValue(2, 1, 1, 1, Math.PI/2, 0); // sin(theta)=1, cos(phi)=1
      expect(psi_x).toBeGreaterThan(0);

      // Test p_y orbital (m=-1)
      const psi_y = getWaveFunctionValue(2, 1, -1, 1, Math.PI/2, Math.PI/2); // sin(theta)=1, sin(phi)=1
      expect(psi_y).toBeGreaterThan(0);
    });

    it('should handle 3d orbitals correctly', () => {
      // Test d_z2 orbital (m=0)
      const psi_z2 = getWaveFunctionValue(3, 2, 0, 1, 0, 0); // theta=0 => 3*cos²(0)-1 = 2
      expect(psi_z2).toBeGreaterThan(0);

      // Test d_x2-y2 orbital (m=2)
      const psi_x2y2 = getWaveFunctionValue(3, 2, 2, 1, Math.PI/2, 0); // sin²(theta)=1, cos(2*phi)=1
      expect(psi_x2y2).toBeGreaterThan(0);
    });

    it('should produce symmetric results for s orbitals', () => {
      const psi1 = getWaveFunctionValue(1, 0, 0, 1, 0, 0);
      const psi2 = getWaveFunctionValue(1, 0, 0, 1, Math.PI, 0);
      const psi3 = getWaveFunctionValue(1, 0, 0, 1, Math.PI/2, Math.PI);
      
      // s orbitals should be spherically symmetric
      expect(Math.abs(psi1 - psi2)).toBeLessThan(1e-10);
      expect(Math.abs(psi1 - psi3)).toBeLessThan(1e-10);
    });
  });

  describe('estimateMaxPsi2', () => {
    it('should return positive values', () => {
      const max1s = estimateMaxPsi2(1, 0, 0, 100);
      expect(max1s).toBeGreaterThan(0);

      const max2p = estimateMaxPsi2(2, 1, 0, 100);
      expect(max2p).toBeGreaterThan(0);
    });

    it('should return minimum fallback for invalid orbitals', () => {
      const maxInvalid = estimateMaxPsi2(1, 1, 0, 100);
      expect(maxInvalid).toBe(1e-6);
    });

    it('should be consistent with more samples', () => {
      const max1 = estimateMaxPsi2(1, 0, 0, 50);
      const max2 = estimateMaxPsi2(1, 0, 0, 500);
      
      // Should be roughly in the same ballpark (within factor of 3)
      expect(max2 / max1).toBeGreaterThan(0.3);
      expect(max2 / max1).toBeLessThan(3);
    });

    it('should handle different quantum numbers', () => {
      const max1s = estimateMaxPsi2(1, 0, 0, 100);
      const max2s = estimateMaxPsi2(2, 0, 0, 100);
      const max2p = estimateMaxPsi2(2, 1, 0, 100);
      
      expect(max1s).toBeGreaterThan(0);
      expect(max2s).toBeGreaterThan(0);
      expect(max2p).toBeGreaterThan(0);
    });
  });

  describe('createRadialLUT', () => {
    it('should create valid DataTexture', () => {
      const lut = createRadialLUT(1, 0, 256);
      
      expect(lut.image.width).toBe(256);
      expect(lut.image.height).toBe(1);
      expect(lut.image.data).toBeInstanceOf(Float32Array);
      expect(lut.image.data.length).toBe(256 * 4); // RGBA
    });

    it('should have decreasing radial values for 1s', () => {
      const lut = createRadialLUT(1, 0, 100);
      const data = lut.image.data as Float32Array;
      
      // First value (r=0) should be positive
      expect(data[0]).toBeGreaterThan(0);
      
      // Values should generally decrease as r increases (exponential decay)
      let decreasingCount = 0;
      for (let i = 1; i < 50; i++) {
        if (data[i * 4] < data[(i - 1) * 4]) {
          decreasingCount++;
        }
      }
      
      // Should have mostly decreasing trend
      expect(decreasingCount).toBeGreaterThan(30);
    });

    it('should handle different quantum numbers', () => {
      const lut1s = createRadialLUT(1, 0, 100);
      const lut2p = createRadialLUT(2, 1, 100);
      const lut3d = createRadialLUT(3, 2, 100);
      
      expect(lut1s.image.data.length).toBe(100 * 4);
      expect(lut2p.image.data.length).toBe(100 * 4);
      expect(lut3d.image.data.length).toBe(100 * 4);
      
      // Different orbitals should have different radial profiles
      const data1s = lut1s.image.data as Float32Array;
      const data2p = lut2p.image.data as Float32Array;
      
      expect(data1s[0]).not.toBe(data2p[0]);
    });
  });
});