import { maxRadius, colors, sampling, modeLabel } from './config.js';
import { getWaveFunctionValue, estimateMaxPsi2 } from './math/wave.js';
import * as LUT from './sampling/lut.js';
import { renderGPUSamples, createGPUPointsMesh } from './gpu/webglSampler.js';
import { makeWebGPU, initWebGPU, ensureWebGPUParticles, renderWebGPUFrame } from './gpu/webgpuPipeline.js';

const T = window.THREE;

function hexToColor(hex) { return new T.Color(hex); }

window.addEventListener('load', async () => {
  // --- Scene ---
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  const canvas = document.getElementById('orbital-canvas');
  const context = canvas.getContext('webgl2');
  const renderer = new T.WebGLRenderer({ canvas, context, alpha:true, preserveDrawingBuffer:true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  camera.position.z = 20;
  const controls = new T.OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.25;

  // Lights
  scene.add(new T.AmbientLight(0xffffff, 0.5));
  const dir = new T.DirectionalLight(0xffffff, 0.5); dir.position.set(0,1,1); scene.add(dir);

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
  let paused = false; let adaptiveEnabled = false; let occlusionEnabled = false; let renderMode = 'gpu';
  let gpuRT = null; let gpuPoints = null; let gpuSupportLogged = false; let adaptiveFrame = 0;
  const colorPositive = hexToColor(colors.positive); const colorNegative = hexToColor(colors.negative);

  // WebGPU
  const webgpu = makeWebGPU();

  function updateModeButtonText() { modeButton.textContent = modeLabel(renderMode, !!navigator.gpu); }
  function clearOrbital() {
    scene.children.slice().forEach(child => { if (child.userData && child.userData.isOrbital) { child.geometry?.dispose?.(); child.material?.dispose?.(); scene.remove(child);} });
    if (gpuPoints) { gpuPoints.geometry?.dispose?.(); gpuPoints.material?.dispose?.(); scene.remove(gpuPoints); gpuPoints=null; }
    if (gpuRT) { gpuRT.dispose?.(); gpuRT=null; }
    currentOrbital = null;
  }

  function regenerate() {
    clearOrbital();
    const { n, l, m } = currentOrbitalData; const numPoints = parseInt(densitySlider.value);
    if (renderMode === 'webgpu') {
      initWebGPU(webgpu, document.getElementById('canvas-container')).then(ok => { if (ok) { ensureWebGPUParticles(webgpu, n, l, m, numPoints); } updateModeButtonText(); });
      return;
    }
    if (renderMode === 'gpu') {
      const supports = renderer.capabilities.isWebGL2 && (renderer.extensions.get('EXT_color_buffer_float') || renderer.extensions.get('WEBGL_color_buffer_float'));
      if (!supports) { renderMode = 'points'; updateModeButtonText(); }
      else if (!gpuSupportLogged) { console.info('GPU sampling enabled (float render targets available)'); gpuSupportLogged = true; }
      const rt = renderGPUSamples(renderer, { getRadial: LUT.getRadial, getAngular: LUT.getAngular }, { n, l, m, numPoints });
      if (!rt) { renderMode = 'points'; updateModeButtonText(); return regenerate(); }
      gpuRT = rt; gpuPoints = createGPUPointsMesh(rt, T, occlusionEnabled); gpuPoints.userData= { isOrbital: true }; scene.add(gpuPoints); currentOrbital = gpuPoints; return;
    }
    if (renderMode === 'points') {
      const geom = new T.BufferGeometry(); const posArr = new Float32Array(numPoints*3); const colArr = new Float32Array(numPoints*3);
      geom.setAttribute('position', new T.BufferAttribute(posArr,3)); geom.setAttribute('color', new T.BufferAttribute(colArr,3));
      const mat = new T.PointsMaterial({ size:0.08, vertexColors:true, transparent:true, opacity:0.7, blending:T.AdditiveBlending, depthWrite:!occlusionEnabled, depthTest:occlusionEnabled });
      const points = new T.Points(geom, mat); points.userData={ isOrbital:true }; scene.add(points); currentOrbital = points;
      // Fill
      const maxPsi2 = estimateMaxPsi2(n,l,m, Math.min(1500, Math.max(200,numPoints)));
      let written=0, attempts=0, MAX_ATTEMPTS=numPoints*20;
      while (written<numPoints && attempts<MAX_ATTEMPTS){ attempts++; const r=Math.random()*maxRadius; const theta=Math.acos(2*Math.random()-1); const phi=Math.random()*Math.PI*2; const st=Math.sin(theta); const x=r*st*Math.cos(phi); const y=r*st*Math.sin(phi); const z=r*Math.cos(theta); const psi=getWaveFunctionValue(n,l,m,r,theta,phi); if (Math.random() <= (psi*psi)/maxPsi2){ const i=written*3; posArr[i]=x; posArr[i+1]=y; posArr[i+2]=z; const c= psi>=0?colorPositive:colorNegative; colArr[i]=c.r; colArr[i+1]=c.g; colArr[i+2]=c.b; written++; } }
      geom.getAttribute('position').needsUpdate=true; geom.getAttribute('color').needsUpdate=true; return;
    }
    if (renderMode === 'instanced') {
      const sphereGeo = new T.SphereGeometry(0.12, 6, 6);
      const matPos = new T.MeshBasicMaterial({ color: colorPositive, transparent:true, opacity:0.5, blending:T.AdditiveBlending, depthWrite:!occlusionEnabled, depthTest:occlusionEnabled });
      const matNeg = new T.MeshBasicMaterial({ color: colorNegative, transparent:true, opacity:0.5, blending:T.AdditiveBlending, depthWrite:!occlusionEnabled, depthTest:occlusionEnabled });
      const transformsPos=[]; const transformsNeg=[]; const maxPsi2=estimateMaxPsi2(n,l,m,1500); let attempts=0; const MAX_ATTEMPTS=numPoints*10;
      while ((transformsPos.length+transformsNeg.length)<numPoints && attempts<MAX_ATTEMPTS){ attempts++; const r=Math.random()*maxRadius; const theta=Math.acos(2*Math.random()-1); const phi=Math.random()*Math.PI*2; const st=Math.sin(theta); const x=r*st*Math.cos(phi); const y=r*st*Math.sin(phi); const z=r*Math.cos(theta); const psi=getWaveFunctionValue(n,l,m,r,theta,phi); const psi2=psi*psi; if (Math.random()<=psi2/maxPsi2){ const t={x,y,z, scale: 0.55+0.45*Math.min(1, Math.sqrt(psi2/maxPsi2))}; if (psi>=0) transformsPos.push(t); else transformsNeg.push(t); } }
      const posMesh = new T.InstancedMesh(sphereGeo, matPos, Math.max(1, transformsPos.length));
      const negMesh = new T.InstancedMesh(sphereGeo, matNeg, Math.max(1, transformsNeg.length));
      const dummy = new T.Object3D(); transformsPos.forEach((t,i)=>{ dummy.position.set(t.x,t.y,t.z); dummy.scale.setScalar(t.scale); dummy.updateMatrix(); posMesh.setMatrixAt(i, dummy.matrix); });
      transformsNeg.forEach((t,i)=>{ dummy.position.set(t.x,t.y,t.z); dummy.scale.setScalar(t.scale); dummy.updateMatrix(); negMesh.setMatrixAt(i, dummy.matrix); });
      posMesh.userData={isOrbital:true}; negMesh.userData={isOrbital:true}; const group=new T.Group(); group.add(posMesh); group.add(negMesh); group.userData={isOrbital:true}; scene.add(group); currentOrbital=group;
      return;
    }
  }

  function resample() {
    if (renderMode === 'webgpu') { renderWebGPUFrame(webgpu, camera, adaptiveFrame++); return; }
    if (renderMode === 'gpu') {
      const { n,l,m } = currentOrbitalData; const numPoints = parseInt(densitySlider.value);
      const rt = renderGPUSamples(renderer, { getRadial: LUT.getRadial, getAngular: LUT.getAngular }, { n,l,m,numPoints }); if (!rt) { renderMode='points'; updateModeButtonText(); regenerate(); return; }
      gpuRT?.dispose?.(); gpuRT = rt; if (gpuPoints) { gpuPoints.material.uniforms.uSamples.value = rt.texture; } else { gpuPoints = createGPUPointsMesh(rt, T, occlusionEnabled); gpuPoints.userData={isOrbital:true}; scene.add(gpuPoints); }
      return;
    }
    if (renderMode === 'points') {
      if (!currentOrbital || currentOrbital.type !== 'Points') return; const { n,l,m } = currentOrbitalData; const numPoints = currentOrbital.geometry.getAttribute('position').array.length/3;
      if (!adaptiveEnabled) {
        const posArr = currentOrbital.geometry.getAttribute('position').array; const colArr = currentOrbital.geometry.getAttribute('color').array; const maxPsi2 = estimateMaxPsi2(n,l,m, Math.min(1500, Math.max(200,numPoints)));
        let written=0, attempts=0, MAX_ATTEMPTS=numPoints*20; while (written<numPoints && attempts<MAX_ATTEMPTS){ attempts++; const r=Math.random()*maxRadius; const theta=Math.acos(2*Math.random()-1); const phi=Math.random()*Math.PI*2; const st=Math.sin(theta); const x=r*st*Math.cos(phi); const y=r*st*Math.sin(phi); const z=r*Math.cos(theta); const psi=getWaveFunctionValue(n,l,m,r,theta,phi); const psi2=psi*psi; if (Math.random()<=psi2/maxPsi2){ const i=written*3; posArr[i]=x; posArr[i+1]=y; posArr[i+2]=z; const c= psi>=0?colorPositive:colorNegative; colArr[i]=c.r; colArr[i+1]=c.g; colArr[i+2]=c.b; written++; } }
        currentOrbital.geometry.getAttribute('position').needsUpdate=true; currentOrbital.geometry.getAttribute('color').needsUpdate=true;
      } else {
        // Adaptive: subset update
        const posArr = currentOrbital.geometry.getAttribute('position').array; const colArr = currentOrbital.geometry.getAttribute('color').array; const updates=Math.max(1, Math.floor(numPoints*sampling.SUBSET_RESAMPLE_FRACTION));
        const maxPsi2 = estimateMaxPsi2(n,l,m,600);
        for (let i=0;i<updates;i++){ const idx=(Math.random()*numPoints)|0; for (let a=0;a<40;a++){ const r=Math.random()*maxRadius; const theta=Math.acos(2*Math.random()-1); const phi=Math.random()*Math.PI*2; const st=Math.sin(theta); const x=r*st*Math.cos(phi); const y=r*st*Math.sin(phi); const z=r*Math.cos(theta); const psi=getWaveFunctionValue(n,l,m,r,theta,phi); if (Math.random()<= (psi*psi)/maxPsi2){ const p=idx*3; posArr[p]=x; posArr[p+1]=y; posArr[p+2]=z; const c= psi>=0?colorPositive:colorNegative; colArr[p]=c.r; colArr[p+1]=c.g; colArr[p+2]=c.b; break; } } }
        currentOrbital.geometry.getAttribute('position').needsUpdate=true; currentOrbital.geometry.getAttribute('color').needsUpdate=true; adaptiveFrame++;
      }
      return;
    }
    if (renderMode === 'instanced') { /* keep static for now */ return; }
  }

  // UI wiring
  buttons.forEach(btn => btn.addEventListener('click', (e) => {
    buttons.forEach(b => b.classList.remove('active')); e.target.classList.add('active');
    const o = e.target.dataset.orbital; const map = { '1s':[1,0,0],'2s':[2,0,0],'3s':[3,0,0], '2p_x':[2,1,1], '2p_y':[2,1,-1], '2p_z':[2,1,0], '3p_x':[3,1,1], '3p_y':[3,1,-1], '3p_z':[3,1,0], '3d_z2':[3,2,0], '3d_x2-y2':[3,2,2], '3d_xy':[3,2,-2], '3d_xz':[3,2,1], '3d_yz':[3,2,-1], '4s':[4,0,0], '4p_x':[4,1,1], '4p_y':[4,1,-1], '4p_z':[4,1,0], '4d_z2':[4,2,0], '4d_x2-y2':[4,2,2], '4d_xy':[4,2,-2], '4d_xz':[4,2,1], '4d_yz':[4,2,-1] };
    const d = map[o]; if (d) { currentOrbitalData = { n:d[0], l:d[1], m:d[2] }; regenerate(); }
  }));
  densitySlider.addEventListener('input', (e)=>{ densityValueLabel.textContent = parseInt(e.target.value).toLocaleString(); });
  densitySlider.addEventListener('change', ()=> regenerate());
  pauseButton.addEventListener('click', ()=>{ paused=!paused; pauseButton.textContent = paused? 'Resume':'Pause'; });
  adaptiveButton.addEventListener('click', ()=>{ adaptiveEnabled=!adaptiveEnabled; adaptiveButton.textContent = adaptiveEnabled? 'Adaptive On':'Adaptive Off'; });
  modeButton.addEventListener('click', async()=>{
    if (renderMode==='instanced') renderMode='points'; else if (renderMode==='points') renderMode='gpu'; else if (renderMode==='gpu') renderMode='webgpu'; else renderMode='instanced'; updateModeButtonText(); regenerate();
  });
  cullButton.addEventListener('click', ()=>{ occlusionEnabled=!occlusionEnabled; cullButton.textContent = occlusionEnabled? 'Cull: On':'Cull: Off'; regenerate(); });
  clearButton.addEventListener('click', ()=> clearOrbital());
  screenshotButton.addEventListener('click', ()=>{ const prevColor = renderer.getClearColor(new T.Color()).getHex(); const prevAlpha = renderer.getClearAlpha(); renderer.setClearColor(0x000000,0); renderer.render(scene,camera); const dataURL=renderer.domElement.toDataURL('image/png'); renderer.setClearColor(prevColor, prevAlpha); const a=document.createElement('a'); a.href=dataURL; a.download='orbital_screenshot.png'; document.body.appendChild(a); a.click(); a.remove(); });

  // Resize
  let resizeTimer=null; window.addEventListener('resize', ()=>{ clearTimeout(resizeTimer); resizeTimer=setTimeout(()=>{ const w=window.innerWidth, h=window.innerHeight; camera.aspect=w/h; camera.updateProjectionMatrix(); renderer.setSize(w,h); }, 120); });

  // Animate
  let prevTime = performance.now(); let frames=0;
  function animate(){ requestAnimationFrame(animate); if (!paused) resample(); controls.update(); if (renderMode!=='webgpu') renderer.render(scene, camera); const now=performance.now(); frames++; if (now - prevTime >= 1000){ fpsCounter.textContent = `FPS: ${frames}`; prevTime=now; frames=0; } }

  // Init UI
  document.querySelector('[data-orbital="1s"]').classList.add('active');
  updateModeButtonText();
  regenerate(); animate();
});

