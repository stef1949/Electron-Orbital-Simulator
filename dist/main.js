import { maxRadius, colors, sampling, modeLabel } from './config.js';
import { getWaveFunctionValue, estimateMaxPsi2 } from './math/wave.js';
import * as LUT from './sampling/lut.js';
import { renderGPUSamples, createGPUPointsMesh } from './gpu/webglSampler.js';
import { makeWebGPU, initWebGPU, ensureWebGPUParticles, renderWebGPUFrame } from './gpu/webgpuPipeline.js';
import { getTHREE } from './threeRef.js';
function hexToColor(hex) { const T = getTHREE(); return new T.Color(hex); }
window.addEventListener('load', async () => {
    const T = getTHREE();
    // --- Scene ---
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const canvas = document.getElementById('orbital-canvas');
    const context = canvas.getContext('webgl2');
    const renderer = new T.WebGLRenderer({ canvas, context, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    camera.position.z = 20;
    const controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    // Lights
    scene.add(new T.AmbientLight(0xffffff, 0.5));
    const dir = new T.DirectionalLight(0xffffff, 0.5);
    dir.position.set(0, 1, 1);
    scene.add(dir);
    // UI Elements
    const buttons = document.querySelectorAll('#orbital-panel .orbital-button');
    const densitySlider = document.getElementById('density-slider');
    const densityValueLabel = document.getElementById('density-value');
    const pauseButton = document.getElementById('pause-toggle');
    const adaptiveButton = document.getElementById('adaptive-toggle');
    const modeButton = document.getElementById('mode-toggle');
    const cullButton = document.getElementById('cull-toggle');
    const clearButton = document.getElementById('clear-button');
    const screenshotButton = document.getElementById('screenshot-button');
    const fpsCounter = document.getElementById('fps-counter');
    // State
    let currentOrbital = null;
    let currentOrbitalData = { n: 2, l: 1, m: -1 };
    let paused = false;
    let adaptiveEnabled = false;
    let occlusionEnabled = false;
    let renderMode = 'gpu';
    let gpuRT = null;
    let gpuPoints = null;
    let gpuSupportLogged = false;
    let adaptiveFrame = 0;
    const colorPositive = hexToColor(colors.positive);
    const colorNegative = hexToColor(colors.negative);
    // WebGPU
    const webgpu = makeWebGPU();
    function updateModeButtonText() { modeButton.textContent = modeLabel(renderMode, !!navigator.gpu); }
    function clearOrbital() {
        scene.children.slice().forEach((child) => { if (child.userData && child.userData.isOrbital) {
            child.geometry?.dispose?.();
            child.material?.dispose?.();
            scene.remove(child);
        } });
        if (gpuPoints) {
            gpuPoints.geometry?.dispose?.();
            gpuPoints.material?.dispose?.();
            scene.remove(gpuPoints);
            gpuPoints = null;
        }
        if (gpuRT) {
            gpuRT.dispose?.();
            gpuRT = null;
        }
        // Also hide WebGPU canvas so previous frame isn't overlaid
        try {
            if (webgpu.canvas)
                webgpu.canvas.style.display = 'none';
        }
        catch { }
        currentOrbital = null;
    }
    function regenerate() {
        clearOrbital();
        const { n, l, m } = currentOrbitalData;
        const numPoints = parseInt(densitySlider.value);
        // Hide WebGPU canvas unless actively rendering in WebGPU mode
        if (renderMode !== 'webgpu' && webgpu.canvas) {
            try {
                webgpu.canvas.style.display = 'none';
            }
            catch { }
        }
        if (renderMode === 'webgpu') {
            initWebGPU(webgpu, document.getElementById('canvas-container')).then(ok => {
                if (ok) {
                    ensureWebGPUParticles(webgpu, n, l, m, numPoints);
                    try {
                        webgpu.canvas.style.display = 'block';
                    }
                    catch { }
                }
                else {
                    renderMode = 'points';
                }
                updateModeButtonText();
                if (!ok)
                    regenerate();
            });
            return;
        }
        if (renderMode === 'gpu') {
            const supports = renderer.capabilities.isWebGL2 && (renderer.extensions.get('EXT_color_buffer_float') || renderer.extensions.get('WEBGL_color_buffer_float'));
            if (!supports) {
                renderMode = 'points';
                updateModeButtonText();
            }
            else if (!gpuSupportLogged) {
                console.info('GPU sampling enabled (float render targets available)');
                gpuSupportLogged = true;
            }
            const rt = renderGPUSamples(renderer, { getRadial: LUT.getRadial, getAngular: LUT.getAngular }, { n, l, m, numPoints });
            if (!rt) {
                renderMode = 'points';
                updateModeButtonText();
                return regenerate();
            }
            gpuRT = rt;
            gpuPoints = createGPUPointsMesh(rt, T, occlusionEnabled);
            gpuPoints.userData = { isOrbital: true };
            scene.add(gpuPoints);
            currentOrbital = gpuPoints;
            return;
        }
        if (renderMode === 'points') {
            const geom = new T.BufferGeometry();
            const posArr = new Float32Array(numPoints * 3);
            const colArr = new Float32Array(numPoints * 3);
            geom.setAttribute('position', new T.BufferAttribute(posArr, 3));
            geom.setAttribute('color', new T.BufferAttribute(colArr, 3));
            const mat = new T.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: !occlusionEnabled, depthTest: occlusionEnabled });
            const points = new T.Points(geom, mat);
            points.userData = { isOrbital: true };
            scene.add(points);
            currentOrbital = points;
            // Fill using importance sampling (more efficient and accurate than rejection sampling)
            const { invCdf: radialInvCdf } = LUT.getRadial(n, l);
            const { invThetaData, invPhiData, thetaSize, phiSize } = LUT.getAngular(l, m);
            const radialArray = radialInvCdf._cpuArray;
            const radialSize = radialInvCdf.image.width;
            for (let i = 0; i < numPoints; i++) {
                // Importance sampling using inverse CDFs
                const u1 = Math.random(), u2 = Math.random(), u3 = Math.random();
                // Sample radius from radial inverse CDF
                const rIdx = Math.min(Math.floor(u1 * radialSize), radialSize - 1);
                const rNorm = radialArray[rIdx * 4]; // normalized r in [0,1]
                const r = rNorm * maxRadius;
                // Sample theta from angular inverse CDF
                const thetaIdx = Math.min(Math.floor(u2 * thetaSize), thetaSize - 1);
                const thetaNorm = invThetaData[thetaIdx * 4]; // normalized theta in [0,1]
                const theta = thetaNorm * Math.PI;
                // Sample phi from conditional phi inverse CDF (given theta)
                const phiIdx = Math.min(Math.floor(u3 * phiSize), phiSize - 1);
                const phiDataIdx = (thetaIdx * phiSize + phiIdx) * 4;
                const phiNorm = invPhiData[phiDataIdx]; // normalized phi in [0,1]
                const phi = phiNorm * 2 * Math.PI;
                // Convert to Cartesian coordinates
                const sinTheta = Math.sin(theta);
                const cosTheta = Math.cos(theta);
                const cosPhi = Math.cos(phi);
                const sinPhi = Math.sin(phi);
                const x = r * sinTheta * cosPhi;
                const y = r * sinTheta * sinPhi;
                const z = r * cosTheta;
                // Get wave function value for color
                const psi = getWaveFunctionValue(n, l, m, r, theta, phi);
                const c = psi >= 0 ? colorPositive : colorNegative;
                // Store position and color
                const idx = i * 3;
                posArr[idx] = x;
                posArr[idx + 1] = y;
                posArr[idx + 2] = z;
                colArr[idx] = c.r;
                colArr[idx + 1] = c.g;
                colArr[idx + 2] = c.b;
            }
            geom.getAttribute('position').needsUpdate = true;
            geom.getAttribute('color').needsUpdate = true;
            return;
        }
        if (renderMode === 'instanced') {
            const sphereGeo = new T.SphereGeometry(0.12, 6, 6);
            sphereGeo.computeBoundingSphere();
            const matPos = new T.MeshBasicMaterial({ color: colorPositive, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: !occlusionEnabled, depthTest: occlusionEnabled });
            const matNeg = new T.MeshBasicMaterial({ color: colorNegative, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: !occlusionEnabled, depthTest: occlusionEnabled });
            const transformsPos = [];
            const transformsNeg = [];
            // Use importance sampling instead of rejection sampling for instanced mode
            const { invCdf: radialInvCdf } = LUT.getRadial(n, l);
            const { invThetaData, invPhiData, thetaSize, phiSize } = LUT.getAngular(l, m);
            const radialArray = radialInvCdf._cpuArray;
            const radialSize = radialInvCdf.image.width;
            for (let i = 0; i < numPoints; i++) {
                const u1 = Math.random(), u2 = Math.random(), u3 = Math.random();
                // Radial inverse CDF (linear interp)
                const xr = u1 * (radialSize - 1);
                const r0 = Math.floor(xr);
                const r1 = Math.min(r0 + 1, radialSize - 1);
                const tr = xr - r0;
                const rN0 = radialArray[r0 * 4];
                const rN1 = radialArray[r1 * 4];
                const r = ((1 - tr) * rN0 + tr * rN1) * maxRadius;
                // Theta inverse CDF (linear interp)
                const xt = u2 * (thetaSize - 1);
                const t0 = Math.floor(xt);
                const t1 = Math.min(t0 + 1, thetaSize - 1);
                const tt = xt - t0;
                const thN0 = invThetaData[t0 * 4];
                const thN1 = invThetaData[t1 * 4];
                const thN = (1 - tt) * thN0 + tt * thN1;
                const theta = thN * Math.PI;
                // Phi inverse CDF with bilinear row blend
                const xp = u3 * (phiSize - 1);
                const p0 = Math.floor(xp);
                const p1 = Math.min(p0 + 1, phiSize - 1);
                const tp = xp - p0;
                const rowF = Math.max(0, Math.min(thetaSize - 1, thN * (thetaSize - 1)));
                const rt0 = Math.floor(rowF);
                const rt1 = Math.min(rt0 + 1, thetaSize - 1);
                const fr = rowF - rt0;
                const a00 = invPhiData[(rt0 * phiSize + p0) * 4];
                const a01 = invPhiData[(rt0 * phiSize + p1) * 4];
                const a10 = invPhiData[(rt1 * phiSize + p0) * 4];
                const a11 = invPhiData[(rt1 * phiSize + p1) * 4];
                const phiN_row0 = (1 - tp) * a00 + tp * a01;
                const phiN_row1 = (1 - tp) * a10 + tp * a11;
                const phi = ((1 - fr) * phiN_row0 + fr * phiN_row1) * 2 * Math.PI;
                const sinTheta = Math.sin(theta);
                const x = r * sinTheta * Math.cos(phi);
                const y = r * sinTheta * Math.sin(phi);
                const z = r * Math.cos(theta);
                const psi = getWaveFunctionValue(n, l, m, r, theta, phi);
                const psi2 = psi * psi;
                // Scale based on amplitude for visual variety (scientific accuracy maintained through sampling)
                const scale = 0.55 + 0.45 * Math.min(1, Math.sqrt(psi2 / 1e-6)); // normalized scale
                const t = { x, y, z, scale };
                if (psi >= 0)
                    transformsPos.push(t);
                else
                    transformsNeg.push(t);
            }
            const posMesh = new T.InstancedMesh(sphereGeo, matPos, Math.max(1, transformsPos.length));
            const negMesh = new T.InstancedMesh(sphereGeo, matNeg, Math.max(1, transformsNeg.length));
            const dummy = new T.Object3D();
            transformsPos.forEach((t, i) => { dummy.position.set(t.x, t.y, t.z); dummy.scale.setScalar(t.scale); dummy.updateMatrix(); posMesh.setMatrixAt(i, dummy.matrix); });
            transformsNeg.forEach((t, i) => { dummy.position.set(t.x, t.y, t.z); dummy.scale.setScalar(t.scale); dummy.updateMatrix(); negMesh.setMatrixAt(i, dummy.matrix); });
            posMesh.count = Math.max(0, transformsPos.length);
            negMesh.count = Math.max(0, transformsNeg.length);
            posMesh.instanceMatrix.needsUpdate = true;
            negMesh.instanceMatrix.needsUpdate = true;
            posMesh.frustumCulled = false;
            negMesh.frustumCulled = false;
            posMesh.userData = { isOrbital: true };
            negMesh.userData = { isOrbital: true };
            const group = new T.Group();
            group.add(posMesh);
            group.add(negMesh);
            group.userData = { isOrbital: true };
            group.frustumCulled = false;
            scene.add(group);
            currentOrbital = group;
            return;
        }
    }
    function resample() {
        if (renderMode === 'webgpu') {
            renderWebGPUFrame(webgpu, camera, adaptiveFrame++);
            return;
        }
        if (renderMode === 'gpu') {
            const { n, l, m } = currentOrbitalData;
            const numPoints = parseInt(densitySlider.value);
            const rt = renderGPUSamples(renderer, { getRadial: LUT.getRadial, getAngular: LUT.getAngular }, { n, l, m, numPoints });
            if (!rt) {
                renderMode = 'points';
                updateModeButtonText();
                regenerate();
                return;
            }
            gpuRT?.dispose?.();
            gpuRT = rt;
            if (gpuPoints) {
                gpuPoints.material.uniforms.uSamples.value = rt.texture;
            }
            else {
                gpuPoints = createGPUPointsMesh(rt, T, occlusionEnabled);
                gpuPoints.userData = { isOrbital: true };
                scene.add(gpuPoints);
            }
            return;
        }
        if (renderMode === 'points') {
            if (!currentOrbital || currentOrbital.type !== 'Points')
                return;
            const { n, l, m } = currentOrbitalData;
            const numPoints = currentOrbital.geometry.getAttribute('position').array.length / 3;
            if (!adaptiveEnabled) {
                // Full refresh using importance sampling
                const posArr = currentOrbital.geometry.getAttribute('position').array;
                const colArr = currentOrbital.geometry.getAttribute('color').array;
                const { invCdf: radialInvCdf } = LUT.getRadial(n, l);
                const { invThetaData, invPhiData, thetaSize, phiSize } = LUT.getAngular(l, m);
                const radialArray = radialInvCdf._cpuArray;
                const radialSize = radialInvCdf.image.width;
                for (let i = 0; i < numPoints; i++) {
                    const u1 = Math.random(), u2 = Math.random(), u3 = Math.random();
                    // Radial (interp)
                    const xr = u1 * (radialSize - 1);
                    const r0 = Math.floor(xr);
                    const r1 = Math.min(r0 + 1, radialSize - 1);
                    const tr = xr - r0;
                    const rN0 = radialArray[r0 * 4];
                    const rN1 = radialArray[r1 * 4];
                    const r = ((1 - tr) * rN0 + tr * rN1) * maxRadius;
                    // Theta (interp)
                    const xt = u2 * (thetaSize - 1);
                    const t0 = Math.floor(xt);
                    const t1 = Math.min(t0 + 1, thetaSize - 1);
                    const tt = xt - t0;
                    const thN0 = invThetaData[t0 * 4];
                    const thN1 = invThetaData[t1 * 4];
                    const thN = (1 - tt) * thN0 + tt * thN1;
                    const theta = thN * Math.PI;
                    // Phi (bilinear across phi and theta rows)
                    const xp = u3 * (phiSize - 1);
                    const p0 = Math.floor(xp);
                    const p1 = Math.min(p0 + 1, phiSize - 1);
                    const tp = xp - p0;
                    const rowF = Math.max(0, Math.min(thetaSize - 1, thN * (thetaSize - 1)));
                    const rt0 = Math.floor(rowF);
                    const rt1 = Math.min(rt0 + 1, thetaSize - 1);
                    const fr = rowF - rt0;
                    const a00 = invPhiData[(rt0 * phiSize + p0) * 4];
                    const a01 = invPhiData[(rt0 * phiSize + p1) * 4];
                    const a10 = invPhiData[(rt1 * phiSize + p0) * 4];
                    const a11 = invPhiData[(rt1 * phiSize + p1) * 4];
                    const phiN_row0 = (1 - tp) * a00 + tp * a01;
                    const phiN_row1 = (1 - tp) * a10 + tp * a11;
                    const phi = ((1 - fr) * phiN_row0 + fr * phiN_row1) * 2 * Math.PI;
                    const sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);
                    const x = r * sinTheta * Math.cos(phi);
                    const y = r * sinTheta * Math.sin(phi);
                    const z = r * cosTheta;
                    const psi = getWaveFunctionValue(n, l, m, r, theta, phi);
                    const c = psi >= 0 ? colorPositive : colorNegative;
                    const idx = i * 3;
                    posArr[idx] = x;
                    posArr[idx + 1] = y;
                    posArr[idx + 2] = z;
                    colArr[idx] = c.r;
                    colArr[idx + 1] = c.g;
                    colArr[idx + 2] = c.b;
                }
                currentOrbital.geometry.getAttribute('position').needsUpdate = true;
                currentOrbital.geometry.getAttribute('color').needsUpdate = true;
            }
            else {
                // Adaptive: subset update using importance sampling
                const posArr = currentOrbital.geometry.getAttribute('position').array;
                const colArr = currentOrbital.geometry.getAttribute('color').array;
                const updates = Math.max(1, Math.floor(numPoints * sampling.SUBSET_RESAMPLE_FRACTION));
                const { invCdf: radialInvCdf } = LUT.getRadial(n, l);
                const { invThetaData, invPhiData, thetaSize, phiSize } = LUT.getAngular(l, m);
                const radialArray = radialInvCdf._cpuArray;
                const radialSize = radialInvCdf.image.width;
                for (let i = 0; i < updates; i++) {
                    const idx = (Math.random() * numPoints) | 0;
                    const u1 = Math.random(), u2 = Math.random(), u3 = Math.random();
                    // Radial (interp)
                    const xr = u1 * (radialSize - 1);
                    const r0 = Math.floor(xr);
                    const r1 = Math.min(r0 + 1, radialSize - 1);
                    const tr = xr - r0;
                    const rN0 = radialArray[r0 * 4];
                    const rN1 = radialArray[r1 * 4];
                    const r = ((1 - tr) * rN0 + tr * rN1) * maxRadius;
                    // Theta (interp)
                    const xt = u2 * (thetaSize - 1);
                    const t0 = Math.floor(xt);
                    const t1 = Math.min(t0 + 1, thetaSize - 1);
                    const tt = xt - t0;
                    const thN0 = invThetaData[t0 * 4];
                    const thN1 = invThetaData[t1 * 4];
                    const thN = (1 - tt) * thN0 + tt * thN1;
                    const theta = thN * Math.PI;
                    // Phi (bilinear)
                    const xp = u3 * (phiSize - 1);
                    const p0 = Math.floor(xp);
                    const p1 = Math.min(p0 + 1, phiSize - 1);
                    const tp = xp - p0;
                    const rowF = Math.max(0, Math.min(thetaSize - 1, thN * (thetaSize - 1)));
                    const rt0 = Math.floor(rowF);
                    const rt1 = Math.min(rt0 + 1, thetaSize - 1);
                    const fr = rowF - rt0;
                    const a00 = invPhiData[(rt0 * phiSize + p0) * 4];
                    const a01 = invPhiData[(rt0 * phiSize + p1) * 4];
                    const a10 = invPhiData[(rt1 * phiSize + p0) * 4];
                    const a11 = invPhiData[(rt1 * phiSize + p1) * 4];
                    const phiN_row0 = (1 - tp) * a00 + tp * a01;
                    const phiN_row1 = (1 - tp) * a10 + tp * a11;
                    const phi = ((1 - fr) * phiN_row0 + fr * phiN_row1) * 2 * Math.PI;
                    const sinTheta = Math.sin(theta);
                    const x = r * sinTheta * Math.cos(phi);
                    const y = r * sinTheta * Math.sin(phi);
                    const z = r * Math.cos(theta);
                    const psi = getWaveFunctionValue(n, l, m, r, theta, phi);
                    const c = psi >= 0 ? colorPositive : colorNegative;
                    const p = idx * 3;
                    posArr[p] = x;
                    posArr[p + 1] = y;
                    posArr[p + 2] = z;
                    colArr[p] = c.r;
                    colArr[p + 1] = c.g;
                    colArr[p + 2] = c.b;
                }
                currentOrbital.geometry.getAttribute('position').needsUpdate = true;
                currentOrbital.geometry.getAttribute('color').needsUpdate = true;
                adaptiveFrame++;
            }
            return;
        }
        if (renderMode === 'instanced') { /* keep static for now */
            return;
        }
    }
    // UI wiring
    buttons.forEach(btn => btn.addEventListener('click', (e) => {
        buttons.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const map = { '1s': [1, 0, 0], '2s': [2, 0, 0], '3s': [3, 0, 0], '2p_x': [2, 1, 1], '2p_y': [2, 1, -1], '2p_z': [2, 1, 0], '3p_x': [3, 1, 1], '3p_y': [3, 1, -1], '3p_z': [3, 1, 0], '3d_z2': [3, 2, 0], '3d_x2-y2': [3, 2, 2], '3d_xy': [3, 2, -2], '3d_xz': [3, 2, 1], '3d_yz': [3, 2, -1], '4s': [4, 0, 0], '4p_x': [4, 1, 1], '4p_y': [4, 1, -1], '4p_z': [4, 1, 0], '4d_z2': [4, 2, 0], '4d_x2-y2': [4, 2, 2], '4d_xy': [4, 2, -2], '4d_xz': [4, 2, 1], '4d_yz': [4, 2, -1] };
        const o = e.currentTarget.dataset.orbital;
        if (!o)
            return;
        const d = map[o];
        if (d) {
            currentOrbitalData = { n: d[0], l: d[1], m: d[2] };
            regenerate();
        }
    }));
    densitySlider.addEventListener('input', (e) => { densityValueLabel.textContent = parseInt(e.target.value).toLocaleString(); });
    densitySlider.addEventListener('change', () => regenerate());
    pauseButton.addEventListener('click', () => { paused = !paused; pauseButton.textContent = paused ? 'Resume' : 'Pause'; });
    adaptiveButton.addEventListener('click', () => { adaptiveEnabled = !adaptiveEnabled; adaptiveButton.textContent = adaptiveEnabled ? 'Adaptive On' : 'Adaptive Off'; });
    modeButton.addEventListener('click', async () => {
        if (renderMode === 'instanced')
            renderMode = 'points';
        else if (renderMode === 'points')
            renderMode = 'gpu';
        else if (renderMode === 'gpu')
            renderMode = 'webgpu';
        else
            renderMode = 'instanced';
        updateModeButtonText();
        regenerate();
    });
    cullButton.addEventListener('click', () => { occlusionEnabled = !occlusionEnabled; cullButton.textContent = occlusionEnabled ? 'Cull: On' : 'Cull: Off'; regenerate(); });
    clearButton.addEventListener('click', () => clearOrbital());
    screenshotButton.addEventListener('click', () => { const prevColor = renderer.getClearColor(new T.Color()).getHex(); const prevAlpha = renderer.getClearAlpha(); renderer.setClearColor(0x000000, 0); renderer.render(scene, camera); const dataURL = renderer.domElement.toDataURL('image/png'); renderer.setClearColor(prevColor, prevAlpha); const a = document.createElement('a'); a.href = dataURL; a.download = 'orbital_screenshot.png'; document.body.appendChild(a); a.click(); a.remove(); });
    // Resize
    let resizeTimer;
    window.addEventListener('resize', () => { if (resizeTimer !== undefined)
        clearTimeout(resizeTimer); resizeTimer = window.setTimeout(() => { const w = window.innerWidth, h = window.innerHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); }, 120); });
    // Animate
    let prevTime = performance.now();
    let frames = 0;
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        if (!paused)
            resample();
        if (renderMode !== 'webgpu')
            renderer.render(scene, camera);
        const now = performance.now();
        frames++;
        if (now - prevTime >= 1000) {
            fpsCounter.textContent = `FPS: ${frames}`;
            prevTime = now;
            frames = 0;
        }
    }
    // Init UI
    const firstBtn = document.querySelector('[data-orbital="1s"]');
    if (firstBtn)
        firstBtn.classList.add('active');
    updateModeButtonText();
    regenerate();
    animate();
});
