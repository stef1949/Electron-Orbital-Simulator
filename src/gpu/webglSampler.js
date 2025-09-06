const T = window.THREE;
import { maxRadius, colors } from '../config.js';
import { estimateMaxAngular2 } from '../math/wave.js';

export function createGPUSampleTarget(renderer, numPoints) {
  const size = Math.ceil(Math.sqrt(numPoints));
  const width = size;
  const height = Math.ceil(numPoints / width);
  const gl = renderer.getContext();
  if (!renderer.capabilities.isWebGL2) return null;
  const floatExt = renderer.extensions.get('EXT_color_buffer_float') || renderer.extensions.get('WEBGL_color_buffer_float');
  if (!floatExt) return null;
  const rt = new T.WebGLRenderTarget(width, height, {
    wrapS: T.ClampToEdgeWrapping,
    wrapT: T.ClampToEdgeWrapping,
    minFilter: T.NearestFilter,
    magFilter: T.NearestFilter,
    type: T.FloatType,
    format: T.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
  });
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  renderer.setRenderTarget(prev);
  if (status !== gl.FRAMEBUFFER_COMPLETE) { rt.dispose(); return null; }
  rt._texWidth = width; rt._texHeight = height;
  return rt;
}

// WebGL fragment shader that importance-samples r,theta,phi from LUTs with row-blended phi
function buildFragShader() {
  return `
uniform float uN, uL, uM;
uniform sampler2D uRadialLUT;
uniform sampler2D uInvRadialCDF;
uniform sampler2D uInvThetaCDF;
uniform sampler2D uInvPhiCDF;
uniform float uLUTSize, uNumPoints;
uniform vec2 uResolution;
uniform float uSeed;
uniform float uMaxRadius;
uniform float uFrame;
uniform float uThetaSize;

float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 sph(float r, float t, float p) { return vec3(r * sin(t) * cos(p), r * sin(t) * sin(p), r * cos(t)); }
float getR(float r) { float t = clamp(r / uMaxRadius, 0.0, 1.0); return texture(uRadialLUT, vec2(t, 0.0)).r; }
float sampleR(float u) { float rN = texture(uInvRadialCDF, vec2(u, 0.0)).r; return rN * uMaxRadius; }
float getAngular(float th, float ph, float l, float m) {
  if (l == 0.0) return 1.0;
  if (l == 1.0) { if (m == 0.0) return cos(th); if (m == 1.0) return sin(th)*cos(ph); return sin(th)*sin(ph); }
  if (l == 2.0) { float ct=cos(th), st=sin(th); if (m==0.0) return 1.5*ct*ct-0.5; if (m==1.0) return -1.732*st*ct*cos(ph); if (m==-1.0) return 1.732*st*ct*sin(ph); if (m==2.0) return 0.866*st*st*cos(2.0*ph); return 0.866*st*st*sin(2.0*ph);} return 0.0; }
void main(){
  float ix = floor(gl_FragCoord.x), iy = floor(gl_FragCoord.y); float idx = ix + iy * uResolution.x; if (idx >= uNumPoints) discard;
  const vec2 R2 = vec2(0.754877666, 0.569840296); vec2 jitter = R2 * (uFrame + uSeed * 101.0); vec2 base = (vec2(ix,iy)+0.5+jitter)/uResolution;
  float u1 = hash21(base+0.11), u2 = hash21(base+0.37), u3 = hash21(base+0.59);
  float r = sampleR(u1);
  float tN = texture(uInvThetaCDF, vec2(u2, 0.5)).r; float th = tN * 3.14159265;
  float rowF = clamp(tN * (uThetaSize - 1.0), 0.0, uThetaSize - 1.0); float r0=floor(rowF); float r1=min(uThetaSize-1.0, r0+1.0); float fr=rowF-r0;
  float v0 = (r0+0.5)/uThetaSize, v1=(r1+0.5)/uThetaSize; float p0=texture(uInvPhiCDF, vec2(u3, v0)).r; float p1=texture(uInvPhiCDF, vec2(u3, v1)).r; float ph = mix(p0,p1,fr)*6.2831853;
  float radial = getR(r); float ang = getAngular(th, ph, uL, uM); float psi = radial * ang; vec3 pos = sph(r, th, ph);
  gl_FragColor = vec4(pos, psi);
}`;
}

export function renderGPUSamples(renderer, caches, params) {
  const { n, l, m, numPoints } = params;
  const { radial, invCdf } = caches.getRadial(n, l);
  const ang = caches.getAngular(l, m);
  const rt = createGPUSampleTarget(renderer, numPoints);
  if (!rt) return null;
  const width = rt._texWidth, height = rt._texHeight;
  const quadGeom = new T.PlaneBufferGeometry(2, 2);
  const quadMat = new T.ShaderMaterial({
    uniforms: {
      uN: { value: n }, uL: { value: l }, uM: { value: m },
      uRadialLUT: { value: radial }, uInvRadialCDF: { value: invCdf },
      uInvThetaCDF: { value: ang.invThetaTex }, uInvPhiCDF: { value: ang.invPhiTex },
      uLUTSize: { value: 1024 }, uNumPoints: { value: numPoints },
      uResolution: { value: new T.Vector2(width, height) }, uSeed: { value: Math.random() },
      uMaxRadius: { value: maxRadius }, uFrame: { value: performance.now() * 0.001 },
      uThetaSize: { value: ang.thetaSize },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
    fragmentShader: buildFragShader(),
  });
  const quad = new T.Mesh(quadGeom, quadMat);
  const scene = new T.Scene(); scene.add(quad);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.clear();
  const cam = new T.OrthographicCamera(-1,1,1,-1,0,1);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev);
  quadMat.dispose(); quadGeom.dispose();
  return rt;
}

export function createGPUPointsMesh(sampleTarget, THREERef, occlusionEnabled) {
  const T3 = T;
  const width = sampleTarget._texWidth, height = sampleTarget._texHeight;
  const geom = new T3.BufferGeometry();
  const count = width * height;
  const positions = new Float32Array(count * 3);
  const indices = new Float32Array(count);
  for (let i = 0; i < count; i++) indices[i] = i;
  geom.setAttribute('position', new T3.BufferAttribute(positions, 3));
  geom.setAttribute('aIndex', new T3.BufferAttribute(indices, 1));
  const mat = new T3.ShaderMaterial({
    uniforms: {
      uSamples: { value: sampleTarget.texture },
      uTexSize: { value: new T3.Vector2(width, height) },
      uPointSize: { value: 0.08 },
      uPixelRatio: { value: (window.devicePixelRatio || 1) },
      uViewportHeight: { value: window.innerHeight },
      uFov: { value: 75 },
      uColorPos: { value: new T3.Vector3(((colors.positive>>16)&255)/255, ((colors.positive>>8)&255)/255, (colors.positive&255)/255) },
      uColorNeg: { value: new T3.Vector3(((colors.negative>>16)&255)/255, ((colors.negative>>8)&255)/255, (colors.negative&255)/255) },
    },
    vertexShader: `
      attribute float aIndex; uniform sampler2D uSamples; uniform vec2 uTexSize; uniform float uPointSize;
      uniform float uPixelRatio; uniform float uViewportHeight; uniform float uFov; uniform vec3 uColorPos; uniform vec3 uColorNeg;
      varying vec3 vColor; varying float vPsi;
      void main(){ float id=aIndex; float w=uTexSize.x; float ix=mod(id,w); float iy=floor(id/w);
        vec2 uv=vec2((ix+0.5)/w,(iy+0.5)/uTexSize.y); vec4 s=texture2D(uSamples, uv); vec3 pos=s.xyz; float psi=s.w; vPsi=psi; vColor = (psi>=0.0)?uColorPos:uColorNeg;
        vec4 mv = modelViewMatrix*vec4(pos,1.0); float scale = uPixelRatio*(0.5*uViewportHeight)/tan(0.5*radians(uFov)); gl_PointSize = uPointSize*(scale/-mv.z); gl_Position = projectionMatrix*mv; }
    `,
    fragmentShader: `precision highp float; varying vec3 vColor; varying float vPsi; void main(){ gl_FragColor=vec4(vColor, 0.7); }`,
    transparent: true,
    depthWrite: !occlusionEnabled,
    depthTest: occlusionEnabled,
    blending: T3.AdditiveBlending,
  });
  return new T3.Points(geom, mat);
}

