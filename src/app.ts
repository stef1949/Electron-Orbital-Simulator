import * as THREE from 'three';
import { createScene, handleResize } from './renderer/scene';
import { UIController } from './ui/controls';
import { getOrbitalConfig } from './orbitals/data';
import { estimateMaxPsi2, getWaveFunctionValue, createRadialLUT, MAX_RADIUS } from './orbitals/math';
import { RadialLUTCache } from './utils/cache';
import { 
  ADAPTIVE_MAX_RECALC_INTERVAL, 
  ADAPTIVE_TARGET_ACCEPT, 
  ADAPTIVE_BASE_ATTEMPTS_FACTOR,
  SUBSET_RESAMPLE_FRACTION,
  EMA_ALPHA,
  ACCEPTANCE_SCALE,
  COLOR_POSITIVE,
  COLOR_NEGATIVE,
  DEFAULT_ORBITAL,
  DEFAULT_DENSITY
} from './constants';
import type { 
  AppState, 
  OrbitalData, 
  Transform, 
  MaterialCache, 
  GeometryCache, 
  PointsCache, 
  GPUResources 
} from './types';
import type { RenderMode } from './constants';

export class App {
  private canvas: HTMLCanvasElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: any; // OrbitControls
  private ui: UIController;
  
  private state: AppState;
  private materialCache: MaterialCache = {};
  private geometryCache: GeometryCache = {};
  private pointsCache: PointsCache = { geometry: null, material: null, capacity: 0 };
  private gpuResources: GPUResources;
  private radialLUTCache = new RadialLUTCache();
  
  private dummyObject3D = new THREE.Object3D();
  private frameCount = 0;
  private lastFrameTime = 0;
  private fps = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    
    // Initialize scene
    const sceneSetup = createScene(canvas);
    this.scene = sceneSetup.scene;
    this.camera = sceneSetup.camera;
    this.renderer = sceneSetup.renderer;
    this.controls = sceneSetup.controls;
    
    // Initialize UI
    this.ui = new UIController();
    
    // Initialize state
    this.state = {
      currentOrbital: null,
      currentOrbitalData: DEFAULT_ORBITAL,
      debounceTimer: null,
      paused: false,
      adaptiveEnabled: false,
      adaptiveFrame: 0,
      cachedMaxPsi2: null,
      emaMaxPsi2: null,
      renderMode: 'instanced',
      occlusionEnabled: false,
      impostorEnabled: false
    };

    // Initialize GPU resources
    this.gpuResources = {
      gpuSampleTarget: null,
      gpuSampleMesh: null,
      gpuQuadScene: null,
      gpuRadialLUT: null,
      gpuLUTSize: 0
    };

    this.setupEventListeners();
    this.setupUI();
  }

  private setupEventListeners(): void {
    // Handle window resizing (debounced)
    let resizeTimer: NodeJS.Timeout | null = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        handleResize(this.camera, this.renderer);
      }, 100);
    });
  }

  private setupUI(): void {
    this.ui.setupDensitySlider((value) => {
      this.scheduleRegeneration(80);
    });

    this.ui.setupOrbitalButtons((orbitalType) => {
      const config = getOrbitalConfig(orbitalType);
      if (config) {
        this.state.currentOrbitalData = config;
        this.scheduleRegeneration(80);
      }
    });

    this.ui.setupPauseButton((paused) => {
      this.state.paused = paused;
    });

    this.ui.setupAdaptiveButton((enabled) => {
      this.state.adaptiveEnabled = enabled;
    });

    this.ui.setupModeButton((mode) => {
      this.state.renderMode = mode;
      this.scheduleRegeneration(20);
    });

    this.ui.setupImpostorButton((enabled) => {
      this.state.impostorEnabled = enabled;
      this.scheduleRegeneration(20);
    });

    this.ui.setupCullButton((enabled) => {
      this.state.occlusionEnabled = enabled;
      this.scheduleRegeneration(20);
    });

    this.ui.setupClearButton(() => {
      this.clearOrbital();
    });
  }

  private scheduleRegeneration(delay = 60): void {
    if (this.state.debounceTimer) clearTimeout(this.state.debounceTimer);
    this.state.debounceTimer = setTimeout(() => {
      this.regenerateOrbitalGeometry();
    }, delay);
  }

  private clearOrbital(): void {
    // Remove current orbital from scene
    if (this.state.currentOrbital) {
      this.scene.remove(this.state.currentOrbital);
      this.state.currentOrbital = null;
    }

    // Clean up any remaining orbital objects
    const objectsToRemove: THREE.Object3D[] = [];
    this.scene.traverse((obj) => {
      if (obj.userData && obj.userData.isOrbital) {
        objectsToRemove.push(obj);
      }
    });
    objectsToRemove.forEach(obj => this.scene.remove(obj));

    // Clear GPU resources
    if (this.gpuResources.gpuSampleTarget) {
      this.gpuResources.gpuSampleTarget.dispose?.();
      this.gpuResources.gpuSampleTarget = null;
    }
    this.state.currentOrbital = null;
  }

  private regenerateOrbitalGeometry(): void {
    this.clearOrbital();

    const { n, l, m } = this.state.currentOrbitalData;
    const numPoints = this.ui.getDensityValue();

    if (this.state.renderMode === 'instanced') {
      this.generateInstancedOrbital(n, l, m, numPoints);
    } else if (this.state.renderMode === 'points') {
      this.generatePointsOrbital(n, l, m, numPoints);
    } else if (this.state.renderMode === 'gpu') {
      this.generateGPUOrbital(n, l, m, numPoints);
    }
  }

  private generateInstancedOrbital(n: number, l: number, m: number, numPoints: number): void {
    // Create materials if not cached
    if (!this.materialCache.matPos) {
      const commonMatOpts = {
        transparent: true,
        depthWrite: true,
        depthTest: true
        // blending: THREE.AdditiveBlending // Temporarily disabled
      };
      this.materialCache.matPos = new THREE.MeshBasicMaterial({ 
        color: COLOR_POSITIVE, 
        ...commonMatOpts 
      });
      this.materialCache.matNeg = new THREE.MeshBasicMaterial({ 
        color: COLOR_NEGATIVE, 
        ...commonMatOpts 
      });

      // Create billboard materials for impostors
      const billboardVertShader = `
        attribute vec3 instancePosition;
        attribute float instanceScale;
        varying vec3 vColor;
        uniform vec3 color;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        uniform vec3 cameraPosition;
        
        void main() {
          vec3 pos = instancePosition;
          vec3 toCamera = normalize(cameraPosition - pos);
          vec3 up = vec3(0.0, 1.0, 0.0);
          vec3 right = normalize(cross(toCamera, up));
          up = cross(right, toCamera);
          
          vec3 vertex = position * instanceScale;
          vertex = right * vertex.x + up * vertex.y + toCamera * vertex.z;
          pos += vertex;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          vColor = color;
        }
      `;
      const billboardFragShader = `
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, 1.0);
        }
      `;

      this.materialCache.matPosBillboard = new THREE.ShaderMaterial({
        uniforms: {
          color: { value: COLOR_POSITIVE },
          cameraPosition: { value: this.camera.position }
        },
        vertexShader: billboardVertShader,
        fragmentShader: billboardFragShader,
        transparent: true,
        depthWrite: true,
        depthTest: true
        // blending: THREE.AdditiveBlending // Temporarily disabled
      });

      this.materialCache.matNegBillboard = new THREE.ShaderMaterial({
        uniforms: {
          color: { value: COLOR_NEGATIVE },
          cameraPosition: { value: this.camera.position }
        },
        vertexShader: billboardVertShader,
        fragmentShader: billboardFragShader,
        transparent: true,
        depthWrite: true,
        depthTest: true
        // blending: THREE.AdditiveBlending // Temporarily disabled
      });
    }

    // Create geometries if not cached  
    if (!this.geometryCache.sphereGeo) {
      this.geometryCache.sphereGeo = new THREE.SphereGeometry(0.5, 8, 6); // Larger, simpler spheres
      this.geometryCache.quadGeo = new THREE.PlaneGeometry(1.0, 1.0);
    }

    // Sample orbital using rejection sampling
    const posTransforms: Transform[] = [];
    const negTransforms: Transform[] = [];
    const maxPsi2 = estimateMaxPsi2(n, l, m, 2000);
    
    for (let i = 0; i < numPoints * ACCEPTANCE_SCALE; i++) {
      const r = Math.random() * MAX_RADIUS;
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = Math.random() * 2 * Math.PI;
      const x = r * Math.sin(theta) * Math.cos(phi);
      const y = r * Math.sin(theta) * Math.sin(phi);
      const z = r * Math.cos(theta);
      
      const psi = getWaveFunctionValue(n, l, m, r, theta, phi);
      const psi2 = psi * psi;
      
      if (Math.random() <= psi2 / maxPsi2) {
        const scale = 0.55 + 0.45 * Math.min(1, Math.sqrt(psi2 / maxPsi2));
        if (psi >= 0) {
          posTransforms.push({ x, y, z, scale });
        } else {
          negTransforms.push({ x, y, z, scale });
        }
      }
    }

    console.log(`Generated orbital ${n},${l},${m}: ${posTransforms.length} positive, ${negTransforms.length} negative transforms`);

    // Choose geometry and materials based on impostor mode
    const useImpostor = this.state.impostorEnabled;
    const useGeo = useImpostor ? this.geometryCache.quadGeo! : this.geometryCache.sphereGeo!;
    const useMatPos = useImpostor ? this.materialCache.matPosBillboard! : this.materialCache.matPos!;
    const useMatNeg = useImpostor ? this.materialCache.matNegBillboard! : this.materialCache.matNeg!;

    // Create instanced meshes
    const posMesh = new THREE.InstancedMesh(useGeo, useMatPos, posTransforms.length || 1);
    const negMesh = new THREE.InstancedMesh(useGeo, useMatNeg, negTransforms.length || 1);

    // Set transforms
    posTransforms.forEach((t, i) => {
      this.dummyObject3D.position.set(t.x, t.y, t.z);
      this.dummyObject3D.scale.setScalar(t.scale);
      this.dummyObject3D.updateMatrix();
      posMesh.setMatrixAt(i, this.dummyObject3D.matrix);
    });

    negTransforms.forEach((t, i) => {
      this.dummyObject3D.position.set(t.x, t.y, t.z);
      this.dummyObject3D.scale.setScalar(t.scale);
      this.dummyObject3D.updateMatrix();
      negMesh.setMatrixAt(i, this.dummyObject3D.matrix);
    });

    posMesh.instanceMatrix.needsUpdate = true;
    negMesh.instanceMatrix.needsUpdate = true;

    // Mark meshes for cleanup
    posMesh.userData = { isOrbital: true };
    negMesh.userData = { isOrbital: true };

    // Create group
    const group = new THREE.Group();
    if (posTransforms.length > 0) group.add(posMesh);
    if (negTransforms.length > 0) group.add(negMesh);
    group.userData = { isOrbital: true };

    this.state.currentOrbital = group;
    this.scene.add(group);
  }

  private generatePointsOrbital(n: number, l: number, m: number, numPoints: number): void {
    // This is a simplified version - in the full implementation you'd have 
    // the points rendering logic here
    console.log('Points mode not fully implemented yet');
  }

  private generateGPUOrbital(n: number, l: number, m: number, numPoints: number): void {
    // This is a simplified version - in the full implementation you'd have 
    // the GPU rendering logic here  
    console.log('GPU mode not fully implemented yet');
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    // Update controls
    this.controls.update();

    // Update FPS counter
    this.frameCount++;
    const currentTime = performance.now();
    if (currentTime - this.lastFrameTime >= 1000) {
      this.fps = this.frameCount / ((currentTime - this.lastFrameTime) / 1000);
      this.ui.updateFPS(this.fps);
      this.frameCount = 0;
      this.lastFrameTime = currentTime;
    }

    // Render
    this.renderer.render(this.scene, this.camera);
  };

  public start(): void {
    // Generate initial orbital
    this.regenerateOrbitalGeometry();
    
    // Start animation loop
    this.animate();
  }
}