import type { OrbitalData } from '../types';

export const ORBITAL_CONFIGS: Record<string, OrbitalData> = {
  '1s': { n: 1, l: 0, m: 0 },
  '2s': { n: 2, l: 0, m: 0 },
  '3s': { n: 3, l: 0, m: 0 },
  '2p_x': { n: 2, l: 1, m: 1 },
  '2p_y': { n: 2, l: 1, m: -1 },
  '2p_z': { n: 2, l: 1, m: 0 },
  '3p_x': { n: 3, l: 1, m: 1 },
  '3p_y': { n: 3, l: 1, m: -1 },
  '3p_z': { n: 3, l: 1, m: 0 },
  '3d_z2': { n: 3, l: 2, m: 0 },
  '3d_x2-y2': { n: 3, l: 2, m: 2 },
  '3d_xy': { n: 3, l: 2, m: -2 },
  '3d_xz': { n: 3, l: 2, m: 1 },
  '3d_yz': { n: 3, l: 2, m: -1 },
  '4s': { n: 4, l: 0, m: 0 },
  '4p_x': { n: 4, l: 1, m: 1 },
  '4p_y': { n: 4, l: 1, m: -1 },
  '4p_z': { n: 4, l: 1, m: 0 },
  '4d_z2': { n: 4, l: 2, m: 0 },
  '4d_x2-y2': { n: 4, l: 2, m: 2 },
  '4d_xy': { n: 4, l: 2, m: -2 },
  '4d_xz': { n: 4, l: 2, m: 1 },
  '4d_yz': { n: 4, l: 2, m: -1 }
};

export function getOrbitalConfig(orbitalType: string): OrbitalData | null {
  return ORBITAL_CONFIGS[orbitalType] || null;
}