# Electron Orbital Visualiser

A modern WebGL-based visualiser for hydrogen-like electron orbitals using Three.js. Built with TypeScript and Vite for optimal performance and developer experience.

## ✨ Features

- **Interactive 3D Visualization**: Visualise s, p, d, and 4s/4p/4d orbitals (real-valued approximations)
- **Multiple Rendering Modes**:
  - **Instanced**: Many low-poly spheres via InstancedMesh (high quality)
  - **Points**: Single BufferGeometry point-cloud (fast performance)
  - **GPU**: Render-to-texture sampling + vertex shader positions (high throughput)
- **Advanced Controls**:
  - Adaptive sampling with pause/resume
  - Real-time density control (1K-250K points)
  - Radial LUT caching for faster evaluations
  - Depth-based occlusion culling toggle
  - Impostor rendering (billboard quads vs spheres)
- **Modern Architecture**:
  - TypeScript for type safety
  - ES modules for better maintainability
  - Comprehensive unit tests
  - Vite for fast development and optimized builds

## 🚀 Quick Start

### Development

```bash
# Clone the repository
git clone https://github.com/stef1949/Electron-Orbital-Simulator.git
cd Electron-Orbital-Simulator

# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Live Demo

Visit the live demo: [https://stef1949.github.io/Electron-Orbital-Simulator/](https://stef1949.github.io/Electron-Orbital-Simulator/)

## 🎮 Controls

- **Camera**: Click and drag to rotate, scroll wheel to zoom
- **Right Panel**: Orbital selection buttons (1s, 2s, 2p, 3p, 3d, 4s/4p/4d)
- **Bottom Panel**:
  - **Density Slider**: Number of points/samples (1K-250K)
  - **Adaptive**: Toggles incremental adaptive resampling
  - **Mode**: Cycles between Instanced / Points / GPU rendering
  - **Impostor**: Toggles billboard quads vs 3D spheres (Instanced mode only)
  - **Cull**: Toggles depth-based occlusion culling
  - **Pause**: Toggles per-frame resampling
  - **Clear**: Removes current orbital
- **FPS Counter**: Performance monitoring (top-left)

## 🛠️ Technical Details

### Requirements

- **Browser**: Modern browser with WebGL2 support (Chrome/Edge/Firefox recommended)
- **GPU Mode**: Requires floating-point render targets (EXT_color_buffer_float or WEBGL_color_buffer_float)
- **Development**: Node.js 18+ for building from source

### Architecture

```
src/
├── main.ts              # Application entry point
├── app.ts               # Main application class
├── types.ts             # TypeScript type definitions
├── constants.ts         # Application constants
├── renderer/
│   └── scene.ts         # Three.js scene setup
├── orbitals/
│   ├── math.ts          # Orbital mathematics & wave functions
│   └── data.ts          # Orbital configurations
├── ui/
│   └── controls.ts      # UI event handling
└── utils/
    └── cache.ts         # LRU caching utilities

tests/                   # Comprehensive unit tests
├── orbitals/
│   └── math.test.ts     # Mathematical function tests
└── utils/
    └── cache.test.ts    # Cache utility tests
```

### Mathematical Foundation

The visualizer uses simplified, real-valued hydrogen-like wave functions:

- **Radial Component**: Associated Laguerre polynomials with exponential decay
- **Angular Component**: Real-valued spherical harmonics
- **Sampling**: Monte Carlo rejection sampling with adaptive optimization
- **Optimization**: Radial lookup tables (LUT) for performance

## 🧪 Testing

Run the comprehensive test suite:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in UI mode
npm run test:ui
```

Tests cover:
- ✅ Orbital wave function calculations
- ✅ Quantum number validation
- ✅ Cache operations and LRU behavior
- ✅ Mathematical accuracy and edge cases

## 🚀 Deployment

The project automatically deploys to GitHub Pages via GitHub Actions on every push to main branch.

### Manual Deployment

```bash
npm run build
# Upload the dist/ folder to your hosting provider
```

## 🔧 Development

### Project Structure

- **Modern TypeScript**: Full type safety with strict configuration
- **ES Modules**: Clean imports and tree-shaking support  
- **Vite**: Lightning-fast development with HMR
- **Testing**: Vitest with jsdom for DOM testing
- **CI/CD**: Automated testing and deployment

### Performance Notes

- **GPU Mode**: Highest throughput but requires WebGL2 extensions
- **Instanced Mode**: Best quality/performance balance
- **Points Mode**: Fastest rendering, good for high particle counts
- **Adaptive Sampling**: Reduces computational overhead while maintaining quality

## 📝 Notes & Troubleshooting

- **GPU Mode Issues**: Check browser console for WebGL extension support. Falls back to Points mode automatically.
- **Performance**: Use Points mode for very high particle counts (>100K)
- **Quality**: Use Instanced mode with Impostor disabled for best visual quality
- **Sphere Smoothness**: Adjust geometry segments in `src/renderer/geometry.ts`

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions welcome! Please ensure tests pass and follow the existing code style.

```bash
npm test        # Verify tests pass
npm run build   # Verify build succeeds
```
