import * as THREE from 'three';

// Adaptive sampling constants
export const ADAPTIVE_MAX_RECALC_INTERVAL = 15; // frames
export const ADAPTIVE_TARGET_ACCEPT = 0.28; // target acceptance ratio
export const ADAPTIVE_BASE_ATTEMPTS_FACTOR = 6; // attempts per instance baseline
export const SUBSET_RESAMPLE_FRACTION = 0.05; // fraction of instances updated per adaptive frame
export const EMA_ALPHA = 0.25; // smoothing factor for maxPsi2

// Sampling constants
export const ACCEPTANCE_SCALE = 10; // Acceptance probability scale factor

// Colors
export const COLOR_POSITIVE = new THREE.Color(0x2e64e1); // A vibrant blue
export const COLOR_NEGATIVE = new THREE.Color(0xff6666); // A vibrant red

// Render modes
export type RenderMode = 'instanced' | 'points' | 'gpu';

// Default values
export const DEFAULT_RENDER_MODE: RenderMode = 'instanced';
export const DEFAULT_DENSITY = 50000;
export const DEFAULT_ORBITAL = { n: 2, l: 1, m: -1 };