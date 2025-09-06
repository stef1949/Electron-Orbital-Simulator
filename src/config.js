// Basic configuration and shared constants
export const maxRadius = 30;

export const colors = {
  positive: 0x2e64e1,
  negative: 0xff6666,
};

export const sampling = {
  SUBSET_RESAMPLE_FRACTION: 0.05,
  ADAPTIVE_MAX_RECALC_INTERVAL: 15,
  EMA_ALPHA: 0.25,
};

export const dprGate = {
  HIGH_DENSITY_THRESHOLD: 60000,
  MAX_DPR_HIGH: 1.25,
};

export function modeLabel(mode, webgpuSupported) {
  if (mode === 'points') return 'Mode: Points';
  if (mode === 'gpu') return 'Mode: GPU (WebGL)';
  if (mode === 'webgpu') return webgpuSupported ? 'Mode: WebGPU' : 'Mode: WebGPU (No Support)';
  return 'Mode: Instanced';
}

