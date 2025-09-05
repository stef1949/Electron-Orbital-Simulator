# Electron Orbital Simulator

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

The Electron Orbital Simulator is a single-file WebGL-based visualizer for hydrogen-like electron orbitals using Three.js. It supports CPU rejection-sampling, GPU sampling (render-to-texture), instanced spheres and point-cloud rendering with additive blending and optional occlusion culling.

## Working Effectively

### Bootstrap and Run the Application
- **CRITICAL**: The only file needed is `index.html`. There is NO build process, NO dependencies to install, NO compilation required.
- **README ERROR**: The README.md incorrectly references `main.html` - the actual file is `index.html`.
- Serve the application locally using one of these methods:
  - Python 3 (fastest startup ~0.03s): `python3 -m http.server 8000`
  - npm http-server (first run ~5s): `npx http-server -c-1`
- Open: `http://localhost:8000/index.html` (NOT main.html)
- **Direct file opening**: Opening `index.html` directly in browser works but some GPU features may be restricted by local file security policies.

### Dependencies and Requirements
- **CDN Dependencies**: Application loads these external resources:
  - Tailwind CSS: `https://cdn.tailwindcss.com`
  - Three.js: `https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js`
  - OrbitControls: `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js`
- **Browser Requirements**: Modern browser with WebGL2 recommended (Chrome/Edge). GPU mode requires floating-point render targets (EXT_color_buffer_float or WEBGL_color_buffer_float).
- **No Node.js required**: Node.js is optional and only needed for running `npx http-server`.

### Build and Test Process
- **NO BUILD REQUIRED**: This is a static HTML application with no build step.
- **NO TESTS EXIST**: There are no unit tests, integration tests, or testing framework.
- **NO LINTING CONFIGURED**: No ESLint, Prettier, or other linting tools are configured.
- **NO CI/CD**: No GitHub Actions workflows or other automation exists.

## Validation

### Manual Testing Requirements
After making any changes to `index.html`, ALWAYS validate by:
1. Start a local server: `python3 -m http.server 8000`
2. Open: `http://localhost:8000/index.html`
3. **CRITICAL VALIDATION SCENARIOS**:
   - Verify UI loads with all orbital buttons visible (1s, 2s, 3s, 2p series, 3d series, 4s/4p/4d series)
   - Test density slider functionality (range 10,000-150,000 points, default 50,000)
   - Click each render mode: "Mode: Instanced" → "Mode: Points" → "Mode: GPU"
   - Test orbital visualization by clicking any orbital button (should see 3D particle visualization)
   - Test controls: Adaptive toggle, Impostor toggle, Cull toggle, Pause, Clear, Save PNG
   - Check FPS counter shows in top-left
   - Verify browser console shows expected Three.js loading (or fallback warnings)

### Expected Functionality
- **Working in normal environment**: Full 3D orbital visualization with particle systems
- **Fallback behavior**: If CDN resources fail to load, UI renders but 3D functionality is disabled
- **Performance**: Application should maintain 30+ FPS during orbital rendering
- **GPU fallback**: If GPU mode unsupported, console warning appears and falls back to Points mode

### Known Issues to Document
- **README discrepancy**: README.md references `main.html` but file is `index.html`
- **CDN dependency**: Application fails if external CDN resources are blocked
- **Console errors expected**: In restricted environments, CDN blocking causes "THREE is not defined" errors
- **Partial functionality without CDN**: UI controls work but 3D rendering requires Three.js from CDN

### Validated Working Features (Even Without CDN)
- All UI buttons and controls function correctly
- Mode cycling between "Instanced", "Points", and "GPU"
- Adaptive, Impostor, Cull, Pause toggles work
- Density slider operates in full range (10,000-150,000)
- FPS counter displays (shows 0 without 3D rendering)
- Button states update correctly (visual feedback)

## File Structure and Navigation

### Repository Root
```
.
├── LICENSE                    # MIT license
├── README.md                  # Project documentation (contains errors)
├── SECURITY.md               # Vulnerability reporting info
├── assets/
│   └── orbital_screenshot.png # Application screenshot
├── index.html                # MAIN APPLICATION FILE (single file contains everything)
└── .github/
    └── copilot-instructions.md # This file
```

### Key Code Sections in index.html
- **Lines 1-100**: HTML structure, CSS styling, CDN script imports
- **Lines 101-300**: Three.js scene setup, camera, renderer configuration
- **Lines 301-600**: Wave function mathematics (radial/angular calculations)
- **Lines 601-900**: Orbital generation algorithms (rejection sampling, GPU sampling)
- **Lines 901-1200**: Rendering modes (instanced, points, GPU)
- **Lines 1201-1434**: Event handlers, UI controls, animation loop

### Important Functions to Know
- `regenerateOrbitalGeometry()`: Main function that creates orbital visualizations
- `getWaveFunctionValue()`: Calculates quantum mechanical wave function values
- `estimateMaxPsi2()`: Rejection sampling normalization
- `createGPUPointsMesh()`: GPU-accelerated rendering mode
- `takeScreenshot()`: PNG export functionality

## Common Tasks

### Making Code Changes
- **Single file editing**: All code is in `index.html` - HTML, CSS, and JavaScript
- **No compilation**: Changes are immediately effective on page refresh
- **Live testing**: Use browser dev tools for real-time debugging
- **Performance monitoring**: Check FPS counter and browser performance tab

### Debugging
- **Browser console**: Check for JavaScript errors and Three.js warnings
- **WebGL errors**: Look for shader compilation errors in GPU mode
- **Performance issues**: Monitor rejection sampling efficiency and render times
- **Fallback scenarios**: Test behavior when CDN resources unavailable

### Testing Changes
- **Always test in modern browser**: Chrome/Edge recommended for full WebGL2 support
- **Test all render modes**: Instanced, Points, and GPU modes have different code paths
- **Verify orbital types**: Test s, p, and d orbitals as they use different mathematical functions
- **Check responsive behavior**: Test window resizing and different screen sizes

## Environment Limitations

### CDN Blocking Scenarios
- **Sandboxed environments**: May block external CDN resources
- **Corporate firewalls**: May restrict access to jsdelivr.net and tailwindcss.com
- **Offline development**: No internet connection prevents CDN loading
- **Security policies**: Some environments block all external scripts

### Fallback Behavior
- **UI still functional**: All controls, buttons, and layout work without CDN
- **JavaScript logic intact**: Event handlers and state management function
- **3D rendering disabled**: Three.js dependent features unavailable
- **Console warnings**: Expected "THREE is not defined" errors

## NEVER DO
- **Do not add build tools**: This is intentionally a single-file application
- **Do not add package.json**: No Node.js dependencies should be added
- **Do not modify CDN URLs**: Three.js version is pinned to r128 for compatibility
- **Do not add test frameworks**: Keep the application simple and dependency-free
- **Do not create multiple files**: All code should remain in single index.html file

## Time Expectations
- **Server startup**: Python server starts in <1 second, npm http-server ~5 seconds first run
- **Page load**: <2 seconds in normal conditions with CDN access
- **Orbital generation**: 1-5 seconds depending on density and complexity
- **Mode switching**: Immediate (<1 second) for UI, 1-3 seconds for orbital regeneration