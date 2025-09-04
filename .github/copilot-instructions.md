# Electron Orbital Simulator

**ALWAYS follow these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

A WebGL-based visualizer for hydrogen-like electron orbitals using Three.js. This is a static HTML application with embedded JavaScript - no build process required.

## Working Effectively

### Quick Start (VALIDATED COMMANDS)
- Serve the application locally:
  - **Python 3**: `cd /path/to/repo && python3 -m http.server 8000` -- starts in < 1 second. NEVER CANCEL.
  - **npx**: `cd /path/to/repo && npx http-server -c-1 -p 8001` -- starts in ~15 seconds (downloads package first time). NEVER CANCEL. May fail in restricted network environments.
- Open application: 
  - `http://localhost:8000/index.html` (NOT main.html - this is a documentation error)
  - `http://localhost:8000/` (auto-serves index.html)
- Application loads in ~0.001-0.003 seconds once server is running

### Critical Information
- **NO BUILD PROCESS EXISTS** - this is a single HTML file with embedded JavaScript
- **NO TESTS EXIST** - there is no testing framework
- **NO LINTING EXISTS** - there are no code quality tools configured
- Application depends on CDN resources (Three.js, TailwindCSS) which may fail in restricted environments
- File size: ~74KB for main index.html

## Repository Structure
```
.
├── index.html          # Main application file (WebGL orbital visualizer)
├── README.md           # Documentation (contains outdated reference to main.html)
├── LICENSE             # MIT License
├── SECURITY.md         # Security policy
└── assets/
    └── orbital_screenshot.png  # Application screenshot
```

## Development Workflow

### Running the Application
1. **ALWAYS serve via HTTP server** - direct file access fails due to CORS policies
2. **Recommended**: `python3 -m http.server 8000` (fastest startup)
3. **Alternative**: `npx http-server -c-1` (slower first run, disables caching)
4. Open `http://localhost:PORTNUMBER/index.html` in modern browser

### Making Code Changes
- Edit `index.html` directly - all JavaScript is embedded
- **NO compilation step required**
- Refresh browser to see changes immediately
- Application supports live editing workflow

### Validation Scenarios
After making changes, ALWAYS test these user scenarios:

#### Basic Functionality Test (ALWAYS PERFORM)
1. Start local server: `python3 -m http.server 8000`
2. Navigate to `http://localhost:8000/index.html` OR `http://localhost:8000/`
3. Verify UI loads with orbital selection buttons visible (right panel)
4. Click orbital buttons (1s, 2s, 2p, etc.) - should become [active] state
5. Test controls: density slider (adjust value), mode toggles, adaptive/pause buttons
6. Verify bottom panel shows: "Density: [NUMBER] points", toggle buttons, etc.
7. Check browser console for JavaScript errors (expect CDN errors in restricted environments)

#### Complete Orbital Visualization Test (requires unrestricted internet)
1. Follow basic functionality test
2. Select "1s" orbital - should render blue/red point cloud in 3D space
3. Try different render modes: "Mode: Instanced" → "Mode: Points" → "Mode: GPU"
4. Adjust density slider - should change number of rendered points in real-time
5. Test "Adaptive" toggle and "Pause" functionality
6. Verify FPS counter updates in top-left corner (should show > 0 FPS)
7. Test 3D navigation: click-drag to rotate view, scroll to zoom

## Key Application Features
- **Orbital Selection**: Right panel with buttons for s, p, d orbitals
- **Render Modes**: 
  - Instanced: Low-poly spheres via InstancedMesh
  - Points: Single BufferGeometry point-cloud (fastest)
  - GPU: Render-to-texture sampling (highest throughput)
- **Controls**: Density slider, adaptive sampling, pause/resume, occlusion culling
- **3D Navigation**: Click-drag to rotate, scroll to zoom (via OrbitControls)

## Dependencies
- **Three.js r128**: WebGL 3D library (loaded from jsdelivr CDN)
- **TailwindCSS**: Styling framework (loaded from CDN)
- **OrbitControls**: Camera controls (loaded from jsdelivr CDN)

**IMPORTANT**: In restricted network environments, CDN resources may fail to load, causing JavaScript errors. The UI will still be visible and interactive, but 3D rendering will not function.

## Troubleshooting

### Common Issues
- **"THREE is not defined" error**: CDN resources blocked/failed to load
- **GPU mode fallback**: Browser lacks WebGL2 or float render target support
- **Local file restrictions**: Must serve via HTTP server, cannot open file:// directly
- **CORS errors**: Ensure serving from HTTP server, not accessing as local file

### Documentation Errors Found
- README.md incorrectly references `main.html` - the actual file is `index.html`
- No build scripts exist despite any documentation suggesting otherwise

### Validation Results  
**All commands tested and validated working:**
- Python server: ✅ Starts in < 1 second, serves files correctly
- Directory access: ✅ Both `/index.html` and `/` work (auto-serves index.html)
- UI interactions: ✅ All buttons, sliders, and controls are functional
- Performance: ✅ Page loads in ~0.001-0.003 seconds consistently
- npx server: ⚠️ Works but may fail in restricted network environments (downloads packages)

## File Locations
- **Main application**: `index.html` (contains all HTML, CSS, and JavaScript)
- **Documentation**: `README.md`, `SECURITY.md`
- **Assets**: `assets/orbital_screenshot.png`

## Performance Expectations
- **Server startup**: < 1 second (Python), ~15 seconds first run (npx)
- **Page load**: ~0.003 seconds
- **File size**: ~74KB total
- **NEVER CANCEL server startup** - it's nearly instantaneous

## Validation Commands
```bash
# Test Python server startup and connectivity
cd /path/to/repo
python3 -m http.server 8000 &
sleep 1
curl -I http://localhost:8000/index.html
# Expected: HTTP/1.0 200 OK, Content-Length: 73703

# Test performance and file size
curl -w "Time: %{time_total}s Size: %{size_download} bytes" -o /dev/null -s http://localhost:8000/index.html
# Expected: Time: ~0.001-0.003s Size: 73703 bytes

# Test directory access
curl -I http://localhost:8000/
# Expected: HTTP/1.0 200 OK (auto-serves index.html)

# Stop server when done
kill %1
```

## Common Misconceptions to Avoid
- **No npm/node project**: Despite the option to use npx http-server, this is not a Node.js project
- **No build required**: Changes to index.html are immediately visible after browser refresh
- **No test runner**: Manual browser testing is the only validation method
- **Entry point confusion**: Use index.html, not main.html