<h1 align="center">
  Electron Orbital Visualiser 
</h1>
<p align=center>
<img src="assets/orbital_screenshot.png" alt="Electron Orbital" width="400" align=center />
</p>
A WebGL-based visualiser for hydrogen-like electron orbitals using Three.js. Supports CPU rejection-sampling, GPU sampling (render-to-texture), instanced spheres and point-cloud rendering with additive blending and optional occlusion culling.

## Features
- Visualise s, p, d, and 4s/4p/4d orbitals (real-valued approximations)
- Three rendering modes:
  - Instanced: many low-poly spheres via InstancedMesh
  - Points: single BufferGeometry point-cloud (fast)
  - GPU: render-to-texture sampling + vertex shader positions (high throughput)
- **WebGPU Support**: Next-generation GPU API for maximum performance
- Adaptive sampling, pause/resume, density control
- Radial LUT caching for faster radial evaluations
- Depth-based occlusion culling toggle
- Debounced resize and material/geometry caching to reduce allocations

## Requirements
- Modern browser with WebGL2 recommended (Chrome/Edge). 
- **WebGPU Support**: Chrome 113+, Edge 113+, or Firefox Nightly with WebGPU enabled
- GPU mode requires support for floating-point render targets (EXT_color_buffer_float or WEBGL_color_buffer_float)
- (Optional) Node.js for running a local static server

## WebGPU Implementation
The application now supports WebGPU as the primary rendering backend with automatic fallback:

### Renderer Priority Chain
1. **WebGPU** (Primary) - Maximum performance on supported browsers
2. **WebGL2** (Fallback) - Good performance with GPU acceleration
3. **WebGL1** (Final Fallback) - Basic compatibility mode

### WebGPU Features
- Native compute shaders for orbital sampling
- Optimized memory management
- Better performance on modern GPUs
- Future-proof graphics API
- Automatic fallback to WebGL if WebGPU fails

### Browser Support
- **Chrome 113+**: Full WebGPU support
- **Edge 113+**: Full WebGPU support  
- **Firefox Nightly**: Experimental WebGPU support
- **Safari**: WebGPU coming in future versions

### Enabling WebGPU
For browsers with experimental WebGPU:
```bash
# Chrome with WebGPU enabled
chrome --enable-unsafe-webgpu

# Or use Chrome Canary/Dev builds for latest WebGPU features
```

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
- **WebGPU mode** requires a compatible browser (Chrome 113+, Edge 113+). If unavailable, automatically falls back to WebGL2.
- **GPU mode** requires WebGL2 + float color buffer extension. On unsupported systems use Points or Instanced modes.
- To test WebGPU support, open the browser console and check for "✅ WebGPU renderer initialized successfully"
- Use the included `webgpu-test.html` to verify your browser's WebGPU and WebGL capabilities
- To change sphere smoothness, edit the sphere geometry segments in `regenerateOrbitalGeometry`:
  ```js
  regenerateOrbitalGeometry._sphereGeo = new THREE.SphereGeometry(0.12, 16, 12);
  ```

## WebGPU Testing
A WebGPU support test page is included (`webgpu-test.html`) that checks:
- WebGPU adapter availability
- GPU device creation capability  
- WebGL2 fallback support
- Float texture support for GPU sampling
- Provides recommendations for optimal setup
