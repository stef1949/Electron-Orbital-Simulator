# Electron Orbital Visualiser

A WebGL-based visualiser for hydrogen-like electron orbitals using Three.js. Supports CPU rejection-sampling, GPU sampling (render-to-texture), instanced spheres and point-cloud rendering with additive blending and optional occlusion culling.

## Features
- Visualise s, p, d, and 4s/4p/4d orbitals (real-valued approximations)
- Three rendering modes:
  - Instanced: many low-poly spheres via InstancedMesh
  - Points: single BufferGeometry point-cloud (fast)
  - GPU: render-to-texture sampling + vertex shader positions (high throughput)
- Adaptive sampling, pause/resume, density control
- Radial LUT caching for faster radial evaluations
- Depth-based occlusion culling toggle
- Debounced resize and material/geometry caching to reduce allocations

## Requirements
- Modern browser with WebGL2 recommended (Chrome/Edge). GPU mode requires support for floating-point render targets (EXT_color_buffer_float or WEBGL_color_buffer_float).
- (Optional) Node.js for running a local static server.

## Quick start (macOS)
1. Clone or open the project folder in your editor.
2. Serve locally (recommended — some browsers block local file fetches):
   - Using Python 3:
     ```
     python3 -m http.server 8000
     ```
   - Or using npm `http-server`:
     ```
     npx http-server -c-1
     ```
3. Open: `http://localhost:8000/main.html`

Or open `main.html` directly in a browser (some GPU features may be restricted by local file security policies).

## UI / Controls
- Right panel: orbital selection buttons (1s, 2s, 2p, 3p, 3d, 4s/4p/4d).
- Bottom panel:
  - Density slider — number of points/samples.
  - Adaptive — toggles incremental adaptive resampling.
  - Mode — cycles between Instanced / Points / GPU.
  - Cull — toggles depth-based occlusion culling.
  - Pause — toggles per-frame resampling.
- FPS counter at top-left.

## Notes & troubleshooting
- If GPU mode doesn't work, a console warning appears and the renderer falls back to Points mode. Check the browser console for shader compile messages and float-target support.
- GPU mode requires WebGL2 + float color buffer extension. On unsupported systems use Points or Instanced modes.
- To change sphere smoothness, edit the sphere geometry segments in `regenerateOrbitalGeometry`:
  ```js
  regenerateOrbitalGeometry._sphereGeo = new THREE.SphereGeometry(0.12, 16, 12);
