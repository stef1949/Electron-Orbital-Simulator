import { maxRadius, colors, sampling, modeLabel, dprGate } from './config.js';
import { getWaveFunctionValue, estimateMaxPsi2 } from './math/wave.js';
import * as LUT from './sampling/lut.js';
import { renderGPUSamples, createGPUPointsMesh } from './gpu/webglSampler.js';
import { makeWebGPU, initWebGPU, ensureWebGPUParticles, renderWebGPUFrame } from './gpu/webgpuPipeline.js';

const T = window.THREE;
const APP_GUARD = '__electronOrbitalSimulatorInitialized';

if (!T) {
  throw new Error('Three.js must be loaded before src/main.js');
}

if (window[APP_GUARD]) {
  console.warn('Electron Orbital Simulator already initialized; skipping duplicate boot.');
} else {
  window[APP_GUARD] = true;
  initialize();
}

function initialize() {
  const canvasContainer = document.getElementById('canvas-container');
  const canvas = document.getElementById('orbital-canvas');
  const buttons = Array.from(document.querySelectorAll('#orbital-panel .orbital-button[data-orbital]'));
  const densitySlider = document.getElementById('density-slider');
  const densityValueLabel = document.getElementById('density-value');
  const pauseButton = document.getElementById('pause-toggle');
  const adaptiveButton = document.getElementById('adaptive-toggle');
  const modeButton = document.getElementById('mode-toggle');
  const impostorButton = document.getElementById('impostor-toggle');
  const cullButton = document.getElementById('cull-toggle');
  const clearButton = document.getElementById('clear-button');
  const screenshotButton = document.getElementById('screenshot-button');
  const fpsCounter = document.getElementById('fps-counter');
  const snapXButton = document.getElementById('snap-x');
  const snapYButton = document.getElementById('snap-y');
  const snapZButton = document.getElementById('snap-z');
  const resetOrientButton = document.getElementById('reset-orient');
  const orientationCanvas = document.getElementById('orientation-canvas');

  const renderer = new T.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.set(0, 0, 20);

  const controls = new T.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.25;
  controls.enableZoom = true;

  scene.add(new T.AmbientLight(0xffffff, 0.55));
  const directionalLight = new T.DirectionalLight(0xffffff, 0.55);
  directionalLight.position.set(0, 1, 1);
  scene.add(directionalLight);

  const orientationRenderer = new T.WebGLRenderer({
    canvas: orientationCanvas,
    alpha: true,
    antialias: true,
  });
  orientationRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  orientationRenderer.setSize(140, 140, false);
  const orientationScene = new T.Scene();
  const orientationCamera = new T.PerspectiveCamera(70, 1, 0.1, 20);
  orientationCamera.position.set(0, 0, 2.4);
  const axesRoot = new T.Object3D();
  axesRoot.add(buildThickAxes(T));
  orientationScene.add(axesRoot);

  const colorPositive = new T.Color(colors.positive);
  const colorNegative = new T.Color(colors.negative);
  const tempObject = new T.Object3D();
  const sizeVec = new T.Vector2();
  const initialCameraPosition = camera.position.clone();
  const initialTarget = controls.target.clone();
  const initialUp = camera.up.clone();

  let currentOrbital = null;
  let currentOrbitalData = readOrbitalData(buttons[0]);
  let currentMaxPsi2 = 1e-6;
  let orbitalVisible = true;
  let paused = false;
  let adaptiveEnabled = false;
  let occlusionEnabled = false;
  let impostorEnabled = false;
  let renderMode = 'instanced';
  let adaptiveFrame = 0;
  let gpuRT = null;
  let gpuPoints = null;
  let gpuSupportLogged = false;
  let regenerateTimer = null;
  let resizeTimer = null;
  let cameraTween = null;
  let isCameraTransitioning = false;
  let prevFpsTime = performance.now();
  let fpsFrames = 0;

  const webgpu = makeWebGPU();

  function getDensity() {
    return parseInt(densitySlider.value, 10);
  }

  function getDesiredDpr() {
    const nativeDpr = Math.min(window.devicePixelRatio || 1, 2);
    return getDensity() > dprGate.HIGH_DENSITY_THRESHOLD
      ? Math.min(nativeDpr, dprGate.MAX_DPR_HIGH)
      : nativeDpr;
  }

  function updateDensityLabel() {
    densityValueLabel.textContent = getDensity().toLocaleString();
  }

  function updateModeButtonText() {
    modeButton.textContent = modeLabel(renderMode, !!navigator.gpu);
  }

  function updateAdaptiveButtonText() {
    adaptiveButton.textContent = adaptiveEnabled ? 'Adaptive On' : 'Adaptive Off';
  }

  function updatePauseButtonText() {
    pauseButton.textContent = paused ? 'Resume' : 'Pause';
  }

  function updateCullButtonText() {
    cullButton.textContent = occlusionEnabled ? 'Cull: On' : 'Cull: Off';
  }

  function updateImpostorButtonState() {
    if (renderMode === 'instanced') {
      impostorButton.disabled = false;
      impostorButton.textContent = impostorEnabled ? 'Impostor: On' : 'Impostor: Off';
    } else {
      impostorButton.disabled = true;
      impostorButton.textContent = 'Impostor: N/A';
    }
  }

  function updateCanvasVisibility() {
    const webgpuActive = renderMode === 'webgpu' && webgpu.initialized;
    if (webgpu.canvas) {
      webgpu.canvas.style.display = webgpuActive ? 'block' : 'none';
    }
    renderer.domElement.style.opacity = webgpuActive ? '0' : '1';
  }

  function syncRendererSize() {
    const width = Math.max(1, canvasContainer.clientWidth);
    const height = Math.max(1, canvasContainer.clientHeight);
    renderer.setPixelRatio(getDesiredDpr());
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    syncPointOrGpuUniforms(currentOrbital);
  }

  function readOrbitalData(button) {
    return {
      n: parseInt(button.dataset.n, 10),
      l: parseInt(button.dataset.l, 10),
      m: parseInt(button.dataset.m, 10),
    };
  }

  function selectOrbital(button) {
    buttons.forEach((candidate) => candidate.classList.toggle('active', candidate === button));
    currentOrbitalData = readOrbitalData(button);
    orbitalVisible = true;
    adaptiveFrame = 0;
    regenerate();
  }

  function scheduleRegenerate(delay = 80) {
    if (regenerateTimer) window.clearTimeout(regenerateTimer);
    regenerateTimer = window.setTimeout(() => {
      regenerateTimer = null;
      if (orbitalVisible) {
        regenerate();
      } else if (renderMode === 'webgpu') {
        renderCurrentFrame(false);
      }
    }, delay);
  }

  function disposeObject(root) {
    if (!root) return;

    const geometries = new Set();
    const materials = new Set();

    root.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      if (Array.isArray(node.material)) {
        node.material.forEach((material) => material && materials.add(material));
      } else if (node.material) {
        materials.add(node.material);
      }
    });

    root.parent?.remove(root);
    geometries.forEach((geometry) => geometry.dispose?.());
    materials.forEach((material) => material.dispose?.());
  }

  function disposeCurrentOrbital() {
    const orbitalToDispose = currentOrbital;
    currentOrbital = null;

    if (orbitalToDispose) {
      disposeObject(orbitalToDispose);
    }

    if (gpuRT) {
      gpuRT.dispose?.();
      gpuRT = null;
    }

    if (gpuPoints === orbitalToDispose) {
      gpuPoints = null;
    }
  }

  function clearOrbitalSelection() {
    if (regenerateTimer) {
      window.clearTimeout(regenerateTimer);
      regenerateTimer = null;
    }
    orbitalVisible = false;
    disposeCurrentOrbital();
    adaptiveFrame = 0;
    if (webgpu.initialized) {
      webgpu.numPoints = 0;
    }
    renderCurrentFrame(false);
  }

  function supportsGpuSampling() {
    return renderer.capabilities.isWebGL2
      && !!(renderer.extensions.get('EXT_color_buffer_float') || renderer.extensions.get('WEBGL_color_buffer_float'));
  }

  function getSamplingTables(n, l, m) {
    const { invCdf } = LUT.getRadial(n, l);
    const angular = LUT.getAngular(l, m);
    return {
      radialArray: invCdf._cpuArray,
      radialSize: invCdf.image.width,
      invThetaData: angular.invThetaData,
      invPhiData: angular.invPhiData,
      thetaSize: angular.thetaSize,
      phiSize: angular.phiSize,
    };
  }

  function sampleTexture1D(data, size, u) {
    const clamped = Math.min(Math.max(u, 0), 1) * (size - 1);
    const i0 = Math.floor(clamped);
    const i1 = Math.min(size - 1, i0 + 1);
    const t = clamped - i0;
    const a = data[i0 * 4];
    const b = data[i1 * 4];
    return a + (b - a) * t;
  }

  function sampleTexture2DRow(data, row, rowSize, u) {
    const clamped = Math.min(Math.max(u, 0), 1) * (rowSize - 1);
    const i0 = Math.floor(clamped);
    const i1 = Math.min(rowSize - 1, i0 + 1);
    const t = clamped - i0;
    const base = row * rowSize * 4;
    const a = data[base + i0 * 4];
    const b = data[base + i1 * 4];
    return a + (b - a) * t;
  }

  function sampleOrbitalPoint(n, l, m) {
    const tables = getSamplingTables(n, l, m);
    const r = sampleTexture1D(tables.radialArray, tables.radialSize, Math.random()) * maxRadius;
    const thetaNorm = sampleTexture1D(tables.invThetaData, tables.thetaSize, Math.random());
    const theta = thetaNorm * Math.PI;
    const thetaRowF = Math.min(Math.max(thetaNorm * (tables.thetaSize - 1), 0), tables.thetaSize - 1);
    const row0 = Math.floor(thetaRowF);
    const row1 = Math.min(tables.thetaSize - 1, row0 + 1);
    const rowT = thetaRowF - row0;
    const phiSample = Math.random();
    const phiNorm0 = sampleTexture2DRow(tables.invPhiData, row0, tables.phiSize, phiSample);
    const phiNorm1 = sampleTexture2DRow(tables.invPhiData, row1, tables.phiSize, phiSample);
    const phi = (phiNorm0 + (phiNorm1 - phiNorm0) * rowT) * 2 * Math.PI;

    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const x = r * sinTheta * cosPhi;
    const y = r * sinTheta * sinPhi;
    const z = r * cosTheta;
    const psi = getWaveFunctionValue(n, l, m, r, theta, phi);
    const scale = 0.55 + 0.45 * Math.min(1, Math.abs(psi) / Math.sqrt(currentMaxPsi2));

    return { x, y, z, psi, scale };
  }

  function sampleOrbitalPointWithSign(n, l, m, isPositive, attemptLimit = 64) {
    for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
      const sample = sampleOrbitalPoint(n, l, m);
      if ((sample.psi >= 0) === isPositive) return sample;
    }
    return null;
  }

  function buildPointsMaterial() {
    const amplitudeScale = 1 / Math.max(1e-6, Math.sqrt(currentMaxPsi2));
    return new T.ShaderMaterial({
      uniforms: {
        uPointSize: { value: 0.08 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uViewportHeight: { value: renderer.getSize(sizeVec).y },
        uFov: { value: camera.fov },
        uAlphaBase: { value: 0.72 },
        uAlphaScale: { value: amplitudeScale },
        uSizeScale: { value: amplitudeScale },
      },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aPsi;
        uniform float uPointSize;
        uniform float uPixelRatio;
        uniform float uViewportHeight;
        uniform float uFov;
        uniform float uSizeScale;
        varying vec3 vColor;
        varying float vPsi;
        void main() {
          vColor = aColor;
          vPsi = aPsi;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float scale = uPixelRatio * (0.5 * uViewportHeight) / tan(0.5 * radians(uFov));
          float sizeAmp = mix(0.65, 1.25, clamp(abs(aPsi) * uSizeScale, 0.0, 1.0));
          gl_PointSize = uPointSize * (scale / max(0.1, -mv.z)) * sizeAmp;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform float uAlphaBase;
        uniform float uAlphaScale;
        varying vec3 vColor;
        varying float vPsi;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float radius = length(uv);
          float mask = smoothstep(1.0, 0.82, 1.0 - radius);
          float alpha = uAlphaBase * mask * clamp(abs(vPsi) * uAlphaScale, 0.0, 1.0);
          if (alpha <= 0.001) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: !occlusionEnabled,
      depthTest: occlusionEnabled,
      blending: T.AdditiveBlending,
    });
  }

  function createPointsObject(numPoints) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(numPoints * 3), 3));
    geometry.setAttribute('aColor', new T.BufferAttribute(new Float32Array(numPoints * 3), 3));
    geometry.setAttribute('aPsi', new T.BufferAttribute(new Float32Array(numPoints), 1));
    const points = new T.Points(geometry, buildPointsMaterial());
    points.userData = {
      isOrbital: true,
      renderKind: 'points',
      numPoints,
      lastConfig: { ...currentOrbitalData, numPoints },
    };
    fillPointGeometry(points.geometry, numPoints);
    syncPointOrGpuUniforms(points);
    return points;
  }

  function fillPointGeometry(geometry, numPoints, subsetFraction = 1) {
    const positionAttr = geometry.getAttribute('position');
    const colorAttr = geometry.getAttribute('aColor');
    const psiAttr = geometry.getAttribute('aPsi');
    const positionArray = positionAttr.array;
    const colorArray = colorAttr.array;
    const psiArray = psiAttr.array;
    const updates = subsetFraction >= 1 ? numPoints : Math.max(1, Math.floor(numPoints * subsetFraction));
    const { n, l, m } = currentOrbitalData;

    for (let i = 0; i < updates; i += 1) {
      const sampleIndex = subsetFraction >= 1 ? i : ((Math.random() * numPoints) | 0);
      const sample = sampleOrbitalPoint(n, l, m);
      const color = sample.psi >= 0 ? colorPositive : colorNegative;
      const offset = sampleIndex * 3;

      positionArray[offset] = sample.x;
      positionArray[offset + 1] = sample.y;
      positionArray[offset + 2] = sample.z;
      colorArray[offset] = color.r;
      colorArray[offset + 1] = color.g;
      colorArray[offset + 2] = color.b;
      psiArray[sampleIndex] = sample.psi;
    }

    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    psiAttr.needsUpdate = true;
  }

  function buildInstancedMaterial(color) {
    return new T.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      depthWrite: !occlusionEnabled,
      depthTest: occlusionEnabled,
      blending: T.AdditiveBlending,
    });
  }

  function buildBillboardMaterial(color) {
    return new T.ShaderMaterial({
      uniforms: {
        uColor: { value: color.clone() },
      },
      vertexShader: `
        attribute vec3 instancePosition;
        attribute float instanceScale;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 toCamera = normalize(cameraPosition - instancePosition);
          vec3 upHint = abs(toCamera.y) > 0.99 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
          vec3 right = normalize(cross(upHint, toCamera));
          vec3 up = normalize(cross(toCamera, right));
          vec3 local = position * instanceScale;
          vec3 worldPos = instancePosition + right * local.x + up * local.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          vec2 centered = vUv * 2.0 - 1.0;
          float radius = length(centered);
          float alpha = smoothstep(1.0, 0.82, 1.0 - radius);
          if (alpha <= 0.001) discard;
          gl_FragColor = vec4(uColor, alpha * 0.9);
        }
      `,
      transparent: true,
      depthWrite: !occlusionEnabled,
      depthTest: occlusionEnabled,
      blending: T.AdditiveBlending,
    });
  }

  function setInstancedSlot(mesh, slotIndex, sample, useImpostor) {
    if (useImpostor) {
      const positionAttr = mesh.geometry.getAttribute('instancePosition');
      const scaleAttr = mesh.geometry.getAttribute('instanceScale');
      const offset = slotIndex * 3;
      positionAttr.array[offset] = sample ? sample.x : 0;
      positionAttr.array[offset + 1] = sample ? sample.y : 0;
      positionAttr.array[offset + 2] = sample ? sample.z : 0;
      scaleAttr.array[slotIndex] = sample ? sample.scale : 0;
      positionAttr.needsUpdate = true;
      scaleAttr.needsUpdate = true;
      return;
    }

    tempObject.position.set(sample ? sample.x : 0, sample ? sample.y : 0, sample ? sample.z : 0);
    tempObject.scale.setScalar(sample ? sample.scale : 0);
    tempObject.updateMatrix();
    mesh.setMatrixAt(slotIndex, tempObject.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }

  function createInstancedMeshSet(samples, color, useImpostor) {
    const capacity = Math.max(1, samples.length);

    if (useImpostor) {
      const geometry = new T.PlaneBufferGeometry(0.24, 0.24);
      const mesh = new T.InstancedMesh(geometry, buildBillboardMaterial(color), capacity);
      const positions = new Float32Array(capacity * 3);
      const scales = new Float32Array(capacity);
      const positionAttr = new T.InstancedBufferAttribute(positions, 3);
      const scaleAttr = new T.InstancedBufferAttribute(scales, 1);
      positionAttr.setUsage(T.DynamicDrawUsage);
      scaleAttr.setUsage(T.DynamicDrawUsage);
      mesh.geometry.setAttribute('instancePosition', positionAttr);
      mesh.geometry.setAttribute('instanceScale', scaleAttr);
      for (let i = 0; i < capacity; i += 1) {
        setInstancedSlot(mesh, i, samples[i] || null, true);
      }
      mesh.userData = { isOrbital: true };
      return mesh;
    }

    const geometry = new T.SphereGeometry(0.12, 6, 6);
    const mesh = new T.InstancedMesh(geometry, buildInstancedMaterial(color), capacity);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    for (let i = 0; i < capacity; i += 1) {
      setInstancedSlot(mesh, i, samples[i] || null, false);
    }
    mesh.userData = { isOrbital: true };
    return mesh;
  }

  function createInstancedOrbital(numPoints) {
    const { n, l, m } = currentOrbitalData;
    const positiveSamples = [];
    const negativeSamples = [];

    for (let i = 0; i < numPoints; i += 1) {
      const sample = sampleOrbitalPoint(n, l, m);
      if (sample.psi >= 0) positiveSamples.push(sample);
      else negativeSamples.push(sample);
    }

    const useImpostor = impostorEnabled;
    const positiveMesh = createInstancedMeshSet(positiveSamples, colorPositive, useImpostor);
    const negativeMesh = createInstancedMeshSet(negativeSamples, colorNegative, useImpostor);
    const group = new T.Group();
    group.add(positiveMesh);
    group.add(negativeMesh);
    group.userData = {
      isOrbital: true,
      renderKind: 'instanced',
      useImpostor,
      posCapacity: positiveMesh.count,
      negCapacity: negativeMesh.count,
      lastConfig: { ...currentOrbitalData, numPoints },
    };
    return group;
  }

  function refreshInstancedOrbital(group, subsetFraction = 1) {
    const { n, l, m } = currentOrbitalData;
    const positiveMesh = group.children[0];
    const negativeMesh = group.children[1];
    const positiveUpdates = subsetFraction >= 1
      ? group.userData.posCapacity
      : Math.max(1, Math.floor(group.userData.posCapacity * subsetFraction));
    const negativeUpdates = subsetFraction >= 1
      ? group.userData.negCapacity
      : Math.max(1, Math.floor(group.userData.negCapacity * subsetFraction));

    for (let i = 0; i < positiveUpdates; i += 1) {
      const slot = subsetFraction >= 1 ? i : ((Math.random() * group.userData.posCapacity) | 0);
      const sample = sampleOrbitalPointWithSign(n, l, m, true);
      setInstancedSlot(positiveMesh, slot, sample, group.userData.useImpostor);
    }

    for (let i = 0; i < negativeUpdates; i += 1) {
      const slot = subsetFraction >= 1 ? i : ((Math.random() * group.userData.negCapacity) | 0);
      const sample = sampleOrbitalPointWithSign(n, l, m, false);
      setInstancedSlot(negativeMesh, slot, sample, group.userData.useImpostor);
    }
  }

  function syncPointOrGpuUniforms(object) {
    if (!object || !object.material?.uniforms) return;
    const uniforms = object.material.uniforms;
    const viewportHeight = renderer.getSize(sizeVec).y;
    if (uniforms.uPixelRatio) uniforms.uPixelRatio.value = renderer.getPixelRatio();
    if (uniforms.uViewportHeight) uniforms.uViewportHeight.value = viewportHeight;
    if (uniforms.uFov) uniforms.uFov.value = camera.fov;
  }

  async function ensureWebGPUReady() {
    const ok = await initWebGPU(webgpu, canvasContainer);
    if (!ok) {
      return false;
    }
    updateCanvasVisibility();
    return true;
  }

  function regenerate() {
    if (!orbitalVisible) {
      return;
    }

    syncRendererSize();
    disposeCurrentOrbital();
    currentMaxPsi2 = Math.max(estimateMaxPsi2(currentOrbitalData.n, currentOrbitalData.l, currentOrbitalData.m, 800), 1e-6);
    const numPoints = getDensity();

    if (renderMode === 'webgpu') {
      ensureWebGPUReady().then((ok) => {
        if (!ok) {
          console.warn('WebGPU unavailable; falling back to Instanced mode.');
          renderMode = 'instanced';
          updateModeButtonText();
          updateImpostorButtonState();
          updateCanvasVisibility();
          regenerate();
          return;
        }
        ensureWebGPUParticles(webgpu, currentOrbitalData.n, currentOrbitalData.l, currentOrbitalData.m, numPoints);
        renderCurrentFrame(false);
      });
      return;
    }

    if (renderMode === 'gpu') {
      if (!supportsGpuSampling()) {
        console.warn('Float render targets unavailable; falling back to Points mode.');
        renderMode = 'points';
        updateModeButtonText();
        updateImpostorButtonState();
        updateCanvasVisibility();
        regenerate();
        return;
      }

      if (!gpuSupportLogged) {
        console.info('GPU sampling enabled (float render targets available)');
        gpuSupportLogged = true;
      }

      gpuRT = renderGPUSamples(renderer, LUT, {
        n: currentOrbitalData.n,
        l: currentOrbitalData.l,
        m: currentOrbitalData.m,
        numPoints,
      });

      if (!gpuRT) {
        console.warn('GPU sampling failed; falling back to Points mode.');
        renderMode = 'points';
        updateModeButtonText();
        updateImpostorButtonState();
        updateCanvasVisibility();
        regenerate();
        return;
      }

      gpuPoints = createGPUPointsMesh(gpuRT, T, occlusionEnabled, numPoints);
      gpuPoints.userData = {
        isOrbital: true,
        renderKind: 'gpu',
        numPoints,
        lastConfig: { ...currentOrbitalData, numPoints },
      };
      currentOrbital = gpuPoints;
      syncPointOrGpuUniforms(currentOrbital);
      scene.add(currentOrbital);
      return;
    }

    if (renderMode === 'points') {
      currentOrbital = createPointsObject(numPoints);
      scene.add(currentOrbital);
      return;
    }

    currentOrbital = createInstancedOrbital(numPoints);
    scene.add(currentOrbital);
  }

  function resampleGpu() {
    if (!currentOrbital || currentOrbital.userData.renderKind !== 'gpu') return;
    const numPoints = currentOrbital.userData.numPoints;
    const nextRT = renderGPUSamples(renderer, LUT, {
      n: currentOrbitalData.n,
      l: currentOrbitalData.l,
      m: currentOrbitalData.m,
      numPoints,
    });

    if (!nextRT) {
      console.warn('GPU sampling failed during resample; falling back to Points mode.');
      renderMode = 'points';
      updateModeButtonText();
      updateImpostorButtonState();
      updateCanvasVisibility();
      regenerate();
      return;
    }

    const previousRT = gpuRT;
    gpuRT = nextRT;
    currentOrbital.material.uniforms.uSamples.value = nextRT.texture;
    previousRT?.dispose?.();
  }

  function resamplePoints() {
    if (!currentOrbital || currentOrbital.userData.renderKind !== 'points') return;
    const subsetFraction = adaptiveEnabled ? sampling.SUBSET_RESAMPLE_FRACTION : 1;
    fillPointGeometry(currentOrbital.geometry, currentOrbital.userData.numPoints, subsetFraction);
  }

  function resampleInstanced() {
    if (!currentOrbital || currentOrbital.userData.renderKind !== 'instanced') return;
    refreshInstancedOrbital(currentOrbital, adaptiveEnabled ? sampling.SUBSET_RESAMPLE_FRACTION : 1);
  }

  function resampleCurrentOrbital() {
    if (!orbitalVisible) return;
    if (renderMode === 'gpu') {
      resampleGpu();
      return;
    }
    if (renderMode === 'points') {
      resamplePoints();
      return;
    }
    if (renderMode === 'instanced') {
      resampleInstanced();
    }
  }

  function triggerDownload(dataUrl, filename) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function takeScreenshot(filename = 'orbital_screenshot.png') {
    if (renderMode === 'webgpu' && webgpu.initialized) {
      renderWebGPUFrame(webgpu, camera, adaptiveFrame, false);
      await webgpu.device?.queue?.onSubmittedWorkDone?.();
      triggerDownload(webgpu.canvas.toDataURL('image/png'), filename);
      return;
    }

    const previousColor = renderer.getClearColor(new T.Color()).getHex();
    const previousAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    triggerDownload(renderer.domElement.toDataURL('image/png'), filename);
    renderer.setClearColor(previousColor, previousAlpha);
    renderCurrentFrame(false);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - (Math.pow(-2 * t + 2, 3) / 2);
  }

  function startCameraTransition(targetPosition, targetLookAt, targetUp, duration = 650) {
    cameraTween = {
      startTime: performance.now(),
      duration,
      fromPosition: camera.position.clone(),
      toPosition: targetPosition.clone(),
      fromTarget: controls.target.clone(),
      toTarget: targetLookAt.clone(),
      fromUp: camera.up.clone(),
      toUp: targetUp.clone(),
    };
    isCameraTransitioning = true;
    controls.enabled = false;
  }

  function computeSnap(axis) {
    const target = controls.target.clone();
    const distance = camera.position.clone().sub(target).length() || 20;
    const up = new T.Vector3(0, 1, 0);
    const offset = new T.Vector3();

    if (axis === 'x') {
      offset.set(distance, 0, 0);
    } else if (axis === 'y') {
      offset.set(0, distance, 0);
      up.set(0, 0, 1);
    } else {
      offset.set(0, 0, distance);
    }

    return {
      position: target.clone().add(offset),
      target,
      up,
    };
  }

  function snapTo(axis) {
    const snap = computeSnap(axis);
    startCameraTransition(snap.position, snap.target, snap.up);
  }

  function resetOrientation() {
    startCameraTransition(initialCameraPosition, initialTarget, initialUp);
  }

  function updateCameraTransition(now) {
    if (!isCameraTransitioning || !cameraTween) return;

    const progress = Math.min(1, (now - cameraTween.startTime) / cameraTween.duration);
    const eased = easeInOutCubic(progress);

    camera.position.copy(cameraTween.fromPosition.clone().lerp(cameraTween.toPosition, eased));
    controls.target.copy(cameraTween.fromTarget.clone().lerp(cameraTween.toTarget, eased));
    camera.up.copy(cameraTween.fromUp.clone().lerp(cameraTween.toUp, eased).normalize());
    camera.lookAt(controls.target);

    if (progress >= 1) {
      controls.enabled = true;
      isCameraTransitioning = false;
      cameraTween = null;
    }
  }

  function renderCurrentFrame(shouldComputeWebGPU) {
    if (renderMode === 'webgpu' && webgpu.initialized) {
      renderWebGPUFrame(webgpu, camera, adaptiveFrame, shouldComputeWebGPU && orbitalVisible);
      if (shouldComputeWebGPU && orbitalVisible) adaptiveFrame += 1;
    } else {
      renderer.render(scene, camera);
    }

    axesRoot.quaternion.copy(camera.quaternion);
    orientationRenderer.render(orientationScene, orientationCamera);
  }

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();

    updateCameraTransition(now);
    controls.update();

    if (!paused) {
      resampleCurrentOrbital();
    }

    renderCurrentFrame(!paused);

    fpsFrames += 1;
    if (now - prevFpsTime >= 1000) {
      fpsCounter.textContent = `FPS: ${fpsFrames}`;
      fpsFrames = 0;
      prevFpsTime = now;
    }
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => selectOrbital(button));
  });

  densitySlider.addEventListener('input', () => {
    updateDensityLabel();
    syncRendererSize();
    if (orbitalVisible) scheduleRegenerate(120);
  });

  pauseButton.addEventListener('click', () => {
    paused = !paused;
    updatePauseButtonText();
  });

  adaptiveButton.addEventListener('click', () => {
    adaptiveEnabled = !adaptiveEnabled;
    adaptiveFrame = 0;
    updateAdaptiveButtonText();
  });

  modeButton.addEventListener('click', async () => {
    if (renderMode === 'instanced') renderMode = 'points';
    else if (renderMode === 'points') renderMode = 'gpu';
    else if (renderMode === 'gpu') renderMode = 'webgpu';
    else renderMode = 'instanced';

    if (renderMode === 'webgpu') {
      const ok = await ensureWebGPUReady();
      if (!ok) {
        console.warn('WebGPU unavailable; skipping to Instanced mode.');
        renderMode = 'instanced';
      }
    }

    updateModeButtonText();
    updateImpostorButtonState();
    updateCanvasVisibility();

    if (orbitalVisible) regenerate();
    else renderCurrentFrame(false);
  });

  cullButton.addEventListener('click', () => {
    occlusionEnabled = !occlusionEnabled;
    updateCullButtonText();
    if (orbitalVisible) regenerate();
  });

  impostorButton.addEventListener('click', () => {
    if (renderMode !== 'instanced') return;
    impostorEnabled = !impostorEnabled;
    updateImpostorButtonState();
    if (orbitalVisible) regenerate();
  });

  clearButton.addEventListener('click', clearOrbitalSelection);
  screenshotButton.addEventListener('click', () => { void takeScreenshot(); });
  snapXButton.addEventListener('click', () => snapTo('x'));
  snapYButton.addEventListener('click', () => snapTo('y'));
  snapZButton.addEventListener('click', () => snapTo('z'));
  resetOrientButton.addEventListener('click', resetOrientation);

  window.addEventListener('resize', () => {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resizeTimer = null;
      syncRendererSize();
      renderCurrentFrame(false);
    }, 120);
  });

  buttons[0].classList.add('active');
  updateDensityLabel();
  updatePauseButtonText();
  updateAdaptiveButtonText();
  updateModeButtonText();
  updateCullButtonText();
  updateImpostorButtonState();
  updateCanvasVisibility();
  syncRendererSize();
  regenerate();
  animate();
}

function buildThickAxes(T3, length = 1.35, radius = 0.07, headLength = 0.28, headRadius = 0.14) {
  const group = new T3.Group();
  const segments = 16;

  function makeAxis(color, axis) {
    const shaftLength = Math.max(0.001, length - headLength);
    const material = new T3.MeshBasicMaterial({ color, toneMapped: false });
    const shaft = new T3.Mesh(new T3.CylinderGeometry(radius, radius, shaftLength, segments), material);
    const head = new T3.Mesh(new T3.ConeGeometry(headRadius, headLength, segments), material);

    if (axis === 'x') {
      shaft.rotation.z = Math.PI / 2;
      shaft.position.x = shaftLength / 2;
      head.rotation.z = Math.PI / 2;
      head.position.x = shaftLength + headLength / 2;
    } else if (axis === 'y') {
      shaft.position.y = shaftLength / 2;
      head.position.y = shaftLength + headLength / 2;
    } else {
      shaft.rotation.x = -Math.PI / 2;
      shaft.position.z = shaftLength / 2;
      head.rotation.x = -Math.PI / 2;
      head.position.z = shaftLength + headLength / 2;
    }

    const axisGroup = new T3.Group();
    axisGroup.add(shaft);
    axisGroup.add(head);
    return axisGroup;
  }

  group.add(makeAxis(0xff5555, 'x'));
  group.add(makeAxis(0x55ff55, 'y'));
  group.add(makeAxis(0x5588ff, 'z'));
  return group;
}
