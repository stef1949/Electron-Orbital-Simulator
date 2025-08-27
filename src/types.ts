import * as THREE from 'three';

export interface OrbitalData {
  n: number;  // principal quantum number
  l: number;  // angular momentum quantum number  
  m: number;  // magnetic quantum number
}

export interface Transform {
  x: number;
  y: number;
  z: number;
  scale: number;
}

export interface OrbitalConfig extends OrbitalData {
  numPoints: number;
}

export interface MaterialCache {
  matPos?: THREE.MeshBasicMaterial;
  matNeg?: THREE.MeshBasicMaterial;
  matPosBillboard?: THREE.ShaderMaterial;
  matNegBillboard?: THREE.ShaderMaterial;
}

export interface GeometryCache {
  sphereGeo?: THREE.SphereGeometry;
  quadGeo?: THREE.PlaneGeometry;
}

export interface PointsCache {
  geometry: THREE.BufferGeometry | null;
  material: THREE.PointsMaterial | null;
  capacity: number;
}

export interface GPUResources {
  gpuSampleTarget: THREE.WebGLRenderTarget | null;
  gpuSampleMesh: THREE.Points | null;
  gpuQuadScene: THREE.Scene | null;
  gpuRadialLUT: THREE.DataTexture | null;
  gpuLUTSize: number;
}

export interface AppState {
  currentOrbital: THREE.Group | THREE.Points | null;
  currentOrbitalData: OrbitalData;
  debounceTimer: NodeJS.Timeout | null;
  paused: boolean;
  adaptiveEnabled: boolean;
  adaptiveFrame: number;
  cachedMaxPsi2: number | null;
  emaMaxPsi2: number | null;
  renderMode: 'instanced' | 'points' | 'gpu';
  occlusionEnabled: boolean;
  impostorEnabled: boolean;
}

export interface UIElements {
  densitySlider: HTMLInputElement;
  densityValueLabel: HTMLElement;
  pauseButton: HTMLButtonElement;
  adaptiveButton: HTMLButtonElement;
  modeButton: HTMLButtonElement;
  impostorButton: HTMLButtonElement;
  cullButton: HTMLButtonElement;
  clearButton: HTMLButtonElement;
  fpsCounter: HTMLElement;
}